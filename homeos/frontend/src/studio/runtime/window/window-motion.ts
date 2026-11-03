/**
 * 窗扇开合动画（0.8.4 `window-motion.js`）。
 *
 * 与门锁动画同构，但作用对象是 `addCustomWindow` 在枢轴/面板上留下的
 * `userData.windowMotion`：
 *
 * - 平开 / 上悬 / 下悬：`property:'rotation'`，`closed/open` 是铰链侧的角度区间；
 * - 推拉：`property:'position'` + `axis:'x'`，`closed/open` 是面板位移的两端；
 * - 推拉组的历史面板模型（`windowLegacyModelId`）用 `legacyOpen` 对齐老配置。
 *
 * 开合量的来源：
 * - 窗磁（`security.windows`）：`lockState().doorOpen` 是布尔量，按 `openPercent` 换算；
 * - 开窗器（`environment.windowOpeners`）：`openingPosition` 是百分比，`poseMoving`
 *   表示设备正忙，动画期间要持续请求帧；
 * - 两者都没有绑定：回到 `rest`（几何侧摆好的默认开度）。
 */

import { lockState } from "../security/lock-state";

/** 枢轴上的开合行程描述（`addCustomWindow` 写入）。 */
interface WindowMotionSpec {
  property: "rotation" | "position";
  axis: string;
  closed: number;
  open: number;
  rest: number;
  /** 推拉组的每扇历史开度：老配置按扇绑定，行程和组模型不同。 */
  legacyOpen?: number;
  /** 初始开度（%）：新装的窗默认留一条缝时要按它起步，而不是按 rest 反推。 */
  defaultOpening?: number;
}

interface WindowMotionState {
  bindingKey: string;
  bindingId: any;
  entityId: any;
  current: number;
  target: number;
  /** 开窗器按「直接位置」驱动时的目标（与 `target` 同值，保留上游字段语义）。 */
  directPosition?: number;
  /** 上一次消费到的原始状态与派生量，避免每帧重复算 lockState。 */
  open?: boolean | null;
  raw?: any;
  state?: any;
  available?: any;
}

interface WindowMotionBinding {
  id?: any;
  floorId?: any;
  modelId?: any;
  doorEntityId?: any;
  entityId?: any;
  windowOpener?: boolean;
  openingPosition?: unknown;
  directPosition?: boolean;
  poseMoving?: boolean;
  duration?: number;
  openPercent?: number;
}

export interface WindowMotionOptions {
  modelRoot?: any;
  environmentRevision?: any;
  sceneRevision?: any;
  setDynamicRenderObjects?: (kind: string, objects: any[]) => void;
  invalidateReflections?: (reason?: any) => void;
  requestDynamicRender?: (options?: { sceneEffects?: boolean }) => void;
  requestRender?: () => void;
}

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

const bindingKeyOf = (value: { floorId: any; modelId: any }) =>
  JSON.stringify([value.floorId, value.modelId]);

/** 设备上报「这个窗扇开到了哪一格」推导出的开合比例。 */
const ratioOf = (spec: WindowMotionSpec, poseValue: number) => {
  const span = spec.open - spec.closed;
  return span ? clampUnit((poseValue - spec.closed) / span) : 0;
};

const poseOf = (spec: WindowMotionSpec, ratio: number) =>
  spec.closed + (spec.open - spec.closed) * ratio;

