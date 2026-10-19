import { createAnimationCadence } from "../core/animation-work";
import { fanMotionState, resolveFanBindingState } from "./fan-state";

const FAN_MODEL_TYPES = new Set(["fan", "ceiling-fan"]);

export function createFanMotion({
  requestFrame: onRequestFrame = () => {},
  requestAnimation: onRequestAnimation = onRequestFrame,
  setRenderObjects: onSetRenderObjects = (_renderObjects: any[]) => {},
  isVisible: isModelInView = (_target: any) => true,
  reducedMotion: prefersReducedMotion = () =>
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
}: {
  requestFrame?: (...args: any[]) => any;
  requestAnimation?: (...args: any[]) => any;
  setRenderObjects?: (renderObjects: any[]) => void;
  isVisible?: (target: any) => boolean;
  reducedMotion?: () => boolean;
} = {}) {
  let currentSceneRoot: any,
    currentRevision: any,
    fanModels: any = [],
    isAnimating = false,
    isDisposed = false,
    lastFrameTimestamp: any = null;
  // 30fps 节拍：同一帧被多次回调时不重复推进角度（0.7.8 `animation-work`）。
  const animationCadence = createAnimationCadence(),
    isNodeVisible = (sceneNode: any) => {
      for (let currentNode = sceneNode; currentNode; currentNode = currentNode.parent) {
        if (currentNode.visible === false) return false;
        if (currentNode === currentSceneRoot) return isModelInView(sceneNode);
      }
      return false;
    },
    isOutlineMoving = (fanEntry: any) =>
      !prefersReducedMotion() &&
      isNodeVisible(fanEntry.model) &&
      (fanEntry.state.on ||
        (fanEntry.visualMode === "ceiling" && Math.abs(fanEntry.velocity) >= 0.01)),
    resetYawRotations = () =>
      fanModels.forEach((fanEntry: any) => {
        fanEntry.yaw && (fanEntry.yaw.rotation.y = 0);
        fanEntry.rotor && fanEntry.visualMode === "ceiling" && (fanEntry.rotor.rotation.y = 0);
        fanEntry.velocity = 0;
        delete fanEntry.model.userData.environmentOutlineMoving;
      }),
    /**
     * 把"当前真正需要逐帧渲染的部件"交给宿主：吊扇在惯性未归零时仍要渲染，
     * 落地扇只在运行时才算。没有变化就不打扰宿主。
     */
    publishRenderObjects = () => {
      let hasChanged = false;
      const renderObjects: any[] = [];
      for (const fanEntry of fanModels) {
        const isActive =
            !prefersReducedMotion() &&
            (fanEntry.state.on ||
              (fanEntry.visualMode === "ceiling" && Math.abs(fanEntry.velocity) >= 0.01)),
          renderObject =
            (isActive &&
              (fanEntry.state.on && fanEntry.state.oscillating && fanEntry.yaw
                ? fanEntry.yaw
                : fanEntry.rotor)) ||
            null;
        (fanEntry.renderObject !== renderObject &&
          ((fanEntry.renderObject = renderObject), (hasChanged = true)),
          renderObject && renderObjects.push(renderObject));
      }
      hasChanged && onSetRenderObjects(renderObjects);
    };
  return {
    sync({
      root: sceneRoot,
      revision: revision,
      bindings: modelBindings = [],
      states: statesByEntityId = {},
    }: any) {
      if (isDisposed) return;
      const needsRebuild = currentSceneRoot !== sceneRoot || currentRevision !== revision;
      needsRebuild &&
        (resetYawRotations(),
        (currentSceneRoot = sceneRoot),
        (currentRevision = revision),
        (fanModels = []),
        (lastFrameTimestamp = null),
        currentSceneRoot?.traverse((fanNode: any) => {
          const modelType =
            fanNode.userData?.environmentModelType || fanNode.userData?.itemType;
          if (!FAN_MODEL_TYPES.has(modelType)) return;
          const fanModel = {
            model: fanNode,
            swingTime: 0,
            velocity: 0,
            visualMode: modelType === "ceiling-fan" ? "ceiling" : "tower",
            state: fanMotionState(null, { modelType }),
          };
          (fanNode.traverse((fanPartNode: any) => {
            fanPartNode.userData?.fanPart &&
              ((fanModel as any)[fanPartNode.userData.fanPart] = fanPartNode);
          }),
            fanModels.push(fanModel));
        }));
      let hasStateChange = false;
      for (const syncFanModel of fanModels) {
        const matchedBinding = modelBindings.find(
            (binding: any) =>
              binding.floorId === syncFanModel.model.userData.environmentFloorId &&
              binding.modelId === syncFanModel.model.userData.environmentModelId,
          ),
          nextMotionState = matchedBinding
            ? resolveFanBindingState(
                {
                  ...matchedBinding,
                  modelType: syncFanModel.model.userData?.environmentModelType,
                  visualMode:
                    matchedBinding.visualMode || syncFanModel.visualMode,
                },
                statesByEntityId,
              )
            : fanMotionState(null, { visualMode: syncFanModel.visualMode });
        // 动画开关跟 running；外观保留 visualMode（tower/ceiling）
        const motionView = {
          ...nextMotionState,
          on: !!(nextMotionState as any).running,
          percentage: (nextMotionState as any).percentage ?? 40,
        };
        (JSON.stringify(motionView) !== JSON.stringify(syncFanModel.state) &&
          (hasStateChange = true),
          (syncFanModel.state = motionView),
          (syncFanModel.model.userData.environmentOutlineMoving =
            isOutlineMoving(syncFanModel)));
      }
      (publishRenderObjects(),
        hasStateChange && (animationCadence.reset(), onRequestFrame()));
    },
    tick(timestampMs: any) {
      if (isDisposed) return false;
      // 整棵场景树都不可见时不必推进动画，也不必继续请求帧。
      if (!fanModels.some((fanEntry: any) => isNodeVisible(fanEntry.model)))
        return (
          (isAnimating = false),
          (lastFrameTimestamp = null),
          animationCadence.reset(),
          false
        );
      // 未到 30fps 阈值：保持上一帧的"是否在动"，但不再累加角度。
      if (animationCadence.take(timestampMs) === null) return isAnimating;
      const frameDeltaSeconds =
        lastFrameTimestamp === null
          ? 0
          : Math.max(0, Math.min(0.08, (timestampMs - lastFrameTimestamp) / 1000));
      if (((lastFrameTimestamp = timestampMs), (isAnimating = false), prefersReducedMotion()))
        return (
          fanModels.forEach(
            (fanEntry: any) => (fanEntry.model.userData.environmentOutlineMoving = false),
          ),
          publishRenderObjects(),
          false
        );
      for (const tickFanModel of fanModels) {
        tickFanModel.model.userData.environmentOutlineMoving =
          isOutlineMoving(tickFanModel);
        if (!isNodeVisible(tickFanModel.model)) continue;
        if (tickFanModel.visualMode === "ceiling") {
          if (!tickFanModel.rotor) continue;
          // 吊扇用指数收敛的速度模型：停机后有可见惯性，而不是硬切。
          const targetVelocity = tickFanModel.state.on
              ? -tickFanModel.state.direction *
                (3 + tickFanModel.state.percentage * 0.16)
              : 0,
            settleRate = targetVelocity ? 5 : 3,
            velocityDecay = Math.exp(-settleRate * frameDeltaSeconds),
            rotationDelta =
              targetVelocity * frameDeltaSeconds +
              ((tickFanModel.velocity - targetVelocity) * (1 - velocityDecay)) / settleRate;
          (tickFanModel.velocity =
            targetVelocity + (tickFanModel.velocity - targetVelocity) * velocityDecay),
            !targetVelocity &&
              Math.abs(tickFanModel.velocity) < 0.01 &&
              (tickFanModel.velocity = 0),
            (tickFanModel.model.userData.environmentOutlineMoving =
              isOutlineMoving(tickFanModel)),
            (tickFanModel.rotor.rotation.y =
              (tickFanModel.rotor.rotation.y + rotationDelta) % (Math.PI * 2)),
            (isAnimating ||=
              targetVelocity !== 0 || tickFanModel.velocity !== 0);
          continue;
        }
        tickFanModel.state.on &&
          ((isAnimating = true),
          tickFanModel.rotor &&
            (tickFanModel.rotor.rotation.z =
              (tickFanModel.rotor.rotation.z -
                tickFanModel.state.direction *
                  (3 + tickFanModel.state.percentage * 0.16) *
                  frameDeltaSeconds) %
              (Math.PI * 2)),
          tickFanModel.yaw &&
            tickFanModel.state.oscillating &&
            ((tickFanModel.swingTime += frameDeltaSeconds),
            (tickFanModel.yaw.rotation.y =
              (Math.sin(tickFanModel.swingTime * 0.6) * Math.PI) / 4)));
      }
      return (publishRenderObjects(), isAnimating && onRequestAnimation(), isAnimating);
    },
    nextDelay() {
      return isAnimating ? 1000 / 30 : Infinity;
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        resetYawRotations(),
        onSetRenderObjects([]),
        (fanModels = []),
        (currentSceneRoot = null),
        (isAnimating = false),
        (lastFrameTimestamp = null));
    },
  };
}
