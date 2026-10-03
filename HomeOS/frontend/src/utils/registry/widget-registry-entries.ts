/**
 * 微件注册表条目与类型标签
 *
 * 职责：
 * - 维护各微件类型（Widget Type）的注册元数据（名称、图标、可用展示面、
 *   浮动模式、浮动宽度、侧边栏类名、分组、微件/浮动 props 工厂）。
 * - 维护微件类型 → 中文显示名映射（WIDGET_TYPE_LABELS）。
 * - 供微件目录、侧边栏、浮动面板按类型解析组件与配置。
 *
 * 依赖：
 * - @lucide/vue 图标组件。
 * - vue 的 Component 类型。
 *
 * 注意：
 * - 微件 type key（adaptiveClimate / clock / ...）为配置 key，不翻译。
 * - `surfaces` / `floatingMode` / `sidebarClass` / `group` 为配置值，不翻译。
 * - 仅面向用户的 name / 标签 value 使用简体中文。
 */
import {
  Clock,
  Cloud,
  Calendar,
  Thermometer,
  ThermometerSun,
  Wrench,
  Code,
  Music,
  Gauge,
  Flame,
  Lock,
  Wind,
  Zap,
  Layers,
  Battery,
  ShieldCheck,
  Droplets,
  HeartHandshake,
  Brain,
  Sparkles,
  Activity,
} from '@lucide/vue'
import type { Component } from 'vue'

interface WidgetRegistryMetaEntry {
  name: string
  icon: Component
  surfaces: string[]
  floatingMode?: string
  floatingWidth?: string
  sidebarClass?: string
  group?: string
  widgetProps?: (widget: { config?: Record<string, unknown> }) => Record<string, unknown>
  floatingProps?: (widget: { config?: Record<string, unknown> }) => Record<string, unknown>
}

/** WIDGET_TYPE_LABELS：对象常量，字段 / 方法语义见定义处。 */
export const WIDGET_TYPE_LABELS: Record<string, string> = {
  adaptiveClimate: '自适应温控',
  anomalyDetection: '异常活动监测',
  aqi: '空气质量指数',
  automationAnalytics: '自动化执行分析',
  awaySimulation: '离家模拟防盗',
  battery: '电池电量',
  scheduleHub: '日程中心',
  calendar: '今日日程',
  careHub: '关爱中心',
  careMonitor: '关爱看护面板',
  childMode: '儿童模式',
  circadianLighting: '昼夜节律照明',
  climateCard: '空调温控卡片',
  homeEnvironment: '居家环境',
  opsHub: '运维中心',
  sceneHub: '场景中心',
  climateHub: '气候中心',
  clock: '数字时钟与日期',
  coverGroup: '窗帘分组控制',
  customHtml: '纯代码客制',
  deviceHealth: '设备健康监控',
  deviceUsage: '设备使用分析',
  energyBudget: '能源预算',
  energyAnalytics: '能源分析',
  energyDashboard: '能源中心',
  entity: '通用实体卡片',
  envTrend: '环境趋势/季节提醒',
  environmentHealth: '环境健康总览',
  executionHistory: '执行历史',
  frigateEvents: 'Frigate 检测事件',
  'group.basic': '基础',
  'group.other': '其他',
  'group.panel': '智能面板',
  guestAccess: '访客临时密码',
  haSyncStatus: 'HA 同步状态',
  heroSwiper: '三合一滑动容器',
  humidity: '迷你湿度',
  linkageHealth: '联动健康',
  lockHub: '门锁中心',
  lockManagement: '门锁管理',
  mediaMini: '多媒体迷你控制器',
  mediaPlaylist: '播放列表',
  mediaScene: '影音场景联动',
  notificationCenter: '通知中心',
  power: '实时功耗',
  pricingAlert: '阶梯电价预警',
  quickActions: '常用设备快捷组',
  sceneHistory: '场景执行历史',
  sceneScript: '场景脚本控制面板',
  securityPanel: '全屋安防面板',
  sensorAlert: '安全传感器告警',
  sensorTrend: '传感器趋势图表',
  smartAdvisor: '智能中心',
  quickSimpleAutomation: '简易自动化',
  sunInfo: '日出日落+人员',
  switchGroup: '开关控制',
  systemMonitor: '系统资源监控',
  systemTimeline: '系统事件流',
  temp: '迷你温度',
  tempChart: '环境趋势',
  homeClimateChart: '全屋温湿度',
  voiceCommand: '语音命令',
  waterStats: '用水统计',
  weather: '天气中心',
  weatherAlert: '天气预警',
  weatherForecast: '气象趋势预报',
}

