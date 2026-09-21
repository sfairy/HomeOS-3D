/**
 * 折线图几何与数值格式化。
 *
 * 把一组带 timestamp / value 的序列点映射到 SVG 用户坐标系，并按精度设置格式化数值标签。
 * 纯计算模块，不做 DOM、不引控件注册表；控件提供 viewBox 尺寸与序列数据。坐标系与 SVG
 * 一致：原点在左上、y 轴向下，数值越大映射出的 y 越小。
 */

/**
 * 把时间序列映射到给定绘图区的坐标。
 */
export function lineChartGeometry(
  series,
  originX = 0,
  originY = 5,
  plotWidth = 100,
  plotHeight = 59
) {
  const dataMin = Math.min(...series.map(datapoint => datapoint.value));
  const dataMax = Math.max(...series.map(seriesPoint => seriesPoint.value));
  const valueSpan = dataMax - dataMin;
  // 三重保底：数值本身可能全为 0，此时 magnitude 兜到 0.001，避免留白算成 0 后除零。
  const valueMagnitude = Math.max(Math.abs(dataMin), Math.abs(dataMax), 0.001);
  // 上下各留一点空间，曲线不至于贴边；恒定序列（span 为 0）靠 magnitude 那一项撑出留白。
  const valuePadding = Math.max(0.0001, valueSpan * 0.12, valueMagnitude * 0.02);
  const minimum = dataMin - valuePadding;
  const maximum = dataMax + valuePadding;
  // span 再次兜底，保证后面做分母时不会出现 0 或负数。
  const span = Math.max(0.000001, maximum - minimum);
  const firstTime = series[0].timestamp;
  // 所有点时间戳相同时 lastTime 会等于 firstTime，+1 是为了让时间轴分母非零。
  const lastTime = Math.max(firstTime + 1, series.at(-1).timestamp);
  const points = series.map(point => ({
    ...point,
    x: originX + ((point.timestamp - firstTime) / (lastTime - firstTime)) * plotWidth,
    y: originY + ((maximum - point.value) / span) * plotHeight
  }));
  return {
    dataMin: dataMin,
    dataMax: dataMax,
    minimum: minimum,
    maximum: maximum,
    span: span,
    firstTime: firstTime,
    lastTime: lastTime,
    points: points
  };
}
/**
 * 归一化精度设置：只接受 0~4 的整数，其余（含 auto、空值、越界、非整数）一律回落到 auto。
 */
function normalizedStatePrecision(precisionOption) {
  if (precisionOption == null || precisionOption === "" || precisionOption === "auto") {
    return "auto";
  }
  const parsedPrecision = Number(precisionOption);
  if (Number.isInteger(parsedPrecision) && parsedPrecision >= 0 && parsedPrecision <= 4) {
    return parsedPrecision;
  } else {
    return "auto";
  }
}
/**
 * 按量级自动挑选小数位：>=100 取整、>=10 一位、>=1 两位、>=0.01 三位、更小四位。
 * 读数长度基本稳定，又不会把温度之类的小数压掉。
 */
function automaticNumericPrecision(inputValue) {
  const magnitude = Math.abs(Number(inputValue));
  if (!Number.isFinite(magnitude) || magnitude === 0 || magnitude >= 100) {
    return 0;
  } else if (magnitude >= 10) {
    return 1;
  } else if (magnitude >= 1) {
    return 2;
  } else if (magnitude >= 0.01) {
    return 3;
  } else {
    return 4;
  }
}
/**
 * 按精度设置格式化数值。
 */
export function formatNumericValue(value, precisionSetting = "auto") {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "--";
  }
  const resolvedPrecision = normalizedStatePrecision(precisionSetting);
  const precisionDigits =
    resolvedPrecision === "auto" ? automaticNumericPrecision(numericValue) : resolvedPrecision;
  const formattedValue = numericValue.toFixed(precisionDigits);
  if (resolvedPrecision === "auto") {
    // 自动模式下再转一次数字，把 "12.30" 这类尾零抹掉。
    return String(Number(formattedValue));
  } else {
    // 用户显式指定精度时刻意保留尾零，保证同列数字位数对齐。
    return formattedValue;
  }
}
/**
 * 把图表数值格式化成标签文案。
 * 薄封装：精度规则交给 formatNumericValue，控件侧不必直接依赖数值格式化模块的命名。
 */
export function formatLineChartValue(chartValue, precision = "auto") {
  return formatNumericValue(chartValue, precision);
}
