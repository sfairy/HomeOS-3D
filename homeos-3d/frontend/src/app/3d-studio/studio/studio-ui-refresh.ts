/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import { renderPlanView } from "./studio-plan-draw.js";
import {
  applyBaseLighting,
  applyRenderQualityMode,
  applySceneRefresh,
  applyShadowBudget,
  compositeLightCache,
  currentCameraView,
  modelTypeForItem,
  releaseDeferredModels,
  requestRenderFrame,
  scheduleLightCacheBuild,
  scheduleLightPrecompile,
  syncPreviewControls
} from "./studio-render-pipeline.js";
import { state } from "./studio-state.js";
import {
  currentPixelsPerMeter,
  currentPreviewFloorMode,
  getCurrentFloor,
  isAdaptiveLightCacheEnabled,
  lightGroupForItem,
  lightGroupScopeKey,
  selectElement
} from "./studio-plan-render.js";
import { syncControlValue } from "./ui-controls.js";
import {
  clamp,
  modelBounds,
  wallLengthMeters
} from "../plan/geometry.js";
import {
  finite,
  itemMinimumFootprint,
  itemMinimumHeight,
  normalizeFullRotation
} from "../loaders/studio-normalization.js";
import { syncStudioSelect } from "./studio-widgets.js";
import {
  syncCameraViewControls,
  syncDoorMaterialOptions,
  syncMaterialStyleOptions,
  syncSnapControls
} from "./studio-control-sync.js";
import {
  DEFAULT_LIGHT_SETTINGS,
  ITEM_TYPE_DEFINITIONS,
  TV_MOUNT_STYLES
} from "./studio-config-tables.js";
import {
  LIGHT_ITEM_TYPES,
  ROUND_TABLE_TURNTABLE_ITEM_TYPES,
  STAIR_DIRECTION_ITEM_TYPES,
  isRoundTableTurntableItem
} from "./studio-item-types.js";
import { normalizeCurtainTrack } from "../loaders/studio-curtain-track.js";
import { isMaterialStyleCapable } from "./studio-material-styles.js";
import {
  maxLightAngleForType,
  normalizePillarShape
} from "./studio-scene-normalize.js";
import {
  normalizeFeatureWallStyle,
  normalizeMuralArtStyle
} from "../materials/studio-surface-textures.js";
import {
  createId,
  normalizePillarAxis,
  normalizeStripAxis,
  pillarIsLying
} from "./studio-plan-geometry.js";
import {
  applyCameraMode,
  currentCameraMode,
  pushHistorySnapshot,
  resetCameraView,
  restoreStoredCameraView,
  syncCameraModeButtons,
  syncCameraViewButtons
} from "./studio-camera-mode.js";
import {
  markDocumentDirty,
  showToast,
  updateOnboardingSteps
} from "./studio-document-save.js";
import { positionPointMenu } from "../../shared/menu-positioning.js";
import {
  applyCameraSnapshot,
  applyCameraView,
  captureCameraSnapshot
} from "./studio-camera-snapshot.js";
import { createLayoutController } from "../../shared/layout-shell.js";
import { ALL_ITEM_MODELS } from "../loaders/studio-external-models.js";
import { reorderFloors } from "../plan/floor-order.js";

export const canvasEmptyElement = selectElement("#canvas-empty");

export const toggleBackgroundButton = selectElement("#toggle-background");

export const removePlanButton = selectElement("#remove-plan");

export const floorListElement = selectElement("#floor-list");

export const alignFloorButton = selectElement("#align-floor");

export const floorContextMenuElement = selectElement("#floor-context-menu");

export const globalWallHeightInput = selectElement("#global-wall-height");

export const globalWallThicknessInput = selectElement("#global-wall-thickness");

export const globalWallOpacityInput = selectElement("#global-wall-opacity");

export const toggleFloorEdgeButton = selectElement("#toggle-floor-edge");

export const finishWallButton = selectElement("#finish-wall");

export const deleteSelectionButton = selectElement("#delete-selection");

export const activeToolLabelElement = selectElement("#active-tool-label");

export const toolHelpElement = selectElement("#tool-help");

export const lightPropertyApplyButtons = [...document.querySelectorAll("[data-apply-light-property]")];

export const inspectorEmptyElement = selectElement("#inspector-empty");

export const selectionInspectorElement = selectElement("#selection-inspector");

export const selectionHeadingElement = selectElement(".selection-heading");

export const selectionIdElement = selectElement("#selection-id");

export const lightPreviewNoteElement = selectElement("#light-preview-note");

export const wallFieldsElement = selectElement("#wall-fields");

export const windowFieldsElement = selectElement("#window-fields");

export const doorFieldsElement = selectElement("#door-fields");

export const railingFieldsElement = selectElement("#railing-fields");

export const itemFieldsElement = selectElement("#item-fields");

export const labelTextFieldsElement = selectElement("#label-text-fields");

export const lightFieldsElement = selectElement("#light-fields");

export const itemHeightFieldElement = selectElement("#item-height-field");

export const itemElevationFieldElement = selectElement("#item-elevation-field");

export const itemRotationFieldElement = selectElement("#item-rotation-field");

export const itemRotationActionsElement = selectElement("#item-rotation-actions");

export const itemVerticalRotationFieldElement = selectElement("#item-vertical-rotation-field");

export const itemVerticalRotationLabelElement = selectElement("#item-vertical-rotation-label");

export const itemStripOrientationHeadingElement = selectElement("#item-strip-orientation-heading");

export const itemStripRollFieldElement = selectElement("#item-strip-roll-field");

export const itemStripRollInput = selectElement("#item-strip-roll");

export const itemLightSourceVisibilityFieldElement = selectElement("#item-light-source-visibility-field");

export const itemLightSourceVisibleInput = selectElement("#item-light-source-visible");

export const curtainPositionFieldElement = selectElement("#curtain-position-field");

export const roundTableTurntableFieldElement = selectElement("#round-table-turntable-field");

export const stairDirectionFieldElement = selectElement("#stair-direction-field");

export const tvMountStyleFieldElement = selectElement("#tv-mount-style-field");

export const muralStyleFieldElement = selectElement("#mural-style-field");

export const featureWallStyleFieldElement = selectElement("#feature-wall-style-field");

export const materialStyleFieldElement = selectElement("#material-style-field");

export const fridgeStyleFieldElement = selectElement("#fridge-style-fields");

export const fridgeStyleRadioInputs = [...document.querySelectorAll('input[name="fridge-style"]')];

export const pillarShapeFieldElement = selectElement("#pillar-shape-field");

export const stripAxisFieldElement = selectElement("#strip-axis-field");

export const pillarAxisFieldElement = selectElement("#pillar-axis-field");

export const shoeCabinetActionsElement = selectElement("#shoe-cabinet-actions");

export const shoeCabinetMirrorInput = selectElement("#shoe-cabinet-mirror");

export const itemWidthLabelElement = selectElement("#item-width-label");

export const itemDepthLabelElement = selectElement("#item-depth-label");

export const itemHeightLabelElement = selectElement("#item-height-label");

export const sceneCountsElement = selectElement("#scene-counts");

export const previewFloorButtons = [...document.querySelectorAll("[data-preview-floor]")];

export const studioShellElement = selectElement(".studio-shell");

export const libraryPanelElement = selectElement(".library-panel");

export const libraryResizerElement = selectElement("#library-resizer");

export const detailsPanelElement = selectElement(".details-panel");

export const detailsResizerElement = selectElement("#details-resizer");

/**
 * 布局状态的存储键。
 */
export const STUDIO_LAYOUT_STORAGE_KEY = "homeos.layout.v1.studio";

export const studioLayout = createLayoutController({
  storageKey: STUDIO_LAYOUT_STORAGE_KEY,
  shell: studioShellElement,
  panels: [
    {
      id: "library",
      sizeVar: "--layout-library-w",
      element: libraryPanelElement,
      unit: "px",
      def: 204,
      minVar: "--layout-library-min-w",
      maxVar: "--layout-library-max-w",
      collapsible: true
    },
    {
      id: "details",
      sizeVar: "--details-panel-width",
      element: detailsPanelElement,
      unit: "%",
      def: 29,
      // 百分比栏的上下限随窗口尺寸变化，是本模块唯一必须现算的一类：窗口变窄 / 变矮之后，
      limits: () => {
        const panelLimits = measurePanelLimits();
        return {
          min: panelLimits.minimumWidthRatio * 100,
          max: panelLimits.maximumWidthRatio * 100
        };
      },
      collapsible: true
    },
    {
      id: "previewHeight",
      sizeVar: "--preview-panel-height",
      varTarget: detailsPanelElement,
      unit: "%",
      def: 52,
      limits: () => {
        const panelLimits = measurePanelLimits();
        return {
          min: panelLimits.minimumHeightRatio * 100,
          max: panelLimits.maximumHeightRatio * 100
        };
      }
    }
  ],
  separators: [
    {
      // 右栏那条老分隔条：一个手柄同时管两个方向（横着拖改宽度、竖着拖改预览高度），
      element: detailsResizerElement,
      orientation: "both",
      label: "拖动调整 3D 预览高度与属性栏宽度",
      // ARIA 只报预览高度，与迁移前一致（横竖两轴没法用一对 aria-valuenow 表达）。
      ariaPanel: "previewHeight",
      axes: [
        {
          panelId: "previewHeight",
          axis: "y",
          sign: 1,
          reference: () => detailsPanelElement.getBoundingClientRect().height
        },
        {
          panelId: "details",
          axis: "x",
          sign: -1,
          reference: () => studioShellElement.getBoundingClientRect().width
        }
      ]
    },
    {
      element: libraryResizerElement,
      orientation: "vertical",
      label: "拖动调整素材栏宽度",
      axes: [{ panelId: "library", axis: "x", sign: 1 }]
    }
  ]
  // 不设 onChange：布局变化后平面画布与 3D 舞台的尺寸重算各自挂在 ResizeObserver 上
});

/**
 * 把老文档里的两个布局比例搬进 localStorage。只在本地还没有任何布局记录时生效（判定在
 */
export function migrateLegacyLayoutSettings() {
  if (!state.pendingLegacyLayoutSeed) {
    return;
  }
  const legacyLayoutSeed = state.pendingLegacyLayoutSeed;
  state.pendingLegacyLayoutSeed = null;
  studioLayout.seedPanels(legacyLayoutSeed);
}

