/**
 * 仪表盘 / 侧栏布局配置类型：楼层、热点、悬浮组件、安防、地震、智能管家等。
 * 依赖：@/types/dashboard-footer、@/types/whole-home-off、@/types/earthquake、@/types/setup-wizard。
 */
import type { DashboardFooterConfig } from '@/types/dashboard-footer'
import type { WholeHomeOffConfig } from '@/types/whole-home-off'
import type { EarthquakeConfig } from '@/types/earthquake'
import type { DoorbellConfig } from '@/types/setup-wizard'

/** 悬浮组件配置 */
export interface FloatingWidgetConfig {
  title?: string // 组件标题
  width?: string // 组件宽度
  height?: string // 组件高度
  theme?: string // 主题
  /** 通用实体卡片：启用自定义配色（与「位置与样式」主题独立） */
  customColorsEnabled?: boolean
  customColorAccent?: string // 自定义强调色
  customColorLabel?: string // 自定义标签色
  customColorValue?: string // 自定义数值色
  [key: string]: unknown // 其它扩展配置
}

/** 悬浮组件实例 */
export interface FloatingWidget {
  id: string // 组件唯一 ID
  enabled: boolean // 是否启用
  type: string // 组件类型
  xPct: number // X 坐标百分比（0-100）
  yPct: number // Y 坐标百分比（0-100）
  config: FloatingWidgetConfig // 组件配置
  visible?: boolean // 是否可见
}

/** 侧栏面板组件 */
export interface PanelWidget {
  id: string // 组件唯一 ID
  type: string // 组件类型
  visible?: boolean // 是否可见
  entityId?: string // 关联实体 ID
  config?: Record<string, unknown> // 组件配置
}

/** 事件日志组件配置 */
interface EventLogConfig {
  enabled: boolean // 是否启用
  position: string // 展示位置
  xPct: number // X 坐标百分比（0-100）
  yPct: number // Y 坐标百分比（0-100）
  width: number // 宽度
  maxHeight: number // 最大高度
  displayDuration: number // 展示时长（毫秒）
}

/**
 * HA 实体绑定与设备配置。
 *
 * 阶段 3.3 起这里**不再包含连接凭据**（`url` / `fallbackUrl` / `token`）：
 * 连接地址与令牌是 `ha_connections` 表的单源数据，经 `GET/PUT /ha/connection` 读写
 * （前端见 `stores/ha-connection.store.ts`）。本结构只承载与项目布局绑定的实体引用。
 */
export interface HaConfig {
  eventsPath: string // 事件路径
  securityCamera: string // 安防摄像头实体 ID
  securityCameras: string[] // 安防摄像头实体 ID 列表
  weatherEntityId: string // 天气实体 ID
  doorbells: DoorbellConfig[] // 门铃配置列表
  motionSensorEntityId: string // 人体传感器实体 ID
  /** 烟感实体（binary_sensor，可多选） */
  hazardSmokeEntityIds?: string[]
  /** 燃气传感器实体（可多选） */
  hazardGasEntityIds?: string[]
  /** 水浸传感器实体（可多选） */
  hazardLeakEntityIds?: string[]
  /** 安全传感器触发时可选执行的紧急场景 ID */
  hazardEmergencySceneId?: string
  /** 燃气紧急关阀 */
  hazardGasValveEntityId?: string
  /** 漏水紧急关阀 */
  hazardWaterValveEntityId?: string
  /** 烟/燃气排风实体，逗号分隔 */
  hazardExhaustFanEntityIds?: string
  /** 演习模式：传感器触发时不自动关阀/开排风，仅通知与场景 */
  hazardDrillMode?: boolean
}

/** 统计传感器配置 */
export interface StatsSensorsConfig {
  lights: string // 灯具统计传感器实体 ID
  climates: string // 空调统计传感器实体 ID
  battery: string // 电池统计传感器实体 ID
  offline: string // 离线统计传感器实体 ID
  energySources: Record<string, unknown> // 能耗数据源配置
}

/** 自定义嵌入页面 */
interface CustomEmbed {
  id: string // 嵌入页面唯一 ID
  name?: string // 展示名称
  icon?: string // 图标
  url?: string // 嵌入 URL
}

/** 安防模式动作 */
interface SecurityModeAction {
  entity_id?: string // 目标实体 ID
  domain?: string // HA 服务域
  service?: string // HA 服务名
  service_data?: Record<string, unknown> // 服务数据
}

/** 安防模式 */
export interface SecurityMode {
  key: string // 模式 key
  name: string // 模式名称
  icon: string // 图标
  actions: SecurityModeAction[] // 动作列表
}

