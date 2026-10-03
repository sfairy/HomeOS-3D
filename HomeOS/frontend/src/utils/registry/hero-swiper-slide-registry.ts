/**
 * 顶栏 Hero Swiper 轮播幻灯片注册表
 *
 * 职责：
 * - 维护顶栏 Hero Swiper 可选幻灯片分组与选项（天气 / 执行历史 / 自动化分析 /
 *   联动健康 / 建议 / HA 同步 / 场景 / 多媒体 / 安防 / 能源 / 户型 / 时钟 / 顾问 等）。
 * - 维护幻灯片懒加载组件映射（按需分包）。
 * - 提供分组查询、组件解析、可用幻灯片列表生成等工具。
 *
 * 依赖：
 * - vue 的 defineAsyncComponent / Component。
 * - @/utils/registry/hub-tabs-options 的 Hub Tab 集。
 * - @/utils/registry/widget-registry-meta 与 widget-registry 的微件目录与组件解析。
 *
 * 注意：
 * - `id`（weatherForecast / ...）为幻灯片配置 key，不翻译。
 * - 仅面向用户的 label 使用简体中文。
 */
import { defineAsyncComponent, type Component } from 'vue'
import {
  getDashboardWidgets,
  getSidebarWidgets,
  getWidgetName,
  canonicalizeWidgetType,
} from '@/utils/registry/widget-registry-meta'
import { getWidgetComponent } from '@/utils/registry/widget-registry'

interface HeroSwiperSlideOption {
  id: string
  label: string
}

/** HeroSwiperSlideGroup：类型定义，字段语义见声明。 */
export interface HeroSwiperSlideGroup {
  id: string
  label: string
  options: HeroSwiperSlideOption[]
}

