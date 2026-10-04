/**
 * 职责：
 *  - 主动推送（企业微信 / WebPush / 地震速报）统一时间戳格式化；
 *  - 发震时刻等"仅时间"展示格式化；
 * 关键依赖：无外部依赖，纯函数（Intl 内置）。
 * 约定：
 *  - 时间字段统一 Asia/Shanghai 时区，与 notification / earthquake 模块一致；
 *  - 对外方法遇非法输入按调用方指定的 fallback 处理，绝不输出 NaN / undefined。
 */

/** 推送时间戳展示时区：与通知模块 logTimestamp 口径保持一致的北京时间 */
const PUSH_TIME_ZONE = 'Asia/Shanghai';

/** 带时区严格解析：非法/缺失时间返回 null，供调用方决定兜底策略 */
function toValidDate(ts?: number | string | Date | null): Date | null {
  if (ts == null) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 取指定时区的日期时间分片，避免依赖宿主时区 */
function partsOf(d: Date, withDate: boolean): Record<string, string> {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: PUSH_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  if (withDate) {
    opts.year = 'numeric';
    opts.month = '2-digit';
    opts.day = '2-digit';
  }
  const parts = new Intl.DateTimeFormat('zh-CN', opts).formatToParts(d);
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

/**
 * 推送时间戳：YYYY-MM-DD HH:mm:ss（Asia/Shanghai）。
 *
 * 企业微信 / WebPush 等主动推送统一以此为前缀，便于与移动端通知时间对照。
 *
 * @param ts 可选时间（毫秒时间戳 / 字符串 / Date）；缺省取当前时刻
 * @returns 形如 `2026-09-21 16:30:05` 的字符串
 */
function formatPushTimestamp(ts?: number | string | Date | null): string {
  const p = partsOf(toValidDate(ts) ?? new Date(), true);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * 仅时间：HH:mm:ss（Asia/Shanghai）。
 *
 * 用于地震速报正文展示"实际发震时刻"等口径，与推送时间双重对照。
 * 注意：时间缺失/非法时**不可臆造**为当前时刻（会把历史地震显示成刚发生），
 * 故调用方应显式传入 fallback（如 `'—'`）。
 *
 * @param ts 可选时间（毫秒时间戳 / 字符串 / Date）
 * @param fallback 时间缺失或非法时的返回值；缺省回退当前时刻（保留旧行为）
 * @returns 形如 `16:30:05` 的字符串，或 fallback
 */
export function formatTimeOnly(
  ts?: number | string | Date | null,
  fallback?: string,
): string {
  const valid = toValidDate(ts);
  if (!valid) {
    // 未指定 fallback：保留旧行为（回退当前时刻）
    if (fallback === undefined) return timeOf(new Date());
    return String(fallback);
  }
  return timeOf(valid);
}

/** 取 HH:mm:ss 分片（避免重复取分片逻辑） */
function timeOf(d: Date): string {
  const p = partsOf(d, false);
  return `${p.hour}:${p.minute}:${p.second}`;
}

/** 已带推送时间戳前缀的正文（避免二次前置造成重复时间） */
const TIMESTAMP_PREFIX_RE = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/;

/**
 * 为主动推送正文前置时间戳前缀 `[YYYY-MM-DD HH:mm:ss] `。
 *
 * 已带同格式前缀时原样返回，保证事件处理器内联时间戳与统一前置不会叠加。
 *
 * @param message 原始正文
 * @param ts 可选时间；缺省取当前时刻
 * @returns 带前缀正文（空正文返回空串）
 */
export function withPushTimestamp(message: string, ts?: number | string | Date | null): string {
  const text = String(message ?? '').trim();
  if (!text) return '';
  if (TIMESTAMP_PREFIX_RE.test(text)) return text;
  return `[${formatPushTimestamp(ts)}] ${text}`;
}
