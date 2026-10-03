/**
 * @file backend/src/shared/app-config/defaults.ts
 * @module backend/src/shared/app-config
 */
/**
 * 应用配置默认值模块
 *
 * 职责：定义应用各分区配置的默认值，包括认证、通知、安防、能源、前端等配置项
 *
 * 依赖：
 * - @homeos/shared: buildDefaultEnvSensorMap
 * - ../alert-support/voice-alert.util: DEFAULT_VOICE_ALERT_RULES
 * - ./types: AppConfigData
 */
import { buildDefaultEnvSensorMap, WS_PUSH_CRITICAL_DOMAINS } from '@homeos/shared';
import { DEFAULT_VOICE_ALERT_RULES } from '../../common/alert-support/voice-alert.util';
import type { AppConfigData } from './types';
import {
  DEFAULT_EVENT_LOG_RECORD_BLOCK_DOMAINS,
  DEFAULT_INGRESS_COALESCE_DOMAINS,
} from './event-log-defaults';
import {
  RETENTION_DEFAULT_DAYS,
  type RetentionConfig,
} from '../../common/database/retention-tables';

/**
 * 各配置分区默认值
 * 
 * 结构说明：
 * - auth: 认证相关配置
 * - notification: 通知相关配置
 * - water: 用水监测相关配置
 * - security: 安防相关配置
 * - circadian: 昼夜节律照明相关配置
 * - adaptiveClimate: 自适应气候相关配置
 * - intelligence: 智能推荐相关配置
 * - energy: 能源监测相关配置
 * - pricing: 电价计费相关配置
 * - device: 设备健康相关配置
 * - automation: 自动化相关配置
 * - other: 其他杂项配置
 * - frontend: 前端相关配置
 * - energyBudget: 能源预算相关配置
 * - profiles: 用户配置文件相关配置
 * - ui: 用户界面相关配置
 * - screensaver: 屏保相关配置
 * - weatherEffects: 天气特效相关配置
 * - external: 外部服务相关配置
 * - haConnector: HA 连接器相关配置
 * - ops: 运维相关配置
 * - stateStore: 状态存储相关配置
 * - wsPush: WebSocket 推送相关配置
 * - commandProxy: 命令代理相关配置
 * - webrtc: WebRTC 相关配置
 * - homeMode: 家庭模式相关配置
 * - voice: 语音相关配置
 * - voiceCommands: 语音命令列表
 * - clientPower: 客户端功耗相关配置
 */
