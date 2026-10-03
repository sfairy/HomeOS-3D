/**
 * 天气特效动画工具
 *
 * 职责：
 * - 统一风向 / 风速到雨滴倾角、阵风脉冲、瞬时风速等动画参数的计算。
 * - 提供时间漂移与图层包裹，避免天气特效图层跑出视口。
 *
 * 依赖：无外部依赖，纯函数（输入风速 / 时间戳等数值）。
 */

/** 由风速与下落速度推算雨滴倾斜角（弧度）。wind 可正可负，决定左右倾侧。 */
export function resolveRainTiltAngle(wind: number, fallSpeed = 22): number {
  const vx = wind * 1.5
  const vy = Math.max(8, fallSpeed)
  return Math.atan2(vx, vy)
}

/** 时间驱动的风向漂移偏移（像素）。风向只决定符号，阵风只做小幅位移。 */
export function windDriftOffset(wind: number, tMs: number, factor = 1): number {
  const dir = wind < 0 ? -1 : 1
  return dir * factor * (tMs * 0.014) + wind * factor * 22
}

/** 将大偏移包裹到 [-max, max] 区间，避免图层跑出视口 */
export function wrapOffset(value: number, max: number): number {
  if (max <= 0) return value
  const wrapped = ((value % max) + max) % max
  return wrapped > max * 0.5 ? wrapped - max : wrapped
}

/**
 * 阵风脉冲 0–1：慢包络 × 短促爆发。
 * gustStrength 只放大峰值，不把平均风速乘死。
 */
export function resolveGust(tMs: number, wind: number, gustStrength = 1): number {
  const mag = Math.abs(wind)
  if (mag <= 0.18) return 0
  const t = tMs / 1000
  const envelope = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(t * 0.33 + 1.1))
  const burst = Math.pow(Math.max(0, Math.sin(t * 1.07 + 0.4)), 4)
  const pulse = envelope * 0.5 + burst * 0.5
  return Math.min(1, pulse * (0.45 + mag * 0.22) * Math.max(0.35, gustStrength))
}

/** 平均风 + 阵风脉冲后的瞬时风速（保留符号） */
export function resolveGustyWind(tMs: number, wind: number, gustStrength = 1): number {
  const mag = Math.abs(wind)
  const dir = wind < 0 ? -1 : 1
  const gust = resolveGust(tMs, mag, gustStrength)
  const instant = mag * (0.68 + gust * 0.55 * Math.max(0.5, gustStrength))
  return dir * Math.min(3.2, instant)
}

/** CelestialPosition：类型定义，字段语义见声明。 */
export interface CelestialPosition {
  sunX: number
  sunY: number
  moonX: number
  moonY: number
  /** 太阳高度 0=地平线下，1=正午 */
  elev: number
}

/**
 * 由 dayPhase（0=深夜，1=正午）推算日月位置。
 * 黎明太阳偏低偏左，正午升高偏右；月亮大致反向。
 */
export function resolveCelestialPosition(dayPhase: number, w: number, h: number): CelestialPosition {
  const elev = Math.min(1, Math.max(0, dayPhase))
  const sunX = w * (0.16 + elev * 0.58)
  const sunY = h * (0.46 - elev * 0.34)
  const moonX = w * (0.86 - elev * 0.18)
  const moonY = h * (0.12 + (1 - elev) * 0.06)
  return { sunX, sunY, moonX, moonY, elev }
}
