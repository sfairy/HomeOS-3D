/**
 * @file sections.ts
 * @module @homeos/shared/config
 * @brief 前后端共享的 AppConfig 分区契约（渐进收紧 FE soft Record）。
 *
 * 后端仍以 AppConfigData 为权威全量类型；此处导出 FE/设置页/诊断需要的分区。
 */
import type { EnvSensorMap, EnvSensorMapEntry } from '../room/catalog'

/** 认证分区（登录安全相关字段） */
export type SharedAuthConfig = {
  /** 连续登录失败 N 次后触发账户锁定 */
  lockoutMaxAttempts: number
  /** 锁定持续分钟数（到期后自动解锁，允许重新尝试登录） */
  lockoutMinutes: number
  /** 登录会话过期天数（到期后需重新登录） */
  sessionExpireDays: number
}

/**
 * 认证安全默认值（前后端共用权威值）。
 * 后端 DEFAULT_APP_CONFIG.auth 与前端登录策略表单的初始值/归一化兜底均引用此常量，避免硬编码漂移。
 */
export const DEFAULT_AUTH_SECURITY: Pick<
  SharedAuthConfig,
  'lockoutMaxAttempts' | 'lockoutMinutes' | 'sessionExpireDays'
> = {
  lockoutMaxAttempts: 5,
  lockoutMinutes: 15,
  sessionExpireDays: 30,
}

/** 通知分区（全局勿扰与分级通知开关） */
export type SharedNotificationConfig = {
  /** 勿扰开始小时（0-23）；该小时整起进入静默（生命安全类告警除外） */
  dndStart: number
  /** 勿扰结束小时（0-23）；等于 start 视为全天勿扰 */
  dndEnd: number
  /** 通知中心 / 站内信保留的最大条数（超出后淘汰最旧） */
  maxNotifications: number
  /** 全局通知总开关（关闭时仅生命安全类仍可送达） */
  globalNotifyEnabled: boolean
  /** 重要级别（danger/warn）通知独立开关：即使全局关闭，该开关打开仍可送达 */
  importantNotifyEnabled: boolean
  /** 设备离线提醒开关（离线超冷却后通知） */
  offlineNotifyEnabled: boolean
  /** 低电量提醒开关（电池类设备低电量时通知） */
  lowBatteryNotifyEnabled: boolean
  /** 离线提醒冷却时长（分钟）；同一设备在冷却期内不重复通知 */
  offlineCooldownMin: number
  /** 低电量提醒冷却时长（分钟） */
  lowBatteryCooldownMin: number
}

/** 状态存储分区（Redis 批量写入、增量刷新与 REST 缓存策略） */
export type SharedStateStoreConfig = {
  /** Redis 批量写入的最大条数（状态流攒批后一次性写入，降低 RTT） */
  redisWriteBatch: number
  /** Redis 增量刷盘间隔（毫秒）；无状态变更时跳过刷盘 */
  redisIncrementalFlushMs: number
  /** 近期状态变更环形缓冲的最大条数（诊断页/故障回溯用） */
  maxRecentChanges: number
  /** REST 实体查询接口的缓存 TTL（毫秒）；命中缓存时跳过数据库查询 */
  /** 实体状态过期阈值（毫秒）；超过该时长未更新的实体标记为 stale */
  staleThresholdMs: number
  /** 初始同步是否启用关键域优先；true 时按 entity/sync-priority 排序后推，缩短控制类首屏等待 */
  initialStatesPriorityEnabled: boolean
}

