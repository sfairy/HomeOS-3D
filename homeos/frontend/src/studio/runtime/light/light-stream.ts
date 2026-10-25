export function createLightStream({
  onStates: onStates = () => {},
  onPatch: onPatch = null,
  onInvalidate: onInvalidate = () => {},
  createSocket: createSocket = (socketUrl) => new window.WebSocket(socketUrl),
  socketURL: resolveSocketUrl = () => {
    const endpointUrl = new URL("/api/v1/ws/runtime", location.origin);
    return (
      (endpointUrl.protocol = endpointUrl.protocol === "https:" ? "wss:" : "ws:"),
      endpointUrl.href
    );
  },
  setTimer: setTimer = (timerCallback, timerDelayMs) => setTimeout(timerCallback, timerDelayMs),
  clearTimer: clearTimer = (pendingTimerId) => clearTimeout(pendingTimerId),
}: {
  onStates?: (states: Record<string, any>) => void;
  onPatch?: ((patch: Record<string, any>) => void) | null;
  /** 订阅态被重置（重连 / 订阅变更 / 停用 / 失败）时回调当前实体列表：舞台据此让历史失效。 */
  onInvalidate?: (entityIds: string[]) => void;
  createSocket?: (socketUrl: string) => WebSocket;
  socketURL?: string | (() => string);
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timerId: ReturnType<typeof setTimeout>) => void;
} = {}) {
  let subscribedEntityIds: any = [],
    subscribedEntityIdSet = new Set(),
    statesByEntityId = new Map(),
    isStreamActive = false,
    isDisposed = false,
    hasSnapshot = false,
    activeSocket: any = null,
    removeSocketListeners: any = null,
    connectionGeneration = 0,
    reconnectAttempt = 0,
    reconnectTimerId: any = null,
    heartbeatTimerId: any = null,
    // 冻结前是否处于激活态：bfcache 期间 visibilitychange 可能先把流 setActive(false)，
    // 回来时得按冻结前的状态恢复，而不是只看那一刻的 isStreamActive。
    wasActiveBeforePageCache = false;
  const unavailableState = (unavailableEntityId: any) => ({
      entityId: unavailableEntityId,
      state: "unavailable",
      available: false,
      attributes: {} as Record<string, any>,
    }),
    emitStates = () =>
      onStates(
        hasSnapshot
          ? Object.fromEntries(
              subscribedEntityIds.map((clonedEntityId: any) => [
                clonedEntityId,
                structuredClone(
                  statesByEntityId.get(clonedEntityId) || unavailableState(clonedEntityId),
                ),
              ]),
            )
          : {},
      ),
    emitPatch = (patchedEntityId: any) =>
      typeof onPatch == "function"
        ? onPatch({
            [patchedEntityId]: structuredClone(
              statesByEntityId.get(patchedEntityId) || unavailableState(patchedEntityId),
            ),
          })
        : emitStates();
  function resetStates() {
    // 订阅态清零 = 之前累积的历史不再可信（重连 / 订阅变更 / 停用 / 失败）。
    // 先把手上的实体列表交出去，再由舞台侧联动删除历史缓存与 reader 记忆。
    const invalidatedEntityIds = [...subscribedEntityIds];
    ((statesByEntityId = new Map()), (hasSnapshot = false), emitStates());
    invalidatedEntityIds.length && onInvalidate(invalidatedEntityIds);
  }
  function clearTimers() {
    (reconnectTimerId !== null && clearTimer(reconnectTimerId),
      heartbeatTimerId !== null && clearTimer(heartbeatTimerId),
      (reconnectTimerId = heartbeatTimerId = null));
  }
  function closeActiveSocket() {
    ((connectionGeneration += 1), clearTimers());
    const socketToClose = activeSocket;
    ((activeSocket = null), removeSocketListeners?.(), (removeSocketListeners = null));
    try {
      socketToClose?.close();
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
  }
  function scheduleReconnect() {
    if (isDisposed || !isStreamActive || !subscribedEntityIds.length || reconnectTimerId !== null)
      return;
    const reconnectDelayMs = Math.min(15000, 500 * 2 ** Math.min(reconnectAttempt++, 5));
    reconnectTimerId = setTimer(() => {
      ((reconnectTimerId = null), openSocket());
    }, reconnectDelayMs);
  }
  function openSocket() {
    if (isDisposed || !isStreamActive || !subscribedEntityIds.length || activeSocket) return;
    const socketGeneration = ++connectionGeneration;
    let nextSocketHandle;
    try {
      nextSocketHandle = createSocket(
        typeof resolveSocketUrl == "function" ? resolveSocketUrl() : resolveSocketUrl,
      );
    } catch {
      (resetStates(), scheduleReconnect());
      return;
    }
    activeSocket = nextSocketHandle;
    const isCurrentSocket = () =>
        !isDisposed &&
        isStreamActive &&
        socketGeneration === connectionGeneration &&
        activeSocket === nextSocketHandle,
      handleSocketFailure = (closeCode = 0) => {
        isCurrentSocket() &&
          (closeActiveSocket(),
          resetStates(),
          [4400, 4401, 4403].includes(closeCode) || scheduleReconnect());
      };
    function scheduleHeartbeatTimeout(heartbeatTimeoutMs: any) {
      (heartbeatTimerId !== null && clearTimer(heartbeatTimerId),
        (heartbeatTimerId = setTimer(() => handleSocketFailure(), heartbeatTimeoutMs)));
    }
    const socketHandlers = {
      open() {
        if (isCurrentSocket())
          try {
            nextSocketHandle.send(
              JSON.stringify({
                type: "subscribe",
                entityIds: subscribedEntityIds,
              }),
            );
          } catch {
            handleSocketFailure();
          }
      },
      message(messageEvent: any) {
        if (!isCurrentSocket()) return;
        let messagePayload;
        try {
          messagePayload = JSON.parse(messageEvent.data);
        } catch {
          return;
        }
        if (!(!messagePayload || typeof messagePayload != "object")) {
          if (messagePayload.type === "resync_required") {
            (closeActiveSocket(), resetStates(), openSocket());
            return;
          }
          if (messagePayload.type === "snapshot" && Array.isArray(messagePayload.states)) {
            const snapshotStatesByEntityId = new Map();
            for (const snapshotState of messagePayload.states)
              subscribedEntityIdSet.has(snapshotState?.entityId) &&
                typeof snapshotState.state == "string" &&
                snapshotStatesByEntityId.set(
                  snapshotState.entityId,
                  structuredClone(snapshotState),
                );
            ((statesByEntityId = snapshotStatesByEntityId),
              (hasSnapshot = true),
              (reconnectAttempt = 0),
              scheduleHeartbeatTimeout(65000),
              emitStates());
          } else
            hasSnapshot &&
            messagePayload.type === "state_changed" &&
            subscribedEntityIdSet.has(messagePayload.entityId) &&
            typeof messagePayload.state == "string"
              ? (statesByEntityId.set(messagePayload.entityId, structuredClone(messagePayload)),
                scheduleHeartbeatTimeout(65000),
                emitPatch(messagePayload.entityId))
              : hasSnapshot &&
                  messagePayload.type === "state_removed" &&
                  subscribedEntityIdSet.has(messagePayload.entityId)
                ? (statesByEntityId.delete(messagePayload.entityId),
                  scheduleHeartbeatTimeout(65000),
                  emitPatch(messagePayload.entityId))
                : hasSnapshot && messagePayload.type === "ping" && scheduleHeartbeatTimeout(65000);
        }
      },
      close(closeEvent: any) {
        handleSocketFailure(closeEvent.code);
      },
      error() {
        handleSocketFailure();
      },
    };
    for (const [addedHandlerName, addedHandler] of Object.entries(socketHandlers))
      nextSocketHandle.addEventListener(addedHandlerName, addedHandler);
    ((removeSocketListeners = () => {
      for (const [removedHandlerName, removedHandler] of Object.entries(socketHandlers))
        nextSocketHandle.removeEventListener(removedHandlerName, removedHandler);
    }),
      scheduleHeartbeatTimeout(12000));
  }
  return {
    configure(entityIds: any[] = [], { additionalEntityIds: additionalEntityIds = [] }: { additionalEntityIds?: any[] } = {}) {
      if (isDisposed) return;
      const additionalEntityIdSet = new Set(
          additionalEntityIds.filter(
            (additionalCandidateId) =>
              typeof additionalCandidateId == "string" &&
              /^[a-z_]+\.[a-z0-9_]+$/.test(additionalCandidateId),
          ),
        ),
        nextSubscribedEntityIds = [
          ...new Set(
            entityIds.filter(
              (candidateEntityId) =>
                typeof candidateEntityId == "string" &&
                (additionalEntityIdSet.has(candidateEntityId) ||
                  /^(light|switch|climate|cover|binary_sensor|event|input_boolean|sensor|media_player|vacuum|camera|image|script|button)\.[a-z0-9_]+$/.test(
                    candidateEntityId,
                  )),
            ),
          ),
        ].sort();
      (nextSubscribedEntityIds.length === subscribedEntityIds.length &&
        nextSubscribedEntityIds.every(
          (sortedEntityId, entityIdIndex) => sortedEntityId === subscribedEntityIds[entityIdIndex],
        )) ||
        (closeActiveSocket(),
        (subscribedEntityIds = nextSubscribedEntityIds),
        (subscribedEntityIdSet = new Set(subscribedEntityIds)),
        (reconnectAttempt = 0),
        resetStates(),
        openSocket());
    },
    setActive(isActiveNext: any) {
      isDisposed ||
        isStreamActive === (isActiveNext === true) ||
        ((isStreamActive = isActiveNext === true),
        (reconnectAttempt = 0),
        isStreamActive ? openSocket() : (closeActiveSocket(), resetStates()));
    },
    /**
     * 进入 bfcache 前主动断开。
     *
     * 与 `setActive(false)` 的差别是**保留**订阅列表与已收到的状态：页面只是被冻结，
     * 既没有换页也没有改订阅，回来时应当先按旧值渲染再被新快照覆盖 —— 清空状态会让墙屏
     * 在「后退回来」的瞬间闪一遍空数据。
     *
     * 必须主动关：浏览器冻结文档时会自己切断 WebSocket，但那时 `close` 回调与心跳定时器
     * 都已停摆，`scheduleReconnect` 一次都不会跑，只能等恢复后的心跳超时（65s）。
     */
    suspend() {
      if (isDisposed) return;
      wasActiveBeforePageCache = wasActiveBeforePageCache || isStreamActive;
      closeActiveSocket();
    },
    /**
     * 从 bfcache 恢复后立刻重连。
     *
     * 不能只依赖心跳超时：那意味着最长 65s 的旧值。这里先把退避计数清零再开连，
     * 避免沿用冻结前攒下的失败次数而多等几轮。
     *
     * 冻结期间 `visibilitychange` 可能已经把流 `setActive(false)` 掉，所以按
     * `wasActiveBeforePageCache` 恢复激活态，而不是只看此刻的 `isStreamActive` ——
     * 否则「后台进 bfcache → 后退回来」会得到一个再也不重连的舞台。
     */
    resume() {
      if (isDisposed) return;
      const shouldRestore = wasActiveBeforePageCache;
      wasActiveBeforePageCache = false;
      if (!shouldRestore || !subscribedEntityIds.length) return;
      isStreamActive = true;
      activeSocket || ((reconnectAttempt = 0), openSocket());
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        (isStreamActive = false),
        (wasActiveBeforePageCache = false),
        closeActiveSocket(),
        (subscribedEntityIds = []),
        subscribedEntityIdSet.clear(),
        statesByEntityId.clear());
    },
  };
}