export const lightLayerPanelElement = selectElement("#light-layer-panel");

export const lightLayerActionsElement = selectElement("#light-layer-actions");

export const lightGroupListElement = selectElement("#light-group-list");

export const addLightGroupButton = selectElement("#add-light-group");

export const lightGroupsOffButton = selectElement("#light-groups-off");

export const lightGroupContextMenuElement = selectElement("#light-group-context-menu");

export const areaContextMenuElement = selectElement("#area-context-menu");

export const addAreaButton = selectElement("#add-area");

/**
 * 汇总若干楼层里出现过的外部模型类型（去重）。窗帘被排除 —— 它是参数化几何现场
 */
export function collectItemModelTypes(sourceFloors: any = []) {
  return [
    ...new Set(
      sourceFloors.flatMap((sourceFloor: any) =>
        (sourceFloor?.scene?.items || [])
          .filter((filteredItem: any) => filteredItem.type !== "curtain")
          .map((mappedItem: any) => modelTypeForItem(mappedItem))
          .filter((modelType: any) => (ALL_ITEM_MODELS as any)[modelType])
      )
    )
  ];
}

/**
 * 当前预览范围内需要的外部模型类型。单层预览只看当前层，整层堆叠（all）要看所有
 */
export function currentFloorModelTypes() {
  const modelSourceFloors =
    currentPreviewFloorMode() === "all"
      ? state.studioDocument?.floors || []
      : [getCurrentFloor()].filter(Boolean);
  return collectItemModelTypes(modelSourceFloors);
}

/**
 * 放行当前预览范围内所有被搁置的模型，返回全部加载 Promise。
 */
export function releaseAllDeferredModels() {
  return releaseDeferredModels(currentFloorModelTypes());
}

export const expandedAreaIds = new Set();

export function openFloorContextMenu(menuFloor: any, contextMenuEvent: any) {
  state.floorMenuTargetId = menuFloor.id;
  const floorDeleteButton = floorContextMenuElement.querySelector('[data-floor-action="delete"]');
  floorDeleteButton.disabled = state.studioDocument.floors.length <= 1;
  floorContextMenuElement.hidden = false;
  positionPointMenu({
    menuElement: floorContextMenuElement,
    clientX: contextMenuEvent.clientX,
    clientY: contextMenuEvent.clientY
  });
}

/**
 * 重绘楼层列表。列表项同时承担三种交互：单击切层、长按 280ms 拖动排序、右键出菜单。
 */
export function renderFloorList() {
  if (state.studioDocument) {
    floorListElement.replaceChildren();
    for (const listedFloor of state.studioDocument.floors) {
      const floorRowElement = document.createElement("div");
      floorRowElement.className =
        "floor-row" +
        (listedFloor.id === state.activeFloorId ? " active" : "") +
        (listedFloor.aligned ? "" : " unaligned");
      floorRowElement.dataset.floorId = listedFloor.id;
      floorRowElement.draggable = true;
      floorRowElement.setAttribute(
        "aria-label",
        listedFloor.name +
          "，" +
          (listedFloor.id === state.activeFloorId ? "当前楼层，" : "") +
          "长按拖动排序，右键可重命名或删除"
      );
      let isDragReady = false;
      let dragReadyTimer: any = null;
      /**
       * 复位本行「长按待拖」状态：清掉定时器并移除高亮样式。
       */
      const resetDragReady = () => {
        if (dragReadyTimer) {
          clearTimeout(dragReadyTimer);
        }
        dragReadyTimer = null;
        isDragReady = false;
        floorRowElement.classList.remove("drag-ready");
      };
      floorRowElement.addEventListener("pointerdown", pointerDownEvent => {
        if (pointerDownEvent.button === 0 && !(pointerDownEvent.target as any).closest("button")) {
          resetDragReady();
          dragReadyTimer = setTimeout(() => {
            dragReadyTimer = null;
            isDragReady = true;
            floorRowElement.classList.add("drag-ready");
          }, 280);
        }
      });
      floorRowElement.addEventListener("pointerup", resetDragReady);
      floorRowElement.addEventListener("pointercancel", resetDragReady);
      floorRowElement.addEventListener("dragstart", dragStartEvent => {
        if (!isDragReady) {
          dragStartEvent.preventDefault();
          resetDragReady();
          return;
        }
        state.draggingFloorId = listedFloor.id;
        floorRowElement.classList.remove("drag-ready");
        floorRowElement.classList.add("dragging");
        dragStartEvent.dataTransfer!.effectAllowed = "move";
        dragStartEvent.dataTransfer!.setData("application/x-homeos-floor", listedFloor.id);
      });
      floorRowElement.addEventListener("dragend", () => {
        state.draggingFloorId = "";
        floorRowElement.classList.remove("dragging");
        resetDragReady();
        clearFloorDropIndicators();
      });
      floorRowElement.addEventListener("dragover", dragOverEvent => {
        if (!state.draggingFloorId || state.draggingFloorId === listedFloor.id) {
          return;
        }
        dragOverEvent.preventDefault();
        clearFloorDropIndicators();
        const isAfterMidpoint =
          dragOverEvent.clientY >=
          floorRowElement.getBoundingClientRect().top +
            floorRowElement.getBoundingClientRect().height / 2;
        floorRowElement.dataset.dropPosition = isAfterMidpoint ? "after" : "before";
        floorRowElement.classList.add(isAfterMidpoint ? "drop-after" : "drop-before");
        if (dragOverEvent.dataTransfer) {
          dragOverEvent.dataTransfer!.dropEffect = "move";
        }
      });
      floorRowElement.addEventListener("drop", dropEvent => {
        if (!state.draggingFloorId || state.draggingFloorId === listedFloor.id) {
          return;
        }
        dropEvent.preventDefault();
        const draggedFloorId = state.draggingFloorId;
        const isAfterTarget = floorRowElement.dataset.dropPosition === "after";
        state.draggingFloorId = "";
        clearFloorDropIndicators();
        reorderFloorList(draggedFloorId, listedFloor.id, isAfterTarget);
      });
      const activateButton = document.createElement("button");
      activateButton.type = "button";
      activateButton.textContent = listedFloor.id === state.activeFloorId ? "●" : "○";
      activateButton.title = "切换到" + listedFloor.name;
      activateButton.addEventListener("click", activateEvent => {
        activateEvent.stopPropagation();
        activateFloor(listedFloor.id, {
          persist: true
        });
      });
      const floorNameElement = document.createElement("span");
      floorNameElement.textContent = listedFloor.name;
      floorNameElement.title = "长按后拖动可调整楼层顺序，右键可重命名或删除楼层";
      const stateElement = document.createElement("small");
      const listedFloorIndex = state.studioDocument.floors.findIndex(
        (reorderedFloor: any) => reorderedFloor.id === listedFloor.id
      );
      stateElement.textContent =
        listedFloorIndex === 0 ? "基准" : listedFloor.aligned ? "已对齐" : "待对齐";
      floorRowElement.addEventListener("click", () => {
        activateFloor(listedFloor.id, {
          persist: true
        });
      });
      floorRowElement.addEventListener("contextmenu", floorContextMenuEvent => {
        floorContextMenuEvent.preventDefault();
        openFloorContextMenu(listedFloor, floorContextMenuEvent);
      });
      floorRowElement.append(activateButton, floorNameElement, stateElement);
      floorListElement.append(floorRowElement);
    }
    updateFloorAlignmentControls();
  }
}

/**
 * 清掉所有楼层行上的拖放落点指示。dragend 与每次重新计算落点前都会调用，
 */
export function clearFloorDropIndicators() {
  for (const staleRowElement of floorListElement.querySelectorAll(".floor-row")) {
    staleRowElement.classList.remove("drop-before", "drop-after");
    delete staleRowElement.dataset.dropPosition;
  }
}

/**
 * 把被拖动的楼层移到目标楼层的上方或下方，并落盘新的顺序。数组重排交给纯函数
 */
export function reorderFloorList(draggedFloorIdParam: any, targetFloorIdParam: any, shouldInsertAfter: any) {
  const reorderedFloors = reorderFloors(
    state.studioDocument.floors,
    draggedFloorIdParam,
    targetFloorIdParam,
    shouldInsertAfter,
    state.studioDocument.defaultFloorHeight
  );
  if (reorderedFloors === state.studioDocument.floors) {
    return;
  }
  const draggedFloor = state.studioDocument.floors.find(
    (movedFloor: any) => movedFloor.id === draggedFloorIdParam
  );
  state.studioDocument.floors = reorderedFloors;
  renderFloorList();
  syncPreviewFloorButtons();
  updateFloorAlignmentControls();
  applySceneRefresh({
    force: true
  });
  markDocumentDirty();
  if (draggedFloor) {
    showToast("已调整“" + draggedFloor.name + "”的楼层顺序。", "success");
  }
}

/**
 * 按当前状态刷新「对齐楼层」按钮与工具栏引导文案。只有非基准层（下标 > 0）且已完成
 */
export function updateFloorAlignmentControls() {
  const currentFloor = getCurrentFloor();
  const activeFloorIndex = currentFloor
    ? state.studioDocument.floors.findIndex((floorEntry: any) => floorEntry.id === currentFloor.id)
    : -1;
  const canAlign = state.studioDocument.floors.length > 1 && activeFloorIndex > 0;
  alignFloorButton.hidden = !canAlign;
  alignFloorButton.disabled = !canAlign || !currentFloor?.scene?.calibration;
  alignFloorButton.textContent = currentFloor?.aligned ? "重新对齐" : "对齐楼层";
  if (state.floorAlignState?.stage === "reference") {
    activeToolLabelElement.textContent = "楼层对齐 · 参照层";
    toolHelpElement.textContent =
      "点击" + state.floorAlignState.referenceFloor.name + "上的楼梯角、墙角或柱点；Esc 取消";
  } else if (state.floorAlignState?.stage === "current") {
    activeToolLabelElement.textContent = "楼层对齐 · 当前层";
    toolHelpElement.textContent =
      "点击" + currentFloor.name + "上的相同位置；系统会自动重合上下楼层";
  }
}

/**
 * 切换当前编辑楼层（列表点击、楼层按钮、导出逐层遍历都走这里）。切层是全局状态重置点：
 */
