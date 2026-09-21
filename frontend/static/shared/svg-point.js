/**
 * 指针事件的屏幕坐标 → 某个 SVG 元素的用户坐标。
 *
 * 两个编辑器（人物路线、扫地机地图）各写过一份逐字相同的实现：
 * `svgPoint.matrixTransform(svg.getScreenCTM().inverse())`。这里只此一份 ——
 * 换算方式选它的原因：`getScreenCTM().inverse()` 已经把 viewBox 缩放、元素自身旋转与页面滚动
 * 全部吃进去，而 `clientX - boundingRect.left` 在 viewBox 缩放或有旋转时会有偏差，据此画出来的
 * 点会整体偏移，症状是「鼠标所在处和落点差一段」，很难追。
 *
 * 参数:
 *   svgElement: 承接坐标系的 `<svg>`（不是里面的图形元素）。
 *   pointerEvent: 指针 / 鼠标事件。
 * 返回: `DOMPoint`，单位是该 SVG 的用户单位（平面图像素或米，由调用方的 viewBox 决定）。
 */
export function toSvgPoint(svgElement, pointerEvent) {
  const localPoint = svgElement.createSVGPoint();
  localPoint.x = pointerEvent.clientX;
  localPoint.y = pointerEvent.clientY;
  return localPoint.matrixTransform(svgElement.getScreenCTM().inverse());
}
