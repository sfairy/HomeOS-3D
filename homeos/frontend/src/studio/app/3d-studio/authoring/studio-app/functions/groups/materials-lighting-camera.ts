import type { BackgroundViewSettings, StudioAppRuntime } from "../../runtime/studio-app-runtime";
import { snapItemToSurface as snapItemToSurface2 } from "../../../items/studio-surface-snap";
import { snapExhaustFan } from "../../../items/studio-exhaust-fan";
import { isCourtyardPlanItem as isCourtyardPlanItem2, courtyardToolAllowed as courtyardToolAllowed2 } from "../../../../plan/courtyard-plan";
import { remapCourtyardAttachments as remapCourtyardAttachments2 } from "../../../../plan/courtyard-drawing";
import { describeDoorMaterials } from "../../materials/door-materials";
import { buildCustomMaterialStyleRecord, customMaterialStyleId, materialStyleGroupFor, materialStylePresetFor, normalizeMaterialStyle } from "../../../../materials/studio-material-presets";
import { interactionResourcePolicy } from "../../../../studio-resource-policy";
import { prepareBackground as prepareBackground2, loadImportedImage as loadImportedImage2, backgroundFailure as backgroundFailure2, type BackgroundImportDiagnostics } from "../../../../plan/background-import";
import { WARM_WOOD_STYLE as WARM_WOOD_STYLE2 } from "../../../scene/studio-scene-style";
import { withRequestTimeout as withRequestTimeout2 } from "../../../../../shared/util/request-timeout";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { adaptiveDeviceLightBudget as adaptiveDeviceLightBudget2, adaptiveLightRenderCost as adaptiveLightRenderCost2, assessAdaptiveRenderFrames as assessAdaptiveRenderFrames2, clamp as clamp2 } from "../../../../plan/geometry";
import { syncControlValue as syncControlValue2 } from "../../../ui/ui-controls";
import { isCourtyardDrawing as isCourtyardDrawing2, DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2, finite as finite2, normalizeBaseLighting as normalizeBaseLighting2 } from "../../../../loaders/studio-normalization";
import { lampItemTypeSet } from "../../../items/item-catalog";
import { defaultViewSettings } from "../../../scene/studio-view-settings";
import { patchStudioFacadeState } from "../../../../../../engine";
import type { StudioControlElement } from "../../../types/studio-app-types";
import { generateId } from "../../../ui/studio-app-helpers";
import { minTextureSize, normalizeMaterialSurfaceOverrides } from "../../../scene/studio-scene-payload";

/** 把当前物件的出图结果存成一档个人预设（同名同组覆盖）。 */
export function saveCurrentItemMaterialStyle(runtime: StudioAppRuntime, label: any) {
  const materialEditTarget = runtime.selectedMaterialEditTarget(),
    modelItem = materialEditTarget?.record;
  if (!modelItem) return "";
  const modelType = runtime.materialEditModelType(modelItem, materialEditTarget.kind),
    presetGroup = materialStyleGroupFor(modelType);
  if (!presetGroup) return "";
  const materialSlotEntries =
    materialEditTarget.kind === "door"
      ? describeDoorMaterials(runtime.backgroundSettings, modelItem)
      : runtime.externalModelRegistry.describeItemMaterials(
          modelItem,
          runtime.materialLoadOptionsForItem(modelItem),
        );
  if (!materialSlotEntries) return "";
  const currentStyle = normalizeMaterialStyle(modelType, modelItem.materialStyle),
    customId = customMaterialStyleId(presetGroup, label),
    customRecord = buildCustomMaterialStyleRecord(
      customId,
      label,
      presetGroup,
      materialSlotEntries.map((slotEntry: any) => ({
        role: slotEntry.role,
        color: slotEntry.color || "#888888",
        roughness: slotEntry.roughness,
        metalness: slotEntry.metalness,

        slab: slotEntry.slab || "",
      })),
      materialStylePresetFor(modelType, currentStyle),
    );
  if (!customRecord) return "";
  const remainingRecords = runtime.loadCustomMaterialStyles().filter(
    (customStyleRecord: any) => customStyleRecord.id !== customId,
  );
  const nextRecords = [...remainingRecords, customRecord];
  (runtime.writeStoredCustomMaterialStyles(nextRecords),
    runtime.loadCustomMaterialStyles(),
    (runtime.appCtx.materialStyleOptionSignature = ""),
    (runtime.appCtx.materialSlotPanelSignature = ""));

  runtime.setItemMaterialStyle(customId);
  return label;
}

/** 删除一档个人预设； */
export function deleteCustomMaterialStyle(runtime: StudioAppRuntime, styleId: any) {
  if (!String(styleId).startsWith("custom:")) return;
  const nextRecords = runtime.loadCustomMaterialStyles().filter(
    (customStyleRecord: any) => customStyleRecord.id !== styleId,
  );
  (runtime.writeStoredCustomMaterialStyles(nextRecords),
    runtime.loadCustomMaterialStyles(),
    (runtime.appCtx.materialStyleOptionSignature = ""));

  const affectedItems = runtime.appCtx.studioState.items.filter(
      (sceneItem) => sceneItem.materialStyle === styleId,
    ),
    affectedDoors = runtime.appCtx.studioState.doors.filter(
      (sceneDoor) => sceneDoor.materialStyle === styleId,
    );
  if (!affectedItems.length && !affectedDoors.length)
    return void (runtime.appCtx.materialSlotPanelSignature = "");
  const undoSnapshot = runtime.captureUndoSnapshot();
  for (const affectedItem of affectedItems) delete affectedItem.materialStyle;
  for (const affectedDoor of affectedDoors) delete affectedDoor.materialStyle;
  (runtime.applyPlacementChange(undoSnapshot),
    affectedItems.length && runtime.refreshScopeItems("items"),
    affectedDoors.length && runtime.refreshScopeItems("architecture"),
    runtime.markDocumentDirty());
}

