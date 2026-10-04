/**
 * 应用配置类型定义：AppConfigData 全量配置结构、配置审计条目、深度部分更新类型。
 *
 * 职责：
 *   - AppConfigData：系统运行参数的根类型，涵盖认证/通知/安防/能源/电价/自动化/前端/HA 连接器/
 *     状态存储/WS 推送/语音等分区，由 defaults.ts 提供默认值、validate/* 校验边界；
 *   - ConfigAuditEntry：配置审计日志条目，记录分区变更时间与被修改键；
 *   - DeepPartialAppConfigData：PUT /system/config 局部 patch 的类型。
 * 关键依赖：
 *   - ../../common/alert-support/voice-alert.util（语音告警规则/模板类型）
 *   - ../../common/database/retention-tables#RetentionConfig（历史保留天数契约）
 *   - @homeos/shared（UI/屏保/环境传感器映射/客户端功耗等跨端共享类型）
 */
import type {
  CustomTtsAlertRule,
  EntityTtsAlertRule,
  VoiceAlertRules,
  VoiceAlertTemplates,
} from '../../common/alert-support/voice-alert.util';
import type { RetentionConfig } from '../../common/database/retention-tables';
import type {
  ClientPowerSettings,
  SharedUiConfig,
  SharedScreensaverConfig,
  SharedEnvSensorMap,
} from '@homeos/shared';

/** 配置审计日志条目：记录某次分区更新/重置操作的时间、分区与被修改键 */
export interface ConfigAuditEntry {
  at: string;
  section: string;
  keys: string[];
  action: 'update' | 'reset';
}

// 默认值 — 所有运行参数

/**
 * 系统运行参数根类型。各分区由 defaults.ts 提供默认值、validate/* 校验边界；
 * 部分分区（ui/screensaver/weatherEffects/clientPower 等）契约由 @homeos/shared 跨端共享。
 */
