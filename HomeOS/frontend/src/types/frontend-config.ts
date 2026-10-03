/**
 * 后端 /system/config/public 下发的可公开配置分区。
 * 前端启动时拉取，用于初始化各类运行参数（API 超时、缓存策略、UI 缩放等）。
 */

/** 前端运行参数分区 */
export interface FrontendSection {
  apiTimeoutMs: number // API 请求超时（毫秒）
  apiRetryMax: number // API 请求最大重试次数
  haDisconnectDebounceMs: number // HA 断连判定防抖时间（毫秒）
  initialStatesWaitMs: number // 初始实体状态等待超时（毫秒）
  entityCacheEnabled: boolean // 是否启用实体缓存
  entityCacheMaxAgeMs: number // 实体缓存最大存活时间（毫秒）
  entityCacheSaveDebounceMs: number // 实体缓存保存防抖时间（毫秒）
  rebuildChunkSize: number // 重建派生索引的分块大小
  rebuildDebounceMs: number // 重建派生索引防抖时间（毫秒）
  maxListeners: number // 单实体最大状态监听器数量
  callDedupWindowMs: number // 服务调用去重窗口（毫秒）
  maxRemoteNotifications: number // 远程通知最大保留条数
  sessionRefreshHours: number // 会话刷新间隔（小时）
  defaultWidgetPollMs: number // 组件默认轮询间隔（毫秒）
  widgetPollIntervals: Record<string, number> // 各组件轮询间隔（毫秒，按组件 key 索引）
  optimisticTtlMs: number // 乐观更新存活时间（毫秒）
  largeEntityThreshold: number // 大实体数阈值（超过则触发分块/Worker）
  workerDerivedThreshold: number // 启用 Worker 计算派生的实体数阈值
  initStatesBatchSize: number // 初始化状态批次大小
  apiRetryDelayMs: number // API 重试间隔（毫秒）
}

/** UI 分区（缩放与屏保） */
interface UiSection {
  scaleBaseWidth: number // 缩放基准宽度（像素）
  scaleBaseHeight: number // 缩放基准高度（像素）
  screensaverEnabled: boolean // 是否启用屏保
  screensaverIdleMs: number // 屏保触发空闲时间（毫秒）
  accentColor: string // 主题强调色
}

/** 事件日志分区 */
interface EventLogSection {
  retentionDays: number // 事件日志保留天数
  maxQueryHours: number // 单次查询最大时间范围（小时）
  hourOptions: number[] // 时间范围可选小时数列表
  timelineHours: number // 时间线默认展示时长（小时）
  timelineLimit: number // 时间线最大条目数
  overlayHours: number // 叠加层展示时长（小时）
}

/** 能耗分区 */
interface EnergySection {
  learningPeriodDays: number // 能耗学习周期天数
  chartHours: number // 能耗图表展示时长（小时）
}

/** WebSocket 推送分区（公开） */
export interface WsPushPublicSection {
  coldEntityOnDemand: boolean // 冷实体是否按需推送
  roomBatchEmit: boolean // 是否按房间批量推送
}

/** 访客分区 */
interface GuestSection {
  defaultHours: number // 访客默认有效时长（小时）
  extendHours: number // 访客续期时长（小时）
}

/** 安防分区（公开） */
interface SecurityPublicSection {
  sensorAlertCooldownSec: number // 传感器告警冷却时间（秒）
}

/** 天气特效分区 */
interface WeatherEffectsSection {
  enabled: boolean // 是否启用天气特效
  preset: string // 特效预设名
  displayRoutes: string[] // 展示路由列表（仅这些路由展示特效）
  useEntityAttributes: boolean // 是否使用实体属性驱动特效
  densityMultiplier: number // 粒子密度倍数
  windMultiplier: number // 风速倍数
  attributeBlend: number // 属性混合权重（0-1）
  starCount: number // 星星数量
  cloudLayers: number // 云层数量
  shootingStarRate: number // 流星出现频率
  scenes: Record<string, Record<string, number>> // 场景参数表（场景名 -> 参数名 -> 值）
}

/** 房间元信息分区（公开） */
interface RoomMetaPublicSection {
  roomLabels: Record<string, string> // 房间标签映射（room_id -> 展示名）
  deviceGroupLabels: Record<string, string> // 设备分组标签映射
}

/** 自动化分区（公开） */
interface AutomationPublicSection {
  defaultRunOnHa: boolean // 新建自动化是否默认在 HA 上运行
}

/** 人来亮屏（公开，无 reportToken） */
interface ClientPowerWakePublicSection {
  clients: Array<{
    id: string
    chargerSwitchEntityId: string
    presenceWakeEnabled: boolean
  }>
}

/** 其它分区（公开） */
interface OtherPublicSection {
  advisorTipActionsBound?: string[] // 已绑定动作的管家建议 ID 列表
}

/** 应用公开配置（顶层聚合） */
export interface AppPublicConfig {
  frontend: FrontendSection // 前端运行参数
  ui: UiSection // UI 参数
  screensaver: Record<string, unknown> // 屏保配置（透传）
  weatherEffects: WeatherEffectsSection // 天气特效
  voice: Record<string, unknown> // 语音配置（透传）
  voiceCommands: unknown[] // 语音命令列表
  eventLog: EventLogSection // 事件日志
  energy: EnergySection // 能耗
  orchestrator: { executionHistoryLimit: number } // 联动器（执行历史保留条数）
  intelligence: { recommendationMaxPending: number } // 智能管家（最大待处理建议数）
  guest: GuestSection // 访客
  security: SecurityPublicSection // 安防
  roomMeta?: RoomMetaPublicSection // 房间元信息
  haAreas?: Array<{ id: string; name: string }> // HA 区域列表
  wsPush?: WsPushPublicSection // WebSocket 推送
  automation?: AutomationPublicSection // 自动化
  clientPowerWake?: ClientPowerWakePublicSection // 本机充电器开关人来亮屏
  other?: OtherPublicSection // 其它
  _version?: number // 配置版本号
}

/** 事件日志运行态配置（从公开配置解析后供运行时使用） */
export interface EventLogRuntimeConfig {
  retentionDays: number // 保留天数
  maxQueryHours: number // 单次查询最大时间范围（小时）
  hourOptions: number[] // 可选小时数列表
  timelineHours: number // 时间线展示时长（小时）
  timelineLimit: number // 时间线最大条目数
  overlayHours: number // 叠加层展示时长（小时）
}

/** 配置变化监听回调（sections 指定变化的分区列表） */
export type ConfigChangeListener = (sections?: string[] | null) => void

/** 配置分区 key（用于精确订阅） */
export type ConfigSectionKey = keyof AppPublicConfig