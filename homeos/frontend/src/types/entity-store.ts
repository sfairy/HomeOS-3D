/**
 * 实体 store 运行时类型：HA 实体快照、WebSocket 同步、派生索引、缓存与依赖接口。
 * 依赖：@/types/entity（EntitySnapshot）、@/types/redis-status（WsRedisStatus）、vue（Ref）。
 */
import type { HaEntity } from '@homeos/shared'
import type { EntitySnapshot } from '@/types/entity'
import type { WsRedisStatus } from '@/types/redis-status'
import type { Ref } from 'vue'

/** 展示名/读属性用的实体形（完整 HA 状态或户型图轻量快照） */
export type HaEntityView = {
  entity_id?: string
  state?: string
  attributes?: EntitySnapshot['attributes']
  last_changed?: string
  last_updated?: string
}

/** HA 实体运行时快照：线协议 HaEntity + 前端乐观更新标记 */
export interface HaEntityState extends HaEntity {
  attributes?: EntitySnapshot['attributes']
  _optimistic?: boolean
}

/** 实体映射表（entity_id -> HaEntityState） */
export type EntitiesMap = Record<string, HaEntityState>

/** 实体加载阶段：ready=就绪，hydrating=从缓存水合中，rebuilding=重建派生索引中 */
export type EntityLoadPhase = 'ready' | 'hydrating' | 'rebuilding'

/** Redis 连接状态（复用 WebSocket 侧的状态枚举） */
export type RedisStatus = WsRedisStatus

/** onStateChanged / dispatchStateListener 事件载荷 */
export interface EntityStateListenerPayload {
  entity_id: string // 实体 ID
  new_state: HaEntityState | null // 新状态（实体被移除时为 null）
  old_state: HaEntityState | null // 旧状态（首次出现时为 null）
}

/** 实体状态变化监听回调类型 */
export type EntityStateListenerFn = (payload: EntityStateListenerPayload) => void

/** 注册状态监听器的选项 */
export interface RegisterStateListenerOptions {
  entityIds?: string | string[] // 监听的实体 ID（单个、数组或不传=全部）
  domains?: string[] // 监听的实体域列表
}

/** 派发状态监听器时所需的参数（用于计算 old/new 状态） */
export interface EntityStateNotifyArgs {
  cached: HaEntityState | null | undefined // 当前缓存实体
  cachedOld: string | undefined // 缓存中的旧状态值
  newStateValue: string | undefined // 新状态值
  oldState: HaEntityState | null | undefined // 旧实体快照
  newState: HaEntityState | null | undefined // 新实体快照
  changedAttributes?: Record<string, unknown> // 变化的属性集
}

/** 解析监听器 old_state 时所需的参数 */
export interface ResolveListenerOldStateArgs {
  haReportedChange: boolean // 是否为 HA 上报的变化（区分乐观更新回滚）
  oldState: HaEntityState | null | undefined // 传入的旧状态
  cached: HaEntityState | null | undefined // 缓存中的实体
}

/** IndexedDB 实体快照缓存条目 */
export interface EntityCacheSnapshot {
  entities: HaEntityState[] // 缓存的实体列表
  savedAt: number // 缓存保存时间戳（毫秒）
}

/** 缓存条目附带的用户上下文（用于权限隔离） */
export interface EntityCacheAccessUser {
  role?: string // 用户角色
  restrictions?: string[] // 实体访问白名单
}

/** 实体状态监听器日志接口（供注入自定义 logger） */
export interface EntityStateListenerLogger {
  error: (msg: string, ...args: unknown[]) => void // 错误日志
}

/** 监听器刷新依赖（flush 时所需） */
export interface EntityStateListenerFlushDeps {
  logger: EntityStateListenerLogger // 日志记录器
}

