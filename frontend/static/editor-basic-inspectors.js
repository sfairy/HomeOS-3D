/**
 * 编辑器基础检查器（Inspector）的通用计算。
 *
 * 位置：右侧属性面板中图标按钮特效层、组件尺寸与百分比度量等基础项。
 * 职责：切换「显示 / 隐藏」按钮态、归一特效层参数、把组件对齐到目标尺寸，
 *   以及把像素坐标换算成面板展示用的百分比与缩放值。
 * 约定：画布默认尺寸 2778×1940 与后端 schema 一致；百分比一律保留
 *   editor-utils 的 roundField 精度并对越界值做 clamp。
 */
import { clampNumber, roundField } from "./editor-utils.js?v=20260916230552";

/**
 * 同步「显示 / 隐藏」切换按钮的按压态与文案。
 *
 * @param {HTMLElement} toggleElement 切换按钮。
 * @param {boolean} isPressed 是否处于按压（隐藏）态。
 * @returns {void}
 */
export function setInspectorToggle(toggleElement, isPressed) {
  toggleElement.setAttribute("aria-pressed", String(isPressed));
  toggleElement.textContent = isPressed ? "隐藏" : "显示";
}

/**
 * 归一图标按钮特效的编辑层参数。
 *
 * @param {object} [component] 组件文档。
 * @param {string} [requestedLayer] 期望的层。
 * @returns {string} "button" 或 "effect"。
 */
export function iconButtonEffectInspectorLayer(component = {}, requestedLayer = "") {
  if (requestedLayer === "button" || requestedLayer === "effect") {
    return requestedLayer;
  } else {
    // 未知层一律回退到按钮层，保证面板永远有可编辑对象。
    return "button";
  }
}

/**
 * 把组件按目标尺寸做中心对齐缩放。
 *
 * @param {object} sourceComponent 组件文档，就地修改其 position。
 * @param {object} properties 属性集，供 measureDimensions 计算目标尺寸。
 * @param {function(object): {width: number, height: number}} measureDimensions 尺寸计算函数。
 * @returns {void} 组件为空时直接返回。
 */
export function fitInspectorComponentToDimensions(sourceComponent, properties, measureDimensions) {
  if (!sourceComponent) {
    return;
  }
  const width = Number(sourceComponent.position?.width || 100);
  const height = Number(sourceComponent.position?.height || 100);
  const centerX = Number(sourceComponent.position?.x || 0) + width / 2;
  const centerY = Number(sourceComponent.position?.y || 0) + height / 2;
  const { width: targetWidth, height: targetHeight } = measureDimensions(properties);
  // 保持中心点不动，只改宽高与左上角坐标，视觉上就是「以中心缩放」。
  sourceComponent.position = {
    ...(sourceComponent.position || {}),
    x: centerX - targetWidth / 2,
    y: centerY - targetHeight / 2,
    width: targetWidth,
    height: targetHeight
  };
}

/**
 * 计算面板要展示的组件度量值（百分比定位 / 宽高 / 缩放 / 旋转）。
 *
 * @param {object} inspectedComponent 被检查的组件。
 * @param {object} editorDocument 当前文档模型，读取 canvas 尺寸。
 * @returns {object} 含 position、width/height、left/top、widthPercent/heightPercent、
 *   scale、rotation 的度量对象。
 */
export function inspectorComponentMetrics(inspectedComponent, editorDocument) {
  const position = inspectedComponent.position || {};
  const canvasWidth = Number(editorDocument?.canvas?.width || 2778);
  const canvasHeight = Number(editorDocument?.canvas?.height || 1940);
  const componentWidth = Number(position.width || 100);
  const componentHeight = Number(position.height || 100);
  return {
    position: position,
    width: componentWidth,
    height: componentHeight,
    // left/top 是「组件中心」在画布中的百分比，与后端存储的左上角坐标区分开。
    left: roundField(
      clampNumber(((Number(position.x || 0) + componentWidth / 2) / canvasWidth) * 100, 0, 100)
    ),
    top: roundField(
      clampNumber(((Number(position.y || 0) + componentHeight / 2) / canvasHeight) * 100, 0, 100)
    ),
    // 百分比下限取 0.1 而非 0：面板输入框不接受 0 宽高。
    widthPercent: roundField(clampNumber((componentWidth / canvasWidth) * 100, 0.1, 100)),
    heightPercent: roundField(clampNumber((componentHeight / canvasHeight) * 100, 0.1, 100)),
    scale: roundField(clampNumber(Number(inspectedComponent.style?.scale || 1) * 100, 1, 500)),
    rotation: roundField(clampNumber(Number(position.rotation || 0), -360, 360))
  };
}
