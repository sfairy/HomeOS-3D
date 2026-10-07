export function createLightStream({
  onStates: onStates = () => {},
  onPatch: onPatch = null,
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
    heartbeatTimerId: any = null;
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
    ((statesByEntityId = new Map()), (hasSnapshot = false), emitStates());
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
    } catch {}
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
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        (isStreamActive = false),
        closeActiveSocket(),
        (subscribedEntityIds = []),
        subscribedEntityIdSet.clear(),
        statesByEntityId.clear());
    },
  };
}
