import type { EditableConfigSection, EditableConfigField } from '@/kernel/system-config'

/** 系统配置专家模式工具 */

/** 专家模式关闭时隐藏的分区（连接层 + 运维采样） */
const EXPERT_ONLY_SECTIONS = new Set(['haConnector', 'stateStore', 'wsPush', 'commandProxy', 'webrtc', 'ops'])

/** 专家模式关闭时隐藏的单字段（屏保像素级 / 前端性能细调 / 内部缓存与 TTL） */
const EXPERT_ONLY_FIELD_KEYS = new Set([
  'brandSizePx',
  'brandTopVh',
  'contentShiftVh',
  'metaSizeVw',
  'secSizeVw',
  'sepSizeVw',
  'subMetaSizeVw',
  'timeSizeVw',
  'weatherIconSizeVw',
  'weatherStatsSizePx',
  'weatherTempSizeVw',
  'rebuildChunkSize',
  'rebuildDebounceMs',
  'entityCacheMaxAgeMs',
  'entityCacheSaveDebounceMs',
  'entityCacheEnabled',
  'initStatesBatchSize',
  'largeEntityThreshold',
  'workerDerivedThreshold',
  'callDedupWindowMs',
  'maxListeners',
  'optimisticTtlMs',
  'widgetPollIntervals',
  'apiRetryDelayMs',
  // 内部缓存 / 轮询节奏 / 引擎 TTL：没有可感知的用户收益，只在排障时调
  'configCacheTtlMs',
  'haHistoryCacheMin',
  'calendarSyncShortMin',
  'calendarIncrementalEnabled',
  'weatherAlertRefreshMs',
  'manualLockTtlMin',
  'linkageClaimTtlMin',
  'maxTriggerLogs',
  'maxExecHistory',
])

/**
 * 按专家模式过滤可编辑分节视图
 *
 * 专家模式开启时原样返回；关闭时剔除专家专属分区与字段，并丢弃变空的分节。
 *
 * @param sectionList - 编辑器分节视图。
 * @param expertMode - 是否启用专家模式。
 * @returns 过滤后的分节数组。
 */
export function filterSectionsForExpert(sectionList: EditableConfigSection[], expertMode: boolean) {
  if (expertMode) return sectionList
  return sectionList
    .filter((s) => !EXPERT_ONLY_SECTIONS.has(s.key))
    .map((s) => ({
      ...s,
      fields: s.fields.filter((f) => !EXPERT_ONLY_FIELD_KEYS.has(f.key)),
    }))
    .filter((s) => s.fields.length > 0)
}

/** 系统配置字段生效范围映射表 */
/** 字段生效范围：用于高级参数面板补充说明 */
export const FIELD_APPLY_SCOPE = {
  // 前端热更新（save 后 reloadFrontendConfig）
  apiTimeoutMs: 'frontendHot',
  apiRetryMax: 'frontendHot',
  apiRetryDelayMs: 'frontendHot',
  haDisconnectDebounceMs: 'frontendHot',
  initialStatesWaitMs: 'frontendHot',
  entityCacheEnabled: 'frontendHot',
  entityCacheMaxAgeMs: 'frontendHot',
  entityCacheSaveDebounceMs: 'frontendHot',
  rebuildChunkSize: 'frontendHot',
  rebuildDebounceMs: 'frontendHot',
  maxListeners: 'frontendHot',
  callDedupWindowMs: 'frontendHot',
  maxRemoteNotifications: 'frontendHot',
  widgetPollIntervals: 'frontendHot',
  optimisticTtlMs: 'frontendHot',
  largeEntityThreshold: 'frontendHot',
  workerDerivedThreshold: 'frontendHot',
  initStatesBatchSize: 'frontendHot',
  sessionRefreshHours: 'frontendHot',
  coldEntityOnDemand: 'backendOnly',
  latencyProfile: 'backendOnly',
  wsPingIntervalMs: 'backendNext',
  wsPongTimeoutMs: 'backendNext',
  wsHeartbeatMaxMisses: 'backendNext',
  accentColor: 'frontendHot',
  screensaverEnabled: 'frontendHot',
  screensaverIdleMs: 'frontendHot',
  scale: 'frontendHot',
  scaleBaseHeight: 'frontendHot',
  defaultMode: 'frontendHot',
  enableWeatherMode: 'frontendHot',
  instantEnter: 'frontendHot',
  instantLeave: 'frontendHot',
  brightness: 'frontendHot',
  showBrand: 'frontendHot',
  showSeconds: 'frontendHot',
  showGregorianDate: 'frontendHot',
  showLunar: 'frontendHot',
  showWeatherIcon: 'frontendHot',
  showWeatherDesc: 'frontendHot',
  showWeatherStats: 'frontendHot',
  showWeatherMeta: 'frontendHot',
  timeSizeVw: 'frontendHot',
  sepSizeVw: 'frontendHot',
  secSizeVw: 'frontendHot',
  metaSizeVw: 'frontendHot',
  subMetaSizeVw: 'frontendHot',
  brandSizePx: 'frontendHot',
  weatherTempSizeVw: 'frontendHot',
  weatherIconSizeVw: 'frontendHot',
  weatherStatsSizePx: 'frontendHot',
  brandTopVh: 'frontendHot',
  contentShiftVh: 'frontendHot',

  // 仅后端、UI 无直接反馈
  sensorFlushIntervalMs: 'backendOnly',
  criticalDomains: 'backendOnly',
  stateBatchMax: 'backendOnly',
  replayChunkSize: 'backendOnly',
  haSyncWaitMs: 'backendOnly',
  maxRecentChanges: 'backendOnly',
  staleThresholdMs: 'backendOnly',
  initialStatesPriorityEnabled: 'backendOnly',
  ingressCoalesceEnabled: 'backendOnly',
  ingressCoalesceWindowMs: 'backendOnly',
  ingressCoalesceDomains: 'backendOnly',
  eventLogFlushIntervalMs: 'backendNext',
  eventLogMaxBuffer: 'backendOnly',
  eventLogTierEnabled: 'backendOnly',
  eventLogTierCSampleRate: 'backendOnly',
  eventLogSkipSensorTimeline: 'backendOnly',
  reconnectBaseMs: 'backendNext',
  maxReconnectDelayMs: 'backendNext',
  retentionCleanupIntervalHours: 'backendNext',
  idempotencyTtlMs: 'backendNext',

  // 需开关/实体/事件触发
}

/** 系统配置字段提示文案表（含生效范围后缀） */

