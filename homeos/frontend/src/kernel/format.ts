/** 本地化日期 / 时间 / 数字格式化工具 */

type DateInput = Date | string | number | null | undefined

/**
 * 两位补零：7 → "07"（时钟、时长、日期片段等展示场景统一入口）。
 *
 * @param value 数值或已字符串化的数值
 * @returns 至少两位的字符串；空值按 0 处理
 */
export function pad2(value: number | string | null | undefined): string {
  return String(value ?? 0).padStart(2, '0')
}

/** 短日期时间：月/日 时:分（小时制跟随用户偏好） */
const SHORT_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}
/** 审计时间戳：numeric 月日 + 时:分（小时制跟随用户偏好） */
const AUDIT_TIMESTAMP_OPTS: Intl.DateTimeFormatOptions = {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}
/** 安防事件时间：时:分:秒 */
const SECURITY_TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}
/** 访问审计完整时间：默认完整日期时间（小时制跟随用户偏好） */
const AUDIT_FULL_OPTS: Intl.DateTimeFormatOptions = {}
/** 详细日期时间：含秒（小时制跟随用户偏好） */
const DETAILED_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}

/**
 * 按指定 locale 与选项格式化日期部分。
 *
 * @param date 日期输入（Date / 字符串 / 数字 / 空）
 * @param options Intl 选项，缺省时使用 locale 默认
 * @param locale 语言区域，默认 zh-CN
 * @returns 格式化后的日期字符串；非法输入由 Date 构造器决定（通常为 Invalid Date 文案）
 */
export function formatLocaleDate(date: DateInput, options?: Intl.DateTimeFormatOptions, locale = 'zh-CN'): string {
  return new Date(date as string | number | Date).toLocaleDateString(locale, options)
}

/**
 * 按 zh-CN 与指定选项格式化时间部分。
 *
 * 未显式传 ``hour12`` 时按用户偏好（浏览器语言 / 显式设置）决定：
 * 12 小时制会出现「上午/下午」，24 小时制不会。需要固定口径的调用方
 * （例如必须逐行对齐的审计表格）请自己传 ``hour12``。
 *
 * @param date 日期输入
 * @param options Intl 选项，缺省时使用 locale 默认
 * @returns 格式化后的时间字符串
 */
export function formatLocaleTime(date: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Date(date as string | number | Date).toLocaleTimeString('zh-CN', {
    ...hour12Option(),
    ...options,
  })
}

/**
 * 按 zh-CN 与指定选项格式化完整日期时间（含日期 + 时间）。
 *
 * 未显式传 ``hour12`` 时按用户偏好（浏览器语言 / 显式设置）决定。
 *
 * @param date 日期输入
 * @param options Intl 选项
 * @returns 完整 locale 字符串
 */
export function formatLocaleString(date: DateInput, options?: Intl.DateTimeFormatOptions): string {
  // check-restricted-syntax-ignore: 本模块是 toLocaleString 的语义化封装层
  return new Date(date as string | number | Date).toLocaleString('zh-CN', {
    ...hour12Option(),
    ...options,
  })
}

/** 审计/日志列表：月/日 时:分 */
export function formatShortDateTime(date: DateInput): string {
  if (!date) return ''
  try {
    return formatLocaleString(date, SHORT_DATETIME_OPTS)
  } catch {
    return String(date)
  }
}

/** 配置审计等：numeric 月日 + 24 小时制 */
export function formatAuditTimestamp(date: DateInput): string {
  if (!date) return ''
  try {
    return formatLocaleString(date, AUDIT_TIMESTAMP_OPTS) || String(date)
  } catch {
    return String(date)
  }
}

/** 安防事件：时:分:秒 */
export function formatSecurityTime(date: DateInput): string {
  const d = date instanceof Date ? date : new Date(date as string | number)
  if (Number.isNaN(d.getTime())) return ''
  return formatLocaleTime(d, SECURITY_TIME_OPTS)
}

/** 访问审计：完整日期时间，24 小时制 */
export function formatAuditTime(iso: DateInput): string {
  if (!iso) return '—'
  try {
    return formatLocaleString(iso, AUDIT_FULL_OPTS)
  } catch {
    return String(iso)
  }
}

/** 事件列表等：含秒的完整时间戳 */
function formatDetailedDateTime(date: DateInput): string {
  if (!date) return ''
  try {
    return formatLocaleString(date, DETAILED_DATETIME_OPTS)
  } catch {
    return String(date)
  }
}

