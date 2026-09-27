/**
 * 折线图几何与数值格式化。
 */

type AnyObj = Record<string, any>;

/**
 * 把时间序列映射到给定绘图区的坐标。
 */
export function lineChartGeometry(
  series: any,
  originX: any = 0,
  originY: any = 5,
  plotWidth: any = 100,
  plotHeight: any = 59
) {
  const dataMin = Math.min(...series.map((datapoint: any) => datapoint.value));
  const dataMax = Math.max(...series.map((seriesPoint: any) => seriesPoint.value));
  const valueSpan = dataMax - dataMin;
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
  const points = series.map((point: any) => ({
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
function normalizedStatePrecision(precisionOption: any) {
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
 */
function automaticNumericPrecision(inputValue: any) {
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
export function formatNumericValue(value: any, precisionSetting: any = "auto") {
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
    return formattedValue;
  }
}
/**
 * 把图表数值格式化成标签文案。
 */
export function formatLineChartValue(chartValue: any, precision: any = "auto") {
  return formatNumericValue(chartValue, precision);
}
