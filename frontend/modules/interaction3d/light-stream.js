/**
 * 灯光 / 实体状态的 WebSocket 流式订阅。
 *
 * 在 3D 子系统里的位置：3D 场景里的灯具、窗帘、电视等状态量变化频繁，走 HTTP
 * 轮询代价高，这里改成长连接：连上后先收一份全量快照，之后只收增量变更。
 *
 * 对外提供：createLightStream —— 返回 configure / setActive / dispose 三个方法。
 *
 * 与后端的协议约定（/api/v1/ws/runtime）：
 * - 客户端 → 服务端：{ type: "subscribe", entityIds: [...] }
 * - 服务端 → 客户端：{ type: "snapshot", states: [...] }（全量）
 *                    { type: "state_changed", entityId, state, attributes, ... }（单实体增量）
 *                    { type: "state_removed", entityId }（实体消失）
 *                    { type: "ping" }（保活）
 *                    { type: "resync_required" }（服务端认为客户端已漂移，需重建连接）
 * 所有回调里传出的状态都是 structuredClone 过的副本，调用方改动不会污染内部缓存。
 */
export function createLightStream({
  onStates: onStates = () => {},
  onPatch: onPatch = null,
  createSocket: createSocket = socketUrl => new window.WebSocket(socketUrl),
  socketURL: resolveSocketUrl = () => {
    // 默认地址与页面同源，按当前协议自动选 ws / wss（HTTPS 页面不能用 ws，会被浏览器拦）。
    const endpointUrl = new URL("/api/v1/ws/runtime", location.origin);
    endpointUrl.protocol = endpointUrl.protocol === "https:" ? "wss:" : "ws:";
    return endpointUrl.href;
  },
  setTimer: setTimer = (timerCallback, timerDelayMs) => setTimeout(timerCallback, timerDelayMs),
  clearTimer: clearTimer = pendingTimerId => clearTimeout(pendingTimerId)
} = {}) {
  let subscribedEntityIds = [];
  let subscribedEntityIdSet = new Set();
  let statesByEntityId = new Map();
  // 是否处于「需要保持连接」的状态，由 setActive 控制（页面不可见时会被关掉）。
  let isStreamActive = false;
  let isDisposed = false;
  // 是否已经收到过快照；没有快照前的增量消息一律丢弃。
  let hasSnapshot = false;
  let activeSocket = null;
  let removeSocketListeners = null;
  // 连接代次号：每次关连接就自增，用于判定事件是否来自「已经过期的那个 socket」。
  let connectionGeneration = 0;
  let reconnectAttempt = 0;
  let reconnectTimerId = null;
  let heartbeatTimerId = null;
  /** 构造「不可用」占位状态，用于订阅了但服务端没有该实体的场景。 */
  const unavailableState = unavailableEntityId => ({
    entityId: unavailableEntityId,
    state: "unavailable",
    available: false,
    attributes: {}
  });
  // 全量广播：按订阅列表逐个取值，缺的用「不可用」占位，保证调用方拿到的键集合稳定。
  // 尚未收到快照时返回空对象 —— 避免连接刚建立就被误判成「所有设备都掉线」。
  const emitStates = () =>
    onStates(
      hasSnapshot
        ? Object.fromEntries(
            subscribedEntityIds.map(clonedEntityId => [
              clonedEntityId,
              structuredClone(
                statesByEntityId.get(clonedEntityId) || unavailableState(clonedEntityId)
              )
            ])
          )
        : {}
    );
  // 增量广播：有 onPatch 时只推变化的那个实体（避免每次都重建整张状态表），
  // 否则退化成一次全量广播，保证调用方逻辑仍然正确。
  const emitPatch = patchedEntityId =>
    typeof onPatch == "function"
      ? onPatch({
          [patchedEntityId]: structuredClone(
            statesByEntityId.get(patchedEntityId) || unavailableState(patchedEntityId)
          )
        })
      : emitStates();
  /** 清空本地状态并广播一次空结果（断线时用）。 */
  function resetStates() {
    statesByEntityId = new Map();
    hasSnapshot = false;
    emitStates();
  }
  /** 清掉重连与心跳两个定时器。 */
  function clearTimers() {
    if (reconnectTimerId !== null) {
      clearTimer(reconnectTimerId);
    }
    if (heartbeatTimerId !== null) {
      clearTimer(heartbeatTimerId);
    }
    reconnectTimerId = heartbeatTimerId = null;
  }
  /** 主动关闭当前连接：作废代次、摘掉监听、关闭 socket，但保留订阅列表。 */
  function closeActiveSocket() {
    connectionGeneration += 1;
    clearTimers();
    const socketToClose = activeSocket;
    activeSocket = null;
    removeSocketListeners?.();
    removeSocketListeners = null;
    try {
      // close 在连接尚未建立完成时可能抛错（部分浏览器），这里忽略即可。
      socketToClose?.close();
    } catch {}
  }
  /**
   * 安排一次重连（指数退避）。
   *
   * 退避序列：500ms、1s、2s、4s、8s、16s→封顶 15s；
   * 已销毁、未激活、没有订阅或无重连在途时都不排新定时器。
   */
  function scheduleReconnect() {
    if (isDisposed || !isStreamActive || !subscribedEntityIds.length || reconnectTimerId !== null) {
      return;
    }
    const reconnectDelayMs = Math.min(15000, 2 ** Math.min(reconnectAttempt++, 5) * 500);
    reconnectTimerId = setTimer(() => {
      reconnectTimerId = null;
      openSocket();
    }, reconnectDelayMs);
  }
  /** 建立连接并注册全部事件处理。 */
  function openSocket() {
    if (isDisposed || !isStreamActive || !subscribedEntityIds.length || activeSocket) {
      return;
    }
    const socketGeneration = ++connectionGeneration;
    let nextSocket;
    try {
      nextSocket = createSocket(
        typeof resolveSocketUrl == "function" ? resolveSocketUrl() : resolveSocketUrl
      );
    } catch {
      // 构造就失败（地址非法 / 浏览器禁用 WebSocket）：按普通断线处理，走重连。
      resetStates();
      scheduleReconnect();
      return;
    }
    activeSocket = nextSocket;
    // 所有事件都先过这道判断：只有「仍然有效的那一个 socket」的事件才处理，
    // 否则会出现旧连接关闭时把新连接的状态清掉的竞态。
    const isCurrentSocket = () =>
      !isDisposed &&
      isStreamActive &&
      socketGeneration === connectionGeneration &&
      activeSocket === nextSocket;
    /**
     * 统一的断线处理。
     *
     * @param {number} [closeCode=0] WebSocket 关闭码；4400/4401/4403 属于协议层拒绝
     *        （报文非法 / 未认证 / 无权限），重连也没用，因此不再重试。
     */
    const handleSocketFailure = (closeCode = 0) => {
      if (isCurrentSocket()) {
        closeActiveSocket();
        resetStates();
        if (![4400, 4401, 4403].includes(closeCode)) {
          scheduleReconnect();
        }
      }
    };
    /**
     * 重置心跳超时定时器。
     */
    function scheduleHeartbeatTimeout(heartbeatTimeoutMs) {
      if (heartbeatTimerId !== null) {
        clearTimer(heartbeatTimerId);
      }
      heartbeatTimerId = setTimer(() => handleSocketFailure(), heartbeatTimeoutMs);
    }
    const socketHandlers = {
      open() {
        if (isCurrentSocket()) {
          try {
            nextSocket.send(
              JSON.stringify({
                type: "subscribe",
                entityIds: subscribedEntityIds
              })
            );
          } catch {
            // 发送失败说明连接已不可用，直接按断线处理。
            handleSocketFailure();
          }
        }
      },
      message(messageEvent) {
        if (!isCurrentSocket()) {
          return;
        }
        let messagePayload;
        try {
          messagePayload = JSON.parse(messageEvent.data);
        } catch {
          // 非 JSON 报文（例如被中间代理插入的心跳文本）直接忽略，不影响连接。
          return;
        }
        if (!!messagePayload && typeof messagePayload == "object") {
          if (messagePayload.type === "resync_required") {
            // 服务端判定客户端状态已不可信：重建连接并重新拿快照，而不是尝试局部修补。
            closeActiveSocket();
            resetStates();
            openSocket();
            return;
          }
          if (messagePayload.type === "snapshot" && Array.isArray(messagePayload.states)) {
            const snapshotStates = new Map();
            for (const snapshotState of messagePayload.states) {
              // 快照里可能带未订阅或字段残缺的条目，逐条过滤后才建表。
              if (
                subscribedEntityIdSet.has(snapshotState?.entityId) &&
                typeof snapshotState.state == "string"
              ) {
                snapshotStates.set(snapshotState.entityId, structuredClone(snapshotState));
              }
            }
            statesByEntityId = snapshotStates;
            hasSnapshot = true;
            // 收到快照即视为连接健康，重置退避计数，下次断线从头开始退避。
            reconnectAttempt = 0;
            scheduleHeartbeatTimeout(65000);
            emitStates();
          } else if (
            hasSnapshot &&
            messagePayload.type === "state_changed" &&
            subscribedEntityIdSet.has(messagePayload.entityId) &&
            typeof messagePayload.state == "string"
          ) {
            // hasSnapshot 是硬性前置：没有基线时应用增量会让状态莫名其妙地缺字段。
            statesByEntityId.set(messagePayload.entityId, structuredClone(messagePayload));
            scheduleHeartbeatTimeout(65000);
            emitPatch(messagePayload.entityId);
          } else if (
            hasSnapshot &&
            messagePayload.type === "state_removed" &&
            subscribedEntityIdSet.has(messagePayload.entityId)
          ) {
            statesByEntityId.delete(messagePayload.entityId);
            scheduleHeartbeatTimeout(65000);
            emitPatch(messagePayload.entityId);
          } else if (hasSnapshot && messagePayload.type === "ping") {
            scheduleHeartbeatTimeout(65000);
          }
        }
      },
      close(closeEvent) {
        handleSocketFailure(closeEvent.code);
      },
      error() {
        // error 事件的 close 码无从获取，按 0 处理（即可重连）。
        handleSocketFailure();
      }
    };
    for (const [addedHandlerName, addedHandler] of Object.entries(socketHandlers)) {
      nextSocket.addEventListener(addedHandlerName, addedHandler);
    }
    removeSocketListeners = () => {
      for (const [removedHandlerName, removedHandler] of Object.entries(socketHandlers)) {
        nextSocket.removeEventListener(removedHandlerName, removedHandler);
      }
    };
    // 首帧心跳给 12 秒（比稳态的 65 秒短得多）：握手阶段若迟迟收不到快照，
    // 说明连接实际上没有建立成功，尽早放弃并重连比干等 65 秒体验更好。
    scheduleHeartbeatTimeout(12000);
  }
  return {
    /**
     * 设置订阅的实体列表。
     *
     * @param {string[]} [options.additionalEntityIds=[]] 白名单外的补充实体；
     *        只校验 ID 形态，允许订阅本列表未覆盖的域。
     */
    configure(entityIds = [], { additionalEntityIds: additionalEntityIds = [] } = {}) {
      if (isDisposed) {
        return;
      }
      // 补充实体只放宽「域」的限制，格式仍必须是标准实体 ID。
      const additionalEntityIdSet = new Set(
        additionalEntityIds.filter(
          additionalCandidateId =>
            typeof additionalCandidateId == "string" &&
            /^[a-z_]+\.[a-z0-9_]+$/.test(additionalCandidateId)
        )
      );
      // 主白名单限定 3D 场景真正会用到的域，防止把整个 HA 的状态都拉下来。
      const nextSubscribedEntityIds = [
        ...new Set(
          entityIds.filter(
            candidateEntityId =>
              typeof candidateEntityId == "string" &&
              (additionalEntityIdSet.has(candidateEntityId) ||
                /^(light|switch|climate|cover|binary_sensor|event|input_boolean|sensor|media_player|vacuum|camera|image|script|button)\.[a-z0-9_]+$/.test(
                  candidateEntityId
                ))
          )
        )
      ].sort();
      // 排序后再比较：调用方给的顺序无关紧要，只有集合真的变了才需要重订。
      if (
        nextSubscribedEntityIds.length !== subscribedEntityIds.length ||
        !nextSubscribedEntityIds.every(
          (sortedEntityId, entityIdIndex) => sortedEntityId === subscribedEntityIds[entityIdIndex]
        )
      ) {
        // 订阅集合变化必须换连接：服务端只按订阅报文推送，重建比增量增删订阅更简单可靠。
        closeActiveSocket();
        subscribedEntityIds = nextSubscribedEntityIds;
        subscribedEntityIdSet = new Set(subscribedEntityIds);
        reconnectAttempt = 0;
        resetStates();
        openSocket();
      }
    },
    /**
     * 开关长连接（例如页面切到后台时关闭以省电）。
     */
    setActive(isActiveNext) {
      if (!isDisposed && isStreamActive !== (isActiveNext === true)) {
        isStreamActive = isActiveNext === true;
        reconnectAttempt = 0;
        if (isStreamActive) {
          openSocket();
        } else {
          closeActiveSocket();
          resetStates();
        }
      }
    },
    dispose() {
      if (!isDisposed) {
        isDisposed = true;
        isStreamActive = false;
        closeActiveSocket();
        subscribedEntityIds = [];
        subscribedEntityIdSet.clear();
        statesByEntityId.clear();
      }
    }
  };
}
