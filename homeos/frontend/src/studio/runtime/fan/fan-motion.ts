import { fanMotionState, resolveFanBindingState } from "./fan-state";

const FAN_MODEL_TYPES = new Set(["fan", "ceiling-fan"]);

export function createFanMotion({
  requestFrame: onRequestFrame = () => {},
  reducedMotion: prefersReducedMotion = () =>
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
} = {}) {
  let currentSceneRoot: any,
    currentRevision: any,
    fanModels: any = [],
    isAnimating = false,
    isDisposed = false,
    lastFrameTimestamp: any = null;
  const isNodeVisible = (sceneNode: any) => {
      for (let currentNode = sceneNode; currentNode; currentNode = currentNode.parent) {
        if (currentNode.visible === false) return false;
        if (currentNode === currentSceneRoot) return true;
      }
      return false;
    },
    resetYawRotations = () =>
      fanModels.forEach((fanEntry: any) => {
        fanEntry.yaw && (fanEntry.yaw.rotation.y = 0);
        fanEntry.rotor && fanEntry.visualMode === "ceiling" && (fanEntry.rotor.rotation.y = 0);
      });
  return {
    sync({
      root: sceneRoot,
      revision: revision,
      bindings: modelBindings = [],
      states: statesByEntityId = {},
    }: any) {
      if (isDisposed) return;
      (currentSceneRoot !== sceneRoot || currentRevision !== revision) &&
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
        // 0.7.2：动画开关跟 running；保留外观 visualMode（tower/ceiling）
        const motionView = {
          ...nextMotionState,
          on: !!(nextMotionState as any).running,
          percentage: (nextMotionState as any).percentage ?? 40,
        };
        (JSON.stringify(motionView) !== JSON.stringify(syncFanModel.state) &&
          (hasStateChange = true),
          (syncFanModel.state = motionView));
      }
      hasStateChange && onRequestFrame();
    },
    tick(timestampMs: any) {
      if (isDisposed) return false;
      const frameDeltaSeconds =
        lastFrameTimestamp === null
          ? 0
          : Math.max(0, Math.min(0.08, (timestampMs - lastFrameTimestamp) / 1000));
      if (((lastFrameTimestamp = timestampMs), (isAnimating = false), prefersReducedMotion()))
        return false;
      for (const tickFanModel of fanModels)
        !tickFanModel.state.on ||
          !isNodeVisible(tickFanModel.model) ||
          ((isAnimating = true),
          tickFanModel.rotor &&
            (tickFanModel.visualMode === "ceiling"
              ? (tickFanModel.rotor.rotation.y =
                  (tickFanModel.rotor.rotation.y +
                    tickFanModel.state.direction *
                      (2.2 + (tickFanModel.state.percentage || 40) * 0.12) *
                      frameDeltaSeconds) %
                  (Math.PI * 2))
              : (tickFanModel.rotor.rotation.z =
                  (tickFanModel.rotor.rotation.z -
                    tickFanModel.state.direction *
                      (3 + (tickFanModel.state.percentage || 40) * 0.16) *
                      frameDeltaSeconds) %
                  (Math.PI * 2))),
          tickFanModel.yaw &&
            tickFanModel.state.oscillating &&
            tickFanModel.visualMode !== "ceiling" &&
            ((tickFanModel.swingTime += frameDeltaSeconds),
            (tickFanModel.yaw.rotation.y =
              (Math.sin(tickFanModel.swingTime * 0.6) * Math.PI) / 4)));
      return (isAnimating && onRequestFrame(), isAnimating);
    },
    nextDelay() {
      return isAnimating ? 1000 / 30 : Infinity;
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        resetYawRotations(),
        (fanModels = []),
        (currentSceneRoot = null),
        (isAnimating = false),
        (lastFrameTimestamp = null));
    },
  };
}