/** 「应用到同类物件」：把当前物件的档位、逐槽颜色与表面参数复制给场景里同模型的其它物件。 */
export function applyMaterialToSameModelItems(runtime: StudioAppRuntime, ) {
  const materialEditTarget = runtime.selectedMaterialEditTarget(),
    modelItem = materialEditTarget?.record;
  if (!modelItem) return 0;
  const peerItems = runtime.materialSameModelPeerRecords(materialEditTarget);
  if (!peerItems.length) return 0;
  const materialOverrides = modelItem.materialOverrides
      ? { ...modelItem.materialOverrides }
      : null,
    materialSurfaceOverrides = Object.keys(
      normalizeMaterialSurfaceOverrides(modelItem.materialSurfaceOverrides),
    ).length
      ? normalizeMaterialSurfaceOverrides(modelItem.materialSurfaceOverrides)
      : null,
    materialStyle = modelItem.materialStyle || null;
  const undoSnapshot = runtime.captureUndoSnapshot();
  for (const peerItem of peerItems)
    (materialStyle
      ? (peerItem.materialStyle = materialStyle)
      : delete peerItem.materialStyle,
      materialOverrides
        ? (peerItem.materialOverrides = { ...materialOverrides })
        : delete peerItem.materialOverrides,
      materialSurfaceOverrides
        ? (peerItem.materialSurfaceOverrides = { ...materialSurfaceOverrides })
        : delete peerItem.materialSurfaceOverrides);
  return (
    (runtime.appCtx.materialSlotPanelSignature = ""),
    runtime.applyPlacementChange(undoSnapshot),
    runtime.refreshScopeItems(
      materialEditTarget.kind === "door"
        ? "architecture"
        : runtime.resolvePreviewScope(materialEditTarget.record),
    ),
    runtime.markDocumentDirty(),
    peerItems.length
  );
}

export function refreshScopeItems(runtime: StudioAppRuntime, scopeFilter = "all") {
  (runtime.refreshBackground(),
    runtime.refreshStudioUi(),
    runtime.refreshStudioView(),
    scopeFilter !== "none" &&
      runtime.requestSceneRebuild({
        scope: scopeFilter,
      }));
}

export function setDrawingToolGroupOpen(runtime: StudioAppRuntime, drawingToolSection: any, isDrawingToolGroupOpen: any) {
  const drawingToolToggle = drawingToolSection.querySelector(".drawing-tool-toggle");
  const drawingToolPanel = drawingToolSection.querySelector(".drawing-tool-buttons");
  if (!drawingToolToggle || !drawingToolPanel) return;
  (drawingToolSection.classList.toggle("open", isDrawingToolGroupOpen),
    (drawingToolPanel.hidden = !isDrawingToolGroupOpen),
    drawingToolToggle.setAttribute("aria-expanded", String(isDrawingToolGroupOpen)));
}

export function closeDrawingToolGroups(runtime: StudioAppRuntime, drawingToolGroupToKeep: any = null) {
  for (const drawingToolSection of runtime.drawingToolSections)
    if (drawingToolSection !== drawingToolGroupToKeep)
      runtime.setDrawingToolGroupOpen(drawingToolSection, false);
}

export function syncDrawingToolGroupStates(runtime: StudioAppRuntime, ) {
  for (const drawingToolSection of runtime.drawingToolSections) {
    const activeDrawingToolBadge =
      drawingToolSection.querySelector(".drawing-tool-active") as StudioControlElement | null;
    if (!activeDrawingToolBadge) continue;
    const activeDrawingToolButton =
      drawingToolSection.querySelector(".tool-button.active") as StudioControlElement | null;
    activeDrawingToolBadge.textContent = "";
    if (activeDrawingToolButton) {
      const activeDrawingToolIcon = activeDrawingToolButton.querySelector("i");
      const activeDrawingToolLabel = activeDrawingToolButton.querySelector("span");
      if (activeDrawingToolIcon) activeDrawingToolBadge.append(activeDrawingToolIcon.cloneNode(true));
      if (activeDrawingToolLabel?.textContent)
        activeDrawingToolBadge.append(activeDrawingToolLabel.textContent);
    }
    (activeDrawingToolBadge.hidden = !activeDrawingToolButton),
      drawingToolSection.classList.toggle("has-active", Boolean(activeDrawingToolButton));
  }
}

export function selectStudioTool(runtime: StudioAppRuntime, toolId: any) {
  if (!(runtime.toolHelpMessages as any)[toolId]) return;
  if (
    (toolId.startsWith("courtyard-") &&
      runtime.appCtx.activeLibraryCategory !== "courtyard" &&
      runtime.setAssetCategory("courtyard"),
    runtime.appCtx.activeLibraryCategory === "courtyard" && !courtyardToolAllowed2(toolId))
  ) {
    runtime.showToast("庭院编辑中户型已锁定，请先切回家居或电器。");
    return;
  }

  if (runtime.appCtx.activeLibraryCategory === "light" && toolId !== "select" && toolId !== "pan") {
    runtime.showToast("灯光编辑中户型已锁定，请先切回家居、电器或庭院。");
    return;
  }
  const shouldWarnOpenWall = runtime.appCtx.activeToolName === "wall" && toolId !== "wall" && runtime.appCtx.wallSegmentCount > 0;
  ((runtime.appCtx.activeToolName = toolId),
    runtime.planPainter?.setTool(toolId),
    (runtime.planCanvasElement.dataset.tool = toolId),
    (runtime.planCanvasElement.style.cursor = ""));
  for (const toolButton of runtime.toolButtons)
    (toolButton.classList.toggle("active", toolButton.dataset.tool === toolId),
      toolButton.setAttribute("aria-pressed", String(toolButton.dataset.tool === toolId)));
  patchStudioFacadeState({ activeTool: toolId });
  patchStudioFacadeState({ activeTool: toolId });
  (runtime.closeDrawingToolGroups(),
    runtime.syncDrawingToolGroupStates(),
    ([runtime.activeToolLabel.textContent, runtime.toolHelpElement.textContent] =
    runtime.appCtx.activeLibraryCategory === "light" && toolId === "select"
      ? ["灯光编辑", "户型已锁定；框选多盏灯后可整体拖动，Shift 锁轴，Option/Alt 复制"]
      : runtime.appCtx.activeLibraryCategory === "courtyard" && toolId === "select"
        ? ["庭院编辑", "其他对象已锁定；可选择、移动、框选庭院对象，切换分类恢复编辑"]
        : (runtime.toolHelpMessages as any)[toolId]),
    (runtime.finishWallButton.hidden = toolId !== "wall" || !runtime.appCtx.segmentStartPoint),
    toolId !== "wall" && runtime.refreshPreviewScene(),
    toolId !== "scale" && (runtime.appCtx.previewEndPoint = null),
    (runtime.appCtx.snapHit = null),
    (runtime.appCtx.windowPlacement = null),
    (runtime.appCtx.doorPlacement = null),
    (runtime.appCtx.railingPlacement = null),
    runtime.refreshStudioView(),
    shouldWarnOpenWall &&
      runtime.showToast("当前墙线未闭合，不会生成地面；如果绘制的是隔墙，可以忽略此提醒。", "warning"));
}

export function ensureCalibrationReady(runtime: StudioAppRuntime, fallbackToolId = "scale") {
  return runtime.getPixelsPerMeter()
    ? true
    : (runtime.showToast("请先画一条参考线并填写真实长度。", "error"),
      runtime.selectStudioTool(fallbackToolId),
      false);
}

