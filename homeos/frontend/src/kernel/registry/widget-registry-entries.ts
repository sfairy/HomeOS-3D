/** 微件注册表条目与类型标签 */
import { Clock, Cloud, Music, ShieldCheck, Thermometer, Wrench, Zap } from '@lucide/vue'
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
  clock: '数字时钟与日期',
  entity: '通用实体卡片',
  homeClimateChart: '全屋温湿度',
  mediaMini: '多媒体迷你控制器',
  quickActions: '常用设备快捷组',
  securityPanel: '全屋安防面板',
  weather: '天气中心',
}

/** WIDGET_REGISTRY_META：对象常量，字段 / 方法语义见定义处。 */
export const WIDGET_REGISTRY_META: Record<string, WidgetRegistryMetaEntry> = {
  clock: {
    name: '数字时钟与日期',
    icon: Clock,
    surfaces: ['sidebar'],
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
  mediaMini: {
    name: '多媒体中心',
    icon: Music,
    surfaces: ['sidebar'],
    sidebarClass: 'widget-fixed widget-fixed--mediaMini',
    widgetProps: () => ({ compact: true }),
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
}