export async function activateFloor(targetFloorId: any, { persist: shouldPersist = false } = {}) {
  const requestedFloorRecord = state.studioDocument?.floors.find(
    (requestedFloor: any) => requestedFloor.id === targetFloorId
  );
  if (!requestedFloorRecord) {
    return;
  }
  const activationToken = ++state.floorSwitchToken;
  const overviewFloor = currentPreviewFloorMode() === "all" ? captureCameraSnapshot() : null;
  if (state.floorAlignState?.floorId !== requestedFloorRecord.id) {
    state.floorAlignState = null;
  }
  state.activeFloorId = requestedFloorRecord.id;
  state.studioDocument.activeFloorId = requestedFloorRecord.id;
  state.activeScene = requestedFloorRecord.scene;
  state.activeLightGroupId = "";
  clearSelection();
  resetScaleInteractionState();
  state.scalePreviewStart = null;
  state.undoStack = [];
  state.redoStack = [];
  state.viewTransform.rotation = state.activeScene.settings.planViewRotation;
  Promise.allSettled(releaseAllDeferredModels());
  await loadBackgroundTexture();
  if (activationToken === state.floorSwitchToken && state.activeFloorId === requestedFloorRecord.id) {
    refreshStudio();
    updateFloorAlignmentControls();
    fitViewToBounds();
    requestAnimationFrame(() => {
      if (activationToken === state.floorSwitchToken && state.activeFloorId === requestedFloorRecord.id) {
        if (currentPreviewFloorMode() === "all") {
          if (overviewFloor) {
            applyCameraSnapshot(overviewFloor, overviewFloor.viewportAspect);
          }
          syncCameraModeButtons(currentCameraMode());
          syncCameraViewButtons(currentCameraView());
          return;
        }
        if (state.activeScene.settings.fixedCameraView) {
          restoreStoredCameraView({
            recordChange: false,
            silent: true
          });
          return;
        }
        applyCameraMode(currentCameraMode(), {
          preserveView: false
        });
        resetCameraView();
      }
    });
    if (shouldPersist) {
      markDocumentDirty();
    }
  }
}

/**
 * 当前楼层里的电视列表。
 */
export function televisionItems() {
  return state.activeScene.items.filter((televisionItem: any) => televisionItem.type === "tv");
}

/**
 * 当前楼层里的小汽车物件（类型 smallcar）。充电图层编号与充电负载估算都以它为准；
 */
export function carItems() {
  return state.activeScene.items.filter((carItem: any) => carItem.type === "smallcar");
}

/**
 * 确保当前场景至少有一个灯组，并返回当前激活的那个。有副作用：会就地补出 lightGroups
 */
export function ensureActiveLightGroup() {
  const sceneLightGroups = (state.activeScene.lightGroups ||= []);
  if (!sceneLightGroups.length) {
    sceneLightGroups.push({
      id: createId("light-group"),
      name: "默认灯组",
      enabled: true,
      areaId: null
    });
  }
  if (!sceneLightGroups.some((existingGroupRef: any) => existingGroupRef.id === state.activeLightGroupId)) {
    state.activeLightGroupId = sceneLightGroups[0].id;
  }
  return (
    sceneLightGroups.find((activeGroup: any) => activeGroup.id === state.activeLightGroupId) ||
    sceneLightGroups[0]
  );
}

/**
 * 重建「所属灯组」下拉框，并按传入物件回填选中项。选项取自 activeScene.lightGroups，
 */
export function renderLightGroupSelect(selectedItem: any) {
  const lightGroupSelectElement = selectElement("#light-group");
  lightGroupSelectElement.replaceChildren();
  for (const optionGroup of state.activeScene.lightGroups || []) {
    const optionElement = document.createElement("option");
    optionElement.value = optionGroup.id;
    optionElement.textContent = optionGroup.name;
    lightGroupSelectElement.append(optionElement);
  }
  lightGroupSelectElement.value =
    lightGroupForItem(selectedItem)?.id || ensureActiveLightGroup().id;
  syncStudioSelect(lightGroupSelectElement);
}

/**
 * 在鼠标位置打开灯组右键菜单（重命名 / 复制 / 删除）。打开前先把该组设为激活并重绘列表，
 */
export function openLightGroupContextMenu(menuGroup: any, groupContextMenuEvent: any) {
  state.lightGroupMenuTargetId = menuGroup.id;
  state.activeLightGroupId = menuGroup.id;
  renderLightGroupList();
  const groupDeleteButton = lightGroupContextMenuElement.querySelector(
    '[data-light-group-action="delete"]'
  );
  groupDeleteButton.disabled = state.activeScene.lightGroups.length <= 1;
  lightGroupContextMenuElement.hidden = false;
  positionPointMenu({
    menuElement: lightGroupContextMenuElement,
    clientX: groupContextMenuEvent.clientX,
    clientY: groupContextMenuEvent.clientY
  });
}

/**
 * 清掉灯组行与区域行上的拖放落点高亮 / 落点标记。dragend 与每次重新计算落点前都会调用，
 */
export function clearLightGroupDropIndicators() {
  for (const staleGroupRowElement of lightGroupListElement.querySelectorAll(".light-group-row")) {
    staleGroupRowElement.classList.remove("drop-before", "drop-after");
    delete staleGroupRowElement.dataset.dropPosition;
  }
  for (const staleAreaRowElement of lightGroupListElement.querySelectorAll(".light-area-row")) {
    staleAreaRowElement.classList.remove("drop-into");
  }
}

/**
 * 把灯组移动到目标区域，可插到某组之前 / 之后。只有区域或顺序真的变了才写撤销记录；
 * @param {boolean} [placeAfter=false] true 表示插到锚点之后。
 */
export function moveLightGroupToArea(sourceId: any, targetAreaId: any, targetGroupId: any = null, placeAfter = false) {
  const sceneLightGroups = state.activeScene.lightGroups || [];
  const movedLightGroup = sceneLightGroups.find((movedGroupRef: any) => movedGroupRef.id === sourceId);
  if (!movedLightGroup) {
    return;
  }
  const nextAreaId = targetAreaId || null;
  // 先记下「区域是否真的变了」：与顺序变化分开判断，两者都没变才放弃这次拖动。
  const areaChanged = (movedLightGroup.areaId || null) !== nextAreaId;
  let nextOrder = sceneLightGroups;
  if (targetGroupId) {
    const remainingGroups = sceneLightGroups.filter(
      (remainingGroupRef: any) => remainingGroupRef.id !== sourceId
    );
    const anchorIndex = remainingGroups.findIndex(
      (anchorGroupRef: any) => anchorGroupRef.id === targetGroupId
    );
    if (anchorIndex >= 0) {
      nextOrder = [...remainingGroups];
      nextOrder.splice(anchorIndex + (placeAfter ? 1 : 0), 0, movedLightGroup);
    }
  }
  const orderChanged = nextOrder.some(
    (orderedGroup: any, orderedIndex: any) => orderedGroup.id !== sceneLightGroups[orderedIndex]?.id
  );
  if (!areaChanged && !orderChanged) {
    return;
  }
  pushHistorySnapshot();
  movedLightGroup.areaId = nextAreaId;
  if (orderChanged) {
    state.activeScene.lightGroups = nextOrder;
  }
  if (nextAreaId) {
    expandedAreaIds.add(nextAreaId);
  }
  renderLightGroupList();
  renderInspector();
  markDocumentDirty();
}

/**
 * 创建一个灯组列表行（含长按拖动排序与右键菜单）。鼠标 / 触控的拖动门限不同：触摸必须
 */
export function createLightGroupRow(listedLightGroup: any) {
  const groupRowElement = document.createElement("div");
  groupRowElement.className =
    "light-group-row" + (listedLightGroup.id === state.activeLightGroupId ? " active" : "");
  groupRowElement.dataset.lightGroupId = listedLightGroup.id;
  groupRowElement.dataset.lightGroupAreaId = listedLightGroup.areaId || "";
  groupRowElement.draggable = true;
  groupRowElement.setAttribute(
    "aria-label",
    listedLightGroup.name + "，长按拖动排序，右键可重命名、复制或删除"
  );
  let isGroupDragReady = false;
  let groupDragReadyTimer: any = null;
  // 复位长按拖动状态：清定时器与高亮，pointerup / pointercancel / dragend 共用。
  const resetGroupDragReady = () => {
    if (groupDragReadyTimer) {
      clearTimeout(groupDragReadyTimer);
    }
    groupDragReadyTimer = null;
    isGroupDragReady = false;
    groupRowElement.classList.remove("drag-ready");
  };
  // 行本身可拖动，但触摸必须先按住：图层面板要滚动，若第一下触摸就进入拖动会抢走滚动。
  groupRowElement.addEventListener("pointerdown", groupPointerDownEvent => {
    resetGroupDragReady();
    if (groupPointerDownEvent.button !== 0 || (groupPointerDownEvent.target as any).closest("button")) {
      return;
    }
    if (groupPointerDownEvent.pointerType !== "touch") {
      isGroupDragReady = true;
      return;
    }
    groupDragReadyTimer = setTimeout(() => {
      groupDragReadyTimer = null;
      isGroupDragReady = true;
      groupRowElement.classList.add("drag-ready");
    }, 280);
  });
  groupRowElement.addEventListener("pointerup", resetGroupDragReady);
  groupRowElement.addEventListener("pointercancel", resetGroupDragReady);
  groupRowElement.addEventListener("dragstart", groupDragStartEvent => {
    if (!isGroupDragReady) {
      groupDragStartEvent.preventDefault();
      resetGroupDragReady();
      return;
    }
    state.draggingLightGroupId = listedLightGroup.id;
    groupRowElement.classList.remove("drag-ready");
    groupRowElement.classList.add("dragging");
    groupDragStartEvent.dataTransfer!.effectAllowed = "move";
    groupDragStartEvent.dataTransfer!.setData(
      "application/x-homeos-light-group",
      listedLightGroup.id
    );
  });
  groupRowElement.addEventListener("dragend", () => {
    state.draggingLightGroupId = "";
    groupRowElement.classList.remove("dragging");
    resetGroupDragReady();
    clearLightGroupDropIndicators();
  });
  groupRowElement.addEventListener("click", () => {
    state.activeLightGroupId = listedLightGroup.id;
    renderLightGroupList();
  });
  groupRowElement.addEventListener("contextmenu", groupMenuEvent => {
    groupMenuEvent.preventDefault();
    openLightGroupContextMenu(listedLightGroup, groupMenuEvent);
  });
  groupRowElement.addEventListener("dragover", groupDragOverEvent => {
    if (!state.draggingLightGroupId || state.draggingLightGroupId === listedLightGroup.id) {
      return;
    }
    groupDragOverEvent.preventDefault();
    clearLightGroupDropIndicators();
    const isGroupAfterMidpoint =
      groupDragOverEvent.clientY >=
      groupRowElement.getBoundingClientRect().top +
        groupRowElement.getBoundingClientRect().height / 2;
    groupRowElement.dataset.dropPosition = isGroupAfterMidpoint ? "after" : "before";
    groupRowElement.classList.add(isGroupAfterMidpoint ? "drop-after" : "drop-before");
    if (groupDragOverEvent.dataTransfer) {
      groupDragOverEvent.dataTransfer!.dropEffect = "move";
    }
  });
  groupRowElement.addEventListener("drop", groupDropEvent => {
    if (!state.draggingLightGroupId || state.draggingLightGroupId === listedLightGroup.id) {
      return;
    }
    groupDropEvent.preventDefault();
    const draggedGroupIdValue = state.draggingLightGroupId;
    const shouldInsertGroupAfter = groupRowElement.dataset.dropPosition === "after";
    state.draggingLightGroupId = "";
    clearLightGroupDropIndicators();
    moveLightGroupToArea(
      draggedGroupIdValue,
      listedLightGroup.areaId || null,
      listedLightGroup.id,
      shouldInsertGroupAfter
    );
  });
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = listedLightGroup.enabled ? "on" : "";
  toggleButton.textContent = listedLightGroup.enabled ? "◉" : "○";
  toggleButton.title = listedLightGroup.enabled ? "关闭这个灯组" : "开启这个灯组";
  toggleButton.addEventListener("click", toggleEvent => {
    toggleEvent.stopPropagation();
    pushHistorySnapshot();
    listedLightGroup.enabled = !listedLightGroup.enabled;
    updateLightGroupsEnabled([listedLightGroup.id]);
    markDocumentDirty();
  });
  const groupNameElement = document.createElement("span");
  groupNameElement.className = "light-group-name";
  groupNameElement.textContent = listedLightGroup.name;
  groupNameElement.title = "长按灯组后拖动排序或移入区域，右键可设置区域、重命名、复制或删除";
  const countElement = document.createElement("small");
  countElement.textContent = String(
    state.activeScene.items.filter(
      (countedLight: any) =>
        LIGHT_ITEM_TYPES.has(countedLight.type) && countedLight.lightGroupId === listedLightGroup.id
    ).length
  );
  groupRowElement.append(toggleButton, groupNameElement, countElement);
  return groupRowElement;
}

