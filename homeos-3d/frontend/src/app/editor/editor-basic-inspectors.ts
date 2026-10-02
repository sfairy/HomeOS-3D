import { clampNumber, roundField } from "./editor-utils";
export function setInspectorToggle(buttonElement, isHidden) {
  (buttonElement.setAttribute("aria-pressed", String(isHidden)),
    (buttonElement.textContent = isHidden ? "隐藏" : "显示"));
}
export function iconButtonEffectInspectorLayer(options = {}, effect = "") {
  return effect === "button" || effect === "effect" ? effect : "button";
}
export function fitInspectorComponentToDimensions(component, componentKind, measure) {
  if (!component) return;
  const currentWidth = Number(component.position?.width || 100),
    currentHeight = Number(component.position?.height || 100),
    centerX = Number(component.position?.x || 0) + currentWidth / 2,
    centerY = Number(component.position?.y || 0) + currentHeight / 2,
    { width: fittedWidth, height: fittedHeight } = measure(componentKind);
  component.position = {
    ...(component.position || {}),
    x: centerX - fittedWidth / 2,
    y: centerY - fittedHeight / 2,
    width: fittedWidth,
    height: fittedHeight,
  };
}
export function inspectorComponentMetrics(targetComponent, viewport) {
  const position = targetComponent.position || {},
    canvasWidth = Number(viewport?.canvas?.width || 2778),
    canvasHeight = Number(viewport?.canvas?.height || 1940),
    width = Number(position.width || 100),
    height = Number(position.height || 100);
  return {
    position: position,
    width: width,
    height: height,
    left: roundField(
      clampNumber(((Number(position.x || 0) + width / 2) / canvasWidth) * 100, 0, 100),
    ),
    top: roundField(
      clampNumber(((Number(position.y || 0) + height / 2) / canvasHeight) * 100, 0, 100),
    ),
    widthPercent: roundField(clampNumber((width / canvasWidth) * 100, 0.1, 100)),
    heightPercent: roundField(clampNumber((height / canvasHeight) * 100, 0.1, 100)),
    scale: roundField(clampNumber(Number(targetComponent.style?.scale || 1) * 100, 1, 500)),
    rotation: roundField(clampNumber(Number(position.rotation || 0), -360, 360)),
  };
}