/** 字段 key → 中文提示文案映射（i18n 风格 key，与设置页查表对齐） */
const HINT_TEXT: Record<string, string> = {
  'settings.systemConfig.fieldHint.eventLogTimelineHours': '系统时间线（事件日志）默认回溯的小时数。推荐 12',
  'settings.systemConfig.fieldHint.anomalyRatio':
    '今日累计用电超过「学习期日均 × 该倍数」时推送能耗异常；学习期数据不足时不会误报。推荐 2',
  'settings.systemConfig.fieldHint.entryDelaySeconds':
    '布防后开门进屋先给这么多秒撤防窗口，到点仍未撤防才真正告警；0 表示关闭进入延时',
  'settings.systemConfig.fieldHint.budgetWarnRatio': '本月用电达到「月度预算 × 该比例」即告警（1.0 = 用满预算时告警）',
  'settings.systemConfig.fieldHint.balanceEntityId': '预付费电表的余额实体；跌破阈值时推送一次提醒，欠费会直接断电',
  'settings.systemConfig.fieldHint.balanceLowThreshold': '余额低于此值时提醒充值；回升后再次跌破会重新提醒',
  'settings.systemConfig.fieldHint.monthlyBudgetKwh':
    '本月用电预算（kWh）。留 0 表示不做预算告警；按当前速率外推月末超支也会提前提醒',
  'settings.systemConfig.fieldHint.moldHumidityThreshold':
    '同房间湿度持续高于该值时判定霉变风险（取房间内最低湿度，避免被平均值稀释）',
  'settings.systemConfig.fieldHint.moldHoldMinutes':
    '湿度需要持续超过阈值这么久才告警，避免洗澡/拖地造成的短暂高湿误报',
  'settings.systemConfig.fieldHint.co2Threshold': 'CO₂ 达到该值时提醒通风；1200 ppm 以上通常已影响注意力',
  'settings.systemConfig.fieldHint.pm25Threshold': 'PM2.5 达到该值时提醒通风或开启净化',
  'settings.systemConfig.fieldHint.meterEntityId': '水表实体（可选）。留空时自动识别带累计读数的水表，仅用于展示用量',
  'settings.systemConfig.fieldHint.flowEntityId':
    '流量传感器（可选）。留空时自动识别 device_class 为 volume_flow_rate 的传感器',
  'settings.systemConfig.fieldHint.longFlowMinutes': '流量持续高于阈值超过该时长即告警；离家期间有流量会立即告警',
  'settings.systemConfig.fieldHint.longFlowRateLpm':
    '长流水判定的流量下限（升/分钟）；低于此值的持续水流（滴漏）不计入',
  'settings.systemConfig.fieldHint.dayKelvin': '白天（太阳高度 ≥ 30°）的目标色温；5000K 接近自然白光',
  'settings.systemConfig.fieldHint.nightKelvin': '夜间（太阳高度 ≤ -6°）的目标色温；2700K 接近暖黄光',
  'settings.systemConfig.fieldHint.nightBrightnessPct': '仅在开启「同时调节亮度」时生效：夜间目标亮度百分比',
  'settings.systemConfig.fieldHint.applyBrightness': '开启后连亮度一起调整；关闭时只调色温，不改动你设定的亮度',
  'settings.systemConfig.fieldHint.lightEntityIds': '只调整这里点名的灯，且只处理已经开着的灯（不会替你开灯）',
  'settings.systemConfig.fieldHint.mutedSources':
    '这些来源的通知不再投递（如 home-mode / energy）；danger 级与生命安全通知不受影响',
  'settings.systemConfig.fieldHint.dndWeekdays': '免打扰只在选中的星期生效；留空表示每天生效（0=周日 … 6=周六）',
  'settings.systemConfig.fieldHint.dailyAnomalyRatio':
    '今日累计用水达到「前 N 天日均 × 该倍数」时告警；基线天数不足时不会误报。推荐 2',
  'settings.systemConfig.fieldHint.usageLearningDays': '参与日均计算的最近有数据天数；新装水表头几天不告警。推荐 7',
  'settings.systemConfig.fieldHint.hazardAutoActions':
    '关闭后烟雾/燃气/漏水只告警，不执行 3D 布局里绑定的关阀与排风；绑定保留，重新开启即恢复',
  'settings.systemConfig.fieldHint.accentColor': '界面强调色，用于按钮、链接、选中态等关键交互元素。推荐系统蓝 #3b82f6',
  'settings.systemConfig.fieldHint.alertBypassDnd':
    '开启后安防告警投递不受免打扰时段限制，紧急事件天然绕过 DND。推荐开启',
  'settings.systemConfig.fieldHint.alertChannels':
    '逗号分隔告警渠道，可选 in_app / email / webpush / wecom（企业微信）；紧急/布防触发/紧急求助类事件按此渠道投递',
  'settings.systemConfig.fieldHint.anomalyCooldownMin':
    '同一类型异常在此冷却时间内不会重复推送告警（能源/用水等分区各自独立）。推荐 30（15–60）',
  'settings.systemConfig.fieldHint.apiRetryDelayMs': '接口请求失败后的重试等待延迟（毫秒）。推荐 1000',
  'settings.systemConfig.fieldHint.apiRetryMax': '前端 HTTP 请求失败后的最大重试次数。推荐 2',
  'settings.systemConfig.fieldHint.apiTimeoutMs':
    '前端 HTTP 请求的超时时间（毫秒），超时后进入重试或报错。推荐 15000（15秒）',
  'settings.systemConfig.fieldHint.applyMaxRetries': '家庭模式切换失败后的最大重试次数。推荐 2',
  'settings.systemConfig.fieldHint.armExitGraceSeconds': '布防后门锁解锁在该秒数内不视为入侵（0=关闭）。推荐 30',
  'settings.systemConfig.fieldHint.autoBackupEnabled': '每天 02:30（北京时间）自动生成全量备份包（含数据库）。推荐开启',
  'settings.systemConfig.fieldHint.autoBackupRetainDays': '自动备份产物的保留天数，超出后自动清理。推荐 7',
  'settings.systemConfig.fieldHint.awayConfirmMin': '检测到全员离家后等待此时长再做布防，避免短暂出门误触发。推荐 5',
  'settings.systemConfig.fieldHint.homeConfirmMin':
    '有人被判定回家后需持续在此时长才降级为居家布防，避免定位漂移误撤销外出布防。推荐 2',
  'settings.systemConfig.fieldHint.awaySimBrightnessMin':
    '离家模拟灯光的最低亮度百分比，避免夜间全亮暴露无人状态。推荐 40',
  'settings.systemConfig.fieldHint.awaySimBrightnessRange': '离家模拟时灯光亮度随机浮动范围，使模拟更自然。推荐 50',
  'settings.systemConfig.fieldHint.awaySimIntervalMinMax':
    '离家模拟两次灯光动作之间的随机等待区间（分钟）；可用表格编辑最小/最大间隔',
  'settings.systemConfig.fieldHint.brandSizePx': '站点标题文字大小（像素）。推荐 22',
  'settings.systemConfig.fieldHint.brandTopVh': '站点标题距屏幕顶部距离（视口高度百分比）。推荐 5',
  'settings.systemConfig.fieldHint.calendarSyncMin': '日历订阅的数据同步间隔（分钟）。推荐 60',
  'settings.systemConfig.fieldHint.calendarUrl': '日历订阅地址（iCal 格式），用于日程提醒与家庭模式联动',
  'settings.systemConfig.fieldHint.callDedupWindowMs': '在此时间窗口内对同一接口的重复调用将合并为一次。推荐 500',
  'settings.systemConfig.fieldHint.configAuditMaxEntries': '配置变更审计记录的最大保留条数。推荐 100',
  'settings.systemConfig.fieldHint.configAuditPersistEnabled':
    '开启后将配置变更审计记录持久化到数据库；默认关闭时仅内存保留，重启后丢失',
  'settings.systemConfig.fieldHint.configCacheTtlMs':
    '安防配置缓存的有效时间，过期后从数据库重新加载。推荐 60000（60秒）',
  'settings.systemConfig.fieldHint.contentShiftVh':
    '主内容区域垂直偏移量，正数下移、负数上移（视口高度百分比）。推荐 0',
  'settings.systemConfig.fieldHint.criticalDomains':
    '逗号分隔 domain，如 light,switch；这些域的状态变更即时推送，不进入批处理',
  'settings.systemConfig.fieldHint.defaultMode': '屏保唤醒后默认展示的模式。推荐「随机切换」',
  'settings.systemConfig.fieldHint.emergencyCooldownSec': '紧急求助按钮触发后在此时间内重复点击不再重复发送。推荐 60',
  'settings.systemConfig.fieldHint.enableWeatherMode': '开启后屏保可在时钟和天气锁屏之间切换展示。默认关闭',
  'settings.systemConfig.fieldHint.instantEnter': '开启后进入锁屏跳过 1 秒渐显动画，墙屏推荐开启。默认开启',
  'settings.systemConfig.fieldHint.instantLeave': '开启后触屏唤醒快速离开锁屏（约 120ms）。默认开启',
  'settings.systemConfig.fieldHint.brightness': '锁屏态视觉亮度（0.3~1，1 为不降）。首帧绘完后生效。默认 1',
  'settings.systemConfig.fieldHint.entityCacheEnabled': '开启后在浏览器本地缓存实体数据，减少重复请求。推荐开启',
  'settings.systemConfig.fieldHint.entityCacheMaxAgeMs':
    '浏览器本地实体缓存的有效时长，过期后自动刷新。推荐 86400000（24小时）',
  'settings.systemConfig.fieldHint.entityCacheSaveDebounceMs':
    '实体缓存写入浏览器的防抖间隔，避免频繁写入影响性能。推荐 10000（10秒）',
  'settings.systemConfig.fieldHint.eventLogFlushIntervalMs':
    '事件日志缓冲区刷写到数据库的间隔（毫秒）。修改后对下一次刷写调度生效。推荐 5000（5秒）',
  'settings.systemConfig.fieldHint.eventLogMaxBuffer': '事件日志内存缓冲区的最大容量，超过后强制刷写。推荐 200',
  'settings.systemConfig.fieldHint.eventLogMaxRequeueBuffer': '事件日志写入失败后回灌队列的最大容量。推荐 500',
  'settings.systemConfig.fieldHint.eventLogSkipSensorTimeline':
    '开启后 sensor 变更不写事件时间线（默认开启；能耗趋势可回退 HA History）',
  'settings.systemConfig.fieldHint.eventLogTierCSampleRate':
    'C 级域（如 camera）采样率 0–1；默认 0 表示全部跳过，调高后才有实际效果',
  'settings.systemConfig.fieldHint.eventLogTierEnabled':
    '智能家居写入策略：控制/安防/场景必写；门窗烟感水浸运动与电表选写；温湿度电量/摄像头/定位等跳过（走 HA History / 环境快照）。关闭后恢复「尽量全写」。',
  'settings.systemConfig.fieldHint.budgetAlertCooldownMin':
    '能源预算超支站内通知与自动联动的重复触发冷却（分钟）。推荐 720（12 小时）',
  'settings.systemConfig.fieldHint.eventLogOverlayHours': '户型图事件浮层从 EventLog 预加载的默认回溯小时数。推荐 2',
  'settings.systemConfig.fieldHint.eventLogTimelineMax':
    '按实体/全局 timeline 缓存保留的最大条数；系统时间线部件单次查询条数上限。推荐 500',
  'settings.systemConfig.fieldHint.frigateDedupMs':
    '同一摄像头在此时间窗口内的重复告警将被合并去重。推荐 30000（30秒）',
  'settings.systemConfig.fieldHint.frigateMaxEvents':
    'Frigate 最近检测事件 API 每次返回的条数上限（后端截断，推荐 50）；不决定历史保留天数',
  'settings.systemConfig.fieldHint.frigatePersonAlarmModes':
    '指定哪些布防模式下触发 Frigate 摄像头人物告警。推荐 armed_away,armed_night（none=关闭）',
  'settings.systemConfig.fieldHint.haDisconnectDebounceMs':
    'HA WebSocket 断连后的防抖等待时间，避免短暂闪断频繁提示。推荐 5000（5秒）',
  'settings.systemConfig.fieldHint.haHistoryCacheMin':
    'Home Assistant 历史查询的内存缓存时长（分钟），与数据库物理保留无关。推荐 5',
  'settings.systemConfig.fieldHint.haSyncWaitMs':
    '推送状态变更后等待 HA 确认同步的超时时间（毫秒）。推荐 90000（90秒）',
  'settings.systemConfig.fieldHint.historyCacheMaxSize': 'HA 历史查询内存缓存的最大条目数。推荐 300',
  'settings.systemConfig.fieldHint.idempotencyCleanupIntervalMs':
    '命令幂等缓存清理的间隔时间（毫秒）。推荐 60000（60秒）',
  'settings.systemConfig.fieldHint.idempotencyTtlMs':
    '命令幂等性的有效时间（毫秒），相同命令在此时长内不重复执行。推荐 3000（3秒）',
  'settings.systemConfig.fieldHint.iceUrls':
    '逗号分隔，如 turn:192.168.1.10:3478?transport=udp,turn:192.168.1.10:3478?transport=tcp。与 HA get_client_config 合并，用于跨网 WebRTC',
  'settings.systemConfig.fieldHint.iceUsername': 'coturn 等 TURN 服务的长期用户名（可选）',
  'settings.systemConfig.fieldHint.iceCredential': 'TURN 密码或临时凭据（可选）',
  'settings.systemConfig.fieldHint.ingressCoalesceDomains':
    '参与微窗口合并的 domain 列表。推荐 sensor,binary_sensor,device_tracker,update',
  'settings.systemConfig.fieldHint.ingressCoalesceEnabled':
    '对高频 sensor 变更在入口做毫秒级合并，降低 CPU/WS 压力（默认开启）',
  'settings.systemConfig.fieldHint.ingressCoalesceWindowMs':
    '合并窗口（毫秒）。默认 4 只吸收同帧突发；大户型可调到 8–16',
  'settings.systemConfig.fieldHint.initStatesBatchSize':
    '全量加载实体状态时每批次的实体数，值越小加载越平滑但越慢。推荐 400',
  'settings.systemConfig.fieldHint.initialStatesPriorityEnabled':
    '全量 initial_states 推送时 light/switch 等关键域排在前面',
  'settings.systemConfig.fieldHint.initialStatesWaitMs': '首次连接后等待全量实体状态同步的超时时间。推荐 8000（8秒）',
  'settings.systemConfig.fieldHint.linkageClaimTtlMin': '家庭模式联动占用声明的有效期（分钟）。推荐 15',
  'settings.systemConfig.fieldHint.largeEntityThreshold': '实体数量超过此阈值时启用分批加载等优化策略。推荐 2000',
  'settings.systemConfig.fieldHint.workerDerivedThreshold':
    '实体数超过此阈值时派生索引改用 Web Worker 重建；默认 2000，大户型可下调到 1500 更早卸载主线程。推荐 2000',
  'settings.systemConfig.fieldHint.coldEntityOnDemand':
    '默认开启：WS 仅推送关键域、当前订阅域与钉选/热点实体，非可见实体不推、列表页 REST 按需补全',
  'settings.systemConfig.fieldHint.latencyProfile':
    'realtime=默认，禁止大实体自适应抬高 flush；balanced=均衡；bulk=偏吞吐放大窗口',
  'settings.systemConfig.fieldHint.wsPingIntervalMs': 'HA WebSocket 应用层 ping 间隔；越小越早发现断线，推荐 15000',
  'settings.systemConfig.fieldHint.wsPongTimeoutMs': '单次等待 pong 的超时；过短易在事件洪峰下误杀连接，推荐 10000',
  'settings.systemConfig.fieldHint.wsHeartbeatMaxMisses':
    '连续未响应达到该次数才主动断开重连；判死窗口 ≈ ping 间隔 + 超时 × 次数，推荐 2',
  'settings.systemConfig.fieldHint.learningPeriodDays': '能源异常学习期天数，期间跳过功率突增告警以建立基线。推荐 7',
  'settings.systemConfig.fieldHint.lowBatteryCooldownMin': '设备低电量后在此冷却时间内不会重复发送低电量告警。推荐 120',
  'settings.systemConfig.fieldHint.mainValveEntityId':
    '用水安全卡片与漏水通知里的「一键关阀」目标（valve.* 或 switch.*）；不会自动关阀，需要你确认',
  'settings.systemConfig.fieldHint.manualLockTtlMin':
    '手动激活的家庭模式锁定时长（分钟），锁定期间不被自动联动切换。推荐 30',
  'settings.systemConfig.fieldHint.maxExecHistory': '家庭模式执行历史记录的最大保留条数。推荐 100',
  'settings.systemConfig.fieldHint.maxListeners': '事件监听器的最大数量上限，防止内存泄漏。推荐 200',
  'settings.systemConfig.fieldHint.maxNotifications':
    '应用内通知库条数软上限：超出后优先删除已读最旧记录（未读尽量保留）。按天硬删请用「数据保留 → 通知记录」。推荐 500',
  'settings.systemConfig.fieldHint.maxRecentChanges': '内存中保留的近期实体状态变更缓存上限。推荐 3000',
  'settings.systemConfig.fieldHint.maxReconnectDelayMs':
    'WebSocket 重连最大延迟上限（毫秒），采用指数退避策略。推荐 10000（10秒）',
  'settings.systemConfig.fieldHint.maxRemoteNotifications': '从后端拉取远程通知的最大条数。推荐 100',
  'settings.systemConfig.fieldHint.maxTriggerLogs': '家庭模式触发日志的最大保留条数。推荐 50',
  'settings.systemConfig.fieldHint.metaSizeVw': '锁屏主信息文字大小（日期、农历等），相对设计稿宽度百分比。推荐 3',
  'settings.systemConfig.fieldHint.moldAlertCooldownMin': '霉变风险预警在此冷却时间内不会重复推送。推荐 10',
  'settings.systemConfig.fieldHint.offlineCooldownMin': '设备离线后在此冷却时间内不会重复发送离线告警。推荐 30',
  'settings.systemConfig.fieldHint.openWeatherApiKey': 'OpenWeatherMap API 密钥，用于获取天气数据（免费注册获取）',
  'settings.systemConfig.fieldHint.optimisticTtlMs':
    '乐观更新在此时间内前端使用本地数据，超时后等待服务端确认。推荐 6000（6秒）',
  'settings.systemConfig.fieldHint.peakEnd1': '第一峰电时段结束（HH:mm）；仅在启用峰谷平分时时生效',
  'settings.systemConfig.fieldHint.peakEnd2': '第二峰电时段结束（HH:mm）；仅在启用峰谷平分时时生效',
  'settings.systemConfig.fieldHint.peakStart1': '第一峰电时段起始（HH:mm）；仅在启用峰谷平分时时生效，同时用于温控错峰',
  'settings.systemConfig.fieldHint.peakStart2': '第二峰电时段起始（HH:mm）；仅在启用峰谷平分时时生效，同时用于温控错峰',
  'settings.systemConfig.fieldHint.timeOfUseEnabled':
    '开启后按峰/谷/平段计费并启用温控错峰；关闭后统一使用阶梯档或固定单价。固定单价地区通常保持关闭',
  'settings.systemConfig.fieldHint.valleyStart': '谷段起始时间（HH:mm），默认 23:00，可跨日',
  'settings.systemConfig.fieldHint.valleyEnd': '谷段结束时间（HH:mm），默认 07:00',
  'settings.systemConfig.fieldHint.peakPrice': '峰段单价；填 0 时自动推导（阶梯取二档价，固定取固定单价）',
  'settings.systemConfig.fieldHint.valleyPrice': '谷段单价；填 0 时自动推导（约为平段×0.63）',
  'settings.systemConfig.fieldHint.flatPrice': '平段单价；填 0 时自动推导（阶梯取一档价，固定取固定单价）',
  'settings.systemConfig.fieldHint.pricingMode':
    'tiered=年累计三档阶梯（默认）；fixed=固定单价（如新疆），切换为 fixed 时建议关闭峰谷平',
  'settings.systemConfig.fieldHint.fixedPrice': '固定单价模式下的电价（元/kWh）',
  'settings.systemConfig.fieldHint.regionLabel': '可选，如「新疆」「北京」，在电价 Widget 中展示',
  'settings.systemConfig.fieldHint.rebuildChunkSize': '界面重建时每批处理的实体数量，影响切换流畅度。推荐 500',
  'settings.systemConfig.fieldHint.rebuildDebounceMs': '实体派生索引重建防抖间隔（毫秒），大户型可适当调高。推荐 50',
  'settings.systemConfig.fieldHint.reconnectBaseMs': 'HA WebSocket 断连后的基础重连延迟（毫秒）。推荐 1000（1秒）',
  'settings.systemConfig.fieldHint.replayChunkSize': '客户端断线重连后状态回放的分块大小，分批恢复避免阻塞。推荐 400',
  'settings.systemConfig.fieldHint.retentionCleanupIntervalHours': '数据库历史数据清理任务的执行间隔（小时）。推荐 1',
  'settings.systemConfig.fieldHint.retentionDeleteBatchSize':
    '单次 DELETE 批次大小，影响清理任务对数据库的压力。推荐 800',
  'settings.systemConfig.fieldHint.retentionFirstDelaySec': '应用启动后首次执行数据库清理的延迟时间（秒）。推荐 15',
  'settings.systemConfig.fieldHint.scale': '屏保全局缩放倍率，1 = 100%，与整页等比缩放叠加生效。推荐 1.35',
  'settings.systemConfig.fieldHint.scaleBaseHeight': '整页等比缩放的设计基准高度（像素）。推荐 1024',
  'settings.systemConfig.fieldHint.scaleBaseWidth':
    '整页等比缩放的设计基准宽度（像素），需与中控屏幕分辨率协调。推荐 1366',
  'settings.systemConfig.fieldHint.screensaverEnabled': '开启后空闲超时自动进入锁屏屏保。推荐开启',
  'settings.systemConfig.fieldHint.screensaverIdleMs':
    '用户无操作的空闲时间（毫秒），超过此时长触发屏保。推荐 120000（2分钟）',
  'settings.systemConfig.fieldHint.secSizeVw': '秒数显示大小，相对设计稿宽度百分比。推荐 7',
  'settings.systemConfig.fieldHint.sensorAlertCooldownSec': '同一传感器触发告警后，在此时间内不再重复告警。推荐 60',
  'settings.systemConfig.fieldHint.sensorFlushIntervalMs': '非关键域 state_changed_batch 合并间隔（毫秒）。推荐 120',
  'settings.systemConfig.fieldHint.sepSizeVw': '时钟冒号分隔符大小，相对设计稿宽度百分比。推荐 17',
  'settings.systemConfig.fieldHint.sessionRefreshHours':
    '前端会话心跳刷新间隔（小时）；修改后前端在下一次可见性刷新时生效。推荐 6',
  'settings.systemConfig.fieldHint.showBrand': '开启后在锁屏界面显示站点标题（品牌名）。推荐开启',
  'settings.systemConfig.fieldHint.showGregorianDate': '开启后在锁屏上显示公历日期。推荐开启',
  'settings.systemConfig.fieldHint.showLunar': '开启后在锁屏上显示农历日期信息。推荐开启',
  'settings.systemConfig.fieldHint.showSeconds': '开启后时钟锁屏显示秒数，关闭则仅显示时分。推荐开启',
  'settings.systemConfig.fieldHint.showWeatherDesc': '开启后天气锁屏显示天气文字描述（晴/多云/雨等）。推荐开启',
  'settings.systemConfig.fieldHint.showWeatherIcon': '开启后天气锁屏显示天气图标。推荐开启',
  'settings.systemConfig.fieldHint.showWeatherMeta': '开启后天气锁屏显示日期时间信息。推荐开启',
  'settings.systemConfig.fieldHint.showWeatherStats': '开启后天气锁屏显示湿度、风速等气象数据。推荐开启',
  'settings.systemConfig.fieldHint.staleThresholdMs':
    'HA 断连超过此毫秒数后实体影子数据视为陈旧。推荐 12000（12 秒；过久会导致 UI 假活）',
  'settings.systemConfig.fieldHint.stateBatchMax': '单次批量推送状态变更的最大条目数。推荐 300',
  'settings.systemConfig.fieldHint.subMetaSizeVw': '锁屏副信息文字大小，相对设计稿宽度百分比。推荐 2',
  'settings.systemConfig.fieldHint.tier1Kwh':
    '第一阶梯电量上限（kWh/年），超出后进入第二阶梯计价；与峰谷时段无关。推荐 2880（北京）',
  'settings.systemConfig.fieldHint.tier1Price': '第一阶梯电价（元/kWh）。推荐 0.4883（北京）',
  'settings.systemConfig.fieldHint.tier2Price': '第二阶梯电价（元/kWh），超出第一阶梯后按此计费。推荐 0.5383（北京）',
  'settings.systemConfig.fieldHint.tier3Price': '第三阶梯电价（元/kWh），超出第二阶梯后按此计费。推荐 0.7883（北京）',
  'settings.systemConfig.fieldHint.timeSizeVw': '时钟数字大小，相对设计稿宽度百分比（非视口 vw）。推荐 24',
  'settings.systemConfig.fieldHint.triggerCooldownMs': '触发后的冷却时间（毫秒），在此期间再次满足条件不会重复执行',
  'settings.systemConfig.fieldHint.weatherAlertCooldownMin':
    '红色预警触发场景/家庭模式后的冷却时间（分钟），避免反复联动。推荐 120',
  'settings.systemConfig.fieldHint.weatherAlertEnabled':
    '开启后监听 OpenWeather 预警并按等级推送；红色预警可联动场景或家庭模式',
  'settings.systemConfig.fieldHint.weatherAlertModeId': '红色预警时激活的家庭模式 ID；与联动场景二选一或同时配置',
  'settings.systemConfig.fieldHint.weatherAlertNotifyLevel':
    '仅推送不低于该等级的预警：red / orange / yellow。推荐 orange',
  'settings.systemConfig.fieldHint.weatherAlertRefreshMs': '天气预警信息的自动刷新间隔（毫秒）。推荐 1800000（30分钟）',
  'settings.systemConfig.fieldHint.weatherAlertSceneId':
    '红色预警时执行的场景 ID（如关窗/拉帘/布防）；与家庭模式二选一或同时配置',
  'settings.systemConfig.fieldHint.weatherFallbackEntityId':
    'OpenWeather 不可用时回退的 HA weather.* 实体；留空则自动识别',
  'settings.systemConfig.fieldHint.weatherIconSizeVw': '天气锁屏图标大小，相对设计稿宽度百分比。推荐 10',
  'settings.systemConfig.fieldHint.weatherLat': '获取天气数据的地理纬度坐标。推荐 39.9（北京）',
  'settings.systemConfig.fieldHint.weatherLon': '获取天气数据的地理经度坐标。推荐 116.4（北京）',
  'settings.systemConfig.fieldHint.weatherStatsSizePx': '天气锁屏气象数据文字大小（像素）。推荐 15',
  'settings.systemConfig.fieldHint.weatherTempSizeVw': '天气锁屏气温数字大小，相对设计稿宽度百分比。推荐 22',
  'settings.systemConfig.fieldHint.widgetPollIntervals': '各微件独立轮询间隔（ms）；表格中删除行并保存即可移除该微件',
  'settings.systemConfig.fieldHint.showAwayButton': '控制主页顶部是否显示「无人在家」状态徽章。推荐开启',
  'settings.systemConfig.fieldHint.showHomeMode': '控制主页顶部是否显示家庭模式切换器。推荐开启',
  'settings.systemConfig.fieldHint.singleActiveMode':
    '开启后家只有一个当前状态：切换到睡眠/离家会自动退出其它状态；用餐、影音等叠加活动不受影响。关掉才启用「不同互斥组同时生效」的进阶用法',
}

