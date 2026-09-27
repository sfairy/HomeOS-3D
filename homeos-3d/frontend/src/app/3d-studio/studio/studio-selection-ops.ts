/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { state } from "./studio-state.js";
import {
  markDocumentDirty,
  showToast
} from "./studio-document-save.js";
import {
  activateTool,
  currentLightScope,
  currentSelectionScope,
  ensureCalibration,
  normalizeLayerNames,
  requestSceneRefresh,
  setSelection
} from "./studio-plan-interaction.js";
import { LIGHT_ITEM_TYPES } from "./studio-item-types.js";
import { pushHistorySnapshot } from "./studio-camera-mode.js";
import {
  currentPixelsPerMeter,
  getCurrentFloor,
  selectElement
} from "./studio-plan-render.js";
import { createId } from "./studio-plan-geometry.js";
import {
  convertBetweenFloors,
  renderPlanView
} from "./studio-plan-draw.js";
import { finite } from "../loaders/studio-normalization.js";
import {
  clearSelection,
  ensureActiveLightGroup,
  findSelectedEntity,
  lightGroupContextMenuElement,
  refreshStudio,
  renderInspector,
  renderLightGroupList
} from "./studio-ui-refresh.js";
import { syncAssetTabVisibility } from "./studio-control-sync.js";
import { mergeCollinearWalls } from "./studio-geometry-utils.js";

export const assetCategoryButtons = [...document.querySelectorAll("[data-asset-category]")];

export const assetGridElement = selectElement("#asset-grid");

export const lightAssetRowElement = selectElement("#light-asset-row");

/**
 * 关闭灯组右键菜单，并清掉菜单记录的目标灯组 id。
 */
export function closeLightGroupContextMenu() {
  lightGroupContextMenuElement.hidden = true;
  state.lightGroupMenuTargetId = "";
}

export function deleteSelection() {
  if (state.multiSelection.length) {
    const selectionScope = currentSelectionScope();
    pushHistorySnapshot();
    const wallSelectionIds = new Set(
      state.multiSelection
        .filter((wallSelection: any) => wallSelection.kind === "wall")
        .map((wallSelectionId: any) => wallSelectionId.id)
    );
    const windowSelectionIds = new Set(
      state.multiSelection
        .filter((windowSelection: any) => windowSelection.kind === "window")
        .map((windowSelectionId: any) => windowSelectionId.id)
    );
    const doorSelectionIds = new Set(
      state.multiSelection
        .filter((doorSelection: any) => doorSelection.kind === "door")
        .map((doorSelectionId: any) => doorSelectionId.id)
    );
    const railingSelectionIds = new Set(
      state.multiSelection
        .filter((railingSelection: any) => railingSelection.kind === "railing")
        .map((railingSelectionId: any) => railingSelectionId.id)
    );
    const itemSelectionIds = new Set(
      state.multiSelection
        .filter((itemSelection: any) => itemSelection.kind === "item")
        .map((itemSelectionId: any) => itemSelectionId.id)
    );
    state.activeScene.walls = state.activeScene.walls.filter(
      (filteredWall: any) => !wallSelectionIds.has(filteredWall.id)
    );
    state.activeScene.windows = state.activeScene.windows.filter(
      (filteredWindow: any) =>
        !windowSelectionIds.has(filteredWindow.id) && !wallSelectionIds.has(filteredWindow.wallId)
    );
    state.activeScene.doors = state.activeScene.doors.filter(
      (filteredDoor: any) =>
        !doorSelectionIds.has(filteredDoor.id) && !wallSelectionIds.has(filteredDoor.wallId)
    );
    state.activeScene.railings = state.activeScene.railings.filter(
      (filteredRailing: any) =>
        !railingSelectionIds.has(filteredRailing.id) &&
        !wallSelectionIds.has(filteredRailing.wallId)
    );
    state.activeScene.items = state.activeScene.items.filter(
      (outsideSelectionItem: any) => !itemSelectionIds.has(outsideSelectionItem.id)
    );
    if (wallSelectionIds.size) {
      mergeCollinearWalls();
    }
    clearSelection();
    refreshStudio(selectionScope);
    markDocumentDirty();
    return;
  }
  const targetEntity = findSelectedEntity();
  if (!targetEntity || !state.primarySelection) {
    return;
  }
  const targetScope = currentSelectionScope();
  pushHistorySnapshot();
  if (state.primarySelection.kind === "wall") {
    state.activeScene.walls = state.activeScene.walls.filter(
      (wallToRemove: any) => wallToRemove.id !== targetEntity.id
    );
    state.activeScene.windows = state.activeScene.windows.filter(
      (windowOnRemovedWall: any) => windowOnRemovedWall.wallId !== targetEntity.id
    );
    state.activeScene.doors = state.activeScene.doors.filter(
      (doorOnRemovedWall: any) => doorOnRemovedWall.wallId !== targetEntity.id
    );
    state.activeScene.railings = state.activeScene.railings.filter(
      (railingOnRemovedWall: any) => railingOnRemovedWall.wallId !== targetEntity.id
    );
    mergeCollinearWalls();
  } else if (state.primarySelection.kind === "window") {
    state.activeScene.windows = state.activeScene.windows.filter(
      (windowToRemove: any) => windowToRemove.id !== targetEntity.id
    );
  } else if (state.primarySelection.kind === "door") {
    state.activeScene.doors = state.activeScene.doors.filter(
      (doorToRemove: any) => doorToRemove.id !== targetEntity.id
    );
  } else if (state.primarySelection.kind === "railing") {
    state.activeScene.railings = state.activeScene.railings.filter(
      (railingToRemove: any) => railingToRemove.id !== targetEntity.id
    );
  } else {
    state.activeScene.items = state.activeScene.items.filter(
      (itemToRemove: any) => itemToRemove.id !== targetEntity.id
    );
  }
  clearSelection();
  refreshStudio(targetScope);
  markDocumentDirty();
}