export function clearSelection(runtime: StudioAppRuntime, ) {
  if (
    ((runtime.appCtx.selectedItems = runtime.appCtx.selectedItems.filter(runtime.isSelectionAllowed)),
    runtime.appCtx.selectedItem && !runtime.isSelectionAllowed(runtime.appCtx.selectedItem) && runtime.refreshSelection(),
    runtime.appCtx.selectedItems.length)
  ) {
    const qa2 = runtime.getCurrentPreviewScope();
    runtime.deselectAll();
    const clearSelectionWallIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((wallDrawingEntry: any) => wallDrawingEntry.kind === "wall")
          .map((wallDrawing: any) => wallDrawing.id),
      ),
      windowIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((windowDrawingEntry: any) => windowDrawingEntry.kind === "window")
          .map((windowDrawing: any) => windowDrawing.id),
      ),
      doorIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((doorDrawingEntry: any) => doorDrawingEntry.kind === "door")
          .map((doorDrawing: any) => doorDrawing.id),
      ),
      railingIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((railingDrawingEntry: any) => railingDrawingEntry.kind === "railing")
          .map((railingDrawing: any) => railingDrawing.id),
      ),
      itemIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((itemDrawingEntry: any) => itemDrawingEntry.kind === "item")
          .map((itemDrawing: any) => itemDrawing.id),
      );
    ((runtime.appCtx.studioState.walls = runtime.appCtx.studioState.walls.filter(
      (removedWall) => !clearSelectionWallIdSet.has(removedWall.id),
    )),
      (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.filter(
        (windowItem) =>
          !windowIdSet.has(windowItem.id) && !clearSelectionWallIdSet.has(windowItem.wallId),
      )),
      (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.filter(
        (doorItem) => !doorIdSet.has(doorItem.id) && !clearSelectionWallIdSet.has(doorItem.wallId),
      )),
      (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.filter(
        (railingItem) =>
          !railingIdSet.has(railingItem.id) && !clearSelectionWallIdSet.has(railingItem.wallId),
      )),
      (runtime.appCtx.studioState.items = runtime.appCtx.studioState.items.filter(
        (removedItem) => !itemIdSet.has(removedItem.id),
      )),
      clearSelectionWallIdSet.size && runtime.rebuildWallIndex(),
      runtime.refreshSelection(),
      runtime.refreshScopeItems(qa2),
      runtime.markDocumentDirty());
    return;
  }
  const at5 = runtime.getSelectedObject();
  if (!at5 || !runtime.appCtx.selectedItem) return;
  const qa3 = runtime.getCurrentPreviewScope();
  (runtime.deselectAll(),
    runtime.appCtx.selectedItem.kind === "wall"
      ? ((runtime.appCtx.studioState.walls = runtime.appCtx.studioState.walls.filter((wallById) => wallById.id !== at5.id)),
        (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.filter(
          (windowByWallId) => windowByWallId.wallId !== at5.id,
        )),
        (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.filter(
          (doorByWallId) => doorByWallId.wallId !== at5.id,
        )),
        (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.filter(
          (railingByWallId) => railingByWallId.wallId !== at5.id,
        )),
        runtime.rebuildWallIndex())
      : runtime.appCtx.selectedItem.kind === "window"
        ? (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.filter(
            (windowById) => windowById.id !== at5.id,
          ))
        : runtime.appCtx.selectedItem.kind === "door"
          ? (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.filter((doorById) => doorById.id !== at5.id))
          : runtime.appCtx.selectedItem.kind === "railing"
            ? (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.filter(
                (railingById) => railingById.id !== at5.id,
              ))
            : (runtime.appCtx.studioState.items = runtime.appCtx.studioState.items.filter(
                (excludedItem) => excludedItem.id !== at5.id,
              )),
    runtime.refreshSelection(),
    runtime.refreshScopeItems(qa3),
    runtime.markDocumentDirty());
}

export function finalizeAddedItem(runtime: StudioAppRuntime, addedItem: any, movingIds = [addedItem.id]) {
  /**
   * 排气扇只吸墙、不参与台面吸附（0.8.0 在这里明确 `return`）。
   * 朝向保持拖动后的状态，只有新建路径才会先按墙走向对齐。
   */
  if (addedItem?.type === "exhaust-fan") {
    snapExhaustFan(addedItem, runtime.appCtx.studioState.walls, runtime.getPixelsPerMeter());
    return;
  }
  return snapItemToSurface2({
    THREE: ns2,
    item: addedItem,
    items: runtime.appCtx.studioState.items,
    pixelsPerMeter: runtime.getPixelsPerMeter(),
    enabled: runtime.isSnapEnabled() && runtime.appCtx.studioState.settings.snapSurfaces !== false,
    movingIds: movingIds,
    mountModel: (mountedModelItem: any, externalModel: any) =>
      runtime.externalModelRegistry.addExternalItemModel(
        mountedModelItem,
        externalModel,
        runtime.materialLoadOptionsForItem(mountedModelItem),
      ),
  });
}

export function duplicateSelection(runtime: StudioAppRuntime, ) {
  const duplicateSourceIdSet = new Set([
      ...(runtime.appCtx.selectedItem?.kind === "item" ? [runtime.appCtx.selectedItem.id] : []),
      ...runtime.appCtx.selectedItems
        .filter((duplicateDrawingEntry: any) => duplicateDrawingEntry.kind === "item")
        .map((duplicateDrawing: any) => duplicateDrawing.id),
    ]),
    duplicateItems = runtime.appCtx.studioState.items.filter(
      (filteredSceneItem) =>
        duplicateSourceIdSet.has(filteredSceneItem.id) && runtime.isPlanItemVisible(filteredSceneItem),
    );
  if (!duplicateItems.length) {
    runtime.showToast("请先选择要复制的灯具、家具或电器。");
    return;
  }
  const ft3 = runtime.captureUndoSnapshot(),
    duplicateOffset = (runtime.getPixelsPerMeter() || 100) * 0.12,
    duplicateClones = duplicateItems.map((sourceItem) => ({
      ...structuredClone(sourceItem),
      id: generateId("item"),
      x: sourceItem.x + duplicateOffset,
      y: sourceItem.y + duplicateOffset,
    }));
  (remapCourtyardAttachments2(duplicateItems, duplicateClones),
    runtime.pushUndoEntry(duplicateClones),
    runtime.appCtx.studioState.items.push(...duplicateClones),
    runtime.validateSelectionChange(ft3) &&
      (runtime.applyPlacementChange(ft3),
      duplicateClones.length === 1
        ? runtime.selectSceneObject("item", duplicateClones[0].id)
        : ((runtime.appCtx.selectedItem = null),
          (runtime.appCtx.selectedItems = duplicateClones.map((clonedItem) => ({
            kind: "item",
            id: clonedItem.id,
          })))),
      runtime.refreshScopeItems(
        runtime.classifySelectionScope(
          duplicateClones.map((clonedItemRecord) => ({
            kind: "item",
            id: clonedItemRecord.id,
          })),
        ),
      ),
      runtime.markDocumentDirty(),
      runtime.showToast("已复制 " + duplicateClones.length + " 个物件。")));
}

