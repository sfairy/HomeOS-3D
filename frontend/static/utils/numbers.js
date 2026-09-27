/**
 * 数值换算与夹取。两族函数，契约各自不同，名字即契约。
 */

/** 只有空白的字符串等同于没填，与 `""` 同等对待（表单里很常见）。 */
const isBlankText = value => typeof value === "string" && value.trim() === "";

const isAbsentValue = value =>
  (typeof value !== "number" && typeof value !== "string") || isBlankText(value);

/** 只认真正的 number（数字字符串也算非法）；非法时用兜底值。 */
export function finiteNumberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * 值是否算「已上报的可用数值」：数字与数字字符串算可用，其余一律算缺失。
 */
export function isUsableNumber(value) {
  return !isAbsentValue(value) && Number.isFinite(Number(value));
}

/** 先 `Number()` 再判定；非有限数用兜底值。 */
export function coercedFiniteNumberOr(value, fallback) {
  const parsedValue = isAbsentValue(value) ? NaN : Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

/**
 * 先 `Number()` 再判定；非有限数**或非正数**用兜底值。
 */
export function positiveNumberOr(value, fallback) {
  const parsedValue = isAbsentValue(value) ? NaN : Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

/**
 * 先 `Number()` 再判定；非有限数一律 `null`。
 */
export function finiteNumberOrNull(value) {
  const parsedValue = isAbsentValue(value) ? NaN : Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

/** 纯夹取：不做换算、也不兜底。只该用在已确认是数字的地方。 */
export function clampNumber(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

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

/**
 * 按指定小数位四舍五入，用于**抹平浮点末位**：缓存签名 / 布局签名靠字符串比对判断「内容是否变化」，
 */
export function roundToDecimals(numericValue, decimals) {
  const scale = 10 ** decimals;
  return Math.round(numericValue * scale) / scale;
}