/** 懒加载组件映射（按需分包） */
const HERO_SWIPER_COMPONENTS: Record<string, Component> = {
  weatherForecast: defineAsyncComponent(
    () => import('@/components/widgets/weather/Forecast.vue'),
  ),
  weatherCurrent: defineAsyncComponent(
    () => import('@/components/widgets/weather/Widget.vue'),
  ),
  weatherAlert: defineAsyncComponent(() => import('@/components/widgets/weather/Alert.vue')),
  sunInfo: defineAsyncComponent(() => import('@/components/widgets/weather/SunInfo.vue')),
  executionHistory: defineAsyncComponent(
    () => import('@/components/widgets/orchestrator/ExecutionHistoryPanel.vue'),
  ),
  automationAnalytics: defineAsyncComponent(
    () => import('@/components/widgets/orchestrator/AutomationAnalyticsPanel.vue'),
  ),
  linkageHealth: defineAsyncComponent(
    () => import('@/components/widgets/care/LinkageHealthPanel.vue'),
  ),
  recommendations: defineAsyncComponent(
    () => import('@/components/widgets/orchestrator/RecommendationsPanel.vue'),
  ),
  haSyncStatus: defineAsyncComponent(
    () => import('@/components/widgets/orchestrator/HaSyncStatusCard.vue'),
  ),
  sceneHub: defineAsyncComponent(
    () => import('@/components/widgets/orchestrator/SceneHubPanel.vue'),
  ),
  mediaScene: defineAsyncComponent(() => import('@/components/widgets/media/ScenePanel.vue')),
  energyDashboard: defineAsyncComponent(
    () => import('@/components/widgets/energy/Dashboard.vue'),
  ),
  energyInsight: defineAsyncComponent(
    () => import('@/components/widgets/energy/Insight.vue'),
  ),
  energyPricing: defineAsyncComponent(
    () => import('@/components/widgets/energy/PricingAlertPanel.vue'),
  ),
  waterStats: defineAsyncComponent(() => import('@/components/widgets/energy/WaterStatsPanel.vue')),
  energyBudget: defineAsyncComponent(
    () => import('@/components/widgets/energy/BudgetPanel.vue'),
  ),
  environmentHealth: defineAsyncComponent(
    () => import('@/components/widgets/climate/EnvironmentHealthPanel.vue'),
  ),
  comfortScore: defineAsyncComponent(() => import('@/components/widgets/climate/ComfortScore.vue')),
  envTrend: defineAsyncComponent(() => import('@/components/widgets/climate/EnvTrendPanel.vue')),
  climateCard: defineAsyncComponent(() => import('@/components/widgets/climate/Card.vue')),
  adaptiveClimate: defineAsyncComponent(
    () => import('@/components/widgets/climate/AdaptiveClimatePanel.vue'),
  ),
  climateTrend: defineAsyncComponent(
    () => import('@/components/widgets/climate/TrendPanel.vue'),
  ),
  circadianLighting: defineAsyncComponent(
    () => import('@/components/widgets/climate/CircadianLightingPanel.vue'),
  ),
  temperatureChart: defineAsyncComponent(
    () => import('@/components/widgets/climate/TemperatureChart.vue'),
  ),
  securityPanel: defineAsyncComponent(
    () => import('@/components/widgets/security/PanelWidget.vue'),
  ),
  sensorAlert: defineAsyncComponent(
    () => import('@/components/widgets/security/SensorAlertPanel.vue'),
  ),
  anomalyDetection: defineAsyncComponent(
    () => import('@/components/widgets/security/AnomalyDetectionPanel.vue'),
  ),
  lockManagement: defineAsyncComponent(
    () => import('@/components/widgets/security/LockManagementPanel.vue'),
  ),
  frigateEvents: defineAsyncComponent(
    () => import('@/components/widgets/security/FrigateEvents.vue'),
  ),
  awaySimulation: defineAsyncComponent(
    () => import('@/components/widgets/security/AwaySimulationPanel.vue'),
  ),
  deviceHealth: defineAsyncComponent(
    () => import('@/components/widgets/device/HealthPanel.vue'),
  ),
  deviceUsage: defineAsyncComponent(
    () => import('@/components/widgets/device/UsageHeatmap.vue'),
  ),
  systemMonitor: defineAsyncComponent(
    () => import('@/components/widgets/system/Monitor.vue'),
  ),
  careMonitor: defineAsyncComponent(() => import('@/components/widgets/care/MonitorPanel.vue')),
  childMode: defineAsyncComponent(() => import('@/components/widgets/care/ChildModePanel.vue')),
  guestAccess: defineAsyncComponent(() => import('@/components/widgets/care/GuestAccessPanel.vue')),
  calendar: defineAsyncComponent(() => import('@/components/widgets/system/CalendarWidget.vue')),
  voiceCommand: defineAsyncComponent(() => import('@/components/widgets/voice/Command.vue')),
  sceneScript: defineAsyncComponent(
    () => import('@/components/widgets/orchestrator/SceneScriptPanel.vue'),
  ),
  quickSimpleAutomation: defineAsyncComponent(
    () => import('@/components/widgets/orchestrator/QuickSimpleAutomationPanel.vue'),
  ),
  opsHub: defineAsyncComponent(() => import('@/components/widgets/system/OpsHubPanel.vue')),
}

/** 三合一中应使用完整 Hub 面板（含 Tab 栏）的 slide 类型 → 面板组件 */
const SmartHubPanel = defineAsyncComponent(
  () => import('@/components/widgets/orchestrator/SmartHubPanel.vue'),
)
const OpsHubPanel = defineAsyncComponent(
  () => import('@/components/widgets/system/OpsHubPanel.vue'),
)
const LockHubPanel = defineAsyncComponent(
  () => import('@/components/widgets/security/LockHubPanel.vue'),
)
const CareHubPanel = defineAsyncComponent(
  () => import('@/components/widgets/care/HubPanel.vue'),
)
const ScheduleHubPanel = defineAsyncComponent(
  () => import('@/components/widgets/system/ScheduleHubPanel.vue'),
)
const WeatherHubPanel = defineAsyncComponent(
  () => import('@/components/widgets/weather/HubPanel.vue'),
)
const MediaMiniWidget = defineAsyncComponent(
  () => import('@/components/widgets/media/MiniWidget.vue'),
)