export function collectSelectedPlanItems(runtime: StudioAppRuntime, ) {
  const planItemIdSet = new Set([
      ...(runtime.appCtx.selectedItem?.kind === "item" ? [runtime.appCtx.selectedItem.id] : []),
      ...runtime.appCtx.selectedItems
        .filter((planDrawingEntry: any) => planDrawingEntry.kind === "item")
        .map((planDrawing: any) => planDrawing.id),
    ]);
  return runtime.appCtx.studioState.items.filter(
    (candidateSceneItem) =>
      planItemIdSet.has(candidateSceneItem.id) && runtime.isPlanItemVisible(candidateSceneItem),
  );
}

export function mirrorSelection(runtime: StudioAppRuntime, ) {
  const zy2 = runtime.collectSelectedPlanItems();
  if (!zy2.length) {
    runtime.showToast("请先选择要复制的灯具、家具或电器。");
    return;
  }
  runtime.appCtx.clipboardItems = zy2.map((mirroredSourceItem: any) => structuredClone(mirroredSourceItem));
  const ae7 = runtime.getActiveFloor();
  ((runtime.appCtx.clipboardSourceFloor = {
    id: ae7.id,
    originX: ae7.originX,
    originY: ae7.originY,
    offsetX: ae7.offsetX,
    offsetZ: ae7.offsetZ,
    rotation: ae7.rotation,
    scene: {
      calibration: structuredClone(runtime.appCtx.studioState.calibration),
    },
  }),
    (runtime.appCtx.pasteOffsetFactor = 0),
    runtime.showToast("已复制 " + runtime.appCtx.clipboardItems.length + " 个物件，按 ⌘/Ctrl+V 粘贴。"));
}

export function rotateSelection(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.clipboardItems.length) {
    runtime.showToast("暂无可粘贴的物件。");
    return;
  }
  if (
    runtime.appCtx.clipboardItems.some(
      (validatedPlanItem: any) =>
        validatedPlanItem.type === "flooropening" || isCourtyardDrawing2(validatedPlanItem),
    ) &&
    !runtime.ensureCalibrationReady()
  )
    return;
  if (
    runtime.appCtx.activeLibraryCategory === "courtyard" &&
    runtime.appCtx.clipboardItems.some((courtyardPlanItem: any) => !isCourtyardPlanItem2(courtyardPlanItem))
  ) {
    runtime.showToast("庭院编辑中只能粘贴庭院对象，请先切换分类。");
    return;
  }
  const every = runtime.appCtx.clipboardItems.every((planItemEntry: any) => lampItemTypeSet.has(planItemEntry.type));
  every && runtime.appCtx.activeLibraryCategory !== "light"
    ? runtime.setAssetCategory("light")
    : !every && runtime.appCtx.activeLibraryCategory === "light" && runtime.setAssetCategory("home");
  const ft4 = runtime.captureUndoSnapshot();
  runtime.appCtx.pasteOffsetFactor += 1;
  const selectionOffset = (runtime.getPixelsPerMeter() || 100) * 0.12 * runtime.appCtx.pasteOffsetFactor,
    movedClones = runtime.appCtx.clipboardItems.map((movedSourceItem: any) => ({
      ...structuredClone(movedSourceItem),
      id: generateId("item"),
      x: movedSourceItem.x + selectionOffset,
      y: movedSourceItem.y + selectionOffset,
      ...((movedSourceItem.type === "flooropening" ||
        isCourtyardDrawing2(movedSourceItem) ||
        movedSourceItem.courtyardGate) &&
      runtime.appCtx.clipboardSourceFloor &&
      runtime.appCtx.clipboardSourceFloor.id !== runtime.getActiveFloor().id
        ? {
            ...runtime.worldPointForFloor(movedSourceItem, runtime.appCtx.clipboardSourceFloor, runtime.getActiveFloor()),
            rotation:
              movedSourceItem.rotation +
              finite2(runtime.appCtx.clipboardSourceFloor.rotation, 0) -
              finite2(runtime.getActiveFloor().rotation, 0),
          }
        : {}),
      ...(lampItemTypeSet.has(movedSourceItem.type) &&
      !runtime.appCtx.studioState.lightGroups.some((lightGroup) => lightGroup.id === movedSourceItem.lightGroupId)
        ? {
            lightGroupId: runtime.getLightGroups().id,
          }
        : {}),
    }));
  (remapCourtyardAttachments2(runtime.appCtx.clipboardItems, movedClones),
    runtime.pushUndoEntry(movedClones),
    runtime.appCtx.studioState.items.push(...movedClones),
    runtime.validateSelectionChange(ft4) &&
      (runtime.applyPlacementChange(ft4),
      movedClones.length === 1
        ? runtime.selectSceneObject("item", movedClones[0].id)
        : ((runtime.appCtx.selectedItem = null),
          (runtime.appCtx.selectedItems = movedClones.map((movedItem: any) => ({
            kind: "item",
            id: movedItem.id,
          })))),
      runtime.refreshScopeItems(
        runtime.classifySelectionScope(
          movedClones.map((movedItemRecord: any) => ({
            kind: "item",
            id: movedItemRecord.id,
          })),
        ),
      ),
      runtime.markDocumentDirty(),
      runtime.showToast("已粘贴 " + movedClones.length + " 个物件。")));
}

export async function loadBackgroundImage(runtime: StudioAppRuntime, ) {
  const backgroundLoadToken = ++runtime.appCtx.backgroundLoadRequestId;
  if (((runtime.appCtx.backgroundImageSource = null), !runtime.appCtx.studioState.background?.url)) return;
  const url = runtime.appCtx.studioState.background.url;
  await new Promise<void>((resolveLoad) => {
    let isLoadResolved = false;
    const handleLoadTimeout = () => {
        isLoadResolved || ((isLoadResolved = true), resolveLoad());
      },
      image = new Image(),
      loadTimeoutId = window.setTimeout(handleLoadTimeout, 2000);
    (image.addEventListener(
      "load",
      () => {
        if (
          backgroundLoadToken !== runtime.appCtx.backgroundLoadRequestId ||
          runtime.appCtx.studioState.background?.url !== url
        ) {
          handleLoadTimeout();
          return;
        }
        ((runtime.appCtx.backgroundImageSource = image),
          window.clearTimeout(loadTimeoutId),
          isLoadResolved ? runtime.refreshStudioView() : handleLoadTimeout());
      },
      {
        once: true,
      },
    ),
      image.addEventListener(
        "error",
        () => {
          (window.clearTimeout(loadTimeoutId),
            backgroundLoadToken === runtime.appCtx.backgroundLoadRequestId &&
              runtime.showToast("底图加载失败，请重新导入。", "error"),
            handleLoadTimeout());
        },
        {
          once: true,
        },
      ),
      (image.src = url));
  });
}