/** 按文案 key 查询提示文本；未命中返回空串 */
function configHintText(key: string) {
  return HINT_TEXT[key] ?? ''
}

/**
 * 解析字段提示文案：优先分区专属提示，回退通用提示，并追加应用范围说明
 *
 * @param fieldKey - 字段 key（如 `accentColor`）。
 * @param sectionKey - 分区 key；提供时优先查分区专属提示。
 * @returns 拼接后的提示文案；无任何命中时返回空串。
 */
export function systemConfigFieldHint(fieldKey: string, sectionKey?: string) {
  const parts = []
  if (sectionKey) {
    const sectionHint = configHintText(`settings.systemConfig.sectionFieldHint.${sectionKey}.${fieldKey}`)
    if (sectionHint) parts.push(sectionHint)
  }
  if (!parts.length) {
    const generic = configHintText(`settings.systemConfig.fieldHint.${fieldKey}`)
    if (generic) parts.push(generic)
  }
  const scope = (FIELD_APPLY_SCOPE as Record<string, string>)[fieldKey]
  if (scope) {
    const applyText = configHintText(`settings.systemConfig.fieldApply.${scope}`)
    if (applyText) parts.push(applyText)
  }
  return parts.join(' ')
}

/** 系统配置字段 key 白名单（编辑/应用时使用的规范集合） */
export const SYSTEM_CONFIG_FIELD_KEYS = new Set([
  'monthlyBudgetKwh',
  'dayKelvin',
  'nightKelvin',
  'applyBrightness',
  'nightBrightnessPct',
  'lightEntityIds',
  'mutedSources',
  'dndWeekdays',
  'accentColor',
  'alertBypassDnd',
  'alertChannels',
  'anomalyCooldownMin',
  'anomalyRatio',
  'apiRetryDelayMs',
  'apiRetryMax',
  'apiTimeoutMs',
  'applyMaxRetries',
  'armExitGraceSeconds',
  'entryDelaySeconds',
  'hazardAutoActions',
  'autoBackupEnabled',
  'autoBackupRetainDays',
  'awayConfirmMin',
  'awaySimBrightnessMin',
  'awaySimBrightnessRange',
  'awaySimIntervalMinMax',
  'budgetAlertCooldownMin',
  'budgetWarnRatio',
  'balanceEntityId',
  'balanceLowThreshold',
  'brandSizePx',
  'brandTopVh',
  'brightness',
  'calendarSyncMin',
  'calendarSyncShortMin',
  'calendarIncrementalEnabled',
  'calendarUrl',
  'weatherFallbackEntityId',
  'dynamicPricingEnabled',
  'dynamicPricingUrl',
  'dynamicPricingApiKey',
  'dynamicPricingRefreshHours',
  'callDedupWindowMs',
  'coldEntityOnDemand',
  'configAuditMaxEntries',
  'configAuditPersistEnabled',
  'configCacheTtlMs',
  'contentShiftVh',
  'cooldownMin',
  'criticalDomains',
  'defaultMode',
  'emergencyCooldownSec',
  'enableWeatherMode',
  'homeConfirmMin',
  'entityCacheEnabled',
  'entityCacheMaxAgeMs',
  'entityCacheSaveDebounceMs',
  'eventLogFlushIntervalMs',
  'eventLogMaxBuffer',
  'eventLogMaxRequeueBuffer',
  'eventLogSkipSensorTimeline',
  'eventLogTierCSampleRate',
  'eventLogTierEnabled',
  'eventLogTimelineMax',
  'eventLogOverlayHours',
  'eventLogTimelineHours',
  'frigateDedupMs',
  'frigateMaxEvents',
  'frigatePersonAlarmModes',
  'haDisconnectDebounceMs',
  'haHistoryCacheMin',
  'haSyncWaitMs',
  'historyCacheMaxSize',
  'ingressCoalesceDomains',
  'ingressCoalesceEnabled',
  'ingressCoalesceWindowMs',
  'initialStatesPriorityEnabled',
  'idempotencyCleanupIntervalMs',
  'idempotencyTtlMs',
  'iceUrls',
  'iceUsername',
  'iceCredential',
  'initStatesBatchSize',
  'initialStatesWaitMs',
  'instantEnter',
  'instantLeave',
  'largeEntityThreshold',
  'latencyProfile',
  'workerDerivedThreshold',
  'learningPeriodDays',
  'linkageClaimTtlMin',
  'lowBatteryCooldownMin',
  'mainValveEntityId',
  'meterEntityId',
  'flowEntityId',
  'longFlowMinutes',
  'dailyAnomalyRatio',
  'usageLearningDays',
  'longFlowRateLpm',
  'manualLockTtlMin',
  'maxExecHistory',
  'maxListeners',
  'maxNotifications',
  'maxRecentChanges',
  'maxReconnectDelayMs',
  'maxRemoteNotifications',
  'maxTriggerLogs',
  'metaSizeVw',
  'moldAlertCooldownMin',
  'moldHumidityThreshold',
  'moldHoldMinutes',
  'co2Threshold',
  'pm25Threshold',
  'offlineCooldownMin',
  'openWeatherApiKey',
  'optimisticTtlMs',
  'peakEnd1',
  'peakEnd2',
  'peakStart1',
  'peakStart2',
  'pricingMode',
  'timeOfUseEnabled',
  'valleyStart',
  'valleyEnd',
  'peakPrice',
  'valleyPrice',
  'flatPrice',
  'fixedPrice',
  'regionLabel',
  'rebuildChunkSize',
  'rebuildDebounceMs',
  'reconnectBaseMs',
  'replayChunkSize',
  'retentionCleanupIntervalHours',
  'retentionDeleteBatchSize',
  'retentionFirstDelaySec',
  'scale',
  'scaleBaseHeight',
  'scaleBaseWidth',
  'screensaverEnabled',
  'screensaverIdleMs',
  'secSizeVw',
  'sensorAlertCooldownSec',
  'sensorFlushIntervalMs',
  'sepSizeVw',
  'sessionRefreshHours',
  'showBrand',
  'showGregorianDate',
  'showLunar',
  'showSeconds',
  'showWeatherDesc',
  'showWeatherIcon',
  'showWeatherMeta',
  'showWeatherStats',
  'staleThresholdMs',
  'stateBatchMax',
  'subMetaSizeVw',
  'tier1Kwh',
  'tier1Price',
  'tier2Price',
  'tier3Price',
  'timeSizeVw',
  'triggerCooldownMs',
  'weatherAlertCooldownMin',
  'weatherAlertEnabled',
  'weatherAlertModeId',
  'weatherAlertNotifyLevel',
  'weatherAlertRefreshMs',
  'weatherAlertSceneId',
  'weatherIconSizeVw',
  'weatherLat',
  'weatherLon',
  'weatherStatsSizePx',
  'weatherTempSizeVw',
  'widgetPollIntervals',
  'wsHeartbeatMaxMisses',
  'wsPingIntervalMs',
  'wsPongTimeoutMs',
  'showAwayButton',
  'showHomeMode',
  'singleActiveMode',
])

