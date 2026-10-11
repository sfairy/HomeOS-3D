/**
 * 带时区的本地化时间部件提取与格式化
 *
 * 职责：
 * - 提供「按浏览器 / 系统本地时区」拆解的日期部件（hour / minute / second / weekday / ...）。
 * - 提供按 locale + 时区格式化日期字符串的薄封装，供屏保时钟等场景使用。
 *
 * 依赖：浏览器 Intl API。
 *
 * 注意：当前实现使用浏览器本地时区（getAppTimezone 返回 undefined 即使用系统时区），
 *   如需固定时区可在 getAppTimezone 中返回 IANA 时区名（如 'Asia/Shanghai'）。
 */

/** 获取应用时区：当前返回 undefined，表示使用浏览器 / 系统本地时区 */
function getAppTimezone() {
  return undefined
}

/**
 * 按应用时区拆解日期为各部件（用于屏保时钟等）。
 *
 * @param date 目标日期，默认当前时间
 * @param options Intl 选项覆盖；默认 24 小时制含时分秒
 * @returns 含 hour / minute / second / weekday / month / day / year 字段的对象
 */
export function getZonedParts(date: Date = new Date(), options: Intl.DateTimeFormatOptions = {}) {
  const tz = getAppTimezone()
  const fmt = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...options,
  })
  const parts = fmt.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
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
