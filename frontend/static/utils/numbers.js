/**
 * 数值夹取。参数顺序统一为 `(值, 下限, 上限[, 兜底])`，兜底值一律原样返回、不参与夹取，
 * 因此 `null` 这类区间外哨兵可当兜底。四个函数的差别只在「非法值」如何处理：
 *
 * `clampNumber` 交给 `Math`（`null` / `""` → 0，`NaN` 原样传播，故意不兜底）；
 * `clampCoercedNumber` 先 `Number()`，非有限数回落兜底；`clampOptionalNumber` 额外把
 * `null` / `""` 视为「未设置」；`clampTypedNumber` 只认真正的 number，数字字符串也算非法。
 */

/** 纯夹取：不做换算、也不兜底。只该用在已确认是数字的地方。 */
export function clampNumber(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/** 先换算再夹取：`Number(value)` 是有限数就夹，否则用兜底值。 */
export function clampCoercedNumber(value, minimum, maximum, fallback) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue)
    ? Math.max(minimum, Math.min(maximum, parsedValue))
    : fallback;
}

/** 空值感知的夹取：`null` / `undefined` / 空串视为「未设置」，直接回落兜底值。 */
export function clampOptionalNumber(value, minimum, maximum, fallback) {
  const parsedValue = value == null || value === "" ? NaN : Number(value);
  if (Number.isFinite(parsedValue)) {
    return Math.max(minimum, Math.min(maximum, parsedValue));
  } else {
    return fallback;
  }
}

/** 只认真正的数字（数字字符串算非法）：用在「值只可能是我们自己写进去的 number」的地方。 */
export function clampTypedNumber(value, minimum, maximum, fallback) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}
