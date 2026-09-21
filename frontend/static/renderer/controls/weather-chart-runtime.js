/**
 * 天气图表的数据映射与曲线绘制。
 *
 * 职责：把 HA 天气状态（sunny / rainy / …）映射成图标名与中文文案并按昼夜修正；转出 meteocons
 * 图标地址（实现在 utils/icon-url.js，这里只是同名转出口）；由序列推导阈值色带或归一化手填阈值；
 * 把点集转成平滑的 SVG 路径。
 *
 * 位置：纯计算模块，折线 / 天气图表控件渲染时调用；不碰网络与 DOM。
 * 约定：条件字符串与图标名沿用 HA 与 meteocons 的既有命名，改动会直接影响图标能否加载。
 */

// 天气条件 → [meteocons 图标名, 中文文案]。文案会直接上屏，与界面约定死的字符串一致。
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
/**
 * 取天气图标名与文案。
 * HA 的天气条件不含昼夜信息，sunny / partlycloudy 日落后必须换夜间图标，否则晚上会
 * 显示大太阳；unknown / unavailable 用通用异常图标，不把原始状态当文案上屏。
 */
export function weatherVisual(condition, sunState = "") {
  let normalizedCondition = String(condition || "")
    .trim()
    .toLowerCase();
  const isBelowHorizon = sunState === "below_horizon";
  if (isBelowHorizon && normalizedCondition === "sunny") {
    normalizedCondition = "clear-night";
  }
  // partlycloudy 单独处理：夜间需要换成 partly-cloudy-night，而它在映射表里没有对应项。
  if (isBelowHorizon && normalizedCondition === "partlycloudy") {
    return ["partly-cloudy-night", "多云"];
  } else {
    return (
      WEATHER_VISUALS_BY_CONDITION[normalizedCondition] || [
        "code-red",
        // 认不出的条件原样显示（便于排查），只有明确的无效状态才回落到「天气不可用」。
        normalizedCondition && !["unknown", "unavailable"].includes(normalizedCondition)
          ? normalizedCondition
          : "天气不可用"
      ]
    );
  }
}
/**
 * 拼 meteocons 图标地址。
 * 实现见 `utils/icon-url.js`（与 `mdiIconUrl` 同属「图标名 → vendor 地址」这份知识，
 * 共用同一条白名单）；这里保留同名转出，页面脚本仍只 import registry 一处。
 */
export { meteoconUrl } from "../../utils/icon-url.js?v=2609220023";
// 颜色校验（不合法用兜底色）与控件渲染共用同一份白名单实现，见 utils/colors.js。
import { resolveColor } from "../../utils/colors.js?v=2609220023";
// 自动阈值的四档渐变色：由浅绿到红，对应「低 → 高」。顺序即取值由小到大，不能重排。
const THRESHOLD_GRADIENT_COLORS = ["#ddffc2", "#68cc3e", "#ff8e52", "#ff1a1a"];
/**
 * 在升序数组上按比例取插值样本，相当于一次轻量的分位数查询。
 */
function sampleArrayAtRatio(values, ratio) {
  if (!values.length) {
    return NaN;
  }
  // 按比例落到的浮点下标：floor / ceil 各取一个端点，再按小数部分线性插值。
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
/**
 * 归一化用户手填的阈值：丢掉非数值项、校验颜色、按值升序排列。
 * 排序是必须的：thresholdColor 依赖「升序 + 取最后一个不超过当前值的档位」，
 * 顺序错了颜色就会错档。
 */
function normalizedThresholds(thresholds) {
  return (Array.isArray(thresholds) ? thresholds : [])
    .filter(entry => Number.isFinite(Number(entry?.value)))
    .map(threshold => ({
      value: Number(threshold.value),
      color: resolveColor(threshold.color, "#68cc3e")
    }))
    .sort((leftEntry, rightEntry) => leftEntry.value - rightEntry.value);
}
/**
 * 由序列自动生成四档阈值。
 * 用分位数而非极值：点数 ≥5 时取 5% 与 95% 分位，离群点不会把色带拉平；点数太少退化为取最小 / 最大。
 * 序列几乎恒定（跨度小于浮点误差量级）时用 ±padding 撑开四档，否则四档重叠成同一个值、图上只剩一种颜色。
 */
function automaticThresholds(series) {
  // 拍平成升序数值数组；非数值项（null / 纯字符串 / 缺 value 的项）在这一步就被滤掉。
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
  // 用相对误差量级判断「几乎恒定」，避免绝对值相近但量级差别很大的序列被误判。
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
  // 正常情况：把区间三等分，四个端点各取一种颜色。
  const step = valueSpan / (THRESHOLD_GRADIENT_COLORS.length - 1);
  return THRESHOLD_GRADIENT_COLORS.map((colorScaleColor, colorIndex) => ({
    value: minimumValue + step * colorIndex,
    color: colorScaleColor
  }));
}
/**
 * 决定最终使用的阈值集合。
 */
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
/**
 * 取某个数值对应的颜色。
 */
export function thresholdColor(sortedThresholds, value) {
  return (
    sortedThresholds.filter(candidate => value >= candidate.value).at(-1)?.color ||
    sortedThresholds[0]?.color ||
    "#68cc3e"
  );
}
/**
 * 把点集转成平滑的三次贝塞尔路径。
 * 控制点按 Catmull-Rom 转 Bézier 的经典做法取相邻点差的 1/6，首尾点用自身补齐
 * （previousPoint / afterNextPoint），端点也能得到切线而不出现折角；坐标保留三位小数。
 */
export function smoothChartPath(points) {
  if (!points.length) {
    return "";
  }
  if (points.length === 1) {
    // 只有一个点画不出线，用一条水平线表达「该值恒定」而不是留白。
    return "M0 " + points[0].y + " L100 " + points[0].y;
  }
  let path = "M" + points[0].x.toFixed(3) + " " + points[0].y.toFixed(3);
  for (let index = 0; index < points.length - 1; index += 1) {
    const currentPoint = points[index];
    const nextPoint = points[index + 1];
    const previousPoint = points[index - 1] || currentPoint;
    const afterNextPoint = points[index + 2] || nextPoint;
    // 1/6 是 Catmull-Rom 转 Bézier 的系数，展开后即相邻两点差的三分之一。
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