/**
 * 创建一个「区域」区块（可折叠，内含该区域的灯组行）。区域头同时是拖放目标，只有
 */
export function createAreaSection(listedArea: any, memberGroups: any) {
  const isAreaExpanded = expandedAreaIds.has(listedArea.id);
  const areaSectionElement = document.createElement("div");
  areaSectionElement.className = "light-area-section";
  areaSectionElement.dataset.areaId = listedArea.id;
  const areaHeaderElement = document.createElement("div");
  areaHeaderElement.className = "light-area-row" + (isAreaExpanded ? " expanded" : "");
  areaHeaderElement.setAttribute(
    "aria-label",
    listedArea.name + "，单击展开或收起，右键可重命名或删除"
  );
  const areaCaretElement = document.createElement("button");
  areaCaretElement.type = "button";
  areaCaretElement.className = "light-area-caret";
  areaCaretElement.textContent = isAreaExpanded ? "▾" : "▸";
  areaCaretElement.title = isAreaExpanded ? "收起区域" : "展开区域";
  areaCaretElement.addEventListener("click", caretEvent => {
    caretEvent.stopPropagation();
    toggleAreaExpanded(listedArea.id);
  });
  areaHeaderElement.addEventListener("dragover", areaDragOverEvent => {
    if (!state.draggingLightGroupId) {
      return;
    }
    // 取一次被拖动的灯组，用它当前的区域判断要不要显示「可放入」高亮。
    const draggedLightGroup = (state.activeScene.lightGroups || []).find(
      (draggedGroupRef: any) => draggedGroupRef.id === state.draggingLightGroupId
    );
    if (!draggedLightGroup) {
      return;
    }
    areaDragOverEvent.preventDefault();
    clearLightGroupDropIndicators();
    if ((draggedLightGroup.areaId || null) !== listedArea.id) {
      areaHeaderElement.classList.add("drop-into");
    }
    if (areaDragOverEvent.dataTransfer) {
      areaDragOverEvent.dataTransfer!.dropEffect = "move";
    }
  });
  areaHeaderElement.addEventListener("dragleave", areaDragLeaveEvent => {
    if (!areaHeaderElement.contains(areaDragLeaveEvent.relatedTarget as any)) {
      areaHeaderElement.classList.remove("drop-into");
    }
  });
  areaHeaderElement.addEventListener("drop", areaDropEvent => {
    if (!state.draggingLightGroupId) {
      return;
    }
    areaDropEvent.preventDefault();
    areaDropEvent.stopPropagation();
    const draggedGroupIdValue = state.draggingLightGroupId;
    state.draggingLightGroupId = "";
    clearLightGroupDropIndicators();
    moveLightGroupToArea(draggedGroupIdValue, listedArea.id);
  });
  const areaNameElement = document.createElement("span");
  areaNameElement.className = "light-area-name";
  areaNameElement.textContent = listedArea.name;
  const areaCountElement = document.createElement("small");
  areaCountElement.textContent = String(memberGroups.length);
  areaHeaderElement.append(areaCaretElement, areaNameElement, areaCountElement);
  areaHeaderElement.addEventListener("click", () => toggleAreaExpanded(listedArea.id));
  areaHeaderElement.addEventListener("contextmenu", areaMenuEvent => {
    areaMenuEvent.preventDefault();
    openAreaContextMenu(listedArea, areaMenuEvent);
  });
  areaSectionElement.append(areaHeaderElement);
  if (isAreaExpanded) {
    if (!memberGroups.length) {
      const emptyAreaElement = document.createElement("div");
      emptyAreaElement.className = "light-area-empty";
      emptyAreaElement.textContent = "暂无灯组";
      areaSectionElement.append(emptyAreaElement);
    } else {
      const areaGroupsElement = document.createElement("div");
      areaGroupsElement.className = "light-area-groups";
      for (const memberGroup of memberGroups) {
        areaGroupsElement.append(createLightGroupRow(memberGroup));
      }
      areaSectionElement.append(areaGroupsElement);
    }
  }
  return areaSectionElement;
}

/**
 * 展开 / 收起某个区域（展开状态只存在内存里，不写入文档）。
 */
export function toggleAreaExpanded(areaId: any) {
  if (expandedAreaIds.has(areaId)) {
    expandedAreaIds.delete(areaId);
  } else {
    expandedAreaIds.add(areaId);
  }
  renderLightGroupList();
}

/**
 * 在鼠标位置打开区域右键菜单（重命名 / 删除）。与灯组菜单同理，坐标交给
 */
export function openAreaContextMenu(menuArea: any, areaMenuEvent: any) {
  state.areaContextMenuId = menuArea.id;
  areaContextMenuElement.hidden = false;
  positionPointMenu({
    menuElement: areaContextMenuElement,
    clientX: areaMenuEvent.clientX,
    clientY: areaMenuEvent.clientY
  });
}

/**
 * 重绘右侧图层面板（灯光 / 电器 / 家居三个分类共用一个面板）。内容跟着 activeAssetTab 走：
 */
export function renderLightGroupList() {
  const televisions = televisionItems();
  const cars = carItems();
  const showLightGroups = state.activeAssetTab === "light";
  const showTelevisionScreens = state.activeAssetTab === "appliance" && televisions.length > 0;
  const showCarCharging = state.activeAssetTab === "home" && cars.length > 0;
  lightLayerPanelElement.hidden = !(showLightGroups || showTelevisionScreens || showCarCharging);
  if (lightLayerPanelElement.hidden) {
    return;
  }
  // 同一个面板服务三个分类：灯光页下的灯组、电器页下每台电视的画面图层、
  lightGroupsOffButton.textContent = showLightGroups
    ? "全关"
    : showTelevisionScreens
      ? "全关画面"
      : "全关充电";
  addAreaButton.hidden = !showLightGroups;
  addLightGroupButton.hidden = !showLightGroups;
  lightLayerActionsElement.classList.toggle("single", !showLightGroups);
  lightGroupListElement.replaceChildren();
  if (showLightGroups) {
    ensureActiveLightGroup();
    const sceneAreas = state.activeScene.areas || [];
    const areaIdSet = new Set(sceneAreas.map((areaRef: any) => areaRef.id));
    const groupsByAreaId = new Map();
    const unassignedLightGroups = [];
    for (const listedLightGroup of state.activeScene.lightGroups) {
      const listedAreaId = areaIdSet.has(listedLightGroup.areaId) ? listedLightGroup.areaId : null;
      if (listedAreaId) {
        if (!groupsByAreaId.has(listedAreaId)) {
          groupsByAreaId.set(listedAreaId, []);
        }
        groupsByAreaId.get(listedAreaId).push(listedLightGroup);
      } else {
        unassignedLightGroups.push(listedLightGroup);
      }
    }
    for (const listedArea of sceneAreas) {
      lightGroupListElement.append(
        createAreaSection(listedArea, groupsByAreaId.get(listedArea.id) || [])
      );
    }
    for (const unassignedLightGroup of unassignedLightGroups) {
      lightGroupListElement.append(createLightGroupRow(unassignedLightGroup));
    }
  }
  if (showTelevisionScreens) {
    for (const [televisionLayerIndex, television] of televisions.entries()) {
      lightGroupListElement.append(createTelevisionLayerRow(televisionLayerIndex, television));
    }
  }
  if (showCarCharging) {
    for (const [carRowLayerIndex, car] of cars.entries()) {
      lightGroupListElement.append(createCarChargingLayerRow(carRowLayerIndex, car));
    }
  }
}

/**
 * 创建一个电视画面图层行（开关图标 + 名称 + 计数）。开关字段语义是「是否关闭」：
 */
