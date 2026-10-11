/**
 * @file attr-value-equals.util.ts
 * @module @homeos/shared/entity
 * @brief 实体属性值业务语义比较（前端 state-update attrValueEquals 的共享真相源）。
 *
 * 职责：
 *  - 判断两个属性值在业务语义上是否「无变化」，用于乐观匹配与变更通知判定；
 *  - 键序无关的对象/数组递归浅比较；数值在 1 以内容差视为相等；
 *  - 关键：IEEE 754 中 NaN !== NaN，但业务上"传感器读数丢失(NaN) → 再次丢失(NaN)"应视为
 *    无变化，避免无意义乐观 bump 与 UI 闪烁刷新。
 *
 * 约定：
 *  - NaN 与 NaN 视为相等；
 *  - 单 NaN 与非 NaN 视为不等；null/undefined 与非 null/undefined 视为不等；
 *  - 空串/纯空白串不参与数值归一（'' 与 0/其他值不等，'' 与空白串相等）。
 */

/**
 * 属性值业务语义相等判定（键序无关；数值容差 1）。
 *
 * @param a 前一属性值
 * @param b 后一属性值
 * @returns true 表示两值在业务比较语义下相等（无需触发响应式/乐观 bump）
 */
export function attrValueEquals(a: unknown, b: unknown): boolean {
  // Logic fix: C-4.1/路径5/候选5-A — NaN 读数丢失的传感器再次丢失时应视为"属性无变化"，
  // 避免响应式乐观 bump 与 UI 无意义刷新。IEEE 754 NaN≠NaN 正确，但此处业务比较语义要求两者等价。
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  // Logic fix: 空串/纯空白不应被 Number() 归一为 0（否则 '' 会被判定等于 0），
  // 且 '' 与空白串应视为相等；与下方数字/字符串数值比较语义保持一致。
  if (typeof a === 'string' && a.trim() === '') {
    return typeof b === 'string' && b.trim() === '';
  }
  if (typeof b === 'string' && b.trim() === '') {
    return typeof a === 'string' && a.trim() === '';
  }
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return Math.abs(a - b) <= 1;
  }
  if (
    (typeof a === 'number' || typeof a === 'string') &&
    (typeof b === 'number' || typeof b === 'string')
  ) {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) <= 1) return true;
  }
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!attrValueEquals(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys) {
      if (!attrValueEquals(ao[k], bo[k])) return false;
    }
    return true;
  }
  return false;
}