/** WebSocket 实体同步运行态（分块接收与增量计数） */
export interface EntitySocketSyncState {
  initialStatesReceived: boolean // 是否已收到初始全量状态
  restFallbackTimer: ReturnType<typeof setTimeout> | null // REST 兜底拉取定时器
  chunkedEntities: HaEntityState[] | null // 分块接收中的实体缓冲
  loadingFallbackTimer: ReturnType<typeof setTimeout> | null // 加载兜底定时器
  incrementalToken: unknown // 增量分块令牌（用于校验分块归属同一批）
  incrementalExpected: number // 本批增量分块预期总数
  /** 已收到的分块实体数（按 WS 事件计数，含尚未 apply 的块） */
  incrementalReceivedCount: number
  /** 尚未完成 merge 的分块 apply 数（requestIdleCallback 异步路径） */
  pendingChunkApplies: number
  /** 本批 INITIAL_STATES_END 是否已进入收尾（防止重叠 END 二次回退） */
  incrementalEndScheduled: boolean
}

/** WebSocket 事件追踪（去重与顺序校验） */
export interface EntitySocketTrack {
  lastSocketEventAt: number // 最近一次 socket 事件时间戳（毫秒）
  lastEventId: number // 最近事件 ID（用于去重）
  stateVersion?: number // 状态版本号（用于并发控制）
}

/** 实体 store 暴露给 socket 处理器的响应式引用集合 */
interface EntitySocketRefs {
  loading: Ref<boolean> // 是否加载中
  totalCount: Ref<number> // 实体总数
  reconnecting: Ref<boolean> // 是否重连中
  entitiesStale: Ref<boolean> // 实体是否过期（需重新拉取）
  haQueueDroppedTotal?: Ref<number> // HA 队列丢弃总数（背压统计）
  lastQueueDropAt?: Ref<string | null> // 最近一次队列丢弃时间
  entitiesCacheHydrated: Ref<boolean> // 是否已完成缓存水合
  entitiesCacheSavedAt?: Ref<number | null> // 缓存最近保存时间戳
  redisStatus: Ref<RedisStatus> // Redis 连接状态
}
/** 实体 store 暴露给 socket 处理器的动作集合 */
interface EntitySocketActions {
  clearHaDisconnectDebounce: () => void // 清除 HA 断连防抖
  startHaDisconnectDebounce: () => void // 启动 HA 断连防抖
  setConnected: (connected: boolean) => void // 设置连接状态
  fetchEntitiesFallback: (
    reason: string,
    opts?: { force?: boolean; quiet?: boolean },
  ) => Promise<boolean> // REST 兜底拉取实体
  initStates: (entities: HaEntityState[], opts?: { force?: boolean; reason?: string }) => void // 初始化实体状态
  beginIncrementalInitialStates?: (expected: number) => unknown // 开始增量分块接收
  mergeInitialStatesChunk?: (list: HaEntityState[], token: unknown, expected: number) => void // 合并分块
  finishIncrementalInitialStates?: (token: unknown, expected: number) => void // 完成分块接收
  onEntitiesStale?: () => void // 实体过期回调
  /** 回滚全部乐观更新（队列丢弃 / 背压时） */
  rollbackAllOptimistic?: () => number
  updateStatesBatch: (changes: Record<string, unknown>[]) => void // 批量更新状态
  schedulePersistEntityCache: () => void // 调度持久化实体缓存（防抖）
  scheduleRebuildDerived: () => void // 调度重建派生索引（防抖）
  entityVisible: (entityId: string) => boolean // 实体对当前用户是否可见
  addRemoteNotification: (data: Record<string, unknown>) => void // 添加远程通知
  refreshSecurityPanelFromSocket: () => void // 从 socket 刷新安防面板
  applySecurityModeFromSocket?: (data: { mode?: string; zones?: string[] }) => void // 从 socket 应用安防模式
  refreshNotificationsFromSocket?: () => void // 从 socket 刷新通知
  refreshEventLogFromSocket?: () => void // 从 socket 刷新事件日志
  appNotify: (message: string, type?: string) => void // 应用内通知
}