export async function importBackgroundFile(runtime: StudioAppRuntime, backgroundFile: any) {
  if (!backgroundFile || runtime.importPlanButton.disabled) return;
  const importOptions: BackgroundImportDiagnostics = {},
    ae8 = runtime.getActiveFloor(),
    background = runtime.appCtx.studioState.background,
    backgroundImportErrorElement = runtime.selectElement("#background-import-error");
  ((backgroundImportErrorElement.hidden = true),
    (runtime.importPlanButton.disabled = true),
    (runtime.importPlanButton.textContent = "处理中…"));
  try {
    const preparedBackground = await prepareBackground2(backgroundFile, importOptions);
    ((importOptions.stage = "上传图片"), (runtime.importPlanButton.textContent = "上传中…"));
    const uploadResponse = await withRequestTimeout2(120000, (abortSignal) =>
      runtime.fetchStudioApi("/assets/user", {
        method: "POST",
        body: preparedBackground.file,
        signal: abortSignal,
        headers: {
          "Content-Type": preparedBackground.file.type,
          "X-File-Name": encodeURIComponent(preparedBackground.file.name),
        },
      }),
    );
    ((importOptions.stage = "加载底图"),
      (importOptions.uploadSize = uploadResponse.width + " × " + uploadResponse.height),
      (runtime.importPlanButton.textContent = "加载中…"));
    const importedImage = await loadImportedImage2(uploadResponse.url),
      width3 = importedImage.naturalWidth || uploadResponse.width,
      height3 = importedImage.naturalHeight || uploadResponse.height;
    if (runtime.getActiveFloor() !== ae8 || runtime.appCtx.studioState.background !== background) {
      runtime.showToast("当前户型已切换或底图已改变，请重新导入。", "warning");
      return;
    }
    (runtime.deselectAll(),
      (runtime.appCtx.studioState.background = {
        assetId: uploadResponse.assetId,
        url: uploadResponse.url,
        name: uploadResponse.name,
        width: width3,
        height: height3,
      }));
    const ae9 = runtime.getActiveFloor();
    (ae9 &&
      !ae9.originInitialized &&
      ((ae9.originX = width3 / 2), (ae9.originY = height3 / 2), (ae9.originInitialized = true)),
      (runtime.appCtx.studioState.settings.backgroundVisible = true),
      ++runtime.appCtx.backgroundLoadRequestId,
      (runtime.appCtx.backgroundImageSource = importedImage),
      runtime.resetView(),
      runtime.refreshScopeItems(),
      runtime.markDocumentDirty(),
      runtime.selectStudioTool("scale"));
    const join2 = preparedBackground.adjustments.join("，");
    runtime.showToast(
      (join2 ? join2 + "。" : "") + "底图已导入，请在图上画一条已知长度的参考线。",
      join2 ? "warning" : "",
    );
  } catch (importError: any) {
    const backgroundFailure = backgroundFailure2(importError, importOptions);
    ((runtime.selectElement("#background-import-message").textContent = backgroundFailure.message),
      (runtime.selectElement("#background-import-details").value = backgroundFailure.details),
      (backgroundImportErrorElement.hidden = false),
      runtime.showToast(backgroundFailure.message, "error"));
  } finally {
    ((runtime.importPlanButton.disabled = false), (runtime.importPlanButton.textContent = "导入"));
  }
}

export function backgroundSettings(runtime: StudioAppRuntime, ): BackgroundViewSettings {
  return runtime.appCtx.sceneStyle === "warm-wood"
    ? {
        ...defaultViewSettings,
        ...WARM_WOOD_STYLE2,
      }
    : defaultViewSettings;
}

export function positionLightFromAngles(runtime: StudioAppRuntime, lightObject: any, azimuthDegrees: any, elevationDegrees: any, lightDistance: any) {
  if (!lightObject) return;
  const degToRad = ns2.MathUtils.degToRad(azimuthDegrees),
    degToRad2 = ns2.MathUtils.degToRad(elevationDegrees),
    horizontalDistance = Math.cos(degToRad2) * lightDistance;
  lightObject.position.set(
    Math.cos(degToRad) * horizontalDistance,
    Math.sin(degToRad2) * lightDistance,
    Math.sin(degToRad) * horizontalDistance,
  );
}

export function refreshBaseLighting(runtime: StudioAppRuntime, ) {
  const yt2 = runtime.backgroundSettings(),
    vn2 = runtime.appCtx.baseLightingSettings;
  if (!runtime.appCtx.threeScene || !runtime.appCtx.threeRenderer) return;
  ((runtime.appCtx.threeScene.background = null),
    runtime.appCtx.threeRenderer.setClearColor(yt2.background, 0),
    (runtime.appCtx.threeScene.fog = null),
    (runtime.appCtx.threeRenderer.toneMappingExposure = vn2.exposure));

  const intensityScale = runtime.isEmbedStageMode ? 0.5 : 1;
  (runtime.appCtx.hemisphereLight &&
    (runtime.appCtx.hemisphereLight.color.setHex(yt2.warmWood ? 16776178 : 14606046),
    runtime.appCtx.hemisphereLight.groundColor.setHex(yt2.warmWood ? 10524035 : 2236962),
    (runtime.appCtx.hemisphereLight.intensity = vn2.hemisphereIntensity * intensityScale)),
    runtime.appCtx.ambientLight &&
      (runtime.appCtx.ambientLight.color.setHex(yt2.warmWood ? 15592162 : 10132122),
      (runtime.appCtx.ambientLight.intensity = vn2.ambientIntensity * intensityScale)),
    runtime.appCtx.mainDirectionalLight &&
      (runtime.appCtx.mainDirectionalLight.color.setHex(yt2.warmWood ? 16774367 : 16053492),
      (runtime.appCtx.mainDirectionalLight.intensity = vn2.mainIntensity * intensityScale),
      runtime.positionLightFromAngles(runtime.appCtx.mainDirectionalLight, vn2.mainAzimuth, vn2.mainElevation, 18.4),
      (runtime.appCtx.mainDirectionalLight.shadow.bias = -0.00012),
      (runtime.appCtx.mainDirectionalLight.shadow.normalBias = 0.016),
      (runtime.appCtx.mainDirectionalLight.shadow.radius = 1.75),
      (runtime.appCtx.mainDirectionalLight.shadow.blurSamples = 4),
      runtime.appCtx.isGroundShadowEnabled &&
        ((runtime.appCtx.mainDirectionalLight.shadow.radius = 1.2), (runtime.appCtx.mainDirectionalLight.shadow.blurSamples = 8)),
      (runtime.appCtx.mainDirectionalLight.shadow.intensity = vn2.mainShadowIntensity)),
    runtime.appCtx.fillDirectionalLight &&
      (runtime.appCtx.fillDirectionalLight.color.setHex(yt2.warmWood ? 14346221 : 10921638),
      (runtime.appCtx.fillDirectionalLight.intensity = vn2.fillIntensity * intensityScale),
      runtime.positionLightFromAngles(runtime.appCtx.fillDirectionalLight, vn2.fillAzimuth, vn2.fillElevation, 15.2)),
    runtime.appCtx.topDirectionalLight &&
      (runtime.appCtx.topDirectionalLight.color.setHex(yt2.warmWood ? 16776693 : 16250871),
      (runtime.appCtx.topDirectionalLight.intensity = vn2.topIntensity * intensityScale),
      runtime.positionLightFromAngles(runtime.appCtx.topDirectionalLight, vn2.topAzimuth, vn2.topElevation, 16.1)));
}

