/** 数值收敛工具：全前端唯一的「夹取区间」与「非有限数兜底」口径。 */

/** 把数值夹到 `[lowerBound, upperBound]`； */
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
