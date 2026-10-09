/**
 * @file entities.store.ts
 * @module frontend/src/stores
 */
import { getEntityDomain, isEntityAllowed } from '@homeos/shared'
import { defineStore } from 'pinia'
import { ref, toRaw, shallowReactive, reactive, watch } from 'vue'
import { apiClient } from '@/services/api/index'
import { resyncEntities } from '@/services/api/entities'
import { useAuthStore } from '@/stores/auth.store'
import { useLayoutStore } from '@/stores/layout.store'
import { logger } from '@/utils/core/logger'
import {
  getFrontendConfig,
  getLargeEntityThreshold,
  getWorkerDerivedThreshold,
} from '@/utils/config/frontend-config'
import type { EntitiesMap, EntityLoadPhase, HaEntityState } from '@/types/entity-store'
import { buildEntityCacheKey } from '@/utils/entity/idb-cache'
import { createEntityOptimisticState } from '@/stores/entities/entity-store-optimistic.util'
import { getPendingListenerCount, getStateListenerStats } from '@/utils/entity/state-listener'
import { applyEntityStateUpdate } from '@/utils/entity/state-update'
import type { WsDeltaChange } from '@/utils/entity/state-delta.util'
import {
  shouldNotifyStateChange,
  resolveListenerOldState,
  haStateChanged,
} from '@/utils/entity/state-notify.util'
import { createEntityCacheHelpers } from '@/stores/entities/entity-store-cache'
import { createStoreDerivedState } from '@/stores/entities/entity-store-derived'
import { createEntityActions } from '@/stores/entities/entity-store-actions'
import {
  setProjectionScope,
  patchProjectionsFromChanges,
  clearProjections,
} from '@/stores/entities/entity-projection'
import {
  createEntityWsState,
  type EntityCachePersistBridge,
  type EntityInitLoadReadyBridge,
} from '@/stores/entities/create-entity-ws-state'

/**
 * 实体状态管理 Store
 *
 * HomeOS 前端最核心的数据层，负责管理所有 Home Assistant 实体的实时状态。
 * 通过 Socket.IO 长连接接收 HA 状态推送，并提供服务调用（如开关灯、调节温度）的能力。
 *
 * 核心架构：
 * - **Socket.IO 连接**：与服务端 WebSocket 网关建立长连接，接收 initial_states（全量）和 state_changed（增量）
 * - **即时更新**：每条 state_changed 立即写入 entities 并通知监听器
 * - **Weather 预报**：支持 weather 实体的 get_forecasts 服务调用，缓存预报数据
 *
 * 数据流：
 * 1. connect(token) → 建立 Socket.IO 连接
 * 2. 'initial_states' → 全量写入 entities 对象
 * 3. 'state_changed' → 即时更新实体状态
 * 4. callService() → HTTP POST /services/call
 *
 * 依赖：
 * - @homeos/shared：实体域解析与鉴权（getEntityDomain / isEntityAllowed）
 * - @/services/api：HTTP 客户端与实体同步接口
 * - @/stores/auth.store：用户角色与实体访问权限
 * - @/stores/layout.store：布局配置（影响缓存 hydration 分区）
 * - @/utils/config/frontend-config：阈值与批量大小等可调参数
 * - @/stores/entities/* 拆分模块：WS 状态机 / 缓存 / 派生索引 / 动作 / 投影
 */
