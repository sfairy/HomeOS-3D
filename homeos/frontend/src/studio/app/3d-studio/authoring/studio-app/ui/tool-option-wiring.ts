/* 工具面板选项（门/窗/栏杆/家具/电器/庭院/灯光/楼梯…）与「轻量变更」入口。
 *
 * 从 `studio-app/boot.ts` 整块搬出：读 `appCtx` 与 DOM 句柄，写 `appCtx.*` / 文档，
 * 不回写闭包里的可变绑定。
 */
import type { StudioControlElement } from '../../types/studio-app-types';

export function bindToolOptionWiring(deps: Record<string, any>): void {
  const {
    appCtx, applyMaterialToSameModelItems, applyToolSetting, deleteCustomMaterialStyle, deselectAll,
    getSelectedObject, inspectorGroupsElement, markDocumentDirty, materialApplyCancelButton,
    materialApplyCountElement, materialApplyDialogElement, materialApplyFormElement, materialApplySameButton,
    materialEditModelType, materialPresetCancelButton, materialPresetDialogElement, materialPresetFormElement,
    materialPresetNameInput, materialResetAllButton, materialSameModelPeerCount, materialSavePresetButton,
    materialSlotListElement, materialStyleDeleteButton, materialStyleGroupFor, materialStyleLabel,
    materialStyleStripElement, normalizeMaterialStyle, refreshScopeItems, resetItemMaterialAll,
    resolvePreviewScope, saveCurrentItemMaterialStyle, selectElement, selectedMaterialEditTarget,
    selectionInspectorElement, setItemMaterialOverride, setItemMaterialStyle, setItemMaterialSurfaceOverride,
    shoeCabinetMirrorButton, syncHtmlRangeProgress2, toggleInspectorGroup
  } = deps;
(selectElement("#stair-direction").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#tv-mount-style").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#storage-section").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#pillar-shape").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#pillar-axis").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#pipeline-dispenser-style").addEventListener("change", () =>
    applyToolSetting("item"),
  ),
  selectElement("#strip-axis").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#mural-style").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#featurewall-style").addEventListener("change", () => applyToolSetting("item")),

  materialSlotListElement.addEventListener("input", (materialColorInputEvent: any) => {
    const materialColorInput = materialColorInputEvent.target.closest("[data-material-slot-color]"),
      materialSlotRow = materialColorInput?.closest(".material-slot"),
      materialHexInput = materialSlotRow?.querySelector("[data-material-slot-hex]");
    materialHexInput &&
      materialColorInput &&
      ((materialHexInput.value = String(materialColorInput.value).toLowerCase()),
      materialHexInput.classList.remove("is-invalid"));

    const materialSurfaceRange = materialColorInputEvent.target.closest(
      "[data-material-slot-surface-key]",
    );
    if (materialSurfaceRange) {
      const materialSurfaceOutput = materialSurfaceRange
        .closest(".material-slot-surface-field")
        ?.querySelector("output");
      materialSurfaceOutput &&
        (materialSurfaceOutput.textContent = Number(materialSurfaceRange.value).toFixed(2));
      /* 拖拽时轨道上的金色段要跟着圆点走，否则读数变了、填充还停在旧位置。 */
      syncHtmlRangeProgress2(materialSurfaceRange);
    }
  }),
  materialSlotListElement.addEventListener("change", (materialSlotChangeEvent: any) => {
    const materialColorInput = materialSlotChangeEvent.target.closest(
      "[data-material-slot-color]",
    );
    if (materialColorInput) {
      setItemMaterialOverride(
        materialColorInput.dataset.materialSlotColor,
        materialColorInput.value,
      );
      return;
    }

    const materialHexInput = materialSlotChangeEvent.target.closest("[data-material-slot-hex]");
    if (materialHexInput) {
      const hexColorValue = String(materialHexInput.value).trim().toLowerCase(),
        normalizedHexValue = /^[0-9a-f]{6}$/.test(hexColorValue)
          ? "#" + hexColorValue
          : hexColorValue;
      if (!/^#[0-9a-f]{6}$/.test(normalizedHexValue)) {

        const materialRowColorInput =
          materialHexInput
            .closest(".material-slot-variant")
            ?.querySelector("[data-material-slot-color]") ||
          materialHexInput
            .closest(".material-slot")
            ?.querySelector("[data-material-slot-color]");
        (materialHexInput.classList.add("is-invalid"),
          materialRowColorInput &&
            (materialHexInput.value = String(materialRowColorInput.value).toLowerCase()));
        return;
      }
      (materialHexInput.classList.remove("is-invalid"),
        (materialHexInput.value = normalizedHexValue),
        setItemMaterialOverride(materialHexInput.dataset.materialSlotHex, normalizedHexValue));
      return;
    }
    const materialSurfaceRange = materialSlotChangeEvent.target.closest(
      "[data-material-slot-surface-key]",
    );
    materialSurfaceRange &&
      setItemMaterialSurfaceOverride(
        materialSurfaceRange.dataset.materialSlotSurfaceName,
        materialSurfaceRange.dataset.materialSlotSurfaceKey,
        Number(materialSurfaceRange.value),
      );
  }),
  materialSlotListElement.addEventListener("click", (materialSlotClickEvent: any) => {
    const materialResetButton = materialSlotClickEvent.target.closest("[data-material-slot-reset]");
    if (materialResetButton) {
      setItemMaterialOverride(materialResetButton.dataset.materialSlotReset, "");
      return;
    }
    const materialSurfaceResetButton = materialSlotClickEvent.target.closest(
      "[data-material-slot-surface-reset]",
    );
    if (materialSurfaceResetButton) {

      const surfaceResetSlotName = materialSurfaceResetButton.dataset.materialSlotSurfaceReset;
      setItemMaterialSurfaceOverride(surfaceResetSlotName, "roughness", null);
      setItemMaterialSurfaceOverride(surfaceResetSlotName, "metalness", null);
      return;
    }
    const materialSurfaceToggle = materialSlotClickEvent.target.closest(
      "[data-material-slot-surface-toggle]",
    );
    if (!materialSurfaceToggle) return;

    const surfaceToggleSlotName = materialSurfaceToggle.dataset.materialSlotSurfaceToggle;
    appCtx.expandedMaterialSurfaceSlots.has(surfaceToggleSlotName)
      ? appCtx.expandedMaterialSurfaceSlots.delete(surfaceToggleSlotName)
      : appCtx.expandedMaterialSurfaceSlots.add(surfaceToggleSlotName);
    const materialSlotRow = materialSurfaceToggle.closest(".material-slot"),
      materialSurfacePanel = materialSlotRow?.querySelector("[data-material-slot-surface]"),
      isSurfaceExpanded = appCtx.expandedMaterialSurfaceSlots.has(surfaceToggleSlotName);
    (materialSurfaceToggle.setAttribute("aria-expanded", String(isSurfaceExpanded)),
      materialSurfacePanel && (materialSurfacePanel.hidden = !isSurfaceExpanded));
  }),
  materialStyleStripElement.addEventListener("click", (materialStyleClickEvent: any) => {
    const materialStyleChip = materialStyleClickEvent.target.closest("[data-material-style-id]");
    materialStyleChip &&
      setItemMaterialStyle(materialStyleChip.dataset.materialStyleId);
  }),
  materialStyleDeleteButton.addEventListener("click", () => {
    const materialEditTarget = selectedMaterialEditTarget(),
      selectedModelType = materialEditModelType(
        materialEditTarget?.record,
        materialEditTarget?.kind,
      ),
      selectedStyle = normalizeMaterialStyle(
        selectedModelType,
        materialEditTarget?.record?.materialStyle,
      );
    selectedStyle.startsWith("custom:") && deleteCustomMaterialStyle(selectedStyle);
  }),
  materialResetAllButton.addEventListener("click", () => resetItemMaterialAll()),

  materialSavePresetButton.addEventListener("click", () => {
    const materialEditTarget = selectedMaterialEditTarget(),
      modelType = materialEditModelType(materialEditTarget?.record, materialEditTarget?.kind);
    if (!materialEditTarget || !materialStyleGroupFor(modelType)) return;
    (materialPresetNameInput &&
      (materialPresetNameInput.value = materialStyleLabel(
        modelType,
        materialEditTarget.record.materialStyle,
      )),
      materialPresetDialogElement?.showModal(),
      materialPresetNameInput?.focus(),
      materialPresetNameInput?.select());
  }),
  materialPresetFormElement.addEventListener("submit", () => {
    const presetLabel = String(materialPresetNameInput?.value || "").trim();
    presetLabel && saveCurrentItemMaterialStyle(presetLabel.slice(0, 16));
  }),
  materialPresetCancelButton.addEventListener("click", () =>
    materialPresetDialogElement?.close(),
  ),
  materialApplySameButton.addEventListener("click", () => {
    const peerCount = materialSameModelPeerCount(selectedMaterialEditTarget());
    if (!peerCount) return;
    (materialApplyCountElement &&
      (materialApplyCountElement.textContent = peerCount + " 件同类物件"),
      materialApplyDialogElement?.showModal());
  }),
  materialApplyFormElement.addEventListener("submit", () => {
    materialApplyDialogElement?.close();
    applyMaterialToSameModelItems();
  }),
  materialApplyCancelButton.addEventListener("click", () => materialApplyDialogElement?.close()),
  inspectorGroupsElement.forEach((inspectorGroupElement: StudioControlElement) => {
    const inspectorGroupHeader = inspectorGroupElement.querySelector(
      ".inspector-group-header",
    );
    inspectorGroupHeader?.addEventListener("click", () =>
      toggleInspectorGroup(inspectorGroupElement),
    );
  }),
  shoeCabinetMirrorButton.addEventListener("click", () => {
    const shoeCabinetElement = getSelectedObject();
    !shoeCabinetElement ||
      appCtx.selectedItem?.kind !== "item" ||
      shoeCabinetElement.type !== "shoecabinet" ||
      (deselectAll(),
      (shoeCabinetElement.shoeCabinetMirrored = shoeCabinetElement.shoeCabinetMirrored !== true),
      refreshScopeItems(resolvePreviewScope(shoeCabinetElement)),
      markDocumentDirty());
  }),
  selectionInspectorElement.addEventListener("submit", (optionsSubmitEvent: any) =>
    optionsSubmitEvent.preventDefault(),
  ),
  selectElement("#door-hinge").addEventListener("click", () => {
    const doorElement = getSelectedObject();
    !doorElement ||
      appCtx.selectedItem?.kind !== "door" ||
      ["double", "roller-shutter", "frame-only"].includes(doorElement.doorType) ||
      (deselectAll(),
      (doorElement.hinge = doorElement.hinge === "right" ? "left" : "right"),
      refreshScopeItems("architecture"),
      markDocumentDirty());
  }),
  selectElement("#door-swing").addEventListener("click", () => {
    const swingDoorElement = getSelectedObject();
    !swingDoorElement ||
      appCtx.selectedItem?.kind !== "door" ||
      ["sliding-glass", "frame-only"].includes(swingDoorElement.doorType) ||
      (deselectAll(),
      (swingDoorElement.swing = swingDoorElement.swing === -1 ? 1 : -1),
      refreshScopeItems("architecture"),
      markDocumentDirty());
  }));
}
