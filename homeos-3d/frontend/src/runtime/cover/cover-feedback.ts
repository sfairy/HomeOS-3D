export function createCoverFeedback({
  now: now = () => performance.now(),
  smoothingTime: smoothingTime = 180,
  commandPreview: commandPreview = false,
  travelTime: travelTime = 6000,
  storage: storage,
  scope: scope,
  wallNow: wallNow = () => Date.now(),
}: {
  now?: () => number;
  smoothingTime?: number;
  commandPreview?: boolean;
  travelTime?: number;
  storage?: Storage;
  scope?: string;
  wallNow?: () => number;
} = {}) {
  const feedbackByEntityId = new Map(),
    readLastUpdated = (state) => Date.parse(state.raw?.last_updated ?? state.raw?.updatedAt ?? ""),
    storageKeyFor = (entityId) =>
      scope ? "hb-cover-presentation:v1:" + scope + ":" + entityId : null,
    shouldPersist = (entry) =>
      commandPreview && entry.actual.dream && entry.actual.overallFeedbackAvailable === false;
  function clearPresentation(clearedEntityId) {
    try {
      const storageKey = storageKeyFor(clearedEntityId);
      storageKey && storage?.removeItem(storageKey);
    } catch {}
  }
  function savePresentation(savedEntityId, savedEntry) {
    if (!shouldPersist(savedEntry) || !savedEntry.estimated || savedEntry.position === null) return;
    const activeMotion = savedEntry.motion,
      payload = {
        position: savedEntry.position,
        savedAt: wallNow(),
        motion: activeMotion
          ? {
              to: activeMotion.to,
              duration: Math.max(0, activeMotion.duration - (now() - activeMotion.start)),
            }
          : null,
      };
    try {
      const writeStorageKey = storageKeyFor(savedEntityId);
      writeStorageKey && storage?.setItem(writeStorageKey, JSON.stringify(payload));
    } catch {}
  }
  function restorePresentation(restoredEntityId, restoredEntry) {
    if (!shouldPersist(restoredEntry)) {
      clearPresentation(restoredEntityId);
      return;
    }
    try {
      const readStorageKey = storageKeyFor(restoredEntityId),
        stored = readStorageKey && JSON.parse(storage?.getItem(readStorageKey) || "null"),
        isValidPosition = (candidatePosition) =>
          typeof candidatePosition == "number" &&
          Number.isFinite(candidatePosition) &&
          candidatePosition >= 0 &&
          candidatePosition <= 100;
      if (!stored || !isValidPosition(stored.position) || !Number.isFinite(stored.savedAt)) return;
      const elapsedMs = Math.max(0, wallNow() - stored.savedAt),
        storedMotion = stored.motion;
      if (
        storedMotion &&
        (!isValidPosition(storedMotion.to) ||
          !Number.isFinite(storedMotion.duration) ||
          storedMotion.duration < 0 ||
          storedMotion.duration > travelTime)
      )
        return;
      if (((restoredEntry.position = stored.position), storedMotion)) {
        const progress =
          storedMotion.duration > 0 ? Math.min(1, elapsedMs / storedMotion.duration) : 1;
        ((restoredEntry.position += (storedMotion.to - restoredEntry.position) * progress),
          progress < 1 &&
            (restoredEntry.motion = {
              from: restoredEntry.position,
              to: storedMotion.to,
              start: now(),
              duration: storedMotion.duration - elapsedMs,
            }));
      }
      ((restoredEntry.estimated = true), (restoredEntry.railUnconfirmed = true));
    } catch {}
  }
  function advanceMotion(trackedEntry, timeMs) {
    if (!trackedEntry.motion) return false;
    const {
        from: fromPosition,
        to: toPosition,
        start: startedAt,
        duration: durationMs = smoothingTime,
      } = trackedEntry.motion,
      motionProgress = Math.max(0, Math.min(1, (timeMs - startedAt) / durationMs));
    return (
      (trackedEntry.position = fromPosition + (toPosition - fromPosition) * motionProgress),
      motionProgress === 1 && (trackedEntry.motion = null),
      true
    );
  }
  function retargetMotion(retargetedEntry, targetPosition) {
    const isResumable = commandPreview && retargetedEntry.actual.axis !== "blade";
    if (
      targetPosition === null ||
      retargetedEntry.position === null ||
      smoothingTime <= 0 ||
      (!isResumable && !retargetedEntry.actual.moving && retargetedEntry.actual.axis !== "blade")
    ) {
      ((retargetedEntry.position = targetPosition), (retargetedEntry.motion = null));
      return;
    }
    if (retargetedEntry.motion?.to === targetPosition) return;
    const remainingDistance = Math.abs(targetPosition - retargetedEntry.position),
      retargetDurationMs =
        isResumable &&
        !retargetedEntry.actual.moving &&
        retargetedEntry.intent?.service !== "stop_cover"
          ? Math.max(smoothingTime, Math.min(1200, (remainingDistance / 100) * travelTime))
          : smoothingTime;
    retargetedEntry.motion =
      remainingDistance === 0
        ? null
        : {
            from: retargetedEntry.position,
            to: targetPosition,
            start: now(),
            duration: retargetDurationMs,
          };
  }
  function sync(syncedEntityId, nextState) {
    let stateEntry = feedbackByEntityId.get(syncedEntityId);
    if (!stateEntry) {
      ((stateEntry = {
        actual: nextState,
        position: nextState.position,
        motion: null,
        intent: null,
        token: null,
        error: "",
        draft: null,
        bladeHold: null,
        railUnconfirmed: false,
        estimated: false,
        lastAvailable: nextState.available ? nextState : null,
        lastTimestamp: readLastUpdated(nextState),
      }),
        restorePresentation(syncedEntityId, stateEntry),
        feedbackByEntityId.set(syncedEntityId, stateEntry));
      return;
    }
    const previousState = stateEntry.actual;
    if (readLastUpdated(nextState) < stateEntry.lastTimestamp) return;
    if (
      (Number.isFinite(readLastUpdated(nextState)) &&
        (stateEntry.lastTimestamp = readLastUpdated(nextState)),
      nextState.dream !== previousState.dream ||
        nextState.overallFeedbackAvailable !== previousState.overallFeedbackAvailable)
    ) {
      (feedbackByEntityId.delete(syncedEntityId), sync(syncedEntityId, nextState));
      return;
    }
    const isPositionChanged = nextState.position !== previousState.position,
      isStateChanged = nextState.state !== previousState.state,
      lastAvailableChanged =
        !stateEntry.lastAvailable ||
        nextState.position !== stateEntry.lastAvailable.position ||
        nextState.state !== stateEntry.lastAvailable.state;
    if (((stateEntry.actual = nextState), advanceMotion(stateEntry, now()), !nextState.available)) {
      ((stateEntry.motion = null),
        (stateEntry.intent = null),
        (stateEntry.draft = null),
        (stateEntry.bladeHold = null),
        (stateEntry.railUnconfirmed = !!nextState.dream),
        savePresentation(syncedEntityId, stateEntry));
      return;
    }


    if (
      stateEntry.estimated &&
      !stateEntry.intent &&
      !stateEntry.motion &&
      nextState.position !== null &&
      Math.abs(nextState.position - stateEntry.position) > 0.01
    ) {
      ((stateEntry.position = nextState.position),
        (stateEntry.estimated = false),
        (stateEntry.railUnconfirmed = false),
        (stateEntry.lastAvailable = nextState),

        clearPresentation(syncedEntityId));
      return;
    }
    if (((stateEntry.lastAvailable = nextState), stateEntry.bladeHold !== null)) {
      if (nextState.position !== stateEntry.bladeHold) return;
      ((stateEntry.position = nextState.position),
        (stateEntry.motion = null),
        (stateEntry.estimated = false),
        (stateEntry.bladeHold = null),
        (stateEntry.intent = null));
      return;
    }
    const intentDirection = stateEntry.intent?.direction;
    if (
      (commandPreview &&
      !nextState.dream &&
      nextState.axis !== "blade" &&
      stateEntry.intent?.target !== null &&
      ((intentDirection > 0 && nextState.opening) || (intentDirection < 0 && nextState.closing)) &&
      nextState.position !== null &&
      stateEntry.position !== null &&
      (nextState.position - stateEntry.position) * intentDirection < 0
        ? (stateEntry.estimated = true)
        : (isPositionChanged ||
            (stateEntry.estimated &&
              nextState.axis === "blade" &&
              !stateEntry.intent &&
              readLastUpdated(nextState) > readLastUpdated(previousState)) ||
            (isStateChanged && !nextState.moving)) &&
          ((stateEntry.estimated = false), retargetMotion(stateEntry, nextState.position)),
      lastAvailableChanged &&
        nextState.overallFeedbackAvailable !== false &&
        ((stateEntry.railUnconfirmed = false), stateEntry.intent))
    ) {
      const reachedIntentTarget =
        nextState.position !== null && nextState.position === stateEntry.intent.target;
      (!nextState.moving &&
        (reachedIntentTarget ||
          stateEntry.intent.service === "stop_cover" ||
          stateEntry.intent.confirmed)) ||
      (isPositionChanged && !nextState.moving)
        ? (stateEntry.intent = null)
        : nextState.moving &&
          ((stateEntry.intent.confirmed = true), (stateEntry.intent.expires = Infinity));
    }
  }
  function begin(command, token, { defer: defer = false } = {}) {
    const commandEntry = feedbackByEntityId.get(command.entityId);
    if (!commandEntry) return;
    (advanceMotion(commandEntry, now()), (commandEntry.error = ""), (commandEntry.token = token));
    const draftPosition = commandEntry.draft;
    ((commandEntry.draft = null), (commandEntry.bladeHold = null));
    const intentTarget =
        command.service === "open_cover"
          ? 100
          : command.service === "close_cover"
            ? 0
            : command.service === "stop_cover"
              ? null
              : command.data.position,
      commandDirection =
        command.service === "open_cover"
          ? 1
          : command.service === "close_cover"
            ? -1
            : intentTarget === null
              ? 0
              : Math.sign(
                  intentTarget -
                    (commandEntry.position ?? commandEntry.actual.position ?? intentTarget),
                );
    (commandPreview &&
      command.service === "set_cover_position" &&
      draftPosition !== null &&
      draftPosition === intentTarget &&
      ((commandEntry.position = draftPosition),
      (commandEntry.motion = null),
      (commandEntry.estimated = true),
      commandEntry.actual.axis === "blade" && (commandEntry.bladeHold = intentTarget)),
      (command.service === "stop_cover" || defer) && (commandEntry.motion = null),
      (commandEntry.intent = {
        service: command.service,
        target: intentTarget,
        direction: commandDirection,
        confirmed: false,
        expires: now() + 15000,
      }),
      commandPreview && !defer && intentTarget !== null && startPreview(command.entityId, token),
      commandEntry.actual.dream &&
        ["open_cover", "close_cover", "stop_cover"].includes(command.service) &&
        (commandEntry.railUnconfirmed =
          commandEntry.railUnconfirmed ||
          command.service === "open_cover" ||
          !commandEntry.actual.closedConfirmed),
      savePresentation(command.entityId, commandEntry));
  }
  function startPreview(previewEntityId, previewToken) {
    const previewEntry = feedbackByEntityId.get(previewEntityId);
    if (
      !commandPreview ||
      !previewEntry?.intent ||
      previewEntry.token !== previewToken ||
      previewEntry.intent.target === null
    )
      return false;
    advanceMotion(previewEntry, now());
    const startPosition = previewEntry.position ?? 0,
      previewTargetPosition = previewEntry.intent.target;
    return (
      (previewEntry.position = startPosition),
      (previewEntry.estimated =
        startPosition !== previewTargetPosition ||
        previewEntry.actual.position !== previewTargetPosition ||
        previewEntry.railUnconfirmed),
      (previewEntry.motion =
        startPosition === previewTargetPosition
          ? null
          : {
              from: startPosition,
              to: previewTargetPosition,
              start: now(),
              duration: Math.max(
                180,
                (Math.abs(previewTargetPosition - startPosition) / 100) * travelTime,
              ),
            }),
      savePresentation(previewEntityId, previewEntry),
      true
    );
  }
  function fail(failedEntityId, failedToken, message) {
    const failedEntry = feedbackByEntityId.get(failedEntityId);
    return !failedEntry || failedEntry.token !== failedToken
      ? false
      : (advanceMotion(failedEntry, now()),
        (failedEntry.motion = null),
        (failedEntry.intent = null),
        (failedEntry.draft = null),
        (failedEntry.bladeHold = null),
        (failedEntry.error = message),
        failedEntry.actual.position !== null &&
          ((failedEntry.position = failedEntry.actual.position), (failedEntry.estimated = false)),
        clearPresentation(failedEntityId),
        true);
  }
  function read(readEntityId, fallbackState) {
    const snapshotEntry = feedbackByEntityId.get(readEntityId);
    if (!snapshotEntry) return fallbackState;
    const hasMotionEstimate = !!(commandPreview && snapshotEntry.motion),
      opening = hasMotionEstimate
        ? snapshotEntry.motion.to > snapshotEntry.motion.from
        : snapshotEntry.actual.opening,
      closing = hasMotionEstimate
        ? snapshotEntry.motion.to < snapshotEntry.motion.from
        : snapshotEntry.actual.closing;
    return {
      ...snapshotEntry.actual,
      position: (commandPreview ? snapshotEntry.draft : null) ?? snapshotEntry.position,
      estimated: snapshotEntry.estimated,
      dragging: !!(commandPreview && snapshotEntry.draft !== null),
      state: hasMotionEstimate ? (opening ? "opening" : "closing") : snapshotEntry.actual.state,
      opening: opening,
      closing: closing,
      moving: opening || closing,
      on:
        snapshotEntry.actual.available &&
        (shouldPersist(snapshotEntry) && snapshotEntry.estimated
          ? snapshotEntry.position > 0
          : snapshotEntry.actual.on),
      closedConfirmed: !!(
        snapshotEntry.actual.closedConfirmed &&
        !snapshotEntry.railUnconfirmed &&
        !snapshotEntry.motion &&
        !snapshotEntry.estimated
      ),
      awaitingArrival: snapshotEntry.railUnconfirmed,
      targetPosition: snapshotEntry.draft ?? snapshotEntry.intent?.target ?? null,
      pendingService: snapshotEntry.intent?.service || "",
      preview: !!snapshotEntry.intent,
      error: snapshotEntry.error,
    };
  }
  function tick(nowMs = now()) {
    let hasChanged = false;
    for (const tickEntry of feedbackByEntityId.values())
      (tickEntry.intent?.expires <= nowMs &&
        ((tickEntry.intent = null),
        (hasChanged = true),
        tickEntry.actual.axis === "blade" &&
          ((tickEntry.motion = null),
          (tickEntry.position = tickEntry.actual.position),
          (tickEntry.estimated = false),
          (tickEntry.bladeHold = null))),
        (hasChanged = advanceMotion(tickEntry, nowMs) || hasChanged));
    return hasChanged;
  }
  function nextDelay(currentTimeMs = now()) {
    let delayMs = Infinity;
    for (const delayEntry of feedbackByEntityId.values())
      delayMs = Math.min(
        delayMs,
        delayEntry.motion ? 1000 / 30 : Infinity,
        delayEntry.intent ? Math.max(0, delayEntry.intent.expires - currentTimeMs) : Infinity,
      );
    return delayMs;
  }
  function retain(entityIds) {
    const retainedEntityIdSet = new Set(entityIds);
    for (const staleEntityId of feedbackByEntityId.keys())
      retainedEntityIdSet.has(staleEntityId) || feedbackByEntityId.delete(staleEntityId);
  }
  function preview(draftEntityId, position) {
    const draftEntry = feedbackByEntityId.get(draftEntityId);
    draftEntry &&
      (draftEntry.draft = Number.isFinite(position) ? Math.max(0, Math.min(100, position)) : null);
  }
  return {
    sync: sync,
    begin: begin,
    startPreview: startPreview,
    fail: fail,
    read: read,
    tick: tick,
    nextDelay: nextDelay,
    retain: retain,
    preview: preview,
    clear: () => feedbackByEntityId.clear(),
  };
}