/** WIDGET_REGISTRY_META：对象常量，字段 / 方法语义见定义处。 */
export const WIDGET_REGISTRY_META: Record<string, WidgetRegistryMetaEntry> = {
  clock: {
    name: '数字时钟与日期',
    icon: Clock,
    surfaces: ['sidebar', 'floatingBasic'],
    floatingMode: 'inline',
    sidebarClass: 'widget-fixed widget-fixed--clock',
  },
  weather: {
    name: '天气中心',
    icon: Cloud,
    surfaces: ['sidebar'],
    sidebarClass: 'widget-fixed widget-fixed--weather',
    widgetProps: (widget: { config?: { defaultTab?: string } }) => ({
      defaultTab: widget.config?.defaultTab || 'current',
      config: widget.config,
    }),
  },
  homeEnvironment: {
    name: '居家环境',
    icon: Gauge,
    surfaces: ['floating'],
    floatingMode: 'panel',
    floatingWidth: '300px',
    floatingProps: (widget: {
      config?: { defaultTab?: string; healthTab?: string }
    }) => ({
      defaultTab: widget.config?.defaultTab || 'overview',
      config: widget.config,
    }),
  },
  climateHub: {
    name: '气候中心',
    icon: ThermometerSun,
    surfaces: ['floating'],
    floatingMode: 'panel',
    floatingWidth: '300px',
    floatingProps: (widget: { config?: { defaultTab?: string; sensorIds?: string } }) => ({
      defaultTab: widget.config?.defaultTab || 'control',
      config: widget.config,
    }),
  },
  homeClimateChart: {
    name: '全屋温湿度',
    icon: Thermometer,
    surfaces: ['sidebar'],
    sidebarClass: 'widget-elastic widget-elastic--homeClimateChart',
    widgetProps: (widget: { config?: Record<string, unknown> }) => ({ config: widget.config }),
  },
  quickActions: {
    name: '常用设备快捷组',
    icon: Wrench,
    surfaces: ['sidebar'],
    sidebarClass: 'widget-fixed widget-fixed--quickActions',
  },
  customHtml: {
    name: '纯代码客制',
    icon: Code,
    surfaces: ['sidebar', 'floatingBasic', 'hero'],
    floatingMode: 'inline',
    group: '基础',
    sidebarClass: 'widget-elastic widget-elastic--customHtml',
    widgetProps: (widget: { id?: string; config?: Record<string, unknown> }) => ({
      config: widget.config,
      id: widget.id,
    }),
  },
  scheduleHub: {
    name: '日程中心',
    icon: Calendar,
    surfaces: ['floating'],
    floatingMode: 'panel',
    floatingWidth: '300px',
    floatingProps: (widget: { config?: { defaultTab?: string } }) => ({
      defaultTab: widget.config?.defaultTab || 'schedule',
      config: widget.config,
    }),
  },
  mediaMini: {
    name: '多媒体中心',
    icon: Music,
    surfaces: ['sidebar'],
    sidebarClass: 'widget-fixed widget-fixed--mediaMini',
    widgetProps: () => ({ compact: true }),
  },
  lockHub: {
    name: '门锁中心',
    icon: Lock,
    surfaces: ['floating'],
    floatingMode: 'panel',
    floatingWidth: '260px',
    floatingProps: (widget: { config?: { defaultTab?: string } }) => ({
      defaultTab: widget.config?.defaultTab || 'locks',
      config: widget.config,
    }),
  },
  coverGroup: {
    name: '窗帘分组控制',
    icon: Wind,
    surfaces: [],
  },
  switchGroup: {
    name: '开关控制',
    icon: Zap,
    surfaces: ['sidebar'],
    sidebarClass: 'widget-elastic widget-elastic--switchGroup',
  },
  careHub: {
    name: '关爱中心',
    icon: HeartHandshake,
    surfaces: ['floating'],
    floatingMode: 'panel',
    floatingWidth: '280px',
    floatingProps: (widget: { config?: { defaultTab?: string } }) => ({
      defaultTab: widget.config?.defaultTab || 'monitor',
      config: widget.config,
    }),
  },
  smartAdvisor: {
    name: '智能中心',
    icon: Brain,
    surfaces: ['floating'],
    floatingMode: 'panel',
    floatingWidth: '280px',
    floatingProps: (widget: { config?: { defaultTab?: string } }) => ({
      defaultTab: widget.config?.defaultTab || 'advisor',
      config: widget.config,
    }),
  },
  systemTimeline: {
    name: '系统事件流',
    icon: Activity,
    surfaces: ['sidebar'],
    sidebarClass: 'widget-elastic widget-elastic--systemTimeline',
  },
  sceneHub: {
    name: '场景中心',
    icon: Sparkles,
    surfaces: [],
  },
  heroSwiper: {
    name: '三合一滑动容器',
    icon: Layers,
    surfaces: ['sidebar'],
    sidebarClass: 'widget-elastic widget-elastic--heroSwiper',
  },
  energyDashboard: {
    name: '能源中心',
    icon: Zap,
    surfaces: ['floating'],
    floatingMode: 'panel',
    floatingWidth: '300px',
    floatingProps: (widget: { config?: { defaultTab?: string } }) => ({
      defaultTab: widget.config?.defaultTab || 'overview',
      floatingCompact: false,
      config: widget.config,
    }),
  },
  securityPanel: {
    name: '全屋安防面板',
    icon: ShieldCheck,
    surfaces: ['floating'],
    floatingMode: 'panel',
    floatingWidth: '290px',
    floatingProps: (widget: { config?: { zones?: unknown[]; defaultTab?: string } }) => ({
      zones: widget.config?.zones || [],
      defaultTab: widget.config?.defaultTab || 'arm',
      config: widget.config,
    }),
  },
  entity: {
    name: '通用实体卡片',
    icon: Zap,
    surfaces: ['floatingBasic'],
    floatingMode: 'inline',
    group: '基础',
  },
  temp: {
    name: '迷你温度',
    icon: Thermometer,
    surfaces: ['floatingBasic'],
    floatingMode: 'inline',
    group: '基础',
  },
  humidity: {
    name: '迷你湿度',
    icon: Droplets,
    surfaces: ['floatingBasic'],
    floatingMode: 'inline',
    group: '基础',
  },
  aqi: {
    name: '空气质量指数',
    icon: Wind,
    surfaces: ['floatingBasic'],
    floatingMode: 'inline',
    group: '基础',
  },
  battery: {
    name: '电池电量',
    icon: Battery,
    surfaces: ['floatingBasic'],
    floatingMode: 'inline',
    group: '基础',
  },
  power: {
    name: '实时功耗',
    icon: Flame,
    surfaces: ['floatingBasic'],
    floatingMode: 'inline',
    group: '基础',
  },
}