export function setShadowQualityHigh(runtime: StudioAppRuntime, isHighQuality: any) {
  const isHighQualityEnabled = isHighQuality === true;
  if (isHighQualityEnabled !== runtime.appCtx.isGroundShadowEnabled) {
    if (isHighQualityEnabled && runtime.appCtx.mainDirectionalLight?.shadow?.camera) {
      const camera = runtime.appCtx.mainDirectionalLight.shadow.camera;
      runtime.appCtx.savedShadowCamera = {
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
        near: camera.near,
        far: camera.far,
      };
    }
    if (
      ((runtime.appCtx.isGroundShadowEnabled = isHighQualityEnabled),
      runtime.refreshBaseLighting(),
      !isHighQualityEnabled && runtime.appCtx.savedShadowCamera && runtime.appCtx.mainDirectionalLight?.shadow?.camera)
    ) {
      const camera2 = runtime.appCtx.mainDirectionalLight.shadow.camera;
      (Object.assign(camera2, runtime.appCtx.savedShadowCamera),
        camera2.updateProjectionMatrix(),
        (runtime.appCtx.savedShadowCamera = null));
    }
    (runtime.appCtx.mainDirectionalLight?.shadow && (runtime.appCtx.mainDirectionalLight.shadow.needsUpdate = true),
      runtime.appCtx.threeRenderer?.domElement &&
        (runtime.appCtx.threeRenderer.domElement.dataset.exportShadowQuality = isHighQualityEnabled
          ? "high"
          : "realtime"));
  }
}

export function clampShadowMapSize(runtime: StudioAppRuntime, shadowMapSize: any) {
  if (!runtime.appCtx.isGroundShadowEnabled) return shadowMapSize;
  const maxTextureSize = Math.max(
    1,
    Math.floor(finite2(runtime.appCtx.threeRenderer?.capabilities?.maxTextureSize, minTextureSize)),
  );
  return Math.min(maxTextureSize, Math.max(shadowMapSize, minTextureSize));
}

export function syncBaseLightingControls(runtime: StudioAppRuntime, ) {
  for (const baseLightControlInput of runtime.baseLightControlInputs) {
    const baseLightValue = (runtime.appCtx.baseLightingSettings as any)[baseLightControlInput.dataset.baseLightControl!],
      isIntegerStep = baseLightControlInput.step === "5";
    syncControlValue2(
      baseLightControlInput,
      isIntegerStep ? Math.round(baseLightValue) : Number(baseLightValue.toFixed(2)),
    );
  }
}

export function applyBaseLighting(runtime: StudioAppRuntime, baseLightingConfig: any) {
  const vn3 = runtime.appCtx.baseLightingSettings;
  ((runtime.appCtx.baseLightingSettings = normalizeBaseLighting2(baseLightingConfig)),
    runtime.syncBaseLightingControls(),
    runtime.refreshBaseLighting(),
    runtime.refreshSceneRender({
      shadows: Object.keys(DEFAULT_BASE_LIGHTING2).some(
        (lightingKey) => (vn3 as any)[lightingKey] !== (runtime.appCtx.baseLightingSettings as any)[lightingKey],
      ),
    }));
}

export function saveBaseLightingEdit(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.studioProject || !runtime.baseLightControlsElement) return;
  const en2 = runtime.exportDialogElement?.open ? runtime.exportDialogElement : document.body;
  (runtime.baseLightControlsElement.parentElement !== en2 && en2.append(runtime.baseLightControlsElement),
    runtime.baseLightControlsElement.hidden && runtime.applyBaseLighting(runtime.appCtx.studioProject.baseLighting),
    (runtime.baseLightControlsElement.hidden = false));
  const panelBoundingRect = runtime.baseLightControlsElement.getBoundingClientRect();
  (panelBoundingRect.right > window.innerWidth - 8 ||
    panelBoundingRect.bottom > window.innerHeight - 8 ||
    panelBoundingRect.left < 8 ||
    panelBoundingRect.top < 8) &&
    ((runtime.baseLightControlsElement.style.right = "auto"),
    (runtime.baseLightControlsElement.style.left =
      clamp2(
        panelBoundingRect.left,
        8,
        Math.max(8, window.innerWidth - panelBoundingRect.width - 8),
      ) + "px"),
    (runtime.baseLightControlsElement.style.top =
      clamp2(
        panelBoundingRect.top,
        8,
        Math.max(8, window.innerHeight - panelBoundingRect.height - 8),
      ) + "px"));
}

export function openLightingDialog(runtime: StudioAppRuntime, ) {
  runtime.baseLightControlsElement &&
    (runtime.appCtx.studioProject && runtime.applyBaseLighting(runtime.appCtx.studioProject.baseLighting),
    (runtime.baseLightControlsElement.hidden = true));
}

export function confirmLightingDialog(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.studioProject) return;
  const normalizedBaseLighting = normalizeBaseLighting2(runtime.appCtx.baseLightingSettings);
  ((runtime.appCtx.studioProject.baseLighting = normalizedBaseLighting),
    runtime.applyBaseLighting(normalizedBaseLighting),
    runtime.markDocumentDirty(),
    runtime.appCtx.lightPreviewWorker?.postMessage({
      type: "base-lighting-saved",
      lighting: normalizedBaseLighting,
    }),
    runtime.flushAutosave(),
    runtime.showToast("基础光设置已保存，导图和自动化控件已同步。", "success"));
}

