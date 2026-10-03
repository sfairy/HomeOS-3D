/**
 * 日出日落时间解析与昼夜相位计算工具
 *
 * 职责：
 * - 把 HA `sun.sun` 实体的 next_rising / next_setting 解析为「当日」日出、日落。
 * - 计算白昼进度百分比、日照时长文案、距下次日出/日落倒计时文案。
 * - 用 sin 曲线计算昼夜过渡相位（0=深夜，1=正午），供天气背景平滑过渡。
 *
 * 依赖：HA `sun.sun` 实体属性（next_rising / next_setting）。
 *
 * 注意：
 * - 白昼时 next_rising 为次日日出，需回退一天与当日 next_setting 配对。
 * - 过渡窗固定 30 分钟，避免昼夜切换视觉跳变。
 */
interface SunTimes {
  sunrise: Date | null
  sunset: Date | null
}

/** 解析 HA next_rising/next_setting ISO 字符串为 Date；空或非法返回 null */
function parseSunIso(value: unknown): Date | null {
  if (value == null || value === '') return null
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 将 HA sun.sun 的 next_rising / next_setting 解析为「当日」日出、日落。
 * 白昼时 next_rising 为次日日出、next_setting 为当日日落，不可直接配对。
 */
export function resolveSunriseSunset(attrs: Record<string, unknown> | undefined): SunTimes {
  const nextRising = parseSunIso(attrs?.next_rising)
  const nextSetting = parseSunIso(attrs?.next_setting)
  if (!nextRising || !nextSetting) return { sunrise: null, sunset: null }

  const riseMs = nextRising.getTime()
  const setMs = nextSetting.getTime()

  if (riseMs <= setMs) {
    return { sunrise: nextRising, sunset: nextSetting }
  }

  return {
    sunrise: new Date(riseMs - 24 * 60 * 60 * 1000),
    sunset: nextSetting,
  }
}

/** computeSunProgress：函数，按签名入参返回处理结果。 */
export function computeSunProgress(
  sunrise: Date | null,
  sunset: Date | null,
  nowMs = Date.now(),
): number {
  if (!sunrise || !sunset) return 50
  const rise = sunrise.getTime()
  const set = sunset.getTime()
  if (set <= rise) return 50
  if (nowMs <= rise) return 0
  if (nowMs >= set) return 100
  return Math.round(((nowMs - rise) / (set - rise)) * 100)
}

/** 日照时长文案（形如「日照 13h25m」）；无数据或日落≤日出时返回空串 */
export function formatDaylightDuration(sunrise: Date | null, sunset: Date | null): string {
  if (!sunrise || !sunset) return ''
  const diff = sunset.getTime() - sunrise.getTime()
  if (diff <= 0) return ''
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return `日照 ${h}h${m}m`
}

function formatDurationShort(ms: number): string {
  if (ms <= 0) return ''
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h${m}m` : `${m}m`
}

/** 距下一次日出/日落的倒计时文案（Hub 嵌入紧凑展示） */
export function formatSunCountdown(
  attrs: Record<string, unknown> | undefined,
  isDay: boolean,
  nowMs = Date.now(),
): string {
  const { sunrise, sunset } = resolveSunriseSunset(attrs)
  const target = isDay ? sunset : parseSunIso(attrs?.next_rising) ?? sunrise
  if (!target) return ''
  const diff = target.getTime() - nowMs
  if (diff <= 0) return isDay ? '已日落' : '已日出'
  const time = formatDurationShort(diff)
  return isDay ? `距日落 ${time}` : `距日出 ${time}`
}

/** 昼夜过渡窗口长度（ms）：黎明/黄昏各 30 分钟 */
const TWILIGHT_WINDOW_MS = 30 * 60 * 1000

/**
 * 计算昼夜相位：0 = 深夜，1 = 正午。
 * 以日出/日落为中心向外扩展 30 分钟过渡窗，用 sin 曲线在整段（含黎明/黄昏）上平滑过渡，
 * 避免昼夜切换时的视觉跳变。
 */
export function computeDayPhase(
  sunrise: Date | null,
  sunset: Date | null,
  nowMs = Date.now(),
): number {
  if (!sunrise || !sunset) return 1
  const rise = sunrise.getTime()
  const set = sunset.getTime()
  if (!Number.isFinite(rise) || !Number.isFinite(set) || set <= rise) return 1

  const dayStart = rise - TWILIGHT_WINDOW_MS
  const dayEnd = set + TWILIGHT_WINDOW_MS
  const daySpan = dayEnd - dayStart
  if (nowMs < dayStart || nowMs > dayEnd) return 0

  const progress = Math.min(1, Math.max(0, (nowMs - dayStart) / daySpan))
  return Math.round(Math.sin(progress * Math.PI) * 1000) / 1000
}