/** 系统配置字段中文标签表 */
const LABEL_TEXT: Record<string, string> = {
  'settings.systemConfig.field.dailyAnomalyRatio': '日用水异常倍数（今日/日均）',
  'settings.systemConfig.field.usageLearningDays': '用水基线天数',
  'settings.systemConfig.field.hazardAutoActions': '危险告警自动处置（关阀 / 排风）',
  'settings.systemConfig.field.accentColor': '强调色',
  'settings.systemConfig.field.anomalyRatio': '日用量异常倍数（今日/基线）',
  'settings.systemConfig.field.entryDelaySeconds': '进入延时（秒，0=关闭）',
  'settings.systemConfig.field.budgetWarnRatio': '预算告警触发比例',
  'settings.systemConfig.field.balanceEntityId': '预付费余额实体',
  'settings.systemConfig.field.balanceLowThreshold': '余额不足阈值（元）',
  'settings.systemConfig.field.monthlyBudgetKwh': '月度用电预算（kWh，0=不启用）',
  'settings.systemConfig.field.moldHumidityThreshold': '霉菌风险湿度阈值（%）',
  'settings.systemConfig.field.moldHoldMinutes': '霉菌风险持续时长（分钟）',
  'settings.systemConfig.field.co2Threshold': 'CO₂ 告警阈值（ppm）',
  'settings.systemConfig.field.pm25Threshold': 'PM2.5 告警阈值（μg/m³）',
  'settings.systemConfig.field.meterEntityId': '水表实体（可选）',
  'settings.systemConfig.field.flowEntityId': '流量传感器（可选）',
  'settings.systemConfig.field.longFlowMinutes': '长流水判定时长（分钟）',
  'settings.systemConfig.field.longFlowRateLpm': '长流水流量阈值（L/min）',
  'settings.systemConfig.field.dayKelvin': '日间色温（K）',
  'settings.systemConfig.field.nightKelvin': '夜间色温（K）',
  'settings.systemConfig.field.nightBrightnessPct': '夜间亮度（%，需开启亮度调节）',
  'settings.systemConfig.field.applyBrightness': '同时调节亮度',
  'settings.systemConfig.field.lightEntityIds': '参与节律的灯',
  'settings.systemConfig.field.mutedSources': '静音的通知来源',
  'settings.systemConfig.field.dndWeekdays': '免打扰生效星期（0=周日）',
  'settings.systemConfig.field.alertBypassDnd': '告警绕过免打扰',
  'settings.systemConfig.field.alertChannels': '告警渠道（逗号分隔）',
  'settings.systemConfig.field.anomalyCooldownMin': '异常告警冷却（分钟）',
  'settings.systemConfig.field.apiRetryDelayMs': '接口重试延迟（毫秒）',
  'settings.systemConfig.field.apiRetryMax': '接口最大重试次数',
  'settings.systemConfig.field.apiTimeoutMs': '接口超时（毫秒）',
  'settings.systemConfig.field.applyMaxRetries': '家庭模式应用重试次数',
  'settings.systemConfig.field.armExitGraceSeconds': '布防宽限期（秒）',
  'settings.systemConfig.field.autoBackupEnabled': '定时自动备份',
  'settings.systemConfig.field.autoBackupRetainDays': '备份保留天数',
  'settings.systemConfig.field.awayConfirmMin': '离家确认等待（分钟）',
  'settings.systemConfig.field.homeConfirmMin': '回家驻留确认（分钟）',
  'settings.systemConfig.field.awaySimBrightnessMin': '离家模拟最低亮度（%）',
  'settings.systemConfig.field.awaySimBrightnessRange': '离家模拟亮度随机范围',
  'settings.systemConfig.field.awaySimIntervalMinMax': '离家模拟随机间隔（分钟）',
  'settings.systemConfig.field.brandSizePx': '标题字号（px）',
  'settings.systemConfig.field.brandTopVh': '标题距顶部（vh）',
  'settings.systemConfig.field.calendarSyncMin': '日历同步间隔（分钟）',
  'settings.systemConfig.field.calendarSyncShortMin': '临近外出时的日历短轮询间隔（分钟）',
  'settings.systemConfig.field.calendarIncrementalEnabled': '日历增量同步（ETag 条件请求）',
  'settings.systemConfig.field.weatherFallbackEntityId': '天气备用降级实体（HA weather 域）',
  'settings.systemConfig.field.dynamicPricingEnabled': '启用动态电价 API',
  'settings.systemConfig.field.dynamicPricingUrl': '动态电价 API 地址',
  'settings.systemConfig.field.dynamicPricingApiKey': '动态电价 API 鉴权 Key',
  'settings.systemConfig.field.dynamicPricingRefreshHours': '动态电价刷新间隔（小时）',
  'settings.systemConfig.field.calendarUrl': '日历订阅地址',
  'settings.systemConfig.field.callDedupWindowMs': '调用去重窗口（毫秒）',
  'settings.systemConfig.field.configAuditMaxEntries': '配置变更审计保留条数',
  'settings.systemConfig.field.configAuditPersistEnabled': '持久化配置变更审计',
  'settings.systemConfig.field.configCacheTtlMs': '安防配置缓存有效时间（毫秒）',
  'settings.systemConfig.field.contentShiftVh': '主内容垂直偏移（vh）',
  'settings.systemConfig.field.cooldownMin': '客户端电量联动冷却（分钟）',
  'settings.systemConfig.field.criticalDomains': '关键域即时推送列表',
  'settings.systemConfig.field.defaultMode': '默认展示模式',
  'settings.systemConfig.field.emergencyCooldownSec': '紧急求助重复触发冷却（秒）',
  'settings.systemConfig.field.enableWeatherMode': '启用天气锁屏',
  'settings.systemConfig.field.instantEnter': '锁屏即时进入',
  'settings.systemConfig.field.instantLeave': '锁屏即时唤醒',
  'settings.systemConfig.field.brightness': '锁屏亮度',
  'settings.systemConfig.field.entityCacheEnabled': '启用浏览器本地实体缓存',
  'settings.systemConfig.field.entityCacheMaxAgeMs': '实体缓存有效期（毫秒）',
  'settings.systemConfig.field.entityCacheSaveDebounceMs': '实体缓存写入防抖（毫秒）',
  'settings.systemConfig.field.eventLogFlushIntervalMs': '事件日志刷盘间隔（毫秒）',
  'settings.systemConfig.field.eventLogMaxBuffer': '事件日志缓冲上限',
  'settings.systemConfig.field.eventLogMaxRequeueBuffer': '事件日志失败回灌上限',
  'settings.systemConfig.field.eventLogSkipSensorTimeline': '跳过 sensor 时间线',
  'settings.systemConfig.field.eventLogTierCSampleRate': 'EventLog C 级采样率',
  'settings.systemConfig.field.eventLogTierEnabled': 'EventLog 分级持久化',
  'settings.systemConfig.field.budgetAlertCooldownMin': '能源预算告警冷却（分钟）',
  'settings.systemConfig.field.eventLogOverlayHours': '平面图事件浮层回溯（小时）',
  'settings.systemConfig.field.eventLogTimelineMax': '缓存时间线保留条数',
  'settings.systemConfig.field.eventLogTimelineHours': '系统时间线回溯（小时）',
  'settings.systemConfig.field.frigateDedupMs': '摄像头告警去重窗口（毫秒）',
  'settings.systemConfig.field.frigateMaxEvents': '摄像头事件接口返回上限（条）',
  'settings.systemConfig.field.frigatePersonAlarmModes': '摄像头人物告警生效模式（逗号分隔，none=关闭）',
  'settings.systemConfig.field.haDisconnectDebounceMs': 'Home Assistant 断连防抖（毫秒）',
  'settings.systemConfig.field.haHistoryCacheMin': 'Home Assistant 历史缓存（分钟）',
  'settings.systemConfig.field.haSyncWaitMs': '实时推送等待 Home Assistant 同步（毫秒）',
  'settings.systemConfig.field.historyCacheMaxSize': 'Home Assistant 历史缓存条数',
  'settings.systemConfig.field.idempotencyCleanupIntervalMs': '幂等缓存清理间隔（毫秒）',
  'settings.systemConfig.field.idempotencyTtlMs': '命令幂等有效时间（毫秒）',
  'settings.systemConfig.field.iceUrls': 'ICE/TURN 地址',
  'settings.systemConfig.field.iceUsername': 'TURN 用户名',
  'settings.systemConfig.field.iceCredential': 'TURN 密码',
  'settings.systemConfig.field.ingressCoalesceDomains': '入口合并域列表',
  'settings.systemConfig.field.ingressCoalesceEnabled': 'HA 入口状态合并',
  'settings.systemConfig.field.ingressCoalesceWindowMs': '入口合并窗口（毫秒）',
  'settings.systemConfig.field.initStatesBatchSize': '实体分批加载大小',
  'settings.systemConfig.field.initialStatesPriorityEnabled': '全量同步关键域优先',
  'settings.systemConfig.field.initialStatesWaitMs': '实时连接全量同步等待（毫秒）',
  'settings.systemConfig.field.linkageClaimTtlMin': '联动声明有效期（分钟）',
  'settings.systemConfig.field.largeEntityThreshold': '大户型实体数量阈值',
  'settings.systemConfig.field.workerDerivedThreshold': '派生索引 Worker 阈值',
  'settings.systemConfig.field.coldEntityOnDemand': '冷实体按需 WS（非可见不推）',
  'settings.systemConfig.field.latencyProfile': 'WS 延迟档位',
  'settings.systemConfig.field.wsPingIntervalMs': 'HA WS 心跳间隔（毫秒）',
  'settings.systemConfig.field.wsPongTimeoutMs': 'HA WS pong 超时（毫秒）',
  'settings.systemConfig.field.wsHeartbeatMaxMisses': 'HA WS 心跳最大连续未响应次数',
  'settings.systemConfig.field.learningPeriodDays': '能源异常学习期（天）',
  'settings.systemConfig.field.lowBatteryCooldownMin': '低电量告警冷却（分钟）',
  'settings.systemConfig.field.mainValveEntityId': '总水阀实体标识',
  'settings.systemConfig.field.manualLockTtlMin': '手动锁定有效期（分钟）',
  'settings.systemConfig.field.maxExecHistory': '家庭模式执行历史上限',
  'settings.systemConfig.field.maxListeners': '最大监听器数',
  'settings.systemConfig.field.maxNotifications': '通知条数软上限（优先清理已读）',
  'settings.systemConfig.field.maxRecentChanges': '近期状态变更缓冲上限',
  'settings.systemConfig.field.maxReconnectDelayMs': 'Home Assistant 重连最大延迟（毫秒）',
  'settings.systemConfig.field.maxRemoteNotifications': '远程通知上限',
  'settings.systemConfig.field.maxTriggerLogs': '家庭模式触发日志上限',
  'settings.systemConfig.field.metaSizeVw': '主信息字号（vw）',
  'settings.systemConfig.field.moldAlertCooldownMin': '霉变预警冷却（分钟）',
  'settings.systemConfig.field.offlineCooldownMin': '离线告警冷却（分钟）',
  'settings.systemConfig.field.openWeatherApiKey': '开放天气接口密钥',
  'settings.systemConfig.field.optimisticTtlMs': '乐观更新有效时间（毫秒）',
  'settings.systemConfig.field.peakEnd1': '峰段一结束',
  'settings.systemConfig.field.peakEnd2': '峰段二结束',
  'settings.systemConfig.field.peakStart1': '峰段一开始',
  'settings.systemConfig.field.peakStart2': '峰段二开始',
  'settings.systemConfig.field.timeOfUseEnabled': '启用峰谷平分时电价',
  'settings.systemConfig.field.valleyStart': '谷段开始',
  'settings.systemConfig.field.valleyEnd': '谷段结束',
  'settings.systemConfig.field.peakPrice': '峰段单价（元/kWh）',
  'settings.systemConfig.field.valleyPrice': '谷段单价（元/kWh）',
  'settings.systemConfig.field.flatPrice': '平段单价（元/kWh）',
  'settings.systemConfig.field.fixedPrice': '固定单价（元/kWh）',
  'settings.systemConfig.field.pricingMode': '电价计费模式',
  'settings.systemConfig.field.regionLabel': '地区名称（展示用）',
  'settings.systemConfig.field.rebuildChunkSize': '重建分块大小',
  'settings.systemConfig.field.rebuildDebounceMs': '实体索引重建防抖（毫秒）',
  'settings.systemConfig.field.reconnectBaseMs': 'Home Assistant 重连基础延迟（毫秒）',
  'settings.systemConfig.field.replayChunkSize': '断线状态回放分块大小',
  'settings.systemConfig.field.retentionCleanupIntervalHours': '数据库清理间隔（小时）',
  'settings.systemConfig.field.retentionDeleteBatchSize': '数据库清理单批删除条数',
  'settings.systemConfig.field.retentionFirstDelaySec': '首次数据库清理延迟（秒）',
  'settings.systemConfig.field.scale': '全局缩放倍率',
  'settings.systemConfig.field.scaleBaseHeight': '缩放基准高度',
  'settings.systemConfig.field.scaleBaseWidth': '缩放基准宽度',
  'settings.systemConfig.field.screensaverEnabled': '启用屏保',
  'settings.systemConfig.field.screensaverIdleMs': '屏保空闲时间（毫秒）',
  'settings.systemConfig.field.secSizeVw': '秒数字号（vw）',
  'settings.systemConfig.field.sensorAlertCooldownSec': '传感器告警冷却（秒）',
  'settings.systemConfig.field.sensorFlushIntervalMs': '非关键域批推间隔（毫秒）',
  'settings.systemConfig.field.sepSizeVw': '冒号字号（vw）',
  'settings.systemConfig.field.sessionRefreshHours': '会话刷新间隔（小时）',
  'settings.systemConfig.field.showBrand': '显示站点标题',
  'settings.systemConfig.field.showGregorianDate': '显示公历日期',
  'settings.systemConfig.field.showLunar': '显示农历',
  'settings.systemConfig.field.showSeconds': '显示秒数',
  'settings.systemConfig.field.showWeatherDesc': '显示天气描述',
  'settings.systemConfig.field.showWeatherIcon': '显示天气图标',
  'settings.systemConfig.field.showWeatherMeta': '显示天气页日期时间',
  'settings.systemConfig.field.showWeatherStats': '显示湿度/风速等',
  'settings.systemConfig.field.staleThresholdMs': '实体影子数据陈旧阈值（毫秒）',
  'settings.systemConfig.field.stateBatchMax': '实时推送状态批量上限',
  'settings.systemConfig.field.subMetaSizeVw': '副信息字号（vw）',
  'settings.systemConfig.field.tier1Kwh': '第一阶梯电量（kWh）',
  'settings.systemConfig.field.tier1Price': '第一阶梯电价',
  'settings.systemConfig.field.tier2Price': '第二阶梯电价',
  'settings.systemConfig.field.tier3Price': '第三阶梯电价',
  'settings.systemConfig.field.timeSizeVw': '时钟字号（vw）',
  'settings.systemConfig.field.triggerCooldownMs': '触发冷却（毫秒）',
  'settings.systemConfig.field.weatherAlertCooldownMin': '极端天气联动冷却（分钟）',
  'settings.systemConfig.field.weatherAlertEnabled': '启用天气预警联动',
  'settings.systemConfig.field.weatherAlertModeId': '极端天气联动家庭模式 ID',
  'settings.systemConfig.field.weatherAlertNotifyLevel': '预警推送最低等级',
  'settings.systemConfig.field.weatherAlertRefreshMs': '天气预警刷新间隔（毫秒）',
  'settings.systemConfig.field.weatherAlertSceneId': '红色预警联动场景 ID',
  'settings.systemConfig.field.weatherIconSizeVw': '天气图标（vw）',
  'settings.systemConfig.field.weatherLat': '天气纬度',
  'settings.systemConfig.field.weatherLon': '天气经度',
  'settings.systemConfig.field.weatherStatsSizePx': '气象数据字号（px）',
  'settings.systemConfig.field.weatherTempSizeVw': '气温字号（vw）',
  'settings.systemConfig.field.widgetPollIntervals': '各微件独立轮询（结构化配置）',
  'settings.systemConfig.field.showAwayButton': '显示无人在家徽章',
  'settings.systemConfig.field.showHomeMode': '显示家庭模式切换器',
  'settings.systemConfig.field.singleActiveMode': '同一时间只生效一个家庭状态',
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
    const sectionLabel = configLabelText(`settings.systemConfig.sectionField.${sectionKey}.${fieldKey}`)
    if (sectionLabel) return sectionLabel
  }
  return configLabelText(`settings.systemConfig.field.${fieldKey}`) || fieldKey
}

