/**
 * 家庭模式定时触发器时间工具模块
 *
 * 职责：
 *  - 标准化家庭模式定时触发的时间字符串为 HH:mm（24 小时制）。
 *  - 从 Date 对象生成分钟级时间 key（用于触发器匹配）。
 *
 * 调用场景：
 *  - 后端定时触发器加载 / 保存配置时校验 "at" 字段；
 *  - 运行时按当前分钟 key 匹配应触发的模式规则。
 *
 * 约定：
 *  - 时间格式为 HH:mm（24 小时制，零填充）；
 *  - 非法输入返回 null（不抛异常）。
 */

/**
 * 标准化时间字符串为 HH:mm 格式。
 *
 * @param raw 原始时间字符串（如 "7:5" / "07:05" / "23:59"）
 * @returns 标准化后的 "HH:mm"（如 "07:05"）；非法输入返回 null
 *
 * 校验规则：
 *  - 必须匹配 \d{1,2}:\d{2} 格式；
 *  - 小时 0-23，分钟 0-59；
 *  - 通过后零填充为两位。
 */
export function normalizeHomeModeTimeAt(raw: string | undefined | null): string | null {
  const s = String(raw || '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  // 格式不匹配直接拒绝
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  // 边界校验：小时 0-23，分钟 0-59
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * 从 Date 对象生成分钟级时间 key。
 *
 * @param date 任意 Date 对象
 * @returns "HH:mm" 格式字符串（如 "09:30"）
 *
 * 调用场景：定时触发器每分钟轮询时，用当前时间生成的 key 匹配规则配置。
 */
export function homeModeMinuteKey(date: Date, timeZone?: string): string {
  if (!timeZone) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}