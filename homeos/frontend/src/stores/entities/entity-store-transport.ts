/** Socket.IO 传输层（从 entities.store 抽离） */
import { io, type Socket } from 'socket.io-client'
import {
  buildEntitySocketAuth,
  buildEntitySocketOptions,
  buildEntitySocketUrl,
} from '@/composables/entity/socket.util'
import { bindEntitySocketHandlers } from '@/composables/entity/ws-bind'
import { createEntitySocketSyncState } from '@/shared/entity/utils/ws-sync'
import { handleEntityFallbackFailure } from '@/shared/entity/utils/sync-failure.util'
import type { EntitySocketSyncState, EntityTransportDeps } from '@/shared/types/entity-store'

/**
 * 创建 Socket.IO 传输层
 * @param deps 依赖注入对象（logger / refs / actions / listeners / 各种回调）
 * @returns connect / disconnect / startParallelPreload / getSocket
 */
export function createEntityTransport(deps: EntityTransportDeps) {
  // 当前 Socket.IO 实例（连接后赋值，断开后置 null）
  let socket: Socket | null = null
  // 在途的并行预热 Promise（去重）
  let preloadPromise: Promise<boolean> | null = null
  // 当前连接级同步状态（含 loadingFallbackTimer）
  let currentSync: EntitySocketSyncState | null = null
  /** IndexedDB 缓存 hydrate 标记：首连必做；重连仅在内存空/stale 时重做 */
  let hydratedOnce = false
  /**
   * 在途连接 Promise：connect() 是异步的（首连要先 await hydrate），
   * 入口的 socket 去重挡不住并发调用，这里用单飞 Promise 保证同一时刻只建一次连。
   */
  let connectPromise: Promise<void> | null = null
  /** 连接世代：disconnect() 递增；在途 connect() 在 await 之后据此放弃建连 */
  let connectEpoch = 0

  /**
   * 建立 Socket.IO 连接。
   * 关键流程：
   * 1. 未认证直接返回；已有会话（connected / active）直接返回，勿拆掉
   * 2. 重建 socket：清理旧实例 + removeAllListeners
   * 3. IDB 缓存回填：首连必做，重连仅当内存空 / stale 时做
   * 4. 缓存恢复失败或实体数 < 50 时启动并行 REST 预热
   * 5. 构造 socketAuth（含 lastSocketEventAt / lastEventId 用于断点续传）
   * 6. 设置 loadingFallbackTimer：12s 超时未收到全量状态则触发 REST 回退
   * 7. bindEntitySocketHandlers 绑定所有事件处理器
   * 8. onTransportReady 通知上层（递增 wsTransportEpoch）
   */
  function connect(): Promise<void> {
    if (deps.isAuthenticated && !deps.isAuthenticated()) return Promise.resolve()
    // connected / active（握手或 polling→websocket 升级中）均视为已有会话，勿拆掉
    if (socket?.connected || socket?.active) return Promise.resolve()
    // 已有在途连接：复用同一个 Promise，勿拆掉
    if (connectPromise) return connectPromise

    const epoch = connectEpoch
    const run = doConnect(epoch)
    connectPromise = run
    void run
      .finally(() => {
        if (connectPromise === run) connectPromise = null
      })
      .catch(() => {
        /* 连接失败仍由 connect() 调用方感知；这里只负责清在途标记 */
      })
    return run
  }

  /**
   * 真正执行建连。epoch 是进入时的连接世代：
   * hydrate 可能耗时（IndexedDB），期间若发生 disconnect() / 登出，则放弃本次建连，
   * 避免建出一个「已登出仍在连」的 socket。
   */
  async function doConnect(epoch: number): Promise<void> {
    if (socket) {
      socket.removeAllListeners()
      socket.disconnect()
      socket = null
    }

    // IndexedDB 回填：
    // - 首连：始终尝试恢复缓存，缩短白屏；
    // - 重连：仅当内存为空或已标 stale 时再 hydrate，避免与 WS 增量抢写，
    //   同时覆盖「整页被回收后重进 / 长断线后内存已空」场景。
    let cacheHydrated = true
    const needsCacheHydrate =
      !hydratedOnce || deps.totalCount.value === 0 || deps.refs.entitiesStale?.value === true
    if (needsCacheHydrate) {
      cacheHydrated = await deps.hydrateFromEntityCache().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        deps.logger.debug(`实体缓存 hydrate 失败: ${msg}`)
        return false
      })
      hydratedOnce = true
    }
    // hydrate 期间可能已 disconnect()（登出 / bfcache 冻结）：本次建连作废
    if (epoch !== connectEpoch) return
    if (deps.isAuthenticated && !deps.isAuthenticated()) return

    if (!cacheHydrated || deps.totalCount.value < 50) {
      startParallelPreload().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        deps.logger.debug(`实体并行预热失败: ${msg}`)
      })
    }

    // 只有「本会话已经收到过事件」才声明基线：仅靠缓存 hydrate 不足以证明本地是最新的
    // （缓存可能是几小时前的，而 since 只回放最近 60s）。此时服务端可只发增量回放。
    const socketAuth = buildEntitySocketAuth(
      deps.track.lastSocketEventAt,
      deps.track.lastEventId,
      deps.track.lastSocketEventAt > 0,
    )
    socket = io(buildEntitySocketUrl(), buildEntitySocketOptions(socketAuth))

    const sync = createEntitySocketSyncState() as EntitySocketSyncState
    currentSync = sync
    sync.loadingFallbackTimer = setTimeout(async () => {
      if (!deps.loading.value) return
      if (deps.totalCount.value > 0) {
        deps.loading.value = false
        return
      }
      const ok = await deps.fetchEntitiesFallback('WebSocket 同步超时')
      deps.loading.value = false
      if (!ok) {
        deps.logger.warn('实体同步超时,已解除加载遮罩(可稍后自动恢复)')
        handleEntityFallbackFailure('WebSocket 同步超时', null, deps.refs)
      }
    }, 12000)

    bindEntitySocketHandlers(
      socket,
      {
        logger: deps.logger,
        getInitialStatesWaitMs: deps.getInitialStatesWaitMs,
        getPreloadPromise: () => preloadPromise,
        refs: deps.refs,
        entities: deps.entities,
        track: deps.track,
        actions: deps.actions,
        listeners: deps.listeners,
      },
      sync,
    )
    deps.onTransportReady?.()
  }

  /**
   * 断开 Socket.IO 连接并清理状态。
   * - 若有未落盘的脏缓存则立即写入
   * - 清除 loadingFallbackTimer 与 currentSync
   * - 清除 HA 断连去抖定时器
   * - 标记 connected=false
   */
  function disconnect(): void {
    // 递增世代并清在途标记：在 await hydrate 的 connect() 会据此放弃建连；
    // 紧随其后的 connect()（reconnectForAuthChange / refreshEntitiesFromServer）能立刻重新发起。
    connectEpoch += 1
    connectPromise = null
    if (deps.persistCacheDirty?.()) {
      deps.persistEntityCacheNow().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        deps.logger.debug('断开连接时实体缓存写入失败', msg)
      })
    }
    deps.cancelPersistCacheTimer()
    if (currentSync?.loadingFallbackTimer) {
      clearTimeout(currentSync.loadingFallbackTimer)
      currentSync.loadingFallbackTimer = null
    }
    currentSync = null
    if (socket) {
      socket.disconnect()
      socket = null
    }
    deps.clearHaDisconnectDebounce()
    deps.clearHaStatusProbe?.()
    deps.setConnected(false)
  }

  /**
   * 启动并行 REST 预热（与 WS 全量同步竞速）。
   * - 在途期间复用 preloadPromise，避免重复预热
   * - quiet 模式（不弹 toast）
   * @returns 预热 Promise
   */
  function startParallelPreload(): Promise<boolean> {
    if (preloadPromise) return preloadPromise
    preloadPromise = deps.fetchEntitiesFallback('并行预热', { quiet: true }).finally(() => {
      preloadPromise = null
    })
    return preloadPromise
  }

  /** 获取当前 socket 实例（未连接时为 null），供上层读取连接状态 */
  function getSocket(): Socket | null {
    return socket
  }

  return {
    connect,
    disconnect,
    startParallelPreload,
    getSocket,
  }
}
