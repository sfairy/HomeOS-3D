export function lineChartGeometry(
  samples: any,
  originX = 0,
  originY = 5,
  chartWidth = 100,
  chartHeight = 59,
) {
  const minValue = Math.min(...samples.map((minSample: any) => minSample.value)),
    maxValue = Math.max(...samples.map((maxSample: any) => maxSample.value)),
    valueRange = maxValue - minValue,
    maxAbsValue = Math.max(Math.abs(minValue), Math.abs(maxValue), 0.001),
    padding = Math.max(0.0001, valueRange * 0.12, maxAbsValue * 0.02),
    axisMin = minValue - padding,
    axisMax = maxValue + padding,
    axisSpan = Math.max(0.000001, axisMax - axisMin),
    firstTimestamp = samples[0].timestamp,
    lastTimestamp = Math.max(firstTimestamp + 1, samples.at(-1).timestamp),
    chartPoints = samples.map((sample: any) => ({
      ...sample,
      x:
        originX +
        ((sample.timestamp - firstTimestamp) / (lastTimestamp - firstTimestamp)) * chartWidth,
      y: originY + ((axisMax - sample.value) / axisSpan) * chartHeight,
    }));
  return {
    dataMin: minValue,
    dataMax: maxValue,
    minimum: axisMin,
    maximum: axisMax,
    span: axisSpan,
    firstTime: firstTimestamp,
    lastTime: lastTimestamp,
    points: chartPoints,
  };
}
export function normalizedStatePrecision(precisionSetting: any) {
  if (precisionSetting == null || precisionSetting === "" || precisionSetting === "auto")
    return "auto";
  const precisionNumber = Number(precisionSetting);
  return Number.isInteger(precisionNumber) && precisionNumber >= 0 && precisionNumber <= 4
    ? precisionNumber
    : "auto";
}
export function automaticNumericPrecision(magnitudeInput: any) {
  const magnitude = Math.abs(Number(magnitudeInput));
  return !Number.isFinite(magnitude) || magnitude === 0 || magnitude >= 100
    ? 0
    : magnitude >= 10
      ? 1
      : magnitude >= 1
        ? 2
        : magnitude >= 0.01
          ? 3
          : 4;
}
export function formatNumericValue(numericValue: any, precisionRequest = "auto") {
  const rawValue = Number(numericValue);
  if (!Number.isFinite(rawValue)) return "--";
  const normalizedPrecision = normalizedStatePrecision(precisionRequest),
    effectivePrecision =
      normalizedPrecision === "auto" ? automaticNumericPrecision(rawValue) : normalizedPrecision,
    formattedNumber = rawValue.toFixed(effectivePrecision);
  return normalizedPrecision === "auto" ? String(Number(formattedNumber)) : formattedNumber;
}
export function formatLineChartValue(sampleValue: any, precisionOption = "auto") {
  return formatNumericValue(sampleValue, precisionOption);
}
