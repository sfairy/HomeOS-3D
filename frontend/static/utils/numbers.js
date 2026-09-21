/**
 * 数值换算与夹取。两族函数，契约各自不同，名字即契约。
 *
 * 一族把任意输入收敛成有限数，差别只在「认不认数字字符串」与失败时返回什么：
 *
 * | 函数 | 数字字符串 | 空白串 / 布尔 / 对象 / 数组 | 失败时 |
 * | --- | --- | --- | --- |
 * | `finiteNumberOr`        | 非法 | 非法 | 兜底值 |
 * | `coercedFiniteNumberOr` | 认   | 非法 | 兜底值 |
 * | `positiveNumberOr`      | 认   | 非法 | 兜底值（非正数也算非法，见下） |
 * | `finiteNumberOrNull`    | 认   | 非法 | `null` |
 *
 * 「认」指 `Number(x)` 能换算（`"3.5"` 与 `" 3.5 "` 都算）；「非法」一律回落，不尝试换算。
 * 非 number / string 的输入必须挡掉，这是本族唯一容易写错的地方：`Number("")` 是 0、
 * `Number(true)` 是 1、`Number([])` 也是 0，不挡就会把「用户清空了输入框」当成 0、把开关状态
 * 当成 1 参与几何计算；这类值接着还会被夹到区间下限，表面上只是「数值不对」，实际是配置已经
 * 写错了。`finiteNumberOr` 有意不认数字字符串，用于「值只可能由我们自己写成 number」的地方 ——
 * 让字符串混进来这种回归暴露成兜底值，而不是被静默接受。
 *
 * 另一族是夹取，参数顺序统一为 `(值, 下限, 上限[, 兜底])`，兜底值一律原样返回、不参与夹取，
 * 因此 `null` 这类区间外哨兵可当兜底。四个函数的差别只在「非法值」如何处理：
 *
 * `clampNumber` 交给 `Math`（`null` / `""` → 0，`NaN` 原样传播，故意不兜底）；
 * `clampCoercedNumber` 先 `Number()`，非有限数回落兜底；`clampOptionalNumber` 额外把
 * `null` / `""` 视为「未设置」；`clampTypedNumber` 只认真正的 number，数字字符串也算非法。
 *
 * 还有 `roundToDecimals`：不属于上面两族，作用是抹平浮点末位（缓存签名靠字符串比对，
 * 末位抖动会让缓存每帧失效）。精度必须由调用方显式传，见该函数的说明。
 */

/** 只有空白的字符串等同于没填，与 `""` 同等对待（表单里很常见）。 */
const isBlankText = value => typeof value === "string" && value.trim() === "";

/**
 * 只有 number 与 string 才算「可换算的输入」，其余（布尔 / `null` / `undefined` / 对象 / 数组）
 * 一律视为缺失。判在换算之前，避免 `Number()` 把脏值变成看似合法的数字：`Number(true)` 是 1、
 * `Number("")` 是 0、`Number([])` 也是 0 —— 三个都不该被当成有效数值。
 */
const isAbsentValue = value =>
  (typeof value !== "number" && typeof value !== "string") || isBlankText(value);

/** 只认真正的 number（数字字符串也算非法）；非法时用兜底值。 */
export function finiteNumberOr(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * 值是否算「已上报的可用数值」：数字与数字字符串算可用，其余一律算缺失。
 *
 * 这是能力探测（HA 属性里有没有亮度 / 色温）与实时值等待判定共用的唯一口径。
 * 「空串算缺失」不是洁癖：`Number("")` 是 0，只写 `Number.isFinite(Number(v))` 会把
 * `brightness: ""` 判成「已上报亮度 0」，于是能力探测回答「支持亮度」—— 界面上出现一根
 * 亮度条、拖了却毫无作用，不报错、也不 404。布尔同理（`true` 会被换算成 1）。
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
 *
 * 用在「尺寸 / 长度 / 缩放」这类 0 与负数都没有意义的字段：0 宽高的元素不报错、也不可见，
 * 排查起来只能靠猜；负数在这里同样是写错了配置。与 `coercedFiniteNumberOr` 的区别仅此一条。
 */
export function positiveNumberOr(value, fallback) {
  const parsedValue = isAbsentValue(value) ? NaN : Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

/**
 * 先 `Number()` 再判定；非有限数一律 `null`。
 * 返回 `null` 而不是 0：调用方要能区分「设备没上报」与「上报的就是 0」，后者往往有语义。
 */
export function finiteNumberOrNull(value) {
  const parsedValue = isAbsentValue(value) ? NaN : Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

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

/**
 * 按指定小数位四舍五入，用于**抹平浮点末位**：缓存签名 / 布局签名靠字符串比对判断「内容是否变化」，
 * 而矩阵元素同一机位两次算出的末位都可能差 1e-16，不抹平就会每帧都判脏、缓存彻底失效。
 *
 * `decimals` 必须由调用方显式给出，因为「抹到几位」是各调用方的精度契约，不是通用常量：
 * 相机矩阵抹到 8 位（1e-8 米远低于渲染精度），家具布局签名抹到 4 位（拖拽产生的 0.1mm 级抖动
 * 不该触发重烘）。参数给 0 即取整。
 */
export function roundToDecimals(numericValue, decimals) {
  const scale = 10 ** decimals;
  return Math.round(numericValue * scale) / scale;
}
