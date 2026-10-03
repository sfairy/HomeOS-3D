/**
 * Socket.IO 传输层（从 entities.store 抽离）
 *
 * 职责：
 * - connect：建立 Socket.IO 连接（含 IDB 缓存回填、并行预热、loading 超时回退、事件绑定）
 * - disconnect：断开连接、清理定时器、最终落盘缓存、清除 HA 断连去抖
 * - startParallelPreload：并行 REST 预热，与 WS 全量同步竞速
 * - getSocket：暴露 socket 实例供上层读取连接状态
 *
 * 关键依赖：
 * - socket.io-client：Socket.IO 客户端
 * - @/utils/entity/socket.util：socket URL / 鉴权 / 选项构造
 * - @/utils/entity/ws-bind：绑定事件处理器（initial_states / state_changed / 重连等）
 * - @/utils/entity/ws-sync：连接级同步状态（loadingFallbackTimer 等）
 * - @/utils/entity/sync-failure.util：失败处理
 *
 * 实现说明：
 * - hydratedOnce 标记：首连必做 IDB hydrate，重连仅在内存空 / stale 时重做
 * - loadingFallbackTimer：12s 超时未收到全量状态则触发 REST 回退并解除加载遮罩
 * - preloadPromise 并发去重，避免重复预热
 */
import { io, type Socket } from 'socket.io-client'
import {
  buildEntitySocketAuth,
  buildEntitySocketOptions,
  buildEntitySocketUrl,
} from '@/utils/entity/socket.util'
import { bindEntitySocketHandlers } from '@/utils/entity/ws-bind'
import { createEntitySocketSyncState } from '@/utils/entity/ws-sync'
import { handleEntityFallbackFailure } from '@/utils/entity/sync-failure.util'
import type { EntitySocketSyncState, EntityTransportDeps } from '@/types/entity-store'

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
   * 建立 Socket.IO 连接。
   * 关键流程：
   * 1. 未认证直接返回；已有会话（connected / active）直接返回，勿拆掉
   * 2. 刷新 Redis 健康状态
   * 3. 重建 socket：清理旧实例 + removeAllListeners
   * 4. IDB 缓存回填：首连必做，重连仅当内存空 / stale 时做
   * 5. 缓存恢复失败或实体数 < 50 时启动并行 REST 预热
   * 6. 构造 socketAuth（含 lastSocketEventAt / lastEventId 用于断点续传）
   * 7. 设置 loadingFallbackTimer：12s 超时未收到全量状态则触发 REST 回退
   * 8. bindEntitySocketHandlers 绑定所有事件处理器
   * 9. onTransportReady 通知上层（递增 wsTransportEpoch）
   */
  async function connect(): Promise<void> {
    if (deps.isAuthenticated && !deps.isAuthenticated()) return
    // connected / active（握手或 polling→websocket 升级中）均视为已有会话，勿拆掉
    if (socket?.connected || socket?.active) return

    deps.refreshRedisFromHealth?.().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      deps.logger.debug(`Redis 健康检查刷新失败: ${msg}`)
    })

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
    if (!cacheHydrated || deps.totalCount.value < 50) {
      startParallelPreload().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        deps.logger.debug(`实体并行预热失败: ${msg}`)
      })
    }

    const socketAuth = buildEntitySocketAuth(deps.track.lastSocketEventAt, deps.track.lastEventId)
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