export function createTelevisionLayerRow(televisionLayerIndex: any, television: any) {
  const televisionRowElement = document.createElement("div");
  televisionRowElement.className = "light-group-row tv-screen-layer-row";
  televisionRowElement.setAttribute(
    "aria-label",
    (television.screenLayerName || "电视画面 " + (televisionLayerIndex + 1)) + "，可独立开启或关闭"
  );
  const televisionToggleButton = document.createElement("button");
  televisionToggleButton.type = "button";
  televisionToggleButton.className = television.screenEnabled !== false ? "on" : "";
  televisionToggleButton.textContent = television.screenEnabled !== false ? "◉" : "○";
  televisionToggleButton.title =
    television.screenEnabled !== false ? "关闭电视画面" : "开启电视画面";
  televisionToggleButton.addEventListener("click", () => {
    pushHistorySnapshot();
    television.screenEnabled = television.screenEnabled === false;
    refreshStudio("items");
    markDocumentDirty();
  });
  const televisionNameElement = document.createElement("span");
  televisionNameElement.className = "light-group-name";
  televisionNameElement.textContent =
    television.screenLayerName || "电视画面 " + (televisionLayerIndex + 1);
  televisionNameElement.title = "电视开启画面";
  const televisionCountElement = document.createElement("small");
  televisionCountElement.textContent = "1";
  televisionRowElement.append(
    televisionToggleButton,
    televisionNameElement,
    televisionCountElement
  );
  return televisionRowElement;
}

/**
 * 创建一个汽车充电图层行（开关图标 + 名称 + 计数）。与电视行相反，充电状态的默认值是
 */
export function createCarChargingLayerRow(carRowLayerIndex: any, car: any) {
  const carRowElement = document.createElement("div");
  carRowElement.className = "light-group-row car-charging-layer-row";
  carRowElement.setAttribute(
    "aria-label",
    (car.chargingLayerName || "汽车充电 " + (carRowLayerIndex + 1)) + "，可独立开启或关闭"
  );
  const carToggleButton = document.createElement("button");
  carToggleButton.type = "button";
  carToggleButton.className = car.chargingEnabled === true ? "on" : "";
  carToggleButton.textContent = car.chargingEnabled === true ? "◉" : "○";
  carToggleButton.title = car.chargingEnabled === true ? "关闭汽车充电状态" : "开启汽车充电状态";
  carToggleButton.addEventListener("click", () => {
    pushHistorySnapshot();
    car.chargingEnabled = car.chargingEnabled !== true;
    refreshStudio("items");
    markDocumentDirty();
  });
  const carNameElement = document.createElement("span");
  carNameElement.className = "light-group-name";
  carNameElement.textContent = car.chargingLayerName || "汽车充电 " + (carRowLayerIndex + 1);
  carNameElement.title = "汽车充电中状态图层";
  const carCountElement = document.createElement("small");
  carCountElement.textContent = "1";
  carRowElement.append(carToggleButton, carNameElement, carCountElement);
  return carRowElement;
}

/**
 * 清空全部选中状态（主选中与多选一并清）。切层、撤销、进入对齐等场景都会先调用它；
 */
export function clearSelection() {
  state.primarySelection = null;
  state.multiSelection = [];
}

/**
 * 计算当前楼层内容的平面包围盒，供「适应视图」与初始取景使用。优先级是墙 → 家具 →
 */
export function sceneModelBounds() {
  if (state.activeScene.walls.length) {
    return modelBounds({
      background: null,
      walls: state.activeScene.walls,
      items: []
    });
  } else if (state.activeScene.items.length) {
    return modelBounds({
      background: null,
      walls: [],
      items: state.activeScene.items
    });
  } else {
    return modelBounds(state.activeScene);
  }
}

export function fitViewToBounds() {
  const bounds = sceneModelBounds();
  const padding = clamp(Math.min(state.viewportWidthPx, state.viewportHeightPx) * 0.045, 18, 34);
  const availableWidth = Math.max(state.viewportWidthPx - padding * 2, 80);
  const availableHeight = Math.max(state.viewportHeightPx - padding * 2, 80);
  const isQuarterTurn = Math.abs(state.viewTransform.rotation / 90) % 2 === 1;
  const contentWidth = isQuarterTurn ? bounds.height : bounds.width;
  const contentHeight = isQuarterTurn ? bounds.width : bounds.height;
  state.viewTransform.zoom = clamp(
    Math.min(availableWidth / contentWidth, availableHeight / contentHeight),
    0.03,
    8
  );
  state.viewTransform.offsetX =
    state.viewportWidthPx / 2 - (bounds.minX + bounds.width / 2) * state.viewTransform.zoom;
  state.viewTransform.offsetY =
    state.viewportHeightPx / 2 - (bounds.minY + bounds.height / 2) * state.viewTransform.zoom;
  state.isViewFitted = true;
  renderPlanView();
}

/**
 * 按 primarySelection 取回被选中的实体对象。单选状态只存 {kind, id}，真正的对象要从当前
 */
export function findSelectedEntity() {
  if (!state.primarySelection) {
    return null;
  }
  /**
   * 按选中类型到对应集合里按 id 查找；未知 kind 兜底为空数组。
   */
  const selectedEntity = (
    ({
      wall: state.activeScene.walls,
      window: state.activeScene.windows,
      door: state.activeScene.doors,
      railing: state.activeScene.railings,
      item: state.activeScene.items
    } as any)[state.primarySelection.kind] || []
  ).find((entityCandidate: any) => entityCandidate.id === state.primarySelection.id);
  if (!selectedEntity) {
    state.primarySelection = null;
  }
  return selectedEntity || null;
}

/**
 * 读 studio.css 声明的一枚长度型布局变量。读不到时用兜底值 —— 这里宁可退化到「旧版本写死的那个
 */
export function readStudioLayoutLength(element: any, cssVarName: any, fallbackPx: any) {
  const rawValue = getComputedStyle(element).getPropertyValue(cssVarName).trim();
  const numericValue = Number.parseFloat(rawValue);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallbackPx;
}

export function studioLayoutMetrics() {
  if (state.studioLayoutConstants) {
    return state.studioLayoutConstants;
  }
  const shellStyle = getComputedStyle(studioShellElement);
  const columnGapPx = Number.parseFloat(shellStyle.columnGap);
  state.studioLayoutConstants = {
    detailsMinWidthPx: readStudioLayoutLength(studioShellElement, "--layout-details-min-w", 420),
    // 中栏宽度下限：拖大右栏时至少要给中间绘图台留这么多。
    centerMinWidthPx: readStudioLayoutLength(studioShellElement, "--layout-center-min-w", 400),
    // 库栏宽度下限：库栏量不到宽度（尚未布局）时的兜底，也是右栏上限里要扣掉的那一段。
    libraryMinWidthPx: readStudioLayoutLength(studioShellElement, "--layout-library-min-w", 168),
    // 列间距会随断点变，写死 20px 会在窄屏下少扣一格。
    shellColumnGapPx: Number.isFinite(columnGapPx) ? columnGapPx : 10,
    // 右栏三行网格的两个内容下限与分隔条高度，全部声明在 .details-panel 上。
    previewMinHeightPx: readStudioLayoutLength(detailsPanelElement, "--layout-preview-min-h", 320),
    inspectorMinHeightPx: readStudioLayoutLength(
      detailsPanelElement,
      "--layout-inspector-min-h",
      170
    ),
    dividerHeightPx: readStudioLayoutLength(detailsPanelElement, "--layout-divider-h", 14)
  };
  return state.studioLayoutConstants;
}

/**
 * 量出右栏宽度与 3D 预览高度的比例上下限（拖拽与键盘调宽共用）。全部用「当前实际像素 ÷ 参考像素」
 */
export function measurePanelLimits() {
  const metrics = studioLayoutMetrics();
  const detailsPanelRect = detailsPanelElement.getBoundingClientRect();
  const shellRect = studioShellElement.getBoundingClientRect();
  const panelHeightPx = detailsPanelRect.height || Math.max(window.innerHeight - 90, 340);
  const shellWidthPx = shellRect.width || Math.max(window.innerWidth - 20, 860);
  const resizerHeightPx =
    detailsResizerElement.parentElement?.getBoundingClientRect().height || metrics.dividerHeightPx;
  const libraryPanelWidthPx =
    libraryPanelElement?.getBoundingClientRect().width || metrics.libraryMinWidthPx;
  return {
    minimumHeightRatio: clamp(
      metrics.previewMinHeightPx / panelHeightPx,
      0.08,
      0.5
    ),
    maximumHeightRatio: clamp(
      (panelHeightPx - resizerHeightPx - metrics.inspectorMinHeightPx) / panelHeightPx,
      0.5,
      0.94
    ),
    minimumWidthRatio: clamp(metrics.detailsMinWidthPx / shellWidthPx, 0.08, 0.45),
    // 上限 = 扣掉库栏、两条列间距、中栏下限之后，剩下全给右栏。
    maximumWidthRatio: clamp(
      (shellWidthPx -
        libraryPanelWidthPx -
        metrics.shellColumnGapPx * 2 -
        metrics.centerMinWidthPx) /
        shellWidthPx,
      0.45,
      0.86
    )
  };
}

/**
 * 全量刷新工作台界面（墙面全局参数、物件计数、面板比例、相机与灯光控件）。这是「场景数据变化后把 UI
 */
export function syncStudioUi() {
  syncSnapControls();
  renderFloorList();
  toggleBackgroundButton.disabled = !state.activeScene.background;
  toggleBackgroundButton.textContent = state.activeScene.settings.backgroundVisible ? "隐藏" : "显示";
  removePlanButton.disabled = !state.activeScene.background;
  syncControlValue(globalWallHeightInput, state.activeScene.settings.wallHeight.toFixed(2));
  syncControlValue(globalWallThicknessInput, state.activeScene.settings.wallThickness.toFixed(2));
  syncControlValue(globalWallOpacityInput, Math.round(state.activeScene.settings.wallOpacity * 100));
  toggleFloorEdgeButton.textContent =
    state.activeScene.settings.floorEdgeVisible === false ? "隐藏" : "显示";
  toggleFloorEdgeButton.setAttribute(
    "aria-pressed",
    String(state.activeScene.settings.floorEdgeVisible !== false)
  );
  canvasEmptyElement.hidden =
    !!state.activeScene.background || !!state.activeScene.walls.length || !!state.activeScene.items.length;
  sceneCountsElement.textContent =
    state.activeScene.walls.length +
    " 墙 · " +
    state.activeScene.windows.length +
    " 窗 · " +
    state.activeScene.doors.length +
    " 门 · " +
    state.activeScene.railings.length +
    " 栏杆 · " +
    state.activeScene.items.length +
    " 物件";
  renderLightGroupList();
  // 布局比例现在归 studioLayout 管（localStorage），这里只做两件事：
  migrateLegacyLayoutSettings();
  studioLayout.refresh();
  applyCameraMode(currentCameraMode());
  applyCameraView(currentCameraView());
  syncPreviewControls();
  syncCameraViewControls();
  applyBaseLighting();
  updateOnboardingSteps();
}