/**
 * 原地复制选中的家具 / 电器 / 灯具（不走系统剪贴板）。只复制物件、不复制墙与门窗；灯光页签只复制灯。
 */
export function duplicateSelection() {
  const sourceItemIds = new Set([
    ...(state.primarySelection?.kind === "item" ? [state.primarySelection.id] : []),
    ...state.multiSelection
      .filter((duplicateSelectionEntry: any) => duplicateSelectionEntry.kind === "item")
      .map((duplicateSelectionId: any) => duplicateSelectionId.id)
  ]);
  const isLightDuplicateTab = state.activeAssetTab === "light";
  const sourceItems = state.activeScene.items.filter(
    (duplicateCandidate: any) =>
      sourceItemIds.has(duplicateCandidate.id) &&
      LIGHT_ITEM_TYPES.has(duplicateCandidate.type) === isLightDuplicateTab
  );
  if (!sourceItems.length) {
    showToast("请先选择要复制的灯具、家具或电器。");
    return;
  }
  pushHistorySnapshot();
  /**
   * 副本相对原件的平面偏移量。固定取 0.12 米（换算成像素）而不是随机值：连续多次复制会形成
   */
  const duplicateOffsetPlan = (currentPixelsPerMeter() || 100) * 0.12;
  const duplicatedItems = sourceItems.map((duplicateSourceItem: any) => ({
    ...structuredClone(duplicateSourceItem),
    id: createId("item"),
    x: duplicateSourceItem.x + duplicateOffsetPlan,
    y: duplicateSourceItem.y + duplicateOffsetPlan
  }));
  normalizeLayerNames(duplicatedItems);
  state.activeScene.items.push(...duplicatedItems);
  if (duplicatedItems.length === 1) {
    setSelection("item", duplicatedItems[0].id);
  } else {
    state.primarySelection = null;
    state.multiSelection = duplicatedItems.map((duplicatedItem: any) => ({
      kind: "item",
      id: duplicatedItem.id
    }));
  }
  refreshStudio(
    sourceItems.some((duplicatedSource: any) => duplicatedSource.type === "flooropening")
      ? "all"
      : isLightDuplicateTab
        ? "lights"
        : "items"
  );
  markDocumentDirty();
  showToast("已复制 " + duplicatedItems.length + " 个物件。");
}

/**
 * 收集要放进剪贴板的物件（复制与剪切共用的取数逻辑）。与 duplicateSelection 同一套筛选
 */
export function collectClipboardItems() {
  const clipboardSourceIds = new Set([
    ...(state.primarySelection?.kind === "item" ? [state.primarySelection.id] : []),
    ...state.multiSelection
      .filter((clipboardSelectionEntry: any) => clipboardSelectionEntry.kind === "item")
      .map((clipboardSelectionId: any) => clipboardSelectionId.id)
  ]);
  const isLightClipboardTab = state.activeAssetTab === "light";
  return state.activeScene.items.filter(
    (clipboardSourceItem: any) =>
      clipboardSourceIds.has(clipboardSourceItem.id) &&
      LIGHT_ITEM_TYPES.has(clipboardSourceItem.type) === isLightClipboardTab
  );
}

/**
 * 把选中物件深拷贝进模块级剪贴板（Ctrl/Cmd+C）。同时记下「复制来源楼层」的标定与楼层变换参数：
 */
