/**
 * 系统配置字段提示文案表（含生效范围后缀）
 *
 * 职责：
 * - 维护 SystemConfig 字段 key → 面向用户的中文提示文案映射表（HINT_TEXT）。
 * - 在高级参数面板中按字段 key 追加提示文案与生效范围后缀，帮助用户理解
 *   每项参数的语义、推荐取值与修改后的生效方式（前端热更新 / 后端重启 / 等）。
 *
 * 依赖：./field-apply.util 的 FIELD_APPLY_SCOPE 提供「字段 → 生效范围」映射。
 *
 * 注意：
 * - 对象 key（settings.systemConfig.fieldHint.{fieldKey}）为 i18n 风格 key，不翻译。
 * - 仅面向用户的提示文案 value 使用简体中文。
 */
import { FIELD_APPLY_SCOPE } from './field-apply.util'

/** 字段 key → 中文提示文案映射（i18n 风格 key，与设置页查表对齐） */
const HINT_TEXT: Record<string, string> = {
  'settings.systemConfig.fieldHint.eventLogTimelineHours':
    '系统时间线（事件日志）默认回溯的小时数。推荐 12',
  'settings.systemConfig.fieldHint.accentColor':
    '界面强调色，用于按钮、链接、选中态等关键交互元素。推荐 #3b82f6（蓝色）',
  'settings.systemConfig.fieldHint.alertBypassDnd':
    '开启后安防告警投递不受免打扰时段限制，紧急事件天然绕过 DND。推荐开启',
  'settings.systemConfig.fieldHint.alertChannels':
    '逗号分隔告警渠道，如 in_app；紧急/布防触发/紧急求助类事件按此渠道投递',
  'settings.systemConfig.fieldHint.anomalyCooldownMin':
    '同一类型异常在此冷却时间内不会重复推送告警（能源/用水等分区各自独立）。推荐 15–60',
  'settings.systemConfig.fieldHint.apiRetryDelayMs':
    '接口请求失败后的重试等待延迟（毫秒）。推荐 1000',
  'settings.systemConfig.fieldHint.apiRetryMax':
    '前端 HTTP 请求失败后的最大重试次数。推荐 2',
  'settings.systemConfig.fieldHint.apiTimeoutMs':
    '前端 HTTP 请求的超时时间（毫秒），超时后进入重试或报错。推荐 15000（15秒）',
  'settings.systemConfig.fieldHint.applyMaxRetries':
    '家庭模式切换失败后的最大重试次数。推荐 2',
  'settings.systemConfig.fieldHint.armExitGraceSeconds':
    '布防后门锁解锁在该秒数内不视为入侵（0=关闭）。推荐 30',
  'settings.systemConfig.fieldHint.autoBackupEnabled':
    '每天 02:30（北京时间）自动生成完整备份包。推荐开启',
  'settings.systemConfig.fieldHint.autoBackupRetainDays':
    '自动备份产物的保留天数，超出后自动清理。推荐 7',
  'settings.systemConfig.fieldHint.awayConfirmMin':
    '检测到全员离家后等待此时长再做布防，避免短暂出门误触发。推荐 5',
  'settings.systemConfig.fieldHint.awaySimBrightnessMin':
    '离家模拟灯光的最低亮度百分比，避免夜间全亮暴露无人状态。推荐 40',
  'settings.systemConfig.fieldHint.awaySimBrightnessRange':
    '离家模拟时灯光亮度随机浮动范围，使模拟更自然。推荐 50',
  'settings.systemConfig.fieldHint.awaySimIntervalMinMax':
    '离家模拟两次灯光动作之间的随机等待区间（分钟）；可用表格编辑最小/最大间隔',
  'settings.systemConfig.fieldHint.brandSizePx':
    '站点标题文字大小（像素）。推荐 22',
  'settings.systemConfig.fieldHint.brandTopVh':
    '站点标题距屏幕顶部距离（视口高度百分比）。推荐 5',
  'settings.systemConfig.fieldHint.calendarSyncMin':
    '日历订阅的数据同步间隔（分钟）。推荐 60',
  'settings.systemConfig.fieldHint.calendarUrl':
    '日历订阅地址（iCal 格式），用于日程提醒与家庭模式联动',
  'settings.systemConfig.fieldHint.callDedupWindowMs':
    '在此时间窗口内对同一接口的重复调用将合并为一次。推荐 500',
  'settings.systemConfig.fieldHint.commandQueueMax':
    'HA 命令发送队列的上限，防止积压。推荐 20',
  'settings.systemConfig.fieldHint.commandQueueTtlMs':
    '命令队列中每条命令的有效时间，超时未发送即丢弃。推荐 60000（60秒）',
  'settings.systemConfig.fieldHint.configAuditMaxEntries':
    '配置变更审计记录的最大保留条数。推荐 100',
  'settings.systemConfig.fieldHint.configAuditPersistEnabled':
    '开启后将配置变更审计记录持久化到数据库；默认关闭时仅内存保留，重启后丢失',
  'settings.systemConfig.fieldHint.configCacheTtlMs':
    '安防配置缓存的有效时间，过期后从数据库重新加载。推荐 60000（60秒）',
  'settings.systemConfig.fieldHint.contentShiftVh':
    '主内容区域垂直偏移量，正数下移、负数上移（视口高度百分比）。推荐 0',
  'settings.systemConfig.fieldHint.criticalDomains':
    '逗号分隔 domain，如 light,switch；这些域的状态变更即时推送，不进入批处理',
  'settings.systemConfig.fieldHint.dailyMediaLimitMin':
    '媒体播放器每日累计时长上限，0 表示不限制。推荐 0 或 60',
  'settings.systemConfig.fieldHint.deviceWhitelist':
    '允许儿童使用的实体 ID 列表；非空时启用白名单 + 时间窗拦截',
  'settings.systemConfig.fieldHint.defaultMode':
    '屏保唤醒后默认展示的模式。推荐「随机切换」',
  'settings.systemConfig.fieldHint.disconnectRestPollEnabled':
    'HA WebSocket 断连后通过 REST /api/states 补同步 L1（仅 Leader 实例）',
  'settings.systemConfig.fieldHint.disconnectRestPollInitialDelayMs':
    '断连后等待多久开始首次 REST 拉取。推荐 5000',
  'settings.systemConfig.fieldHint.disconnectRestPollIntervalMs':
    'WS 断连期间 REST 全量拉取间隔。推荐 30000',
  'settings.systemConfig.fieldHint.disconnectRestPollTimeoutMs':
    '单次 REST /api/states 超时。大型实例推荐 60000',
  'settings.systemConfig.fieldHint.emergencyCooldownSec':
    '紧急求助按钮触发后在此时间内重复点击不再重复发送。推荐 60',
  'settings.systemConfig.fieldHint.enableWeatherMode':
    '开启后屏保可在时钟和天气锁屏之间切换展示。默认关闭',
  'settings.systemConfig.fieldHint.instantEnter':
    '开启后进入锁屏跳过 1 秒渐显动画，墙屏推荐开启。默认开启',
  'settings.systemConfig.fieldHint.instantLeave':
    '开启后触屏唤醒快速离开锁屏（约 120ms）。默认开启',
  'settings.systemConfig.fieldHint.brightness':
    '锁屏态视觉亮度（0.3~1，1 为不降）。首帧绘完后生效。默认 1',
  'settings.systemConfig.fieldHint.entityCacheEnabled':
    '开启后在浏览器本地缓存实体数据，减少重复请求。推荐开启',
  'settings.systemConfig.fieldHint.entityCacheMaxAgeMs':
    '浏览器本地实体缓存的有效时长，过期后自动刷新。推荐 86400000（24小时）',
  'settings.systemConfig.fieldHint.entityCacheSaveDebounceMs':
    '实体缓存写入浏览器的防抖间隔，避免频繁写入影响性能。推荐 10000（10秒）',
  'settings.systemConfig.fieldHint.entityRegistryCacheMs':
    'HA 实体注册表的内存缓存时长（毫秒）。推荐 300000（5分钟）',
  'settings.systemConfig.fieldHint.entityRegistryTimeoutMs':
    '获取 HA 实体注册表的请求超时时间（毫秒）。推荐 45000（45秒）',
  'settings.systemConfig.fieldHint.eventLogFlushIntervalMs':
    '事件日志缓冲区刷写到数据库的间隔（毫秒）。修改后对下一次刷写调度生效。推荐 5000（5秒）',
  'settings.systemConfig.fieldHint.eventLogMaxBuffer':
    '事件日志内存缓冲区的最大容量，超过后强制刷写。推荐 200',
  'settings.systemConfig.fieldHint.eventLogMaxRequeueBuffer':
    '事件日志写入失败后回灌队列的最大容量。推荐 500',
  'settings.systemConfig.fieldHint.eventLogSkipSensorTimeline':
    '开启后 sensor 变更不写 Redis timeline，减轻 Redis 压力（默认开启；能耗时间线可回退 HA History）',
  'settings.systemConfig.fieldHint.eventLogTierCSampleRate':
    'C 级域（如 camera）采样率 0–1；默认 0 表示全部跳过，调高后才有实际效果',
  'settings.systemConfig.fieldHint.eventLogTierEnabled':
    '智能家居写入策略：控制/安防/场景必写；门窗烟感水浸运动与电表选写；温湿度电量/摄像头/定位等跳过（走 HA History / 环境快照）。关闭后恢复「尽量全写」。',
  'settings.systemConfig.fieldHint.budgetAlertCooldownMin':
    '能源预算超支站内通知与自动联动的重复触发冷却（分钟）。推荐 720（12 小时）',
  'settings.systemConfig.fieldHint.eventLogOverlayHours':
    '户型图事件浮层从 EventLog 预加载的默认回溯小时数。推荐 2',
  'settings.systemConfig.fieldHint.eventLogTimelineMax':
    'Redis 中按实体/全局 timeline 缓存保留的最大条数；系统时间线部件单次查询条数上限。推荐 500',
  'settings.systemConfig.fieldHint.frigateDedupMs':
    '同一摄像头在此时间窗口内的重复告警将被合并去重。推荐 30000（30秒）',
  'settings.systemConfig.fieldHint.frigateMaxEvents':
    'Frigate 最近检测事件 API 默认返回条数（后端截断）。推荐 50',
  'settings.systemConfig.fieldHint.frigatePersonAlarmModes':
    '指定哪些布防模式下触发 Frigate 摄像头人物告警。推荐 armed_away,armed_night（none=关闭）',
  'settings.systemConfig.fieldHint.haDisconnectDebounceMs':
    'HA WebSocket 断连后的防抖等待时间，避免短暂闪断频繁提示。推荐 5000（5秒）',
  'settings.systemConfig.fieldHint.haHistoryCacheMin':
    'Home Assistant 历史查询的内存缓存时长（分钟），与数据库物理保留无关。推荐 5',
  'settings.systemConfig.fieldHint.haSyncWaitMs':
    '推送状态变更后等待 HA 确认同步的超时时间（毫秒）。推荐 90000（90秒）',
  'settings.systemConfig.fieldHint.historyCacheMaxSize':
    'HA 历史查询内存缓存的最大条目数。推荐 300',
  'settings.systemConfig.fieldHint.idempotencyCleanupIntervalMs':
    '命令幂等缓存清理的间隔时间（毫秒）。推荐 60000（60秒）',
  'settings.systemConfig.fieldHint.idempotencyTtlMs':
    '命令幂等性的有效时间（毫秒），相同命令在此时长内不重复执行。推荐 3000（3秒）',
  'settings.systemConfig.fieldHint.iceUrls':
    '逗号分隔，如 turn:192.168.1.10:3478?transport=udp,turn:192.168.1.10:3478?transport=tcp。与 HA get_client_config 合并，用于跨网 WebRTC',
  'settings.systemConfig.fieldHint.iceUsername':
    'coturn 等 TURN 服务的长期用户名（可选）',
  'settings.systemConfig.fieldHint.iceCredential':
    'TURN 密码或临时凭据（可选）',
  'settings.systemConfig.fieldHint.ingressCoalesceDomains':
    '参与微窗口合并的 domain 列表。推荐 sensor,binary_sensor,device_tracker,update',
  'settings.systemConfig.fieldHint.ingressCoalesceEnabled':
    '对高频 sensor 变更在入口做毫秒级合并，降低 CPU/WS 压力（默认开启）',
  'settings.systemConfig.fieldHint.ingressCoalesceWindowMs':
    '合并窗口（毫秒）。推荐 16（NAS）',
  'settings.systemConfig.fieldHint.initStatesBatchSize':
    '全量加载实体状态时每批次的实体数，值越小加载越平滑但越慢。推荐 400',
  'settings.systemConfig.fieldHint.initialStatesPriorityEnabled':
    '全量 initial_states 推送时 light/switch 等关键域排在前面',
  'settings.systemConfig.fieldHint.initialStatesWaitMs':
    '首次连接后等待全量实体状态同步的超时时间。推荐 8000（8秒）',
  'settings.systemConfig.fieldHint.linkageClaimTtlMin':
    '家庭模式联动占用声明的有效期（分钟）。推荐 15',
  'settings.systemConfig.fieldHint.largeEntityThreshold':
    '实体数量超过此阈值时启用分批加载等优化策略。推荐 2000',
  'settings.systemConfig.fieldHint.workerDerivedThreshold':
    '实体数超过此阈值时派生索引改用 Web Worker 重建，可下调至约 3000 以提前卸载主线程。推荐 3500',
  'settings.systemConfig.fieldHint.roomBatchEmit':
    '按订阅分组预计算 WS payload，大规模安装建议开启',
  'settings.systemConfig.fieldHint.coldEntityOnDemand':
    '默认开启：WS 仅推送关键域、当前订阅域与钉选/热点实体，非可见实体不推、列表页 REST 按需补全',
  'settings.systemConfig.fieldHint.latencyProfile':
    'realtime=默认，禁止大实体自适应抬高 flush；balanced=均衡；bulk=偏吞吐放大窗口',
  'settings.systemConfig.fieldHint.criticalFlushIntervalMs':
    '灯光/开关等关键域 Socket.IO 合并窗口；0=立即推送。推荐 4',
  'settings.systemConfig.fieldHint.pinnedSensorFlushIntervalMs':
    '钉选传感器短窗口，避免全量 sensor 开闸。推荐 16',
  'settings.systemConfig.fieldHint.wsPingIntervalMs':
    'HA WebSocket 应用层 ping 间隔。推荐 45000',
  'settings.systemConfig.fieldHint.wsPongTimeoutMs':
    '等待 pong 超时；过短易在事件洪峰下误杀连接。推荐 25000',
  'settings.systemConfig.fieldHint.wsHeartbeatMaxMisses':
    '连续未响应达到该次数才主动断开重连。推荐 3',
  'settings.systemConfig.fieldHint.coldBatchWindowMs':
    '自动化/告警等 Cold Path 聚合窗口，不影响 UI Hot Path。推荐 15',
  'settings.systemConfig.fieldHint.coldBatchMax':
    'Cold Path 单批事件上限，达上限立即派发。推荐 256',
  'settings.systemConfig.fieldHint.leaderTtlMs':
    '多副本 HA WS Leader 租约；越短故障切换越快。推荐 8000',
  'settings.systemConfig.fieldHint.leaderRenewMs':
    'Leader 续约间隔，应明显小于 TTL。推荐 2500',
  'settings.systemConfig.fieldHint.learningPeriodDays':
    '能源异常学习期天数，期间跳过功率突增告警以建立基线。推荐 7',
  'settings.systemConfig.fieldHint.lowBatteryCooldownMin':
    '设备低电量后在此冷却时间内不会重复发送低电量告警。推荐 120',
  'settings.systemConfig.fieldHint.mainValveEntityId':
    '连续用水异常时智能顾问建议关闭此阀门，不自动执行关阀操作',
  'settings.systemConfig.fieldHint.manualLockTtlMin':
    '手动激活的家庭模式锁定时长（分钟），锁定期间不被自动联动切换。推荐 30',
  'settings.systemConfig.fieldHint.maxExecHistory':
    '家庭模式执行历史记录的最大保留条数。推荐 100',
  'settings.systemConfig.fieldHint.maxListeners':
    '事件监听器的最大数量上限，防止内存泄漏。推荐 200',
  'settings.systemConfig.fieldHint.maxNotifications':
    '应用内通知库条数软上限：超出后优先删除已读最旧记录（未读尽量保留）。按天硬删请用「数据保留 → 通知记录」。推荐 500',
  'settings.systemConfig.fieldHint.maxRecentChanges':
    '内存中保留的近期实体状态变更缓存上限。推荐 3000',
  'settings.systemConfig.fieldHint.maxReconnectDelayMs':
    'WebSocket 重连最大延迟上限（毫秒），采用指数退避策略。推荐 30000（30秒）',
  'settings.systemConfig.fieldHint.maxRemoteNotifications':
    '从后端拉取远程通知的最大条数。推荐 100',
  'settings.systemConfig.fieldHint.maxTriggerLogs':
    '家庭模式触发日志的最大保留条数。推荐 50',
  'settings.systemConfig.fieldHint.metaSizeVw':
    '锁屏主信息文字大小（日期、农历等），相对设计稿宽度百分比。推荐 3',
  'settings.systemConfig.fieldHint.moldAlertCooldownMin':
    '霉变风险预警在此冷却时间内不会重复推送。推荐 10',
  'settings.systemConfig.fieldHint.offlineCooldownMin':
    '设备离线后在此冷却时间内不会重复发送离线告警。推荐 30',
  'settings.systemConfig.fieldHint.openWeatherApiKey':
    'OpenWeatherMap API 密钥，用于获取天气数据（免费注册获取）',
  'settings.systemConfig.fieldHint.optimisticTtlMs':
    '乐观更新在此时间内前端使用本地数据，超时后等待服务端确认。推荐 3000（3秒）',
  'settings.systemConfig.fieldHint.peakEnd1':
    '第一峰电时段结束（HH:mm）；仅在启用峰谷平分时时生效',
  'settings.systemConfig.fieldHint.peakEnd2':
    '第二峰电时段结束（HH:mm）；仅在启用峰谷平分时时生效',
  'settings.systemConfig.fieldHint.peakStart1':
    '第一峰电时段起始（HH:mm）；仅在启用峰谷平分时时生效，同时用于温控错峰',
  'settings.systemConfig.fieldHint.peakStart2':
    '第二峰电时段起始（HH:mm）；仅在启用峰谷平分时时生效，同时用于温控错峰',
  'settings.systemConfig.fieldHint.timeOfUseEnabled':
    '开启后按峰/谷/平段计费并启用温控错峰；关闭后统一使用阶梯档或固定单价。固定单价地区通常保持关闭',
  'settings.systemConfig.fieldHint.valleyStart':
    '谷段起始时间（HH:mm），默认 23:00，可跨日',
  'settings.systemConfig.fieldHint.valleyEnd':
    '谷段结束时间（HH:mm），默认 07:00',
  'settings.systemConfig.fieldHint.peakPrice':
    '峰段单价；填 0 时自动推导（阶梯取二档价，固定取固定单价）',
  'settings.systemConfig.fieldHint.valleyPrice':
    '谷段单价；填 0 时自动推导（约为平段×0.63）',
  'settings.systemConfig.fieldHint.flatPrice':
    '平段单价；填 0 时自动推导（阶梯取一档价，固定取固定单价）',
  'settings.systemConfig.fieldHint.pricingMode':
    'tiered=年累计三档阶梯（默认）；fixed=固定单价（如新疆），切换为 fixed 时建议关闭峰谷平',
  'settings.systemConfig.fieldHint.fixedPrice':
    '固定单价模式下的电价（元/kWh）',
  'settings.systemConfig.fieldHint.regionLabel':
    '可选，如「新疆」「北京」，在电价 Widget 中展示',
  'settings.systemConfig.fieldHint.rebuildChunkSize':
    '界面重建时每批处理的实体数量，影响切换流畅度。推荐 500',
  'settings.systemConfig.fieldHint.rebuildDebounceMs':
    '实体派生索引重建防抖间隔（毫秒），大户型可适当调高。推荐 50',
  'settings.systemConfig.fieldHint.reconnectBaseMs':
    'HA WebSocket 断连后的基础重连延迟（毫秒）。推荐 1000（1秒）',
  'settings.systemConfig.fieldHint.redisIncrementalFlushMs':
    '增量 STATE_CHANGED 写入 Redis 前的 debounce 毫秒数。推荐 100；保存后立即重排进行中的 flush 定时器',
  'settings.systemConfig.fieldHint.redisWriteBatch':
    'Redis 缓存批量写入的大小，一次性写入多条数据。推荐 200',
  'settings.systemConfig.fieldHint.replayChunkSize':
    '客户端断线重连后状态回放的分块大小，分批恢复避免阻塞。推荐 500',
  'settings.systemConfig.fieldHint.retentionCleanupIntervalHours':
    '数据库历史数据清理任务的执行间隔（小时）。推荐 1',
  'settings.systemConfig.fieldHint.retentionDeleteBatchSize':
    '单次 DELETE 批次大小，影响清理任务对数据库的压力。推荐 5000',
  'settings.systemConfig.fieldHint.retentionFirstDelaySec':
    '应用启动后首次执行数据库清理的延迟时间（秒）。推荐 15',
  'settings.systemConfig.fieldHint.scale':
    '屏保全局缩放倍率，1 = 100%，与整页等比缩放叠加生效。推荐 1.35',
  'settings.systemConfig.fieldHint.scaleBaseHeight':
    '整页等比缩放的设计基准高度（像素）。推荐 1024',
  'settings.systemConfig.fieldHint.scaleBaseWidth':
    '整页等比缩放的设计基准宽度（像素），需与中控屏幕分辨率协调。推荐 1366',
  'settings.systemConfig.fieldHint.sceneExecHistoryMax':
    '场景执行历史记录的最大保留条数。推荐 100',
  'settings.systemConfig.fieldHint.screensaverEnabled':
    '开启后空闲超时自动进入锁屏屏保。推荐开启',
  'settings.systemConfig.fieldHint.screensaverIdleMs':
    '用户无操作的空闲时间（毫秒），超过此时长触发屏保。推荐 120000（2分钟）',
  'settings.systemConfig.fieldHint.scriptExecHistoryMax':
    '脚本执行历史记录的最大保留条数。推荐 80',
  'settings.systemConfig.fieldHint.secSizeVw':
    '秒数显示大小，相对设计稿宽度百分比。推荐 7',
  'settings.systemConfig.fieldHint.sensorAlertCooldownSec':
    '同一传感器触发告警后，在此时间内不再重复告警。推荐 60',
  'settings.systemConfig.fieldHint.sensorFlushIntervalMs':
    '非关键域 state_changed_batch 合并间隔，未设则回退 stateFlushIntervalMs',
  'settings.systemConfig.fieldHint.sepSizeVw':
    '时钟冒号分隔符大小，相对设计稿宽度百分比。推荐 17',
  'settings.systemConfig.fieldHint.showBrand':
    '开启后在锁屏界面显示站点标题（品牌名）。推荐开启',
  'settings.systemConfig.fieldHint.showGregorianDate':
    '开启后在锁屏上显示公历日期。推荐开启',
  'settings.systemConfig.fieldHint.showLunar':
    '开启后在锁屏上显示农历日期信息。推荐开启',
  'settings.systemConfig.fieldHint.showSeconds':
    '开启后时钟锁屏显示秒数，关闭则仅显示时分。推荐开启',
  'settings.systemConfig.fieldHint.showWeatherDesc':
    '开启后天气锁屏显示天气文字描述（晴/多云/雨等）。推荐开启',
  'settings.systemConfig.fieldHint.showWeatherIcon':
    '开启后天气锁屏显示天气图标。推荐开启',
  'settings.systemConfig.fieldHint.showWeatherMeta':
    '开启后天气锁屏显示日期时间信息。推荐开启',
  'settings.systemConfig.fieldHint.showWeatherStats':
    '开启后天气锁屏显示湿度、风速等气象数据。推荐开启',
  'settings.systemConfig.fieldHint.staleThresholdMs':
    'HA 断连超过此毫秒数后实体影子数据视为陈旧。推荐 30000（30 秒；过久会导致 UI 假活）',
  'settings.systemConfig.fieldHint.stateBatchMax':
    '单次批量推送状态变更的最大条目数。推荐 300',
  'settings.systemConfig.fieldHint.stateFlushIntervalMs':
    '批量合并客户端状态推送的间隔（毫秒）。推荐 80',
  'settings.systemConfig.fieldHint.subMetaSizeVw':
    '锁屏副信息文字大小，相对设计稿宽度百分比。推荐 2',
  'settings.systemConfig.fieldHint.tier1Kwh':
    '第一阶梯电量上限（kWh/年），超出后进入第二阶梯计价；与峰谷时段无关。推荐 2880（北京）',
  'settings.systemConfig.fieldHint.tier1Price':
    '第一阶梯电价（元/kWh）。推荐 0.4883（北京）',
  'settings.systemConfig.fieldHint.tier2Price':
    '第二阶梯电价（元/kWh），超出第一阶梯后按此计费。推荐 0.5383（北京）',
  'settings.systemConfig.fieldHint.tier3Price':
    '第三阶梯电价（元/kWh），超出第二阶梯后按此计费。推荐 0.7883（北京）',
  'settings.systemConfig.fieldHint.timeSizeVw':
    '时钟数字大小，相对设计稿宽度百分比（非视口 vw）。推荐 24',
  'settings.systemConfig.fieldHint.timeWindows':
    '白名单设备允许使用的时间窗（工作日/周末或星期数组 + HH:mm）',
  'settings.systemConfig.fieldHint.triggerCooldownMs':
    '触发后的冷却时间（毫秒），在此期间再次满足条件不会重复执行',
  'settings.systemConfig.fieldHint.weatherAlertCooldownMin':
    '红色预警触发场景/家庭模式后的冷却时间（分钟），避免反复联动。推荐 120',
  'settings.systemConfig.fieldHint.weatherAlertEnabled':
    '开启后监听 OpenWeather 预警并按等级推送；红色预警可联动场景或家庭模式',
  'settings.systemConfig.fieldHint.weatherAlertModeId':
    '红色预警时激活的家庭模式 ID；与联动场景二选一或同时配置',
  'settings.systemConfig.fieldHint.weatherAlertNotifyLevel':
    '仅推送不低于该等级的预警：red / orange / yellow。推荐 orange',
  'settings.systemConfig.fieldHint.weatherAlertRefreshMs':
    '天气预警信息的自动刷新间隔（毫秒）。推荐 1800000（30分钟）',
  'settings.systemConfig.fieldHint.weatherAlertSceneId':
    '红色预警时执行的场景 ID（如关窗/拉帘/布防）；与家庭模式二选一或同时配置',
  'settings.systemConfig.fieldHint.weatherAlertsTtlMin':
    '天气灾害预警缓存的有效时间（分钟），过期后重新拉取。推荐 30',
  'settings.systemConfig.fieldHint.weatherFallbackEntityId':
    'OpenWeather 不可用时回退的 HA weather.* 实体；留空则自动识别',
  'settings.systemConfig.fieldHint.weatherIconSizeVw':
    '天气锁屏图标大小，相对设计稿宽度百分比。推荐 10',
  'settings.systemConfig.fieldHint.weatherLat':
    '获取天气数据的地理纬度坐标。推荐 39.9（北京）',
  'settings.systemConfig.fieldHint.weatherLon':
    '获取天气数据的地理经度坐标。推荐 116.4（北京）',
  'settings.systemConfig.fieldHint.weatherStatsSizePx':
    '天气锁屏气象数据文字大小（像素）。推荐 15',
  'settings.systemConfig.fieldHint.weatherTempSizeVw':
    '天气锁屏气温数字大小，相对设计稿宽度百分比。推荐 22',
  'settings.systemConfig.fieldHint.widgetPollIntervals':
    '各微件独立轮询间隔（ms）；表格中删除行并保存即可移除该微件',
  'settings.systemConfig.fieldHint.showAwayButton':
    '控制主页顶部是否显示「无人在家」状态徽章。推荐开启',
  'settings.systemConfig.fieldHint.showHomeMode':
    '控制主页顶部是否显示家庭模式切换器。推荐开启',
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
    const sectionHint = configHintText(
      `settings.systemConfig.sectionFieldHint.${sectionKey}.${fieldKey}`,
    )
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
