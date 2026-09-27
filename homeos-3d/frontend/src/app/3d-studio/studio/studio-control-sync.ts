/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { state } from "./studio-state.js";
import {
  APPLIANCE_ITEM_TYPES,
  LIGHT_ITEM_TYPES
} from "./studio-item-types.js";
import {
  currentPreviewFloorMode,
  selectElement
} from "./studio-plan-render.js";
import { syncControlValue } from "./ui-controls.js";
import { finite } from "../loaders/studio-normalization.js";
import { clamp } from "../plan/geometry.js";
import {
  DOOR_MATERIAL_AUTO,
  doorMaterialAutoLabel,
  doorMaterialOptionsFor,
  normalizeDoorMaterial
} from "./studio-door-materials.js";
import { syncStudioSelect } from "./studio-widgets.js";
import {
  MATERIAL_STYLE_AUTO,
  materialStyleAutoLabel,
  materialStyleOptionsFor,
  normalizeMaterialStyle
} from "./studio-material-styles.js";

export const snapIndicatorElement = selectElement("#snap-indicator");

export const snapToggleButton = selectElement("#snap-toggle");

export const snapToggleStateElement = selectElement("#snap-toggle-state");

export const snapSettingInputs = [...document.querySelectorAll("[data-snap-setting]")];

export const snapToleranceInput = selectElement("#snap-tolerance");

export const snapToleranceValueElement = selectElement("#snap-tolerance-value");

export const fixedCameraViewInput = selectElement("#fixed-camera-view");

export const floorCameraActionsElement = selectElement("#floor-camera-actions");

export const overviewCameraActionsElement = selectElement("#overview-camera-actions");

export const fixedOverviewViewInput = selectElement("#fixed-overview-view");

export const previewFloorGapControlElement = selectElement("#preview-floor-gap-control");

export const previewFloorGapInput = selectElement("#preview-floor-gap");

export const previewFloorUniformControlElement = selectElement("#preview-floor-uniform-control");

export const previewFloorUniformInput = selectElement("#preview-floor-uniform");

export const exportSaveViewButton = selectElement("#export-save-view");

export const assetHeadingCategoryButtons = [...document.querySelectorAll("[data-asset-heading-category]")];

export const itemTypeButtons = [...document.querySelectorAll("[data-item-type]")];

/**
 * 把吸附设置（总开关、各吸附项、容差）同步到工具栏控件。所有判定都用 !== false：老草稿里这些字段
 */
export function syncSnapControls() {
  const isSnapOn = state.activeScene.settings.snapEnabled !== false;
  snapToggleButton.classList.toggle("active", isSnapOn);
  snapToggleButton.setAttribute("aria-pressed", String(isSnapOn));
  snapToggleStateElement.textContent = isSnapOn ? "开" : "关";
  for (const snapSettingInput of snapSettingInputs) {
    (snapSettingInput as any).checked = state.activeScene.settings[(snapSettingInput as any).dataset.snapSetting] !== false;
  }
  syncControlValue(
    snapToleranceInput,
    clamp(Math.round(finite(state.activeScene.settings.snapTolerance, 13)), 6, 24)
  );
  snapToleranceValueElement.textContent = snapToleranceInput.value + " px";
  if (!state.scaleAnchorPoint) {
    snapIndicatorElement.textContent = isSnapOn ? "吸附：开启" : "吸附：关闭";
  }
}

/**
 * 重建「材质风格」下拉的档位。档位随物件类型变化（沙发是布艺组、柜类是木作组、洁具是陶瓷组…），
 */
export function syncMaterialStyleOptions(itemType: any, selectedStyle: any) {
  const selectControl = selectElement("#material-style");
  const optionSignature = itemType + ":" + materialStyleOptionsFor(itemType).length;
  if (selectControl.dataset.optionSignature !== optionSignature) {
    selectControl.textContent = "";
    // 「跟随全局风格」永远排最前：它是默认值，也是「这块我不管」的出口。
    const autoOption = document.createElement("option");
    autoOption.value = MATERIAL_STYLE_AUTO;
    autoOption.textContent = materialStyleAutoLabel(itemType);
    selectControl.append(autoOption);
    for (const styleOption of materialStyleOptionsFor(itemType)) {
      const optionElement = document.createElement("option");
      optionElement.value = styleOption.id;
      optionElement.textContent = styleOption.label;
      selectControl.append(optionElement);
    }
    selectControl.dataset.optionSignature = optionSignature;
  }
  selectControl.value = normalizeMaterialStyle(itemType, selectedStyle);
  syncStudioSelect(selectControl);
}

