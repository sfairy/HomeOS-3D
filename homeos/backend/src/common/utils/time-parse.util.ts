/**
 * 职责：
 *  - 把 HA 时间字段（ISO 字符串 / 毫秒时间戳）安全解析为毫秒时间戳；
 * 关键依赖：
 *  - 无外部依赖，纯函数；
 * 约定：
 *  - 时间字段统一 Asia/Shanghai 时区；
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * 解析 HA 时间字段为毫秒时间戳。
 *
 * HA 的 `last_changed` / `last_updated` 既可能是 ISO 字符串也可能是毫秒时间戳，
 * 且历史数据里存在空串与非法值；本函数统一收敛为「合法毫秒时间戳 or undefined」，
 * 避免各调用方重复 `Date.parse` + `Number.isFinite` 判定而漏判。
 *
 * @param raw 原始时间字段（字符串 / 数字 / null / undefined）
 * @returns 合法毫秒时间戳；无法解析时返回 undefined
 */
export function parseTimeToMs(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  const text = String(raw).trim();
  if (!text) return undefined;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : undefined;
}