export function copySelectionToClipboard() {
  const copiedClipboardItems = collectClipboardItems();
  if (!copiedClipboardItems.length) {
    showToast("请先选择要复制的灯具、家具或电器。");
    return;
  }
  state.clipboardItems = copiedClipboardItems.map((clipboardSourceClone: any) =>
    structuredClone(clipboardSourceClone)
  );
  const clipboardOriginFloor = getCurrentFloor();
  state.clipboardSourceFloor = {
    id: clipboardOriginFloor.id,
    originX: clipboardOriginFloor.originX,
    originY: clipboardOriginFloor.originY,
    offsetX: clipboardOriginFloor.offsetX,
    offsetZ: clipboardOriginFloor.offsetZ,
    rotation: clipboardOriginFloor.rotation,
    scene: {
      calibration: structuredClone(state.activeScene.calibration)
    }
  };
  state.pasteOffsetStep = 0;
  showToast("已复制 " + state.clipboardItems.length + " 个物件，按 ⌘/Ctrl+V 粘贴。");
}

export function pasteClipboardItems() {
  if (!state.clipboardItems.length) {
    showToast("暂无可粘贴的物件。");
    return;
  }
  if (
    state.clipboardItems.some((clipboardFloorOpening: any) => clipboardFloorOpening.type === "flooropening") &&
    !ensureCalibration()
  ) {
    return;
  }
  const isClipboardLightOnly = state.clipboardItems.every((clipboardLightCandidate: any) =>
    LIGHT_ITEM_TYPES.has(clipboardLightCandidate.type)
  );
  if (isClipboardLightOnly && state.activeAssetTab !== "light") {
    activateAssetTab("light");
  } else if (!isClipboardLightOnly && state.activeAssetTab === "light") {
    activateAssetTab("home");
  }
  pushHistorySnapshot();
  state.pasteOffsetStep += 1;
  const pasteOffsetPlan = (currentPixelsPerMeter() || 100) * 0.12 * state.pasteOffsetStep;
  const pastedItems = state.clipboardItems.map((pastedSourceItem: any) => ({
    ...structuredClone(pastedSourceItem),
    id: createId("item"),
    x: pastedSourceItem.x + pasteOffsetPlan,
    y: pastedSourceItem.y + pasteOffsetPlan,
    ...(pastedSourceItem.type === "flooropening" &&
    state.clipboardSourceFloor &&
    state.clipboardSourceFloor.id !== getCurrentFloor().id
      ? {
          ...convertBetweenFloors(pastedSourceItem, state.clipboardSourceFloor, getCurrentFloor()),
          rotation:
            pastedSourceItem.rotation +
            finite(state.clipboardSourceFloor.rotation, 0) -
            finite(getCurrentFloor().rotation, 0)
        }
      : {}),
    ...(LIGHT_ITEM_TYPES.has(pastedSourceItem.type) &&
    !state.activeScene.lightGroups.some(
      (pastedLightGroup: any) => pastedLightGroup.id === pastedSourceItem.lightGroupId
    )
      ? {
          lightGroupId: ensureActiveLightGroup().id
        }
      : {})
  }));
  normalizeLayerNames(pastedItems);
  state.activeScene.items.push(...pastedItems);
  if (pastedItems.length === 1) {
    setSelection("item", pastedItems[0].id);
  } else {
    state.primarySelection = null;
    state.multiSelection = pastedItems.map((pastedItem: any) => ({
      kind: "item",
      id: pastedItem.id
    }));
  }
  refreshStudio(
    pastedItems.some((pastedFloorOpening: any) => pastedFloorOpening.type === "flooropening")
      ? "all"
      : isClipboardLightOnly
        ? "lights"
        : "items"
  );
  markDocumentDirty();
  showToast("已粘贴 " + pastedItems.length + " 个物件。");
}

export function activateAssetTab(tabName: any) {
  const assetTab = ["home", "appliance", "light"].includes(tabName) ? tabName : "home";
  const tabLightScope = currentLightScope();
  closeLightGroupContextMenu();
  state.activeAssetTab = assetTab;
  for (const assetTabButton of assetCategoryButtons) {
    const isActiveCategory = (assetTabButton as any).dataset.assetCategory === assetTab;
    assetTabButton.classList.toggle("active", isActiveCategory);
    assetTabButton.setAttribute("aria-pressed", String(isActiveCategory));
  }
  syncAssetTabVisibility();
  assetGridElement.hidden = assetTab === "light";
  lightAssetRowElement.hidden = assetTab !== "light";
  const tabSelectedItem = findSelectedEntity();
  const isSelectedLightItem =
    state.primarySelection?.kind === "item" &&
    tabSelectedItem &&
    LIGHT_ITEM_TYPES.has(tabSelectedItem.type);
  if (state.primarySelection && (assetTab === "light") != !!isSelectedLightItem) {
    clearSelection();
  }
  if (state.multiSelection.length) {
    clearSelection();
  }
  activateTool("select");
  renderLightGroupList();
  renderInspector();
  renderPlanView();
  if (tabLightScope !== currentLightScope()) {
    requestSceneRefresh(tabLightScope);
  }
}
