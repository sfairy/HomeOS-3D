/**
 * 所属模块：backend/common/utils
 * 职责：
 *  - 业务日期键（YYYY-MM-DD / YYYY-MM）时区归一化，供能源聚合与"今日"判定使用；
 * 关键依赖：
 *  - 无外部依赖（Intl.DateTimeFormat 内置）；
 * 约定：
 *  - 时间字段统一 Asia/Shanghai 时区；
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * 本地时区日期键工具。
 *
 * `new Date().toISOString().slice(0, 10)` 取的是 UTC 日期，在北京时区
 * 00:00–08:00 期间会取到前一天，导致"今日"判定/日累计重置错位。
 * 统一使用本工具按服务器本地时区生成日期键。
 */

/** 以可选 IANA 时区格式化日期键：YYYY-MM-DD（缺省为进程本地时区） */
export function localDateKey(date: Date = new Date(), timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '00';
  const d = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${y}-${m}-${d}`;
}

/** 统一业务时区：能源聚合 / 日累计 / 月度账单共用，避免 UTC 跨日错位 */
const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

/**
 * 业务日期键：YYYY-MM-DD（Asia/Shanghai）。
 *
 * 能源聚合回退查询与「今日」判定统一使用，保证与 EnergyUsageDaily 落库键同源。
 */
export function businessDayKey(date: Date = new Date()): string {
  return localDateKey(date, BUSINESS_TIME_ZONE);
}

/** 业务月份键：YYYY-MM（取日期键前 7 位，保证日/月键同源一致） */
export function businessMonthKey(date: Date = new Date()): string {
  return businessDayKey(date).slice(0, 7);
}