export function createWindowMotion(options: WindowMotionOptions) {
  /** 枢轴 → 上一帧的动效状态；用对象身份判断「状态被重建过」。 */
  const trackedByPivot = new Map<any, { saved: WindowMotionState }>();
  /** 绑定键 → 动效状态（同一扇被窗磁与开窗器同时引用时共用一份）。 */
  const stateByBindingKey = new Map<string, WindowMotionState>();
  let modelRoot = options.modelRoot,
    pivotList: Array<{ pivot: any; id: string }> | null = null,
    pivotListRevision: any,
    sensorsByKey: Map<string, WindowMotionBinding> | null = null,
    lastBindings: WindowMotionBinding[] | null | undefined,
    lastTickTime: any = null,
    lastScope: any,
    reportedPivotSet = new Set<any>();

  const readPose = (pivot: any) => {
    const spec: WindowMotionSpec = pivot.userData.windowMotion;
    return pivot[spec.property][spec.axis];
  };
  const writePose = (pivot: any, value: number) => {
    const spec: WindowMotionSpec = pivot.userData.windowMotion;
    pivot[spec.property][spec.axis] = value;
  };
  const bumpOutlineRevision = (outlineObject: any) => {
    outlineObject?.userData &&
      (outlineObject.userData.environmentOutlineRevision =
        (outlineObject.userData.environmentOutlineRevision || 0) + 1);
  };
  const pivotKeyOf = (pivot: any) =>
    bindingKeyOf({
      floorId: pivot.userData.environmentFloorId,
      modelId: pivot.userData.environmentModelId,
    });
  const legacyKeyOf = (pivot: any) =>
    bindingKeyOf({
      floorId: pivot.userData.environmentFloorId,
      modelId: pivot.userData.windowLegacyModelId,
    });
  const isUnderModelRoot = (node: any) => {
    for (let walkNode = node; walkNode; walkNode = walkNode.parent)
      if (walkNode === modelRoot) return true;
    return false;
  };

  /**
   * 只有内容变了才重发动态渲染对象清单：舞台的反射/光照缓存按这份集合决定
   * 每帧是否重算，每帧发新数组会让缓存永远判脏。
   */
  function syncDynamicRenderObjects() {
    reportedPivotSet.size === trackedByPivot.size &&
      [...trackedByPivot.keys()].every((pivot) => reportedPivotSet.has(pivot)) ||
      ((reportedPivotSet = new Set(trackedByPivot.keys())),
      options.setDynamicRenderObjects?.("window", [...reportedPivotSet]));
  }
  function requestRedraw() {
    (options.invalidateReflections?.(),
      options.requestDynamicRender
        ? options.requestDynamicRender({ sceneEffects: true })
        : options.requestRender?.());
  }
  function reset(clearTracking = true) {
    let hasChanged = false;
    for (const pivot of trackedByPivot.keys()) {
      const restPose = pivot.userData.windowMotion.rest;
      (readPose(pivot) !== restPose &&
        (writePose(pivot, restPose), bumpOutlineRevision(pivot), (hasChanged = true)),
        delete pivot.userData.environmentOutlineMoving);
    }
    (trackedByPivot.clear(),
      (pivotList = null),
      (lastBindings = undefined),
      (sensorsByKey = null),
      (lastTickTime = null),
      syncDynamicRenderObjects(),
      clearTracking && (stateByBindingKey.clear(), (pivotListRevision = undefined)),
      hasChanged && requestRedraw());
  }

  function advance(
    time: any,
    bindings: WindowMotionBinding[] | null | undefined,
    states: any,
    forceSync: boolean,
    animateInitial: boolean,
    scope: any,
  ) {
    if (scope !== lastScope) (reset(), (lastScope = scope));
    if (modelRoot !== options.modelRoot) (reset(false), (modelRoot = options.modelRoot));

    if (forceSync || lastBindings !== bindings) {
      lastBindings = bindings;
      sensorsByKey = new Map(
        (bindings || [])
          .filter((binding) => binding.doorEntityId)
          .map((binding) => [
            bindingKeyOf({ floorId: binding.floorId, modelId: binding.modelId }),
            binding,
          ]),
      );
      // 绑定 id / 实体换了：旧动效状态不能再复用到新设备上，否则会带着旧目标值滑一下。
      for (const [trackedKey, trackedState] of stateByBindingKey) {
        const currentBinding = sensorsByKey.get(trackedState.bindingKey);
        (!currentBinding ||
          trackedState.bindingId !== currentBinding.id ||
          trackedState.entityId !== currentBinding.doorEntityId) &&
          stateByBindingKey.delete(trackedKey);
      }
    }

    const environmentRevision = options.environmentRevision ?? options.sceneRevision;
    (!pivotList || forceSync || pivotListRevision !== environmentRevision) &&
      ((pivotListRevision = environmentRevision),
      (pivotList = []),
      modelRoot?.traverse((pivot: any) => {
        pivot.userData?.windowMotion &&
          pivot.userData.environmentModelId &&
          pivotList!.push({ pivot, id: pivotKeyOf(pivot) });
      }));

    const deltaSeconds =
      forceSync || lastTickTime === null
        ? 0
        : Math.min(0.1, Math.max(0, (time - lastTickTime) / 1000));
    lastTickTime = time;

    const seenPivotSet = new Set<any>(),
      refreshedBindingSet = new Set<string>();
    let hasMotion = false,
      shouldRedraw = false;

    for (const { pivot, id } of pivotList) {
      if (!isUnderModelRoot(pivot)) continue;
      const legacyKey = legacyKeyOf(pivot),
        bindingKey = sensorsByKey!.has(id) ? id : legacyKey,
        binding = sensorsByKey!.get(bindingKey),
        baseMotion: WindowMotionSpec = pivot.userData.windowMotion,
        // 老配置按扇绑定时用 `legacyOpen`：组模型和单扇的行程不一样。
        motion =
          bindingKey === legacyKey && baseMotion.legacyOpen !== undefined
            ? { ...baseMotion, open: baseMotion.legacyOpen }
            : baseMotion;

      if (!binding) {
        (readPose(pivot) !== motion.rest &&
          (writePose(pivot, motion.rest), bumpOutlineRevision(pivot), (shouldRedraw = true)),
          delete pivot.userData.environmentOutlineMoving);
        continue;
      }
      seenPivotSet.add(pivot);

      let motionState = stateByBindingKey.get(bindingKey);
      if (!motionState) {
        const initialRatio =
          bindingKey === id && motion.defaultOpening !== undefined
            ? motion.defaultOpening / 100
            : ratioOf(motion, motion.rest);
        motionState = {
          bindingKey: bindingKey,
          bindingId: binding.id,
          entityId: binding.doorEntityId,
          current: initialRatio,
          target: initialRatio,
        };
        stateByBindingKey.set(bindingKey, motionState);
      }

      const rawState =
          states instanceof Map ? states.get(binding.doorEntityId) : states?.[binding.doorEntityId],
        stateData = rawState?.newState || rawState,
        cachedState = trackedByPivot.get(pivot);

      if (!refreshedBindingSet.has(bindingKey)) {
        refreshedBindingSet.add(bindingKey);
        (forceSync ||
          !Object.hasOwn(motionState, "open") ||
          motionState.raw !== stateData ||
          motionState.state !== stateData?.state ||
          motionState.available !== stateData?.available) &&
          ((motionState.open = lockState(binding, states).doorOpen),
          (motionState.raw = stateData),
          (motionState.state = stateData?.state),
          (motionState.available = stateData?.available));
        const nextTarget = binding.windowOpener
          ? Number.isFinite(binding.openingPosition)
            ? (binding.openingPosition as number) / 100
            : null
          : motionState.open === null
            ? null
            : motionState.open
              ? (binding.openPercent ?? 100) / 100
              : 0;
        (nextTarget !== null && (motionState.target = nextTarget),
          binding.windowOpener &&
            binding.directPosition &&
            nextTarget !== null &&
            (motionState.directPosition = nextTarget),
          // 状态刚被重建（首次挂载 / 绑定换了）且调用方没要求补间：直接贴到目标位。
          (!cachedState || cachedState.saved !== motionState) &&
            nextTarget !== null &&
            !animateInitial &&
            (motionState.current = nextTarget));
      }

      const distance = motionState.target - motionState.current;
      (Math.abs(distance) > 0.00001 &&
        ((motionState.current +=
          Math.sign(distance) *
          Math.min(Math.abs(distance), deltaSeconds / Math.max(0.2, binding.duration ?? 0.7))),
        (hasMotion = true)),
        (hasMotion ||= binding.windowOpener === true && binding.poseMoving === true));

      (!cachedState || cachedState.saved !== motionState) &&
        trackedByPivot.set(pivot, { saved: motionState });

      const nextPose = poseOf(motion, motionState.current);
      (readPose(pivot) !== nextPose &&
        (writePose(pivot, nextPose), bumpOutlineRevision(pivot), (shouldRedraw = true)),
        // 位置还没追上目标：轮廓光晕要跟着描边，停下后才撤掉。
        (pivot.userData.environmentOutlineMoving =
          Math.abs(poseOf(motion, motionState.target) - nextPose) > 0.00001));
    }

    for (const [departingPivot, departingTracked] of trackedByPivot) {
      if (seenPivotSet.has(departingPivot)) continue;
      sensorsByKey!.has(departingTracked.saved.bindingKey) ||
        (writePose(departingPivot, departingPivot.userData.windowMotion.rest),
        bumpOutlineRevision(departingPivot),
        (shouldRedraw = true));
      (delete departingPivot.userData.environmentOutlineMoving,
        trackedByPivot.delete(departingPivot));
    }

    return (syncDynamicRenderObjects(), shouldRedraw && requestRedraw(), hasMotion);
  }

  return {
    tick(
      time: any,
      bindings: WindowMotionBinding[] | null | undefined,
      states: any,
      tickOptions: { animateInitial?: boolean; scope?: any } = {},
    ) {
      return advance(
        time,
        bindings,
        states,
        false,
        tickOptions.animateInitial === true,
        tickOptions.scope,
      );
    },
    sync(
      bindings: WindowMotionBinding[] | null | undefined,
      states: any,
      syncOptions: { animateInitial?: boolean; scope?: any } = {},
    ) {
      return advance(null, bindings, states, true, syncOptions.animateInitial === true, syncOptions.scope);
    },
    dispose() {
      reset();
    },
  };
}