export const DEFAULT_APP_CONFIG = {
  /** 认证配置 */
  auth: {
    /** 锁定前最大尝试次数（同时作为暴力破解告警阈值） */
    lockoutMaxAttempts: 5,
    /** 锁定时长（分钟） */
    lockoutMinutes: 15,
    /** 会话过期天数 */
    sessionExpireDays: 30,
    /** 登录安全告警总开关（新设备/暴力破解共用） */
    loginAlertEnabled: true,
    /** 新设备/新 UA 首次登录告警开关 */
    newDeviceAlertEnabled: true,
    /** 新设备告警按 IP 冷却时长（分钟），默认 24h */
    newDeviceAlertCooldownMin: 1440,
    /** 暴力破解告警开关（阈值复用 lockoutMaxAttempts） */
    bruteForceAlertEnabled: true,
  },
  /** 通知配置 */
  notification: {
    /** 免打扰模式开始时间（小时） */
    dndStart: 22,
    /** 免打扰模式结束时间（小时） */
    dndEnd: 8,
    /** in-app 条数软上限（优先清已读；天数硬删见 retention.notification） */
    maxNotifications: 500,
    /** 全局通知是否启用 */
    globalNotifyEnabled: true,
    /** 重要通知是否启用 */
    importantNotifyEnabled: true,
    /** 离线通知是否启用 */
    offlineNotifyEnabled: true,
    /** 低电量通知是否启用 */
    lowBatteryNotifyEnabled: true,
    /** 离线通知冷却时间（分钟） */
    offlineCooldownMin: 30,
    /** 低电量通知冷却时间（分钟） */
    lowBatteryCooldownMin: 120,
  },
  /** 用水监测配置 */
  water: {
    /** 连续流水计数阈值（次） */
    continuousFlowCount: 6,
    /** 每日用水限额（立方米） */
    dailyLimitM3: 2.0,
    /** 异常检测冷却时间（分钟） */
    anomalyCooldownMin: 30,
    /** 主阀门实体 ID */
    mainValveEntityId: '',
    linkageWaterEnabled: false,
    linkageWaterAnomalySceneId: '',
    linkageWaterAnomalyModeId: '',
    linkageWaterAnomalyCooldownMin: 30,
  },
  /** 安防配置 */
  security: {
    /** 传感器告警冷却时间（秒） */
    sensorAlertCooldownSec: 60,
    /** 浴室长时间停留高阈值（分钟） */
    bathroomLongStayHighMin: 30,
    /** 浴室长时间停留中阈值（分钟） */
    bathroomLongStayMediumMin: 15,
    /** 卧室不活动超时（小时） */
    bedroomInactiveHours: 8,
    /** 深夜时段开始（小时） */
    deepNightStart: 2,
    /** 深夜时段结束（小时） */
    deepNightEnd: 5,
    /** 夜间时段开始（小时） */
    nightStart: 22,
    /** 夜间时段结束（小时） */
    nightEnd: 7,
    /** 整屋日间不活动超时（小时） */
    wholeHouseInactiveDayHours: 4,
    /** 整屋夜间不活动超时（小时） */
    wholeHouseInactiveNightHours: 8,
    /** 厨房停留警告阈值（分钟） */
    kitchenStayWarnMin: 60,
    /** 安防异常检测冷却时间（分钟） */
    anomalyCooldownMin: 60,
    /** 离家确认等待时间（分钟） */
    awayConfirmMin: 5,
    /**
     * 为 true 且 presencePersons 为空时：不自动跟踪全部 device_tracker/person，
     * 视为「无人被跟踪」，永不发出 everyoneLeft（避免空配置误触发全员离家）
     */
    requireConfiguredPersons: true,
    /** 用于判断 presence 的人员实体列表 */
    presencePersons: [],
    /** 成员画像融合 mmWave 房间在场：默认开启，防止 tracker 失效导致误判全员离家 */
    mmWaveFusePresence: true,
    /** 所有人离开时自动布防 */
    autoArmOnEveryoneLeft: false,
    /** 所有人离开时自动升级为外出模式 */
    autoUpgradeToAwayOnEveryoneLeft: false,
    /** 日历外出时段开始时自动布防 */
    calendarArmOnAway: false,
    /** 首人到家时自动切居家布防（armed_home，非全撤防） */
    autoDisarmOnFirstHome: false,
    /** 布防外出模式时联动离家模拟 */
    linkAwaySimOnArmAway: false,
    /** 与家庭模式→安防对称：布防变更按对照表/名称联动家庭模式 */
    linkHomeModeOnSecurityChange: true,
    /** Frigate 人员告警触发的安防模式 */
    frigatePersonAlarmModes: 'armed_away,armed_night',
    /** 紧急模式冷却时间（秒） */
    emergencyCooldownSec: 60,
    /** Frigate 最大事件数量 */
    frigateMaxEvents: 50,
    /** Frigate 事件去重窗口（毫秒） */
    frigateDedupMs: 30_000,
    /** 周期性异常检测间隔（分钟） */
    anomalyPeriodicIntervalMin: 5,
    /** 离家模拟亮度最小值 */
    awaySimBrightnessMin: 40,
    /** 离家模拟亮度范围 */
    awaySimBrightnessRange: 50,
    /** 离家模拟间隔范围（分钟） */
    awaySimIntervalMinMax: { min: 8, max: 25 },
    /** 安防配置缓存 TTL（毫秒） */
    configCacheTtlMs: 60_000,
    /** 安防独立告警渠道：紧急/布防触发/紧急求助类事件强制投递渠道（默认仅站内） */
    alertChannels: ['in_app'],
    /** 安防独立告警是否绕过免打扰（安防事件链路天然绕过 DND，默认 true） */
    alertBypassDnd: true,
    /** 布防撤防宽限期（秒）：布防后门锁解锁在该秒数内不视为入侵（0=关闭） */
    armExitGraceSeconds: 30,
  },
  /** 昼夜节律照明配置 */
  circadian: {
    /** 是否启用光照反馈 */
    luxFeedbackEnabled: true,
    /** 是否启用天气预报预调整 */
    forecastPreAdjust: false,
    /** 是否按房间独立启用 */
    perRoomEnabled: true,
    /** 是否启用学习覆盖 */
    overrideLearningEnabled: true,
    /** 天气实体 ID */
    weatherEntityId: '',
    /** 日间光照目标值（lux） */
    luxTargetDay: 300,
  },
  /** 自适应气候配置 */
  adaptiveClimate: {
    /** 是否启用天气预报预调整 */
    forecastPreAdjust: false,
    /** 是否按房间独立启用 */
    perRoomEnabled: true,
    /** 是否启用学习覆盖 */
    overrideLearningEnabled: true,
    /** 闭环控制容差（摄氏度） */
    closedLoopToleranceC: 0.5,
    /** 自动应用推荐设定温度到空调（默认关闭，需显式开启） */
    autoApplyEnabled: false,
    /** 自动应用轮询间隔（分钟） */
    autoApplyIntervalMin: 60,
    /** 用户手动调温 hold（分钟） */
    manualHoldMin: 90,
  },
  /** 智能推荐配置 */
  intelligence: {
    /** 是否启用推荐挖掘 */
    recommendationMiningEnabled: true,
    /** 是否启用基线聚合 */
    baselineAggregateEnabled: true,
    /** 推荐最大待处理数量 */
    recommendationMaxPending: 20,
  },
  childMode: {
    enabled: false,
    dailyMediaLimitMin: 0,
    deviceWhitelist: [],
    timeWindows: [],
  },
  iaq: {
    iaqTargetTemp: 22,
    iaqTargetHumidity: 50,
    iaqWeightPm25: 30,
    iaqWeightCo2: 25,
    iaqWeightTvoc: 20,
    iaqWeightTemp: 15,
    iaqWeightHumidity: 10,
    moldAlertCooldownMin: 10,
    iaqAlertThreshold: 60,
    linkageIaqFanEntityId: '',
    linkageDehumidifierEntityId: '',
    linkageIaqSceneId: '',
    linkageMoldSceneId: '',
  },
  /** 能源监测配置 */
  energy: {
    /** 电表实体 ID */
    meterEntityId: '',
    /** 电路实体 ID 列表 */
    circuitEntityIds: [],
    /** 学习周期（天数） */
    learningPeriodDays: 7,
    /** 学习开始时间 */
    learningStartedAt: '',
    /** 待机功率阈值（瓦） */
    standbyThresholdW: 200,
    /** 峰值检测比例 */
    spikeRatio: 2.0,
    /** 异常检测冷却时间（分钟） */
    anomalyCooldownMin: 60,
    /** 基线样本数量 */
    baselineSize: 10,
    /** 持续监测时长（毫秒） */
    sustainedMs: 2 * 60 * 60 * 1000,
    /** 是否启用联动 */
    linkageEnabled: false,
    /** 联动预算模式 ID */
    linkageBudgetModeId: '',
    /** 联动异常场景 ID */
    linkageAnomalySceneId: '',
    /** 是否联动气候控制 */
    linkageClimateApply: false,
    /** 是否联动热水器节能 */
    linkageWaterHeaterEco: false,
    /** 联动热水器实体 ID */
    linkageWaterHeaterEntityId: '',
    /** 预算告警冷却时间（分钟） */
    budgetAlertCooldownMin: 720,
    /** 电表锚点持久化（内部运行时字段：重启恢复阶梯用电累加用；Redis 不可用时回退存储于此） */
    meterAnchorKwh: null,
    meterAnchorMonth: '',
    meterAnchorEntityId: '',
    meterAnchorUpdatedAt: '',
    /** 储能峰谷调度（谷充峰放）：默认关闭，需配置充/放电实体后开启 */
    storageDispatchEnabled: false,
    storageDispatchBatteryEntityId: '',
    storageDispatchChargeEntities: [],
    storageDispatchDischargeEntities: [],
    storageDispatchChargeSocTarget: 100,
    storageDispatchDischargeSocThreshold: 40,
    storageDispatchDischargeSocMin: 20,
    storageDispatchCooldownMin: 30,
  },
  /** 电价计费配置 */
  pricing: {
    /** 定价模式：tiered（阶梯）/ fixed（固定单价）；分时由 timeOfUseEnabled 叠加 */
    pricingMode: 'tiered',
    /** 固定电价 */
    fixedPrice: 0.4883,
    /** 地区标签 */
    regionLabel: '',
    /** 是否启用分时电价 */
    timeOfUseEnabled: true,
    /** 峰段1开始时间 */
    peakStart1: '8:00',
    /** 峰段1结束时间 */
    peakEnd1: '11:00',
    /** 峰段2开始时间 */
    peakStart2: '18:00',
    /** 峰段2结束时间 */
    peakEnd2: '23:00',
    /** 谷段开始时间 */
    valleyStart: '23:00',
    /** 谷段结束时间 */
    valleyEnd: '7:00',
    /** 峰段电价 */
    peakPrice: 0,
    /** 谷段电价 */
    valleyPrice: 0,
    /** 平段电价 */
    flatPrice: 0,
    /** 一阶电量阈值（千瓦时） */
    tier1Kwh: 2880,
    /** 二阶电量阈值（千瓦时） */
    tier2Kwh: 4800,
    /** 一阶电价 */
    tier1Price: 0.4883,
    /** 二阶电价 */
    tier2Price: 0.5383,
    /** 三阶电价 */
    tier3Price: 0.7883,
  },
  /** 设备健康配置 */
  device: {
    /** 各类设备的额定循环次数 */
    ratedCycles: {
      light: 100000,
      switch: 50000,
      fan: 30000,
      cover: 20000,
      lock: 50000,
      valve: 30000,
      climate: 80000,
      water_heater: 25000,
      vacuum: 5000,
    },
    /** 各类设备的额定运行小时数 */
    ratedHours: {
      fan: 10000,
      cover: 5000,
      pump: 8000,
      climate: 12000,
      light: 15000,
      media_player: 8000,
      vacuum: 2000,
      water_heater: 6000,
    },
    /** 健康告警阈值（百分比） */
    healthAlertThreshold: 20,
  },
  /** 自动化配置 */
  automation: {
    /** 触发器冷却时间（毫秒） */
    triggerCooldownMs: 2000,
    /** 时间条件扫描间隔（秒） */
    timeScanIntervalSec: 30,
    /** time_pattern / cron / template 周期触发扫描间隔（秒），默认 30 */
    patternScanIntervalSec: 30,
    /** call_service 动作失败重试次数（默认 0=不重试） */
    actionRetryCount: 0,
    /** call_service 动作重试间隔（毫秒） */
    actionRetryDelayMs: 1000,
    /** parallel 模式单规则最大并发任务数 */
    maxParallelRuns: 3,
    /** queued 模式单规则队列最大长度 */
    maxQueueLength: 20,
    /** wait_template 动作最大等待秒数 */
    waitTemplateTimeoutSec: 300,
    /** delay 动作最大秒数 */
    maxDelaySeconds: 600,
    /** repeat 动作最大迭代次数 */
    maxRepeatIterations: 100,
    /** DAG 链路最大嵌套深度（automation.completed/failed 事件触发链防循环） */
    dagMaxDepth: 8,
    /** 同实体状态变化触发合并去抖（毫秒），0=关闭；默认 100ms 降低 sensor 抖动下的规则评估扇出 */
    entityTriggerDebounceMs: 100,
    /** 是否启用 HA 同步 */
    haSyncEnabled: true,
    /** 保存时是否自动同步 */
    autoSyncOnSave: true,
    /** 默认是否在 HA 上运行 */
    defaultRunOnHa: false,
    /** 是否自动修复漂移 */
    autoRepairDrift: true,
    /** 定时漂移修复间隔（分钟），autoRepairDrift 为 true 时生效 */
    driftRepairIntervalMin: 30,
    /** HA 实体陈旧 / 断连时跳过本地自动化触发评估 */
    skipWhenHaStale: true,
    /** 是否启用 HA 自动导入 */
    haAutoImportEnabled: false,
    /** HA 自动导入间隔（分钟） */
    haAutoImportIntervalMin: 360,
    /** HA 配置导入并发数 */
    haImportConfigConcurrency: 6,
    /** HA 配置目录路径 */
    haConfigDir: '',
    /** HA 配置目录用户名 */
    haConfigDirUser: '',
    /** HA 配置目录密码 */
    haConfigDirPassword: '',
  },
  /** 其他杂项配置 */
  other: {
    /** 事件日志保留天数 */
    eventlogRetentionDays: 7,
    /** HA 历史缓存最小时长（分钟） */
    haHistoryCacheMin: 5,
    /** 语音播报冷却时间（分钟） */
    speakCooldownMin: 10,
    /** 提示冷却时间（小时） */
    tipCooldownHours: 2,
    /** 访客通行证默认有效期（小时） */
    guestPassDefaultHours: 24,
    /** 访客通行证可延长时长（小时） */
    guestPassExtendHours: 24,
    /** 离家时自动撤销访客临时密码：默认关闭（需用户主动开启） */
    guestPassRevokeOnAway: false,
    /** 顾问提示操作映射 */
    advisorTipActions: {},
    /** 首装后引导任务清单关闭时间（ISO）；null 表示未关闭 */
    setupChecklistDismissedAt: null as string | null,
  },
  /** 前端配置 */
  frontend: {
    /** API 请求超时时间（毫秒） */
    apiTimeoutMs: 15000,
    /** API 最大重试次数 */
    apiRetryMax: 2,
    /** HA 断开连接防抖时间（毫秒） */
    haDisconnectDebounceMs: 5000,
    /** 初始状态等待时间（毫秒） */
    initialStatesWaitMs: 8000,
    /** 是否启用实体缓存 */
    entityCacheEnabled: true,
    /** 实体缓存最大时效（毫秒） */
    entityCacheMaxAgeMs: 24 * 60 * 60 * 1000,
    /** 实体缓存保存防抖时间（毫秒） */
    entityCacheSaveDebounceMs: 10_000,
    /** 缓存重建批次大小 */
    rebuildChunkSize: 500,
    /** 缓存重建防抖时间（毫秒） */
    rebuildDebounceMs: 50,
    /** 最大监听器数量 */
    maxListeners: 200,
    /** 调用去重窗口时间（毫秒） */
    callDedupWindowMs: 500,
    /** 最大远程通知条数 */
    maxRemoteNotifications: 100,
    /** 会话刷新间隔（小时） */
    sessionRefreshHours: 6,
    /** 组件默认轮询间隔（毫秒） */
    defaultWidgetPollMs: 60_000,
    /** 各组件轮询间隔配置 */
    widgetPollIntervals: {},
    /** 乐观更新 TTL（毫秒） */
    optimisticTtlMs: 6000,
    /** 大实体数量阈值 */
    largeEntityThreshold: 2000,
    /** 工作线程派生阈值 */
    workerDerivedThreshold: 2000,
    /** 初始状态批次大小 */
    initStatesBatchSize: 400,
    /** API 重试延迟时间（毫秒） */
    apiRetryDelayMs: 1000,
  },
  /** 能源预算配置 */
  energyBudget: {
    /** 月度电量预算（千瓦时） */
    monthlyKwh: 0,
    /** 月度费用预算（元） */
    monthlyCost: 0,
    /** 气温修正灵敏度（kWh/℃）：每偏离基线 1℃ 对日用电量的影响 */
    tempSensitivityKwh: 0.3,
  },
  /** 用户配置文件配置 */
  profiles: {
    /** 当前激活的配置文件 ID */
    activeProfileId: 'default',
    /** 新终端默认配置文件 */
    newTerminalDefault: 'activeProfile',
    /** 终端绑定关系列表 */
    terminalBindings: [],
  },
  /** 用户界面配置 */
  ui: {
    /** 缩放基准宽度 */
    scaleBaseWidth: 1366,
    /** 缩放基准高度 */
    scaleBaseHeight: 1024,
    /** 是否启用屏保 */
    screensaverEnabled: true,
    /** 屏保空闲触发时间（毫秒） */
    screensaverIdleMs: 120000,
    /** 主题强调色 */
    accentColor: '#3b82f6',
  },
  /** 屏保配置 */
  screensaver: {
    /** 缩放比例 */
    scale: 1.35,
    /** 默认模式：random（随机） */
    defaultMode: 'random',
    /** 是否启用天气模式 */
    enableWeatherMode: false,
    /** 是否即时进入屏保 */
    instantEnter: true,
    /** 是否即时退出屏保 */
    instantLeave: true,
    /** 亮度值 */
    brightness: 1,
    /** 是否显示品牌标识 */
    showBrand: true,
    /** 是否显示秒数 */
    showSeconds: true,
    /** 是否显示公历日期 */
    showGregorianDate: true,
    /** 是否显示农历日期 */
    showLunar: true,
    /** 是否显示天气图标 */
    showWeatherIcon: true,
    /** 是否显示天气描述 */
    showWeatherDesc: true,
    /** 是否显示天气统计 */
    showWeatherStats: true,
    /** 是否显示天气元信息 */
    showWeatherMeta: true,
    /** 时间字体大小（vw） */
    timeSizeVw: 24,
    /** 分隔符字体大小（vw） */
    sepSizeVw: 17,
    /** 秒数字体大小（vw） */
    secSizeVw: 7,
    /** 元信息字体大小（vw） */
    metaSizeVw: 3,
    /** 子元信息字体大小（vw） */
    subMetaSizeVw: 2,
    /** 品牌字体大小（像素） */
    brandSizePx: 22,
    /** 天气温度字体大小（vw） */
    weatherTempSizeVw: 22,
    /** 天气图标大小（vw） */
    weatherIconSizeVw: 10,
    /** 天气统计字体大小（像素） */
    weatherStatsSizePx: 15,
    /** 品牌标识顶部位置（vh） */
    brandTopVh: 5,
    /** 内容偏移量（vh） */
    contentShiftVh: 0,
  },
  /** 天气特效配置 */
  weatherEffects: {
    /** 是否启用天气特效 */
    enabled: true,
    /** 预设效果：realistic（写实） */
    preset: 'realistic',
    /** 显示路由列表 */
    displayRoutes: ['dashboard'],
    /** 是否使用实体属性 */
    useEntityAttributes: true,
    /** 密度乘数 */
    densityMultiplier: 0.78,
    /** 风力乘数 */
    windMultiplier: 1,
    /** 属性混合系数 */
    attributeBlend: 0.92,
    /** 星星数量 */
    starCount: 110,
    /** 云层数量 */
    cloudLayers: 5,
    /** 流星出现率 */
    shootingStarRate: 0.00035,
    /** 各天气场景配置 */
    scenes: {
      clearDay: {},
      clearNight: {},
      partlyCloudy: {},
      cloudy: {},
      drizzle: {},
      rain: {},
      heavyRain: {},
      thunderstorm: {},
      snow: {},
      sleet: {},
      windy: {},
      hail: {},
      sandstorm: {},
    },
  },
  /** 外部服务配置 */
  external: {
    /** OpenWeatherMap API Key */
    openWeatherApiKey: '',
    /** 天气查询纬度 */
    weatherLat: 39.9,
    /** 天气查询经度 */
    weatherLon: 116.4,
    /** TTS 媒体播放器 ID */
    ttsMediaPlayerId: '',
    /** TTS 媒体播放器 ID 列表 */
    ttsMediaPlayerIds: [],
    /** 日历 URL */
    calendarUrl: '',
    /** 日历同步间隔（分钟） */
    calendarSyncMin: 60,
    /** 临近外出事件时的短轮询间隔（分钟） */
    calendarSyncShortMin: 5,
    /** 日历增量同步（ETag / If-Modified-Since 条件请求），默认开启 */
    calendarIncrementalEnabled: true,
    /** 天气备用降级实体（HA weather 域，留空自动识别） */
    weatherFallbackEntityId: '',
    /** 动态电价 API 开关 */
    dynamicPricingEnabled: false,
    dynamicPricingUrl: '',
    dynamicPricingApiKey: '',
    /** 动态电价刷新间隔（小时） */
    dynamicPricingRefreshHours: 24,
    /** 天气告警 TTL（分钟） */
    weatherAlertsTtlMin: 30,
    /** 天气告警刷新间隔（毫秒） */
    weatherAlertRefreshMs: 30 * 60_000,
    /** 天气预警监听开关 */
    weatherAlertEnabled: true,
    /** 推送阈值：仅推送不低于该等级的预警（默认橙色及以上） */
    weatherAlertNotifyLevel: 'orange',
    /** 红色预警安全联动场景（关窗/拉帘/布防） */
    weatherAlertSceneId: '',
    /** 极端天气联动家庭模式 */
    weatherAlertModeId: '',
    /** 极端天气联动冷却（分钟） */
    weatherAlertCooldownMin: 120,
  },
  /** HA 连接器配置 */
  haConnector: {
    /** 重连基础延迟（毫秒） */
    reconnectBaseMs: 1000,
    /** 最大重连延迟（毫秒）；健康网络压低上限以加快恢复 */
    maxReconnectDelayMs: 10_000,
    /** 实体注册表缓存时长（毫秒） */
    entityRegistryCacheMs: 300_000,
    /** 实体注册表请求超时（毫秒） */
    entityRegistryTimeoutMs: 45_000,
    /** 命令队列最大长度 */
    commandQueueMax: 20,
    /** 命令队列 TTL（毫秒） */
    commandQueueTtlMs: 60_000,
    /** 历史缓存最大条目数 */
    historyCacheMaxSize: 300,
    /** 是否启用入站数据合并 */
    ingressCoalesceEnabled: true,
    /** 入站数据合并窗口（毫秒）；realtime 默认收紧，降低 sensor p99 */
    ingressCoalesceWindowMs: 8,
    /** 入站数据合并的域列表 */
    ingressCoalesceDomains: [...DEFAULT_INGRESS_COALESCE_DOMAINS],
    /** WS 断连期间经 REST /api/states 补同步 L1（Leader 实例） */
    disconnectRestPollEnabled: true,
    /** 断连后 REST 轮询初始延迟（毫秒） */
    disconnectRestPollInitialDelayMs: 1_000,
    /** 断连后 REST 轮询间隔（毫秒） */
    /** 断连 REST 补洞间隔（毫秒）；收紧以缩短 WS 空窗 */
    disconnectRestPollIntervalMs: 2_000,
    /** 断连后 REST 轮询超时（毫秒） */
    disconnectRestPollTimeoutMs: 60_000,
    /** 是否仅同步启用的实体 */
    syncOnlyEnabledEntities: true,
    /** HA WS 应用层 ping 间隔（毫秒） */
    wsPingIntervalMs: 45_000,
    /** HA WS pong 超时（毫秒） */
    wsPongTimeoutMs: 25_000,
    /** 连续心跳未响应次数达到该值才主动断开 */
    wsHeartbeatMaxMisses: 3,
    /** Cold Path 批窗口（毫秒） */
    coldBatchWindowMs: 15,
    /** Cold Path 单批上限 */
    coldBatchMax: 256,
    /** HA WS Leader 租约 TTL（毫秒） */
    leaderTtlMs: 8_000,
    /** HA WS Leader 续约间隔（毫秒） */
    leaderRenewMs: 2_500,
  },
  /** 运维配置 */
  ops: {
    /** 数据保留清理间隔（小时） */
    retentionCleanupIntervalHours: 1,
    /** 保留数据删除批次大小 */
    retentionDeleteBatchSize: 800,
    /** 首次清理延迟（秒） */
    retentionFirstDelaySec: 15,
    /** 事件日志刷新间隔（毫秒） */
    eventLogFlushIntervalMs: 5000,
    /** 事件日志最大缓冲区 */
    eventLogMaxBuffer: 200,
    /** 事件日志最大重入队缓冲区 */
    eventLogMaxRequeueBuffer: 500,
    /** 事件日志时间线最大条目数 */
    eventLogTimelineMax: 500,
    /** 事件日志时间线覆盖时长（小时） */
    eventLogTimelineHours: 12,
    /** 事件日志叠加时长（小时） */
    eventLogOverlayHours: 2,
    /** 是否启用事件日志分级 */
    eventLogTierEnabled: true,
    /** 事件日志 C 级采样率 */
    eventLogTierCSampleRate: 0,
    /** 是否跳过传感器时间线 */
    eventLogSkipSensorTimeline: true,
    /** 是否启用事件日志记录过滤（默认开启，屏蔽低价值高频域） */
    eventLogRecordFilterEnabled: true,
    /** 事件日志记录过滤模式：block（黑名单）/ allow（白名单） */
    eventLogRecordFilterMode: 'block',
    /** 事件日志记录黑名单域列表（不含 sensor/binary_sensor，以免打断能耗/活跃度学习） */
    eventLogRecordBlockDomains: [...DEFAULT_EVENT_LOG_RECORD_BLOCK_DOMAINS],
    /** 事件日志记录白名单域列表 */
    eventLogRecordAllowDomains: [],
    /** 事件日志记录黑名单实体 ID 列表 */
    eventLogRecordBlockEntityIds: [],
    /** 配置审计最大条目数 */
    configAuditMaxEntries: 100,
    /** 是否启用配置审计持久化 */
    configAuditPersistEnabled: false,
    /** Orchestrator 导入最大重试次数 */
    orchestratorImportMaxRetry: 3,
    /** 场景执行历史最大条目数 */
    sceneExecHistoryMax: 100,
    /** 脚本执行历史最大条目数 */
    scriptExecHistoryMax: 80,
    /** 场景叠加执行快照可取消时间（分钟，0=不设限） */
    sceneOverlayUndoTtlMin: 30,
    /** 定时自动备份开关（每天 02:30 北京时间自动生成完整备份包） */
    autoBackupEnabled: true,
    /** 自动备份保留天数（超出后清理旧产物） */
    autoBackupRetainDays: 7,
    /** 家庭本地 IANA 时区（日切/定时统一） */
    homeTimezone: 'Asia/Shanghai',
  },
  /** 各业务表历史数据保留天数（数据库历史清理按表独立生效；默认 7 天，与 other.eventlogRetentionDays 一致） */
  retention: {
    eventLog: RETENTION_DEFAULT_DAYS,
    sceneExecution: RETENTION_DEFAULT_DAYS,
    automationExecution: RETENTION_DEFAULT_DAYS,
    scriptExecution: RETENTION_DEFAULT_DAYS,
    commandAudit: RETENTION_DEFAULT_DAYS,
    notification: RETENTION_DEFAULT_DAYS,
    securityEvent: RETENTION_DEFAULT_DAYS,
    environmentRecord: RETENTION_DEFAULT_DAYS,
    waterRecord: RETENTION_DEFAULT_DAYS,
    advisorCooldown: RETENTION_DEFAULT_DAYS,
    loginAudit: RETENTION_DEFAULT_DAYS,
  } as RetentionConfig,
  /** 状态存储配置 */
  stateStore: {
    // 写 L2 Redis（状态缓存 / 事件日志）每批条数：200。在实体变更高峰期（~2k/sec 峰值）
    // 200 刚好让 Redis PIPELINE 打包到 ~1 次网络往返 ≈ 1ms，既不占大内存也不碎片化 TCP。
    redisWriteBatch: 200,
    // L1→L2 增量 flush 周期：100ms。用户体感不明显，但能保证在 500ms UI 轮询内看到状态到达 Redis，
    // 过小会放大 Redis IO，过大则 Follower 与重启实例读回的状态陈旧。
    redisIncrementalFlushMs: 100,
    // WS 断线补发环形缓冲容量：3000。典型家居 1500 台设备 * 2 条/分钟（亮/关）可覆盖约 10 分钟；
    // UI 长时间断线会重拉完整实体快照，不需要无限大。
    maxRecentChanges: 3000, // 别名：近期变更条目上限
    // /entities /entity/:id 端点的 REST 响应缓存：500ms。前端首屏加载 + 子组件并发请求常触发
    // 同一实体多 GET；过半秒则接受陈旧，避免 Prisma/Redis 被热实体击穿。
    restCacheTtlMs: 500,
    /** 状态过期阈值（毫秒）：HA 断连后多久标记 entities_stale（原 120s 过久，UI 会假活） */
    /** HA 断连后延迟推送 entities_stale（毫秒）；短于旧 30s 以便更快触发冷补全 */
    staleThresholdMs: 12_000,
    /** 是否启用初始状态优先级 */
    initialStatesPriorityEnabled: true,
  },
  /** WebSocket 推送配置 */
  wsPush: {
    /** 状态刷新间隔（毫秒） */
    stateFlushIntervalMs: 80,
    /** 非关键域（sensor 等）批推间隔；未设则回退 stateFlushIntervalMs；大实体档位自适应抬高 */
    sensorFlushIntervalMs: 120,
    /** 关键域列表（含 lock）；经极短合并窗口（≤16ms）聚合广播，对人眼无感知 */
    criticalDomains: [...WS_PUSH_CRITICAL_DOMAINS],
    /** 状态批次最大数量 */
    stateBatchMax: 300,
    /** HA 同步等待时间（毫秒） */
    haSyncWaitMs: 90_000,
    /** 重放批次大小 */
    replayChunkSize: 400,
    /** 按 ACL+订阅分组预序列化 WS batch（默认开启） */
    roomBatchEmit: true,
    /** 仅推送关键域 + 订阅域 + 钉选实体；非可见实体 REST 按需补全 */
    coldEntityOnDemand: true,
    /** 延迟档位：realtime | balanced | bulk（默认 realtime 对齐低延迟目标） */
    latencyProfile: 'realtime',
    /** 关键域 Socket.IO 合并窗口（毫秒）；0=立即 flush */
    criticalFlushIntervalMs: 4,
    /** 钉选传感器短窗口（毫秒）；realtime 档优先使用 */
    pinnedSensorFlushIntervalMs: 16,
  },
  /** 命令代理配置 */
  commandProxy: {
    /** 幂等性 TTL（毫秒） */
    idempotencyTtlMs: 3000,
    /** 幂等性清理间隔（毫秒） */
    idempotencyCleanupIntervalMs: 60_000,
  },
  /** WebRTC 配置 */
  webrtc: {
    /** ICE 服务器 URL */
    iceUrls: '',
    /** ICE 用户名 */
    iceUsername: '',
    /** ICE 凭证 */
    iceCredential: '',
  },
  /** 家庭模式配置 */
  homeMode: {
    /** 触发器冷却时间（毫秒） */
    triggerCooldownMs: 60_000,
    /** 应用最大重试次数 */
    applyMaxRetries: 2,
    /** 最大触发器日志数 */
    maxTriggerLogs: 50,
    /** 最大执行历史数 */
    maxExecHistory: 100,
    /** 是否显示离家按钮 */
    showAwayButton: true,
    /** 是否显示家庭模式 */
    showHomeMode: true,
    /** 手动激活锁定（分钟） */
    manualLockTtlMin: 30,
    /** 联动占用 TTL（分钟） */
    linkageClaimTtlMin: 15,
  },
  /** 环境传感器映射（由共享模块构建默认值） */
  envSensorMap: buildDefaultEnvSensorMap(),
  /** 媒体播放列表配置 */
  mediaPlaylists: {},
  /** 语音配置 */
  voice: {
    /** STT 模式：browser（浏览器） */
    sttMode: 'browser',
    /** 语言设置 */
    language: 'zh-CN',
    /** STT 实体 ID */
    sttEntityId: '',
    /** 是否使用 HA 对话 */
    useHaConversation: false,
    /** 命令映射未命中时回落智能管家（Agent LLM）：默认关闭（避免无 LLM 配置时产生费用） */
    agentFallback: false,
    /** 是否启用每日顾问语音播报 */
    dailyAdvisorSpeak: false,
    /** 每日顾问语音播报时间（小时） */
    dailyAdvisorSpeakHour: 20,
    /** 每日顾问日间 TTS 模板 */
    dailyAdvisorTtsDaytime: '',
    /** 每日顾问晚间 TTS 模板 */
    dailyAdvisorTtsEvening: '',
    /** 交互模式：push（推送） */
    interactionMode: 'push',
    /** 是否启用唤醒词 */
    wakeWordEnabled: false,
    /** 唤醒词列表 */
    wakeWords: ['小智'],
    /** 连续对话（免重复唤醒）：默认关闭 */
    continuousConversation: false,
    /** 是否启用 TTS */
    ttsEnabled: true,
    /** TTS 输出：ha=HA 音箱（默认，兼容现网） */
    ttsOutputMode: 'ha',
    /** TTS 告警规则（继承默认值） */
    ttsAlerts: { ...DEFAULT_VOICE_ALERT_RULES },
    /** TTS 告警模板 */
    ttsAlertTemplates: {},
    /** 自定义 TTS 告警列表 */
    customTtsAlerts: [],
    /** 实体 TTS 告警列表 */
    entityTtsAlerts: [],
  },
  /** 语音命令列表 */
  voiceCommands: [],
  /** 客户端功耗配置 */
  clientPower: {
    /** 是否启用客户端功耗监测 */
    enabled: false,
    /** 上报间隔（秒） */
    reportIntervalSec: 10,
    /** 状态过期超时（秒） */
    staleTimeoutSec: 300,
    /** 冷却时间（分钟） */
    cooldownMin: 5,
    /** 联动动作失败重试次数 */
    linkageRetryCount: 2,
    /** 联动动作失败重试间隔（毫秒） */
    linkageRetryDelayMs: 5000,
    /** 客户端列表 */
    clients: [],
  },
} as AppConfigData;