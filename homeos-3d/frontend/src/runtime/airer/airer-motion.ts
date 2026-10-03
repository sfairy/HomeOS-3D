import { coverState } from "../cover/cover-state";
export function createAirerMotion({
  requestFrame: requestFrame = () => {},
  now: now = () => performance.now(),
} = {}) {
  let syncedRoot,
    syncedRevision,
    airerEntries = [],
    hasAdvancedMotion = false,
    isDisposed = false;
  const airerKey = (binding) => binding.floorId + "/" + binding.modelId;
  function advanceMotion(entry, timestamp) {
    const motion = entry.motion;
    if (!motion) return;
    const progress = Math.max(0, Math.min(1, (timestamp - motion.start) / motion.duration));
    ((entry.position = motion.from + (motion.to - motion.from) * progress),
      progress === 1 && (entry.motion = null));
  }
  function applyPose(posedEntry) {
    (posedEntry.rig.pose(posedEntry.position),
      posedEntry.outlinePosition !== posedEntry.position &&
        ((posedEntry.model.userData.environmentOutlineRevision =
          (posedEntry.model.userData.environmentOutlineRevision || 0) + 1),
        (posedEntry.outlinePosition = posedEntry.position)),
      (posedEntry.model.userData.environmentOutlineMoving = !!(
        posedEntry.motion || posedEntry.state?.moving
      )));
  }
  return {
    sync({ root: root, revision: revision, bindings: bindings = [], states: states = {} }) {
      if (isDisposed) return;
      const frameTime = now();
      (syncedRoot !== root || syncedRevision !== revision) &&
        ((syncedRoot = root),
        (syncedRevision = revision),
        (airerEntries = []),
        syncedRoot?.traverse((airerModel) => {
          airerModel.userData?.environmentModelType === "airer" &&
            airerModel.traverse((rigNode) => {
              rigNode.userData?.airerRig &&
                airerEntries.push({
                  key:
                    airerModel.userData.environmentFloorId +
                    "/" +
                    airerModel.userData.environmentModelId,
                  model: airerModel,
                  rig: rigNode.userData.airerRig,
                  position: 55,
                  motion: null,
                  signature: "",
                });
            });
        }));
      for (const airerEntry of airerEntries) {
        const airerBinding = bindings.find(
            (bindingCandidate) => airerKey(bindingCandidate) === airerEntry.key,
          ),
          cover = coverState(airerBinding?.entityId || "", states[airerBinding?.entityId]),
          entityId = airerBinding?.entityId || "",
          signature = JSON.stringify([
            entityId,
            cover.available,
            cover.state,
            cover.position,
            airerBinding?.travelSeconds,
            airerBinding?.unboundPosition,
          ]);
        if (signature !== airerEntry.signature) {
          advanceMotion(airerEntry, frameTime);
          const entityChanged = !airerEntry.signature || entityId !== airerEntry.entityId;
          airerEntry.motion = null;
          const motionReversed =
            airerEntry.state?.moving && cover.moving && airerEntry.state.opening !== cover.opening;
          if (
            ((entityChanged || !cover.available || !cover.moving || motionReversed) &&
              ((airerEntry.reportTime = null), (airerEntry.reportInterval = null)),
            !airerBinding?.entityId)
          )
            airerEntry.position = airerBinding?.unboundPosition ?? airerEntry.rig.preview ?? 55;
          else {
            if (cover.available && cover.position !== null) {
              if (cover.moving && cover.position !== airerEntry.state?.position) {
                const reportGap =
                  airerEntry.reportTime == null ? null : frameTime - airerEntry.reportTime;
                (reportGap >= 80 &&
                  reportGap <= 5000 &&
                  (airerEntry.reportInterval =
                    airerEntry.reportInterval == null
                      ? reportGap
                      : Math.max(reportGap, airerEntry.reportInterval * 0.7 + reportGap * 0.3)),
                  (airerEntry.reportTime = frameTime));
              } else
                cover.moving &&
                  airerEntry.reportTime == null &&
                  (airerEntry.reportTime = frameTime);
              if (entityChanged || !cover.moving || motionReversed)
                airerEntry.position = cover.position;
              else {
                if (airerEntry.position !== cover.position) {
                  const reportInterval = airerEntry.reportInterval ?? 1000,
                    motionDuration = Math.max(120, Math.min(5500, reportInterval * 1.15));
                  airerEntry.motion = {
                    from: airerEntry.position,
                    to: cover.position,
                    start: frameTime,
                    duration: motionDuration,
                  };
                }
              }
            } else {
              if (cover.available && cover.moving) {
                const targetPosition = cover.opening ? 100 : 0;
                (entityChanged &&
                  (airerEntry.position =
                    airerBinding?.unboundPosition ?? airerEntry.rig.preview ?? 55),
                  targetPosition !== airerEntry.position &&
                    (airerEntry.motion = {
                      from: airerEntry.position,
                      to: targetPosition,
                      start: frameTime,
                      duration: Math.max(
                        180,
                        (Math.abs(targetPosition - airerEntry.position) / 100) *
                          (airerBinding?.travelSeconds || 20) *
                          1000,
                      ),
                    }));
              }
            }
          }
          ((airerEntry.signature = signature),
            (airerEntry.entityId = entityId),
            (airerEntry.state = cover),
            applyPose(airerEntry),
            requestFrame());
        }
        const lightBinding = (airerBinding?.extraControls || []).find((control) =>
            control.entityId.startsWith("light."),
          ),
          lightState = states[lightBinding?.entityId],
          lightEntityState = lightState?.newState || lightState,
          lightOn = lightEntityState?.available !== false && lightEntityState?.state === "on";
        airerEntry.light !== lightOn &&
          ((airerEntry.light = lightOn), airerEntry.rig.setLight(lightOn), requestFrame());
      }
    },
    tick(tickTime = now()) {
      hasAdvancedMotion = false;
      for (const tickEntry of airerEntries)
        tickEntry.motion &&
          (advanceMotion(tickEntry, tickTime),
          applyPose(tickEntry),
          (hasAdvancedMotion ||= !!tickEntry.motion),
          requestFrame());
      return hasAdvancedMotion;
    },
    read(readBinding, baseState) {
      const matchedEntry = airerEntries.find(
        (candidate) => candidate.key === airerKey(readBinding),
      );
      return {
        ...baseState,
        estimated: baseState.position === null,
        visualPosition: matchedEntry?.position ?? null,
      };
    },
    nextDelay() {
      return airerEntries.some((activeEntry) => activeEntry.motion) ? 1000 / 30 : Infinity;
    },
    dispose() {
      isDisposed = true;
      for (const disposedEntry of airerEntries)
        delete disposedEntry.model.userData.environmentOutlineMoving;
      ((airerEntries = []), (syncedRoot = null), (hasAdvancedMotion = false));
    },
  };
}