/** 模式相关监听器集合（home 模式切换） */
interface EntitySocketModeListeners {
  homeModeListeners: Array<(payload: unknown) => void> // 回家模式监听器列表
}

/** socket 处理器上下文（注入 store 状态与动作） */
export interface EntitySocketHandlerContext {
  logger: EntityStateListenerLogger & {
    info: (msg: string, ...args: unknown[]) => void // 信息日志
    warn: (msg: string, ...args: unknown[]) => void // 警告日志
    debug?: (msg: string, ...args: unknown[]) => void // 调试日志（可选）
  }
  getInitialStatesWaitMs: () => number // 获取初始状态等待超时（毫秒）
  getPreloadPromise: () => Promise<boolean> | null // 获取预加载 Promise
  refs: EntitySocketRefs // 响应式引用集合
  entities: EntitiesMap // 实体映射表
  track: EntitySocketTrack // 事件追踪
  actions: EntitySocketActions // 动作集合
  listeners: EntitySocketModeListeners // 模式监听器
}

/** 路由/布局精简实体投影（组件层只读展示字段） */
export interface EntityProjection {
  entity_id: string // 实体 ID
  state: string // 状态值
  domain: string // 实体域
  friendly_name: string // 友好名称
  isOn: boolean // 是否开启（已归一化判断）
  attributes: Record<string, unknown> // 属性集
}

/** 实体投影变化事件（仅携带 entity_id，组件自行查表） */
export interface EntityProjectionChange {
  entity_id: string // 变化的实体 ID
}

/** 派生索引增量 patch（含旧/新实体快照） */
export interface EntityPatch {
  entity_id: string // 实体 ID
  oldEntity: HaEntityState | null // 旧实体快照（首次出现时为 null）
  newEntity: HaEntityState | null // 新实体快照（被移除时为 null）
}

/** 乐观更新预测值 */
export interface OptimisticPrediction {
  state?: string // 预测状态值
  attributes?: Record<string, unknown> // 预测属性集
}

/** 派生快照（在线数、灯/空调计数、电池/离线列表、传感器索引等） */
export interface DerivedSnapshot {
  online?: number // 在线设备数
  lightCount?: number // 灯具数
  climateCount?: number // 空调/气候设备数
  batteryList?: HaEntityState[] // 电池设备列表
  offlineList?: HaEntityState[] // 离线设备列表
  sensorIndex?: Record<string, string[]> // 传感器索引（域 -> entity_id 列表）
  domainCounts?: Record<string, number> // 域计数
  domainEntityIndex?: Record<string, string[]> // 域实体索引
}

/** 电池设备条目（Worker 增量 patch 传输用） */
export interface DerivedBatteryEntry {
  entity_id: string // 实体 ID
  name: string // 展示名
  level: number // 电量百分比
  domain: string // 实体域
}

/** 离线设备条目（Worker 增量 patch 传输用） */
export interface DerivedOfflineEntry {
  entity_id: string // 实体 ID
  name: string // 展示名
  domain: string // 实体域
  last_changed: string // 最近变化时间
}

/**
 * 派生索引增量 patch（Worker 端计算、主线程增量应用）。
 *
 * 仅携带「受影响域」的索引片段与二级索引（电池/离线）的增删，
 * 避免「全量克隆 + 全量快照往返」的 O(n) 开销：
 * - domainCounts / domainEntityIndex / sensorIndex：key 为变化的域，值为该域最新完整数据；
 * - batteryAdded / batteryRemoved / offlineAdded / offlineRemoved：二级索引的增量增删；
 * - epoch：Worker 基线版本号，用于主线程失步校验。
 */
