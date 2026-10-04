/**
 * 客户端电量展示工具
 *
 * 职责：从客户端 systemInfo 解析电量百分比；按电量区间生成三段渐变色谱；
 *   提供进度条 / 标签的内联样式与 CSS 类名，供墙屏充电卡等组件使用。
 * 依赖：client-system-display.util（从 row 提取 systemInfo）。
 */
import { getSystemInfoFromClientRow } from '@/utils/client/system-display.util'

/**
 * 终端电量百分比（0–100）。
 *
 * @param row 客户端行数据（含 systemInfo 或直接 level）
 * @returns 电量百分比整数；无数据或非有限值返回 null
 */
export function normalizeBatteryPercent(
  row: { systemInfo?: unknown; level?: number } | null | undefined,
): number | null {
  if (!row) return null
  const info = getSystemInfoFromClientRow(row) as { battery?: { level?: number } } | null
  const level = info?.battery?.level
  if (level == null || !Number.isFinite(level)) return null
  // 采集与后端均已统一为 0–100 百分比，无需再按 `<= 1` 启发式换算
  return Math.round(level)
}

/**
 * 按电量返回三段渐变色 [深 → 中 → 亮]。
 *
 * @param pct 电量百分比（0–100，会被夹取）
 * @param charging 是否充电中（充电时末段色切换为蓝 / 青）
 * @returns 三段色值数组 [深色, 中色, 亮色]
 */
function batteryBarPalette(pct: number, charging = false): [string, string, string] {
  const p = Math.max(0, Math.min(100, pct))
  let stops: [string, string, string]

  if (p <= 15) stops = ['#991b1b', '#dc2626', '#fb923c']
  else if (p <= 30) stops = ['#c2410c', '#ea580c', '#fbbf24']
  else if (p <= 45) stops = ['#b45309', '#f59e0b', '#fde047']
  else if (p <= 60) stops = ['#a16207', '#eab308', '#a3e635']
  else if (p <= 75) stops = ['#15803d', '#22c55e', '#4ade80']
  else if (p <= 90) stops = ['#047857', '#10b981', '#6ee7b7']
  else stops = ['#065f46', '#059669', '#34d399']

  if (charging) {
    stops = [stops[0], stops[1], p <= 45 ? '#38bdf8' : '#2dd4bf']
  }
  return stops
}

/**
 * 生成电量进度条的内联样式（三段渐变 + 多层光晕）。
 *
 * @param pct 电量百分比；null 时返回空对象（无样式）
 * @param charging 是否充电中
 * @returns CSS 属性对象（background / boxShadow）
 */
export function batteryBarStyle(pct: number | null, charging = false): Record<string, string> {
  if (pct == null) return {}
  const [c1, c2, c3] = batteryBarPalette(pct, charging)
  // 低电量 / 高电量时光晕更强，中间段较弱
  const glowStrength = pct <= 20 ? 0.48 : pct >= 75 ? 0.4 : 0.34
  return {
    background: `linear-gradient(90deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`,
    boxShadow: `0 0 18px color-mix(in srgb, ${c2} ${Math.round(glowStrength * 100)}%, transparent), 0 0 6px color-mix(in srgb, ${c3} 28%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.28)`,
  }
}

/**
 * 生成电量百分比标签的内联样式（颜色 + 字重 + 文本光晕）。
 *
 * @param pct 电量百分比；null 时返回空对象
 * @param charging 是否充电中
 * @returns CSS 属性对象（color / fontWeight / textShadow）
 */
export function batteryLabelStyle(pct: number | null, charging = false): Record<string, string> {
  if (pct == null) return {}
  const [, c2, c3] = batteryBarPalette(pct, charging)
  return {
    color: c3,
    fontWeight: pct <= 20 || pct >= 80 ? '700' : '600',
    textShadow: `0 0 12px color-mix(in srgb, ${c2} 50%, transparent)`,
  }
}

/**
 * 按电量返回进度条 CSS 类名（用于动画 / 状态样式）。
 *
 * @param pct 电量百分比；null 返回 unknown 类
 * @param low 低电量阈值（默认 20）
 * @param high 满电阈值（默认 80）
 * @returns CSS 类名字符串（charge-battery__fill--{unknown|low|mid|full}）
 */
export function batteryBarClass(pct: number | null, low?: number, high?: number): string {
  if (pct == null) return 'charge-battery__fill--unknown'
  if (pct < (low ?? 20)) return 'charge-battery__fill--low'
  if (pct >= (high ?? 80)) return 'charge-battery__fill--full'
  return 'charge-battery__fill--mid'
}