/** WebSocket 推送分区（实体状态下发节流与分片） */
export type SharedWsPushConfig = {
  /** 普通实体状态变更批量推送的刷新间隔（毫秒）；越小越实时但带宽越高 */
  stateFlushIntervalMs: number
  /** 传感器类（sensor/binary_sensor）独立刷新间隔（毫秒）；缺省复用 stateFlushIntervalMs */
  sensorFlushIntervalMs?: number
  /** 冷启动与 WS 推送时的关键 domain 清单；这些域优先推送到前端 */
  criticalDomains: string[]
  /** 单次批量推送的最大实体条数（避免单帧过大） */
  stateBatchMax: number
  /** 后端启动后等待 HA 首次同步完成的毫秒数；超时未就绪则先推已有的部分快照 */
  haSyncWaitMs: number
  /** 断连重连后状态历史重放的每块大小（实体条数）；配合分片事件避免大帧 */
  replayChunkSize: number
  /** 房间级在场事件是否按房间聚合批量 emit；true 减少对小屏客户端的事件量 */
  roomBatchEmit: boolean
  /** 非可见实体可不推：仅关键域 + 订阅域 + 钉选，大幅降低冷启动首包体积 */
  coldEntityOnDemand: boolean
  /** 延迟档位：realtime=激进实时 / balanced=平衡 / bulk=批量省电 */
  latencyProfile?: 'realtime' | 'balanced' | 'bulk'
  /** 关键域（light/switch 等）的独立刷新间隔（毫秒）；比普通域更短可提升控制反馈 */
  criticalFlushIntervalMs?: number
  /** 钉选（收藏/首页常驻）传感器的刷新间隔（毫秒）；可单独调密 */
  pinnedSensorFlushIntervalMs?: number
}

/** 命令代理分区（服务调用幂等与清理） */
export type SharedCommandProxyConfig = {
  /** 幂等令牌 TTL（毫秒）；同令牌在该窗口内重复调用仅执行首条 */
  idempotencyTtlMs: number
  /** 过期幂等令牌的清理周期（毫秒）；避免 Redis/内存中令牌无限累积 */
  idempotencyCleanupIntervalMs: number
}

/** 家庭模式分区（模式触发/执行参数与 UI 入口控制） */
export type SharedHomeModeConfig = {
  /** 同模式连续触发的冷却期（毫秒）；防止实体抖动导致模式反复切换 */
  triggerCooldownMs: number
  /** 模式应用（触发 scene/automation 等）失败时的最大重试次数 */
  applyMaxRetries: number
  /** 触发日志最大保留条数（超出后淘汰最旧；FE 分页/分析用） */
  maxTriggerLogs: number
  /** 模式执行历史（含详细步骤耗时）最大保留条数 */
  maxExecHistory: number
  /** 首页是否显示「离家」快捷按钮（安防模式独立开关时可隐藏） */
  showAwayButton: boolean
  /** 首页是否显示家庭模式切换入口（纯安防用户可隐藏） */
  showHomeMode: boolean
}

/** 能源分区（设置页常用字段：电表绑定、异常检测冷却与预算冷却） */
export type SharedEnergyConfig = {
  /** 总电表 entity_id（sensor.*_energy 类实体；用于总耗与预算累计） */
  meterEntityId?: string
  /** 回路子表 entity_id 数组（用于房间/设备级能耗分解） */
  circuitEntityIds?: string[]
  /** 异常检测学习期天数（首次启用需采集 N 天数据才能建立稳定基线） */
  learningPeriodDays?: number
  /** 学习期起始时间（ISO 字符串）；到期后自动从"学习中"切换为"已激活" */
  learningStartedAt?: string | null
  /** 异常检测冷却（分钟）；同一回路在冷却期内不重复发 alert */
  anomalyCooldownMin?: number
  /** 预算告警冷却（分钟）；避免预算超支期间重复刷屏 */
  budgetAlertCooldownMin?: number
}

/** 室内空气质量（IAQ）：霉变预警 */
export type SharedIaqConfig = {
  /** 霉变风险告警冷却（分钟）；避免高温高湿期间持续提醒 */
  moldAlertCooldownMin: number
}

