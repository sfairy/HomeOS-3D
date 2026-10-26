/** 微件注册表：Vue 组件挂载入口 */
import { lazyComponent } from '@/shared/utils/core/lazy-component'
import type { Component } from 'vue'
import { canonicalizeWidgetType, WIDGET_REGISTRY_META } from '@/shared/utils/registry/widget-registry-meta'

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

// 曾在此再导出 `FLOATING_HUB_WIDTH_MAP` / `getSidebarWidgetClass` / `isFloatingPanelType`：
// 三者的消费者（`components/shell/floating-hub/useFloatingHub`、`components/dashboard/RightSidebar.vue`、
// `shared/floorplan/utils/floating-hub-layout.util` …）**本来就直连**元数据模块
// `@/shared/utils/registry/widget-registry-meta`，这里只是多一条没人走的转发。
// 本文件按自己的职责只出「组件解析」入口。

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