/** 安防紧急配置 */
export interface SecurityEmergencyConfig {
  mode: string // 紧急模式 key
  appendBuiltin: boolean // 是否追加内置动作
  appendMode: string // 追加模式
  lightBrightnessPct: number // 灯光亮度（百分比）
  lightPool: string[] // 灯光实体池
  autoArmAway: boolean // 是否自动离家布防
  actions: SecurityModeAction[] // 自定义动作列表
  useBuiltinFallback: boolean // 无自定义动作时是否使用内置兜底
}
/** 仪表盘 / 侧栏完整布局配置（layout.store layoutConfig） */
export interface UILayoutConfig {
  /** 仪表盘开灯氛围背景图 URL（任意灯光亮起时） */
  lightOnBackgroundUrl: string
  /** 仪表盘关灯氛围背景图 URL（全部灯光关闭时） */
  lightOffBackgroundUrl: string
  /** 悬浮组件（顶层；原 per-floor floatingWidgets 已迁移到此处） */
  floatingWidgets: FloatingWidget[]
  pageMaxWidth: number // 页面最大宽度（像素）
  siteTitle: string // 站点标题
  rightPanelWidth: number // 右侧面板宽度（像素）
  rightPanelWidgets: PanelWidget[] // 右侧面板组件列表
  favoriteEntities: Record<string, string[]> // 收藏实体（按分类索引）
  eventLogConfig: EventLogConfig // 事件日志配置
  dashboardFooter: DashboardFooterConfig // 底部信息栏配置
  panelPosition: string // 面板位置
  navTabOrder: string[] // 导航标签排序
  navTabVisibility: Record<string, boolean> // 导航标签可见性
  /** 可见标签展示位置：顶栏直显或收入「更多」下拉 */
  navTabPlacement: Record<string, 'bar' | 'dropdown'>
  wholeHomeOff: WholeHomeOffConfig // 全屋关闭配置
  haConfig: HaConfig // HA 配置
  statsSensors: StatsSensorsConfig // 统计传感器配置
  performanceMode: string // 性能模式
  smartPerformanceMode: boolean // 是否智能性能模式
  glassEffect: string // 玻璃效果
  moviePilotUrl: string // MoviePilot 地址
  awaySimulationLightPool: string[] // 离家模拟灯光池
  customEmbeds: CustomEmbed[] // 自定义嵌入页面列表
  embeddedPages: unknown[] // 嵌入页面列表
  settingsLock: { enabled: boolean; pin: string } // 设置锁定（启用与否 + PIN 码）
  isAfhLocked: boolean // 是否锁定 AFH
  securityModes: SecurityMode[] // 安防模式列表
  securityModeLinks: Record<string, string> // 安防模式链接映射
  profileHomeMode: { autoActivate: boolean; onSwitch: string } // 个人回家模式（自动激活 + 切换动作）
  securityEmergency: SecurityEmergencyConfig // 安防紧急配置
  earthquakeConfig?: EarthquakeConfig // 地震预警配置
  /** 智能管家 LLM 配置（存于 layout，后端 AgentConfigService 读取） */
  agentConfig?: AgentConfig
  /** 消息通道配置（Email / WebPush，存于 layout，Channels 模块读取） */
  channelConfig?: ChannelConfig
  /** 房间温湿度传感器映射（供管家快查询） */
  mobileRoomStats?: Record<string, { temp?: string; humidity?: string }>
  /**
   * 远程访问地址（公网 / DDNS 入口，如 https://home.example.com）。
   * 用于跨端同步：下发给原生端与已配对终端，便于外网漫游时直接取回入口。
   */
  externalUrl?: string
}

/** 智能管家大模型配置 */
export interface AgentConfig {
  provider: string // 模型供应商
  apiKey: string // API Key（GET 时为脱敏占位符）
  apiBase: string // API 基础地址
  model: string // 模型名
  language: string // 语言
  systemPrompt?: string // 系统提示词
  /** 服务端标注：是否已配置可用 Key（脱敏后仍可判断） */
  apiKeyConfigured?: boolean
  /** MCP 网关密钥（GET 脱敏；可用 env MCP_GATEWAY_SECRET 替代） */
  mcpGatewaySecret?: string
  /** MCP 网关绑定的 HomeOS 用户 ID（控制类工具走该用户 ACL） */
  mcpActorUserId?: string
  /**
   * HA 场景 / 脚本的语音控制允许清单（默认全禁）。
   * `scene.*` / `script.*` 内部动作无法静态审计，只有显式启用并逐个勾选后才允许语音触发。
   */
  sceneVoiceControl?: SceneVoiceControl
}

/** HA 场景 / 脚本语音控制允许清单 */
export interface SceneVoiceControl {
  /** 是否启用场景语音控制总开关 */
  enabled: boolean
  /** 允许语音触发的实体 ID 白名单（scene.* / script.*） */
  allow: string[]
}

/** Email 消息通道 */
interface EmailChannelConfig {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  fromAddress: string
  toAddresses: string
  tlsEnabled: boolean
}

/** WebPush 消息通道 */
interface WebPushChannelConfig {
  enabled: boolean
  vapidPublicKey: string
  vapidPrivateKey: string
  subject: string
}

/** 企业微信应用通道 */
interface WecomChannelConfig {
  enabled: boolean
  corpId: string
  corpSecret: string
  agentId: string | number
  callbackToken: string
  callbackAesKey: string
  apiProxy?: string
  allowedUsers?: string
  /** 绑定的 HomeOS 用户 ID；未配置则渠道控制被 ACL 拒绝 */
  boundHomeOsUserId?: string
}

/** 消息通道配置 */
export interface ChannelConfig {
  email?: EmailChannelConfig
  webpush?: WebPushChannelConfig
  wecom?: WecomChannelConfig
}