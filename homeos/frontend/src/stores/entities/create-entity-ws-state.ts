/**
 * @file create-entity-ws-state.ts
 * @module frontend/src/stores
 */
import { ref } from 'vue'
import type { Ref } from 'vue'
import type { Socket } from 'socket.io-client'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import { refreshPinnedEntitiesAfterStale } from '@/utils/entity/cold-refresh.util'
import { applyEntityStatesBatch } from '@/utils/entity/state-update'
import type { EntityStateUpdateDeps } from '@/utils/entity/state-update'
import type { WsDeltaChange } from '@/utils/entity/state-delta.util'
import { normalizeWsBatchChanges } from '@/workers/entity-ws-ingest-bridge'
import { normalizeWsBatchChangesSync } from '@/utils/entity/state-delta.util'
import { fetchRedisStatusFromHealth } from '@/utils/telemetry/redis-status'
import {
  appNotify,
  refreshSecurityPanelFromSocket,
  applySecurityModeFromSocket,
  refreshNotificationsFromSocket,
  refreshEventLogFromSocket,
} from '@/utils/bridge/store-bridge'
import { getFrontendConfig } from '@/utils/config/frontend-config'
import { WS_PUSH_CRITICAL_DOMAINS } from '@homeos/shared'
import { createEntityInitHelpers } from '@/stores/entities/entity-store-init.util'
import { createEntityRestFallbackHelpers } from '@/stores/entities/entity-store-rest-fallback.util'
import { createEntitySubscriptionHelpers } from '@/stores/entities/entity-store-subscription.util'
import { createEntityModeEventRegistry } from '@/stores/entities/entity-mode-events.util'
import { createEntityTransport } from '@/stores/entities/entity-store-transport'
import type {
  EntitiesMap,
  EntityInitOptions,
  EntityLoadPhase,
  EntityPerfStats,
  EntitySocketTrack,
  EntityStoreLogger,
  HaEntityState,
  RedisStatus,
} from '@/types/entity-store'
import type { NotifyType } from '@/types/notify'

/**
 * 实体缓存持久化桥接接口
 *
 * 用于解耦 createEntityWsState 与 createEntityCacheHelpers 之间的循环依赖：
 * wsState 需要在断开连接 / 页面隐藏时触发缓存持久化，但 cacheHelpers 的创建又依赖 wsState.initStates。
 * 通过此桥接接口，wsState 先持有空实现，待 cacheHelpers 创建后再回填真实方法。
 */
export interface EntityCachePersistBridge {
  cancelPersistCacheTimer: () => void
  persistEntityCacheNow: () => Promise<void>
}

/**
 * 实体初始加载就绪桥接接口
 *
 * 用于解耦 createEntityWsState 与 createEntityInitHelpers 之间的循环依赖：
 * wsState 需要在派生索引重建完成后标记加载就绪，但 initHelpers 的创建在 wsState 内部。
 * 通过此桥接接口，wsState 先持有空实现，待 initHelpers 创建后再回填 markEntityLoadReady。
 */
export interface EntityInitLoadReadyBridge {
  markEntityLoadReady: () => void
}

/**
 * 实体 WS 状态机依赖注入接口
 *
 * 采用依赖注入模式，将 entities.store 持有的状态与方法传递给 createEntityWsState，
 * 避免直接导入 store 形成循环依赖。所有字段均为只读引用或纯函数。
 */