export function updateBaseLightingFromInput(runtime: StudioAppRuntime, lightingInput: any) {
  const baseLightControl = lightingInput.dataset.baseLightControl;
  baseLightControl in runtime.appCtx.baseLightingSettings &&
    ((runtime.appCtx.baseLightingSettings = normalizeBaseLighting2({
      ...runtime.appCtx.baseLightingSettings,
      [baseLightControl]: finite2(lightingInput.value, (runtime.appCtx.baseLightingSettings as any)[baseLightControl]),
    })),
    runtime.refreshBaseLighting(),
    runtime.refreshSceneRender({
      shadows: true,
    }));
}

export function cameraSettings(runtime: StudioAppRuntime, ) {
  return runtime.getPreviewFloorMode() === "all"
    ? runtime.appCtx.studioProject.combinedCameraSettings
    : runtime.appCtx.studioState.settings;
}

export function getCameraMode(runtime: StudioAppRuntime, ) {
  return runtime.cameraSettings()?.cameraMode === "perspective" ? "perspective" : "orthographic";
}

export function getCameraView(runtime: StudioAppRuntime, ) {
  return runtime.cameraSettings()?.cameraView === "top" ? "top" : "free";
}

export function getCameraTopRotation(runtime: StudioAppRuntime, ) {
  return (
    (((Math.round(finite2(runtime.cameraSettings()?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) % 360
  );
}

export function buildCameraUpVector(runtime: StudioAppRuntime, topRotationDegrees = runtime.getCameraTopRotation()) {
  const degToRad3 = ns2.MathUtils.degToRad(topRotationDegrees);
  return new ns2.Vector3(Math.sin(degToRad3), 0, -Math.cos(degToRad3));
}

export function getCameraFocalLength(runtime: StudioAppRuntime, ) {
  return clamp2(finite2(runtime.cameraSettings()?.cameraFocalLength, 50), 18, 120);
}

export function collectActiveLightEntries(runtime: StudioAppRuntime, ) {
  return runtime.collectLampEntries()
    .filter(
      ({ item: lightItem, group: lightGroupDefinition }: any) =>
        lightGroupDefinition?.enabled !== false && finite2(lightItem.lightBrightness, 0) > 0,
    )
    .map(({ item: lightItemRef }: any) => lightItemRef);
}

export function assessRenderBudget(runtime: StudioAppRuntime, ) {
  const bf2 = runtime.collectActiveLightEntries(),
    rendererCanvas = runtime.appCtx.threeRenderer?.domElement,
    previewPixelCount =
      rendererCanvas?.width && rendererCanvas?.height
        ? rendererCanvas.width * rendererCanvas.height
        : Math.max(window.innerWidth * window.innerHeight * 0.32, 120000);
  return {
    count: bf2.length,
    cost: adaptiveLightRenderCost2(
      bf2.map((lightEntry: any) => ({
        type: lightEntry.type,
        angle: lightEntry.lightAngle,
        brightness: lightEntry.lightBrightness,
        enabled: true,
      })),
    ),
    budget: adaptiveDeviceLightBudget2({
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      previewPixels: previewPixelCount,
    }),
  };
}

export function canRenderScene(runtime: StudioAppRuntime, ) {
  if (runtime.isEmbeddedStage)
    return (
      (runtime.appCtx.isAdaptiveRenderActive = true),
      (runtime.appCtx.hasAdaptiveRenderStarted = true),
      {
        count: 0,
        cost: 0,
        budget: 0,
      }
    );
  const zl2 = runtime.assessRenderBudget(),
    Yn2 = runtime.appCtx.isAdaptiveRenderActive;
  return (
    runtime.appCtx.hasAdaptiveRenderStarted
      ? runtime.appCtx.isAdaptiveRenderActive &&
        zl2.cost < Math.min(zl2.budget * 0.68, Math.max(runtime.appCtx.adaptiveRenderCostBudget * 0.55, 1)) &&
        ((runtime.appCtx.isAdaptiveRenderActive = false),
        (runtime.appCtx.adaptiveRenderCostBudget = 0),
        (runtime.appCtx.slowFrameStreak = 0))
      : (runtime.appCtx.hasAdaptiveRenderStarted = true),
    Yn2 &&
      !runtime.appCtx.isAdaptiveRenderActive &&
      ((runtime.appCtx.modelRevisionCounter += 1),
      (runtime.appCtx.isCacheReady = false),
      (runtime.appCtx.isFrameDirty = false),
      runtime.setFadeOverlay(false)),
    zl2
  );
}

export function areLightsEnabled(runtime: StudioAppRuntime, ) {
  return runtime.isEmbedStageMode
    ? false
    : (runtime.canRenderScene(),
      runtime.appCtx.isAdaptiveRenderActive &&
        !runtime.appCtx.isEnvironmentActive &&
        !runtime.appCtx.isCurtainMoving &&
        !runtime.appCtx.isVacuumMoving &&
        !runtime.appCtx.isLockMoving &&
        !runtime.appCtx.isBackgroundMoving);
}

export function applyAdaptiveQuality(runtime: StudioAppRuntime, frameAssessment: any) {
  runtime.appCtx.isAdaptiveRenderActive ||
    !frameAssessment?.sufficient ||
    ((runtime.appCtx.isAdaptiveRenderActive = true),
    (runtime.appCtx.hasAdaptiveRenderStarted = true),
    (runtime.appCtx.adaptiveRenderCostBudget = runtime.assessRenderBudget().cost),
    (runtime.appCtx.modelRevisionCounter += 1),
    (runtime.appCtx.isFrameDirty = true),
    runtime.requestStudioRender());
}

export function resetFrameSamples(runtime: StudioAppRuntime, ) {
  if (runtime.appCtx.isAdaptiveRenderActive) return;
  const renderFrameAssessment = assessAdaptiveRenderFrames2(runtime.appCtx.frameDurationSamples);
  if (!renderFrameAssessment.sufficient) return;
  const zl3 = runtime.assessRenderBudget(),
    renderCostRatio = zl3.cost / Math.max(zl3.budget, 1),
    qualityStepLimit = renderCostRatio >= 1.8 ? 3 : renderCostRatio >= 1 ? 4 : 5;
  (renderFrameAssessment.severe
      ? (runtime.appCtx.slowFrameStreak = qualityStepLimit)
      : renderFrameAssessment.slow
        ? (runtime.appCtx.slowFrameStreak += 1)
        : renderFrameAssessment.smooth && (runtime.appCtx.slowFrameStreak = 0),
    runtime.appCtx.slowFrameStreak >= qualityStepLimit && runtime.applyAdaptiveQuality(renderFrameAssessment));
}

export function recordFrameTime(runtime: StudioAppRuntime, frameTimestamp = performance.now()) {
  if (
    (!runtime.appCtx.isRenderSuppressed && !(runtime.isEmbeddedStage && runtime.appCtx.isPrewarming)) ||
    runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isAdaptiveRenderActive ||
    !runtime.collectActiveLightEntries().length
  ) {
    runtime.appCtx.samplingWindowStartMs = 0;
    return;
  }
  if (runtime.appCtx.samplingWindowStartMs > 0) {
    const frameDeltaMs = frameTimestamp - runtime.appCtx.samplingWindowStartMs;
    frameDeltaMs >= 8 &&
      (frameDeltaMs <= 120 || (runtime.isEmbeddedStage && frameDeltaMs <= 2000)) &&
      runtime.appCtx.frameDurationSamples.push(Math.min(frameDeltaMs, 120));
  }
  ((runtime.appCtx.samplingWindowStartMs = frameTimestamp),
    !(runtime.appCtx.frameDurationSamples.length < 24) &&
      (runtime.resetFrameSamples(), runtime.appCtx.frameDurationSamples.splice(0, 12)));
}

export function getPreviewSyncMode(runtime: StudioAppRuntime, ) {
  return runtime.appCtx.studioState.settings?.livePreviewEnabled !== false;
}

export function refreshPreviewSync(runtime: StudioAppRuntime, ) {
  const kl2 = runtime.getPreviewSyncMode();
  for (const previewSyncButton of runtime.previewSyncControls) {
    const isPreviewSyncActive = previewSyncButton.dataset.previewSync === (kl2 ? "live" : "manual");
    (previewSyncButton.classList.toggle("active", isPreviewSyncActive),
      previewSyncButton.setAttribute("aria-pressed", String(isPreviewSyncActive)));
  }
  ((runtime.refreshPreviewButton.hidden = kl2),
    (runtime.refreshPreviewButton.disabled = !runtime.appCtx.isSceneDirty),
    runtime.refreshPreviewButton.classList.toggle("is-dirty", runtime.appCtx.isSceneDirty),
    (runtime.refreshPreviewButton.textContent = runtime.appCtx.isSceneDirty ? "待更新 · 更新" : "已更新"));
}

export function syncCameraModeControls(runtime: StudioAppRuntime, cameraMode = runtime.getCameraMode()) {
  for (const cameraModeButton of runtime.cameraModeControls)
    cameraModeButton.classList.toggle("active", cameraModeButton.dataset.cameraMode === cameraMode);
  runtime.syncCameraFocalLengthControl(cameraMode);
}

export function syncCameraViewControls(runtime: StudioAppRuntime, cameraView = runtime.getCameraView()) {
  for (const cameraViewButton of runtime.cameraViewControls) {
    const isCameraViewActive = cameraViewButton.dataset.cameraView === cameraView;
    (cameraViewButton.classList.toggle("active", isCameraViewActive),
      cameraViewButton.setAttribute("aria-pressed", String(isCameraViewActive)));
  }
  for (const cameraViewDependentButton of runtime.cameraRotateTopControls)
    cameraViewDependentButton.disabled = cameraView !== "top";
}

export function syncCameraFocalLengthControl(runtime: StudioAppRuntime, cameraModeName = runtime.getCameraMode()) {
  for (const focalLengthInput of runtime.cameraFocalLengthControls)
    (syncControlValue2(focalLengthInput, Math.round(runtime.getCameraFocalLength())),
      (focalLengthInput.disabled = cameraModeName !== "perspective"),
      focalLengthInput
        .closest(".camera-focal-control")
        ?.classList.toggle("is-disabled", focalLengthInput.disabled));
}

export function applyCameraFocalLength(runtime: StudioAppRuntime, 
  targetCamera = runtime.appCtx.threeCamera,
  focalLengthValue = runtime.getCameraFocalLength(),
) {
  targetCamera?.isPerspectiveCamera &&
    targetCamera.setFocalLength(clamp2(finite2(focalLengthValue, 50), 18, 120));
}

export function requestStudioRender(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.orbitControls) return;
  // 有新内容要画：静态帧缓存作废，下一次整帧重新捕获。
  runtime.effectCache?.invalidate();
  const ht2 = runtime.areLightsEnabled(),
    at6 = runtime.isEmbeddedStage && runtime.appCtx.prewarmState && !runtime.appCtx.isCapturingLights;
  (runtime.appCtx.lightPrecompileController?.setEnabled(runtime.isEmbeddedStage || !ht2 || !!at6),
    (runtime.appCtx.orbitControls.enableRotate = runtime.getCameraView() !== "top"),
    runtime.previewQualityStatusElement &&
      ((runtime.previewQualityStatusElement.hidden = true),
      (runtime.previewQualityStatusElement.title = ""),
      (runtime.previewQualityStatusElement.textContent = "")),
    runtime.refreshLightPreviewButton &&
      ((runtime.refreshLightPreviewButton.hidden = true), (runtime.refreshLightPreviewButton.disabled = true)));
}

export function computeRenderPixelRatio(runtime: StudioAppRuntime, isMotionQuality = false) {
  // 参数名历史遗留：true = 运动/交互中的质量档，false = 静置高清档。
  const dprCap = Math.min(window.devicePixelRatio || 1, 1.6);
  const idleRatio = dprCap * (runtime.isEmbeddedStage ? runtime.appCtx.basePixelRatio : 1);
  if (
    runtime.isEmbeddedStage &&
    isMotionQuality &&
    runtime.appCtx.adaptivePixelRatio !== null &&
    (!runtime.appCtx.isPrewarming || runtime.appCtx.isRenderSuppressed)
  )
    return Math.max(idleRatio * runtime.appCtx.adaptivePixelRatio, Math.min(idleRatio, 1));
  if (runtime.isEmbedStageMode) {
    return isMotionQuality
      ? Math.min(idleRatio, interactionResourcePolicy.motion.maxPixelRatio)
      : idleRatio;
  }
  const Kt2 = runtime.isEmbeddedStage && runtime.appCtx.isPrewarming;
  let ratio = idleRatio;
  // 运动期不再把 DPR 硬砍到 1；仅在超预算时温和下调，地板不低于 0.85×idle。
  if (runtime.isEmbeddedStage && (isMotionQuality || Kt2)) {
    const { cost: zl4, budget: zl5 } = runtime.assessRenderBudget();
    zl4 > zl5 &&
      (ratio = Math.min(ratio, clamp2(Math.sqrt(zl5 / zl4) * idleRatio, idleRatio * 0.85, idleRatio)));
  }
  return ratio;
}
