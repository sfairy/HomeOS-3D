/**
 * 控件渲染共用的小工具：颜色校验、字重应用、SVG 建元素、内容尺寸单位换算、图表阈值色带解析。
 */
import { clampCoercedNumber } from "../../../utils/numbers.js?v=2609271411";
import {
  CHART_THRESHOLD_FALLBACK_COLOR,
  CHART_THRESHOLD_FALLBACK_COLORS
} from "../../controls/weather-chart-runtime.js?v=2609271411";
import {
  paletteColor,
  resolveColor
} from "../../../utils/colors.js?v=2609271411";

export { paletteColor, resolveColor };

const CHART_THRESHOLD_TOKENS = ["--hos-eco-bright", "--hos-eco", "--hos-heat", "--hos-alert"];

/**
 * 把图表阈值色带解析成实际色值。
 */
export function chartThresholdPalette() {
  return {
    gradient: CHART_THRESHOLD_TOKENS.map((thresholdToken, thresholdIndex) =>
      paletteColor(thresholdToken, CHART_THRESHOLD_FALLBACK_COLORS[thresholdIndex])
    ),
    defaultColor: paletteColor("--hos-eco", CHART_THRESHOLD_FALLBACK_COLOR)
  };
}

/**
 * 以「极细字重 + 描边」还原设计稿字重：字重有 1~900 与 0~1 两种量纲，先归一化到 0~1。
 */
export function applyFontWeight(targetElement, fontWeightValue, fontSizeValue) {
  const weightNumber = Number(fontWeightValue);
  const normalizedWeight =
    Number.isFinite(weightNumber) && weightNumber > 1
      ? clampCoercedNumber((weightNumber - 1) / 899, 0, 1, 0.4)
      : clampCoercedNumber(weightNumber, 0, 1, 0.4);
  const strokeFontSize = Math.max(1, Number(fontSizeValue || 16));
  const strokeWidthPx = normalizedWeight * strokeFontSize * 0.05;
  targetElement.style.fontWeight = "100";
  targetElement.style.webkitTextStroke = strokeWidthPx.toFixed(3) + "px currentColor";
  targetElement.style.paintOrder = "stroke fill";
}

/**
 * 创建 SVG 元素并挂到父节点。
 */
export function appendSvgElement(svgParentElement, svgTagName, svgAttributes = {}) {
  const createdSvgElement = document.createElementNS("http://www.w3.org/2000/svg", svgTagName);
  for (const [svgAttributeName, svgAttributeValue] of Object.entries(svgAttributes)) {
    createdSvgElement.setAttribute(svgAttributeName, String(svgAttributeValue));
  }
  svgParentElement.append(createdSvgElement);
  return createdSvgElement;
}

/**
 * 把控件尺寸换算成「内容单位」：除以 componentScale 再除以 100 的相对值。
 */
export function componentContentUnitsPx(unitComponent, unitContext) {
  const componentScale = Math.max(0.01, Number(unitContext?.document?.canvas?.componentScale || 1));
  return {
    width: Math.max(1, Number(unitComponent?.position?.width || 100)) / componentScale / 100,
    height: Math.max(1, Number(unitComponent?.position?.height || 100)) / componentScale / 100
  };
}

/**
 * 导航按钮专用内容单位：以 64.36 的设计基准高度换算，
 */
export function navigationContentUnitPx(navigationUnitComponent, navigationUnitContext) {
  return (
    (componentContentUnitsPx(navigationUnitComponent, navigationUnitContext).height * 100) / 64.36
  );
}
