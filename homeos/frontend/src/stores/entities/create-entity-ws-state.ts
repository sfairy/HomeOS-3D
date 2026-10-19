/**
 * @file create-entity-ws-state.ts
 * @module frontend/src/stores
 */
import { ref } from 'vue'
import type { Ref } from 'vue'
import type { Socket } from 'socket.io-client'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import { refreshPinnedEntitiesAfterStale } from '@/composables/entity/cold-refresh.util'
import { applyEntityStatesBatch } from '@/composables/entity/state-update'
import type { EntityStateUpdateDeps } from '@/composables/entity/state-update'
import type { WsDeltaChange } from '@/shared/entity/utils/state-delta.util'
import { normalizeWsBatchChanges } from '@/workers/entity-ws-ingest-bridge'
import { normalizeWsBatchChangesSync } from '@/shared/entity/utils/state-delta.util'
import {
  appNotify,
  refreshSecurityPanelFromSocket,
  applySecurityModeFromSocket,
  refreshNotificationsFromSocket,
  refreshEventLogFromSocket,
} from '@/shared/utils/bridge/store-bridge'
import { getFrontendConfig } from '@/shared/utils/config/frontend-config'
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
  HaLinkStatus,
} from '@/shared/types/entity-store'
import { fetchHaHealth } from '@/services/api/entities'
import type { NotifyType } from '@/shared/types/notify'

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
  /**
   * 后端播报的 HA 连接状态（``ha_status`` 事件的最后一条）。
   *
   * ``unknown`` = 还没收到任何播报（刚打开页面 / 后端刚重启）。它与 ``reconnecting``
   * 分开维护：socket 层断开也会把 ``reconnecting`` 置真，但那时 HA 可能一直是好的。
   */
  const haStatus = ref<HaLinkStatus>('unknown')
  /** HA 队列累计丢弃总数（服务端队列满时丢弃） */
  const haQueueDroppedTotal = ref(0)
  /** 上次队列丢弃时间戳 */
  const lastQueueDropAt = ref<string | null>(null)

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
   * HA 状态主动核对：降级状态持续时向 ``/ha/health`` 补一次只读探活。
   *
   * 为什么需要：``ha_status`` 是纯事件式推送（后端只在状态**变化**时广播），只要漏掉
   * 一条 ``connected``（socket 抖动期间后端重启、页面刚连上时广播已发完），前端就会
   * 永远停在「正在重连 Home Assistant」，而实际上 HA 早就好了。这里用幂等探活兜底：
   * 确认已连上就本地收起降级态，确认没连上则什么都不做（继续等推送）。
   *
   * 同一时刻只保留一个定时器/在途请求，避免每次状态事件都打一发请求。
   */
  const HA_STATUS_PROBE_DELAY_MS = 6000
  let haStatusProbeTimer: ReturnType<typeof setTimeout> | null = null
  let haStatusProbeInFlight = false

  function clearHaStatusProbe() {
    if (haStatusProbeTimer) {
      clearTimeout(haStatusProbeTimer)
      haStatusProbeTimer = null
    }
    haStatusProbeInFlight = false
  }

  function scheduleHaStatusProbe() {
    if (haStatusProbeTimer || haStatusProbeInFlight) return
    haStatusProbeTimer = setTimeout(() => {
      haStatusProbeTimer = null
      if (!deps.isAuthenticated()) return
      haStatusProbeInFlight = true
      fetchHaHealth({ timeout: 4000 })
        .then((response) => {
          if (response.data?.connected) {
            haStatus.value = 'connected'
            clearHaDisconnectDebounce()
            setConnected(true)
            deps.logger.info('[实体 WS] 状态核对确认 HA 已连接，收起重连提示')
          }
        })
        .catch(() => {
          // 探活失败（后端正好在重启 / 网络抖动）不做任何上升：横幅已经在了，
          // 下一次状态事件或下一次探活会给出权威答案。
        })
        .finally(() => {
          haStatusProbeInFlight = false
        })
    }, HA_STATUS_PROBE_DELAY_MS)
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
    // 权限指纹（restrictions），变化时全量快照强制接受，清掉已无权查看的陈旧实体
    restrictionsVersion: () => {
      const auth = useAuthStore()
      return [...(auth.restrictions || [])].sort().join(',')
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
      // 起点优先取 HA 事件时刻（changed_at）：这才是用户真正感知的端到端，
      // 包含 HA 自身处理 + 后端入站合并 + 广播 + 本端 apply。
      // changed_at 缺失（部分 delta / 本地乐观更新）才退回后端广播时刻 _pipelineTs。
      let startedAt = Number.NaN
      const changedAt = c?.changed_at
      if (typeof changedAt === 'string' && changedAt) startedAt = Date.parse(changedAt)
      if (!Number.isFinite(startedAt)) {
        const ts = Number(c?._pipelineTs)
        if (Number.isFinite(ts) && ts > 0) startedAt = ts
      }
      if (!Number.isFinite(startedAt)) continue
      const ms = now - startedAt
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
    persistCacheDirty: deps.isPersistCacheDirty,
    persistEntityCacheNow: deps.persistEntityCacheNow,
    cancelPersistCacheTimer: deps.cancelPersistCacheTimer,
    clearHaDisconnectDebounce,
    clearHaStatusProbe,
    setConnected,
    refs: {
      loading: deps.loading,
      totalCount: deps.totalCount,
      reconnecting,
      haStatus,
      entitiesStale: deps.entitiesStale,
      haQueueDroppedTotal,
      lastQueueDropAt,
      entitiesCacheHydrated: deps.entitiesCacheHydrated,
      entitiesCacheSavedAt: deps.entitiesCacheSavedAt,
    },
    actions: {
      clearHaDisconnectDebounce,
      startHaDisconnectDebounce,
      scheduleHaStatusProbe,
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
    haStatus,
    haQueueDroppedTotal,
    lastQueueDropAt,
    setConnected,
    // 对外暴露的全量初始化也走串行队列，保证缓存 hydrate / 外部调用与 WS 增量互斥
    initStates: initStatesQueued,
    updateStatesBatch,
    emitStateListeners,
    onStateChanged,
    remoteNotifications,
    addRemoteNotification,
    clearRemoteNotifications,
    fetchEntitiesFallback,
    connect,
    disconnect,
    getSocket,
    reconnectForAuthChange,
    ensureWsConnected,
    wsTransportEpoch,
    onHomeModeEvent,
  }
}