/** 系统配置字段元数据统一出口（barrel） */

/** 系统配置字段类型推断与表单控件选项 */

const WIDE_FIELD_RE = /entity|path|url|password|dir|player|domains|logo|title|key/i

/** HA entity_id 字段（排除 entityCache* / entityRegistry* 等运行参数键名） */
const HA_ENTITY_FIELD_RE = /EntityIds?$/i

const HA_ENTITY_DOMAIN_FILTERS: Record<string, string> = {
  mainValveEntityId: 'switch',
}

/** NESTED_JSON_FIELDS：常量集合，成员语义见定义处。 */
export const NESTED_JSON_FIELDS = new Set([
  'widgetPollIntervals',
  'awaySimIntervalMinMax',
  'advisorTipActions',
  'presencePersons',
  'clients',
  'scenes',
])

/** 枚举类配置字段的下拉选项（key → { value, label }[]） */
const SYSTEM_CONFIG_SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  defaultMode: [
    { value: 'random', label: '随机切换' },
    { value: 'clock', label: '时钟' },
    { value: 'weather', label: '天气' },
  ],
  pricingMode: [
    { value: 'tiered', label: '年阶梯电价' },
    { value: 'fixed', label: '固定单价' },
  ],
}

/**
 * 固定选项**多选**字段（值仍是字符串数组，只是控件换成可点的 chip）。
 *
 * 为什么需要：``mutedSources`` / ``dndWeekdays`` 让用户手填逗号串，等于要求他记住
 * ``earthquake-eew`` 这种内部来源名 —— 填错不会有任何报错，只是静音不生效。
 * 选项直接来自后端实际使用的枚举，点选即可。
 */