/**
 * 重建「门材质」下拉的档位。档位随门型变化（玻璃门多出清玻 / 茶玻两档，实心门没有），
 */
export function syncDoorMaterialOptions(doorType: any, selectedStyle: any) {
  const selectControl = selectElement("#door-material");
  const optionSignature = doorType + ":" + doorMaterialOptionsFor(doorType).length;
  if (selectControl.dataset.optionSignature !== optionSignature) {
    selectControl.textContent = "";
    // 「跟随全局风格」永远排最前：它是默认值，也是「这扇门我不管」的出口。
    const autoOption = document.createElement("option");
    autoOption.value = DOOR_MATERIAL_AUTO;
    autoOption.textContent = doorMaterialAutoLabel();
    selectControl.append(autoOption);
    for (const styleOption of doorMaterialOptionsFor(doorType)) {
      const optionElement = document.createElement("option");
      optionElement.value = styleOption.id;
      optionElement.textContent = styleOption.label;
      selectControl.append(optionElement);
    }
    selectControl.dataset.optionSignature = optionSignature;
  }
  selectControl.value = normalizeDoorMaterial(doorType, selectedStyle);
  syncStudioSelect(selectControl);
}

/**
 * 刷新导出侧栏里与「视角」相关的控件可见性与文案（单层视角 / 全楼总览两套）。两种模式互斥：单层模式显示楼层视角操作、
 */
export function syncCameraViewControls() {
  const hasMultipleFloors = (state.studioDocument?.floors.length || 0) > 1;
  const isCameraOverviewMode = currentPreviewFloorMode() === "all";
  floorCameraActionsElement.hidden = isCameraOverviewMode;
  overviewCameraActionsElement.hidden = !hasMultipleFloors || !isCameraOverviewMode;
  previewFloorGapControlElement.hidden = !hasMultipleFloors || !isCameraOverviewMode;
  syncControlValue(previewFloorGapInput, finite(state.studioDocument?.previewFloorGap, 3).toFixed(1));
  previewFloorUniformControlElement.hidden = !hasMultipleFloors || !isCameraOverviewMode;
  previewFloorUniformInput.checked = state.studioDocument?.uniformOverviewStack === true;
  const hasFloorFixedView = !!state.activeScene.settings?.fixedCameraView;
  const hasOverviewFixedView = !!state.studioDocument?.combinedFixedCameraView;
  fixedCameraViewInput.disabled = !hasFloorFixedView;
  fixedCameraViewInput.classList.toggle("has-saved-view", hasFloorFixedView);
  fixedOverviewViewInput.disabled = !hasOverviewFixedView;
  fixedOverviewViewInput.classList.toggle("has-saved-view", hasOverviewFixedView);
  const hasFixedCameraView = isCameraOverviewMode ? hasOverviewFixedView : hasFloorFixedView;
  exportSaveViewButton.textContent = isCameraOverviewMode ? "保存总览" : "保存视角";
  exportSaveViewButton.title = isCameraOverviewMode
    ? "记录当前导图的全楼角度和投影方式"
    : "记录当前导图的角度、缩放和投影方式";
  selectElement("#export-use-fixed").textContent = isCameraOverviewMode ? "恢复总览" : "恢复视角";
  selectElement("#export-use-fixed").title = isCameraOverviewMode
    ? "恢复已保存的全楼总览视角"
    : "恢复当前楼层已保存的视角";
  selectElement("#export-use-fixed").disabled = !!state.isExportBusy || !hasFixedCameraView;
  selectElement("#export-use-fixed").classList.toggle("has-saved-view", hasFixedCameraView);
}

export function syncAssetTabVisibility() {
  for (const headingButton of assetHeadingCategoryButtons) {
    (headingButton as any).hidden = (headingButton as any).dataset.assetHeadingCategory !== state.activeAssetTab;
  }
  for (const itemTypeButton of itemTypeButtons) {
    const buttonItemType = (itemTypeButton as any).dataset.itemType;
    const isLightItemType = LIGHT_ITEM_TYPES.has(buttonItemType);
    const isApplianceItem = APPLIANCE_ITEM_TYPES.has(buttonItemType);
    const isVisibleForTab =
      state.activeAssetTab === "light"
        ? isLightItemType
        : state.activeAssetTab === "appliance"
          ? isApplianceItem
          : !isApplianceItem && !isLightItemType;
    (itemTypeButton as any).hidden = !isVisibleForTab;
  }
}
