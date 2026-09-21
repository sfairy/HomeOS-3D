/**
 * 户型图自动导图：导出分辨率换算。
 *
 * 存在的理由是「导图底图的宽高比必须与预览一致」。底图按仪表盘画布尺寸导出时，
 * 得到一个与画布同比例的矩形；而预览里控件是按自己的宽高比摆放的，两者一旦不同比，
 * 生成的底图在控件框内就会被拉伸/留边，表现为「导图与预览位置对不上」。
 *
 * 因此这里不直接采用画布尺寸，而是：**保留控件自身宽高比，把面积缩放到画布面积**。
 * 面积相等意味着渲染像素量与画布同级（清晰度不降），宽高比一致意味着不会产生偏移。
 *
 * 纯函数、无 DOM 依赖，便于单独验证换算结果。
 */

// 导出尺寸的上下限：最小边不低于 320px（再小会糊），最大边不超过 4096（超过没有收益且拖慢渲染）。
const MIN_EXPORT_EDGE = 320;
const MAX_EXPORT_EDGE = 4096;
// 画布尺寸缺失时的兜底（与仪表盘默认画布一致），保证换算永远有确定的输入。
const DEFAULT_CANVAS_WIDTH = 2778;
const DEFAULT_CANVAS_HEIGHT = 1940;

/** 取出正数；非法值（NaN / 0 / 负数 / 字符串）一律退回 fallback。 */
function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/**
 * 算出自动导图底图的导出分辨率。
 *
 * 参数:
 *   componentBox: 导图控件的尺寸（``{width, height}``），决定输出宽高比。
 *   canvasBox: 仪表盘画布尺寸（``{width, height}``），决定输出面积。
 * 返回: ``{width, height}`` 整数像素，已按上下限钳制。
 */
export function floorplanAutoDiagramExportResolution(componentBox = {}, canvasBox = {}) {
  const canvasWidth = positiveNumber(canvasBox.width, DEFAULT_CANVAS_WIDTH);
  const canvasHeight = positiveNumber(canvasBox.height, DEFAULT_CANVAS_HEIGHT);
  const componentWidth = positiveNumber(componentBox.width, canvasWidth);
  const componentHeight = positiveNumber(componentBox.height, canvasHeight);

  // 面积比开方即线性缩放比：按面积对齐而不是按宽度对齐，宽高比差异大时才不会把控件拉变形。
  const areaScale = Math.sqrt((canvasWidth * canvasHeight) / (componentWidth * componentHeight));
  // 缩放比的可用区间：让短边≥320、长边≤4096。下限按 max、上限按 min，
  // 因为「短边达标」要满足两个方向，「长边不超」也要满足两个方向。
  const minimumScale = Math.max(MIN_EXPORT_EDGE / componentWidth, MIN_EXPORT_EDGE / componentHeight);
  const maximumScale = Math.min(MAX_EXPORT_EDGE / componentWidth, MAX_EXPORT_EDGE / componentHeight);
  // 区间为空（控件极端狭长）时取上限：宁可尺寸偏小，也不要突破 4096 的渲染上限。
  const scale = minimumScale <= maximumScale ? Math.max(minimumScale, Math.min(maximumScale, areaScale)) : maximumScale;

  return {
    width: Math.max(1, Math.round(componentWidth * scale)),
    height: Math.max(1, Math.round(componentHeight * scale))
  };
}
