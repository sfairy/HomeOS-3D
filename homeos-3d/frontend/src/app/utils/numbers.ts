/**
 * 数值换算与夹取。两族函数，契约各自不同，名字即契约。
 */

const isBlankText = (value: unknown): boolean =>
  typeof value === "string" && value.trim() === "";

const isAbsentValue = (value: unknown): boolean =>
  (typeof value !== "number" && typeof value !== "string") || isBlankText(value);

/** 只认真正的 number（数字字符串也算非法）；非法时用兜底值。 */
export function finiteNumberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** 值是否算「已上报的可用数值」：数字与数字字符串算可用，其余一律算缺失。 */
export function isUsableNumber(value: unknown): boolean {
  return !isAbsentValue(value) && Number.isFinite(Number(value));
}

/** 先 `Number()` 再判定；非有限数用兜底值。 */
export function coercedFiniteNumberOr<T>(value: unknown, fallback: T): number | T {
  const parsedValue = isAbsentValue(value) ? NaN : Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

/** 先 `Number()` 再判定；非有限数**或非正数**用兜底值。 */
export function positiveNumberOr<T>(value: unknown, fallback: T): number | T {
  const parsedValue = isAbsentValue(value) ? NaN : Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

/** 先 `Number()` 再判定；非有限数一律 `null`。 */
export function finiteNumberOrNull(value: unknown): number | null {
  const parsedValue = isAbsentValue(value) ? NaN : Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

/** 纯夹取：不做换算、也不兜底。只该用在已确认是数字的地方。 */
export function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function clampCoercedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue)
    ? Math.max(minimum, Math.min(maximum, parsedValue))
    : fallback;
}

/** 空值感知的夹取：`null` / `undefined` / 空串视为「未设置」，直接回落兜底值。 */
export function clampOptionalNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const parsedValue = value == null || value === "" ? NaN : Number(value);
  if (Number.isFinite(parsedValue)) {
    return Math.max(minimum, Math.min(maximum, parsedValue));
  }
  return fallback;
}

/** 只认真正的数字（数字字符串算非法）。 */
export function clampTypedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

/** 按指定小数位四舍五入，用于抹平浮点末位。 */
export function roundToDecimals(numericValue: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(numericValue * scale) / scale;
}