/** 儿童模式（家长控制：时长 / 设备白名单 / 可用时段窗口） */
export type SharedChildModeConfig = {
  /** 儿童模式总开关；关闭时不做任何时长/时段限制 */
  enabled: boolean
  /** 每日媒体/娱乐总使用时长上限（分钟）；达到后自动触发「儿童模式结束」事件 */
  dailyMediaLimitMin: number
  /** 允许儿童直接操作的设备白名单（entity_id 列表；不在清单内的设备默认屏蔽） */
  deviceWhitelist: string[]
  /** 允许使用时段窗口（可多组）；仅在匹配窗口内允许访问白名单设备 */
  timeWindows: Array<{
    /** 生效日：数字数组 [0..6] 或 weekday / weekend 快捷词（0=周日 … 6=周六） */
    days: number[] | 'weekday' | 'weekend'
    /** 窗口开始时间（"HH:MM"，含） */
    start: string
    /** 窗口结束时间（"HH:MM"，不含） */
    end: string
  }>
}

/** 电价分区（分时 TOU 与阶梯电价双模式） */
export type SharedPricingConfig = {
  /** 电价模式：tiered=阶梯 / fixed=固定单价（启用分时后仍可叠加） */
  pricingMode: 'tiered' | 'fixed'
  /** 固定单价（元/kWh，定价模式=fixed 时使用） */
  fixedPrice: number
  /** 地区电价方案标签（如"上海居民峰谷"，仅展示用） */
  regionLabel: string
  /** 是否启用分时电价（峰/谷独立价格）；关闭后统一按 flatPrice 或阶梯计费 */
  timeOfUseEnabled: boolean
  /** 峰段 1 开始（HH:MM） */
  peakStart1: string
  /** 峰段 1 结束（HH:MM） */
  peakEnd1: string
  /** 峰段 2 开始（HH:MM，可省略表示仅一个峰段） */
  peakStart2: string
  /** 峰段 2 结束（HH:MM） */
  peakEnd2: string
  /** 谷段开始（HH:MM）；可跨日（如 23→7） */
  valleyStart: string
  /** 谷段结束（HH:MM） */
  valleyEnd: string
  /** 峰段单价（元/kWh） */
  peakPrice: number
  /** 谷段单价（元/kWh） */
  valleyPrice: number
  /** 平段单价（元/kWh，非峰非谷时段使用；或 TOU 关闭时的固定价替代） */
  flatPrice: number
  /** 阶梯 1 上限（kWh/月），在此电量内按 tier1Price */
  tier1Kwh: number
  /** 阶梯 1 单价（元/kWh） */
  tier1Price: number
  /** 阶梯 2 单价（元/kWh） */
  tier2Price: number
  /** 阶梯 3 单价（元/kWh） */
  tier3Price: number
}

/** 节律照明 */
export type SharedCircadianConfig = {
  weatherEntityId: string
}

/** 用水监控（异常冷却与主阀 entity_id） */
export type SharedWaterConfig = {
  /** 用水异常告警冷却（分钟）；抑制管道短时波动引起的重复告警 */
  anomalyCooldownMin: number
  /** 主水阀 entity_id（valve.* 或 switch.*；异常联动自动关阀） */
  mainValveEntityId: string
}

/** WebRTC */
export type SharedWebrtcConfig = {
  iceUrls: string
  iceUsername: string
  iceCredential: string
}

/** 前端性能相关分区（后端 AppConfig.frontend） */
export type SharedFrontendConfig = {
  largeEntityThreshold?: number
  initStatesBatchSize?: number
  optimisticTtlMs?: number
  maxStateListeners?: number
  rebuildDebounceMs?: number
  rebuildChunkSize?: number
  [key: string]: unknown
}

/** UI 缩放 / 强调色（后端 AppConfig.ui） */
export type SharedUiConfig = {
  scaleBaseWidth?: number
  scaleBaseHeight?: number
  screensaverEnabled?: boolean
  screensaverIdleMs?: number
  accentColor?: string
  [key: string]: unknown
}

