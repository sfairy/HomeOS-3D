export function createCoverFeedback({
  now: now = () => performance.now(),
  smoothingTime: smoothingTime = 180,
  commandPreview: commandPreview = false,
  travelTime: travelTime = 6000,
  storage: storage,
  scope: scope,
  wallNow: wallNow = () => Date.now(),
  /**
   * 瞬态停滞判定窗口（ms）：设备报 opening/closing 时，若位置长时间零推进、又没有在途的乐观动画，
   * 就认定这一轮瞬态是「卡在状态上没回收」而不是真的在走，把它降级为 unknown（界面回落「在线」）。
   * 取 120s：一次完整行程通常不超过 1 分钟，正常开合绝不会被误判；实测卡死一次持续了 37 分钟，
   * 两分钟后回落「在线」对用户来说仍然及时。
   */
  stallTimeout: stallTimeoutMs = 120000,
}: {
  now?: () => number;
  smoothingTime?: number;
  commandPreview?: boolean;
  travelTime?: number;
  storage?: Storage;
  scope?: string;
  wallNow?: () => number;
  stallTimeout?: number;
} = {}) {
  const feedbackByEntityId = new Map(),
    readLastUpdated = (state: any) => Date.parse(state.raw?.last_updated ?? state.raw?.updatedAt ?? ""),
    storageKeyFor = (entityId: any) =>
      scope ? "hb-cover-presentation:v1:" + scope + ":" + entityId : null,
    shouldPersist = (entry: any) =>
      commandPreview && entry.actual.dream && entry.actual.overallFeedbackAvailable === false;
  function clearPresentation(clearedEntityId: any) {
    try {
      const storageKey = storageKeyFor(clearedEntityId);
      storageKey && storage?.removeItem(storageKey);
    } catch {}
  }
  function savePresentation(savedEntityId: any, savedEntry: any) {
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
  function restorePresentation(restoredEntityId: any, restoredEntry: any) {
    if (!shouldPersist(restoredEntry)) {
      clearPresentation(restoredEntityId);
      return;
    }
    // 位置本身没有可信来源时（梦幻帘拿不到叶片反馈，整体位置一律为 null），别把历史估算的
    // 陈旧位置复活到轨道上 —— 否则会摆出一个与设备真实姿态相反的开合度。
    if (restoredEntry.position === null) {
      clearPresentation(restoredEntityId);
      return;
    }
    try {
      const readStorageKey = storageKeyFor(restoredEntityId),
        stored = readStorageKey && JSON.parse(storage?.getItem(readStorageKey) || "null"),
        isValidPosition = (candidatePosition: any) =>
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
  function trackProgress(trackedEntry: any, nextActual: any) {
    if (!nextActual.moving) {
      ((trackedEntry.progressAt = null), (trackedEntry.progressPosition = null), (trackedEntry.stalled = false));
      return;
    }
    // 没有位置轴的设备拿不到「推进」证据，不能据此判停滞：此时宁可继续相信设备报的瞬态。
    if (nextActual.position === null || nextActual.position === undefined) {
      ((trackedEntry.progressAt = now()), (trackedEntry.progressPosition = null), (trackedEntry.stalled = false));
      return;
    }
    // 只有「位置真的变了」才算推进。这台电机跑起来会在 closing↔opening 之间反复横跳，
    // 拿状态变化当推进信号会把看门狗永久清零，卡死也就永远发现不了。
    (trackedEntry.progressPosition === null ||
      trackedEntry.progressPosition !== nextActual.position) &&
      ((trackedEntry.progressAt = now()), (trackedEntry.progressPosition = nextActual.position));
  }
  function refreshStall(trackedEntry: any, timeMs: any) {
    // 有在途乐观动画时不算停滞：那段时间的位移是本地预览在跑，设备本来就还没回报。
    const nextStalled = !!(
      trackedEntry.actual?.moving &&
      !trackedEntry.motion &&
      trackedEntry.progressAt !== null &&
      trackedEntry.progressPosition !== null &&
      timeMs - trackedEntry.progressAt > stallTimeoutMs
    );
    if (nextStalled === trackedEntry.stalled) return false;
    trackedEntry.stalled = nextStalled;
    // 判停就等于承认这一轮指令没有真的在走：顺手释放挂着的预览意图，
    // 免得卡片一直按「有在途指令」显示忙碌/目标值。
    nextStalled && (trackedEntry.intent = null);
    return true;
  }
  function advanceMotion(trackedEntry: any, timeMs: any) {
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
  function retargetMotion(retargetedEntry: any, targetPosition: any) {
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
  function sync(syncedEntityId: any, nextState: any) {
    let stateEntry = feedbackByEntityId.get(syncedEntityId);
    if (!stateEntry) {
      ((stateEntry = {
        actual: nextState,
        position: nextState.position,
        motion: null as any,
        intent: null as any,
        token: null as any,
        error: "",
        draft: null as any,
        bladeHold: null as any,
        railUnconfirmed: false,
        estimated: false,
        lastAvailable: nextState.available ? nextState : null,
        lastTimestamp: readLastUpdated(nextState),
        progressAt: null as any,
        progressPosition: null as any,
        stalled: false,
      }),
        restorePresentation(syncedEntityId, stateEntry),
        // 首次见到就用这一帧武装停滞计时：否则设备只在进入 opening/closing 时发一条、
        // 之后长时间沉默的话，计时器永远不启动，卡死也就永远发现不了。
        trackProgress(stateEntry, nextState),
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
    trackProgress(stateEntry, nextState);
    if (((stateEntry.actual = nextState), advanceMotion(stateEntry, now()), !nextState.available)) {
      ((stateEntry.motion = null),
        (stateEntry.intent = null),
        (stateEntry.draft = null),
        (stateEntry.bladeHold = null),
        (stateEntry.railUnconfirmed = !!nextState.dream),
        savePresentation(syncedEntityId, stateEntry));
      return;
    }
    refreshStall(stateEntry, now());


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
  function begin(command: any, token: any, { defer: defer = false } = {}) {
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
  function startPreview(previewEntityId: any, previewToken: any) {
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
  function fail(failedEntityId: any, failedToken: any, message: any) {
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
  function read(readEntityId: any, fallbackState: any) {
    const snapshotEntry = feedbackByEntityId.get(readEntityId);
    if (!snapshotEntry) return fallbackState;
    // 停滞（卡在 opening/closing 且位置零推进）时不假装在动，也不谎报终态：整轮降级为 unknown，
    // 由卡片回落「在线」。位置仍按设备最后一次上报值展示，不摆出一个假的端点姿态。
    const isStalled = !!snapshotEntry.stalled && !snapshotEntry.motion,
      // 方向以设备为准，其次才轮到本地预览动画：
      //   1) 设备自己在报 opening/closing → 直接用它的方向。本地预览为了对齐设备上报位置会做一次
      //      反向微调（开启途中预览跑到 54、设备报 50，回补动画是 54→50 的下降），若按动画方向判，
      //      卡片会在「整体正在开启」上闪一下「整体正在关闭」。
      //   2) 设备已报出终态（open/closed）→ 位置可能还在收尾对齐，但「正在开启/关闭」已经不成立，
      //      标签立刻采信设备终态，只有位置继续动画。
      //   3) 设备沉默（还没回报）→ 才用本地预览动画的方向。
      deviceMoving = !isStalled && (!!snapshotEntry.actual.opening || !!snapshotEntry.actual.closing),
      deviceSettled =
        !isStalled &&
        (snapshotEntry.actual.state === "open" || snapshotEntry.actual.state === "closed"),
      hasMotionEstimate = !!(commandPreview && snapshotEntry.motion),
      motionOpening = hasMotionEstimate ? snapshotEntry.motion.to > snapshotEntry.motion.from : false,
      // 设备已报终态时一般以设备为准（见 2），但用户刚下发的指令还没被设备确认时例外：
      // 否则点了「关闭」的那一瞬间卡片仍显示「整体已开启」，要等设备回报道 closing 才变，
      // 看起来像没反应。
      useMotionDirection =
        hasMotionEstimate && !deviceMoving && (!deviceSettled || !!snapshotEntry.intent),
      opening = isStalled
        ? false
        : deviceMoving
          ? !!snapshotEntry.actual.opening
          : useMotionDirection && motionOpening,
      closing = isStalled
        ? false
        : deviceMoving
          ? !!snapshotEntry.actual.closing
          : useMotionDirection && !motionOpening;
    return {
      ...snapshotEntry.actual,
      position: (commandPreview ? snapshotEntry.draft : null) ?? snapshotEntry.position,
      estimated: snapshotEntry.estimated,
      dragging: !!(commandPreview && snapshotEntry.draft !== null),
      state: isStalled ? "unknown" : opening ? "opening" : closing ? "closing" : snapshotEntry.actual.state,
      opening: opening,
      closing: closing,
      moving: opening || closing,
      stalled: isStalled,
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
      (refreshStall(tickEntry, nowMs) && (hasChanged = true),
        tickEntry.intent?.expires <= nowMs &&
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
    for (const delayEntry of feedbackByEntityId.values()) {
      // 停滞是「时间到了才成立」的判断，设备一沉默就再没有 sync 把界面推醒；
      // 这里主动排一次唤醒，保证卡死到点后弹窗能回落「在线」。
      const stallDelay =
        delayEntry.actual?.moving &&
        !delayEntry.stalled &&
        delayEntry.progressAt !== null &&
        delayEntry.progressPosition !== null
          ? Math.max(0, delayEntry.progressAt + stallTimeoutMs - currentTimeMs)
          : Infinity;
      delayMs = Math.min(
        delayMs,
        delayEntry.motion ? 0 : Infinity,
        delayEntry.intent ? Math.max(0, delayEntry.intent.expires - currentTimeMs) : Infinity,
        stallDelay,
      );
    }
    return delayMs;
  }
  function retain(entityIds: any) {
    const retainedEntityIdSet = new Set(entityIds);
    for (const staleEntityId of feedbackByEntityId.keys())
      retainedEntityIdSet.has(staleEntityId) || feedbackByEntityId.delete(staleEntityId);
  }
  function preview(draftEntityId: any, position: any) {
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