/** 访客有效期等：完整 locale 字符串，带 fallback */
export function formatFullDateTime(date: DateInput): string {
  try {
    return formatLocaleString(date)
  } catch {
    return String(date)
  }
}

/**
 * 详细日期时间 + 占位符：空值返回「—」，含秒、24 小时制。
 *
 * @param iso 日期输入
 * @returns 格式化后的字符串；空值返回「—」
 */
export function formatDetailedDateTimeOrDash(iso: DateInput): string {
  if (!iso) return '—'
  return formatDetailedDateTime(iso) || '—'
}

/** 整数计数：如 "1,234" */
export function formatLocaleNumber(n: number, locale = 'zh-CN'): string {
  return new Intl.NumberFormat(locale).format(n)
}

/** 毫秒时长：如 "45分钟" / "2小时30分钟" */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—'
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`
}

/**
 * 相对时间档位：``withinMs`` 是该档的上界（毫秒），命中即用 ``label`` 生成文案。
 *
 * 所有「多久以前」都过同一套档位引擎，差别只在档位表与兜底文案 —— 这样两处分级不会
 * 再各自漂移（历史上 `useDeviceGroupOffline` 跨 30 天永远回「N 天前」，
 * `AlertRulesEarthquakeConnPanel` 连秒级档都没有，同一份数据在不同页面显示不同）。
 */
type RelativeTimeTier = { withinMs: number; label: (elapsedMs: number) => string }

/** 分钟级档位：设备在线/掉线、访客记录、成员最后在线等通用场景。 */
const MINUTE_RELATIVE_TIERS: readonly RelativeTimeTier[] = [
  { withinMs: 60_000, label: () => '刚刚' },
  { withinMs: 3_600_000, label: (ms) => `${Math.floor(ms / 60_000)} 分钟前` },
  { withinMs: 86_400_000, label: (ms) => `${Math.floor(ms / 3_600_000)} 小时前` },
  { withinMs: 30 * 86_400_000, label: (ms) => `${Math.floor(ms / 86_400_000)} 天前` },
]

/**
 * 秒级档位：地震预警 / 通道拉取心跳这类「刚刚发生」的场景。
 *
 * 这类记录的时间差本身就是要传达的信息（15 秒和 3 分钟是完全不同的紧急度），
 * 所以首档细到秒；超过 1 天则交回绝对时刻（由 ``absolute`` 决定），而不是「N 天前」。
 */
const SECOND_RELATIVE_TIERS: readonly RelativeTimeTier[] = [
  { withinMs: 15_000, label: () => '刚刚' },
  { withinMs: 60_000, label: (ms) => `${Math.floor(ms / 1000)} 秒前` },
  { withinMs: 3_600_000, label: (ms) => `${Math.floor(ms / 60_000)} 分钟前` },
  { withinMs: 86_400_000, label: (ms) => `${Math.floor(ms / 3_600_000)} 小时前` },
]

/** 解析时间输入为毫秒时间戳；空值与非法时间返回 ``null``（禁止 NaN 漏到展示层）。 */
function parseTimestampMs(iso: DateInput): number | null {
  if (!iso) return null
  const ts = new Date(iso as string | number | Date).getTime()
  return Number.isNaN(ts) ? null : ts
}

/**
 * 相对当前时刻的「多久以前」文案（设备在线/掉线、访客记录、成员最后在线等通用场景）。
 *
 * 分级：< 1 分钟 → 刚刚；< 1 小时 → N 分钟前；< 24 小时 → N 小时前；
 * < 30 天 → N 天前；更早 → 本地短日期。
 *
 * @param iso 时间输入（Date / ISO 字符串 / 毫秒时间戳）
 * @param emptyText 空值与非法时间的占位文案（默认「—」，传 '' 可静默隐藏）
 * @returns 相对时间文案
 */
export function formatRelativeFromNow(iso: DateInput, emptyText = '—'): string {
  const ts = parseTimestampMs(iso)
  if (ts === null) return emptyText
  const elapsedMs = Date.now() - ts
  const tier = MINUTE_RELATIVE_TIERS.find((candidate) => elapsedMs < candidate.withinMs)
  return tier ? tier.label(elapsedMs) : new Date(ts).toLocaleDateString('zh-CN')
}

/**
 * 秒级相对时间（地震预警、通道心跳）：与 :func:`formatRelativeFromNow` 同一套档位引擎。
 *
 * @param iso 时间输入（Date / ISO 字符串 / 毫秒时间戳）
 * @param options.emptyText 空值与非法时间的占位文案（默认「—」）
 * @param options.absolute 超出 24 小时（或时间在未来）时使用的绝对时刻文案；
 *   缺省回落到本地短日期。传空字符串表示该场景不需要绝对时刻。
 * @returns 相对时间文案
 */
export function formatRelativeSecondsFromNow(
  iso: DateInput,
  options: { emptyText?: string; absolute?: (timestampMs: number) => string } = {},
): string {
  const { emptyText = '—', absolute } = options
  const ts = parseTimestampMs(iso)
  if (ts === null) return emptyText
  const elapsedMs = Date.now() - ts
  const tier = elapsedMs >= 0 ? SECOND_RELATIVE_TIERS.find((c) => elapsedMs < c.withinMs) : null
  if (tier) return tier.label(elapsedMs)
  // 传了 absolute 就以它为准（哪怕返回空串：调用方明确表示该场景不要绝对时刻）。
  return absolute ? absolute(ts) : new Date(ts).toLocaleDateString('zh-CN')
}

/** 带时区的本地化时间部件提取与格式化 */

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

/**
 * 农历计算工具模块
 * ClockWidget 和 Screensaver 共享此模块，避免 201 项十六进制数组重复定义。
 */

/** 农历年份信息表（1900-2100 每个农历年的编码数据） */
const LUNAR_YEAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, 0x04ae0, 0x0a5b6, 0x0a4d0,
  0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, 0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54,
  0x02b60, 0x09570, 0x052f2, 0x04970, 0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7,
  0x0c950, 0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, 0x06ca0, 0x0b550,
  0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570,
  0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, 0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540,
  0x0b6a0, 0x195a6, 0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, 0x04af5,
  0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0, 0x0c960, 0x0d954, 0x0d4a0, 0x0da50,
  0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, 0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0,
  0x15176, 0x052b0, 0x0a930, 0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, 0x0b5a0, 0x056d0, 0x055b2,
  0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6,
  0x0ea50, 0x06aa0, 0x1a6c4, 0x0aae0, 0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0,
  0x055d4, 0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, 0x0b273, 0x06930,
  0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, 0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0,
  0x04ae0, 0x0a9d4, 0x0a4d0, 0x0d150, 0x0f252, 0x0d520,
]

/** 天干：甲乙丙丁戊己庚辛壬癸 */
const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
/** 地支：子丑寅卯辰巳午未申酉戌亥 */
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
/** 生肖（中文）：与地支一一对应 */
const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
/** 生肖 key（英文，与地支配对，用于图标 / 资源映射） */
const ZODIAC_KEYS = [
  'rat',
  'ox',
  'tiger',
  'rabbit',
  'dragon',
  'snake',
  'horse',
  'goat',
  'monkey',
  'rooster',
  'dog',
  'pig',
]
/** 农历月份名（1-12 月对应「正 / 二 / ... / 腊」） */
const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
/** 农历日序名（1-30，索引 0 占位为空串） */
const LUNAR_DAYS = [
  '',
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十',
]

/** 农历查表基准年（LUNAR_YEAR_INFO 表起始年份） */
const BASE_YEAR = 1900
/** 农历查表基准日期（公历 1900-01-31，对应农历 1900 年正月初一） */
const BASE_DATE = new Date(1900, 0, 31)

/** 取农历某年某月的天数（30 或 29） */
function monthDays(year: number, month: number) {
  return LUNAR_YEAR_INFO[year - BASE_YEAR] & (0x10000 >> month) ? 30 : 29
}

/** 取农历某年的闰月月份（0 表示无闰月） */
function leapMonth(year: number) {
  return LUNAR_YEAR_INFO[year - BASE_YEAR] & 0xf
}

/** 取农历某年闰月的天数（无闰月返回 0） */
function leapDays(year: number) {
  const lm = leapMonth(year)
  if (lm) return LUNAR_YEAR_INFO[year - BASE_YEAR] & 0x10000 ? 30 : 29
  return 0
}

/** 取农历某年的总天数（12 或 13 个月合计） */
function yearDays(year: number) {
  let sum = 348
  for (let i = 0x8000; i > 0x8; i >>= 1) {
    sum += LUNAR_YEAR_INFO[year - BASE_YEAR] & i ? 1 : 0
  }
  return sum + leapDays(year)
}

export type LunarDate = {
  year: number
  month: number
  day: number
  isLeap: boolean
  yearName: string
  stemIdx: number
  branchIdx: number
  zodiac: string
  zodiacKey: string
  monthName: string
  dayName: string
  monthStr: string
  dayStr: string
}

/**
 * 公历日期 → 农历日期转换
 * @param {Date} date
 * @returns {{ year: number, month: number, day: number, isLeap: boolean,
 *             yearName: string, zodiac: string, monthName: string, dayName: string,
 *             monthStr: string, dayStr: string }}
 */
export function solarToLunar(date: Date): LunarDate {
  let offset = Math.floor((date.getTime() - (BASE_DATE as Date).getTime()) / 86400000)
  let year, month, day
  let isLeap = false

  for (year = BASE_YEAR; year < 2100 && offset > 0; year++) {
    const days = yearDays(year)
    if (offset < days) break
    offset -= days
  }

  const leap = leapMonth(year)
  for (month = 1; month <= 12 && offset > 0; month++) {
    if (leap > 0 && month === leap + 1 && !isLeap) {
      month--
      isLeap = true
      const d = leapDays(year)
      if (offset < d) break
      offset -= d
      isLeap = false
      continue
    }
    const d = monthDays(year, month)
    if (offset < d) break
    offset -= d
    isLeap = false
  }

  day = offset + 1
  const tgIdx = (year - 4) % 10
  const dzIdx = (year - 4) % 12

  const dzNorm = dzIdx < 0 ? dzIdx + 12 : dzIdx

  const monthName = LUNAR_MONTHS[month - 1]
  const dayName = LUNAR_DAYS[day] || ''

  return {
    year,
    month,
    day,
    isLeap,
    yearName: `${TIAN_GAN[tgIdx < 0 ? tgIdx + 10 : tgIdx]}${DI_ZHI[dzNorm]}`,
    stemIdx: tgIdx < 0 ? tgIdx + 10 : tgIdx,
    branchIdx: dzNorm,
    zodiac: ZODIAC[dzNorm],
    zodiacKey: ZODIAC_KEYS[dzNorm],
    monthName,
    dayName,
    monthStr: isLeap ? `闰${monthName}` : monthName,
    dayStr: dayName,
  }
}

/** 农历展示文案格式化工具（屏保 / 日历组件共用） */

const ZODIAC_LABELS: Record<string, string> = {
  dog: '狗',
  dragon: '龙',
  goat: '羊',
  horse: '马',
  monkey: '猴',
  ox: '牛',
  pig: '猪',
  rabbit: '兔',
  rat: '鼠',
  rooster: '鸡',
  snake: '蛇',
  tiger: '虎',
}

const LUNAR_MONTH_LABELS: Record<string, string> = {
  '0': '正',
  '1': '二',
  '10': '冬',
  '11': '腊',
  '2': '三',
  '3': '四',
  '4': '五',
  '5': '六',
  '6': '七',
  '7': '八',
  '8': '九',
  '9': '十',
}

const LUNAR_DAY_LABELS: Record<string, string> = {
  '1': '初一',
  '10': '初十',
  '11': '十一',
  '12': '十二',
  '13': '十三',
  '14': '十四',
  '15': '十五',
  '16': '十六',
  '17': '十七',
  '18': '十八',
  '19': '十九',
  '2': '初二',
  '20': '二十',
  '21': '廿一',
  '22': '廿二',
  '23': '廿三',
  '24': '廿四',
  '25': '廿五',
  '26': '廿六',
  '27': '廿七',
  '28': '廿八',
  '29': '廿九',
  '3': '初三',
  '30': '三十',
  '4': '初四',
  '5': '初五',
  '6': '初六',
  '7': '初七',
  '8': '初八',
  '9': '初九',
}

/** 生肖中文标签；zodiacKey 缺失时回退默认「鼠」 */
function formatLunarZodiac(lunar: Pick<LunarDate, 'zodiacKey'> | null | undefined) {
  const key = lunar?.zodiacKey || 'rat'
  return ZODIAC_LABELS[key] ?? key
}

/** 农历月名（正/二/.../冬/腊）；未命中回退原始月数 */
function formatLunarMonthName(lunar: Pick<LunarDate, 'month'>) {
  return LUNAR_MONTH_LABELS[lunar.month - 1] ?? lunar.month - 1
}

/** 农历日名（初一/.../三十）；未命中回退原始日数 */
function formatLunarDayName(lunar: Pick<LunarDate, 'day'>) {
  return LUNAR_DAY_LABELS[lunar.day] ?? lunar.day
}

/** 农历年份行（干支 + 生肖） */
export function formatLunarYearLine(lunar: Pick<LunarDate, 'zodiacKey' | 'zodiac' | 'yearName'>) {
  const zodiac = formatLunarZodiac(lunar)
  const zodiacLabel = lunar.zodiac || zodiac
  return `${lunar.yearName}年（${zodiacLabel}年）`
}

/** 农历月日行 */
export function formatLunarMonthDayLine(lunar: Pick<LunarDate, 'month' | 'day' | 'isLeap'>) {
  const monthName = formatLunarMonthName(lunar)
  const dayName = formatLunarDayName(lunar)
  const month = lunar.isLeap ? `闰${monthName}` : monthName
  return `${month}月${dayName}`
}

/** 屏保完整农历行：干支年 + 月日 */
export function formatLunarFullLine(
  lunar: Pick<LunarDate, 'zodiacKey' | 'zodiac' | 'yearName' | 'month' | 'day' | 'isLeap'>,
) {
  return `${formatLunarYearLine(lunar)} · ${formatLunarMonthDayLine(lunar)}`
}

/**
 * 12 / 24 小时制的**唯一判定入口**。
 *
 * 背景（审计 U-04）：列表 / 审计 / 安防等格式化函数原先各自硬编码 ``hour12: false``，
 * 于是无论浏览器语言是什么都固定 24 小时制。用户偏好应该只在这里定义一次，
 * 其余调用点通过 :func:`hour12Option` 取值，避免「这里是 12 小时、那里是 24 小时」。
 *
 * 优先级：显式偏好（``localStorage['homeos.timeFormat']`` = ``'12' | '24'``）
 * → 浏览器语言推断 → 24 小时制兜底。
 *
 * 为什么用浏览器语言而不是新增后端配置：这套系统只有一个家庭、一个管理员，
 * 为了一个显示开关增加「配置项 + 设置面板 + 校验 + 迁移」的成本远高于收益；
 * 而 ``navigator.language`` 本来就是用户在自己设备上的选择。需要强制覆盖时，
 * 调 :func:`setTimeFormatPreference` 写一条 localStorage 即可。
 */

/** 显式偏好的存储键。 */
export const TIME_FORMAT_STORAGE_KEY = 'homeos.timeFormat'

/** 显式偏好：``'12'`` / ``'24'`` / ``null``（跟随语言）。 */
export type TimeFormatPreference = '12' | '24' | null

/**
 * 使用 12 小时制的语言（按 ``navigator.language`` 的主标签匹配）。
 *
 * 只列真正以 12 小时制为默认的地区；``en-GB``、``zh-*``、``de`` 等都在 24 小时制阵营，
 * 因此不列。``en`` 不带地区时按 12 小时制处理（``navigator.language`` 极少只给 ``en``，
 * 真出现时跟随最常见默认更安全）。
 */
const HOUR12_LANGUAGES = new Set(['en-us', 'en-ca', 'en-au', 'en-nz', 'en-in', 'en-ph', 'en'])

function readStoredPreference(): TimeFormatPreference {
  try {
    const value = globalThis.localStorage?.getItem(TIME_FORMAT_STORAGE_KEY)
    return value === '12' || value === '24' ? value : null
  } catch {
    // 隐私模式 / 禁用存储：按「无偏好」处理，不影响页面
    return null
  }
}

/** 浏览器语言是否倾向 12 小时制（SSR / 无 navigator 时返回 false）。 */
export function languagePrefersHour12(language?: string): boolean {
  const raw = (language ?? globalThis.navigator?.language ?? '').trim().toLowerCase()
  if (!raw) return false
  return HOUR12_LANGUAGES.has(raw)
}

/** 当前是否使用 12 小时制（显式偏好优先，其次语言推断）。 */
export function resolveHour12(): boolean {
  const stored = readStoredPreference()
  if (stored === '12') return true
  if (stored === '24') return false
  return languagePrefersHour12()
}

/** 供 ``Intl.DateTimeFormatOptions`` 展开使用：``{ hour12: boolean }``。 */
export function hour12Option(): { hour12: boolean } {
  return { hour12: resolveHour12() }
}

/** 写入显式偏好；传 ``null`` 表示恢复「跟随语言」。 */
export function setTimeFormatPreference(preference: TimeFormatPreference): void {
  try {
    if (preference === null) globalThis.localStorage?.removeItem(TIME_FORMAT_STORAGE_KEY)
    else globalThis.localStorage?.setItem(TIME_FORMAT_STORAGE_KEY, preference)
  } catch {
    // 存储不可用：静默忽略（偏好只在本次会话内无效，不影响功能）
  }
}
