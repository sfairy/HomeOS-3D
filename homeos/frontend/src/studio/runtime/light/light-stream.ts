/**
 * 灯光/实体状态的运行时长连接（上游 `light-stream.js`，0.8.1 重写为「两槽交接」）。
 *
 * ## 为什么是两槽
 *
 * 0.8.0 的实现只有一个 socket：订阅列表一变、收到 `resync_required`、或者连接抖动一次，
 * 都会「先清空状态再重连」。舞台侧看到的是同一帧里所有实体先变成 unavailable，几百毫秒后
 * 才恢复 —— 大户型上表现为墙屏整片闪白。
 *
 * 0.8.1 改成两个槽位：
 *
 * - `active`：正在供数的连接，订阅的是**旧**实体集合；
 * - `pending`：按**新**实体集合刚建起来的连接。
 *
 * 新连接收到 `snapshot` 之后才晋升为 active、旧连接随即退役。切换过程中旧值一直在
 * `active` 里，所以订阅变更 / 重同步都不会出现空窗。
 *
 * ## 失败语义（与上游逐条对齐）
 *
 * - `4400 / 4401 / 4403`：鉴权类关闭码，不重试，直接整体失效并通知 `onInvalidate`；
 * - 其它关闭 / 心跳超时：失效**该槽服务过的那批实体**（让历史缓存跟着失效），然后按指数退避重连；
 * - `resync_required`：走一次普通失败（会失效），随后立刻新建 pending，不等待退避。
 */

/** 单条连接的槽位。`stateById` 在 socket 关闭后仍然保留，用于交接期继续供数。 */
interface StreamSlot {
  /** 建槽时冻结的订阅集合；活跃槽不会跟着订阅变更重新订阅。 */
  ids: string[];
  stateById: Map<string, any>;
  /** 收到过完整 snapshot 才为 true；未 ready 的槽不参与供数。 */
  ready: boolean;
  /** socket 已关闭 / 已被退役。 */
  closed: boolean;
  closeSocket: () => void;
}

export interface LightStreamOptions {
  onStates?: (states: Record<string, any>) => void;
  onPatch?: ((patch: Record<string, any>) => void) | null;
  /** 订阅态被重置（鉴权失败 / 连接失败 / 重同步）时回调：舞台据此让历史失效。 */
  onInvalidate?: (entityIds: string[]) => void;
  createSocket?: (socketUrl: string) => WebSocket;
  socketURL?: string | (() => string);
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timerId: ReturnType<typeof setTimeout>) => void;
}