export interface DerivedSnapshotPatch {
  epoch: number // Worker 基线版本号
  counts: {
    online: number // 在线设备数
    lightCount: number // 灯具数
    climateCount: number // 空调/气候设备数
  }
  domainCounts: Record<string, number> // 受影响域 -> 新计数
  domainEntityIndex: Record<string, string[]> // 受影响域 -> 新实体数组
  sensorIndex: Record<string, string[]> // 受影响 sensor 域 -> 新实体数组
  batteryAdded: DerivedBatteryEntry[] // 新增电池设备
  batteryRemoved: string[] // 移除的电池设备 ID
  offlineAdded: DerivedOfflineEntry[] // 新增离线设备
  offlineRemoved: string[] // 移除的离线设备 ID
}

/** 派生快照目标（响应式容器，供 store 持有） */
export interface DerivedSnapshotTargets {
  onlineCount: Ref<number> // 在线设备数
  lightCount: Ref<number> // 灯具数
  climateCount: Ref<number> // 空调/气候设备数
  sensorIndex: Map<string, string[]> // 传感器索引
  domainCounts: Map<string, number> // 域计数
  domainEntityIndex: Map<string, Set<string>> // 域实体索引
  batteryDevices: HaEntityState[] // 电池设备列表
  offlineDevices: HaEntityState[] // 离线设备列表
}

/** 派生 Worker API（Web Worker 中执行重建/增量 patch） */
export interface DerivedWorkerApi {
  rebuildDerivedSnapshot: (
    entities: EntitiesMap,
    opts?: { deferSecondary?: boolean },
  ) => Promise<{ epoch: number; snapshot: DerivedSnapshot }> // 全量重建派生快照（建立基线）
  patchDerivedSnapshot: (
    patches: EntityPatch[],
    opts?: { deferSecondary?: boolean; expectedEpoch: number },
  ) => Promise<DerivedSnapshotPatch | null> // 增量 patch 派生索引（无基线/失步时返回 null）
}

/** 实体 store 日志接口 */
export interface EntityStoreLogger {
  debug: (message: string, ...args: unknown[]) => void // 调试日志
  info: (message: string, ...args: unknown[]) => void // 信息日志
  warn: (message: string, ...args: unknown[]) => void // 警告日志
  error: (message: string, ...args: unknown[]) => void // 错误日志
}

/** 实体初始化选项 */
export interface EntityInitOptions {
  fromCache?: boolean // 是否来自缓存水合
  force?: boolean // 是否强制覆盖
  reason?: string // 初始化原因（日志用）
  deferredRemainder?: HaEntityState[] | null // 延迟处理的剩余实体
  quiet?: boolean // 是否静默（不触发通知）
}

/** 快照接受选项（用于判断是否采纳新快照） */
export interface SnapshotAcceptOptions {
  force?: boolean // 是否强制接受
  fromCache?: boolean // 是否来自缓存
  quiet?: boolean // 是否静默
  reason?: string // 接受原因（日志用）
}
/** 实体初始化依赖（注入给 init 函数） */
export interface EntityInitDeps {
  entities: EntitiesMap // 实体映射表
  friendlyNamesMap: Record<string, string> // 友好名称映射
  totalCount: Ref<number> // 实体总数
  loading: Ref<boolean> // 加载状态
  entitiesCacheHydrated: Ref<boolean> // 缓存水合状态
  entitiesStale: Ref<boolean> // 实体过期状态
  entityLoadProgress: Ref<number> // 加载进度（0-100）
  entityLoadPhase: Ref<EntityLoadPhase> // 加载阶段
  entityVisible: (entityId: string) => boolean // 实体可见性判断
  logger: EntityStoreLogger // 日志记录器
  initStatesBatchSize: () => number // 初始化批次大小
  largeEntityThreshold: () => number // 大实体数阈值（触发分块/Worker）
  scheduleRebuildDerived: () => void // 调度重建派生
  setConnected: (status: boolean) => void // 设置连接状态
  clearAllEntities: () => void // 清空所有实体
  cancelPersistCacheTimer: () => void // 取消缓存持久化定时器
  persistEntityCacheNow: () => Promise<void> // 立即持久化缓存
  /** 当前访问权限指纹（role + restrictions），变化时强制接受缩小快照（B5 权限收紧清陈旧数据） */
  restrictionsVersion?: () => string
}

