/**
 * ECharts 调色板与图表主题原语。
 *
 * ECharts 使用 canvas 绘制，无法解析 CSS var()；本模块在每次构建 option 时从
 * canonical 设计令牌（design-tokens.css）读取实际颜色，读不到时退回同值常量。
 * 全站图表只允许使用这里的 6 色数据序列，不再逐文件写粉/青/绿。
 */

const FALLBACK = {
  accent: '#ffc46a',
  accentStrong: '#ffd9a0',
  accentDeep: '#e09523',
  info: '#59d3c0',
  success: '#3ddc97',
  warning: '#ffb020',
  danger: '#ff5a5f',
  fg1: '#f2f5f8',
  fg2: '#a7b4c2',
  fg3: '#6f7f90',
  bgElev1: '#0d131b',
  line2: 'rgba(255,255,255,0.10)',
} as const

let cached: ChartPalette | null = null

export interface ChartPalette {
  accent: string
  accentStrong: string
  accentDeep: string
  info: string
  success: string
  warning: string
  danger: string
  fg1: string
  fg2: string
  fg3: string
  bgElev1: string
  line2: string
  /** 图表数据序列：铜 / 青绿 / 绿 / 琥珀 / 红 / 中性 */
  series: [string, string, string, string, string, string]
  /** 多序列时循环取色 */
  colorAt: (index: number) => string
}

function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/** 读取并缓存当前主题的图表调色板；主题切换后调用 resetChartPalette。 */
export function getChartPalette(): ChartPalette {
  if (cached) return cached
  const accent = readToken('--hos-color-accent', FALLBACK.accent)
  const info = readToken('--hos-color-info', FALLBACK.info)
  const success = readToken('--hos-color-success', FALLBACK.success)
  const warning = readToken('--hos-color-warning', FALLBACK.warning)
  const danger = readToken('--hos-color-danger', FALLBACK.danger)
  const neutral = readToken('--hos-fg-2', FALLBACK.fg2)
  const series: ChartPalette['series'] = [accent, info, success, warning, danger, neutral]
  cached = {
    accent,
    accentStrong: readToken('--hos-color-accent-strong', FALLBACK.accentStrong),
    accentDeep: readToken('--hos-color-accent-deep', FALLBACK.accentDeep),
    info,
    success,
    warning,
    danger,
    fg1: readToken('--hos-fg-1', FALLBACK.fg1),
    fg2: neutral,
    fg3: readToken('--hos-fg-3', FALLBACK.fg3),
    bgElev1: readToken('--hos-bg-elev-1', FALLBACK.bgElev1),
    line2: readToken('--hos-line-2', FALLBACK.line2),
    series,
    colorAt: (index: number) => series[((index % series.length) + series.length) % series.length],
  }
  return cached
}

/** 主题变化或 HMR 后重新读取令牌。 */
export function resetChartPalette(): void {
  cached = null
}

/** 统一 tooltip：深底、暖铜描边、正文色文字。 */
export function chartTooltip(palette = getChartPalette()) {
  return {
    backgroundColor: 'rgba(13, 19, 27, 0.96)',
    borderColor: `${palette.accent}52`,
    borderWidth: 1,
    padding: [8, 12] as [number, number],
    extraCssText:
      'border-radius: 10px; backdrop-filter: blur(16px); box-shadow: 0 8px 28px rgba(0,0,0,0.38);',
    textStyle: { color: palette.fg1, fontSize: 12, fontWeight: 600 },
  }
}

/** 统一轴标签：11px 起，弱化但可读。 */
export function chartAxisLabel(palette = getChartPalette()) {
  return { color: palette.fg2, fontSize: 11 }
}

/** 统一柱状渐变：顶部实色、底部半透明。 */
export function chartBarGradient(color: string) {
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color },
      { offset: 1, color: `${color}66` },
    ],
  }
}