/**
 * 渲染右侧属性检查器：按选中类型显示对应字段组并回填当前值。三种状态互斥：框选多选（只提示数量）、单选（按 kind 切
 */
export function renderInspector() {
  const inspectedEntity = findSelectedEntity();
  const multiSelectionCount = state.multiSelection.length;
  inspectorEmptyElement.hidden = !!inspectedEntity;
  selectionInspectorElement.hidden = !inspectedEntity;
  deleteSelectionButton.disabled = !inspectedEntity && !multiSelectionCount;
  if (multiSelectionCount) {
    inspectorEmptyElement.hidden = false;
    selectionInspectorElement.hidden = true;
    inspectorEmptyElement.querySelector("strong").textContent =
      "已框选 " + multiSelectionCount + " 个对象";
    inspectorEmptyElement.querySelector("p").textContent =
      "可以直接批量删除；单击一个对象可继续精确编辑属性。";
    return;
  }
  inspectorEmptyElement.querySelector("strong").textContent = "选择画布中的对象";
  inspectorEmptyElement.querySelector("p").textContent =
    "选中墙体、窗户、门或家具后，可在这里精确调整。";
  if (!!inspectedEntity && !!state.primarySelection) {
    lightPreviewNoteElement.hidden = true;
    selectionHeadingElement.classList.remove("light-selected");
    wallFieldsElement.hidden = state.primarySelection.kind !== "wall";
    windowFieldsElement.hidden = state.primarySelection.kind !== "window";
    doorFieldsElement.hidden = state.primarySelection.kind !== "door";
    railingFieldsElement.hidden = state.primarySelection.kind !== "railing";
    itemFieldsElement.hidden = state.primarySelection.kind !== "item";
    selectionIdElement.hidden = state.primarySelection.kind === "item";
    selectionIdElement.textContent = selectionIdElement.hidden ? "" : inspectedEntity.id;
    if (state.primarySelection.kind === "wall") {
      selectElement("#selection-title").textContent = "墙体";
      syncControlValue(
        selectElement("#wall-length"),
        wallLengthMeters(inspectedEntity, currentPixelsPerMeter() || 1).toFixed(2) + " m"
      );
      syncControlValue(selectElement("#wall-height"), inspectedEntity.height.toFixed(2));
      syncControlValue(selectElement("#wall-thickness"), inspectedEntity.thickness.toFixed(2));
      const customWallOpacity =
        inspectedEntity.opacity === null || inspectedEntity.opacity === undefined
          ? null
          : clamp(finite(inspectedEntity.opacity, state.activeScene.settings.wallOpacity), 0, 1);
      selectElement("#wall-opacity-mode").value = customWallOpacity === null ? "global" : "custom";
      syncControlValue(
        selectElement("#wall-opacity"),
        Math.round((customWallOpacity ?? state.activeScene.settings.wallOpacity) * 100)
      );
      selectElement("#wall-opacity").disabled = customWallOpacity === null;
      syncStudioSelect(selectElement("#wall-opacity-mode"));
      selectElement("#wall-open-end-mode").value =
        inspectedEntity.allowOpenEnd === true ? "allowed" : "auto";
      syncStudioSelect(selectElement("#wall-open-end-mode"));
    } else if (state.primarySelection.kind === "window") {
      selectElement("#selection-title").textContent = "窗户";
      syncControlValue(selectElement("#window-width"), inspectedEntity.width.toFixed(2));
      syncControlValue(selectElement("#window-height"), inspectedEntity.height.toFixed(2));
      syncControlValue(selectElement("#window-sill"), inspectedEntity.sill.toFixed(2));
      selectElement("#window-divider").value =
        inspectedEntity.hasDivider === false ? "without" : "with";
      syncStudioSelect(selectElement("#window-divider"));
      syncControlValue(
        selectElement("#window-position"),
        Math.round(inspectedEntity.t * 100) + "%"
      );
    } else if (state.primarySelection.kind === "door") {
      selectElement("#selection-title").textContent =
        ({
          solid: "普通平开门",
          double: "双开门",
          entry: "入户门（常闭）",
          glass: "玻璃平开门",
          "sliding-glass": "玻璃推拉门",
          "roller-shutter": "卷帘门",
          "frame-only": "仅门框"
        } as any)[inspectedEntity.doorType] || "普通平开门";
      selectElement("#door-type").value = inspectedEntity.doorType || "solid";
      syncStudioSelect(selectElement("#door-type"));
      syncControlValue(selectElement("#door-width"), inspectedEntity.width.toFixed(2));
      syncControlValue(selectElement("#door-height"), inspectedEntity.height.toFixed(2));
      syncControlValue(selectElement("#door-position"), Math.round(inspectedEntity.t * 100) + "%");
      // 所有门型默认都显示「合页侧」与「内外开」两个开关，只有真正没有门扇可翻的类型例外：
      selectElement(".door-actions").hidden = inspectedEntity.doorType === "frame-only";
      selectElement("#door-hinge").hidden = ["double", "roller-shutter"].includes(
        inspectedEntity.doorType
      );
      selectElement("#door-swing").hidden = false;
      // 门材质档位按门型重建：玻璃门型才多出清玻 / 茶玻，其余门型那一格会被归一到 auto。
      syncDoorMaterialOptions(inspectedEntity.doorType, inspectedEntity.materialStyle);
    } else if (state.primarySelection.kind === "railing") {
      selectElement("#selection-title").textContent = "玻璃栏杆";
      syncControlValue(selectElement("#railing-width"), inspectedEntity.width.toFixed(2));
      syncControlValue(selectElement("#railing-height"), inspectedEntity.height.toFixed(2));
      syncControlValue(
        selectElement("#railing-position"),
        Math.round(inspectedEntity.t * 100) + "%"
      );
    } else {
      const inspectorItemDefinition = (ITEM_TYPE_DEFINITIONS as any)[inspectedEntity.type];
      const isLabelItem = inspectedEntity.type === "planlabel";
      const isLightItem = LIGHT_ITEM_TYPES.has(inspectedEntity.type);
      selectElement("#selection-title").textContent = inspectorItemDefinition?.name || "物件";
      lightPreviewNoteElement.hidden = !isLightItem;
      selectionHeadingElement.classList.toggle("light-selected", isLightItem);
      labelTextFieldsElement.hidden = !isLabelItem;
      lightFieldsElement.hidden = !isLightItem;
      curtainPositionFieldElement.hidden =
        inspectedEntity.type !== "curtain" ||
        normalizeCurtainTrack(inspectedEntity).curtainForm === "roller";
      selectElement("#curtain-track-fields").hidden = inspectedEntity.type !== "curtain";
      itemHeightFieldElement.hidden =
        isLabelItem || isLightItem || inspectedEntity.type === "flooropening";
      itemElevationFieldElement.hidden = isLabelItem || inspectedEntity.type === "flooropening";
      itemRotationFieldElement.hidden = inspectedEntity.type === "ceilinglight";
      itemRotationActionsElement.hidden = inspectedEntity.type === "ceilinglight";
      selectElement("#item-depth").readOnly =
        inspectedEntity.type === "curtain" &&
        normalizeCurtainTrack(inspectedEntity).curtainTrack !== "straight";
      const isCameraLikeItem = ["camera", "presence"].includes(inspectedEntity.type);
      itemVerticalRotationFieldElement.hidden = !isLightItem && !isCameraLikeItem;
      itemVerticalRotationFieldElement.title = isCameraLikeItem
        ? "0° 正装，±90° 侧装，180° 倒装；离地高度为底座安装点高度"
        : "";
      itemStripRollFieldElement.hidden = inspectedEntity.type !== "striplight";
      itemStripOrientationHeadingElement.hidden = inspectedEntity.type !== "striplight";
      itemLightSourceVisibilityFieldElement.hidden = inspectedEntity.type !== "striplight";
      roundTableTurntableFieldElement.hidden = !ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(
        inspectedEntity.type
      );
      stairDirectionFieldElement.hidden = !STAIR_DIRECTION_ITEM_TYPES.has(inspectedEntity.type);
      tvMountStyleFieldElement.hidden = inspectedEntity.type !== "tv";
      muralStyleFieldElement.hidden = inspectedEntity.type !== "mural";
      featureWallStyleFieldElement.hidden = inspectedEntity.type !== "featurewall";
      // 冰箱款式只对冰箱显示；回填时非 double 一律归一为 standard（与读取口径一致）。
      fridgeStyleFieldElement.hidden = inspectedEntity.type !== "fridge";
      if (inspectedEntity.type === "fridge") {
        for (const fridgeStyleRadioInput of fridgeStyleRadioInputs) {
          (fridgeStyleRadioInput as any).checked =
            (fridgeStyleRadioInput as any).value ===
            (inspectedEntity.fridgeStyle === "double" ? "double" : "standard");
        }
      }
      // 材质风格是**通用**属性：所有家居家电类型都显示，因此按「类型是否支持」而不是枚举来判断。
      materialStyleFieldElement.hidden = !isMaterialStyleCapable(inspectedEntity.type);
      pillarShapeFieldElement.hidden = inspectedEntity.type !== "pillar";
      stripAxisFieldElement.hidden = inspectedEntity.type !== "striplight";
      pillarAxisFieldElement.hidden = inspectedEntity.type !== "pillar";
      shoeCabinetActionsElement.hidden = inspectedEntity.type !== "shoecabinet";
      shoeCabinetMirrorInput.setAttribute(
        "aria-pressed",
        inspectedEntity.shoeCabinetMirrored === true ? "true" : "false"
      );
      selectElement("#item-rotation-label").textContent =
        inspectedEntity.type === "striplight"
          ? "平面旋转（°）"
          : isLightItem
            ? "平面方向（°）"
            : "旋转角度（°）";
      selectElement("#item-rotation").min = inspectedEntity.type === "striplight" ? "0" : "-360";
      selectElement("#item-rotation").max = "360";
      itemVerticalRotationLabelElement.textContent =
        inspectedEntity.type === "striplight"
          ? "安装倾斜（°）"
          : isCameraLikeItem
            ? "安装翻转／侧装（°）"
            : "出光角度（°）";
      selectElement("#item-vertical-rotation").min =
        inspectedEntity.type === "striplight" ? "0" : isCameraLikeItem ? "-180" : "-90";
      selectElement("#item-vertical-rotation").max =
        inspectedEntity.type === "striplight" ? "360" : isCameraLikeItem ? "180" : "90";
      for (const propertyApplyButton of lightPropertyApplyButtons) {
        (propertyApplyButton as any).hidden = !isLightItem;
      }
      itemWidthLabelElement.textContent =
        inspectedEntity.type === "flooropening"
          ? "洞口宽（m）"
          : inspectedEntity.type === "striplight"
            ? "发光长度（m）"
            : inspectedEntity.type === "pillar"
              ? "截面宽（m）"
              : "宽（m）";
      if (inspectedEntity.type === "curtain") {
        itemWidthLabelElement.textContent = "主边长度（m）";
      }
      itemDepthLabelElement.textContent =
        inspectedEntity.type === "flooropening"
          ? "洞口长（m）"
          : inspectedEntity.type === "striplight"
            ? "发光宽度（m）"
            : isLabelItem
              ? "铭牌高（m）"
              : inspectedEntity.type === "pillar"
                ? "截面深（m）"
                : "深（m）";
      if (isLabelItem) {
        syncControlValue(selectElement("#label-title"), inspectedEntity.title || "家庭总览");
        syncControlValue(
          selectElement("#label-title-spacing"),
          Math.round(clamp(finite(inspectedEntity.titleSpacing, 1.05), 0, 1.8) * 100)
        );
        syncControlValue(selectElement("#label-subtitle"), inspectedEntity.subtitle || "HOME PLAN");
        syncControlValue(
          selectElement("#label-subtitle-spacing"),
          Math.round(clamp(finite(inspectedEntity.subtitleSpacing, 0.08), 0, 0.6) * 100)
        );
        syncControlValue(
          selectElement("#label-line-length"),
          Math.round(clamp(finite(inspectedEntity.lineLength, 0.86), 0.3, 1) * 100)
        );
      }
      if (isLightItem) {
        const inspectorLightDefaults =
          (DEFAULT_LIGHT_SETTINGS as any)[inspectedEntity.type] || DEFAULT_LIGHT_SETTINGS.downlight;
        state.activeLightGroupId = lightGroupForItem(inspectedEntity)?.id || ensureActiveLightGroup().id;
        renderLightGroupList();
        renderLightGroupSelect(inspectedEntity);
        syncControlValue(
          selectElement("#light-temperature"),
          Math.round(
            clamp(
              finite(inspectedEntity.lightTemperature, inspectorLightDefaults.temperature),
              2200,
              6500
            )
          )
        );
        syncControlValue(
          selectElement("#light-brightness"),
          Math.round(
            clamp(
              finite(inspectedEntity.lightBrightness, inspectorLightDefaults.brightness),
              0,
              100
            )
          )
        );
        syncControlValue(
          selectElement("#light-range"),
          clamp(finite(inspectedEntity.lightRange, inspectorLightDefaults.range), 0.5, 10).toFixed(
            1
          )
        );
        selectElement("#light-angle").max = String(maxLightAngleForType(inspectedEntity.type));
        syncControlValue(
          selectElement("#light-angle"),
          Math.round(
            clamp(
              finite(inspectedEntity.lightAngle, inspectorLightDefaults.angle),
              15,
              maxLightAngleForType(inspectedEntity.type)
            )
          )
        );
        const inspectorVerticalRotation =
          inspectedEntity.type === "striplight"
            ? normalizeFullRotation(inspectedEntity.verticalRotation)
            : clamp(finite(inspectedEntity.verticalRotation, 0), -90, 90);
        syncControlValue(
          selectElement("#item-vertical-rotation"),
          Math.round(inspectorVerticalRotation * 100) / 100
        );
        syncControlValue(
          itemStripRollInput,
          Math.round(clamp(finite(inspectedEntity.stripRollRotation, 0), 0, 360) * 100) / 100
        );
        itemLightSourceVisibleInput.checked = inspectedEntity.lightSourceVisible !== false;
      }
      if (isCameraLikeItem) {
        syncControlValue(
          selectElement("#item-vertical-rotation"),
          Math.round(clamp(finite(inspectedEntity.verticalRotation, 0), -180, 180) * 100) / 100
        );
      }
      if (inspectedEntity.type === "curtain") {
        selectElement("#curtain-position").value = ["left", "right", "split"].includes(
          inspectedEntity.curtainPosition
        )
          ? inspectedEntity.curtainPosition
          : "split";
        syncStudioSelect(selectElement("#curtain-position"));
        const curtainSettings = normalizeCurtainTrack(inspectedEntity);
        // 形态（普通窗帘 / 卷帘）：卷帘下「轨道 + 布面」那一整组字段都不适用，统一隐藏，
        const curtainIsRoller = curtainSettings.curtainForm === "roller";
        selectElement("#curtain-form").value = curtainIsRoller ? "roller" : "standard";
        syncStudioSelect(selectElement("#curtain-form"));
        for (const [curtainSelectId, curtainSelectValue] of [
          ["curtain-track", curtainSettings.curtainTrack],
          ["curtain-corner", curtainSettings.curtainCorner],
          ["curtain-fabric", inspectedEntity.curtainFabric || "cloth"]
        ]) {
          selectElement("#" + curtainSelectId).value = curtainSelectValue;
          syncStudioSelect(selectElement("#" + curtainSelectId));
        }
        for (const [curtainNumberId, curtainNumberValue] of [
          ["curtain-left-length", curtainSettings.curtainLeftLength],
          ["curtain-right-length", curtainSettings.curtainRightLength],
          ["curtain-meet", curtainSettings.curtainMeet],
          ["curtain-preview", curtainSettings.curtainPreview]
        ]) {
          syncControlValue(selectElement("#" + curtainNumberId), curtainNumberValue);
        }
        selectElement("#curtain-track-field").hidden = curtainIsRoller;
        selectElement("#curtain-fabric-field").hidden = curtainIsRoller;
        selectElement("#curtain-corner-field").hidden =
          curtainIsRoller || curtainSettings.curtainTrack !== "l";
        selectElement("#curtain-left-length-field").hidden =
          curtainIsRoller ||
          curtainSettings.curtainTrack === "straight" ||
          (curtainSettings.curtainTrack === "l" && curtainSettings.curtainCorner !== "left");
        selectElement("#curtain-right-length-field").hidden =
          curtainIsRoller ||
          curtainSettings.curtainTrack === "straight" ||
          (curtainSettings.curtainTrack === "l" && curtainSettings.curtainCorner !== "right");
        selectElement("#curtain-meet-field").hidden =
          curtainIsRoller || inspectedEntity.curtainPosition !== "split";
        // 卷帘的说明文字要讲清「0% 放下 / 100% 卷起」这一套与轨道帘不同的方向语义。
        selectElement("#curtain-note").textContent = curtainIsRoller
          ? "卷帘垂直升降，0% 完全放下、100% 完全卷起；控制沿用普通窗帘。"
          : "预览打开：0% 为关闭，100% 为完全收拢。主边长度在下方调整，旋转可改变开口朝向；合拢位置沿整条轨道计算。";
        selectElement("#curtain-preview").title = curtainIsRoller
          ? "0% 完全放下，100% 完全卷起；仅调整模型预览，不控制设备"
          : "0为关闭，100为全开；仅调整模型预览，不控制设备";
      }
      if (ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(inspectedEntity.type)) {
        selectElement("#round-table-turntable").value = isRoundTableTurntableItem(inspectedEntity)
          ? "with"
          : "without";
        syncStudioSelect(selectElement("#round-table-turntable"));
      }
      if (STAIR_DIRECTION_ITEM_TYPES.has(inspectedEntity.type)) {
        selectElement("#stair-direction").value = ["left", "right"].includes(
          inspectedEntity.stairDirection
        )
          ? inspectedEntity.stairDirection
          : "right";
        syncStudioSelect(selectElement("#stair-direction"));
      }
      if (inspectedEntity.type === "tv") {
        selectElement("#tv-mount-style").value = TV_MOUNT_STYLES.has(inspectedEntity.tvMountStyle)
          ? inspectedEntity.tvMountStyle
          : "standard";
        syncStudioSelect(selectElement("#tv-mount-style"));
      }
      if (inspectedEntity.type === "mural") {
        selectElement("#mural-style").value = normalizeMuralArtStyle(inspectedEntity.muralStyle);
        syncStudioSelect(selectElement("#mural-style"));
      }
      if (inspectedEntity.type === "featurewall") {
        selectElement("#feature-wall-style").value = normalizeFeatureWallStyle(
          inspectedEntity.wallStyle
        );
        syncStudioSelect(selectElement("#feature-wall-style"));
      }
      if (isMaterialStyleCapable(inspectedEntity.type)) {
        syncMaterialStyleOptions(inspectedEntity.type, inspectedEntity.materialStyle);
      }
      if (inspectedEntity.type === "pillar") {
        selectElement("#pillar-shape").value = normalizePillarShape(inspectedEntity.pillarShape);
        syncStudioSelect(selectElement("#pillar-shape"));
        selectElement("#pillar-axis").value = normalizePillarAxis(inspectedEntity.pillarAxis);
        syncStudioSelect(selectElement("#pillar-axis"));
      }
      if (inspectedEntity.type === "striplight") {
        selectElement("#strip-axis").value = normalizeStripAxis(inspectedEntity.stripAxis);
        syncStudioSelect(selectElement("#strip-axis"));
      }
      syncControlValue(
        selectElement("#item-x"),
        (inspectedEntity.x / (currentPixelsPerMeter() || 1)).toFixed(2)
      );
      syncControlValue(
        selectElement("#item-y"),
        (inspectedEntity.y / (currentPixelsPerMeter() || 1)).toFixed(2)
      );
      const sizeFractionDigits = inspectedEntity.type === "presence" ? 3 : 2;
      for (const itemSizeInput of [selectElement("#item-width"), selectElement("#item-depth")]) {
        itemSizeInput.min = String(itemMinimumFootprint(inspectedEntity.type));
        itemSizeInput.step = inspectedEntity.type === "presence" ? "0.005" : "0.05";
      }
      syncControlValue(
        selectElement("#item-width"),
        inspectedEntity.width.toFixed(sizeFractionDigits)
      );
      selectElement("#item-height").min = String(itemMinimumHeight(inspectedEntity.type));
      selectElement("#item-height").step =
        inspectedEntity.type === "rug"
          ? "0.002"
          : inspectedEntity.type === "presence"
            ? "0.005"
            : "0.05";
      itemHeightLabelElement.textContent = pillarIsLying(inspectedEntity) ? "长（m）" : "高（m）";
      syncControlValue(
        selectElement("#item-height"),
        inspectedEntity.type === "rug"
          ? inspectedEntity.height.toFixed(3)
          : inspectedEntity.height.toFixed(sizeFractionDigits)
      );
      syncControlValue(
        selectElement("#item-depth"),
        inspectedEntity.depth.toFixed(sizeFractionDigits)
      );
      syncControlValue(
        selectElement("#item-elevation"),
        (inspectedEntity.elevation || 0).toFixed(2)
      );
      syncControlValue(
        selectElement("#item-rotation"),
        Math.round(inspectedEntity.rotation * 100) / 100
      );
    }
  }
}