const HERO_SWIPER_HUB_PANEL_COMPONENTS: Record<string, Component> = {
  smartAdvisor: SmartHubPanel,
  recommendations: SmartHubPanel,
  automationAnalytics: SmartHubPanel,
  linkageHealth: SmartHubPanel,
  deviceHealth: OpsHubPanel,
  deviceUsage: OpsHubPanel,
  systemMonitor: OpsHubPanel,
  haSyncStatus: OpsHubPanel,
  lockManagement: LockHubPanel,
  guestAccess: LockHubPanel,
  careMonitor: CareHubPanel,
  childMode: CareHubPanel,
  calendar: ScheduleHubPanel,
  voiceCommand: ScheduleHubPanel,
  sensorAlert: HERO_SWIPER_COMPONENTS.securityPanel,
  anomalyDetection: HERO_SWIPER_COMPONENTS.securityPanel,
  awaySimulation: HERO_SWIPER_COMPONENTS.securityPanel,
  frigateEvents: HERO_SWIPER_COMPONENTS.securityPanel,
  weatherForecast: WeatherHubPanel,
  weatherCurrent: WeatherHubPanel,
  weatherAlert: WeatherHubPanel,
  sunInfo: WeatherHubPanel,
  weather: WeatherHubPanel,
  energyInsight: HERO_SWIPER_COMPONENTS.energyDashboard,
  energyPricing: HERO_SWIPER_COMPONENTS.energyDashboard,
  waterStats: HERO_SWIPER_COMPONENTS.energyDashboard,
  energyBudget: HERO_SWIPER_COMPONENTS.energyDashboard,
  executionHistory: HERO_SWIPER_COMPONENTS.sceneHub,
  mediaScene: MediaMiniWidget,
  mediaMini: MediaMiniWidget,
  opsHub: OpsHubPanel,
  sceneScript: HERO_SWIPER_COMPONENTS.sceneScript,
}

/** slide 类型隐含的默认 Tab（映射到 Hub 面板时使用） */
const HERO_SWIPER_IMPLIED_DEFAULT_TAB: Record<string, string> = {
  recommendations: 'habits',
  automationAnalytics: 'analytics',
  linkageHealth: 'linkage',
  deviceHealth: 'health',
  deviceUsage: 'usage',
  systemMonitor: 'system',
  haSyncStatus: 'sync',
  lockManagement: 'locks',
  guestAccess: 'guest',
  careMonitor: 'monitor',
  childMode: 'child',
  calendar: 'schedule',
  voiceCommand: 'voice',
  sensorAlert: 'sensors',
  anomalyDetection: 'anomaly',
  awaySimulation: 'simulation',
  frigateEvents: 'frigate',
  weatherForecast: 'forecast',
  weatherCurrent: 'current',
  weatherAlert: 'alerts',
  sunInfo: 'sun',
  energyInsight: 'insight',
  energyPricing: 'pricing',
  waterStats: 'waterTrend',
  energyBudget: 'budget',
  executionHistory: 'history',
  mediaScene: 'scene',
  weather: 'current',
  mediaMini: 'player',
  opsHub: 'health',
  sceneScript: 'scene',
}

const HERO_SWIPER_HUB_PANEL_TYPES = new Set([
  ...Object.keys(HERO_SWIPER_HUB_PANEL_COMPONENTS),
  'switchGroup',
  'sceneHub',
  'homeEnvironment',
  'securityPanel',
  'energyDashboard',
  'smartAdvisor',
])

/** 侧栏 / 仪表板可实例化的面板微件（不含三合一容器自身） */
const HERO_SWIPER_EXCLUDED_PANEL_TYPES = new Set(['heroSwiper'])

function getPanelWidgetInstanceTypes(): string[] {
  const types = new Set<string>()
  for (const w of getSidebarWidgets()) types.add(w.type)
  for (const w of getDashboardWidgets()) types.add(w.type)
  types.delete('heroSwiper')
  return [...types].filter((t) => !HERO_SWIPER_EXCLUDED_PANEL_TYPES.has(t))
}

function buildPanelInstanceSlideGroup(): HeroSwiperSlideGroup {
  return {
    id: 'panel-instances',
    label: '面板微件实例',
    options: getPanelWidgetInstanceTypes().map((id) => ({
      id,
      label: getWidgetName(id),
    })),
  }
}