/** 实体动作依赖（注入给 callService 等动作） */
export interface EntityActionsDeps {
  apiClient: {
    post: (url: string, data?: unknown, config?: { timeout?: number }) => Promise<{ data: unknown }> // POST 请求
  }
  entities: EntitiesMap // 实体映射表
  forecasts: Record<string, unknown[]> // 预测数据缓存
  logger: EntityStoreLogger // 日志记录器
  applyOptimistic: (entityId: string, predicted: OptimisticPrediction) => void // 应用乐观更新
  rollbackOptimistic: (entityId: string) => void // 回滚乐观更新
  bumpEntityStateRevision: (entityId?: string) => void // 触发状态版本号变更（通知监听器）
  emitStateListeners: (
    entityId: string,
    newState: HaEntityState | null,
    oldState: HaEntityState | null,
  ) => void // 派发状态监听事件
  canControl: (entityId: string) => boolean // 判断实体是否可控
  isAuthenticated: () => boolean // 是否已认证
  isHaConnected: () => boolean // HA 是否已连接
  callDedupWindowMs: () => number // 调用去重窗口（毫秒）
  /** 派生索引增量 patch（REST 回填覆盖缓存时同步维护，避免派生索引陈旧） */
  patchDerivedChanges?: (changes: EntityPatch[]) => void
  /** 投影增量 patch（REST 回填覆盖缓存时同步维护） */
  patchProjectionsFromChanges?: (changes: Array<{ entity_id: string }>) => void
}

/** 乐观更新依赖 */
export interface EntityOptimisticDeps {
  entities: EntitiesMap // 实体映射表
  optimisticTtlMs: () => number // 乐观更新 TTL（毫秒）
  patchDerivedChanges: (changes: EntityPatch[]) => void // patch 派生索引
  patchProjectionsFromChanges: (changes: EntityProjectionChange[], entitiesMap: EntitiesMap) => void // patch 投影
  emitStateListeners: (
    entityId: string,
    newState: HaEntityState | null,
    oldState: HaEntityState | null,
  ) => void // 派发状态监听事件
  bumpEntityStateRevision: (entityId?: string) => void // 触发状态版本号变更
}

/** 派生索引依赖 */
export interface EntityDerivedDeps {
  getEntities: () => EntitiesMap // 获取实体映射表
  getChunkSize: () => number // 获取分块大小
  getRebuildDebounceMs?: () => number // 获取重建防抖时间（毫秒）
  getPatchDebounceMs?: () => number // 获取 patch 防抖时间（毫秒）
  getDeferSecondaryIndexes: () => boolean // 是否延迟构建二级索引
  getUseWorkerDerived?: () => boolean // 是否使用 Worker 计算派生
  batteryDevices: HaEntityState[] // 电池设备列表
  offlineDevices: HaEntityState[] // 离线设备列表
  onProgress?: () => void // 进度回调
  onDerivedComplete?: () => void // 派生完成回调
  onSecondaryComplete?: () => void // 二级索引完成回调
}

