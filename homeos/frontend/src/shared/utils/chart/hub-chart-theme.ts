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
  security: '#ff5a5f',           // 安防 Hub accent（危险珊瑚）
  securitySub: '#ffb020',        // 安防 Hub 次色（警示琥珀）
  securitySoft: 'rgba(255, 90, 95, 0.28)', // 安防 Hub 半透明色
  homeMode: '#ffc46a',           // 在家模式 Hub accent（暖铜）
  homeModeSub: '#e09523',        // 在家模式 Hub 次色（深铜）
  homeModeSoft: 'rgba(255, 196, 106, 0.28)',  // 在家模式半透明色
  life: '#59d3c0',               // 生活 Hub accent（信息青）
  lifeSub: '#3ddc97',            // 生活 Hub 次色（健康绿）
  devices: '#ffc46a',            // 设备 Hub accent（暖铜）
  devicesSub: '#ffd9a0',         // 设备 Hub 次色（亮铜）
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