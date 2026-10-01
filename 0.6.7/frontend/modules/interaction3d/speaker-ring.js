import { speakerState } from "./speaker-state.js?v=20260926-speaker-v1";
export function speakerRingFrame(playbackState, timeMs) {
  const breathRatio =
    playbackState === "playing"
      ? Math.pow(0.5 - 0.5 * Math.cos((timeMs * Math.PI * 2) / 3200), 1.5)
      : 0;
  return {
    visible: playbackState === "playing" || playbackState === "paused",
    brightness:
      playbackState === "playing"
        ? 0.035 + 0.965 * breathRatio
        : playbackState === "paused"
          ? 0.12
          : 0,
    breath: breathRatio,
    rotation: (timeMs * Math.PI * 2) / 18000,
  };
}
export function createSpeakerRings({ requestFrame: onRequestFrame = () => {} } = {}) {
  let previousRoot,
    previousRevision,
    ringEntries = [],
    isDisposed = false,
    isAnimating = false;
  const reducedMotionQuery =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ??
      globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)"),
    handleReducedMotionChange = () => {
      isDisposed || onRequestFrame();
    };
  reducedMotionQuery?.addEventListener?.("change", handleReducedMotionChange);
  const isModelVisible = (startObject) => {
      for (
        let ancestorObject = startObject;
        ancestorObject;
        ancestorObject = ancestorObject.parent
      ) {
        if (ancestorObject.visible === false) return false;
        if (ancestorObject === previousRoot) return true;
      }
      return false;
    },
    hideEntryParts = (ringEntry) => {
      for (const entryPart of ringEntry.parts) entryPart.visible = false;
    };
  return {
    sync({
      root: rootObject,
      revision: revision,
      bindings: speakerBindings = [],
      states: speakerStates = {},
    }) {
      if (!isDisposed) {
        (previousRoot !== rootObject || previousRevision !== revision) &&
          (ringEntries.forEach(hideEntryParts),
          (ringEntries = []),
          (previousRoot = rootObject),
          (previousRevision = revision),
          previousRoot?.traverse((speakerModel) => {
            if (speakerModel.userData?.environmentModelType !== "speaker") return;
            const speakerParts = [];
            (speakerModel.traverse((ringPartMesh) => {
              (ringPartMesh.userData?.speakerRing || ringPartMesh.userData?.speakerHalo) &&
                speakerParts.push(ringPartMesh);
            }),
              ringEntries.push({
                model: speakerModel,
                parts: speakerParts,
                state: "off",
              }));
          }));
        for (const syncEntry of ringEntries) {
          const matchedBinding = speakerBindings.find(
              (bindingCandidate) =>
                bindingCandidate.floorId === syncEntry.model.userData.environmentFloorId &&
                bindingCandidate.modelId === syncEntry.model.userData.environmentModelId,
            ),
            ringState =
              matchedBinding && matchedBinding.visible !== false
                ? speakerState(matchedBinding, speakerStates).ring
                : "off";
          ringState !== syncEntry.state &&
            ((syncEntry.state = ringState), this.tick(performance.now()), onRequestFrame());
        }
      }
    },
    tick(nowMs) {
      if (isDisposed) return false;
      const isReducedMotion = reducedMotionQuery?.matches === true;
      isAnimating = false;
      let isDirty = false;
      for (const tickEntry of ringEntries) {
        if (!isModelVisible(tickEntry.model)) continue;
        const ringFrame = speakerRingFrame(tickEntry.state, isReducedMotion ? 800 : nowMs);
        isAnimating ||= tickEntry.state === "playing" && !isReducedMotion;
        for (const speakerPart of tickEntry.parts) {
          if (
            (speakerPart.visible !== ringFrame.visible && (isDirty = true),
            (speakerPart.visible = ringFrame.visible),
            speakerPart.userData.speakerRing)
          )
            (speakerPart.material.color.r !== ringFrame.brightness && (isDirty = true),
              speakerPart.material.color.setRGB(
                ringFrame.brightness,
                ringFrame.brightness,
                ringFrame.brightness,
              ));
          else {
            const haloOpacity = speakerPart.userData.speakerHalo * ringFrame.breath;
            (speakerPart.material.opacity !== haloOpacity && (isDirty = true),
              (speakerPart.material.opacity = haloOpacity));
          }
          tickEntry.state === "playing" &&
            !isReducedMotion &&
            (speakerPart.rotation.z !== ringFrame.rotation && (isDirty = true),
            (speakerPart.rotation.z = ringFrame.rotation));
        }
      }
      return ((isDirty || isAnimating) && onRequestFrame(), isAnimating);
    },
    nextDelay() {
      return isAnimating ? 1000 / 30 : Infinity;
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        reducedMotionQuery?.removeEventListener?.("change", handleReducedMotionChange),
        ringEntries.forEach(hideEntryParts),
        (ringEntries = []),
        (previousRoot = null),
        (isAnimating = false));
    },
  };
}