/** 分组目录（设置页展示） */
const HERO_SWIPER_DETAIL_SLIDE_GROUPS: HeroSwiperSlideGroup[] = [
  {
    id: 'weather',
    label: '天气',
    options: [
      { id: 'weatherForecast', label: '天气预报' },
      { id: 'weatherCurrent', label: '实时天气' },
      { id: 'weatherAlert', label: '天气预警' },
      { id: 'sunInfo', label: '日出日落' },
    ],
  },
  {
    id: 'device',
    label: '设备控制',
    options: [
      { id: 'switchGroup', label: '开关控制' },
      { id: 'coverGroup', label: '窗帘组' },
    ],
  },
  {
    id: 'scene',
    label: '场景与快捷',
    options: [
      { id: 'quickActions', label: '快捷操作' },
      { id: 'mediaScene', label: '影音场景' },
      { id: 'executionHistory', label: '执行历史' },
    ],
  },
  {
    id: 'smart',
    label: '智能与联动',
    options: [
      { id: 'systemTimeline', label: '系统事件流' },
      { id: 'smartAdvisor', label: '智能顾问' },
      { id: 'recommendations', label: '习惯推荐' },
      { id: 'automationAnalytics', label: '自动化分析' },
      { id: 'linkageHealth', label: '联动健康' },
      { id: 'haSyncStatus', label: 'HA 同步' },
    ],
  },
  {
    id: 'energy',
    label: '能源',
    options: [
      { id: 'energyInsight', label: '能耗洞察' },
      { id: 'energyPricing', label: '电价提醒' },
      { id: 'waterStats', label: '用水统计' },
      { id: 'energyBudget', label: '能耗预算' },
    ],
  },
  {
    id: 'climate',
    label: '环境与气候',
    options: [
      { id: 'homeEnvironment', label: '居家环境 Hub' },
      { id: 'environmentHealth', label: '环境健康' },
      { id: 'comfortScore', label: '舒适度' },
      { id: 'envTrend', label: '环境趋势' },
      { id: 'climateHub', label: '气候中心 Hub' },
      { id: 'climateCard', label: '温控卡片' },
      { id: 'climateTrend', label: '气候趋势' },
      { id: 'adaptiveClimate', label: '气候建议' },
      { id: 'temperatureChart', label: '温度曲线' },
      { id: 'homeClimateChart', label: '全屋温湿度' },
      { id: 'circadianLighting', label: '节律照明' },
    ],
  },
  {
    id: 'security',
    label: '安防',
    options: [
      { id: 'sensorAlert', label: '传感器告警' },
      { id: 'anomalyDetection', label: '异常检测' },
      { id: 'awaySimulation', label: '离家模拟' },
      { id: 'lockManagement', label: '门锁管理' },
      { id: 'frigateEvents', label: '摄像事件' },
    ],
  },
  {
    id: 'ops',
    label: '运维',
    options: [
      { id: 'deviceHealth', label: '设备健康' },
      { id: 'deviceUsage', label: '设备用量' },
      { id: 'systemMonitor', label: '系统监控' },
    ],
  },
  {
    id: 'care',
    label: '关爱',
    options: [
      { id: 'careMonitor', label: '看护监控' },
      { id: 'childMode', label: '儿童模式' },
      { id: 'guestAccess', label: '访客通行' },
    ],
  },
  {
    id: 'life',
    label: '日程与语音',
    options: [
      { id: 'calendar', label: '日历' },
      { id: 'voiceCommand', label: '语音指令' },
    ],
  },
  {
    id: 'custom',
    label: '自定义',
    options: [{ id: 'customHtml', label: '自定义 HTML' }],
  },
]

/** HERO_SWIPER_SLIDE_GROUPS：常量集合，成员语义见定义处。 */
export const HERO_SWIPER_SLIDE_GROUPS: HeroSwiperSlideGroup[] = [
  buildPanelInstanceSlideGroup(),
  ...HERO_SWIPER_DETAIL_SLIDE_GROUPS,
]

/** HERO_SWIPER_SLIDE_TYPE_OPTIONS：常量，取值语义见定义处。 */
export const HERO_SWIPER_SLIDE_TYPE_OPTIONS = HERO_SWIPER_SLIDE_GROUPS.flatMap((g) => g.options)