/** REST 兜底拉取依赖 */
export interface EntityRestFallbackDeps {
  apiClient: {
    get: (
      url: string,
      config?: { params?: Record<string, unknown>; timeout?: number },
    ) => Promise<{ data: Record<string, unknown> }> // GET 请求
  }
  entities: EntitiesMap // 实体映射表
  totalCount: Ref<number> // 实体总数
  connected: Ref<boolean> // 连接状态
  entitiesStale: Ref<boolean> // 实体过期状态
  entityVisible: (entityId: string) => boolean // 实体可见性判断
  countVisibleEntities: (entityList: HaEntityState[]) => number // 统计可见实体数
  shouldAcceptEntitySnapshot: (incomingVisible: number, opts?: SnapshotAcceptOptions) => boolean // 是否接受快照
  initStates: (entityList: HaEntityState[], opts?: EntityInitOptions) => void // 初始化状态
  initStatesBatchSize: () => number // 初始化批次大小
  setConnected: (status: boolean) => void // 设置连接状态
  scheduleRebuildDerived: () => void // 调度重建派生
  schedulePersistEntityCache: () => void // 调度持久化缓存
  ingestEntitySnapshot: (entity: HaEntityState) => void // 摄入单个实体快照
  socketTrack: EntitySocketTrack // 事件追踪
  logger: EntityStoreLogger // 日志记录器
  isAuthenticated?: () => boolean // 是否已认证
  ensureWsConnected?: () => void // 确保 WS 已连接
}

/** 实体 store 性能统计 */
export interface EntityPerfStats {
  derivedRebuilds: number // 派生索引重建次数
  wsBatchCount: number // WS 批量处理次数
  lastWsBatchSize: number // 最近一次 WS 批量大小
  listenerCount: number // 状态监听器数量
  /** 关键域 apply 次数 */
  criticalApplyCount: number
  /** 最近一次关键域 apply 耗时（毫秒） */
  lastCriticalApplyMs: number
  /** 最近一次非关键 apply 耗时（毫秒） */
  lastSensorApplyMs: number
}

/** 远程通知条目（展示用） */
export interface RemoteNotificationEntry {
  id: string // 通知唯一 ID
  level: string // 通知级别（如 info / warning / error）
  message: string // 通知内容
  source: string // 通知来源
  time: string // 展示时间
  createdAt?: string // 创建时间（ISO 字符串）
  deliveredAt?: string // 投递时间（ISO 字符串）
  read: boolean // 是否已读
}

/** 远程通知载荷（WS 推送 / API 返回原始形态） */
export interface RemoteNotificationPayload {
  id?: string // 通知唯一 ID
  level?: string // 通知级别
  message?: string // 通知内容
  source?: string // 通知来源
  createdAt?: string | Date // 创建时间
  deliveredAt?: string | Date // 投递时间
  read?: boolean // 是否已读
}

/** 实体订阅依赖 */
export interface EntitySubscriptionDeps {
  logger: EntityStoreLogger // 日志记录器
  perfStats: EntityPerfStats // 性能统计
}

/** 实体传输层依赖（WS / REST 连接管理） */
export interface EntityTransportDeps {
  logger: EntityStoreLogger // 日志记录器
  loading: Ref<boolean> // 加载状态
  totalCount: Ref<number> // 实体总数
  entities: EntitiesMap // 实体映射表
  track: EntitySocketTrack // 事件追踪
  getInitialStatesWaitMs: () => number // 初始状态等待超时
  hydrateFromEntityCache: () => Promise<boolean> // 从缓存水合
  fetchEntitiesFallback: (reason: string, opts?: { quiet?: boolean }) => Promise<boolean> // REST 兜底
  isAuthenticated?: () => boolean // 是否已认证
  refreshRedisFromHealth?: () => Promise<void> // 从健康检查刷新 Redis 状态
  persistCacheDirty?: () => boolean // 缓存是否有未持久化变更
  persistEntityCacheNow: () => Promise<void> // 立即持久化缓存
  cancelPersistCacheTimer: () => void // 取消持久化定时器
  clearHaDisconnectDebounce: () => void // 清除 HA 断连防抖
  setConnected: (status: boolean) => void // 设置连接状态
  refs: EntitySocketRefs // 响应式引用集合
  actions: EntitySocketActions // 动作集合
  listeners: EntitySocketModeListeners // 模式监听器
  onTransportReady?: () => void // 传输就绪回调
}