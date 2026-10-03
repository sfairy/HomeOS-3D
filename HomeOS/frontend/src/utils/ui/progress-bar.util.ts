/**
 * 进度条 / 滑块样式统一入口
 *
 * 职责：
 * - 转发 progress-bar-gradient.util（渐变色 / 阈值选色 / 滑块归一化等）与
 *   progress-bar-color-temp.util（色温换算）的对外能力。
 * - 提供 input[type=range] 滑块轨道与拇指的内联样式工厂（sliderTrackStyle），
 *   统一 WebKit / Firefox / 标准 spec 三套伪元素样式。
 *
 * 依赖：./progress-bar-gradient.util、./progress-bar-color-temp.util。
 *
 * 注意：variant key（accent / success / warn ...）与 CSS 伪元素名
 *   （::-webkit-slider-thumb 等）为配置 / CSS 标识符，不翻译。
 */
import {
  THRESHOLD_VARIANTS,
  normalizeProgressPct,
  resolveSliderValue,
  snapToSliderStep,
  resolveProgressGradient,
  progressGradientCss,
  budgetVariantFromPct,
  balanceVariantFromAmount,
  resourceVariantFromPct,
  formatProgressPct,
} from './progress-bar-gradient.util'
export * from './progress-bar-gradient.util'
export * from './progress-bar-color-temp.util'

/** 滑块轨道样式参数：含值域、variant、自定义起止色等 */
type SliderTrackStyleOpts = {
  value: number | null | undefined
  min?: number
  max?: number
  step?: number
  variant?: string
  color?: string
  colorEnd?: string
  trackColor?: string
  colorValue?: number
}

/**
 * 滑块轨道样式（input[type=range]）：返回可直接展开到 style 的对象，
 * 同时覆盖 WebKit / Firefox / 标准 spec 三套伪元素。
 *
 * @param opts 滑块配置（值域、variant、自定义颜色等）
 * @returns 内联 style 对象
 */
export function sliderTrackStyle({
  value,
  min = 0,
  max = 100,
  step,
  variant = 'accent',
  color,
  colorEnd,
  trackColor = 'var(--premium-border-strong)',
  colorValue,
}: SliderTrackStyleOpts) {
  let v = resolveSliderValue(value, min)
  if (step != null && step > 0) {
    v = snapToSliderStep(v, min, max, step)
  }
  const pct = normalizeProgressPct(v, min, max)
  const colorSource = THRESHOLD_VARIANTS.has(variant) ? (colorValue ?? v) : v
  const grad = resolveProgressGradient(variant, colorSource, { color, colorEnd })
  const { from, to } = grad
  const pctStr = formatProgressPct(pct)
  return {
    '--progress': pctStr,
    '--progress-pct': pctStr,
    '--range-progress': pctStr,
    '--accent': from,
    '--accent-from': from,
    '--accent-to': to,
    '--track-fill-from': from,
    '--track-fill-to': to,
    '--track-bg': trackColor,
  }
}

type ProgressFillStyleOpts = {
  value: number | null | undefined
  min?: number
  max?: number
  variant?: string
  color?: string
  colorEnd?: string
  glow?: boolean
  colorValue?: number
  autoGlow?: boolean
}

/**
 * 进度条填充层样式（div）
 * @param {{ value: number, min?: number, max?: number, variant?: string, color?: string, colorEnd?: string, glow?: boolean, colorValue?: number, autoGlow?: boolean }} opts
 */
export function progressFillStyle({
  value,
  min = 0,
  max = 100,
  variant = 'accent',
  color,
  colorEnd,
  glow = false,
  colorValue,
  autoGlow = false,
}: ProgressFillStyleOpts) {
  const v = resolveSliderValue(value, min)
  const pct = normalizeProgressPct(v, min, max)
  const colorSource = THRESHOLD_VARIANTS.has(variant) ? (colorValue ?? v) : v
  const grad = resolveProgressGradient(variant, colorSource, { color, colorEnd })
  const style: Record<string, string> = {
    width: '100%',
    '--progress-scale': `${pct / 100}`,
    background: progressGradientCss(grad),
  }
  let resolvedKey = variant
  if (variant === 'budget' || variant === 'threshold')
    resolvedKey = budgetVariantFromPct(colorSource)
  else if (variant === 'balance') resolvedKey = balanceVariantFromAmount(Number(colorSource) || 0)
  else if (variant === 'resource') resolvedKey = resourceVariantFromPct(colorSource)
  const shouldGlow = glow || (autoGlow && (resolvedKey === 'warn' || resolvedKey === 'danger'))
  if (shouldGlow && grad.glow) {
    style.boxShadow = `0 0 6px ${grad.glow}`
  }
  return style
}

/**
 * 预算百分比：文字色 + 填充渐变
 * @param {number|null|undefined} pct
 */
export function budgetPctColors(pct: number | null | undefined) {
  const variant = budgetVariantFromPct(pct)
  const grad = resolveProgressGradient(variant, pct)
  return {
    variant,
    textColor: grad.from,
    fillStyle: progressFillStyle({
      value: pct ?? 0,
      variant,
      colorValue: pct ?? undefined,
      autoGlow: variant !== 'success',
    }),
  }
}

/**
 * Builder 滑块轨道样式（处理 null/NaN，避免进度条显示异常）
 * @param {number|null|undefined} value
 * @param {number} min
 * @param {number} max
 * @param {string} [color]
 * @param {number} [fallback]
 */
export function builderSliderFill(
  value: number | null | undefined,
  min: number,
  max: number,
  color?: string,
  fallback?: number,
  step?: number,
) {
  const fb = fallback ?? min
  let v = resolveSliderValue(value, fb)
  if (step != null && step > 0) {
    v = snapToSliderStep(v, min, max, step)
  }
  return sliderTrackStyle({ value: v, min, max, color, step })
}
