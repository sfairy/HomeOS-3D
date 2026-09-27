/**
 * 弹窗（详情面板）的摆放计算。
 */
import { clampTypedNumber } from "../utils/numbers.js?v=2609271226";

/**
 * 计算弹窗的缩放与位置。
 */
export function popupPlacement({
  width: viewportWidth,
  height: viewportHeight,
  panelWidth: panelWidth,
  panelHeight: panelHeight,
  defaultScale: defaultScale = 1,
  defaultTop: defaultTop = 12,
  defaultRight: defaultRight = 16,
  settings: settings = {}
}) {
  // 视口与面板尺寸都先夹到 >= 1，后面要拿它们做除数，0 会算出 Infinity。
  viewportWidth = Math.max(1, viewportWidth);
  viewportHeight = Math.max(1, viewportHeight);
  panelWidth = Math.max(1, panelWidth);
  panelHeight = Math.max(1, panelHeight);
  const scaleFactor = clampTypedNumber(settings?.scale, 0.5, 2, 1);
  const xPercent = clampTypedNumber(settings?.x, 0, 100, null);
  const yPercent = clampTypedNumber(settings?.y, 0, 100, null);
  // 三项都没被自定义时直接给默认值走人：这是绝大多数用户的路径，
  if (scaleFactor === 1 && xPercent === null && yPercent === null) {
    return {
      scale: defaultScale,
      top: defaultTop,
      right: defaultRight,
      left: viewportWidth - defaultRight - panelWidth * defaultScale,
      width: panelWidth * defaultScale,
      height: panelHeight * defaultScale,
      custom: false
    };
  }
  // 边距取 12px 与视口 1/4 的较小值：小屏（手机竖屏）上固定 12px 会占掉过多空间。
  const edgeMargin = Math.min(12, viewportWidth / 4, viewportHeight / 4);
  // 缩放同时受三个条件约束：用户的缩放系数、以及面板必须带着边距完整放进视口。
  const scale = Math.max(
    0.001,
    Math.min(
      defaultScale * scaleFactor,
      (viewportWidth - edgeMargin * 2) / panelWidth,
      (viewportHeight - edgeMargin * 2) / panelHeight
    )
  );
  const renderedWidth = panelWidth * scale;
  const renderedHeight = panelHeight * scale;
  const left =
    xPercent === null
      ? Math.max(edgeMargin, viewportWidth - Math.max(edgeMargin, defaultRight) - renderedWidth)
      : edgeMargin + ((viewportWidth - edgeMargin * 2 - renderedWidth) * xPercent) / 100;
  // y 未设置时用默认顶部偏移，并夹在可视范围内，防止面板被挤出屏幕。
  const top =
    yPercent === null
      ? Math.max(edgeMargin, Math.min(viewportHeight - edgeMargin - renderedHeight, defaultTop))
      : edgeMargin + ((viewportHeight - edgeMargin * 2 - renderedHeight) * yPercent) / 100;
  // right 由 left 反推：两种定位写法给的是同一个位置，调用方用哪套都不会错位。
  return {
    scale: scale,
    top: top,
    right: viewportWidth - left - renderedWidth,
    left: left,
    width: renderedWidth,
    height: renderedHeight,
    custom: true
  };
}