/** 锁屏 / 屏保视觉（后端 AppConfig.screensaver） */
export type SharedScreensaverConfig = {
  scale?: number
  defaultMode?: string
  enableWeatherMode?: boolean
  instantEnter?: boolean
  instantLeave?: boolean
  brightness?: number
  showBrand?: boolean
  showSeconds?: boolean
  showGregorianDate?: boolean
  showLunar?: boolean
  showWeatherIcon?: boolean
  showWeatherDesc?: boolean
  showWeatherStats?: boolean
  showWeatherMeta?: boolean
  [key: string]: unknown
}

/** 房间环境传感器映射（与 room/catalog EnvSensorMap 结构完全对齐，用于 config 分区命名空间） */
export type SharedEnvSensorMap = EnvSensorMap
/** 单个房间的环境传感器映射条目（与 room/catalog EnvSensorMapEntry 对齐） */
export type SharedEnvSensorMapEntry = EnvSensorMapEntry

/** 运维 / EventLog 过滤（FE 设置页常用子集：日志分级、保留、备份等） */
export type SharedOpsConfig = {
  /** 是否启用事件日志分级（按严重级别分类存储与展示） */
  eventLogTierEnabled?: boolean
  /** 是否跳过传感器 timeline 类事件（海量传感器波动会放大日志量，建议开启） */
  eventLogSkipSensorTimeline?: boolean
  /** 是否启用事件日志按 domain / entity_id 的黑白名单过滤 */
  eventLogRecordFilterEnabled?: boolean
  /** 过滤模式：block=黑名单（默认，命中列表不记录）/ allow_domains=白名单（仅列表中 domain 记录） */
  eventLogRecordFilterMode?: 'block' | 'allow_domains'
  /** 黑名单：过滤掉的 domain 列表（仅 block 模式生效） */
  eventLogRecordBlockDomains?: string[]
  /** 白名单：允许记录的 domain 列表（仅 allow_domains 模式生效） */
  eventLogRecordAllowDomains?: string[]
  /** 黑名单：按 entity_id 精确过滤（独立于 domain 过滤，同 entity_id 不记录） */
  eventLogRecordBlockEntityIds?: string[]
  /** 保留数据清理周期（小时）；每小时扫描一次过期记录并归档删除 */
  retentionCleanupIntervalHours?: number
  /** 保留数据删除批次大小（每次批量删除的条数，避免单次 SQL 锁表） */
  retentionDeleteBatchSize?: number
  /** 场景执行历史最大条数（超出后淘汰最旧；诊断页与自动化回滚用） */
  sceneExecHistoryMax?: number
  /** 脚本执行历史最大条数 */
  scriptExecHistoryMax?: number
  /** 是否启用自动备份（定时把 AppConfig + 自动化/脚本 YAML 打包为备份） */
  autoBackupEnabled?: boolean
  /** 自动备份保留天数（过期备份自动清理；0 表示永久保留） */
  autoBackupRetainDays?: number
  [key: string]: unknown
}

/** 安防分区（FE 设置 / 在场常用字段：自动布撤防、人员在场与毫米波融合、场景联动） */
export type SharedSecurityConfig = {
  /** 全员离家后是否自动切换为 armed_away（外出布防） */
  autoArmOnEveryoneLeft?: boolean
  /** 全员离家且当前未布防时，是否升级为 armed_away（比 autoArm 更保守） */
  autoUpgradeToAwayOnEveryoneLeft?: boolean
  /** 首位家人回家后是否自动撤防（仅适用于配置了人脸识别/门禁等可区分"家人"的场景） */
  autoDisarmOnFirstHome?: boolean
  /** 自动布撤防是否仅在已配置的人员（presencePersons）全部满足时触发；避免陌生人误判 */
  requireConfiguredPersons?: boolean
  /** 是否融合毫米波人体存在传感器做在场判定（避免仅靠 door/window 接触式传感器漏报） */
  mmWaveFusePresence?: boolean
  /** 切换到 armed_away 时是否同时联动开启离家场景 */
  linkAwaySimOnArmAway?: boolean
  /** 安防布防模式变更时是否联动切换家庭模式（见 home/security-map resolveHomeModeLinkForSecurityChange） */
  linkHomeModeOnSecurityChange?: boolean
  /** 在场人员配置列表（含 ID、姓名、关联 person/tracker 实体）；自动布撤防用 */
  presencePersons?: Array<{ id: string; name: string; entityIds: string[] }>
  [key: string]: unknown
}

