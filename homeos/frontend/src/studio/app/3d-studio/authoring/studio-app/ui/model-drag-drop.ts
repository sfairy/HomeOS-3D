/* 模型库拖放到平面画布：dragenter / dragover / drop / dragleave 与落点建物。
 * 从 `studio-app/boot.ts` 整块搬出：读 `appCtx` 与画布句柄，写 `appCtx.*` 与文档。 */
export function bindModelDragDrop(deps: Record<string, any>): void {
  const {
    appCtx, applyCameraSnapshot, applyPlacementChange, axisLockedDistance, buildingFootprints2,
    captureUndoSnapshot, closedWallLoops, courtyardPlanColor2, createCourtyardDrawingEditor2, createSceneItem,
    createSelectionRef, cursorPositionElement, deselectAll, ensureCalibrationReady, eventToLocalPoint,
    exportDialogElement, exportOverwriteDialogElement, exportSaveViewButton, fixedCameraViewButton,
    fixedOverviewViewButton, generateId, getDefaultSelectionScope, getPixelsPerMeter, getSelectedObject,
    handleCanvasWheel, handleInteractionEnded, handlePointerDown, handlePointerMove, handlePointerRelease,
    isSnapEnabled, itemTypeCatalog, markDocumentDirty, openExportPanel, planCanvasElement,
    planStageElement, planToScreen, refreshScopeItems, refreshStudioView, resetView, resolveOverwriteChoice,
    restorePreviewAfterExport, rotatePlanView, saveCameraView, saveCameraViewButton, saveOverviewViewButton,
    screenToPlan, selectElement, selectSceneObject, selectStudioTool, selectionInspectorElement, showToast,
    snapIndicatorElement, updateCameraView, zoomByScale
  } = deps;
(planStageElement.addEventListener("dragenter", (assetDragEnterEvent: any) => {
  [...assetDragEnterEvent.dataTransfer.types].includes("application/x-homeos-item") &&
    planStageElement.classList.add("dragging-item");
}),
  planStageElement.addEventListener("dragover", (assetDragOverEvent: any) => {
    [...assetDragOverEvent.dataTransfer.types].includes("application/x-homeos-item") &&
      (assetDragOverEvent.preventDefault(),
      (assetDragOverEvent.dataTransfer.dropEffect = "copy"),
      planStageElement.classList.add("dragging-item"));
  }),
  planStageElement.addEventListener("dragleave", (assetDragLeaveEvent: any) => {
    planStageElement.contains(assetDragLeaveEvent.relatedTarget) ||
      planStageElement.classList.remove("dragging-item");
  }),
  planStageElement.addEventListener("drop", (assetDropEvent: any) => {
    (assetDropEvent.preventDefault(), planStageElement.classList.remove("dragging-item"));
    const data = assetDropEvent.dataTransfer.getData("application/x-homeos-item");
    data && createSceneItem(data, screenToPlan(eventToLocalPoint(assetDropEvent)));
  }),
  (deps.planPainter = createCourtyardDrawingEditor2({
    canvas: planCanvasElement,
    toolbar: document.querySelector(".plan-toolbar"),
    inspector: selectionInspectorElement,
    scene: () => appCtx.studioState,
    selected: () => (appCtx.selectedItem?.kind === "item" ? getSelectedObject() : null),
    point: (pointerPlanPoint: any) => screenToPlan(eventToLocalPoint(pointerPlanPoint)),
    screen: planToScreen,
    ppm: () => getPixelsPerMeter() || 100,
    zoom: () => appCtx.planView.zoom,
    feedback: (toolFeedback: any) => {
      ((snapIndicatorElement.textContent = toolFeedback?.kind
        ? "吸附：" + toolFeedback.label
        : isSnapEnabled()
          ? "吸附：自由"
          : "吸附：关闭"),
        toolFeedback?.point &&
          (cursorPositionElement.textContent =
            "X " +
            (toolFeedback.point.x / (getPixelsPerMeter() || 100)).toFixed(2) +
            " m · Y " +
            (toolFeedback.point.y / (getPixelsPerMeter() || 100)).toFixed(2) +
            " m"));
    },
    snap: axisLockedDistance,
    snapping: isSnapEnabled,
    calibrated: ensureCalibrationReady,
    panning: () => appCtx.isMiddleButtonPanning,
    planColor: (courtyardPlanColor: any) => courtyardPlanColor2(courtyardPlanColor, itemTypeCatalog),
    buildings: () =>
      buildingFootprints2(
        appCtx.studioState.walls,
        closedWallLoops(getPixelsPerMeter()),
        getPixelsPerMeter(),
      ),
    clone: captureUndoSnapshot,
    snapshot: deselectAll,
    push: applyPlacementChange,
    changed: markDocumentDirty,
    refresh: () => refreshScopeItems(getDefaultSelectionScope()),
    draw: refreshStudioView,
    interactionEnded: handleInteractionEnded,
    select: (selectedToolItem: any) => selectSceneObject("item", selectedToolItem),
    isSelected: (toolSelectionItem: any) => createSelectionRef("item", toolSelectionItem),
    id: () => generateId("courtyard"),
    setTool: selectStudioTool,
    toast: showToast,
  })),
  planCanvasElement.addEventListener("pointerdown", handlePointerDown),
  planCanvasElement.addEventListener("pointermove", handlePointerMove),
  planCanvasElement.addEventListener("pointerup", handlePointerRelease),
  planCanvasElement.addEventListener("pointercancel", handlePointerRelease),
  planCanvasElement.addEventListener("contextmenu", (canvasMenuEvent: any) =>
    canvasMenuEvent.preventDefault(),
  ),
  planCanvasElement.addEventListener(
    "wheel",
    (canvasPointerEvent: any) => {
      (canvasPointerEvent.preventDefault(), handleCanvasWheel(canvasPointerEvent));
    },
    {
      passive: false,
    },
  ),
  selectElement("#fit-view").addEventListener("click", resetView),
  selectElement("#rotate-plan-view").addEventListener("click", rotatePlanView),
  selectElement("#zoom-in").addEventListener("click", () => zoomByScale(1.18)),
  selectElement("#zoom-out").addEventListener("click", () => zoomByScale(1 / 1.18)),
  selectElement("#reset-camera").addEventListener("click", updateCameraView),
  saveCameraViewButton.addEventListener("click", saveCameraView),
  fixedCameraViewButton.addEventListener("click", applyCameraSnapshot),
  saveOverviewViewButton.addEventListener("click", saveCameraView),
  fixedOverviewViewButton.addEventListener("click", applyCameraSnapshot),
  exportSaveViewButton.addEventListener("click", saveCameraView),
  selectElement("#open-export").addEventListener("click", openExportPanel),
  selectElement("#export-close").addEventListener("click", () => {
    appCtx.isInteractionLocked || exportDialogElement.close();
  }),
  exportDialogElement.addEventListener("cancel", (exportDialogCancelEvent: any) => {
    (exportDialogCancelEvent.preventDefault(), appCtx.isInteractionLocked || exportDialogElement.close());
  }),
  exportDialogElement.addEventListener("close", restorePreviewAfterExport),
  selectElement("#export-overwrite-close").addEventListener("click", () =>
    resolveOverwriteChoice("cancel"),
  ),
  selectElement("#export-overwrite-cancel").addEventListener("click", () =>
    resolveOverwriteChoice("cancel"),
  ),
  selectElement("#export-overwrite-rename").addEventListener("click", () =>
    resolveOverwriteChoice("rename"),
  ),
  selectElement("#export-overwrite-confirm").addEventListener("click", () =>
    resolveOverwriteChoice("overwrite"),
  ),
  exportOverwriteDialogElement.addEventListener("cancel", (overwriteDialogCancelEvent: any) => {
    (overwriteDialogCancelEvent.preventDefault(), resolveOverwriteChoice("cancel"));
  }));
}
