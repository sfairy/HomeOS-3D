/**
 * 3D 组件在设计器 / 仪表盘里的预览尺寸计算。
 *
 * 编辑器与渲染器共用的纯计算：预览壳拿它决定占位宽高，真实舞台用同一份比例去计算渲染分辨率，
 * 两边口径必须保持一致。对外导出 interaction3dPreviewSize。无副作用。
 */

// 文档里的数值可能以字符串形式存于 JSON，这里统一转换；非有限数或非正数一律回落，
// 避免 NaN / 0 传播成 0 宽高的隐形元素（口径见 utils/numbers.js 的 positiveNumberOr）。
import { positiveNumberOr } from "../utils/numbers.js?v=2609222006";
/**
 * 计算预览区应占据的像素尺寸与宽高比。
 * 缩放在宽高两方向取较小者（CSS contain 语义）：宁可留边也不裁切，保证与真实投放取景一致。
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