const VALID_TYPES = new Set([
  ...HERO_SWIPER_SLIDE_TYPE_OPTIONS.map((o) => o.id),
  ...getPanelWidgetInstanceTypes(),
])

/** normalizeHeroSlideType：函数，按签名入参返回处理结果。 */
export function normalizeHeroSlideType(type: string): string {
  return canonicalizeWidgetType(type)
}

const HERO_SWIPER_EXECUTION_PRESET_OPTIONS = [
  { id: 'scene', label: '场景' },
  { id: 'script', label: '脚本' },
  { id: 'automation', label: '自动化' },
]

/** getHeroSwiperPresetOptions：函数，按签名入参返回处理结果。 */
export function getHeroSwiperPresetOptions(type: string): { id: string; label: string }[] | null {
  if (normalizeHeroSlideType(type) === 'executionHistory')
    return HERO_SWIPER_EXECUTION_PRESET_OPTIONS
  return null
}

const SLIDE_DEFAULTS: Record<string, Record<string, unknown>> = {
  switchGroup: { defaultTab: 'features' },
  executionHistory: { preset: 'scene' },
  energyDashboard: { defaultTab: 'overview', floatingCompact: false },
  environmentHealth: { defaultTab: 'overview' },
  climateTrend: { defaultTab: 'multi' },
  homeEnvironment: { defaultTab: 'overview' },
  homeClimateChart: { defaultView: 'all' },
  climateHub: { defaultTab: 'control' },
  securityPanel: { defaultTab: 'arm' },
  customHtml: { rawHtml: '' },
  sceneHub: { defaultTab: 'scenes' },
  clock: {},
  weather: { defaultTab: 'current' },
  mediaMini: { defaultTab: 'player' },
  opsHub: { defaultTab: 'health' },
  sceneScript: { defaultTab: 'scene' },
  quickSimpleAutomation: {},
}

/** 三合一每页独立展示，不隐藏标题栏 */
function sanitizeHeroSlideConfig(config: Record<string, unknown>): Record<string, unknown> {
  return { ...config }
}

/** defaultHeroSlideConfig：函数，按签名入参返回处理结果。 */
export function defaultHeroSlideConfig(type: string): Record<string, unknown> {
  const t = normalizeHeroSlideType(type)
  return sanitizeHeroSlideConfig(SLIDE_DEFAULTS[t] || {})
}

/** buildHeroSwiperSlideProps：函数，按签名入参返回处理结果。 */
export function buildHeroSwiperSlideProps(type: string, slideConfig: Record<string, unknown> = {}) {
  const t = normalizeHeroSlideType(type)
  const typeDefaults = SLIDE_DEFAULTS[t] || {}
  const merged = sanitizeHeroSlideConfig({ ...typeDefaults, ...slideConfig })

  if (!merged.defaultTab && HERO_SWIPER_IMPLIED_DEFAULT_TAB[type]) {
    merged.defaultTab = HERO_SWIPER_IMPLIED_DEFAULT_TAB[type]
  }

  const props: Record<string, unknown> = { config: merged }

  if (merged.defaultTab != null && merged.defaultTab !== '') props.defaultTab = merged.defaultTab
  if (merged.floatingCompact != null) props.floatingCompact = merged.floatingCompact
  if (merged.preset != null && merged.preset !== '') props.preset = merged.preset

  if (HERO_SWIPER_HUB_PANEL_TYPES.has(type) || HERO_SWIPER_HUB_PANEL_TYPES.has(t)) {
    props.compact = false
  }

  return props
}

/** resolveHeroSwiperComponent：函数，按签名入参返回处理结果。 */
export function resolveHeroSwiperComponent(type: string): Component {
  const t = normalizeHeroSlideType(type)
  return (
    HERO_SWIPER_HUB_PANEL_COMPONENTS[t] ||
    HERO_SWIPER_COMPONENTS[t] ||
    getWidgetComponent(t) ||
    HERO_SWIPER_COMPONENTS.weatherForecast
  )
}

/** isValidHeroSlideType：函数，按签名入参返回处理结果。 */
export function isValidHeroSlideType(type: string): boolean {
  return VALID_TYPES.has(normalizeHeroSlideType(type))
}