export interface AppConfigData {
  auth: {
    lockoutMaxAttempts: number;
    lockoutMinutes: number;
    /** 登录 Cookie / JWT 有效期（天）；配合 /auth/refresh 滑动续期 */
    sessionExpireDays: number;
    /** 登录安全告警总开关（新设备/暴力破解共用） */
    loginAlertEnabled: boolean;
    /** 新设备/新 UA 首次登录告警开关 */
    newDeviceAlertEnabled: boolean;
    /** 新设备告警按 IP 冷却时长（分钟），默认 1440（24h） */
    newDeviceAlertCooldownMin: number;
    /** 暴力破解告警开关（阈值复用 lockoutMaxAttempts） */
    bruteForceAlertEnabled: boolean;
  };
  notification: {
    dndStart: number; // 免打扰开始小时
    dndEnd: number; // 免打扰结束小时
    maxNotifications: number; // in-app 条数软上限（优先清理已读；天数硬删见 retention.notification）
    globalNotifyEnabled: boolean;
    importantNotifyEnabled: boolean;
    offlineNotifyEnabled: boolean;
    lowBatteryNotifyEnabled: boolean;
    offlineCooldownMin: number;
    lowBatteryCooldownMin: number;
  };
  security: {
    sensorAlertCooldownSec: number;
    awayConfirmMin: number;
    /**
     * 为 true 且 presencePersons 为空时不自动跟踪全部 tracker，
     * 视为无人被跟踪且不发出 everyoneLeft
     */
    requireConfiguredPersons: boolean;
    /** 人员在线判定：手动定义人员并关联多个判定实体（任一实体在家则人员在家） */
    presencePersons: Array<{ id: string; name: string; entityIds: string[] }>;
    /** 家庭成员画像融合 mmWave 房间在场：tracker 全部离场但 mmWave 仍检测到房间有人时，不判定全员离家 */
    mmWaveFusePresence: boolean;
    /** 全员离家时自动布防（armed_away） */
    autoArmOnEveryoneLeft: boolean;
    /** 居家/夜间模式下全员离家时升级为 armed_away */
    autoUpgradeToAwayOnEveryoneLeft: boolean;
    /** 日历外出时段开始时自动布防（armed_away） */
    calendarArmOnAway: boolean;
    /** 首人到家时自动切居家布防（armed_home，非全撤防） */
    autoDisarmOnFirstHome: boolean;
    /** 布防 armed_away 时自动启用离家模拟 */
    linkAwaySimOnArmAway: boolean;
    /** 布防状态变更时按对照表/名称联动家庭模式；撤防默认退出家庭模式 */
    linkHomeModeOnSecurityChange: boolean;
    /** Frigate 人物告警生效的布防模式（逗号分隔，none=关闭） */
    frigatePersonAlarmModes: string;
    /** 紧急求助重复触发冷却（秒） */
    emergencyCooldownSec: number;
    frigateMaxEvents: number;
    frigateDedupMs: number;
    awaySimBrightnessMin: number;
    awaySimBrightnessRange: number;
    /** 离家模拟随机间隔范围（分钟） */
    awaySimIntervalMinMax: { min: number; max: number };
    configCacheTtlMs: number;
    /**
     * 安防独立告警渠道：紧急/布防触发/紧急求助类事件强制投递的渠道
     * （in_app / email / webpush）；空数组表示不启用独立渠道，保持原有行为
     */
    alertChannels: ('in_app' | 'email' | 'webpush')[];
    /** 安防独立告警是否绕过免打扰（DND）；安防事件链路天然绕过 DND，默认 true */
    alertBypassDnd: boolean;
    /** 布防撤防宽限期（秒）：布防后门锁解锁在该秒数内不视为入侵（0=关闭） */
    armExitGraceSeconds: number;
  };
  circadian: {
    /** HA weather 实体（节律照明按天气调整时使用） */
    weatherEntityId: string;
  };
  childMode: {
    enabled: boolean;
    dailyMediaLimitMin: number;
    deviceWhitelist: string[];
    timeWindows: Array<{
      days: number[] | 'weekday' | 'weekend';
      start: string;
      end: string;
    }>;
  };
  water: {
    /** 用水异常告警冷却（分钟） */
    anomalyCooldownMin: number;
    /** 总水阀实体 ID（顾问层关阀建议，不自动关阀） */
    mainValveEntityId: string;
  };
  iaq: {
    moldAlertCooldownMin: number;
  };
  energy: {
    meterEntityId: string;
    circuitEntityIds: string[];
    learningPeriodDays: number;
    learningStartedAt: string;
    anomalyCooldownMin: number;
    budgetAlertCooldownMin: number;
  };
  pricing: {
    /** tiered=年累计阶梯；fixed=固定单价（如新疆等非阶梯地区） */
    pricingMode: 'tiered' | 'fixed';
    fixedPrice: number;
    regionLabel: string;
    /** 启用分时峰谷平单价（关闭后 Widget 不按时段变价，峰段仍可用于温控错峰） */
    timeOfUseEnabled: boolean;
    peakStart1: string;
    peakEnd1: string;
    peakStart2: string;
    peakEnd2: string;
    /** 谷段起止（默认 23:00–07:00，跨日） */
    valleyStart: string;
    valleyEnd: string;
    /** 峰/谷/平单价（元/kWh）；0 表示按阶梯或 fixedPrice 自动推导 */
    peakPrice: number;
    valleyPrice: number;
    flatPrice: number;
    tier1Kwh: number;
    tier1Price: number;
    tier2Price: number;
    tier3Price: number;
  };
  other: {
    /** PostgreSQL 历史表统一保留天数（事件日志/执行记录/通知/安防/环境/用水等） */
    eventlogRetentionDays: number;
    haHistoryCacheMin: number;
    speakCooldownMin: number;
    tipCooldownHours: number;
    guestPassDefaultHours: number;
    guestPassExtendHours: number;
    /** 全员离家 / 日历外出时段开始时自动撤销所有访客临时密码（防闲置密码被滥用） */
    guestPassRevokeOnAway: boolean;
    /** 智能顾问建议一键执行：category → home_mode | scene UUID */
    advisorTipActions: Record<string, { type: 'home_mode' | 'scene'; id: string }>;
    /** 首装后引导任务清单关闭时间（ISO）；null 表示未关闭 */
    setupChecklistDismissedAt: string | null;
  };
  frontend: {
    apiTimeoutMs: number;
    apiRetryMax: number;
    haDisconnectDebounceMs: number;
    initialStatesWaitMs: number;
    entityCacheEnabled: boolean;
    entityCacheMaxAgeMs: number;
    entityCacheSaveDebounceMs: number;
    rebuildChunkSize: number;
    rebuildDebounceMs: number;
    maxListeners: number;
    callDedupWindowMs: number;
    maxRemoteNotifications: number;
    sessionRefreshHours: number;
    widgetPollIntervals: Record<string, number>;
    optimisticTtlMs: number;
    largeEntityThreshold: number;
    workerDerivedThreshold: number;
    initStatesBatchSize: number;
    apiRetryDelayMs: number;
  };
  /** 多配置方案：服务端记录当前激活 profile（供安防联动等读取 layout） */
  profiles: {
    activeProfileId: string;
    /** 无终端绑定时，新终端默认使用的方案策略 */
    newTerminalDefault: 'activeProfile' | 'default';
    /** 终端 clientId → 显示方案绑定（跨设备/清缓存后恢复） */
    terminalBindings: Array<{
      clientId: string;
      profileId: string;
      label?: string;
      updatedAt: string;
      /** 绑定创建者 userId（软所有权标记，非 admin 仅可修改自己创建的绑定） */
      boundBy?: string;
    }>;
  };
  ui: SharedUiConfig & {
    scaleBaseWidth: number; // 缩放基准宽度（墙面板设计分辨率）
    scaleBaseHeight: number; // 缩放基准高度
    screensaverEnabled: boolean; // 是否启用屏保
    screensaverIdleMs: number; // 屏保空闲触发时间（毫秒）
    accentColor: string; // 界面强调色
  };
  /** 锁屏/屏保视觉与元素开关（前端公开，可热更新） */
  screensaver: SharedScreensaverConfig & {
    scale: number; // 全局缩放倍率（1 = 100%）
    defaultMode: string; // clock | weather | random
    enableWeatherMode: boolean; // 是否参与随机/天气模式
    instantEnter: boolean; // 进入锁屏时跳过长渐显动画
    instantLeave: boolean; // 唤醒时快速离开
    brightness: number; // 锁屏态视觉亮度 0.3~1（1=不降）
    showBrand: boolean;
    showSeconds: boolean;
    showGregorianDate: boolean;
    showLunar: boolean;
    showWeatherIcon: boolean;
    showWeatherDesc: boolean;
    showWeatherStats: boolean;
    showWeatherMeta: boolean;
    timeSizeVw: number;
    sepSizeVw: number;
    secSizeVw: number;
    metaSizeVw: number;
    subMetaSizeVw: number;
    brandSizePx: number;
    weatherTempSizeVw: number;
    weatherIconSizeVw: number;
    weatherStatsSizePx: number;
    brandTopVh: number;
    contentShiftVh: number;
  };
  /** 天气场景背景特效（前端公开，可热更新） */
  weatherEffects: {
    enabled: boolean;
    preset: string;
    displayRoutes: string[];
    useEntityAttributes: boolean;
    densityMultiplier: number;
    windMultiplier: number;
    attributeBlend: number;
    starCount: number;
    cloudLayers: number;
    shootingStarRate: number;
    scenes: {
      clearDay: Partial<{ sunGlow: number; heatHaze: number; dustMotes: number; skyTint: number; skyDarken: number }>;
      clearNight: Partial<{
        starBrightness: number;
        moonGlow: number;
        aurora: number;
        skyTint: number;
        skyDarken: number;
      }>;
      partlyCloudy: Partial<{
        sunbeam: number;
        dustMotes: number;
        driftSpeed: number;
        skyTint: number;
        skyDarken: number;
      }>;
      cloudy: Partial<{ opacity: number; driftSpeed: number; skyTint: number; skyDarken: number }>;
      drizzle: Partial<{ intensity: number; mist: number; skyTint: number; skyDarken: number }>;
      rain: Partial<{ intensity: number; glassDrops: number; puddle: boolean; skyTint: number; skyDarken: number }>;
      heavyRain: Partial<{ intensity: number; darkening: number; skyTint: number; skyDarken: number }>;
      thunderstorm: Partial<{
        rainIntensity: number;
        lightningMinMs: number;
        lightningMaxMs: number;
        flashStrength: number;
        skyTint: number;
        skyDarken: number;
      }>;
      snow: Partial<{ intensity: number; accumulation: number; coldTint: number; skyTint: number; skyDarken: number }>;
      sleet: Partial<{ rainRatio: number; snowRatio: number; skyTint: number; skyDarken: number }>;
      windy: Partial<{ leafParticles: number; gustStrength: number; skyTint: number; skyDarken: number }>;
      hail: Partial<{ hailDensity: number; hailBounce: number; skyTint: number; skyDarken: number }>;
      sandstorm: Partial<{ opacity: number; intensity: number; driftSpeed: number; skyTint: number; skyDarken: number }>;
    };
  };
  /** 外部集成（密钥仅存服务端，不进入 public 配置） */
  external: {
    openWeatherApiKey: string;
    weatherLat: number;
    weatherLon: number;
    /** HA media_player 实体，用于 tts.speak 播报（如 media_player.living_room） */
    ttsMediaPlayerId: string;
    /** HA media_player 实体列表，用于多音箱播报 */
    ttsMediaPlayerIds: string[];
    /** iCal/CalDAV 订阅 URL（.ics 导出链接） */
    calendarUrl: string;
    /** 日历同步间隔（分钟） */
    calendarSyncMin: number;
    /** 临近外出事件时日历短轮询间隔（分钟），默认 5 */
    calendarSyncShortMin: number;
    /** 日历增量同步：启用 ETag / If-Modified-Since 条件请求，未变更时复用上次解析结果 */
    calendarIncrementalEnabled: boolean;
    /** 天气备用降级实体（HA weather 域，OpenWeather 不可用时兜底；留空自动识别） */
    weatherFallbackEntityId: string;
    /** 启用动态电价 API（替代静态峰谷平配置） */
    dynamicPricingEnabled: boolean;
    /** 动态电价 API 地址（JSON：{ schedule: [{ start, price, period }] }） */
    dynamicPricingUrl: string;
    /** 动态电价 API 鉴权 Key（可选，作为 X-Api-Key 请求头） */
    dynamicPricingApiKey: string;
    /** 动态电价刷新间隔（小时），默认 24 */
    dynamicPricingRefreshHours: number;
    weatherAlertsTtlMin: number;
    weatherAlertRefreshMs: number;
    /** 天气预警监听开关（后台轮询 + 推送） */
    weatherAlertEnabled: boolean;
    /** 推送阈值：仅推送不低于该等级的预警（red/orange/yellow） */
    weatherAlertNotifyLevel: string;
    /** 红色预警安全联动场景（关窗/拉帘/布防），留空禁用 */
    weatherAlertSceneId: string;
    /** 极端天气联动家庭模式，留空禁用 */
    weatherAlertModeId: string;
    /** 极端天气联动冷却（分钟），避免重复执行 */
    weatherAlertCooldownMin: number;
  };
  haConnector: {
    reconnectBaseMs: number;
    maxReconnectDelayMs: number;
    entityRegistryCacheMs: number;
    entityRegistryTimeoutMs: number;
    commandQueueMax: number;
    commandQueueTtlMs: number;
    historyCacheMaxSize: number;
    ingressCoalesceEnabled: boolean;
    ingressCoalesceWindowMs: number;
    ingressCoalesceDomains: string[];
    disconnectRestPollEnabled: boolean;
    disconnectRestPollInitialDelayMs: number;
    disconnectRestPollIntervalMs: number;
    disconnectRestPollTimeoutMs: number;
    /** 仅同步 HA 已启用且未隐藏的实体（依据 entity_registry） */
    syncOnlyEnabledEntities: boolean;
    /** HA WS 应用层 ping 间隔（毫秒） */
    wsPingIntervalMs: number;
    /** HA WS pong 超时（毫秒） */
    wsPongTimeoutMs: number;
    /** 连续心跳未响应次数达到该值才主动断开 */
    wsHeartbeatMaxMisses: number;
    /** Cold Path 批窗口（毫秒） */
    coldBatchWindowMs: number;
    /** Cold Path 单批上限 */
    coldBatchMax: number;
    /** HA WS Leader 租约 TTL（毫秒） */
    leaderTtlMs: number;
    /** HA WS Leader 续约间隔（毫秒） */
    leaderRenewMs: number;
  };
  ops: {
    retentionCleanupIntervalHours: number;
    retentionDeleteBatchSize: number;
    retentionFirstDelaySec: number;
    eventLogFlushIntervalMs: number;
    eventLogMaxBuffer: number;
    eventLogMaxRequeueBuffer: number;
    eventLogTimelineMax: number;
    eventLogTimelineHours: number;
    eventLogOverlayHours: number;
    eventLogTierEnabled: boolean;
    eventLogTierCSampleRate: number;
    eventLogSkipSensorTimeline: boolean;
    /** 启用后按域/实体过滤 EventLog 持久化（不影响 L1 状态与 WS 推送） */
    eventLogRecordFilterEnabled: boolean;
    /** block=排除指定域；allow_domains=仅记录指定域 */
    eventLogRecordFilterMode: 'block' | 'allow_domains';
    eventLogRecordBlockDomains: string[];
    eventLogRecordAllowDomains: string[];
    eventLogRecordBlockEntityIds: string[];
    configAuditMaxEntries: number;
    configAuditPersistEnabled: boolean;
    sceneExecHistoryMax: number;
    scriptExecHistoryMax: number;
    /** 定时自动备份开关（每天 02:30 北京时间自动生成完整备份包） */
    autoBackupEnabled: boolean;
    /** 自动备份保留天数（超出后清理旧产物，1~365） */
    autoBackupRetainDays: number;
    /**
     * 家庭本地 IANA 时区（日切 / cron / 场景定时统一时钟）。
     * 例：Asia/Shanghai；空则回退进程本地时区。
     */
    homeTimezone: string;
  };
  /** 各业务表历史数据保留天数（数据库历史清理按表独立生效；未配置时回退遗留 other.eventlogRetentionDays） */
  retention: RetentionConfig;
  stateStore: {
    redisWriteBatch: number;
    /** 增量 STATE_CHANGED 写入 Redis 的 debounce 毫秒数 */
    redisIncrementalFlushMs: number;
    maxRecentChanges: number;
    restCacheTtlMs: number;
    /** HA 断连超过该毫秒数后实体影子数据视为陈旧 */
    staleThresholdMs: number;
    /** initial_states 推送时关键域优先排序 */
    initialStatesPriorityEnabled: boolean;
  };
  wsPush: {
    stateFlushIntervalMs: number;
    sensorFlushIntervalMs: number;
    criticalDomains: string[];
    stateBatchMax: number;
    haSyncWaitMs: number;
    replayChunkSize: number;
    roomBatchEmit: boolean;
    coldEntityOnDemand: boolean;
    /**
     * 延迟档位：realtime 禁止大实体自适应抬高窗口；
     * balanced 为默认；bulk 偏向吞吐。
     */
    latencyProfile: 'realtime' | 'balanced' | 'bulk';
    /** 关键域 Socket.IO 合并窗口（毫秒）；0=立即 flush */
    criticalFlushIntervalMs: number;
    /** 钉选/可见传感器短窗口（毫秒）；realtime 档生效 */
    pinnedSensorFlushIntervalMs: number;
  };
  commandProxy: {
    idempotencyTtlMs: number;
    idempotencyCleanupIntervalMs: number;
  };
  /** WebRTC 跨网 TURN/STUN（与 HA get_client_config 合并） */
  webrtc: {
    /** 额外 ICE URL，逗号分隔，如 turn:192.168.1.10:3478?transport=udp */
    iceUrls: string;
    iceUsername: string;
    iceCredential: string;
  };
  homeMode: {
    triggerCooldownMs: number;
    applyMaxRetries: number;
    maxTriggerLogs: number;
    maxExecHistory: number;
    showAwayButton: boolean;
    showHomeMode: boolean;
    /** 手动激活后锁定时长（分钟），期间低优先级联动不可覆盖 */
    manualLockTtlMin: number;
    /** 联动占用声明 TTL（分钟） */
    linkageClaimTtlMin: number;
  };
  /** 房间环境传感器自定义映射（key=房间ID，value=实体ID 与自定义房间名） */
  envSensorMap: SharedEnvSensorMap;
  /** 影音播放列表持久化（player entity_id → 队列） */
  mediaPlaylists: Record<
    string,
    {
      items: Array<{ mediaContentId: string; mediaContentType: string; title?: string }>;
      index: number;
    }
  >;
  /** 语音识别与 Assist 集成 */
  voice: {
    /** browser = 浏览器 Web Speech API；ha = 后端转发 HA STT；auto = HA STT 失败时回退浏览器 */
    sttMode: 'browser' | 'ha' | 'auto';
    /** STT 语言 */
    language: string;
    /** HA stt.* 实体（空则调用时自动探测） */
    sttEntityId: string;
    /** 识别后将文本交给 HA conversation.process（需 HA Assistant） */
    useHaConversation: boolean;
    /** 命令映射未命中且 HA 对话不可用时，回落智能管家（Agent LLM）理解并执行 */
    agentFallback: boolean;
    /** 每日首次进入主界面时播报智能顾问问候（需配置播报音箱） */
    dailyAdvisorSpeak: boolean;
    /** 每日顾问播报起始小时（0–23，到达该时刻后当日首次进入主界面触发） */
    dailyAdvisorSpeakHour: number;
    /** 每日顾问白天问候文案（留空=默认；支持 {{hour}}） */
    dailyAdvisorTtsDaytime: string;
    /** 每日顾问晚间问候文案（20 点及以后；留空=默认；支持 {{hour}}） */
    dailyAdvisorTtsEvening: string;
    /** 语音交互：push=长按说话；wake=唤醒词待命 */
    interactionMode: 'push' | 'wake';
    /** 是否启用唤醒词（仅浏览器 STT 连续聆听） */
    wakeWordEnabled: boolean;
    /** 唤醒词列表，如 ['小智','你好家居'] */
    wakeWords: string[];
    /**
     * 连续对话（免重复唤醒）：唤醒后一段时间内无需再次唤醒，
     * 后续指令携带会话 id，由管家基于上文实体 / 意图补全执行。
     */
    continuousConversation: boolean;
    /** 全局 TTS 播报开关（false 时跳过语音反馈） */
    ttsEnabled: boolean;
    /**
     * TTS 输出：local=本机 SpeechSynthesis；ha=HA 音箱；auto=本机优先失败回退 HA。
     * 默认 ha，保持现网行为。
     */
    ttsOutputMode: 'local' | 'ha' | 'auto';
    /** 自动 TTS 告警规则开关 */
    ttsAlerts: VoiceAlertRules;
    /** 内置告警自定义播报模板 */
    ttsAlertTemplates: VoiceAlertTemplates;
    /** 用户自定义告警规则 */
    customTtsAlerts: CustomTtsAlertRule[];
    /** 按实体精确匹配的 TTS 播报 */
    entityTtsAlerts: EntityTtsAlertRule[];
  };
  /** 客户端电量检测与充放电联动（契约由 @homeos/shared ClientPowerSettings 统一维护） */
  clientPower: ClientPowerSettings;
  /** 语音命令短语 → HA 服务映射（可后台配置） */
  voiceCommands: Array<{
    phrases: string[];
    domain: string;
    service: string;
    entityMatch?: string;
    serviceData?: Record<string, unknown>;
  }>;
}

/**
 * 分区可选的深度部分更新类型（PUT /system/config、profiles 局部 patch 等）。
 * 每个顶层分区可选，分区内的字段也可选，支持局部更新。
 */
export type DeepPartialAppConfigData = {
  [K in keyof AppConfigData]?: Partial<AppConfigData[K]>;
};
