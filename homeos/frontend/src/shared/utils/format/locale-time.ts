/** 带时区的本地化时间部件提取与格式化 */

import { hour12Option } from './time-format.util'

/** 获取应用时区：当前返回 undefined，表示使用浏览器 / 系统本地时区 */
function getAppTimezone() {
  return undefined
}

/**
 * `Intl.DateTimeFormat` 实例缓存。
 *
 * 构造一个 formatter 要解析 locale 数据（实测 50–100µs），而屏保 / 时钟是按秒调用的，
 * 选项又只有有限几种组合。按「时区 + 选项签名」缓存，`formatToParts` 依旧逐次执行。
 */
const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>()
const ZONED_FORMATTER_CACHE_MAX = 16

function zonedFormatter(tz: string | undefined, options: Intl.DateTimeFormatOptions) {
  const merged: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // 小时制跟随用户偏好（显式传 options.hour12 可覆盖，例如时钟组件自己的设置）。
    ...hour12Option(),
    ...options,
  }
  const cacheKey = `${tz ?? ''}|${JSON.stringify(merged)}`
  const cached = zonedFormatterCache.get(cacheKey)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat(undefined, merged)
  if (zonedFormatterCache.size >= ZONED_FORMATTER_CACHE_MAX) zonedFormatterCache.clear()
  zonedFormatterCache.set(cacheKey, formatter)
  return formatter
}

/**
 * 按应用时区拆解日期为各部件（用于屏保时钟等）。
 *
 * @param date 目标日期，默认当前时间
 * @param options Intl 选项覆盖；默认 24 小时制含时分秒
 * @returns 含 hour / minute / second / weekday / month / day / year 字段的对象
 */
export function getZonedParts(date: Date = new Date(), options: Intl.DateTimeFormatOptions = {}) {
  const fmt = zonedFormatter(getAppTimezone(), options)
  const parts = fmt.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
    weekday: pick('weekday'),
    month: pick('month'),
    day: pick('day'),
    year: pick('year'),
  }
}

/**
 * 按应用时区 + locale 格式化日期字符串。
 *
 * @param date 目标日期
 * @param locale 语言区域
 * @param options Intl 选项
 * @returns 格式化后的日期字符串
 */
export function formatZonedDate(
  date: Date,
  locale: string | string[] | undefined,
  options: Intl.DateTimeFormatOptions,
) {
  const tz = getAppTimezone()
  return date.toLocaleDateString(locale, { timeZone: tz, ...options })
}

/** 指定时区下的日历日期（用于农历等需按墙钟日期的计算） */
export function getZonedWallDate(date: Date = new Date()) {
  const tz = getAppTimezone()
  if (!tz) return date
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10))
  return new Date(y, m - 1, d, 12, 0, 0)
}