/**
 * 保存 / 编辑流程里的统一刷新入口：先同步 UI 与属性检查器，再重画平面视图，最后按 scope
 */
export function refreshStudio(refreshScopeName = "all") {
  syncStudioUi();
  renderInspector();
  renderPlanView();
  if (refreshScopeName !== "none") {
    applySceneRefresh({
      scope: refreshScopeName
    });
  }
}

export async function loadBackgroundTexture() {
  const backgroundLoadRevision = ++state.backgroundRevision;
  state.backgroundTexture = null;
  if (!state.activeScene.background?.url) {
    return;
  }
  const backgroundUrl = state.activeScene.background.url;
  await new Promise(resolveBackgroundLoad => {
    let hasBackgroundSettled = false;
    /**
     * 结束本次底图加载等待（幂等：load / error / 超时谁先到谁生效）。
     */
    const settleBackgroundLoad = () => {
      if (!hasBackgroundSettled) {
        hasBackgroundSettled = true;
        resolveBackgroundLoad(undefined);
      }
    };
    const backgroundImage = new Image();
    const backgroundLoadTimeoutId = window.setTimeout(settleBackgroundLoad, 2000);
    backgroundImage.addEventListener(
      "load",
      () => {
        if (
          backgroundLoadRevision !== state.backgroundRevision ||
          state.activeScene.background?.url !== backgroundUrl
        ) {
          settleBackgroundLoad();
          return;
        }
        state.backgroundTexture = backgroundImage;
        window.clearTimeout(backgroundLoadTimeoutId);
        if (hasBackgroundSettled) {
          renderPlanView();
        } else {
          settleBackgroundLoad();
        }
      },
      {
        once: true
      }
    );
    backgroundImage.addEventListener(
      "error",
      () => {
        window.clearTimeout(backgroundLoadTimeoutId);
        if (backgroundLoadRevision === state.backgroundRevision) {
          showToast("底图加载失败，请重新导入。", "error");
        }
        settleBackgroundLoad();
      },
      {
        once: true
      }
    );
    backgroundImage.src = backgroundUrl;
  });
}

