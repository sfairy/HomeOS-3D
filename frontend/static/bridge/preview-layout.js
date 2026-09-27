/**
 * 3D 组件在设计器 / 仪表盘里的预览尺寸计算。
 */

// 文档里的数值可能以字符串形式存于 JSON，这里统一转换；非有限数或非正数一律回落，
import { positiveNumberOr } from "../utils/numbers.js?v=2609271226";
/**
 * 计算预览区应占据的像素尺寸与宽高比。
 */
export function interaction3dPreviewSize(component, documentApi, containerWidth, containerHeight) {
  const isFillLayout = component.properties?.layoutMode === "fill";
  // fill 布局的尺寸来源是画布而非组件自身；两者字段名同为 width / height。
  const sizeSource = isFillLayout ? documentApi?.canvas : component.position;
  // 2778 × 1940 对应 2 倍 DPI 下 1389 × 970 的设计标称画布，缺值时按此兜底。
  const width = positiveNumberOr(sizeSource?.width, isFillLayout ? 2778 : 100);
  const height = positiveNumberOr(sizeSource?.height, isFillLayout ? 1940 : 100);
  // 容器宽高未知时传 0，scale 归零，让上层能把元素判为「尚未测量」而不是取错尺寸。
  const fitScale = Math.min(
    positiveNumberOr(containerWidth, 0) / width,
    positiveNumberOr(containerHeight, 0) / height
  );
  return {
    width: width * fitScale,
    height: height * fitScale,
    aspectRatio: width / height
  };
}
