/**
 * 门模型的开合动画：把 lock-state 折出的 doorOpen 翻译成门网格的姿态变化，并逐帧推进。
 *
 * 门在 3D 场景里按 rig 分成三类可动骨架（由 userData 上的枢轴字段区分）：
 *   - 平开门（hinge）：doorHingePivot / entryDoorPivot，绕 y 轴旋转；
 *   - 推拉门（slide）：doorSlidePivot，沿 x 轴平移；
 *   - 卷帘门（roller）：doorRollerPivot，沿 y 轴收放（位移同时按比例压扁门片）。
 * 关节的「休息位 / 关门位」在第一次遇到时从 mesh 自身记下来，之后即使配置改动也能回到原位。
 *
 * 与渲染器的约定：模型被判定为 static（frame-only，或无 target）时要把先前动过的门复位；
 * 每帧有位移或复位时回调 requestRender / invalidateReflections，避免不必要的重绘。
 * 系统「减少动态效果」偏好开启时，位移一步到位（跳过插值），但最终姿态与正常动画一致。
 */
import { lockState } from "./lock-state.js?v=2609252218";
import { prefersReducedMotionNow } from "../core/motion-preference.js?v=2609252218";

/**
 * 创建门锁动画控制器。
 *
 * 参数从运行时上下文取出（与前几个 motion 模块同形）：
 *   modelRoot             3D 场景根节点，逐帧 traverse 找带门枢轴的网格；
 *   requestRender         需要重绘时的回调；
 *   invalidateReflections 门姿态变化会影响倒影时的失效回调。
 *
 * 返回 { tick(time, doorModels, states), dispose() }：tick 由舞台主循环每帧调用，返回
 * 「本帧是否还有门在动」，主循环据此决定要不要继续推进；dispose 把所有门复位。
 */
