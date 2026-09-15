const WEATHER_VISUALS_BY_CONDITION = {
  sunny: ["clear-day", "晴"],
  "clear-night": ["clear-night", "晴"],
  partlycloudy: ["partly-cloudy-day", "多云"],
  cloudy: ["overcast", "阴"],
  rainy: ["rain", "小雨"],
  pouring: ["extreme-rain", "大雨"],
  lightning: ["thunderstorms", "雷电"],
  "lightning-rainy": ["thunderstorms-rain", "雷雨"],
  snowy: ["snow", "下雪"],
  "snowy-rainy": ["sleet", "雨夹雪"],
  fog: ["fog", "雾"],
  windy: ["wind", "大风"],
  "windy-variant": ["wind", "有风"],
  hail: ["hail", "冰雹"],
  exceptional: ["code-red", "异常天气"]
};
export function weatherVisual(condition, sunState = "") {
  let normalizedCondition = String(condition || "")
    .trim()
    .toLowerCase();
  const isBelowHorizon = sunState === "below_horizon";
  if (isBelowHorizon && normalizedCondition === "sunny") {
    normalizedCondition = "clear-night";
  }
  if (isBelowHorizon && normalizedCondition === "partlycloudy") {
    return ["partly-cloudy-night", "多云"];
  } else {
    return (
      WEATHER_VISUALS_BY_CONDITION[normalizedCondition] || [
        "code-red",
        normalizedCondition && !["unknown", "unavailable"].includes(normalizedCondition)
          ? normalizedCondition
          : "天气不可用"
      ]
    );
  }
}
export function meteoconUrl(iconName) {
  const normalizedIconName = String(iconName || "").trim();
  if (/^[a-z0-9-]+$/.test(normalizedIconName)) {
    return "/static/vendor/meteocons/fill/" + normalizedIconName + ".svg";
  } else {
    return "/static/vendor/meteocons/fill/code-red.svg";
  }
}
function sanitizeCssColor(color, fallbackColor) {
  const trimmedColor = String(color || "").trim();
  if (/^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(trimmedColor)) {
    return trimmedColor;
  } else {
    return fallbackColor;
  }
}
const THRESHOLD_GRADIENT_COLORS = ["#ddffc2", "#68cc3e", "#ff8e52", "#ff1a1a"];
function sampleArrayAtRatio(values, ratio) {
  if (!values.length) {
    return NaN;
  }
  const scaledIndex = (values.length - 1) * ratio;
  const lowerIndex = Math.floor(scaledIndex);
  const upperIndex = Math.ceil(scaledIndex);
  if (lowerIndex === upperIndex) {
    return values[lowerIndex];
  } else {
    return (
      values[lowerIndex] + (values[upperIndex] - values[lowerIndex]) * (scaledIndex - lowerIndex)
    );
  }
}
export function normalizedThresholds(thresholds) {
  return (Array.isArray(thresholds) ? thresholds : [])
    .filter(entry => Number.isFinite(Number(entry?.value)))
    .map(threshold => ({
      value: Number(threshold.value),
      color: sanitizeCssColor(threshold.color, "#68cc3e")
    }))
    .sort((leftEntry, rightEntry) => leftEntry.value - rightEntry.value);
}
export function automaticThresholds(series) {
  const sortedValues = (Array.isArray(series) ? series : [])
    .map(seriesValue => Number(seriesValue?.value ?? seriesValue))
    .filter(numericSeriesValue => Number.isFinite(numericSeriesValue))
    .sort((leftValue, rightValue) => leftValue - rightValue);
  if (!sortedValues.length) {
    return [];
  }
  let minimumValue = sampleArrayAtRatio(sortedValues, sortedValues.length >= 5 ? 0.05 : 0);
  let maximumValue = sampleArrayAtRatio(sortedValues, sortedValues.length >= 5 ? 0.95 : 1);
  if (!Number.isFinite(minimumValue) || !Number.isFinite(maximumValue)) {
    return [];
  }
  if (maximumValue < minimumValue) {
    [minimumValue, maximumValue] = [maximumValue, minimumValue];
  }
  const valueSpan = maximumValue - minimumValue;
  const spanEpsilon = Math.max(Math.abs(minimumValue), Math.abs(maximumValue), 1) * 1e-9;
  if (valueSpan <= spanEpsilon) {
    const padding = Math.max(Math.abs(minimumValue) * 0.01, 0.01);
    return [
      {
        value: minimumValue - padding,
        color: THRESHOLD_GRADIENT_COLORS[0]
      },
      {
        value: minimumValue,
        color: THRESHOLD_GRADIENT_COLORS[1]
      },
      {
        value: minimumValue + padding,
        color: THRESHOLD_GRADIENT_COLORS[2]
      },
      {
        value: minimumValue + padding * 2,
        color: THRESHOLD_GRADIENT_COLORS[3]
      }
    ];
  }
  const step = valueSpan / (THRESHOLD_GRADIENT_COLORS.length - 1);
  return THRESHOLD_GRADIENT_COLORS.map((colorScaleColor, colorIndex) => ({
    value: minimumValue + step * colorIndex,
    color: colorScaleColor
  }));
}
export function resolvedThresholds(manualThresholds, seriesValues, thresholdMode = "") {
  const normalizedManualThresholds = normalizedThresholds(manualThresholds);
  if (thresholdMode === "auto") {
    return automaticThresholds(seriesValues);
  } else if (thresholdMode === "manual" || normalizedManualThresholds.length) {
    return normalizedManualThresholds;
  } else {
    return automaticThresholds(seriesValues);
  }
}
export function thresholdColor(sortedThresholds, value) {
  return (
    sortedThresholds.filter(candidate => value >= candidate.value).at(-1)?.color ||
    sortedThresholds[0]?.color ||
    "#68cc3e"
  );
}
export function smoothChartPath(points) {
  if (!points.length) {
    return "";
  }
  if (points.length === 1) {
    return "M0 " + points[0].y + " L100 " + points[0].y;
  }
  let path = "M" + points[0].x.toFixed(3) + " " + points[0].y.toFixed(3);
  for (let index = 0; index < points.length - 1; index += 1) {
    const currentPoint = points[index];
    const nextPoint = points[index + 1];
    const previousPoint = points[index - 1] || currentPoint;
    const afterNextPoint = points[index + 2] || nextPoint;
    const control1X = currentPoint.x + (nextPoint.x - previousPoint.x) / 6;
    const control1Y = currentPoint.y + (nextPoint.y - previousPoint.y) / 6;
    const control2X = nextPoint.x - (afterNextPoint.x - currentPoint.x) / 6;
    const control2Y = nextPoint.y - (afterNextPoint.y - currentPoint.y) / 6;
    path +=
      " C" +
      control1X.toFixed(3) +
      " " +
      control1Y.toFixed(3) +
      " " +
      control2X.toFixed(3) +
      " " +
      control2Y.toFixed(3) +
      " " +
      nextPoint.x.toFixed(3) +
      " " +
      nextPoint.y.toFixed(3);
  }
  return path;
}
