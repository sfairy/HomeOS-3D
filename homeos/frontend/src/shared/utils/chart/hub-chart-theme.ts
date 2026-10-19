/** 各独立 Hub（安防 / 模式日志 / 生活 / 设备）共用的 ECharts 主题。 */
import type { EChartsCoreOption } from 'echarts/core'
import {
  DEVICE_CHART_COLORS,
  deviceChartBase,
  deviceChartGrid,
  deviceChartTooltip,
  devicePieTooltip,
} from '@/shared/utils/chart/device-chart-theme'

/** Hub 图表配色（继承设备页配色 + 各 Hub accent 色） */
export const HUB_CHART_COLORS = {
  ...DEVICE_CHART_COLORS,
  security: '#fb7185',           // 安防 Hub accent
  securitySub: '#f59e0b',        // 安防 Hub 次色
  securitySoft: 'rgba(251, 113, 133, 0.35)', // 安防 Hub 半透明色
  homeMode: '#fbbf24',           // 在家模式 Hub accent
  homeModeSub: '#fb7185',        // 在家模式 Hub 次色
  homeModeSoft: 'rgba(251, 191, 36, 0.35)',  // 在家模式半透明色
  life: '#2dd4bf',               // 生活 Hub accent
  lifeSub: '#fbbf24',            // 生活 Hub 次色
  devices: '#38bdf8',            // 设备 Hub accent
  devicesSub: '#22d3ee',         // 设备 Hub 次色
}

/** Hub accent 类型枚举 */
type HubChartAccent = 'security' | 'home-mode' | 'life' | 'devices' | 'default'

/** accent 类型 → 十六进制色值映射 */
const ACCENT_HEX: Record<HubChartAccent, string> = {
  security: HUB_CHART_COLORS.security,
  'home-mode': HUB_CHART_COLORS.homeMode,
  life: HUB_CHART_COLORS.life,
  devices: HUB_CHART_COLORS.devices,
  default: HUB_CHART_COLORS.accent,
}

/**
 * 返回指定 accent 类型的十六进制色值。
 * @param accent accent 类型（默认 'default'）
 * @returns 十六进制色值字符串
 */
export function hubAccentColor(accent: HubChartAccent = 'default'): string {
  return ACCENT_HEX[accent] ?? ACCENT_HEX.default
}

/** Hub 通用坐标轴 tooltip（透传 deviceChartTooltip） */
export function hubChartTooltip() {
  return deviceChartTooltip()
}

/** Hub 饼图 tooltip（透传 devicePieTooltip） */
export function hubPieTooltip() {
  return devicePieTooltip()
}

/** Hub 网格配置（透传 deviceChartGrid） */
export function hubChartGrid(options?: { top?: number }) {
  return deviceChartGrid(options)
}

/** Hub 图表基础配置（透传 deviceChartBase） */
export function hubChartBase(): EChartsCoreOption {
  return deviceChartBase()
}