const SYSTEM_CONFIG_MULTI_OPTIONS: Record<string, { value: string; label: string }[]> = {
  mutedSources: [
    { value: 'home-mode', label: '家庭模式切换' },
    { value: 'automation', label: '自动化' },
    { value: 'device-timer', label: '设备倒计时' },
    { value: 'energy-anomaly', label: '能耗异常' },
    { value: 'energy-budget', label: '能源预算' },
    { value: 'energy-balance', label: '余额不足' },
    { value: 'water-monitor', label: '用水/漏水' },
    { value: 'environment-health', label: '空气质量' },
    { value: 'device-monitor', label: '设备离线' },
    { value: 'presence', label: '人员在家' },
    { value: 'advisor', label: '智能顾问' },
    { value: 'voice', label: '语音' },
  ],
  dndWeekdays: [
    { value: '1', label: '周一' },
    { value: '2', label: '周二' },
    { value: '3', label: '周三' },
    { value: '4', label: '周四' },
    { value: '5', label: '周五' },
    { value: '6', label: '周六' },
    { value: '0', label: '周日' },
  ],
}

/** 多选字段的可选值（未登记时返回空数组 = 按普通文本处理）。 */
export function systemConfigMultiOptions(key = '') {
  return SYSTEM_CONFIG_MULTI_OPTIONS[key] || []
}