export function createLockMotion({ modelRoot, requestRender, invalidateReflections }) {
  // mesh → { kind, rest, target }：每扇可动门的姿态状态；rest 是关节的静止值，target 是目标值。
  const motions = new Map();
  // 上一帧时间戳（毫秒）；null 表示刚开始或已复位，本帧不产生位移（delta = 0）。
  let lastTickTime = null;

  /** 卷帘门专用：纵向位移的同时，把门片按「已卷起比例」压扁；比例下限 0.001 防止零尺寸。 */
  function applyRollerTranslation(mesh, value) {
    mesh.position.y = value;
    const openTranslation = Number(
      mesh.userData?.doorRollerOpenTranslation ??
        mesh.parent?.userData?.doorRollerOpenTranslation
    );
    if (mesh.scale && openTranslation > 0) {
      mesh.scale.y = Math.max(0.001, 1 - value / openTranslation);
    }
  }

  /** 把所有动过的门放回休息位并清空状态（dispose 与「场景里不再有门」时共用）。 */
  function reset() {
    for (const [mesh, motion] of motions) {
      if (motion.kind === "slide") {
        mesh.position.x = motion.rest;
      } else if (motion.kind === "roller") {
        applyRollerTranslation(mesh, motion.rest);
      } else {
        mesh.rotation.y = motion.rest;
      }
    }
    motions.clear();
    lastTickTime = null;
  }

  /** 用「环境模型 ID + 楼层 ID」把场景网格匹配回配置里的门模型。 */
  function findDoorModel(parent, doorModels) {
    return doorModels.find(
      model =>
        model.modelId === parent?.userData?.environmentModelId &&
        model.floorId === parent?.userData?.environmentFloorId
    );
  }

  /**
   * 算出某扇门本帧的目标姿态。
   *
   * 返回 null 表示「这扇门不参与动画」（static，或门磁状态未知）。doorAnimationType 决定
   * 用哪套 rig：sliding 优先读 mesh 自己的 doorSlideSide（单扇左右开），再退回父级的开 / 关
   * 位移；roller 读卷帘行程；其余一律按平开门处理，有 doorOpenRotation（模型导出时烘焙的角度）
   * 就以它的符号为准，否则退用配置的开角与铰链方向。
   */
  function resolveTarget(doorModel, parent, mesh, states) {
    const animationType = parent.userData?.doorAnimationType || "entry";
    if (animationType === "static") {
      return null;
    }
    const doorOpen = lockState(doorModel, states).doorOpen;
    if (doorOpen === null) {
      return null;
    }
    if (animationType === "sliding") {
      if (Number.isFinite(mesh.userData?.doorSlideSide)) {
        // 单扇推拉门：只有「开向自己这一侧」时才滑出，否则停在 0。
        const direction = doorModel.openDirection === -1 ? -1 : 1;
        return {
          kind: "slide",
          value:
            doorOpen && mesh.userData.doorSlideSide === -direction
              ? direction * mesh.userData.doorSlideTravel
              : 0
        };
      }
      const openTranslation = Number(parent.userData?.doorSlideOpenTranslation);
      const closedTranslation = Number(parent.userData?.doorSlideClosedTranslation ?? 0);
      return Number.isFinite(openTranslation)
        ? {
            kind: "slide",
            value: doorOpen ? openTranslation * (doorModel.openDirection ?? 1) : closedTranslation
          }
        : null;
    }
    if (animationType === "roller") {
      const openTranslation = Number(
        parent.userData?.doorRollerOpenTranslation ??
          mesh.userData?.doorRollerOpenTranslation
      );
      const closedTranslation = Number(parent.userData?.doorRollerClosedTranslation ?? 0);
      return Number.isFinite(openTranslation)
        ? { kind: "roller", value: doorOpen ? openTranslation : closedTranslation }
        : null;
    }
    const doorOpenRotation = Number(
      mesh.userData?.doorOpenRotation ?? parent.userData?.doorOpenRotation
    );
    if (Number.isFinite(doorOpenRotation)) {
      const openAngle = Number(doorModel.openAngle);
      // 有模型烘焙角度时，开角只用来定数值，方向由烘焙角度的符号决定。
      const angleRadians = Number.isFinite(openAngle)
        ? (Math.abs(openAngle) * Math.PI) / 180
        : Math.abs(doorOpenRotation);
      return {
        kind: "hinge",
        value: doorOpen
          ? Math.sign(doorOpenRotation) * angleRadians * (doorModel.openDirection ?? 1)
          : Number(parent.userData?.doorClosedRotation ?? 0)
      };
    }
    // 兜底：没有烘焙角度时用配置开角（默认 80°）与铰链左右侧决定旋转方向。
    const fallbackAngle = ((doorModel.openAngle ?? 80) * Math.PI) / 180;
    const hingeSign = doorModel.hinge === "right" ? 1 : -1;
    return {
      kind: "hinge",
      value: doorOpen
        ? fallbackAngle * (doorModel.openDirection ?? 1) * hingeSign
        : Number(parent.userData?.doorClosedRotation ?? 0)
    };
  }

  return {
    /**
     * 推进一帧。
     * @param {number} time 当前时间（毫秒），与 requestAnimationFrame 的时钟一致
     * @param {Array} doorModels 本场景的门模型清单
     * @param {Object|Map} states 实体实时状态
     * @returns {boolean} 本帧是否还有门在动
     */
    tick(time, doorModels, states) {
      // 场景里没有门（或门被全部删除）：把动过的门复位一次，之后不必再算。
      if (!doorModels?.length) {
        const hadMotion = motions.size > 0;
        reset();
        if (hadMotion) {
          invalidateReflections?.();
          requestRender?.();
        }
        return false;
      }
      // 帧间隔夹在 0–0.1 秒：切后台再回来时，避免用几秒的 delta 一步跳过整段动画。
      const deltaSeconds =
        lastTickTime === null
          ? 0
          : Math.min(0.1, Math.max(0, (time - lastTickTime) / 1000));
      lastTickTime = time;
      // 本帧见到的门；用于识别「上一帧还在、这一帧消失了」的门需要复位。
      const seen = new Set();
      let hasMotion = false;
      let needsRedraw = false;
      modelRoot?.traverse(mesh => {
        const hingePivot = mesh.userData?.doorHingePivot || mesh.userData?.entryDoorPivot;
        const slidePivot = mesh.userData?.doorSlidePivot;
        const rollerPivot = mesh.userData?.doorRollerPivot;
        if (!hingePivot && !slidePivot && !rollerPivot) {
          return;
        }
        const parent = mesh.parent;
        const doorModel = findDoorModel(parent, doorModels);
        if (!parent || !doorModel) {
          return;
        }
        seen.add(mesh);
        const target = resolveTarget(doorModel, parent, mesh, states);
        const kind = slidePivot ? "slide" : rollerPivot ? "roller" : "hinge";
        let motion = motions.get(mesh);
        // 首次见到（或门型变了）时登记休息位与当前目标；有目标就直接摆到目标姿态，
        // 避免刷新页面后门先以静止位渲染一帧再跳。
        if (
          (!motion || motion.kind !== kind) &&
          ((motion = {
            kind,
            rest:
              kind === "slide"
                ? Number(mesh.userData?.doorRestTranslation ?? mesh.position.x) || 0
                : kind === "roller"
                  ? Number(mesh.userData?.doorRestTranslation ?? mesh.position.y) || 0
                  : Number(mesh.userData?.doorRestRotation ?? mesh.rotation.y) || 0,
            target:
              target?.value ??
              (kind === "slide"
                ? mesh.position.x
                : kind === "roller"
                  ? mesh.position.y
                  : mesh.rotation.y)
          }),
          motions.set(mesh, motion),
          target &&
            (kind === "slide"
              ? (mesh.position.x = target.value)
              : kind === "roller"
                ? applyRollerTranslation(mesh, target.value)
                : (mesh.rotation.y = target.value)))
        ) {
          // 空块：上面的条件与副作用整体构成一次「初始化」动作。
        }
        // 平开门的门扇枢轴要横向偏移半个门宽，使旋转围绕门边而不是门中心；
        // doorFixedHinge 标记的门已经烘焙好枢轴，跳过。
        if (hingePivot && !mesh.userData?.doorFixedHinge) {
          const leafWidth = Number(
            parent.userData?.doorLeafWidth ?? parent.userData?.entryDoorLeafWidth ?? 0.8
          );
          mesh.position.x = (doorModel.hinge === "right" ? 1 : -1) * Math.abs(leafWidth) / 2;
        }
        if (target) {
          motion.target = target.value;
        }
        const current =
          kind === "slide"
            ? mesh.position.x
            : kind === "roller"
              ? mesh.position.y
              : mesh.rotation.y;
        const difference = motion.target - current;
        const duration = Math.max(0.2, Number(doorModel.duration) || 0.7);
        // 该门型的完整行程，下限 0.01 防止静止门抖动。
        const fullTravel = Math.max(
          kind === "slide"
            ? Math.abs(Number(parent.userData?.doorSlideOpenTranslation) || 0)
            : kind === "roller"
              ? Math.abs(
                  Number(
                    parent.userData?.doorRollerOpenTranslation ??
                      mesh.userData?.doorRollerOpenTranslation
                  ) || 0
                )
              : (Math.abs(Number(doorModel.openAngle) || 80) * Math.PI) / 180,
          0.01
        );
        // 正常：每帧最大位移 = 完整行程 ÷ 时长 × 帧间隔；减少动态效果：整段剩余行程一步走完。
        const maxStep = prefersReducedMotionNow()
          ? Math.abs(difference)
          : fullTravel * (deltaSeconds / duration);
        if (Math.abs(difference) > 0.0001) {
          const next = current + Math.sign(difference) * Math.min(Math.abs(difference), maxStep);
          if (kind === "slide") {
            mesh.position.x = next;
          } else if (kind === "roller") {
            applyRollerTranslation(mesh, next);
          } else {
            mesh.rotation.y = next;
          }
          hasMotion = true;
          needsRedraw = true;
        }
      });
      // 上一帧还动过、这一帧已不在场景里的门：复位后从表里移除。
      for (const [mesh, motion] of motions) {
        if (!seen.has(mesh)) {
          if (motion.kind === "slide") {
            mesh.position.x = motion.rest;
          } else if (motion.kind === "roller") {
            applyRollerTranslation(mesh, motion.rest);
          } else {
            mesh.rotation.y = motion.rest;
          }
          motions.delete(mesh);
          needsRedraw = true;
        }
      }
      if (needsRedraw) {
        invalidateReflections?.();
        requestRender?.();
      }
      return hasMotion;
    },
    dispose: reset
  };
}
