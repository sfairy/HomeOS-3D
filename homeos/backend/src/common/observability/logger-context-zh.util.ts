/**
 * 职责：
 *  - 中文语义日志上下文注入（userId/entityId/traceId）；
 * 关键依赖：
 *  - structured-logger；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * Nest Logger context（方括号里的名字）→ 中文展示名。
 * 打印时映射，不改各 Service 的 `new Logger(Xxx.name)`。
 */

const LOGGER_CONTEXT_ZH: Record<string, string> = {
  // Nest 框架
  NestFactory: 'Nest工厂',
  InstanceLoader: '实例加载',
  RoutesResolver: '路由解析',
  RouterExplorer: '路由探测',
  NestApplication: 'Nest应用',
  PackageLoader: '包加载',
  ExceptionsHandler: '异常处理',
  LegacyRouteConverter: '遗留路由转换',
  WebSocketsController: 'WebSocket控制器',
  MiddlewareModule: '中间件模块',
  DiscoveryService: '服务发现',
  SchedulerRegistry: '定时任务注册',

  // 应用引导
  HomeOS: 'HomeOS',
  Bootstrap: '启动引导',
  AppController: '应用接口',

  // Agent
  AgentConfigService: '智能管家配置',
  AgentService: '智能管家',
  AgentSessionStoreService: '管家会话',
  CmdCache: '指令缓存',
  DeepSeekLLM: 'DeepSeek LLM',
  FastPath: '快路径',
  HomeTools: '全屋工具',
  LangTemplateService: '语言模板',
  McpGatewayService: 'MCP网关',
  MockLLM: 'Mock LLM',
  ResolvingLLM: 'LLM解析',

  // 认证
  AuthController: '认证接口',
  AuthService: '认证',
  GuestShareCodeService: '访客分享码',
  LicenseService: '授权许可',

  // 感知 / 语音
  AdvisorUsageService: '顾问用量',
  VoiceService: '语音',

  // 通道
  ChannelConfigService: '通道配置',
  ChannelsService: '通知通道',
  EmailService: '邮件通道',
  WebPushService: 'WebPush通道',
  WecomController: '企业微信接口',
  WecomService: '企业微信',

  // 客户端电量
  ClientPowerService: '终端电量',

  // 指令代理
  CommandProxyAuditService: '指令审计',
  CommandProxyController: '指令代理接口',
  CommandProxyService: '指令代理',

  // 地震
  EarthquakeCatalogNotifyService: '震情目录通知',
  EarthquakeController: '地震接口',
  EarthquakeGlobalService: '全球震情',
  EarthquakeService: '地震服务',
  EewLeaderService: '主EEW',
  EewPollService: 'EEW轮询',

  // HA 连接
  EmbedProxyService: '内嵌反代',
  EmbedWsProxy: '内嵌WS反代',
  HaCommandBridgeService: 'HA指令桥',
  HaConfigService: 'HA配置',
  HaConnectorService: 'HA连接器',
  HaGo2RtcWsProxy: 'go2rtc WS反代',
  HaInitialStatesCoordinatorService: 'HA初始状态协调',
  HaRestClientService: 'HA REST客户端',
  HaStateIngressCoalesceService: 'HA状态入站合并',
  HaStatePipelineService: 'HA状态管道',
  HaWsLeaderService: '主HA-WS',
  TtsSpeakService: 'TTS播报',

  // 家庭模式
  HomeModeService: '家庭模式',

  // 通知
  NotificationCooldownService: '通知冷却',
  NotificationService: '通知',

  // 安防 / 存在
  AnomalyDetectionService: '异常检测',
  AwaySimulationService: '离家模拟',
  FrigateService: 'Frigate',
  MmWavePresenceService: '毫米波存在',
  PresenceService: '在家状态',
  RoomContextService: '房间上下文',
  SecurityLinkageService: '安防联动',
  SecurityPanelService: '安防面板',
  SecurityService: '安防',

  // 状态存储
  EnergySideEffectService: '能耗副作用',
  EntityAreaEnrichmentService: '实体区域补全',
  EntityReferencesService: '实体引用',
  EventLogQueryService: '事件日志查询',
  EventLogService: '事件日志',
  StateStorePersistenceService: '状态持久化',
  StateStoreService: '状态仓库',

  // 系统 / 备份 / 设备
  AppConfigBackupService: '应用配置备份',
  AppConfigService: '应用配置',
  AppService: '应用服务',
  AutoBackupService: '自动备份',
  ChildModeService: '儿童模式',
  DeviceManagementService: '设备管理',
  ExternalApiService: '外部API',
  GuestAccessService: '访客通行',
  MediaSceneService: '媒体场景',
  MoviePilotProxyService: 'MoviePilot反代',
  ServerBackupService: '服务器备份',
  SetupWizardService: '设置向导',
  SystemBundleBackupService: '系统包备份',
  SystemService: '系统',
  UiConfigService: '界面配置',
  UiConfigStaticAssetService: '静态资源',
  UsersBackupService: '用户备份',
  WaterMonitorService: '用水监测',
  WeatherAutoLinkageService: '天气自动联动',
  WeatherWatchService: '天气监视',

  // 基础设施
  CircuitBreaker: '熔断器',
  CsrfMiddleware: 'CSRF中间件',
  DatabaseRetentionService: '数据库留存',
  DistributedLockService: '分布式锁',
  EventBusService: '事件总线',
  GlobalExceptionFilter: '全局异常过滤',
  JobRegistryService: '任务注册',
  PartitionMaintenanceService: '分区维护',
  PrismaService: 'Prisma',
  RedisLeader: '主Redis',
  RedisService: 'Redis',
  MemoryThrottlerStorage: '限流内存存储',
  SessionRevocationService: '会话吊销',
  TokenVersionCacheService: '令牌版本缓存',
  TraceMiddleware: '链路追踪中间件',
  WsBackpressure: 'WS背压',
  WsPushGateway: 'WS推送网关',
};

/** 带动态后缀的 context 前缀映射，如 RedisLeader:ha-ws */
const LOGGER_CONTEXT_PREFIX_ZH: Array<[string, string]> = [
  ['RedisLeader:', '主Redis'],
  ['CircuitBreaker:', '熔断器'],
];

/**
 * 将 Logger context 转为中文展示名；未收录则原样返回。
 */
export function localizeLoggerContext(context?: string): string | undefined {
  if (!context) return context;
  const exact = LOGGER_CONTEXT_ZH[context];
  if (exact) return exact;
  for (const [prefix, label] of LOGGER_CONTEXT_PREFIX_ZH) {
    if (context.startsWith(prefix)) {
      const rest = context.slice(prefix.length).trim();
      return rest ? `${label}:${rest}` : label;
    }
  }
  return context;
}
