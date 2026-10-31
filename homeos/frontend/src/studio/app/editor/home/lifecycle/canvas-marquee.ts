/* 画布框选（pointerdown/move/up）与工作区尺寸观察器。
 *
 * 从 `home/lifecycle/boot.ts` 整块搬出：只读 `editorCtx` 与画布句柄，
 * 写入都落在 `editorCtx.marqueeState` / `editorCtx.selectedComponentIdsSet` 等对象上。
 * 返回 `workspaceResizeObserver`，引导体卸载时仍由 boot 负责断连。
 */

export function bindCanvasMarquee(deps: Record<string, any>): {
  workspaceResizeObserver: ResizeObserver;
} {
  const {
    clearComponentSelection,
    clientPointToCanvas,
    collectPageComponentBounds,
    coverMotorButtonElement,
    displayDeviceCountElement,
    editorCanvasElement,
    editorCtx,
    ensureMarqueeOverlay,
    normalizeMarquee,
    pickComponentsInMarquee,
    renderComponentLists,
    resizeWorkspaceCanvas,
    syncCustomPopupStage,
    syncHistoryButtons,
    syncRendererSelection,
  } = deps;
const workspaceResizeObserver = new ResizeObserver(() => {
  (resizeWorkspaceCanvas(), syncCustomPopupStage(), editorCtx.dashboardPreviewRenderer?.resize());
});
workspaceResizeObserver.observe(displayDeviceCountElement);

/** 空白画布框选 */
editorCanvasElement.addEventListener("pointerdown", (marqueeDownEvent: PointerEvent) => {
  if (
    editorCtx.editorMode !== "edit" ||
    marqueeDownEvent.button !== 0 ||
    editorCtx.editorSpacePanning ||
    (marqueeDownEvent.target as Element).closest(
      ".editable, .hb-transform-handle, .hb-multi-selection, button, input, select, a",
    )
  )
    return;
  const canvasWidth = Number(editorCtx.activeProject?.document?.canvas?.width || 2778);
  const canvasHeight = Number(editorCtx.activeProject?.document?.canvas?.height || 1940);
  const start = clientPointToCanvas(
    marqueeDownEvent.clientX,
    marqueeDownEvent.clientY,
    editorCanvasElement,
    canvasWidth,
    canvasHeight,
  );
  const overlay = ensureMarqueeOverlay();
  editorCtx.marqueeState = { startX: start.x, startY: start.y, overlay };
  overlay.hidden = false;
  overlay.style.cssText = "left:0;top:0;width:0;height:0;";
  try {
    editorCanvasElement.setPointerCapture(marqueeDownEvent.pointerId);
  } catch {
    /* ignore */
  }
  marqueeDownEvent.preventDefault();
});
editorCanvasElement.addEventListener("pointermove", (marqueeMoveEvent: PointerEvent) => {
  if (!editorCtx.marqueeState || !editorCtx.activeProject) return;
  const canvasWidth = Number(editorCtx.activeProject.document.canvas.width || 2778);
  const canvasHeight = Number(editorCtx.activeProject.document.canvas.height || 1940);
  const current = clientPointToCanvas(
    marqueeMoveEvent.clientX,
    marqueeMoveEvent.clientY,
    editorCanvasElement,
    canvasWidth,
    canvasHeight,
  );
  const box = normalizeMarquee(
    editorCtx.marqueeState.startX,
    editorCtx.marqueeState.startY,
    current.x,
    current.y,
  );
  const scaleX = editorCanvasElement.clientWidth / canvasWidth;
  const scaleY = editorCanvasElement.clientHeight / canvasHeight;
  editorCtx.marqueeState.overlay.style.left = box.x * scaleX + "px";
  editorCtx.marqueeState.overlay.style.top = box.y * scaleY + "px";
  editorCtx.marqueeState.overlay.style.width = box.width * scaleX + "px";
  editorCtx.marqueeState.overlay.style.height = box.height * scaleY + "px";
});
editorCanvasElement.addEventListener("pointerup", (marqueeUpEvent: PointerEvent) => {
  if (!editorCtx.marqueeState || !editorCtx.activeProject) return;
  const canvasWidth = Number(editorCtx.activeProject.document.canvas.width || 2778);
  const canvasHeight = Number(editorCtx.activeProject.document.canvas.height || 1940);
  const end = clientPointToCanvas(
    marqueeUpEvent.clientX,
    marqueeUpEvent.clientY,
    editorCanvasElement,
    canvasWidth,
    canvasHeight,
  );
  const box = normalizeMarquee(editorCtx.marqueeState.startX, editorCtx.marqueeState.startY, end.x, end.y);
  editorCtx.marqueeState.overlay.hidden = true;
  editorCtx.marqueeState = null;
  try {
    editorCanvasElement.releasePointerCapture(marqueeUpEvent.pointerId);
  } catch {
    /* ignore */
  }
  if (box.width < 4 && box.height < 4) {
    clearComponentSelection();
    syncRendererSelection();
    renderComponentLists();
    coverMotorButtonElement();
    return;
  }
  const hitIds = pickComponentsInMarquee(collectPageComponentBounds(), box);
  editorCtx.selectedComponentIdsSet = new Set(hitIds);
  editorCtx.selectedComponentId = hitIds[0] || null;
  editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId;
  syncRendererSelection();
  renderComponentLists();
  coverMotorButtonElement();
  syncHistoryButtons();
});
  return { workspaceResizeObserver };
}
