import { clampNumber, roundField } from "./editor-utils.js?v=20260916013557";
export function setInspectorToggle(toggleElement, isPressed) {
  toggleElement.setAttribute("aria-pressed", String(isPressed));
  toggleElement.textContent = isPressed ? "隐藏" : "显示";
}
export function iconButtonEffectInspectorLayer(component = {}, requestedLayer = "") {
  if (requestedLayer === "button" || requestedLayer === "effect") {
    return requestedLayer;
  } else {
    return "button";
  }
}
export function fitInspectorComponentToDimensions(sourceComponent, properties, measureDimensions) {
  if (!sourceComponent) {
    return;
  }
  const width = Number(sourceComponent.position?.width || 100);
  const height = Number(sourceComponent.position?.height || 100);
  const centerX = Number(sourceComponent.position?.x || 0) + width / 2;
  const centerY = Number(sourceComponent.position?.y || 0) + height / 2;
  const { width: targetWidth, height: targetHeight } = measureDimensions(properties);
  sourceComponent.position = {
    ...(sourceComponent.position || {}),
    x: centerX - targetWidth / 2,
    y: centerY - targetHeight / 2,
    width: targetWidth,
    height: targetHeight
  };
}
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
    left: roundField(
      clampNumber(((Number(position.x || 0) + componentWidth / 2) / canvasWidth) * 100, 0, 100)
    ),
    top: roundField(
      clampNumber(((Number(position.y || 0) + componentHeight / 2) / canvasHeight) * 100, 0, 100)
    ),
    widthPercent: roundField(clampNumber((componentWidth / canvasWidth) * 100, 0.1, 100)),
    heightPercent: roundField(clampNumber((componentHeight / canvasHeight) * 100, 0.1, 100)),
    scale: roundField(clampNumber(Number(inspectedComponent.style?.scale || 1) * 100, 1, 500)),
    rotation: roundField(clampNumber(Number(position.rotation || 0), -360, 360))
  };
}