export const LIGHT_FADE_DURATION_MS = 150;

export function fadeLightGroups(groupIds: any, durationMs = LIGHT_FADE_DURATION_MS) {
  const targetGroupIds = [...new Set(groupIds)].filter(Boolean);
  if (!targetGroupIds.length) {
    return;
  }
  const groupFades = targetGroupIds.map(fadedGroupId => ({
    groupId: lightGroupScopeKey(state.activeFloorId, fadedGroupId),
    from: clamp(
      finite(
        state.brightnessByLightGroupKey.get(lightGroupScopeKey(state.activeFloorId, fadedGroupId)),
        findLightGroup(fadedGroupId)?.enabled === false ? 0 : 1
      ),
      0,
      1
    ),
    to: findLightGroup(fadedGroupId)?.enabled === false ? 0 : 1
  }));
  cancelAnimationFrame(state.lightGroupFadeFrame);
  if (!state.isLightCacheReady) {
    for (const immediateFade of groupFades) {
      state.brightnessByLightGroupKey.set(immediateFade.groupId, immediateFade.to);
    }
    if (!state.isLightCacheBuilding) {
      scheduleLightCacheBuild(0);
    }
    return;
  }
  const fadeStartMs = performance.now();
  /**
   * 淡入淡出的每帧推进：按缓动插值写回分组亮度并重新合成缓存图层。
   */
  const stepGroupFade = (fadeTimestampMs: any) => {
    const fadeProgress = clamp((fadeTimestampMs - fadeStartMs) / durationMs, 0, 1);
    const easedFadeProgress = fadeProgress * fadeProgress * (3 - fadeProgress * 2);
    for (const groupFade of groupFades) {
      state.brightnessByLightGroupKey.set(
        groupFade.groupId,
        groupFade.from + (groupFade.to - groupFade.from) * easedFadeProgress
      );
    }
    compositeLightCache();
    if (fadeProgress < 1) {
      state.lightGroupFadeFrame = requestAnimationFrame(stepGroupFade);
    } else {
      state.lightGroupFadeFrame = 0;
    }
  };
  state.lightGroupFadeFrame = requestAnimationFrame(stepGroupFade);
}

/**
 * 按 id 在当前楼层的灯光分组里查分组对象。
 */
export function findLightGroup(lightGroupIdParam: any) {
  return (
    state.activeScene.lightGroups?.find(
      (lightGroupCandidate: any) => lightGroupCandidate.id === lightGroupIdParam
    ) || null
  );
}

export function transitionLightGroups(transitionGroupIds: any, transitionDurationMs = LIGHT_FADE_DURATION_MS) {
  if (!state.previewModelRoot) {
    return false;
  }
  const transitionGroupIdSet = new Set(transitionGroupIds);
  const shouldForceLightOff = isAdaptiveLightCacheEnabled() && !state.exportRenderState;
  const lightTransitions: any = [];
  state.previewModelRoot.traverse((previewLightObject: any) => {
    if (
      !previewLightObject.isLight ||
      !transitionGroupIdSet.has(previewLightObject.userData?.lightGroupId)
    ) {
      return;
    }
    const targetLightIntensity =
      findLightGroup(previewLightObject.userData.lightGroupId)?.enabled !== false &&
      !shouldForceLightOff
        ? finite(previewLightObject.userData.lightOnIntensity, 0)
        : 0;
    if (targetLightIntensity > 0) {
      previewLightObject.visible = true;
    }
    lightTransitions.push({
      object: previewLightObject,
      from: finite(previewLightObject.intensity, 0),
      to: targetLightIntensity
    });
  });
  if (!lightTransitions.length) {
    return false;
  }
  if (lightTransitions.some(({ to: transitionTarget }: any) => transitionTarget > 0)) {
    applyShadowBudget(state.previewModelRoot, {
      rebuildAtlas: false
    });
  }
  cancelAnimationFrame(state.sceneTransitionFrame);
  const transitionStartMs = performance.now();
  /**
   * 灯光强度过渡的每帧推进（缓动同样是 smoothstep，与 fadeLightGroups 一致）。
   */
  const stepLightTransition = (transitionTimestampMs: any) => {
    const transitionProgress = clamp(
      (transitionTimestampMs - transitionStartMs) / transitionDurationMs,
      0,
      1
    );
    const easedTransitionProgress =
      transitionProgress * transitionProgress * (3 - transitionProgress * 2);
    for (const lightTransition of lightTransitions) {
      lightTransition.object.intensity =
        lightTransition.from +
        (lightTransition.to - lightTransition.from) * easedTransitionProgress;
    }
    requestRenderFrame();
    if (transitionProgress < 1) {
      state.sceneTransitionFrame = requestAnimationFrame(stepLightTransition);
    } else {
      state.sceneTransitionFrame = 0;
      let shouldHideLights = false;
      for (const hiddenLightTransition of lightTransitions) {
        if (!(hiddenLightTransition.to > 0)) {
          hiddenLightTransition.object.visible = false;
          shouldHideLights = true;
        }
      }
      if (shouldHideLights) {
        applyShadowBudget(state.previewModelRoot, {
          rebuildAtlas: false
        });
      }
    }
  };
  state.sceneTransitionFrame = requestAnimationFrame(stepLightTransition);
  return true;
}

export function updateLightGroupsEnabled(enabledGroupIds: any) {
  const enabledGroupIdList = [...new Set(enabledGroupIds)].filter(Boolean);
  if (isAdaptiveLightCacheEnabled() && !state.exportRenderState) {
    fadeLightGroups(enabledGroupIdList);
  } else if (!transitionLightGroups(enabledGroupIdList)) {
    applySceneRefresh({
      scope: "lights",
      preserveLightCache: true
    });
  }
  renderLightGroupList();
  renderInspector();
  renderPlanView();
  applyRenderQualityMode();
  scheduleLightPrecompile();
}

export function syncPreviewFloorButtons() {
  const previewMode = currentPreviewFloorMode();
  const hasSeveralFloors = (state.studioDocument?.floors.length || 0) > 1;
  for (const floorModeButton of previewFloorButtons) {
    const isActiveFloorButton = (floorModeButton as any).dataset.previewFloor === previewMode;
    floorModeButton.classList.toggle("active", isActiveFloorButton);
    floorModeButton.setAttribute("aria-pressed", String(isActiveFloorButton));
    (floorModeButton as any).disabled = (floorModeButton as any).dataset.previewFloor === "all" && !hasSeveralFloors;
  }
}

/**
 * 清空比例尺 / 画墙的临时状态（绘制结束或取消时调用）。
 * @returns {void}
 */
export function resetScaleInteractionState() {
  state.scaleStartPoint = null;
  state.snapEndpointCandidate = null;
  state.scalePointCount = 0;
  finishWallButton.hidden = true;
}
