/**
 * 进度条 / 滑块轨道渐变色工具。
 *
 * 职责：
 * - 维护 variant → 渐变色映射表（PROGRESS_VARIANTS）
 * - 维护 Builder 单色 → 渐变映射、PIN 强度 class → variant、阈值类 variant 集合
 * - 提供百分比归一化、滑块步进吸附、数值钳制与按阈值选色等 helper
 *
 * 关键算法：normalizeProgressPct / snapToSliderStep 保证滑块拇指与轨道填充使用同一数值；
 * resolveProgressGradient 按预算/余额/资源等阈值动态选色。
 *
 * 依赖：vue 的 isRef/Ref；@/utils/core/misc.util 的 clampNum。
 */

import { isRef, type Ref } from 'vue'

export type ProgressGradient = { from: string; to: string; glow?: string }

/** @type {Record<string, ProgressGradient>} */
const PROGRESS_VARIANTS: Record<string, ProgressGradient> = {
  accent: { from: '#0A84FF', to: '#5AC8FA', glow: 'rgba(10, 132, 255, 0.45)' }, // 主强调色（蓝）
  success: { from: '#30D158', to: '#34C759', glow: 'rgba(48, 209, 88, 0.45)' }, // 成功/正向
  warn: { from: '#FF9F0A', to: '#FFCC00', glow: 'rgba(255, 159, 10, 0.45)' }, // 警告
  danger: { from: '#FF3B30', to: '#FF6961', glow: 'rgba(255, 59, 48, 0.5)' }, // 危险/超额
  info: { from: '#64D2FF', to: '#5AC8FA', glow: 'rgba(100, 210, 255, 0.4)' }, // 信息提示
  green: { from: '#30D158', to: '#34D399', glow: 'rgba(48, 209, 88, 0.4)' }, // 绿色（通用）
  amber: { from: '#FF9F0A', to: '#FFCC00', glow: 'rgba(255, 159, 10, 0.4)' }, // 琥珀/橙黄
  blue: { from: '#0A84FF', to: '#64D2FF', glow: 'rgba(10, 132, 255, 0.4)' }, // 蓝色（通用）
  teal: { from: '#5AC8FA', to: '#2DD4BF', glow: 'rgba(90, 200, 250, 0.4)' }, // 青色
  purple: { from: '#5856D6', to: '#AF52DE', glow: 'rgba(88, 86, 214, 0.4)' }, // 紫色
  orange: { from: '#FF9500', to: '#FF6B00', glow: 'rgba(255, 149, 0, 0.45)' }, // 橙色
  sync: { from: '#FF9F0A', to: '#FFB340', glow: 'rgba(255, 159, 10, 0.4)' }, // 同步任务
  media: { from: '#0A84FF', to: '#5AC8FA', glow: 'rgba(10, 132, 255, 0.4)' }, // 影视/媒体
  emerald: { from: '#30D158', to: '#34D399', glow: 'rgba(48, 209, 88, 0.4)' }, // 翠绿
  cpu: { from: '#30D158', to: '#34C759', glow: 'rgba(48, 209, 88, 0.35)' }, // CPU 使用率
  mem: { from: '#0A84FF', to: '#64D2FF', glow: 'rgba(10, 132, 255, 0.35)' }, // 内存使用率
  white: { from: '#ffffff', to: 'rgba(255,255,255,0.85)' }, // 白色（无辉光）
  indigo: { from: '#6366f1', to: '#818cf8', glow: 'rgba(99, 102, 241, 0.4)' }, // 靛蓝
  loading: { from: '#818cf8', to: '#a78bfa', glow: 'rgba(129, 140, 248, 0.4)' }, // 加载中
  timeline: { from: '#5AC8FA', to: '#0A84FF', glow: 'rgba(90, 200, 250, 0.35)' }, // 时间线
  circuit: { from: '#FFCC00', to: '#FF9F0A', glow: 'rgba(255, 204, 0, 0.35)' }, // 电路/电力
  red: { from: '#FF3B30', to: '#FF6961', glow: 'rgba(255, 59, 48, 0.4)' }, // 红色（通用）
}

/** Builder 滑块常用单色 → 渐变 */
const BUILDER_COLOR_GRADIENTS: Record<string, ProgressGradient> = {
  '#22C55E': PROGRESS_VARIANTS.green,
  '#F59E0B': PROGRESS_VARIANTS.amber,
  '#60A5FA': PROGRESS_VARIANTS.blue,
  '#3b82f6': PROGRESS_VARIANTS.blue,
  '#38bdf8': PROGRESS_VARIANTS.info,
  '#2dd4bf': PROGRESS_VARIANTS.teal,
  '#6366f1': PROGRESS_VARIANTS.indigo,
  '#ef4444': PROGRESS_VARIANTS.red,
  '#06b6d4': PROGRESS_VARIANTS.teal,
}

