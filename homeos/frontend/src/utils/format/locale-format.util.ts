/**
 * 本地化日期 / 时间 / 数字格式化工具
 *
 * 职责：
 * - 收敛 Intl.DateTimeFormat / NumberFormat 的复用配置，提供面向用户的中文时间文案。
 * - 覆盖审计日志、安防事件、访问审计、事件列表、访客有效期、毫秒 / 分钟时长等场景。
 * - 统一错误兜底：传入空值或非法日期时返回空串 / 占位符，避免页面渲染异常。
 *
 * 依赖：浏览器 Intl API（无外部包依赖）。
 *
 * 注意：所有 locale 默认 zh-CN；options 中的字段名（month / day / hour ...）为
 *   Intl 标准字段，不翻译。
 */
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

/** 短日期时间：月/日 时:分（12 小时制） */
const SHORT_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}
/** 审计时间戳：numeric 月日 + 24 小时制 时:分 */
const AUDIT_TIMESTAMP_OPTS: Intl.DateTimeFormatOptions = {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}
/** 安防事件时间：时:分:秒 */
const SECURITY_TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}
/** 访问审计完整时间：默认完整日期时间 + 24 小时制 */
const AUDIT_FULL_OPTS: Intl.DateTimeFormatOptions = { hour12: false }
/** 详细日期时间：含秒，24 小时制 */
const DETAILED_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}

/**
 * 按指定 locale 与选项格式化日期部分。
 *
 * @param date 日期输入（Date / 字符串 / 数字 / 空）
 * @param options Intl 选项，缺省时使用 locale 默认
 * @param locale 语言区域，默认 zh-CN
 * @returns 格式化后的日期字符串；非法输入由 Date 构造器决定（通常为 Invalid Date 文案）
 */
export function formatLocaleDate(
  date: DateInput,
  options?: Intl.DateTimeFormatOptions,
  locale = 'zh-CN',
): string {
  return new Date(date as string | number | Date).toLocaleDateString(locale, options)
}

/**
 * 按 zh-CN 与指定选项格式化时间部分。
 *
 * @param date 日期输入
 * @param options Intl 选项，缺省时使用 locale 默认
 * @returns 格式化后的时间字符串
 */
export function formatLocaleTime(date: DateInput, options?: Intl.DateTimeFormatOptions): string {
  return new Date(date as string | number | Date).toLocaleTimeString('zh-CN', options)
}


/**
 * 按 zh-CN 与指定选项格式化完整日期时间（含日期 + 时间）。
 *
 * @param date 日期输入
 * @param options Intl 选项
 * @returns 完整 locale 字符串
 */
export function formatLocaleString(date: DateInput, options?: Intl.DateTimeFormatOptions): string {
  // eslint-disable-next-line no-restricted-syntax -- 本模块 toLocaleString 语义化封装
  return new Date(date as string | number | Date).toLocaleString('zh-CN', options)
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
  if (!iso) return emptyText
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return emptyText
  const ms = Date.now() - ts
  if (ms < 60_000) return '刚刚'
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}