interface EntityWsStateDeps {
  apiClient: {
    get: (
      url: string,
      config?: { params?: Record<string, unknown>; timeout?: number },
    ) => Promise<{ data: Record<string, unknown> }>
  }
  logger: EntityStoreLogger
  entities: EntitiesMap
  friendlyNamesMap: Record<string, string>
  totalCount: Ref<number>
  loading: Ref<boolean>
  entitiesStale: Ref<boolean>
  entitiesCacheHydrated: Ref<boolean>
  entitiesCacheSavedAt: Ref<number | null>
  entityLoadProgress: Ref<number>
  entityLoadPhase: Ref<EntityLoadPhase>
  entityVisible: (entityId: string) => boolean
  perfStats: EntityPerfStats
  clearAllEntities: () => void
  scheduleRebuildDerived: () => void
  schedulePersistEntityCache: () => void
  markEntityCacheDirty: (entityId: string) => void
  cancelPersistCacheTimer: () => void
  persistEntityCacheNow: () => Promise<void>
  hydrateFromEntityCache: () => Promise<boolean>
  isPersistCacheDirty: () => boolean
  getStateUpdateDeps: () => EntityStateUpdateDeps
  ingestEntitySnapshot: (entity: HaEntityState) => void
  isAuthenticated: () => boolean
  getEnsureEntity: () => (entityId: string) => Promise<HaEntityState | null>
  initStatesBatchSize: () => number
  largeEntityThreshold: () => number
  cachePersistBridge: EntityCachePersistBridge
  initLoadReadyBridge: EntityInitLoadReadyBridge
  /** 乐观更新桥接：WS 事件需回滚时调用（创建后由 store 回填） */
  optimisticBridge?: {
    rollbackAllOptimistic: () => number
  }
}

/**
 * WebSocket 连接、订阅与初始批次同步（entities.store 拆分模块）
 *
 * 本模块是实体存储的 WS 状态机核心，负责：
 * - 管理 Socket.IO 连接状态（connected / reconnecting）
 * - 处理 HA 断连去抖（haDisconnectDebounceMs）
 * - 协调初始状态全量/分批同步（initStates / beginIncrementalInitialStates）
 * - 处理增量状态批量更新（updateStatesBatch）
 * - 提供 REST 回退机制（fetchEntitiesFallback）
 * - 管理远程通知与状态监听器（remoteNotifications / onStateChanged）
 * - 监听家庭模式 / 儿童模式事件
 *
 * @param deps - 依赖注入对象，包含 entities.store 持有的状态与方法
 * @returns WS 状态机的公开 API（连接状态、init、批量更新、监听器等）
 */
