import { lockState } from "./lock-state";

/** 铰链枢轴的最小结构：本文件只碰 `rotation.y` / `position.x` / `scale.x`。 */
interface HingePivotLike {
  rotation: { y: number };
  position?: { x: number };
  scale?: { x: number };
}

/** 铰链原始姿态快照：首次登记门扇时从枢轴自身取，之后一直沿用。 */
interface HingePoseSnapshot {
  hingeX?: number;
  hingeScaleX?: number;
}

/** 门模型里与铰链方向有关的字段（其余配置项本文件不读）。 */
interface DoorHingeConfig {
  hinge?: string;
  openAngle?: number;
  openDirection?: number;
}

export function createLockMotion(options: any) {
  const motionByMesh = new Map(),
    outlineFlaggedMeshSet = new Set<{ userData: Record<string, any> }>(),
    bumpOutlineRevision = (outlineObject: any) => {
      outlineObject?.userData &&
        (outlineObject.userData.environmentOutlineRevision =
          (outlineObject.userData.environmentOutlineRevision || 0) + 1);
    },
    stashedMotionByMesh = new WeakMap();
  let modelRoot = options.modelRoot,
    lastTickTime: any = null,
    meshListRevision: any,
    doorMeshList: any = null;
  const isUnderModelRoot = (node: any) => {
    for (let walkNode = node; walkNode; walkNode = walkNode.parent)
      if (walkNode === modelRoot) return true;
    return false;
  };
  function applyRollerTranslation(rollerMesh: any, translationValue: any) {
    rollerMesh.position.y = translationValue;
    const openTranslation = Number(
      rollerMesh.userData?.doorRollerOpenTranslation ??
        rollerMesh.parent?.userData?.doorRollerOpenTranslation,
    );
    rollerMesh.scale &&
      openTranslation > 0 &&
      (rollerMesh.scale.y = Math.max(0.001, 1 - translationValue / openTranslation));
  }
  /** 关门位：铰链枢轴除了转角，还要把镜像/位置还原成几何侧摆好的原始值。 */
  function restoreHingePose(
    hingeMesh: HingePivotLike,
    hingeMotion: { rest: number } & HingePoseSnapshot,
  ) {
    hingeMesh.rotation.y = hingeMotion.rest;
    const { hingeX, hingeScaleX } = hingeMotion;
    typeof hingeX === "number" &&
      Number.isFinite(hingeX) &&
      hingeMesh.position &&
      (hingeMesh.position.x = hingeX);
    hingeMesh.scale &&
      typeof hingeScaleX === "number" &&
      Number.isFinite(hingeScaleX) &&
      (hingeMesh.scale.x = hingeScaleX);
  }
  function reset() {
    for (const [mesh, motion] of motionByMesh)
      (motion.kind === "slide"
        ? (mesh.position.x = motion.rest)
        : motion.kind === "roller"
          ? applyRollerTranslation(mesh, motion.rest)
          : restoreHingePose(mesh, motion),
        bumpOutlineRevision(mesh.parent));
    for (const flaggedMesh of outlineFlaggedMeshSet)
      delete flaggedMesh.userData.environmentOutlineMoving;
    (outlineFlaggedMeshSet.clear(),
      motionByMesh.clear(),
      (lastTickTime = null),
      (doorMeshList = null));
  }
  function findDoorModel(parentObject: any, candidateDoorModels: any) {
    return candidateDoorModels.find(
      (model: any) =>
        model.modelId === parentObject?.userData?.environmentModelId &&
        model.floorId === parentObject?.userData?.environmentFloorId,
    );
  }
  /**
   * 门模型配置的铰链侧；模型没写 left/right 时才用枢轴自身的 +x / -x 反推。
   * （0.8.1 `resolveHinge`，镜像判断也走它。）
   */
  function resolveHingeSide(doorModel: DoorHingeConfig | null | undefined, hingeX: number | undefined) {
    return doorModel?.hinge === "left" || doorModel?.hinge === "right"
      ? doorModel.hinge
      : Number(hingeX) > 0
        ? "right"
        : "left";
  }
  function resolveTarget(
    doorModel: DoorHingeConfig,
    parent: any,
    meshObject: any,
    entityStates: any,
    hingeMotion: HingePoseSnapshot | undefined,
  ) {
    const animationType = parent.userData?.doorAnimationType || "entry";
    if (animationType === "static") return null;

    const doorOpenRatio = lockState(doorModel, entityStates).doorOpenRatio;
    if (doorOpenRatio === null) return null;
    const interpolate = (closedValue: any, openValue: any) =>
      closedValue + (openValue - closedValue) * doorOpenRatio;
    if (animationType === "sliding") {
      if (Number.isFinite(meshObject.userData?.doorSlideSide)) {
        const direction = doorModel.openDirection === -1 ? -1 : 1;
        return {
          kind: "slide",
          value:
            meshObject.userData.doorSlideSide === -direction
              ? direction * meshObject.userData.doorSlideTravel * doorOpenRatio
              : 0,
        };
      }
      const slideOpenTranslation = Number(parent.userData?.doorSlideOpenTranslation),
        slideClosedTranslation = Number(parent.userData?.doorSlideClosedTranslation ?? 0);
      return Number.isFinite(slideOpenTranslation)
        ? {
            kind: "slide",
            value: interpolate(
              slideClosedTranslation,
              slideOpenTranslation * (doorModel.openDirection ?? 1),
            ),
          }
        : null;
    }
    if (animationType === "roller") {
      const rollerOpenTranslation = Number(
          parent.userData?.doorRollerOpenTranslation ??
            meshObject.userData?.doorRollerOpenTranslation,
        ),
        rollerClosedTranslation = Number(parent.userData?.doorRollerClosedTranslation ?? 0);
      return Number.isFinite(rollerOpenTranslation)
        ? {
            kind: "roller",
            value: interpolate(rollerClosedTranslation, rollerOpenTranslation),
          }
        : null;
    }
    const doorOpenRotation = Number(
      meshObject.userData?.doorOpenRotation ?? parent.userData?.doorOpenRotation,
    );
    // 固定铰链（子母门的母门、双开门扇）的铰链侧以枢轴自身位置为准，
    // 不再被 doorGroup 上的统一配置带偏。
    const closedRotation = Number(parent.userData?.doorClosedRotation ?? 0),
      interiorSide = Number(parent.userData?.doorInteriorSide);
    /**
     * 0.8.1 的开向规则：门朝「屋里那一侧」开 ——
     * `转角 = |openAngle| × (铰链在右 ? +1 : -1) × 室内侧 × 开门方向`。
     *
     * 只按 `swing`（内外翻转美术开关）或只按铰链侧都不够：同一面墙正反画，
     * `swing` 不变但屋里换到另一侧，门必须跟着换向，否则就朝室外/墙里开。
     */
    if (interiorSide === 1 || interiorSide === -1) {
      const openAngle = Number(doorModel.openAngle),
        angleRadians = Number.isFinite(openAngle)
          ? (Math.abs(openAngle) * Math.PI) / 180
          : Number.isFinite(doorOpenRotation)
            ? Math.abs(doorOpenRotation)
            : (80 * Math.PI) / 180,
        hingeRight =
          meshObject.userData?.doorFixedHinge === true
            ? Number(hingeMotion?.hingeX) > 0
            : resolveHingeSide(doorModel, hingeMotion?.hingeX) === "right";
      return {
        kind: "hinge",
        value: interpolate(
          closedRotation,
          angleRadians * (hingeRight ? 1 : -1) * interiorSide * (doorModel.openDirection ?? 1),
        ),
      };
    }
    if (Number.isFinite(doorOpenRotation)) {
      // 拿不到楼层多边形时的回退：沿用几何侧记下的转向符号。
      const openAngle = Number(doorModel.openAngle),
        angleRadians = Number.isFinite(openAngle)
          ? (Math.abs(openAngle) * Math.PI) / 180
          : Math.abs(doorOpenRotation),
        /**
         * 0.8.1 的错位校正：模型显式写了铰链侧、但枢轴实际摆在另一侧时，
         * 几何侧记下的符号是「按枢轴」写的，得整体翻一次才能对齐模型。
         * 固定铰链的门扇（双开门、子母门母门）位置由几何侧决定，不做校正。
         */
        hingeMismatch =
          meshObject.userData?.doorFixedHinge !== true &&
          (resolveHingeSide(doorModel, hingeMotion?.hingeX) === "right") !==
            (Number(hingeMotion?.hingeX) > 0);
      return {
        kind: "hinge",
        value: interpolate(
          closedRotation,
          Math.sign(doorOpenRotation) *
            angleRadians *
            (doorModel.openDirection ?? 1) *
            (hingeMismatch ? -1 : 1),
        ),
      };
    }
    const fallbackAngle = ((doorModel.openAngle ?? 80) * Math.PI) / 180,
      fallbackHingeSign = resolveHingeSide(doorModel, hingeMotion?.hingeX) === "right" ? 1 : -1;
    return {
      kind: "hinge",
      value: interpolate(
        closedRotation,
        fallbackAngle * (doorModel.openDirection ?? 1) * fallbackHingeSign,
      ),
    };
  }
  function tick(time: any, doorModels: any, states: any, forceSync = false) {
    if (
      (modelRoot !== options.modelRoot && (reset(), (modelRoot = options.modelRoot)),
      !doorModels?.length && !forceSync)
    ) {
      const hasAnyMotion = motionByMesh.size > 0;
      return (
        reset(),
        hasAnyMotion && (options.invalidateReflections?.(), options.requestRender?.()),
        false
      );
    }
    const environmentRevision = options.environmentRevision ?? options.sceneRevision;
    (!doorMeshList || forceSync || meshListRevision !== environmentRevision) &&
      ((meshListRevision = environmentRevision),
      (doorMeshList = []),
      modelRoot?.traverse((traversedMesh: any) => {
        (traversedMesh.userData?.doorHingePivot ||
          traversedMesh.userData?.entryDoorPivot ||
          traversedMesh.userData?.doorSlidePivot ||
          traversedMesh.userData?.doorRollerPivot) &&
          doorMeshList.push(traversedMesh);
      }));
    const deltaSeconds =
      forceSync || lastTickTime === null
        ? 0
        : Math.min(0.1, Math.max(0, (time - lastTickTime) / 1000));
    lastTickTime = time;
    const seenMeshSet = new Set(),
      parentHasMotionByMesh = new Map();
    let hasMotion = false,
      shouldRedraw = false;
    ((doorMeshList = doorMeshList.filter(isUnderModelRoot)),
      doorMeshList.forEach((doorMesh: any) => {
        const hingePivot = doorMesh.userData?.doorHingePivot || doorMesh.userData?.entryDoorPivot,
          slidePivot = doorMesh.userData?.doorSlidePivot,
          rollerPivot = doorMesh.userData?.doorRollerPivot;
        if (!hingePivot && !slidePivot && !rollerPivot) return;
        const doorParent = doorMesh.parent,
          matchedDoorModel = findDoorModel(doorParent, doorModels || []),
          stashedMotion = stashedMotionByMesh.get(doorMesh);
        if (
          (stashedMotion && stashedMotionByMesh.delete(doorMesh), !doorParent || !matchedDoorModel)
        ) {
          stashedMotion &&
            (stashedMotion.kind === "slide"
              ? (doorMesh.position.x = stashedMotion.rest)
              : stashedMotion.kind === "roller"
                ? applyRollerTranslation(doorMesh, stashedMotion.rest)
                : restoreHingePose(doorMesh, stashedMotion),
            (shouldRedraw = true),
            bumpOutlineRevision(doorParent));
          return;
        }
        seenMeshSet.add(doorMesh);
        // 铰链的原始位置/镜像在首次登记时从枢轴自身取，之后一直沿用这份快照，
        // 避免被动画过程中改动过的 position/scale 反向污染。
        const hingeMotion =
            motionByMesh.get(doorMesh) ||
            stashedMotion ||
            { hingeX: doorMesh.position?.x, hingeScaleX: doorMesh.scale?.x },
          poseBefore = [
            doorMesh.position?.x,
            doorMesh.position?.y,
            doorMesh.rotation?.y,
            doorMesh.scale?.y,
          ],
          target = resolveTarget(matchedDoorModel, doorParent, doorMesh, states, hingeMotion),
          kind = slidePivot ? "slide" : rollerPivot ? "roller" : "hinge";
        let trackedMotion = motionByMesh.get(doorMesh);
        if (!trackedMotion || trackedMotion.kind !== kind) {
          ((trackedMotion = {
            kind: kind,
            hingeX: hingeMotion.hingeX,
            hingeScaleX: hingeMotion.hingeScaleX,
            rest:
              stashedMotion?.rest ??
              (kind === "slide"
                ? Number(doorMesh.userData?.doorRestTranslation ?? doorMesh.position.x) || 0
                : kind === "roller"
                  ? Number(doorMesh.userData?.doorRestTranslation ?? doorMesh.position.y) || 0
                  : Number(doorMesh.userData?.doorRestRotation ?? doorMesh.rotation.y) || 0),
            target:
              target?.value ??
              (kind === "slide"
                ? doorMesh.position.x
                : kind === "roller"
                  ? doorMesh.position.y
                  : doorMesh.rotation.y),
          }),
            motionByMesh.set(doorMesh, trackedMotion));
          target &&
            (kind === "slide"
              ? (doorMesh.position.x = target.value)
              : kind === "roller"
                ? applyRollerTranslation(doorMesh, target.value)
                : (doorMesh.rotation.y = target.value),
            (shouldRedraw = true));
        }
        if (
          hingePivot &&
          // 固定铰链的门扇（子母门母门、双开门扇）位置和镜像已由几何侧摆好，
          // 运行时再挪一次会把门扇翻到铰链另一侧，表现就是「绕错边、朝反方向开」。
          doorMesh.userData?.doorFixedHinge !== true
        ) {
          // 铰链位置/镜像以枢轴首次登记的值为准（`hingeMotion`），
          // 只有拿不到时才回退到按门扇宽推算。
          const hingeRight = resolveHingeSide(matchedDoorModel, hingeMotion?.hingeX) === "right",
            leafWidth = Number(
              doorParent.userData?.doorLeafWidth ?? doorParent.userData?.entryDoorLeafWidth ?? 0.8,
            ),
            hingeX = Number(hingeMotion?.hingeX),
            hingeScaleX = Number(hingeMotion?.hingeScaleX);
          doorMesh.position.x =
            (hingeRight ? 1 : -1) *
            (Number.isFinite(hingeX) && hingeX !== 0 ? Math.abs(hingeX) : Math.abs(leafWidth) / 2);
          doorMesh.scale &&
            Number.isFinite(hingeScaleX) &&
            hingeScaleX !== 0 &&
            (doorMesh.scale.x =
              hingeScaleX * (hingeRight === hingeX > 0 ? 1 : -1));
        }
        target && (trackedMotion.target = target.value);
        const current =
            kind === "slide"
              ? doorMesh.position.x
              : kind === "roller"
                ? doorMesh.position.y
                : doorMesh.rotation.y,
          difference = trackedMotion.target - current,
          duration = Math.max(0.2, Number(matchedDoorModel.duration) || 0.7),
          maxStep =
            (Math.max(
              kind === "slide"
                ? Math.abs(Number(doorParent.userData?.doorSlideOpenTranslation) || 0)
                : kind === "roller"
                  ? Math.abs(
                      Number(
                        doorParent.userData?.doorRollerOpenTranslation ??
                          doorMesh.userData?.doorRollerOpenTranslation,
                      ) || 0,
                    )
                  : (Math.abs(Number(matchedDoorModel.openAngle) || 80) * Math.PI) / 180,
              0.01,
            ) *
              deltaSeconds) /
            duration;
        if (Math.abs(difference) > 0.0001) {
          const next = current + Math.sign(difference) * Math.min(Math.abs(difference), maxStep);
          (kind === "slide"
            ? (doorMesh.position.x = next)
            : kind === "roller"
              ? applyRollerTranslation(doorMesh, next)
              : (doorMesh.rotation.y = next),
            (hasMotion = true),
            (shouldRedraw = true));
        }
        const poseAfter = [
          doorMesh.position?.x,
          doorMesh.position?.y,
          doorMesh.rotation?.y,
          doorMesh.scale?.y,
        ];
        poseBefore.some((beforeValue, axisIndex) => beforeValue !== poseAfter[axisIndex]) &&
          bumpOutlineRevision(doorParent);
        const latestPosition =
          kind === "slide"
            ? doorMesh.position.x
            : kind === "roller"
              ? doorMesh.position.y
              : doorMesh.rotation.y;
        parentHasMotionByMesh.set(
          doorParent,
          !!parentHasMotionByMesh.get(doorParent) ||
            Math.abs(trackedMotion.target - latestPosition) > 0.0001,
        );
      }));
    for (const [departingMesh, departingMotion] of motionByMesh)
      seenMeshSet.has(departingMesh) ||
        (findDoorModel(departingMesh.parent, doorModels || [])
          ? stashedMotionByMesh.set(departingMesh, {
              kind: departingMotion.kind,
              rest: departingMotion.rest,
              hingeX: departingMotion.hingeX,
              hingeScaleX: departingMotion.hingeScaleX,
            })
          : departingMotion.kind === "slide"
            ? (departingMesh.position.x = departingMotion.rest)
            : departingMotion.kind === "roller"
              ? applyRollerTranslation(departingMesh, departingMotion.rest)
              : restoreHingePose(departingMesh, departingMotion),
        bumpOutlineRevision(departingMesh.parent),
        motionByMesh.delete(departingMesh),
        (shouldRedraw = true));
    for (const candidateOutlineMesh of new Set([
      ...outlineFlaggedMeshSet,
      ...parentHasMotionByMesh.keys(),
    ])) {
      const shouldOutlineMove = parentHasMotionByMesh.get(candidateOutlineMesh) === true;
      (candidateOutlineMesh.userData.environmentOutlineMoving !== shouldOutlineMove &&
        (shouldRedraw = true),
        (candidateOutlineMesh.userData.environmentOutlineMoving = shouldOutlineMove));
    }
    outlineFlaggedMeshSet.clear();
    for (const movingOutlineMesh of parentHasMotionByMesh.keys())
      outlineFlaggedMeshSet.add(movingOutlineMesh);
    return (
      shouldRedraw && (options.invalidateReflections?.(), options.requestRender?.()),
      hasMotion
    );
  }
  return {
    tick: tick,
    sync(syncDoorModels: any, syncStates: any) {
      return tick(null, syncDoorModels, syncStates, true);
    },
    dispose: reset,
  };
}
