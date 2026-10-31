/* 导出弹窗：尺寸/锁定比例/楼层选择/打包入口。
 * 从 `studio-app/boot.ts` 整块搬出：读 `appCtx` 与导出句柄，写 `appCtx.*` 与 DOM。 */
export function bindExportDialogWiring(deps: Record<string, any>): void {
  const {
    appCtx, closeExportCompleteDialog, closePresetDeleteDialog, closePresetRenameDialog, confirmDeletePreset,
    exportDialogElement, exportFloorSelectElement, exportHeightInput, exportLockRatioInput, exportPackageButton,
    exportPresetAddButton, exportPresetDeleteButton, exportPresetDeleteDialogElement,
    exportPresetDeleteFormElement, exportPresetRenameButton, exportPresetRenameDialogElement,
    exportPresetRenameFormElement, exportPresetRenameInputElement, exportPresetSlotsElement, exportWidthInput,
    formatPresetLabel, generateExportBundle, handleCanvasSizeInput, makeUniquePresetName, markDocumentDirty,
    normalizeActiveExportPresetSlot2, normalizeExportPresetSlots2, openExportDialog, openPresetDeleteDialog,
    openPresetRenameDialog, refreshCanvasSizeUi, renderExportPresetSlots, saveAsNewPreset, selectElement,
    selectExportPresetSlot, selectPreviewFloor, showToast, stateViewportAspectGetCanvasSize, syncExportControls
  } = deps;
(selectElement("#export-complete-close").addEventListener("click", closeExportCompleteDialog),
  selectElement("#export-complete-confirm").addEventListener("click", closeExportCompleteDialog),
  exportPresetSlotsElement.addEventListener("click", (presetSlotClickEvent: any) => {
    const closestPresetSlotButton = presetSlotClickEvent.target.closest(
      "[data-export-preset-slot]",
    );
    closestPresetSlotButton &&
      selectExportPresetSlot(Number(closestPresetSlotButton.dataset.exportPresetSlot));
  }),
  exportPresetAddButton.addEventListener("click", saveAsNewPreset),
  exportPresetRenameButton.addEventListener("click", openPresetRenameDialog),
  exportPresetDeleteButton.addEventListener("click", openPresetDeleteDialog),
  selectElement("#export-preset-rename-close").addEventListener("click", closePresetRenameDialog),
  selectElement("#export-preset-rename-cancel").addEventListener("click", closePresetRenameDialog),
  exportPresetRenameDialogElement.addEventListener("cancel", (presetRenameDialogCancelEvent: any) => {
    (presetRenameDialogCancelEvent.preventDefault(), closePresetRenameDialog());
  }),
  exportPresetRenameFormElement.addEventListener("submit", (presetRenameSubmitEvent: any) => {
    presetRenameSubmitEvent.preventDefault();
    const presetRenameSubmitEventExportPresetSlots = normalizeExportPresetSlots2(
        appCtx.studioProject?.exportPresets,
      ),
      activePresetSlotIndex = normalizeActiveExportPresetSlot2(
        appCtx.studioProject?.activeExportPresetSlot,
        presetRenameSubmitEventExportPresetSlots.length,
      ),
      activePresetSlotIndexActivePresetSlot =
        presetRenameSubmitEventExportPresetSlots[activePresetSlotIndex];
    if (!activePresetSlotIndexActivePresetSlot) {
      closePresetRenameDialog();
      return;
    }
    const ja7 = formatPresetLabel(activePresetSlotIndexActivePresetSlot, activePresetSlotIndex),
      hf3 = makeUniquePresetName(exportPresetRenameInputElement.value, activePresetSlotIndex);
    ((activePresetSlotIndexActivePresetSlot.name = hf3),
      (appCtx.studioProject.exportPresets = presetRenameSubmitEventExportPresetSlots),
      closePresetRenameDialog(),
      renderExportPresetSlots(),
      markDocumentDirty(),
      hf3 !== ja7 && showToast("已重命名为“" + hf3 + "”。", "success"));
  }),
  selectElement("#export-preset-delete-close").addEventListener("click", closePresetDeleteDialog),
  selectElement("#export-preset-delete-cancel").addEventListener("click", closePresetDeleteDialog),
  exportPresetDeleteDialogElement.addEventListener("cancel", (presetDeleteDialogCancelEvent: any) => {
    (presetDeleteDialogCancelEvent.preventDefault(), closePresetDeleteDialog());
  }),
  exportPresetDeleteFormElement.addEventListener("submit", (exportDeleteSubmitEvent: any) => {
    (exportDeleteSubmitEvent.preventDefault(), confirmDeletePreset());
  }),
  exportDialogElement.addEventListener("input", (exportDialogInputEvent: any) => {
    exportDialogInputEvent.target?.closest?.("#export-preset-slots") || syncExportControls();
  }),
  exportDialogElement.addEventListener("change", (exportDialogChangeEvent: any) => {
    exportDialogChangeEvent.target?.closest?.("#export-preset-slots") || syncExportControls();
  }),
  exportDialogElement.addEventListener("click", (exportDialogClickEvent: any) => {
    exportDialogClickEvent.target?.closest?.(
      "[data-camera-view], [data-camera-mode], [data-camera-rotate-top]",
    ) && syncExportControls();
  }),
  exportWidthInput.addEventListener("input", () => handleCanvasSizeInput("width")),
  exportHeightInput.addEventListener("input", () => handleCanvasSizeInput("height")),
  exportWidthInput.addEventListener("change", () => handleCanvasSizeInput("width", true)),
  exportHeightInput.addEventListener("change", () => handleCanvasSizeInput("height", true)),
  exportLockRatioInput.addEventListener("change", () => {
    const { width: viewportPixelWidth, height: viewportPixelHeight } =
      stateViewportAspectGetCanvasSize();
    (exportLockRatioInput.checked && (appCtx.exportAspectRatio = viewportPixelWidth / viewportPixelHeight),
      refreshCanvasSizeUi());
  }),
  selectElement("#export-use-fixed").addEventListener("click", openExportDialog),
  exportFloorSelectElement.addEventListener("change", () =>
    selectPreviewFloor(exportFloorSelectElement.value),
  ),
  exportPackageButton.addEventListener("click", generateExportBundle));
}
