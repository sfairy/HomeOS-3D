/**
 * 系统配置字段中文标签表
 *
 * 职责：
 * - 维护系统配置字段 key → 中文标签的映射表（LABEL_TEXT）。
 * - 提供字段标签查询函数，优先按「分区.字段」查专属标签，回退通用标签，再回退字段 key。
 *
 * 依赖：无外部依赖，纯静态文案表与纯函数。
 *
 * 注意：
 * - 对象 key 为 i18n 文案 key（如 `settings.systemConfig.field.xxx`），不翻译。
 * - 仅面向用户的标签文案 value 使用简体中文。
 */
const LABEL_TEXT: Record<string, string> = {
  'settings.systemConfig.field.accentColor':
    '强调色',
  'settings.systemConfig.field.alertBypassDnd':
    '告警绕过免打扰',
  'settings.systemConfig.field.alertChannels':
    '告警渠道（逗号分隔）',
  'settings.systemConfig.field.anomalyCooldownMin':
    '异常告警冷却（分钟）',
  'settings.systemConfig.field.apiRetryDelayMs':
    '接口重试延迟（毫秒）',
  'settings.systemConfig.field.apiRetryMax':
    '接口最大重试次数',
  'settings.systemConfig.field.apiTimeoutMs':
    '接口超时（毫秒）',
  'settings.systemConfig.field.applyMaxRetries':
    '家庭模式应用重试次数',
  'settings.systemConfig.field.armExitGraceSeconds':
    '布防宽限期（秒）',
  'settings.systemConfig.field.autoBackupEnabled':
    '定时自动备份',
  'settings.systemConfig.field.autoBackupRetainDays':
    '备份保留天数',
  'settings.systemConfig.field.awayConfirmMin':
    '离家确认等待（分钟）',
  'settings.systemConfig.field.awaySimBrightnessMin':
    '离家模拟最低亮度（%）',
  'settings.systemConfig.field.awaySimBrightnessRange':
    '离家模拟亮度随机范围',
  'settings.systemConfig.field.awaySimIntervalMinMax':
    '离家模拟随机间隔（分钟）',
  'settings.systemConfig.field.brandSizePx':
    '标题字号（px）',
  'settings.systemConfig.field.brandTopVh':
    '标题距顶部（vh）',
  'settings.systemConfig.field.calendarSyncMin':
    '日历同步间隔（分钟）',
  'settings.systemConfig.field.calendarSyncShortMin':
    '临近外出时的日历短轮询间隔（分钟）',
  'settings.systemConfig.field.calendarIncrementalEnabled':
    '日历增量同步（ETag 条件请求）',
  'settings.systemConfig.field.weatherFallbackEntityId':
    '天气备用降级实体（HA weather 域）',
  'settings.systemConfig.field.dynamicPricingEnabled':
    '启用动态电价 API',
  'settings.systemConfig.field.dynamicPricingUrl':
    '动态电价 API 地址',
  'settings.systemConfig.field.dynamicPricingApiKey':
    '动态电价 API 鉴权 Key',
  'settings.systemConfig.field.dynamicPricingRefreshHours':
    '动态电价刷新间隔（小时）',
  'settings.systemConfig.field.calendarUrl':
    '日历订阅地址',
  'settings.systemConfig.field.callDedupWindowMs':
    '调用去重窗口（毫秒）',
  'settings.systemConfig.field.commandQueueMax':
    'Home Assistant 命令队列上限',
  'settings.systemConfig.field.commandQueueTtlMs':
    'Home Assistant 命令队列有效时间（毫秒）',
  'settings.systemConfig.field.configAuditMaxEntries':
    '配置变更审计保留条数',
  'settings.systemConfig.field.configAuditPersistEnabled':
    '持久化配置变更审计',
  'settings.systemConfig.field.configCacheTtlMs':
    '安防配置缓存有效时间（毫秒）',
  'settings.systemConfig.field.contentShiftVh':
    '主内容垂直偏移（vh）',
  'settings.systemConfig.field.cooldownMin':
    '客户端电量联动冷却（分钟）',
  'settings.systemConfig.field.criticalDomains':
    '关键域即时推送列表',
  'settings.systemConfig.field.dailyMediaLimitMin':
    '儿童模式每日媒体时长（分钟，0=不限制）',
  'settings.systemConfig.field.deviceWhitelist':
    '儿童模式设备白名单',
  'settings.systemConfig.field.defaultMode':
    '默认展示模式',
  'settings.systemConfig.field.disconnectRestPollEnabled':
    'HA 断连 REST 补同步',
  'settings.systemConfig.field.disconnectRestPollInitialDelayMs':
    '断连 REST 首次延迟（毫秒）',
  'settings.systemConfig.field.disconnectRestPollIntervalMs':
    '断连 REST 轮询间隔（毫秒）',
  'settings.systemConfig.field.disconnectRestPollTimeoutMs':
    '断连 REST 请求超时（毫秒）',
  'settings.systemConfig.field.emergencyCooldownSec':
    '紧急求助重复触发冷却（秒）',
  'settings.systemConfig.field.enableWeatherMode':
    '启用天气锁屏',
  'settings.systemConfig.field.instantEnter':
    '锁屏即时进入',
  'settings.systemConfig.field.instantLeave':
    '锁屏即时唤醒',
  'settings.systemConfig.field.brightness':
    '锁屏亮度',
  'settings.systemConfig.field.entityCacheEnabled':
    '启用浏览器本地实体缓存',
  'settings.systemConfig.field.entityCacheMaxAgeMs':
    '实体缓存有效期（毫秒）',
  'settings.systemConfig.field.entityCacheSaveDebounceMs':
    '实体缓存写入防抖（毫秒）',
  'settings.systemConfig.field.entityRegistryCacheMs':
    '实体注册表缓存（毫秒）',
  'settings.systemConfig.field.entityRegistryTimeoutMs':
    '实体注册表超时（毫秒）',
  'settings.systemConfig.field.eventLogFlushIntervalMs':
    '事件日志刷盘间隔（毫秒）',
  'settings.systemConfig.field.eventLogMaxBuffer':
    '事件日志缓冲上限',
  'settings.systemConfig.field.eventLogMaxRequeueBuffer':
    '事件日志失败回灌上限',
  'settings.systemConfig.field.eventLogSkipSensorTimeline':
    '跳过 sensor Redis 时间线',
  'settings.systemConfig.field.eventLogTierCSampleRate':
    'EventLog C 级采样率',
  'settings.systemConfig.field.eventLogTierEnabled':
    'EventLog 分级持久化',
  'settings.systemConfig.field.budgetAlertCooldownMin':
    '能源预算告警冷却（分钟）',
  'settings.systemConfig.field.eventLogOverlayHours':
    '平面图事件浮层回溯（小时）',
  'settings.systemConfig.field.eventLogTimelineMax':
    '缓存时间线保留条数',
  'settings.systemConfig.field.eventLogTimelineHours':
    '系统时间线回溯（小时）',
  'settings.systemConfig.field.frigateDedupMs':
    '摄像头告警去重窗口（毫秒）',
  'settings.systemConfig.field.frigateMaxEvents':
    '摄像头事件保留条数',
  'settings.systemConfig.field.frigatePersonAlarmModes':
    '摄像头人物告警生效模式（逗号分隔，none=关闭）',
  'settings.systemConfig.field.guestPassDefaultHours':
    '访客密码默认有效期（小时）',
  'settings.systemConfig.field.guestPassExtendHours':
    '访客密码续期时长（小时）',
  'settings.systemConfig.field.guestPassRevokeOnAway':
    '离家时撤销访客通行证',
  'settings.systemConfig.field.haDisconnectDebounceMs':
    'Home Assistant 断连防抖（毫秒）',
  'settings.systemConfig.field.haHistoryCacheMin':
    'Home Assistant 历史缓存（分钟）',
  'settings.systemConfig.field.haSyncWaitMs':
    '实时推送等待 Home Assistant 同步（毫秒）',
  'settings.systemConfig.field.historyCacheMaxSize':
    'Home Assistant 历史缓存条数',
  'settings.systemConfig.field.idempotencyCleanupIntervalMs':
    '幂等缓存清理间隔（毫秒）',
  'settings.systemConfig.field.idempotencyTtlMs':
    '命令幂等有效时间（毫秒）',
  'settings.systemConfig.field.iceUrls':
    'ICE/TURN 地址',
  'settings.systemConfig.field.iceUsername':
    'TURN 用户名',
  'settings.systemConfig.field.iceCredential':
    'TURN 密码',
  'settings.systemConfig.field.ingressCoalesceDomains':
    '入口合并域列表',
  'settings.systemConfig.field.ingressCoalesceEnabled':
    'HA 入口状态合并',
  'settings.systemConfig.field.ingressCoalesceWindowMs':
    '入口合并窗口（毫秒）',
  'settings.systemConfig.field.initStatesBatchSize':
    '实体分批加载大小',
  'settings.systemConfig.field.initialStatesPriorityEnabled':
    '全量同步关键域优先',
  'settings.systemConfig.field.initialStatesWaitMs':
    '实时连接全量同步等待（毫秒）',
  'settings.systemConfig.field.linkageClaimTtlMin':
    '联动声明有效期（分钟）',
  'settings.systemConfig.field.largeEntityThreshold':
    '大户型实体数量阈值',
  'settings.systemConfig.field.workerDerivedThreshold':
    '派生索引 Worker 阈值',
  'settings.systemConfig.field.roomBatchEmit':
    'WS 分组批推',
  'settings.systemConfig.field.coldEntityOnDemand':
    '冷实体按需 WS（非可见不推）',
  'settings.systemConfig.field.latencyProfile':
    'WS 延迟档位',
  'settings.systemConfig.field.criticalFlushIntervalMs':
    '关键域推送合并窗口（毫秒）',
  'settings.systemConfig.field.pinnedSensorFlushIntervalMs':
    '钉选传感器推送窗口（毫秒）',
  'settings.systemConfig.field.wsPingIntervalMs':
    'HA WS 心跳间隔（毫秒）',
  'settings.systemConfig.field.wsPongTimeoutMs':
    'HA WS pong 超时（毫秒）',
  'settings.systemConfig.field.wsHeartbeatMaxMisses':
    'HA WS 心跳最大连续未响应次数',
  'settings.systemConfig.field.coldBatchWindowMs':
    'Cold Path 批窗口（毫秒）',
  'settings.systemConfig.field.coldBatchMax':
    'Cold Path 单批上限',
  'settings.systemConfig.field.leaderTtlMs':
    'HA WS Leader 租约 TTL（毫秒）',
  'settings.systemConfig.field.leaderRenewMs':
    'HA WS Leader 续约间隔（毫秒）',
  'settings.systemConfig.field.learningPeriodDays':
    '能源异常学习期（天）',
  'settings.systemConfig.field.lowBatteryCooldownMin':
    '低电量告警冷却（分钟）',
  'settings.systemConfig.field.mainValveEntityId':
    '总水阀实体标识',
  'settings.systemConfig.field.manualLockTtlMin':
    '手动锁定有效期（分钟）',
  'settings.systemConfig.field.maxExecHistory':
    '家庭模式执行历史上限',
  'settings.systemConfig.field.maxListeners':
    '最大监听器数',
  'settings.systemConfig.field.maxNotifications':
    '通知条数软上限（优先清理已读）',
  'settings.systemConfig.field.maxRecentChanges':
    '近期状态变更缓冲上限',
  'settings.systemConfig.field.maxReconnectDelayMs':
    'Home Assistant 重连最大延迟（毫秒）',
  'settings.systemConfig.field.maxRemoteNotifications':
    '远程通知上限',
  'settings.systemConfig.field.maxTriggerLogs':
    '家庭模式触发日志上限',
  'settings.systemConfig.field.metaSizeVw':
    '主信息字号（vw）',
  'settings.systemConfig.field.moldAlertCooldownMin':
    '霉变预警冷却（分钟）',
  'settings.systemConfig.field.offlineCooldownMin':
    '离线告警冷却（分钟）',
  'settings.systemConfig.field.openWeatherApiKey':
    '开放天气接口密钥',
  'settings.systemConfig.field.optimisticTtlMs':
    '乐观更新有效时间（毫秒）',
  'settings.systemConfig.field.peakEnd1':
    '峰段一结束',
  'settings.systemConfig.field.peakEnd2':
    '峰段二结束',
  'settings.systemConfig.field.peakStart1':
    '峰段一开始',
  'settings.systemConfig.field.peakStart2':
    '峰段二开始',
  'settings.systemConfig.field.timeOfUseEnabled':
    '启用峰谷平分时电价',
  'settings.systemConfig.field.valleyStart':
    '谷段开始',
  'settings.systemConfig.field.valleyEnd':
    '谷段结束',
  'settings.systemConfig.field.peakPrice':
    '峰段单价（元/kWh）',
  'settings.systemConfig.field.valleyPrice':
    '谷段单价（元/kWh）',
  'settings.systemConfig.field.flatPrice':
    '平段单价（元/kWh）',
  'settings.systemConfig.field.fixedPrice':
    '固定单价（元/kWh）',
  'settings.systemConfig.field.pricingMode':
    '电价计费模式',
  'settings.systemConfig.field.regionLabel':
    '地区名称（展示用）',
  'settings.systemConfig.field.rebuildChunkSize':
    '重建分块大小',
  'settings.systemConfig.field.rebuildDebounceMs':
    '实体索引重建防抖（毫秒）',
  'settings.systemConfig.field.reconnectBaseMs':
    'Home Assistant 重连基础延迟（毫秒）',
  'settings.systemConfig.field.redisIncrementalFlushMs':
    'Redis 增量写入防抖（毫秒）',
  'settings.systemConfig.field.redisWriteBatch':
    '缓存批量写入大小',
  'settings.systemConfig.field.replayChunkSize':
    '断线状态回放分块大小',
  'settings.systemConfig.field.restCacheTtlMs':
    '实体接口缓存有效时间（毫秒）',
  'settings.systemConfig.field.retentionCleanupIntervalHours':
    '数据库清理间隔（小时）',
  'settings.systemConfig.field.retentionDeleteBatchSize':
    '数据库清理单批删除条数',
  'settings.systemConfig.field.retentionFirstDelaySec':
    '首次数据库清理延迟（秒）',
  'settings.systemConfig.field.scale':
    '全局缩放倍率',
  'settings.systemConfig.field.scaleBaseHeight':
    '缩放基准高度',
  'settings.systemConfig.field.scaleBaseWidth':
    '缩放基准宽度',
  'settings.systemConfig.field.sceneExecHistoryMax':
    '场景执行历史上限',
  'settings.systemConfig.field.screensaverEnabled':
    '启用屏保',
  'settings.systemConfig.field.screensaverIdleMs':
    '屏保空闲时间（毫秒）',
  'settings.systemConfig.field.scriptExecHistoryMax':
    '脚本执行历史上限',
  'settings.systemConfig.field.secSizeVw':
    '秒数字号（vw）',
  'settings.systemConfig.field.sensorAlertCooldownSec':
    '传感器告警冷却（秒）',
  'settings.systemConfig.field.sensorFlushIntervalMs':
    '非关键域批推间隔（毫秒）',
  'settings.systemConfig.field.sepSizeVw':
    '冒号字号（vw）',
  'settings.systemConfig.field.showBrand':
    '显示站点标题',
  'settings.systemConfig.field.showGregorianDate':
    '显示公历日期',
  'settings.systemConfig.field.showLunar':
    '显示农历',
  'settings.systemConfig.field.showSeconds':
    '显示秒数',
  'settings.systemConfig.field.showWeatherDesc':
    '显示天气描述',
  'settings.systemConfig.field.showWeatherIcon':
    '显示天气图标',
  'settings.systemConfig.field.showWeatherMeta':
    '显示天气页日期时间',
  'settings.systemConfig.field.showWeatherStats':
    '显示湿度/风速等',
  'settings.systemConfig.field.staleThresholdMs':
    '实体影子数据陈旧阈值（毫秒）',
  'settings.systemConfig.field.stateBatchMax':
    '实时推送状态批量上限',
  'settings.systemConfig.field.stateFlushIntervalMs':
    '实时推送状态合并间隔（毫秒）',
  'settings.systemConfig.field.subMetaSizeVw':
    '副信息字号（vw）',
  'settings.systemConfig.field.tier1Kwh':
    '第一阶梯电量（kWh）',
  'settings.systemConfig.field.tier1Price':
    '第一阶梯电价',
  'settings.systemConfig.field.tier2Price':
    '第二阶梯电价',
  'settings.systemConfig.field.tier3Price':
    '第三阶梯电价',
  'settings.systemConfig.field.timeSizeVw':
    '时钟字号（vw）',
  'settings.systemConfig.field.timeWindows':
    '儿童模式允许使用时段',
  'settings.systemConfig.field.triggerCooldownMs':
    '触发冷却（毫秒）',
  'settings.systemConfig.field.weatherAlertCooldownMin':
    '极端天气联动冷却（分钟）',
  'settings.systemConfig.field.weatherAlertEnabled':
    '启用天气预警联动',
  'settings.systemConfig.field.weatherAlertModeId':
    '极端天气联动家庭模式 ID',
  'settings.systemConfig.field.weatherAlertNotifyLevel':
    '预警推送最低等级',
  'settings.systemConfig.field.weatherAlertRefreshMs':
    '天气预警刷新间隔（毫秒）',
  'settings.systemConfig.field.weatherAlertSceneId':
    '红色预警联动场景 ID',
  'settings.systemConfig.field.weatherAlertsTtlMin':
    '天气预警缓存（分钟）',
  'settings.systemConfig.field.weatherIconSizeVw':
    '天气图标（vw）',
  'settings.systemConfig.field.weatherLat':
    '天气纬度',
  'settings.systemConfig.field.weatherLon':
    '天气经度',
  'settings.systemConfig.field.weatherStatsSizePx':
    '气象数据字号（px）',
  'settings.systemConfig.field.weatherTempSizeVw':
    '气温字号（vw）',
  'settings.systemConfig.field.widgetPollIntervals':
    '各微件独立轮询（结构化配置）',
  'settings.systemConfig.field.showAwayButton':
    '显示无人在家徽章',
  'settings.systemConfig.field.showHomeMode':
    '显示家庭模式切换器',
}

/** 按文案 key 查询标签文本；未命中返回空串 */
function configLabelText(key: string) {
  return LABEL_TEXT[key] ?? ''
}

/**
 * 解析字段中文标签：优先分区专属标签，回退通用标签，再回退原始字段 key
 *
 * @param fieldKey - 字段 key（如 `accentColor`）。
 * @param sectionKey - 分区 key；提供时优先查分区专属标签。
 * @returns 面向用户的中文标签。
 */
export function resolveSystemConfigFieldLabel(fieldKey: string, sectionKey?: string) {
  if (sectionKey) {
    const sectionLabel = configLabelText(
      `settings.systemConfig.sectionField.${sectionKey}.${fieldKey}`,
    )
    if (sectionLabel) return sectionLabel
  }
  return configLabelText(`settings.systemConfig.field.${fieldKey}`) || fieldKey
}