export function createEntityWsState(deps: EntityWsStateDeps) {
  /** WS 是否已连接 */
  const connected = ref(false)
  /** 是否正在重连（HA 断连去抖期间为 true） */
  const reconnecting = ref(false)
  /** HA 队列累计丢弃总数（服务端 Redis 队列满时丢弃） */
  const haQueueDroppedTotal = ref(0)
  /** 上次队列丢弃时间戳 */
  const lastQueueDropAt = ref<string | null>(null)
  /** Redis 状态：'unknown' | 'available' | 'unavailable' */
  const redisStatus = ref<RedisStatus>('unknown')

  /** HA 断连去抖延迟（毫秒）：短于此时长恢复连接不标记 stale */
  const HA_DISCONNECT_DEBOUNCE_MS = () => getFrontendConfig().haDisconnectDebounceMs
  let haDisconnectTimer: ReturnType<typeof setTimeout> | null = null
  // Socket 解析器：在 createEntityTransport 返回后被回填，用于检查 socket 实际连接状态
  let resolveSocket: () => Socket | null = () => null

  /**
   * 启动 HA 断连去抖：标记 reconnecting=true，超时后若仍未恢复则确认断连
   * 副作用：设置 haDisconnectTimer，写入 reconnecting
   */
  function startHaDisconnectDebounce() {
    reconnecting.value = true
    if (haDisconnectTimer) clearTimeout(haDisconnectTimer)
    haDisconnectTimer = setTimeout(() => {
      haDisconnectTimer = null
      if (connected.value) {
        reconnecting.value = false
        return
      }
      const sock = resolveSocket()
      // socket.io 在重连退避期间 connected/active 可能同时为 false，但 Manager 仍在重连流程中；
      // 读取其内部 _reconnecting 标志，避免把「重连中」误判为「已断开」而提前收起横幅。
      const ioReconnecting =
        (sock?.io as unknown as { _reconnecting?: boolean } | undefined)?._reconnecting === true
      if (sock?.connected || sock?.active || ioReconnecting) {
        reconnecting.value = true
        return
      }
      reconnecting.value = false
    }, HA_DISCONNECT_DEBOUNCE_MS())
  }

  /** 清除 HA 断连去抖定时器并重置 reconnecting 状态 */
  function clearHaDisconnectDebounce() {
    if (haDisconnectTimer) {
      clearTimeout(haDisconnectTimer)
      haDisconnectTimer = null
    }
    reconnecting.value = false
  }

  /**
   * 设置 WS 连接状态
   * @param status - 是否已连接
   */
  function setConnected(status: boolean): void {
    connected.value = status
  }
  // 创建家庭模式事件注册表（监听器列表 + 订阅/退订函数）
  const {
    listeners: modeEventListeners,
    onHomeModeEvent,
  } = createEntityModeEventRegistry()

  // 创建订阅助手：远程通知列表 + 状态监听器派发 + onStateChanged 订阅
  const {
    remoteNotifications,
    emitStateListeners,
    onStateChanged,
    addRemoteNotification,
    clearRemoteNotifications,
  } = createEntitySubscriptionHelpers({ logger: deps.logger, perfStats: deps.perfStats })

  // 创建初始加载助手：initStates（全量/分批）+ 渐进式 initial_states 合并 + 加载就绪标记
  const {
    initStates,
    beginIncrementalInitialStates,
    mergeInitialStatesChunk,
    finishIncrementalInitialStates,
    countVisibleEntities,
    shouldAcceptEntitySnapshot,
    markEntityLoadReady,
  } = createEntityInitHelpers({
    entities: deps.entities,
    friendlyNamesMap: deps.friendlyNamesMap,
    totalCount: deps.totalCount,
    loading: deps.loading,
    entitiesCacheHydrated: deps.entitiesCacheHydrated,
    entitiesStale: deps.entitiesStale,
    entityLoadProgress: deps.entityLoadProgress,
    entityLoadPhase: deps.entityLoadPhase,
    entityVisible: deps.entityVisible,
    logger: deps.logger,
    initStatesBatchSize: deps.initStatesBatchSize,
    largeEntityThreshold: deps.largeEntityThreshold,
    scheduleRebuildDerived: deps.scheduleRebuildDerived,
    setConnected,
    clearAllEntities: deps.clearAllEntities,
    cancelPersistCacheTimer: () => deps.cachePersistBridge.cancelPersistCacheTimer(),
    persistEntityCacheNow: () => deps.cachePersistBridge.persistEntityCacheNow(),
    // 权限指纹（role + restrictions），变化时全量快照强制接受，清掉已无权查看的陈旧实体
    restrictionsVersion: () => {
      const auth = useAuthStore()
      return `${auth.role}|${[...(auth.restrictions || [])].sort().join(',')}`
    },
  })
  // 回填初始加载就绪桥接
  deps.initLoadReadyBridge.markEntityLoadReady = markEntityLoadReady

  // WS 批量更新队列：非关键串行；关键域独立短队列，避免被 sensor 批次堵住
  let wsBatchApplyTail: Promise<void> = Promise.resolve()
  let wsCriticalApplyTail: Promise<void> = Promise.resolve()
  const CRITICAL_APPLY_DOMAINS = new Set<string>(WS_PUSH_CRITICAL_DOMAINS)

  // REST 全量 / WS initial_states 全量应用与 WS 增量互斥：
  // 全量清空重建同样串行进入 wsBatchApplyTail 队列，避免重连期间 REST 清空与 WS 增量并发，
  // 导致增量在清空窗口内丢失或状态被旧快照回退（增量丢失/状态回退）
  function initStatesQueued(
    list: HaEntityState[],
    opts?: EntityInitOptions,
  ): Promise<void> {
    const run = wsBatchApplyTail.then(() => initStates(list, opts))
    wsBatchApplyTail = run.catch((err) => {
      deps.logger.warn('[实体 WS] 全量实体应用失败', err)
      return undefined
    })
    return run
  }

  /** 前端 apply 延迟样本缓冲 → Socket `ha_sync_fe_latency` → 后端 /metrics */
  const feLatencySamples: Array<{ stage: string; ms: number }> = []
  let feLatencyFlushTimer: ReturnType<typeof setTimeout> | null = null

  function enqueueFeLatencySample(
    stage: 'fe_critical_apply' | 'fe_sensor_apply' | 'fe_e2e_apply',
    ms: number,
  ) {
    if (!Number.isFinite(ms) || ms < 0) return
    feLatencySamples.push({ stage, ms: Math.round(ms * 100) / 100 })
    if (feLatencySamples.length > 64) feLatencySamples.splice(0, feLatencySamples.length - 64)
    if (feLatencyFlushTimer != null) return
    feLatencyFlushTimer = setTimeout(() => {
      feLatencyFlushTimer = null
      flushFeLatencySamples()
    }, 2_000)
  }

  function recordFeE2eFromChanges(changes: WsDeltaChange[]) {
    const now = Date.now()
    let best: number | null = null
    for (const c of changes) {
      const ts = Number(c?._pipelineTs)
      if (!Number.isFinite(ts) || ts <= 0) continue
      const ms = now - ts
      if (ms < 0 || ms > 60_000) continue
      if (best == null || ms < best) best = ms
    }
    if (best != null) enqueueFeLatencySample('fe_e2e_apply', best)
  }

  function flushFeLatencySamples() {
    if (!feLatencySamples.length) return
    const sock = getSocket?.()
    if (!sock?.connected) {
      feLatencySamples.length = 0
      return
    }
    const batch = feLatencySamples.splice(0, 64)
    try {
      sock.emit('ha_sync_fe_latency', { samples: batch })
    } catch {
      /* 观测旁路，失败忽略 */
    }
  }

  // getSocket 在 transport 创建后回填；此处先占位，避免 TDZ
  let getSocket: () => Socket | null = () => null

  function updateStatesBatch(changes: WsDeltaChange[]): Promise<void> {
    deps.perfStats.wsBatchCount++
    deps.perfStats.lastWsBatchSize = changes?.length ?? 0
    const critical: WsDeltaChange[] = []
    const rest: WsDeltaChange[] = []
    for (const change of changes ?? []) {
      const id = String(change?.entity_id || '')
      const domain = id.includes('.') ? id.slice(0, id.indexOf('.')) : ''
      if (CRITICAL_APPLY_DOMAINS.has(domain)) critical.push(change)
      else rest.push(change)
    }

    /** 关键域：主线程同步规范化，跳过 Worker hop，压低控制反馈延迟 */
    const applyCriticalChunk = () => {
      if (!critical.length) return
      const t0 =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
      const normalized = normalizeWsBatchChangesSync(critical, deps.entities)
      applyEntityStatesBatch(deps.getStateUpdateDeps(), normalized)
      const ms =
        (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) -
        t0
      deps.perfStats.criticalApplyCount++
      deps.perfStats.lastCriticalApplyMs = Math.round(ms * 100) / 100
      enqueueFeLatencySample('fe_critical_apply', ms)
      recordFeE2eFromChanges(critical)
    }

    const applyRestChunk = async () => {
      if (!rest.length) return
      const t0 =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
      const normalized = await normalizeWsBatchChanges(rest, deps.entities)
      applyEntityStatesBatch(deps.getStateUpdateDeps(), normalized)
      const ms =
        (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) -
        t0
      deps.perfStats.lastSensorApplyMs = Math.round(ms * 100) / 100
      enqueueFeLatencySample('fe_sensor_apply', ms)
      recordFeE2eFromChanges(rest)
    }

    let criticalRun: Promise<void> = Promise.resolve()
    if (critical.length) {
      criticalRun = wsCriticalApplyTail.then(() => {
        applyCriticalChunk()
      })
      wsCriticalApplyTail = criticalRun.catch((err) => {
        deps.logger.warn('[实体 WS] 关键批量应用失败', err)
        return undefined
      })
    }

    let restRun: Promise<void> = Promise.resolve()
    if (rest.length) {
      restRun = wsBatchApplyTail.then(() => applyRestChunk())
      wsBatchApplyTail = restRun.catch((err) => {
        deps.logger.warn('[实体 WS] 批量应用失败', err)
        return undefined
      })
    }

    return Promise.all([criticalRun, restRun]).then(() => undefined)
  }

  // Socket 追踪对象：记录上次事件时间戳、事件 ID、状态版本（用于增量同步与去重）
  const socketTrack: EntitySocketTrack = { lastSocketEventAt: 0, lastEventId: 0, stateVersion: 0 }
  // WS 连接确保桥接：初始为空实现，在 ensureWsConnected 定义后回填
  const wsConnectBridge = { ensure: (): void => undefined }
  /** WS 传输层 epoch：每次重连递增，供 UI 感知连接重建 */
  const wsTransportEpoch = ref(0)

  // 创建 REST 回退助手：全量拉取 / 增量同步 / 页面可见性回退
  const { fetchEntitiesFallback, fetchEntitiesChangedSince, bindVisibilityFallbackHandler } =
    createEntityRestFallbackHelpers({
    apiClient: deps.apiClient,
    entities: deps.entities,
    totalCount: deps.totalCount,
    connected,
    entitiesStale: deps.entitiesStale,
    entityVisible: deps.entityVisible,
    countVisibleEntities,
    shouldAcceptEntitySnapshot,
    // REST 全量写入纳入 WS 增量同一串行队列，保证互斥
    initStates: initStatesQueued,
    initStatesBatchSize: deps.initStatesBatchSize,
    setConnected,
    scheduleRebuildDerived: deps.scheduleRebuildDerived,
    schedulePersistEntityCache: deps.schedulePersistEntityCache,
    ingestEntitySnapshot: deps.ingestEntitySnapshot,
    socketTrack,
    logger: deps.logger,
    isAuthenticated: deps.isAuthenticated,
    ensureWsConnected: () => wsConnectBridge.ensure(),
  })

  // 绑定页面可见性回退处理器：标签页恢复可见时增量同步或全量回退
  bindVisibilityFallbackHandler()

  /**
   * 实体数据陈旧时的处理：刷新置顶实体 + 强制 REST 回退
   * 调用场景：WS 断连过久、服务端标记 stale
   */
  function onEntitiesStale() {
    try {
      const layout = useLayoutStore()
      void refreshPinnedEntitiesAfterStale(
        { ensureEntity: deps.getEnsureEntity() },
        layout.layoutConfig,
      )
    } catch (err) {
      deps.logger.warn('[实体 WS] 过期后刷新置顶实体失败', err)
    }
    void fetchEntitiesFallback('entities_stale', { force: true, quiet: true })
  }

  /**
   * 从健康检查接口刷新 Redis 状态
   * @returns 无返回值；失败时将 redisStatus 设为 'unavailable'
   */
  async function refreshRedisFromHealth() {
    try {
      const parsed = await fetchRedisStatusFromHealth()
      redisStatus.value = parsed.status
    } catch (e) {
      deps.logger.debug('从健康检查刷新 Redis 状态失败', e)
      if (redisStatus.value === 'unknown') redisStatus.value = 'unavailable'
    }
  }

  /** initial_states 等待超时（毫秒）：超过此时间未收到全量状态则触发 REST 回退 */
  const INITIAL_STATES_WAIT_MS = () => getFrontendConfig().initialStatesWaitMs ?? 8000
  // 创建 Socket.IO 传输层：连接 / 断开 / 事件绑定 / 预热
  const transport = createEntityTransport({
    logger: deps.logger,
    loading: deps.loading,
    totalCount: deps.totalCount,
    entities: deps.entities,
    track: socketTrack,
    getInitialStatesWaitMs: INITIAL_STATES_WAIT_MS,
    hydrateFromEntityCache: deps.hydrateFromEntityCache,
    fetchEntitiesFallback,
    isAuthenticated: deps.isAuthenticated,
    refreshRedisFromHealth,
    persistCacheDirty: deps.isPersistCacheDirty,
    persistEntityCacheNow: deps.persistEntityCacheNow,
    cancelPersistCacheTimer: deps.cancelPersistCacheTimer,
    clearHaDisconnectDebounce,
    setConnected,
    refs: {
      loading: deps.loading,
      totalCount: deps.totalCount,
      reconnecting,
      entitiesStale: deps.entitiesStale,
      haQueueDroppedTotal,
      lastQueueDropAt,
      entitiesCacheHydrated: deps.entitiesCacheHydrated,
      entitiesCacheSavedAt: deps.entitiesCacheSavedAt,
      redisStatus,
    },
    actions: {
      clearHaDisconnectDebounce,
      startHaDisconnectDebounce,
      setConnected,
      fetchEntitiesFallback,
      /** 背压建议：先 REST 增量，成功则跳过全量 */
      requestSoftResync: async (_reason?: string) => {
        const ok = await fetchEntitiesChangedSince()
        if (ok) deps.entitiesStale.value = false
        return ok
      },
      // WS initial_states 全量应用与增量同队列互斥
      initStates: (list, opts) => {
        void initStatesQueued(list, opts)
      },
      beginIncrementalInitialStates,
      mergeInitialStatesChunk: (list, token, expected) =>
        mergeInitialStatesChunk(list, token as number, expected),
      finishIncrementalInitialStates: (token, expected) =>
        finishIncrementalInitialStates(token as number, expected),
      onEntitiesStale,
      rollbackAllOptimistic: () => deps.optimisticBridge?.rollbackAllOptimistic?.() ?? 0,
      updateStatesBatch: (changes) => {
        void updateStatesBatch(changes as unknown as WsDeltaChange[])
      },
      scheduleRebuildDerived: deps.scheduleRebuildDerived,
      schedulePersistEntityCache: deps.schedulePersistEntityCache,
      entityVisible: deps.entityVisible,
      addRemoteNotification,
      refreshSecurityPanelFromSocket,
      applySecurityModeFromSocket,
      refreshNotificationsFromSocket,
      refreshEventLogFromSocket,
      appNotify: (message, type) => appNotify(message, type as NotifyType | undefined),
    },
    listeners: modeEventListeners,
    onTransportReady: () => {
      wsTransportEpoch.value++
    },
  })
  const { connect, disconnect } = transport
  getSocket = transport.getSocket
  // 回填 Socket 解析器，供 startHaDisconnectDebounce 检查实际连接状态
  resolveSocket = getSocket

  /**
   * 确保 WS 已连接：未认证时跳过；socket 已连接或正在重连时跳过；否则触发 connect
   * 调用场景：页面恢复可见、认证变化后等
   */
  function ensureWsConnected() {
    if (!deps.isAuthenticated()) return
    const sock = getSocket()
    if (sock?.connected) return
    if (sock?.active) return
    connect()
  }
  // 回填 WS 连接确保桥接
  wsConnectBridge.ensure = ensureWsConnected

  /**
   * 认证变化后重连：清空缓存状态、清空实体、断开并重新连接
   * 调用场景：登录 / 登出 / 切换用户
   */
  function reconnectForAuthChange() {
    deps.entitiesCacheHydrated.value = false
    deps.entitiesCacheSavedAt.value = null
    deps.cancelPersistCacheTimer()
    deps.clearAllEntities()
    disconnect()
    connect()
  }

  return {
    connected,
    reconnecting,
    haQueueDroppedTotal,
    lastQueueDropAt,
    redisStatus,
    setConnected,
    // 对外暴露的全量初始化也走串行队列，保证缓存 hydrate / 外部调用与 WS 增量互斥
    initStates: initStatesQueued,
    updateStatesBatch,
    emitStateListeners,
    onStateChanged,
    remoteNotifications,
    clearRemoteNotifications,
    fetchEntitiesFallback,
    connect,
    disconnect,
    getSocket,
    refreshRedisFromHealth,
    reconnectForAuthChange,
    ensureWsConnected,
    wsTransportEpoch,
    onHomeModeEvent,
  }
}