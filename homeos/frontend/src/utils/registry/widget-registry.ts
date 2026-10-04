/**
 * 微件注册表：Vue 组件挂载入口
 *
 * 职责：
 * - 在 widget-registry-meta 元数据基础上挂载各微件类型对应的 Vue 组件，
 *   供侧边栏 / 浮动面板 / 楼层 widget 按 type 解析渲染。
 * - 高频默认微件采用 lazyComponent 静态分包，避免主包膨胀。
 *
 * 依赖：
 * - @/utils/core/lazy-component 的 lazyComponent（按需分包工厂）。
 * - ./widget-registry-meta 的 canonicalizeWidgetType / WIDGET_REGISTRY_META。
 * - vue 的 Component 类型。
 *
 * 注意：微件 type key（clock / weather / ...）为配置 key，不翻译。
 */
import { lazyComponent } from '@/utils/core/lazy-component'
import type { Component } from 'vue'
import { canonicalizeWidgetType, WIDGET_REGISTRY_META } from './widget-registry-meta'

const ClockWidget = lazyComponent(() => import('@/components/widgets/system/ClockWidget.vue'))
const WeatherHubPanel = lazyComponent(() => import('@/components/widgets/weather/HubPanel.vue'))
const QuickActionsCard = lazyComponent(() => import('@/components/widgets/QuickActionsCard.vue'))
const MediaMiniWidget = lazyComponent(() => import('@/components/widgets/media/MiniWidget.vue'))
const HomeClimateChartWidget = lazyComponent(
  () => import('@/components/widgets/climate/HomeClimateChartWidget.vue'),
)
const SecurityPanelWidget = lazyComponent(
  () => import('@/components/widgets/security/PanelWidget.vue'),
)

const WIDGET_COMPONENTS: Record<string, Component> = {
  clock: ClockWidget,
  weather: WeatherHubPanel,
  homeClimateChart: HomeClimateChartWidget,
  quickActions: QuickActionsCard,
  mediaMini: MediaMiniWidget,
  securityPanel: SecurityPanelWidget,
}

const WIDGET_REGISTRY: Record<string, { component?: Component; [key: string]: unknown }> =
  Object.fromEntries(
    Object.entries(WIDGET_REGISTRY_META).map(([type, meta]) => [
      type,
      { ...meta, component: WIDGET_COMPONENTS[type] },
    ]),
  )

export {
  FLOATING_HUB_WIDTH_MAP,
  getSidebarWidgetClass,
  isFloatingPanelType,
} from './widget-registry-meta'

/** 侧栏 / 仪表板动态组件 */
export function getWidgetComponent(type: string) {
  return WIDGET_REGISTRY[canonicalizeWidgetType(type)]?.component ?? null
}

/** 浮动组件 面板型组件（支持 async 覆盖） */
export function getFloatingPanelComponent(type: string) {
  const def = WIDGET_REGISTRY[canonicalizeWidgetType(type)]
  if (def?.floatingMode === 'panel') {
    return def.floatingComponent || def.component || null
  }
  return null
}

export function getFloatingPanelProps(widget: { type?: string; config?: Record<string, unknown> }) {
  const type = canonicalizeWidgetType(widget?.type ?? '')
  const fn = WIDGET_REGISTRY[type]?.floatingProps as
    | ((w: typeof widget) => Record<string, unknown>)
    | undefined
  if (fn) return fn(widget)
  const config = widget?.config
  if (config) {
    const out: Record<string, unknown> = { config }
    if (config.defaultTab) out.defaultTab = config.defaultTab
    return out
  }
  return {}
}

/** 仪表板 / 侧栏 widget 默认 props */
export function getWidgetProps(type: string, widget: { config?: Record<string, unknown> }) {
  const fn = WIDGET_REGISTRY[canonicalizeWidgetType(type)]?.widgetProps as
    | ((w: typeof widget) => Record<string, unknown>)
    | undefined
  if (fn) return fn(widget)
  const config = widget?.config
  if (config) {
    const out: Record<string, unknown> = { config }
    if (config.defaultTab) out.defaultTab = config.defaultTab
    return out
  }
  return {}
}
