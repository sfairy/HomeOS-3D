/**
 * 数值收敛工具：全前端唯一的「夹取区间」与「非有限数兜底」口径。
 *
 * 背景：`clamp` / `finiteNumberOr` 在 editor-utils、light-motion、camera-motion、
 * courtyard-drawing 里各写了一份（共 4 份 clamp、3 份 finiteOr），实现完全一致。
 * 这里收成一处，调用点保持原有名称与参数顺序，行为不变。
 */

/** 把数值夹到 `[lowerBound, upperBound]`；NaN 会原样传出，需要兜底请配合 finiteNumberOr。 */
export function clampNumber(sourceNumber: number, lowerBound: number, upperBound: number): number {
  return Math.max(lowerBound, Math.min(upperBound, sourceNumber));
}

/** 非有限数（NaN / ±Infinity / 非 number 类型）时退回 `fallbackValue`。 */
export function finiteNumberOr(candidateValue: unknown, fallbackValue: number): number;
export function finiteNumberOr(candidateValue: unknown, fallbackValue: any): any;
export function finiteNumberOr(candidateValue: unknown, fallbackValue: any): any {
  return Number.isFinite(candidateValue) ? (candidateValue as number) : fallbackValue;
}

/**
 * 先 `Number(...)` 再判有限：用于「可能来自 JSON 的字符串」输入（`"0.4"` → `0.4`）。
 * 与 {@link finiteNumberOr} 的差别是它会接受可转成数字的字符串。
 */
export function finiteNumberOrCoerced(candidateValue: unknown, fallbackValue: number): number;
export function finiteNumberOrCoerced(candidateValue: unknown, fallbackValue: any): any;
export function finiteNumberOrCoerced(candidateValue: unknown, fallbackValue: any): any {
  const numericValue = Number(candidateValue);
  return Number.isFinite(numericValue) ? numericValue : fallbackValue;
}
