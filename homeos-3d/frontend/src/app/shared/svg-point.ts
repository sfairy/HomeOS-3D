/**
 * 指针事件的屏幕坐标 → 某个 SVG 元素的用户坐标。
 */

export function toSvgPoint(svgElement: any, pointerEvent: any) {
  const localPoint = svgElement.createSVGPoint();
  localPoint.x = pointerEvent.clientX;
  localPoint.y = pointerEvent.clientY;
  return localPoint.matrixTransform(svgElement.getScreenCTM().inverse());
}