/** useEntitiesStore：Pinia store 工厂，状态与动作见定义。 */
export const useEntitiesStore = defineStore('entities', () => {
  /**
   * 判断当前用户是否可见指定实体（受角色与限制列表约束）
   * @param entityId - 实体完整 ID
   * @returns 是否可见
   */
  function entityVisible(entityId: string): boolean {
    const auth = useAuthStore()
    return isEntityAllowed(entityId, auth.accessUser())
  }

  /** 是否正在加载初始实体（控制全局加载遮罩） */
  const loading = ref(true)
  /** 实体数据是否陈旧（WS 断开过久或服务端标记 stale，需 REST 回退刷新） */
  const entitiesStale = ref(false)
  /** IndexedDB 缓存是否已 hydrate 到内存 */
  const entitiesCacheHydrated = ref(false)
  /** 上次缓存持久化写入时间戳（毫秒） */
  const entitiesCacheSavedAt = ref<number | null>(null)
  /** 实体加载进度（0-100，用于加载进度条） */
  const entityLoadProgress = ref(100)
  /** 当前加载阶段：'ready' | 'hydrating' | 'rebuilding' */
  const entityLoadPhase = ref<EntityLoadPhase>('ready')

  /** 性能诊断计数（须在 derived onComplete 之前声明） */
  const perfStats = reactive({
    derivedRebuilds: 0,
    wsBatchCount: 0,
    lastWsBatchSize: 0,
    listenerCount: 0,
    criticalApplyCount: 0,
    lastCriticalApplyMs: 0,
    lastSensorApplyMs: 0,
  })

  /** 大实体阈值：超过此数量时启用分批加载与 Worker 派生重建 */
  function largeEntityThreshold() {
    return getLargeEntityThreshold()
  }
  /** 初始状态批量写入大小（每批实体数量） */
  function initStatesBatchSize() {
    return getFrontendConfig().initStatesBatchSize ?? 400
  }
  /** 乐观更新有效期（毫秒）：超时后回滚到服务端确认态 */
  function optimisticTtlMs() {
    return getFrontendConfig().optimisticTtlMs ?? 6000
  }

  /** 实体状态主存储：entity_id → HaEntityState（shallowReactive，键级响应） */
  const entities = shallowReactive<EntitiesMap>({})
  /** 天气预报缓存：entity_id → 预报数组 */
  const forecasts = shallowReactive<Record<string, unknown[]>>({})
  /** 友好名称映射：entity_id → 显示名 */
  const friendlyNamesMap = shallowReactive<Record<string, string>>({})
  /** 电池设备列表（派生索引，由 derived rebuilder 维护） */
  const batteryDevices = shallowReactive<HaEntityState[]>([])
  /** 离线设备列表（派生索引，由 derived rebuilder 维护） */
  const offlineDevices = shallowReactive<HaEntityState[]>([])
  /** 可见实体总数 */
  const totalCount = ref(0)
  /** 任意可见实体写入后递增，供 UI 刷新（不依赖 derived 索引是否 relevant） */
  const entityStateRevision = ref(0)
  /** 按实体版本号：entity_id -> 最近变更版本（粒度化失效，供按实体订阅的派生计算使用） */
  const entityRevisions = shallowReactive<Record<string, number>>({})
  /** 按域版本号：domain -> 最近变更版本（粒度化失效，供按域订阅的派生计算使用） */
  const domainRevisions = shallowReactive<Record<string, number>>({})

  /**
   * 递增状态版本号，触发依赖该值的 UI 计算属性重算。
   * 粒度化失效（Task 23）：传入 entityId 时仅递增该实体与其所属域的版本号，
   * 依赖 getEntityRevision / getDomainRevision 的派生计算只重算受影响范围，
   * 未受影响区域的派生计算保持有效；全局 entityStateRevision 保留为兜底兼容。
   * @param entityId - 发生变更的实体 ID（可选；缺省时仅递增全局版本号）
   */
  function bumpEntityStateRevision(entityId?: string) {
    entityStateRevision.value++
    if (!entityId) return
    entityRevisions[entityId] = (entityRevisions[entityId] ?? 0) + 1
    const domain = getEntityDomain(entityId)
    if (domain) domainRevisions[domain] = (domainRevisions[domain] ?? 0) + 1
  }

  /**
   * 批量递增版本号：全量/回退批次一次调用完成。
   * 全局 entityStateRevision 仅递增一次；实体与域各自去重后递增，
   * 避免 N 实体批次产生 3×N 次响应式写（与逐实体 bump 语义等价，
   * 版本号仅作单调失效计数，同宏任务内去重不影响派生重算结果）。
   */
  function bumpEntityStateRevisionBatch(entityIds: string[]) {
    if (!entityIds?.length) return
    entityStateRevision.value++
    const seenDomains = new Set<string>()
    for (let i = 0; i < entityIds.length; i++) {
      const entityId = entityIds[i]
      if (!entityId) continue
      const prev = entityRevisions[entityId]
      if (prev !== undefined) {
        entityRevisions[entityId] = prev + 1
      } else {
        entityRevisions[entityId] = 1
      }
      const domain = getEntityDomain(entityId)
      if (domain && !seenDomains.has(domain)) {
        seenDomains.add(domain)
        domainRevisions[domain] = (domainRevisions[domain] ?? 0) + 1
      }
    }
  }

  /**
   * 获取实体最近变更版本号（读取建立响应式依赖：仅该实体变更时重算）。
   * @param entityId - 实体 ID
   * @returns 实体版本号
   */
  function getEntityRevision(entityId: string): number {
    return entityRevisions[entityId] ?? 0
  }

  /**
   * 获取实体域最近变更版本号（读取建立响应式依赖：仅该域内实体变更时重算）。
   * @param domain - 实体域（如 light / sensor）
   * @returns 域版本号
   */
  function getDomainRevision(domain: string): number {
    return domainRevisions[domain] ?? 0
  }

  // 缓存持久化桥接：初始为空实现，在 createEntityCacheHelpers 返回后被回填，
  // 避免 createEntityWsState 与 createEntityCacheHelpers 之间的循环依赖
  const cachePersistBridge: EntityCachePersistBridge = {
    cancelPersistCacheTimer: () => {},
    persistEntityCacheNow: async () => {},
  }
  // 初始加载就绪桥接：初始为空实现，在 createEntityInitHelpers 返回后被回填
  const initLoadReadyBridge: EntityInitLoadReadyBridge = { markEntityLoadReady: () => {} }
  const {
    derivedEpoch,
    cachedDomains,
    onlineCount,
    lightCount,
    climateCount,
    sensorIndex,
    domainCounts,
    domainEntityIndex,
    domainEpochs,
    getDomainEpoch,
    derivedRebuilder,
    resetDerivedIndexes,
    rebuildDerivedData,
    scheduleRebuildDerived,
    patchDerivedChanges,
  } = createStoreDerivedState({
    getEntities: () => toRaw(entities),
    getChunkSize: () => getFrontendConfig().rebuildChunkSize,
    getRebuildDebounceMs: () => getFrontendConfig().rebuildDebounceMs ?? 80,
    getDeferSecondaryIndexes: () => totalCount.value >= getWorkerDerivedThreshold(),
    getUseWorkerDerived: () => totalCount.value >= getWorkerDerivedThreshold(),
    batteryDevices,
    offlineDevices,
    onProgress: () => {
      if (entityLoadPhase.value !== 'rebuilding') return
      const { ratio } = derivedRebuilder.getRebuildProgress()
      entityLoadProgress.value = 70 + Math.round(ratio * 30)
    },
    onDerivedComplete: () => {
      perfStats.derivedRebuilds++
      if (entityLoadPhase.value === 'rebuilding') initLoadReadyBridge.markEntityLoadReady()
    },
    onSecondaryComplete: () => {
      perfStats.derivedRebuilds++
    },
  })

  /**
   * 设置 WS 连接状态
   * @param status - 是否已连接
   */
  function setConnected(status: boolean): void {
    wsState.setConnected(status)
  }

  /**
   * 构建当前用户对应的实体缓存 key（含用户名与访问限制哈希）
   * @returns IndexedDB 缓存 key 字符串
   */
  function currentEntityCacheKey() {
    const auth = useAuthStore()
    return buildEntityCacheKey(auth.user, auth.accessUser())
  }

  /** 清空内存实体与派生索引 */
  function clearAllEntities() {
    // 通过响应式代理删除，确保已渲染的 computed（部件 / 热点等）能感知清空
    for (const key of Object.keys(entities)) delete entities[key]
    for (const key of Object.keys(friendlyNamesMap)) delete friendlyNamesMap[key]
    batteryDevices.splice(0, batteryDevices.length)
    offlineDevices.splice(0, offlineDevices.length)
    resetDerivedIndexes()
    clearProjections()
    totalCount.value = 0
    loading.value = false
  }

  // WS 状态机实例：在下方 createEntityWsState 调用中赋值（提升变量以让 setConnected 提前引用）
  let wsState!: ReturnType<typeof createEntityWsState>

  const {
    cancelPersistCacheTimer,
    persistEntityCacheNow,
    schedulePersistEntityCache,
    markEntityCacheDirty,
    hydrateFromEntityCache,
    isPersistCacheDirty,
  } = createEntityCacheHelpers({
    entities,
    entitiesCacheHydrated,
    entitiesCacheSavedAt,
    currentEntityCacheKey,
    initStates: (...args) => wsState.initStates(...args),
    getLayoutConfig: () => {
      try {
        return useLayoutStore().layoutConfig
      } catch (err) {
        logger.warn('[实体 Store] getLayoutConfig 失败(ui store 未就绪?)', err)
        return undefined
      }
    },
    logger,
  })

  // 回填缓存持久化桥接，供 createEntityWsState 在断开连接 / 页面隐藏时调用
  cachePersistBridge.cancelPersistCacheTimer = cancelPersistCacheTimer
  cachePersistBridge.persistEntityCacheNow = persistEntityCacheNow

  // 乐观更新须在 buildStateUpdateDeps 之前声明（getStateUpdateDeps 延迟求值）
  const optimisticRef: {
    optimisticState: ReturnType<typeof createEntityOptimisticState>['optimisticState']
    clearOptimistic: ReturnType<typeof createEntityOptimisticState>['clearOptimistic']
    rollbackAllOptimistic: ReturnType<typeof createEntityOptimisticState>['rollbackAllOptimistic']
  } = {
    optimisticState: new Map(),
    clearOptimistic: () => {},
    rollbackAllOptimistic: () => 0,
  }
  /**
   * 构建状态更新依赖对象（供 updateState 和 updateStatesBatch 共用）
   */
  function buildStateUpdateDeps() {
    return {
      entities,
      totalCount,
      entityVisible,
      optimisticState: optimisticRef.optimisticState,
      clearOptimistic: optimisticRef.clearOptimistic,
      scheduleRebuildDerived,
      patchDerivedChanges,
      patchProjectionsFromChanges: (changes: Array<{ entity_id: string }>) =>
        patchProjectionsFromChanges(changes, entities),
      entitiesCacheHydrated,
      schedulePersistEntityCache,
      markEntityCacheDirty,
      haStateChanged,
      shouldNotifyStateChange,
      resolveListenerOldState,
      logger,
      bumpEntityStateRevision,
      bumpEntityStateRevisionBatch,
    }
  }

  /**
   * 即时应用状态变更（对齐参考版：服务端逐条 state_changed，前端立即写入）
   */
  function updateState(data: WsDeltaChange): void {
    applyEntityStateUpdate(buildStateUpdateDeps(), data)
  }

  // 创建 WS 状态机：管理 Socket.IO 连接、初始状态同步、增量推送、REST 回退等
  wsState = createEntityWsState({
    apiClient,
    logger,
    entities,
    friendlyNamesMap,
    totalCount,
    loading,
    entitiesStale,
    entitiesCacheHydrated,
    entitiesCacheSavedAt,
    entityLoadProgress,
    entityLoadPhase,
    entityVisible,
    perfStats,
    clearAllEntities,
    scheduleRebuildDerived,
    schedulePersistEntityCache,
    markEntityCacheDirty,
    cancelPersistCacheTimer,
    persistEntityCacheNow,
    hydrateFromEntityCache,
    isPersistCacheDirty,
    getStateUpdateDeps: buildStateUpdateDeps,
    ingestEntitySnapshot: (ent) => {
      const eid = ent.entity_id
      if (!eid) return
      updateState({
        entity_id: eid,
        new_state: ent,
        old_state: entities[eid] ?? null,
      })
    },
    isAuthenticated: () => useAuthStore().isAuthenticated,
    getEnsureEntity: () => ensureEntity,
    initStatesBatchSize,
    largeEntityThreshold,
    cachePersistBridge,
    initLoadReadyBridge,
    optimisticBridge: optimisticRef,
  })

  const {
    connected,
    reconnecting,
    haQueueDroppedTotal,
    lastQueueDropAt,
    redisStatus,
    initStates,
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
  } = wsState

  // 乐观更新（Optimistic UI，毫秒级感知反馈）

  const {
    applyOptimistic,
    clearOptimistic,
    rollbackOptimistic,
    rollbackAllOptimistic,
    optimisticState,
  } = createEntityOptimisticState({
    entities,
    optimisticTtlMs,
    patchDerivedChanges,
    patchProjectionsFromChanges,
    emitStateListeners,
    bumpEntityStateRevision,
    fetchEntityState: async (entityId: string) => {
      const { fetchEntityById } = await import('@/utils/entity/cold-fetch.util')
      const fetched = (await fetchEntityById(entityId)) as HaEntityState | null | undefined
      return fetched?.entity_id ? fetched : null
    },
  })
  // 回填乐观更新引用，供 buildStateUpdateDeps / WS 事件延迟求值
  optimisticRef.optimisticState = optimisticState
  optimisticRef.clearOptimistic = clearOptimistic
  optimisticRef.rollbackAllOptimistic = rollbackAllOptimistic

  /**
   * 根据 entity_id 获取实体状态
   * @param {string} entityId - 实体完整 ID
   * @returns {Object|undefined} 实体状态对象
   */
  function getEntity(entityId: string): HaEntityState | undefined {
    return entities[entityId]
  }

  /** 将冷补全结果写入缓存并同步派生索引 / 投影 / 监听器 */
  function hydrateColdEntity(fetched: HaEntityState): HaEntityState | null {
    if (!fetched?.entity_id || !entityVisible(fetched.entity_id)) return null
    const id = fetched.entity_id
    const prev = entities[id] ?? null
    entities[id] = fetched
    patchDerivedChanges([{ entity_id: id, oldEntity: prev, newEntity: fetched }])
    patchProjectionsFromChanges([{ entity_id: id }], entities)
    bumpEntityStateRevision(id)
    emitStateListeners(id, fetched, prev)
    return fetched
  }

  /** 冷实体按需 REST 补全（WS 未推送或尚未 hydrate）；404 由 cold-fetch 负缓存抑制刷屏 */
  async function ensureEntity(entityId: string): Promise<HaEntityState | null> {
    if (!entityId) return null
    const existing = entities[entityId]
    if (existing) return existing
    const { fetchEntityById, clearColdFetchMissing } = await import(
      '@/utils/entity/cold-fetch.util'
    )
    const fetched = (await fetchEntityById(entityId)) as HaEntityState | null | undefined
    if (fetched?.entity_id) {
      clearColdFetchMissing(fetched.entity_id)
      return hydrateColdEntity(fetched)
    }
    return null
  }

  /**
   * 批量冷实体补全（POST /entities/batch/get，缺失不产生单条 404）。
   * @returns 本次成功 hydrate 的实体列表
   */
  async function ensureEntities(entityIds: string[]): Promise<HaEntityState[]> {
    const ids = [...new Set((entityIds || []).filter(Boolean).map(String))].filter(
      (id) => !entities[id],
    )
    if (!ids.length) return []
    const { fetchEntitiesByIds, clearColdFetchMissing } = await import(
      '@/utils/entity/cold-fetch.util'
    )
    const fetchedMap = await fetchEntitiesByIds(ids)
    const out: HaEntityState[] = []
    for (const fetched of fetchedMap.values()) {
      clearColdFetchMissing(fetched.entity_id)
      const hydrated = hydrateColdEntity(fetched)
      if (hydrated) out.push(hydrated)
    }
    return out
  }

  /** 服务调用去重窗口（毫秒）：同一 entityId + service + data 在窗口内复用同一 Promise */
  const callDedupWindow = () => getFrontendConfig().callDedupWindowMs

  const { callService, fetchForecasts, isEntityCallPending } = createEntityActions({
    apiClient,
    entities,
    forecasts,
    logger,
    applyOptimistic,
    rollbackOptimistic,
    bumpEntityStateRevision,
    emitStateListeners,
    // REST 回填覆盖缓存时同步维护派生索引与投影
    patchDerivedChanges,
    patchProjectionsFromChanges: (changes) => patchProjectionsFromChanges(changes, entities),
    canControl: (entityId: string) => useAuthStore().canControl(entityId),
    isAuthenticated: () => useAuthStore().isAuthenticated,
    isHaConnected: () => connected.value,
    callDedupWindowMs: callDedupWindow,
  })
  /** 页面隐藏 / 即将卸载时立即持久化缓存，降低 30s 节流窗口内崩溃丢变更风险 */
  function flushEntityCacheIfDirty() {
    if (isPersistCacheDirty()) {
      persistEntityCacheNow().catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        logger.debug('页面退出前缓存持久化失败', msg)
      })
    }
  }

  function handleVisibilityChange() {
    if (document.hidden) flushEntityCacheIfDirty()
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushEntityCacheIfDirty)
  }

  // 权限（角色 / ACL restrictions）变化后强制重拉实体全量：
  // 若仅靠 shouldAcceptEntitySnapshot 的 quiet 拒绝，权限收紧后已无权查看的陈旧实体将残留
  let lastAccessFingerprint = ''
  watch(
    () => {
      const auth = useAuthStore()
      return `${auth.role}|${[...(auth.restrictions || [])].sort().join(',')}`
    },
    (fingerprint) => {
      if (fingerprint === lastAccessFingerprint) return
      lastAccessFingerprint = fingerprint
      if (!connected.value) return
      void fetchEntitiesFallback('实体权限变更', { force: true, quiet: true })
    },
  )

  /** 手动从服务端重新拉取实体（设置页「刷新实体」） */
  async function refreshEntitiesFromServer() {
    loading.value = true
    entitiesStale.value = false
    cancelPersistCacheTimer()
    try {
      const res = await resyncEntities({ timeout: 120000 })
      const serverCount = res.data?.storeCount ?? res.data?.haCount ?? 0
      if (serverCount > 0) {
        logger.info(`服务端已重同步 ${serverCount} 个实体`)
      }
    } catch (e: unknown) {
      logger.warn('服务端 resync 失败,尝试 REST 回退', e instanceof Error ? e.message : e)
    }
    const ok = await fetchEntitiesFallback('手动刷新', { force: true })
    if (ok && totalCount.value > 0) {
      loading.value = false
      return { ok: true, count: totalCount.value }
    }
    disconnect()
    await connect()
    // 等待 WS 恢复后首次初始快照到达：整体超时（15s）+ 条件满足提前退出，
    // 替代原固定 30×500ms 空轮询（无超时进度、无法感知连接事件）
    const waitStartedAt = Date.now()
    const MAX_REFRESH_WAIT_MS = 15_000
    while (Date.now() - waitStartedAt < MAX_REFRESH_WAIT_MS) {
      if (totalCount.value > 100) break
      if (connected.value && totalCount.value > 0) break
      await new Promise((r) => setTimeout(r, 250))
    }
    loading.value = false
    return { ok: totalCount.value > 0, count: totalCount.value }
  }

  return {
    connected,
    reconnecting,
    loading,
    entitiesStale,
    haQueueDroppedTotal,
    lastQueueDropAt,
    entitiesCacheHydrated,
    entitiesCacheSavedAt,
    redisStatus,
    entityLoadProgress,
    entityLoadPhase,
    entities,
    forecasts,
    friendlyNamesMap,
    setConnected,
    initStates,
    updateState,
    updateStatesBatch,
    scheduleRebuildDerived,
    getEntity,
    ensureEntity,
    ensureEntities,
    callService,
    isEntityCallPending,
    onStateChanged,
    fetchForecasts,
    connect,
    disconnect,
    refreshRedisFromHealth,
    reconnectForAuthChange,
    ensureWsConnected,
    wsTransportEpoch,
    refreshEntitiesFromServer,
    setEntityProjectionScope: setProjectionScope,
    rollbackAllOptimistic,
    onHomeModeEvent,
    remoteNotifications,
    clearRemoteNotifications,
    batteryDevices,
    offlineDevices,
    onlineCount,
    lightCount,
    climateCount,
    derivedEpoch,
    entityStateRevision,
    /** 按实体版本号（粒度化失效：仅该实体变更时重算依赖方） */
    entityRevisions,
    /** 按域版本号（粒度化失效：仅该域实体变更时重算依赖方） */
    domainRevisions,
    getEntityRevision,
    getDomainRevision,
    perfStats,
    getPendingListenerCount,
    getStateListenerStats,
    getSocket,
    totalCount,
    sensorIndex,
    domainCounts,
    domainEntityIndex,
    domainEpochs,
    getDomainEpoch,
    rebuildDerivedData,
    /** 计算属性：域列表（由派生索引增量维护的缓存，避免每次全量遍历 O(n)） */
    get domains() {
      return cachedDomains.value
    },
  }
})