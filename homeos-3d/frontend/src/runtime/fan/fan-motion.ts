export function fanMotionState(entityState) {
  entityState = entityState?.newState || entityState || {};
  const stateAttributes = entityState.attributes || {},
    isOn = entityState.available !== false && entityState.state === "on",
    speedPercentage =
      typeof stateAttributes.percentage == "number" && Number.isFinite(stateAttributes.percentage)
        ? Math.max(0, Math.min(100, stateAttributes.percentage))
        : 40;
  return {
    on: isOn && speedPercentage > 0,
    percentage: speedPercentage,
    oscillating: isOn && stateAttributes.oscillating === true,
    direction: stateAttributes.direction === "reverse" ? -1 : 1,
  };
}
export function createFanMotion({
  requestFrame: onRequestFrame = () => {},
  reducedMotion: prefersReducedMotion = () =>
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
} = {}) {
  let currentSceneRoot,
    currentRevision,
    fanModels = [],
    isAnimating = false,
    isDisposed = false,
    lastFrameTimestamp = null;
  const isNodeVisible = (sceneNode) => {
      for (let currentNode = sceneNode; currentNode; currentNode = currentNode.parent) {
        if (currentNode.visible === false) return false;
        if (currentNode === currentSceneRoot) return true;
      }
      return false;
    },
    resetYawRotations = () =>
      fanModels.forEach((fanEntry) => {
        fanEntry.yaw && (fanEntry.yaw.rotation.y = 0);
      });
  return {
    sync({
      root: sceneRoot,
      revision: revision,
      bindings: modelBindings = [],
      states: statesByEntityId = {},
    }) {
      if (isDisposed) return;
      (currentSceneRoot !== sceneRoot || currentRevision !== revision) &&
        (resetYawRotations(),
        (currentSceneRoot = sceneRoot),
        (currentRevision = revision),
        (fanModels = []),
        (lastFrameTimestamp = null),
        currentSceneRoot?.traverse((fanNode) => {
          if (fanNode.userData?.environmentModelType !== "fan") return;
          const fanModel = {
            model: fanNode,
            swingTime: 0,
            state: fanMotionState(null),
          };
          (fanNode.traverse((fanPartNode) => {
            fanPartNode.userData?.fanPart && (fanModel[fanPartNode.userData.fanPart] = fanPartNode);
          }),
            fanModels.push(fanModel));
        }));
      let hasStateChange = false;
      for (const syncFanModel of fanModels) {
        const matchedBinding = modelBindings.find(
            (binding) =>
              binding.floorId === syncFanModel.model.userData.environmentFloorId &&
              binding.modelId === syncFanModel.model.userData.environmentModelId,
          ),
          nextMotionState = fanMotionState(
            matchedBinding ? statesByEntityId[matchedBinding.entityId] : null,
          );
        (JSON.stringify(nextMotionState) !== JSON.stringify(syncFanModel.state) &&
          (hasStateChange = true),
          (syncFanModel.state = nextMotionState));
      }
      hasStateChange && onRequestFrame();
    },
    tick(timestampMs) {
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
