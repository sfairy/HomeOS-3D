/**
 * 控件渲染共用的小工具：颜色校验、字重应用、SVG 建元素、内容尺寸单位换算、图表阈值色带解析。
 *
 * 这些函数被多个 `components/*.js` 使用。`resolveColor` / `paletteColor` 的唯一实现在
 * `utils/colors.js`（与天气图表共用同一份白名单），这里只做转出以保持「同门分片」的导入路径不变；
 * `chartThresholdPalette()` 是唯一在本文件里新增逻辑的函数，见其上方注释说明为什么读令牌
 * 这一步必须留在渲染层。
 */
// 数值夹取统一走 utils/numbers.js。`clampNumber` 只用于三处：那三处 `clampCoercedNumber`
// 的兜底是**算出来的表达式**、存在越界的现实可能，所以要在调用点先夹一次
// （见 `utils/numbers.js` 模块头那张口径表）。
import { clampCoercedNumber } from "../../../utils/numbers.js?v=2609260929";
import {
  CHART_THRESHOLD_FALLBACK_COLOR,
  CHART_THRESHOLD_FALLBACK_COLORS
} from "../../controls/weather-chart-runtime.js?v=2609260929";
// 必须 import 出一份本地绑定再用 export { … } 转出，不能写 `export { … } from "…"`：
// 那种写法只转发、不在本模块建绑定，下面 chartThresholdPalette() 里取 paletteColor 会 ReferenceError
// （不报错、只在渲染图表时整块挂掉 —— 这条已由 tools/check_invariants.mjs 拦下）。
import {
  paletteColor,
  resolveColor
} from "../../../utils/colors.js?v=2609260929";

export { paletteColor, resolveColor };

/* 图表阈值色带对应的四枚调色板令牌，顺序与 CHART_THRESHOLD_FALLBACK_COLORS 一一对应（低 → 高）。
   色带本身是数据可视化语义，不能换成主控色，但这四档各自都落在一个已有语义族上：
   亮薄荷（安全）→ 薄荷（正常）→ 暖热（偏高）→ 珊瑚（告警）。 */
const CHART_THRESHOLD_TOKENS = ["--hos-eco-bright", "--hos-eco", "--hos-heat", "--hos-alert"];

/**
 * 把图表阈值色带解析成实际色值。
 *
 * 为什么需要这个函数：`weather-chart-runtime.js` 是纯计算模块、按约定不碰 DOM，
 * 而令牌只能靠 `getComputedStyle` 读 —— 于是「读令牌」这一步被推到渲染层（这里），
 * 由渲染层把解析好的色带注入 `resolvedThresholds()` 的 `colors` 参数。
 * 调用方拿到的就是可以直接塞进 SVG 属性的 `#rrggbb`。
 *
 * 令牌取不到时（页面没加载调色板）逐档回落到兜底色，不会返回空串。
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
 * 纯 font-weight 在部分中文字体上无级差，改用 0.05em 当前色描边；paint-order 让描边在填充之下，字不会糊。
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
 * 必须用 createElementNS：createElement 创建的 svg 子元素不会被当作 SVG 渲染。
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
 * 画布存在整体缩放，同一文档在不同屏幕像素尺寸不同；控件内部按内容单位定字号与间距，
 * 这样缩放画布时内容的相对比例保持不变。
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
 * 使按钮内的字号与图标在不同高度下按同一比例缩放。
 */
export function navigationContentUnitPx(navigationUnitComponent, navigationUnitContext) {
  return (
    (componentContentUnitsPx(navigationUnitComponent, navigationUnitContext).height * 100) / 64.36
  );
}