/** HA 连接器分区（FE 可见字段） */
export type SharedHaConnectorConfig = {
  syncOnlyEnabledEntities?: boolean
  reconnectBaseMs?: number
  maxReconnectDelayMs?: number
  wsPingIntervalMs?: number
  wsPongTimeoutMs?: number
  wsHeartbeatMaxMisses?: number
  coldBatchWindowMs?: number
  coldBatchMax?: number
  leaderTtlMs?: number
  leaderRenewMs?: number
  [key: string]: unknown
}

/** 外部集成（非密钥字段；密钥仍仅后端） */
export type SharedExternalConfig = {
  ttsMediaPlayerId?: string
  ttsMediaPlayerIds?: string[]
  weatherFallbackEntityId?: string
  weatherAlertEnabled?: boolean
  calendarUrl?: string
  [key: string]: unknown
}

/** 语音分区（与后端 voice 对齐的常用字段；告警规则细节见 voice-alert） */
export type SharedVoiceConfig = {
  sttMode?: string
  language?: string
  sttEntityId?: string
  useHaConversation?: boolean
  agentFallback?: boolean
  dailyAdvisorSpeak?: boolean
  dailyAdvisorSpeakHour?: number
  dailyAdvisorTtsDaytime?: string
  dailyAdvisorTtsEvening?: string
  interactionMode?: string
  wakeWordEnabled?: boolean
  wakeWords?: string[]
  continuousConversation?: boolean
  ttsEnabled?: boolean
  ttsOutputMode?: string
  ttsAlerts?: Record<string, unknown>
  ttsAlertTemplates?: Record<string, unknown>
  customTtsAlerts?: unknown[]
  entityTtsAlerts?: unknown[]
  [key: string]: unknown
}

/** other 分区常用字段 */
export type SharedOtherConfig = {
  advisorTipActions?: Record<string, { type?: string; id?: string }>
  speakCooldownMin?: number
  tipCooldownHours?: number
  eventlogRetentionDays?: number
  [key: string]: unknown
}

/**
 * 已下沉到 shared 的分区集合；SystemConfig / 诊断页应优先引用此处类型。
 */
export type SharedAppConfigSections = {
  auth?: Partial<SharedAuthConfig>
  notification?: Partial<SharedNotificationConfig>
  stateStore?: Partial<SharedStateStoreConfig>
  wsPush?: Partial<SharedWsPushConfig>
  commandProxy?: Partial<SharedCommandProxyConfig>
  homeMode?: Partial<SharedHomeModeConfig>
  energy?: Partial<SharedEnergyConfig>
  iaq?: Partial<SharedIaqConfig>
  childMode?: Partial<SharedChildModeConfig>
  pricing?: Partial<SharedPricingConfig>
  circadian?: Partial<SharedCircadianConfig>
  water?: Partial<SharedWaterConfig>
  webrtc?: Partial<SharedWebrtcConfig>
  frontend?: SharedFrontendConfig
  ui?: SharedUiConfig
  screensaver?: SharedScreensaverConfig
  envSensorMap?: SharedEnvSensorMap
  ops?: SharedOpsConfig
  security?: SharedSecurityConfig
  haConnector?: SharedHaConnectorConfig
  external?: SharedExternalConfig
  voice?: SharedVoiceConfig
  other?: SharedOtherConfig
}