/** 多选字段的值是否为数字（``dndWeekdays`` 是 0–6 的整数，其余是字符串）。 */
export function isNumericMultiField(key = '') {
  const options = SYSTEM_CONFIG_MULTI_OPTIONS[key]
  return !!options?.length && options.every((opt) => /^\d+$/.test(String(opt.value)))
}

export function systemConfigSelectOptions(key = '') {
  return SYSTEM_CONFIG_SELECT_OPTIONS[key] || []
}

function isHaEntityConfigField(key = '') {
  if (/^entity(cache|registry)/i.test(key)) return false
  return HA_ENTITY_FIELD_RE.test(key)
}

export function haEntityDomainFilter(key = '') {
  return HA_ENTITY_DOMAIN_FILTERS[key] || ''
}

export function systemConfigCellClass(field: Pick<EditableConfigField, 'type' | 'key'>) {
  const wide =
    field.type === 'password' ||
    field.type === 'array' ||
    field.type === 'object' ||
    field.type === 'entity' ||
    field.type === 'entity-list' ||
    WIDE_FIELD_RE.test(field.key)
  return {
    'params-cell--bool': field.type === 'boolean',
    'params-cell--wide': wide,
  }
}

/**
 * 按字段名就能确定的控件类型（与值无关）。查表而不是 if 链：每加一种特殊控件
 * 只需加一行，不让类型推断函数的分支数量继续涨。
 */
function specialFieldType(key: string, isArray: boolean): string | null {
  if (SYSTEM_CONFIG_SELECT_OPTIONS[key]?.length) return 'select'
  if (isArray && SYSTEM_CONFIG_MULTI_OPTIONS[key]?.length) return 'multi-select'
  if (NESTED_JSON_FIELDS.has(key)) return 'object'
  if (/password|token|secret|apikey|webhook|key$/i.test(key)) return 'password'
  if (isHaEntityConfigField(key)) return isArray ? 'entity-list' : 'entity'
  return null
}

export function inferSystemConfigFieldType(value: unknown, key = '') {
  const isArray = Array.isArray(value)
  const special = specialFieldType(key, isArray)
  if (special) return special
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (isArray) return 'array'
  if (value && typeof value === 'object') return 'object'
  return 'string'
}

export function systemConfigFieldMatchesQuery(field: Pick<EditableConfigField, 'key'>, q: string, sectionKey: string) {
  const label = resolveSystemConfigFieldLabel(field.key, sectionKey)
  return (
    field.key.toLowerCase().includes(q) ||
    label.toLowerCase().includes(q) ||
    systemConfigFieldHint(field.key, sectionKey).toLowerCase().includes(q)
  )
}