/** THRESHOLD_VARIANTS：常量集合，成员语义见定义处。 */
export const THRESHOLD_VARIANTS = new Set(['budget', 'threshold', 'balance', 'resource'])

/**
 * @param {number} value
 * @param {number} [min=0]
 * @param {number} [max=100]
 */
export function normalizeProgressPct(value: number | null | undefined, min = 0, max = 100) {
  if (max <= min) return 0
  const num = Number(value)
  if (Number.isNaN(num)) return 0
  const pct = ((num - min) / (max - min)) * 100
  return Math.min(100, Math.max(0, pct))
}

function sliderStepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  const s = String(step)
  const dot = s.indexOf('.')
  if (dot < 0) return 0
  return s.length - dot - 1
}

/** 按 range step 吸附并消除浮点误差，保证拇指与轨道填充使用同一数值 */
export function snapToSliderStep(value: number, min: number, max: number, step: number): number {
  let n = Number(value)
  if (!Number.isFinite(n)) n = min
  if (step > 0) {
    n = Math.round((n - min) / step) * step + min
    n = Number(n.toFixed(sliderStepDecimals(step)))
  }
  return Math.min(max, Math.max(min, n))
}

import { clampNum } from '@/utils/core/misc.util'

/** 将数值钳制在 [min, max]；无效时返回 fallback */
export function clampInRange(
  value: number | null | undefined,
  min: number,
  max: number,
  fallback: number = min,
) {
  const lo = Number(min)
  const hi = Number(max)
  const n = Number(value)
  if (!Number.isFinite(n)) return Number.isFinite(fallback) ? fallback : lo
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return n
  return clampNum(n, lo, hi)
}

/** 滑块展示值：null/NaN/Ref 时回退到 fallback，保证拇指与轨道填充使用同一数值 */
export function resolveSliderValue(
  value: number | null | undefined | Ref<number | null | undefined>,
  fallback: number,
) {
  const raw = isRef(value) ? value.value : value
  if (raw != null && !Number.isNaN(Number(raw))) return Number(raw)
  return fallback
}

export function formatProgressPct(pct: number) {
  const clamped = clampNum(pct, 0, 100)
  const rounded = Math.round(clamped * 100) / 100
  return `${rounded}%`
}

/**
 * 预算/用量类：按百分比阈值选色
 * @param {number|null|undefined} pct
 */
export function budgetVariantFromPct(pct: number | null | undefined) {
  if (pct == null || Number.isNaN(pct)) return 'accent'
  if (pct >= 100) return 'danger'
  if (pct >= 80) return 'warn'
  return 'success'
}

/**
 * 余额类：按金额阈值选色
 * @param {number} balance
 */
export function balanceVariantFromAmount(balance: number) {
  if (balance < 50) return 'danger'
  if (balance < 100) return 'warn'
  return 'success'
}

/**
 * 系统资源类：按使用率阈值选色
 * @param {number|null|undefined} pct
 */
export function resourceVariantFromPct(pct: number | null | undefined) {
  if (pct == null || Number.isNaN(pct)) return 'success'
  if (pct >= 90) return 'danger'
  if (pct >= 70) return 'warn'
  return 'success'
}

/**
 * @param {string} [variant='accent']
 * @param {number|null|undefined} [value]
 * @param {{ color?: string, colorEnd?: string }} [custom]
 * @returns {ProgressGradient}
 */
export function resolveProgressGradient(
  variant = 'accent',
  value?: number | null,
  custom: { color?: string; colorEnd?: string } = {},
): ProgressGradient {
  if (custom.color && custom.colorEnd) {
    return { from: custom.color, to: custom.colorEnd }
  }
  if (custom.color) {
    const mapped = BUILDER_COLOR_GRADIENTS[custom.color]
    if (mapped) return mapped
    return { from: custom.color, to: custom.color }
  }
  if (variant === 'budget' || variant === 'threshold') {
    return PROGRESS_VARIANTS[budgetVariantFromPct(value)] || PROGRESS_VARIANTS.accent
  }
  if (variant === 'balance') {
    return (
      PROGRESS_VARIANTS[balanceVariantFromAmount(Number(value) || 0)] || PROGRESS_VARIANTS.accent
    )
  }
  if (variant === 'resource') {
    return PROGRESS_VARIANTS[resourceVariantFromPct(value)] || PROGRESS_VARIANTS.success
  }
  return PROGRESS_VARIANTS[variant] || PROGRESS_VARIANTS.accent
}

/**
 * @param {ProgressGradient} grad
 */
export function progressGradientCss(grad: ProgressGradient) {
  return `linear-gradient(90deg, ${grad.from}, ${grad.to})`
}
