/**
 * @file duration.ts
 * @module @homeos/shared/orchestrator
 * @brief HA automation / script 时长字段的解析与格式化（前后端共用）。
 *
 * 职责：
 *  - 把 HA 多种时长写法（数字秒、"HH:MM:SS" 字符串、{ hours, minutes, seconds } 对象）统一解析为秒数；
 *  - 提供 Builder 表单字符串转换与 YAML 序列化输出。
 *
 * 关键依赖：
 *  - HA automation `delay` / `for` 字段、template trigger interval 等均按此时长格式。
 *
 * 约定：
 *  - 解析失败或 ≤ 0 返回 undefined（不抛异常）；
 *  - 输出 "HH:MM:SS" 时默认带双引号（HA YAML 中冒号需引号包裹避免歧义）。
 */

/**
 * 解析 HA automation / script 时长为秒数。
 *
 * @param raw 原始值：数字（秒）/ 字符串（"HH:MM:SS" 或 "300"）/ 对象 { hours, minutes, seconds }
 * @returns 秒数；非法或 ≤ 0 返回 undefined
 */
export function parseHaDuration(raw: unknown): number | undefined {
  if (typeof raw === 'number' && raw > 0) return raw;
  if (typeof raw === 'string') {
    const s = raw.replace(/"/g, '').trim();
    const parts = s.split(':');
    if (parts.length === 3) {
      const sec =
        parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
      return sec > 0 ? sec : undefined;
    }
    const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
    return Number.isNaN(n) || n <= 0 ? undefined : n;
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const sec =
      (Number(o.hours) || 0) * 3600 + (Number(o.minutes) || 0) * 60 + (Number(o.seconds) || 0);
    return sec > 0 ? sec : undefined;
  }
  return undefined;
}

/**
 * 前端 Builder 表单：原始时长 → 字符串秒。
 *
 * @param raw 原始值（同 parseHaDuration）
 * @returns 字符串形式的秒数；解析失败时返回纯数字字符串（保留原输入便于编辑）
 */
export function parseHaDurationToFormString(raw: unknown): string {
  if (typeof raw === 'number') return String(raw);
  const sec = parseHaDuration(raw);
  if (sec != null) return String(sec);
  if (typeof raw === 'string') {
    const s = raw.replace(/"/g, '').trim();
    return s.replace(/[^0-9]/g, '') || '';
  }
  return '';
}

/**
 * HA YAML 时长：秒 → "HH:MM:SS"（默认带引号）。
 *
 * @param totalSec 秒数（非法值按 0 处理）
 * @param options.quoted 是否包裹双引号（默认 true；HA YAML 中 HH:MM:SS 需引号避免被解析为 mapping）
 * @returns 形如 "01:30:00" 或 `"01:30:00"` 的字符串
 */
export function formatHaDuration(
  totalSec: unknown,
  { quoted = true }: { quoted?: boolean } = {},
): string {
  const sec = Math.max(0, parseInt(String(totalSec), 10) || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return quoted ? `"${formatted}"` : formatted;
}