/** 鉴权类关闭码：重连没有意义，直接整体失效。 */
const TERMINAL_CLOSE_CODES = [4400, 4401, 4403];
/** 首帧超时：这么久还没收到 snapshot 就换一条连接。 */
const FIRST_RESPONSE_TIMEOUT_MS = 12000;
/** 稳态心跳超时：服务端每 15s 左右会推 ping，65s 没有任何消息即视为断链。 */
const HEARTBEAT_TIMEOUT_MS = 65000;

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
}: LightStreamOptions = {}) {
  let wantedEntityIds: string[] = [],
    wantedEntityIdSet = new Set<string>(),
    activeSlot: StreamSlot | null = null,
    pendingSlot: StreamSlot | null = null,
    isStreamActive = false,
    isDisposed = false,
    reconnectAttempt = 0,
    reconnectTimerId: any = null,
    // 冻结前是否处于激活态：bfcache 期间 visibilitychange 可能先把流 setActive(false)，
    // 回来时得按冻结前的状态恢复，而不是只看那一刻的 isStreamActive。
    wasActiveBeforePageCache = false;

  const unavailableState = (unavailableEntityId: string) => ({
    entityId: unavailableEntityId,
    state: "unavailable",
    available: false,
    attributes: {} as Record<string, any>,
  });

  /** 当前可用的槽（active 优先）。两个槽不会同时 ready；active 是权威。 */
  const readySlot = () => (activeSlot?.ready ? activeSlot : pendingSlot?.ready ? pendingSlot : null);

  /** 读某个实体的最新值：active 优先，交接期回落到 pending。 */
  function stateFor(entityId: string) {
    return activeSlot?.stateById.get(entityId) ?? pendingSlot?.stateById.get(entityId);
  }

  function emitStates() {
    // 一个槽都没 ready 之前不下发任何值：舞台侧据此继续显示占位，而不是一片 unavailable。
    if (!readySlot()) {
      onStates({});
      return;
    }
    onStates(
      Object.fromEntries(
        wantedEntityIds.map((wantedEntityId) => [
          wantedEntityId,
          structuredClone(stateFor(wantedEntityId) || unavailableState(wantedEntityId)),
        ]),
      ),
    );
  }

  function emitPatch(patchedEntityId: string) {
    if (typeof onPatch == "function") {
      onPatch({
        [patchedEntityId]: structuredClone(
          stateFor(patchedEntityId) || unavailableState(patchedEntityId),
        ),
      });
      return;
    }
    emitStates();
  }

  function cancelReconnect() {
    (reconnectTimerId !== null && clearTimer(reconnectTimerId), (reconnectTimerId = null));
  }

  function scheduleReconnect() {
    if (isDisposed || !isStreamActive || !wantedEntityIds.length || reconnectTimerId !== null)
      return;
    const reconnectDelayMs = Math.min(15000, 500 * 2 ** Math.min(reconnectAttempt++, 5));
    reconnectTimerId = setTimer(() => {
      ((reconnectTimerId = null), openPendingSlot());
    }, reconnectDelayMs);
  }

  /** 退役一个槽：关掉 socket，丢掉状态，不留任何定时器。 */
  function retireSlot(retiredSlot: StreamSlot | null) {
    if (!retiredSlot || retiredSlot.closed && !retiredSlot.stateById.size) return;
    retiredSlot.closeSocket();
    retiredSlot.closed = true;
    retiredSlot.stateById.clear();
  }

  /** 只关 socket、保留状态：bfcache 冻结 / 交接期需要「旧值继续供数」。 */
  function parkSlot(parkedSlot: StreamSlot | null) {
    if (!parkedSlot) return;
    parkedSlot.closeSocket();
    parkedSlot.closed = true;
  }

  function disposeAllSlots({ notify }: { notify: boolean } = { notify: true }) {
    const invalidatedEntityIds = [...wantedEntityIds];
    (cancelReconnect(),
      (pendingSlot !== null && (retireSlot(pendingSlot), (pendingSlot = null))),
      (activeSlot !== null && (retireSlot(activeSlot), (activeSlot = null))));
    notify && invalidatedEntityIds.length && onInvalidate(invalidatedEntityIds);
  }

  /** 按当前 `wantedEntityIds` 新建一条 pending 连接。 */
  function openPendingSlot() {
    if (isDisposed || !isStreamActive || !wantedEntityIds.length || pendingSlot) return;
    let nextSocket: WebSocket;
    try {
      nextSocket = createSocket(
        typeof resolveSocketUrl == "function" ? resolveSocketUrl() : resolveSocketUrl,
      );
    } catch {
      scheduleReconnect();
      return;
    }
    const slot: StreamSlot = {
      ids: [...wantedEntityIds],
      stateById: new Map(),
      ready: false,
      closed: false,
      closeSocket: () => {},
    };
    pendingSlot = slot;
    // 每个槽只管自己的心跳；重连退避是全流共享的（`reconnectTimerId`），
    // 否则两个槽各退避一份，交接期会出现两倍频率的重连。
    let slotHeartbeatTimerId: any = null;
    const clearSlotTimers = () => {
      (slotHeartbeatTimerId !== null && clearTimer(slotHeartbeatTimerId),
        (slotHeartbeatTimerId = null));
    };
    const slotIsAlive = () => !isDisposed && isStreamActive && !slot.closed;
    slot.closeSocket = () => {
      (clearSlotTimers(), removeSocketListeners());
      try {
        nextSocket.close();
      } catch {
        // 清理期关闭失败无需处理：socket 可能已经没有底层连接。
      }
    };

    function slotFailed(closeCode = 0) {
      if (!slotIsAlive()) return;
      // 鉴权类关闭码：整体失效，不再重试（重试只会拿到同样的 4401）。
      if (TERMINAL_CLOSE_CODES.includes(closeCode)) {
        disposeAllSlots();
        emitStates();
        return;
      }
      // 只失效「这个槽确实在供数」的那批实体：pending 从未 ready，不牵连任何历史。
      const invalidatedEntityIds =
          activeSlot === slot ? wantedEntityIds.filter((wantedId) => slot.ids.includes(wantedId)) : [],
        wasActive = activeSlot === slot;
      (activeSlot === slot && (activeSlot = null), pendingSlot === slot && (pendingSlot = null));
      ((slot.closed = true), slot.closeSocket(), slot.stateById.clear());
      (wasActive &&
        invalidatedEntityIds.length &&
        (onInvalidate(invalidatedEntityIds), emitStates()),
        reconnectTimerId === null && scheduleReconnect());
    }

    function scheduleHeartbeatTimeout(heartbeatTimeoutMs: number) {
      (slotHeartbeatTimerId !== null && clearTimer(slotHeartbeatTimerId),
        (slotHeartbeatTimerId = setTimer(() => slotFailed(), heartbeatTimeoutMs)));
    }

    const socketHandlers: Record<string, (event: any) => void> = {
      open() {
        if (!slotIsAlive()) return;
        try {
          nextSocket.send(JSON.stringify({ type: "subscribe", entityIds: slot.ids }));
        } catch {
          slotFailed();
        }
      },
      message(messageEvent: any) {
        if (!slotIsAlive()) return;
        let messagePayload;
        try {
          messagePayload = JSON.parse(messageEvent.data);
        } catch {
          return;
        }
        if (!messagePayload || typeof messagePayload != "object") return;
        if (messagePayload.type === "resync_required") {
          // 与上游一致：重同步会失效一次，但立刻新建连接，不等退避。
          (slotFailed(), cancelReconnect(), openPendingSlot());
          return;
        }
        if (messagePayload.type === "snapshot" && Array.isArray(messagePayload.states)) {
          const snapshotStatesByEntityId = new Map<string, any>();
          for (const snapshotState of messagePayload.states)
            slot.ids.includes(snapshotState?.entityId) &&
              typeof snapshotState.state == "string" &&
              snapshotStatesByEntityId.set(snapshotState.entityId, structuredClone(snapshotState));
          (slot.stateById = snapshotStatesByEntityId),
            (slot.ready = true),
            (reconnectAttempt = 0),
            scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS);
          // 晋升：旧 active 交完班才退役，交接期两边都在，但 active 的值优先。
          if (pendingSlot === slot) {
            const previousActiveSlot = activeSlot;
            ((activeSlot = slot), (pendingSlot = null));
            retireSlot(previousActiveSlot);
          }
          emitStates();
          return;
        }
        if (!slot.ready) return;
        if (messagePayload.type === "state_removed" && slot.ids.includes(messagePayload.entityId)) {
          (slot.stateById.delete(messagePayload.entityId),
            scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS),
            emitPatch(messagePayload.entityId));
          return;
        }
        if (messagePayload.type === "state_changed" && slot.ids.includes(messagePayload.entityId)) {
          if (typeof messagePayload.state != "string") return;
          (slot.stateById.set(messagePayload.entityId, structuredClone(messagePayload)),
            scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS),
            emitPatch(messagePayload.entityId));
          return;
        }
        messagePayload.type === "ping" && scheduleHeartbeatTimeout(HEARTBEAT_TIMEOUT_MS);
      },
      close(closeEvent: any) {
        slotFailed(closeEvent?.code ?? 0);
      },
      error() {
        slotFailed();
      },
    };
    function removeSocketListeners() {
      for (const [handlerName, handler] of Object.entries(socketHandlers))
        nextSocket.removeEventListener(handlerName, handler);
    }

    for (const [handlerName, handler] of Object.entries(socketHandlers))
      nextSocket.addEventListener(handlerName, handler);
    scheduleHeartbeatTimeout(FIRST_RESPONSE_TIMEOUT_MS);
  }

  return {
    configure(
      entityIds: string[] = [],
      { additionalEntityIds = [] }: { additionalEntityIds?: string[] } = {},
    ) {
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
      if (
        nextSubscribedEntityIds.length === wantedEntityIds.length &&
        nextSubscribedEntityIds.every(
          (sortedEntityId, entityIdIndex) => sortedEntityId === wantedEntityIds[entityIdIndex],
        )
      )
        return;
      (cancelReconnect(),
        // pending 是按旧集合建的，订阅变了就没用了；active **保留**，
        // 它继续供交集部分的值，直到新连接拿到 snapshot。
        (pendingSlot !== null && (retireSlot(pendingSlot), (pendingSlot = null))),
        (wantedEntityIds = nextSubscribedEntityIds),
        (wantedEntityIdSet = new Set(wantedEntityIds)),
        (reconnectAttempt = 0));
      if (activeSlot && !activeSlot.ids.some((activeSlotId) => wantedEntityIdSet.has(activeSlotId))) {
        (retireSlot(activeSlot), (activeSlot = null));
      }
      (emitStates(), openPendingSlot());
    },
    setActive(isActiveNext: boolean) {
      isDisposed ||
        isStreamActive === (isActiveNext === true) ||
        ((isStreamActive = isActiveNext === true),
        (reconnectAttempt = 0),
        isStreamActive
          ? openPendingSlot()
          : (disposeAllSlots(), emitStates()));
    },
    /**
     * 进入 bfcache 前主动断开。
     *
     * 与 `setActive(false)` 的差别是**保留**订阅列表与已收到的状态：页面只是被冻结，
     * 既没有换页也没有改订阅，回来时应当先按旧值渲染再被新快照覆盖。
     *
     * 这里用 `parkSlot`（只关 socket、留状态）而不是退役：`activeSlot.ready` 仍是 true，
     * `emitStates()` 继续吐出冻结前的最后一批值，所以后退回来不会闪一遍空数据。
     */
    suspend() {
      if (isDisposed) return;
      wasActiveBeforePageCache = wasActiveBeforePageCache || isStreamActive;
      (cancelReconnect(), parkSlot(pendingSlot), (pendingSlot = null), parkSlot(activeSlot));
    },
    /**
     * 从 bfcache 恢复后立刻重连。
     *
     * 不能只依赖心跳超时：那意味着最长 65s 的旧值。这里先把退避计数清零再开连，
     * 避免沿用冻结前攒下的失败次数而多等几轮。
     *
     * 冻结期间 `visibilitychange` 可能已经把流 `setActive(false)` 掉，所以按
     * `wasActiveBeforePageCache` 恢复激活态，而不是只看此刻的 `isStreamActive`。
     */
    resume() {
      if (isDisposed) return;
      const shouldRestore = wasActiveBeforePageCache;
      if (((wasActiveBeforePageCache = false), !shouldRestore || !wantedEntityIds.length)) return;
      isStreamActive = true;
      // 冻结期间 park 掉的槽已经关了 socket：退役它（状态已被新连接接管），再开新的。
      ((activeSlot !== null && !activeSlot.stateById.size && (retireSlot(activeSlot), (activeSlot = null))),
        (reconnectAttempt = 0),
        pendingSlot || openPendingSlot());
    },
    dispose() {
      isDisposed ||
        ((isDisposed = true),
        (isStreamActive = false),
        (wasActiveBeforePageCache = false),
        disposeAllSlots({ notify: false }),
        (wantedEntityIds = []),
        wantedEntityIdSet.clear());
    },
  };
}
