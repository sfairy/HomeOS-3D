export function lineChartGeometry(arg1, arg2 = 0, arg3 = 5, arg4 = 100, arg5 = 59) {
  const value1 = Math.min(...arg1.map((arg6) => arg6.value)),
    value2 = Math.max(...arg1.map((arg7) => arg7.value)),
    value3 = value2 - value1,
    value4 = Math.max(Math.abs(value1), Math.abs(value2), 0.001),
    value5 = Math.max(0.0001, value3 * 0.12, value4 * 0.02),
    value6 = value1 - value5,
    value7 = value2 + value5,
    value8 = Math.max(0.000001, value7 - value6),
    value9 = arg1[0].timestamp,
    value10 = Math.max(value9 + 1, arg1.at(-1).timestamp),
    value11 = arg1.map((arg8) => ({
      ...arg8,
      x: arg2 + ((arg8.timestamp - value9) / (value10 - value9)) * arg4,
      y: arg3 + ((value7 - arg8.value) / value8) * arg5,
    }));
  return {
    dataMin: value1,
    dataMax: value2,
    minimum: value6,
    maximum: value7,
    span: value8,
    firstTime: value9,
    lastTime: value10,
    points: value11,
  };
}
export function normalizedStatePrecision(arg9) {
  if (arg9 == null || arg9 === "" || arg9 === "auto") return "auto";
  const value12 = Number(arg9);
  return Number.isInteger(value12) && value12 >= 0 && value12 <= 4 ? value12 : "auto";
}
export function automaticNumericPrecision(arg10) {
  const value13 = Math.abs(Number(arg10));
  return !Number.isFinite(value13) || value13 === 0 || value13 >= 100
    ? 0
    : value13 >= 10
      ? 1
      : value13 >= 1
        ? 2
        : value13 >= 0.01
          ? 3
          : 4;
}
export function formatNumericValue(arg11, arg12 = "auto") {
  const value14 = Number(arg11);
  if (!Number.isFinite(value14)) return "--";
  const value15 = normalizedStatePrecision(arg12),
    value16 = value15 === "auto" ? automaticNumericPrecision(value14) : value15,
    value17 = value14.toFixed(value16);
  return value15 === "auto" ? String(Number(value17)) : value17;
}
export function formatLineChartValue(arg13, arg14 = "auto") {
  return formatNumericValue(arg13, arg14);
}
