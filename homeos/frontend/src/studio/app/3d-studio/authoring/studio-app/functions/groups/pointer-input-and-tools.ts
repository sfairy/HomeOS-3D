import type { StudioAppRuntime } from "../../runtime/studio-app-runtime";
import { courtyardToolAllowed as courtyardToolAllowed2 } from "../../../../plan/courtyard-plan";
import { restorePlacementScene as restorePlacementScene2 } from "../../../items/studio-placement";
import { anchorGate as anchorGate2, isCourtyardGate as isCourtyardGate2 } from "../../../../plan/courtyard-drawing";
import { axisLockedPoint as axisLockedPoint2, clamp as clamp2, clampWindowT as clampWindowT2, nearestWall as nearestWall2 } from "../../../../plan/geometry";
import { syncControlValue as syncControlValue2 } from "../../../ui/ui-controls";
import { DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2, finite as finite2, normalizeBaseLighting as normalizeBaseLighting2 } from "../../../../loaders/studio-normalization";
import { itemTypeCatalog, lampItemTypeSet } from "../../../items/item-catalog";
import { libraryCardVisible, normalizeLibraryCategory } from "../../../items/studio-model-library";
import { patchStudioFacadeState } from "../../../../../../engine";
import type { StudioControlElement } from "../../../types/studio-app-types";
import { normalizeLightPropertyValue, formatLightPropertyValue } from "../../../lights/studio-app-light-data";
import { doorTypeCatalog } from "../../../scene/studio-scene-payload";

export function updateSnapIndicator(runtime: StudioAppRuntime, snapWallTarget = runtime.appCtx.isForceSnapDisabled) {
  if (!runtime.appCtx.activeSnapTarget) return;
  runtime.appCtx.hoverPoint = {
    ...runtime.appCtx.activeSnapTarget,
  };
  const snapPpm = runtime.getPixelsPerMeter() || 100,
    snapStatusLabel = runtime.appCtx.isSnapTemporarilyOff ? "吸附：临时关闭" : "吸附：关闭";
  if (runtime.appCtx.activeToolName === "scale" && runtime.appCtx.previewEndPoint && snapWallTarget) {
    const snapGuidePoint = axisLockedPoint2(runtime.appCtx.activeSnapTarget, runtime.appCtx.previewEndPoint);
    ((runtime.appCtx.hoverPoint = snapGuidePoint.point),
      (runtime.appCtx.snapHit = null),
      (runtime.snapIndicatorElement.textContent = "吸附：" + snapGuidePoint.label));
  } else
    runtime.appCtx.activeToolName === "scale" &&
      ((runtime.appCtx.snapHit = null), (runtime.snapIndicatorElement.textContent = "吸附：自由"));
  if (
    ((runtime.cursorPositionElement.textContent =
      "X " +
      (runtime.appCtx.hoverPoint.x / snapPpm).toFixed(2) +
      " m · Y " +
      (runtime.appCtx.hoverPoint.y / snapPpm).toFixed(2) +
      " m"),
    runtime.appCtx.activeToolName === "wall")
  )
    ((runtime.appCtx.snapHit = runtime.axisLockedDistance(runtime.appCtx.activeSnapTarget, runtime.appCtx.segmentStartPoint, snapWallTarget)),
      (runtime.snapIndicatorElement.textContent = runtime.formatMeasurement(runtime.appCtx.snapHit)
        ? "闭合：点击闭合空间"
        : runtime.appCtx.snapHit.kind
          ? (!runtime.isSnapEnabled() && snapWallTarget ? "锁定" : "吸附") + "：" + runtime.appCtx.snapHit.label
          : runtime.isSnapEnabled()
            ? "吸附：自由"
            : snapStatusLabel));
  else {
    if (runtime.appCtx.activeToolName === "courtyard-gate")
      ((runtime.gardenGateSnapCandidate = {
        ...(itemTypeCatalog as any)[runtime.gardenGateItemType],
        type: runtime.gardenGateItemType,
        ...runtime.appCtx.hoverPoint,
        rotation: 0,
      }),
        anchorGate2(runtime.gardenGateSnapCandidate, runtime.appCtx.studioState.items, snapPpm, 24 / runtime.appCtx.planView.zoom) ||
          (runtime.gardenGateSnapCandidate = null),
        (runtime.snapIndicatorElement.textContent = runtime.gardenGateSnapCandidate
          ? "吸附：围挡门洞"
          : "吸附：请靠近足够宽的围挡"));
    else {
      if (["window", "door", "railing"].includes(runtime.appCtx.activeToolName)) {
        const nearestSnapWall = nearestWall2(runtime.appCtx.hoverPoint, runtime.appCtx.studioState.walls, 16 / runtime.appCtx.planView.zoom);
        if (nearestSnapWall) {
          const solid2 = doorTypeCatalog[runtime.activeDoorType] || doorTypeCatalog.solid,
            snapProbeOptions = {
              width:
                runtime.appCtx.activeToolName === "door" ? solid2.width : runtime.appCtx.activeToolName === "railing" ? 2 : 1.4,
              t: nearestSnapWall.t,
            },
            snapResolvedProbe = {
              wall: nearestSnapWall.wall,
              t: clampWindowT2(nearestSnapWall.wall, snapProbeOptions, snapPpm),
            };
          ((runtime.appCtx.windowPlacement = runtime.appCtx.activeToolName === "window" ? snapResolvedProbe : null),
            (runtime.appCtx.doorPlacement = runtime.appCtx.activeToolName === "door" ? snapResolvedProbe : null),
            (runtime.appCtx.railingPlacement = runtime.appCtx.activeToolName === "railing" ? snapResolvedProbe : null),
            (runtime.snapIndicatorElement.textContent =
              runtime.appCtx.activeToolName === "door"
                ? "吸附：墙体门洞"
                : runtime.appCtx.activeToolName === "railing"
                  ? "吸附：墙体栏杆"
                  : "吸附：墙体"));
        } else
          ((runtime.appCtx.windowPlacement = null),
            (runtime.appCtx.doorPlacement = null),
            (runtime.appCtx.railingPlacement = null),
            (runtime.snapIndicatorElement.textContent = "吸附：未找到墙体"));
      } else if (runtime.appCtx.activeToolName === "pan") {

        ((runtime.appCtx.snapHit = null),
          (runtime.appCtx.windowPlacement = null),
          (runtime.appCtx.doorPlacement = null),
          (runtime.appCtx.railingPlacement = null),
          (runtime.snapIndicatorElement.textContent = runtime.isSnapEnabled() ? "吸附：开启" : snapStatusLabel),
          (runtime.planCanvasElement.style.cursor = ""));
      } else {
        if (runtime.appCtx.activeToolName !== "scale") {
          ((runtime.appCtx.snapHit = null),
            (runtime.appCtx.windowPlacement = null),
            (runtime.appCtx.doorPlacement = null),
            (runtime.appCtx.railingPlacement = null),
            (runtime.snapIndicatorElement.textContent = runtime.isSnapEnabled() ? "吸附：开启" : snapStatusLabel));
          const df2 = runtime.hitTestHandle(runtime.appCtx.hoverPoint);
          runtime.planCanvasElement.style.cursor =
            df2?.type === "rotate-item" ? "grab" : df2?.type === "resize-item" ? "nwse-resize" : "";
        }
      }
    }
  }
}

export function toggleSnapSetting(runtime: StudioAppRuntime, snapToggleEvent: any) {
  ((runtime.appCtx.isForceSnapDisabled = snapToggleEvent.shiftKey),
    (runtime.appCtx.activeSnapTarget = runtime.screenToPlan(runtime.eventToLocalPoint(snapToggleEvent))),
    runtime.updateSnapIndicator());
}

export function schedulePointerMove(runtime: StudioAppRuntime, ) {
  runtime.appCtx.pointerFrameId = 0;
  const Hi2 = runtime.appCtx.activePointerState;
  ((runtime.appCtx.activePointerState = null), Hi2 && runtime.handlePointerUp(Hi2));
}

export function handlePointerMove(runtime: StudioAppRuntime, pointerMoveEvent: any) {
  ((runtime.appCtx.activePointerState = {
    clientX: pointerMoveEvent.clientX,
    clientY: pointerMoveEvent.clientY,
    pointerId: pointerMoveEvent.pointerId,
    shiftKey: pointerMoveEvent.shiftKey,
  }),
    runtime.appCtx.pointerFrameId || (runtime.appCtx.pointerFrameId = requestAnimationFrame(runtime.schedulePointerMove)));
}

export function cancelPointerDrag(runtime: StudioAppRuntime, cancelPointerDragActivePointerId: any) {
  !runtime.appCtx.activePointerState ||
    runtime.appCtx.activePointerState.pointerId !== cancelPointerDragActivePointerId ||
    (runtime.appCtx.pointerFrameId && cancelAnimationFrame(runtime.appCtx.pointerFrameId), runtime.schedulePointerMove());
}

export function scheduleDragUpdate(runtime: StudioAppRuntime, ) {
  runtime.appCtx.renderLoopFrameId = 0;
  const Gd2 = runtime.appCtx.pinchStartDistance,
    Wd2 = runtime.appCtx.pinchStartCenter;
  ((runtime.appCtx.pinchStartDistance = 1),
    (runtime.appCtx.pinchStartCenter = null),
    Wd2 && Math.abs(Gd2 - 1) > 1e-8 && runtime.zoomByScale(Gd2, Wd2));
}

export function handleCanvasWheel(runtime: StudioAppRuntime, wheelEvent: any) {
  ((runtime.appCtx.pinchStartDistance *= Math.exp(-wheelEvent.deltaY * 0.0012)),
    (runtime.appCtx.pinchStartCenter = runtime.eventToLocalPoint(wheelEvent)),
    runtime.resetPlanInteraction(),
    runtime.appCtx.renderLoopFrameId || (runtime.appCtx.renderLoopFrameId = requestAnimationFrame(runtime.scheduleDragUpdate)),
    window.clearTimeout(runtime.appCtx.renderLoopTimeoutId),
    (runtime.appCtx.renderLoopTimeoutId = window.setTimeout(() => {
      ((runtime.appCtx.renderLoopTimeoutId = null),
        runtime.appCtx.renderLoopFrameId && (cancelAnimationFrame(runtime.appCtx.renderLoopFrameId), runtime.scheduleDragUpdate()),
        runtime.endStudioGesture());
    }, 90)));
}

export function finishPointerDrag(runtime: StudioAppRuntime, pointerCancelEvent: any) {
  if (!runtime.appCtx.marqueeBox || runtime.appCtx.marqueeBox.pointerId !== pointerCancelEvent.pointerId) return;
  if (runtime.appCtx.marqueeBox.type === "draw-flooropening") {
    const { start: finishPointerDragDragStart, current: dragCurrent } = runtime.appCtx.marqueeBox;
    try {
      runtime.planCanvasElement.releasePointerCapture(pointerCancelEvent.pointerId);
    } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
    ((runtime.appCtx.marqueeBox = null), runtime.endStudioGesture());
    const dragDeltaXMeters =
        Math.abs(dragCurrent.x - finishPointerDragDragStart.x) / runtime.getPixelsPerMeter(),
      dragDeltaYMeters =
        Math.abs(dragCurrent.y - finishPointerDragDragStart.y) / runtime.getPixelsPerMeter();
    pointerCancelEvent.type !== "pointercancel" &&
    dragDeltaXMeters >= 0.1 &&
    dragDeltaYMeters >= 0.1
      ? runtime.createSceneItem(
          "flooropening",
          {
            x: (finishPointerDragDragStart.x + dragCurrent.x) / 2,
            y: (finishPointerDragDragStart.y + dragCurrent.y) / 2,
          },
          {
            width: Math.min(20, dragDeltaXMeters),
            depth: Math.min(20, dragDeltaYMeters),
          },
        )
      : runtime.refreshStudioView();
    return;
  }
  if (runtime.appCtx.marqueeBox.type === "marquee") {
    const ao6 = runtime.getPreviewScopeSelection(),
      dragAdditionEntries = runtime.appCtx.marqueeBox.additive
        ? [...(runtime.appCtx.selectedItem ? [runtime.appCtx.selectedItem] : []), ...runtime.appCtx.selectedItems]
        : [],
      dy3 = runtime.appCtx.marqueeBox.moved ? runtime.marqueeDelta(runtime.appCtx.marqueeBox.start, runtime.appCtx.marqueeBox.current) : [],
      dragMergedEntries = [
        ...new Map(
          [...dragAdditionEntries, ...dy3].map((dragEntry) => [
            dragEntry.kind + ":" + dragEntry.id,
            dragEntry,
          ]),
        ).values(),
      ];
    dragMergedEntries.length === 1
      ? runtime.selectSceneObject(dragMergedEntries[0].kind, dragMergedEntries[0].id)
      : ((runtime.appCtx.selectedItem = null), (runtime.appCtx.selectedItems = dragMergedEntries));
    try {
      runtime.planCanvasElement.releasePointerCapture(pointerCancelEvent.pointerId);
    } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
    ((runtime.appCtx.marqueeBox = null),
      runtime.refreshStudioUi(),
      runtime.refreshStudioView(),
      runtime.setPreviewScope(ao6),
      runtime.endStudioGesture());
    return;
  }
  const activeDragGesture = runtime.appCtx.marqueeBox;
  let copied = activeDragGesture.moved || activeDragGesture.copied;
  if (copied && activeDragGesture.type === "move-items")
    for (const draggedOriginal of activeDragGesture.originals) {
      const draggedItemRecord = runtime.appCtx.studioState.items.find(
        (draggedItem) => draggedItem.id === draggedOriginal.id,
      );
      draggedItemRecord &&
        anchorGate2(draggedItemRecord, runtime.appCtx.studioState.items, runtime.getPixelsPerMeter(), 24 / runtime.appCtx.planView.zoom);
    }
  if (
    copied &&
    pointerCancelEvent.type !== "pointercancel" &&
    activeDragGesture.type === "move-items"
  ) {
    const draggedOriginalIds = activeDragGesture.originals.map(
      (draggedOriginalItem: any) => draggedOriginalItem.id,
    );
    if (draggedOriginalIds.length === 1) {
      const firstDraggedItemRecord = runtime.appCtx.studioState.items.find(
        (firstDraggedItem) => firstDraggedItem.id === draggedOriginalIds[0],
      );
      firstDraggedItemRecord && runtime.finalizeAddedItem(firstDraggedItemRecord, draggedOriginalIds);
    }
  }
  if (
    (activeDragGesture.before && pointerCancelEvent.type === "pointercancel"
      ? (restorePlacementScene2(runtime.appCtx.studioState, activeDragGesture.before),
        runtime.appCtx.selectedItem && !runtime.getSelectedObject() && runtime.refreshSelection(),
        (copied = false),
        runtime.refreshStudioView())
      : copied &&
        !runtime.validateSelectionChange(activeDragGesture.before) &&
        ((copied = false), runtime.refreshStudioView()),
    copied && (runtime.applyPlacementChange(runtime.appCtx.marqueeBox.before), runtime.markDocumentDirty()),
    ["move-items", "resize-item", "rotate-item", "move-opening"].includes(activeDragGesture.type) &&
      runtime.refreshStudioUi(),
    copied && activeDragGesture.type === "move-opening")
  )
    runtime.requestSceneRebuild({
      scope: "architecture",
    });
  else {
    if (copied && ["move-items", "resize-item", "rotate-item"].includes(activeDragGesture.type)) {
      const activePlacedElement = runtime.getSelectedObject();
      runtime.requestSceneRebuild({
        scope:
          activeDragGesture.previewScope ||
          (activePlacedElement
            ? runtime.resolvePreviewScope(activePlacedElement)
            : runtime.getCurrentPreviewScope()),
      });
    }
  }
  runtime.appCtx.marqueeBox.type === "pan" && runtime.planCanvasElement.classList.remove("panning");
  try {
    runtime.planCanvasElement.releasePointerCapture(pointerCancelEvent.pointerId);
  } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
  ((runtime.appCtx.marqueeBox = null),
    activeDragGesture.type === "pan" && runtime.refreshStudioView(),
    runtime.endStudioGesture());
}

export function handlePointerRelease(runtime: StudioAppRuntime, releasePointerId: any) {
  (runtime.cancelPointerDrag(releasePointerId.pointerId), runtime.finishPointerDrag(releasePointerId));
}

export function refreshPreviewScene(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.segmentStartPoint = null),
    (runtime.appCtx.snapEndpointPoint = null),
    (runtime.appCtx.wallSegmentCount = 0),
    (runtime.finishWallButton.hidden = true));
}

export function resetCameraView(runtime: StudioAppRuntime, ) {
  (runtime.refreshPreviewScene(), runtime.refreshStudioView());
}

export function applyWallHeightInput(runtime: StudioAppRuntime, wallHeightValue: any) {
  (runtime.appCtx.activePointerId && runtime.appCtx.activePointerId !== wallHeightValue && runtime.applyWallOpacityInput(),
    !runtime.appCtx.activePointerId &&
      (runtime.deselectAll(), (runtime.appCtx.activePointerId = wallHeightValue), runtime.resetPlanInteraction()));
}

export function applyWallThicknessInput(runtime: StudioAppRuntime, ) {
  runtime.appCtx.pointerMoveCount ||
    (runtime.appCtx.pointerMoveCount = requestAnimationFrame(() => {
      ((runtime.appCtx.pointerMoveCount = 0), runtime.refreshStudioView());
    }));
}

export function applyWallOpacityInput(runtime: StudioAppRuntime, ) {
  (window.clearTimeout(runtime.appCtx.pointerReleaseTimeoutId),
    (runtime.appCtx.pointerReleaseTimeoutId = null),
    runtime.appCtx.activePointerId &&
      ((runtime.appCtx.activePointerId = null),
      syncControlValue2(runtime.globalWallHeightInput, runtime.appCtx.studioState.settings.wallHeight.toFixed(2)),
      syncControlValue2(runtime.globalWallThicknessInput, runtime.appCtx.studioState.settings.wallThickness.toFixed(2)),
      syncControlValue2(runtime.globalWallOpacityInput, Math.round(runtime.appCtx.studioState.settings.wallOpacity * 100)),
      runtime.refreshStudioUi(),
      runtime.requestSceneRebuild({
        scope: "all",
      }),
      runtime.endStudioGesture()));
}

export function scheduleWallApply(runtime: StudioAppRuntime, wallApplyDelayMs = 80) {
  (window.clearTimeout(runtime.appCtx.pointerReleaseTimeoutId),
    (runtime.appCtx.pointerReleaseTimeoutId = window.setTimeout(runtime.applyWallOpacityInput, wallApplyDelayMs)));
}

export function commitWallHeight(runtime: StudioAppRuntime, ) {
  const committedWallHeight = clamp2(
    finite2(runtime.globalWallHeightInput.value, runtime.appCtx.studioState.settings.wallHeight),
    0.01,
    6,
  );
  if (!(
    Math.abs(committedWallHeight - runtime.appCtx.studioState.settings.wallHeight) < 1e-8 &&
    runtime.appCtx.studioState.walls.every(
      (checkedWallHeightTarget) =>
        Math.abs(checkedWallHeightTarget.height - committedWallHeight) < 1e-8,
    )
  )) {
    (runtime.applyWallHeightInput(runtime.globalWallHeightInput),
      (runtime.appCtx.studioState.settings.wallHeight = committedWallHeight));
    for (const heightUpdateWall of runtime.appCtx.studioState.walls) heightUpdateWall.height = committedWallHeight;
    runtime.markDocumentDirty();
  }
}

export function commitWallThickness(runtime: StudioAppRuntime, ) {
  const committedWallThickness = clamp2(
    finite2(runtime.globalWallThicknessInput.value, runtime.appCtx.studioState.settings.wallThickness),
    0.01,
    3,
  );
  if (!(
    Math.abs(committedWallThickness - runtime.appCtx.studioState.settings.wallThickness) < 1e-8 &&
    runtime.appCtx.studioState.walls.every(
      (checkedWallThicknessTarget) =>
        Math.abs(checkedWallThicknessTarget.thickness - committedWallThickness) < 1e-8,
    )
  )) {
    (runtime.applyWallHeightInput(runtime.globalWallThicknessInput),
      (runtime.appCtx.studioState.settings.wallThickness = committedWallThickness));
    for (const thicknessUpdateWall of runtime.appCtx.studioState.walls)
      thicknessUpdateWall.thickness = committedWallThickness;
    (runtime.applyWallThicknessInput(), runtime.markDocumentDirty());
  }
}

export function commitWallOpacity(runtime: StudioAppRuntime, ) {
  const committedWallOpacity =
    clamp2(finite2(runtime.globalWallOpacityInput.value, runtime.appCtx.studioState.settings.wallOpacity * 100), 0, 100) /
    100;
  Math.abs(committedWallOpacity - runtime.appCtx.studioState.settings.wallOpacity) < 1e-8 ||
    (runtime.applyWallHeightInput(runtime.globalWallOpacityInput),
    (runtime.appCtx.studioState.settings.wallOpacity = committedWallOpacity),
    runtime.markDocumentDirty());
}

/** 一个分组标题辖下的模型卡：从标题往后数，直到下一个分组标题为止。 */
function assetGroupCards(assetGroupHeading: StudioControlElement): StudioControlElement[] {
  const groupCards: StudioControlElement[] = [];
  for (
    let nextElementSibling = assetGroupHeading.nextElementSibling as StudioControlElement | null;
    nextElementSibling && !nextElementSibling.hasAttribute("data-asset-heading-category");
    nextElementSibling = nextElementSibling.nextElementSibling as StudioControlElement | null
  )
    nextElementSibling.hasAttribute("data-item-type") && groupCards.push(nextElementSibling);
  return groupCards;
}

/**
 * 分组展开态只记在标题的 `data-asset-expanded` 上：DOM 即唯一状态源，
 * 不额外开运行时字段。初始标记里没有这个属性，因此默认全部收起。
 */
function resetAssetGroupExpansion(runtime: StudioAppRuntime) {
  for (const assetGroupHeading of runtime.assetHeadingCategoryControls)
    assetGroupHeading.dataset.assetExpanded = "false";
}

export function filterAssetList(runtime: StudioAppRuntime, ) {
  const librarySearchText = (runtime.assetSearchInput?.value || "").trim().toLocaleLowerCase().replace(/\s+/g, ""),
    activeLibraryCategory = normalizeLibraryCategory(runtime.appCtx.activeLibraryCategory),
    isLibrarySearching = librarySearchText.length > 0;
  runtime.libraryNameScroll.cancelAll();
  let assetMatchCount = 0;
  for (const assetToolbarEntryButton of runtime.itemTypeButtons) {
    // 「灯光」大类单独一行（`#light-asset-row`），卡片上不带 `data-library-*`，只能按类型集合判；
    // 其余三个大类（home / appliance / courtyard）一律交给模型库的 DOM 判定，避免两处各写一套。
    const itemType = assetToolbarEntryButton.dataset.itemType,
      isAssetCardVisible =
        activeLibraryCategory === "light"
          ? lampItemTypeSet.has(itemType!)
          : libraryCardVisible(
              assetToolbarEntryButton,
              activeLibraryCategory,
              null,
              librarySearchText,
            ) &&
            // 庭院门是画在平面上的构件，不进模型卡列表。
            (activeLibraryCategory !== "courtyard" || !isCourtyardGate2({ type: itemType }));
    // 命中态另记一份：`hidden` 还会被分组收叠改写，分组计数只能看分类 / 搜索命中。
    assetToolbarEntryButton.dataset.assetMatch = isAssetCardVisible ? "1" : "0";
    assetToolbarEntryButton.hidden = !isAssetCardVisible;
    isAssetCardVisible && (assetMatchCount += 1);
  }
  runtime.assetGridElement?.classList.toggle("asset-grid-searching", isLibrarySearching);
  for (const assetGroupHeading of runtime.assetHeadingCategoryControls) {
    const groupCards = assetGroupCards(assetGroupHeading),
      groupMatchCount = groupCards.filter((groupCard) => groupCard.dataset.assetMatch === "1").length,
      // 搜索是扁平结果视图：命中分组一律展开，否则结果会被收叠挡住；非搜索态才看手风琴标记。
      isGroupExpanded = isLibrarySearching || assetGroupHeading.dataset.assetExpanded === "true";
    (assetGroupHeading.dataset.assetCount = String(groupMatchCount)),
      assetGroupHeading.classList.toggle("is-collapsed", !isGroupExpanded),
      assetGroupHeading.setAttribute("aria-expanded", String(isGroupExpanded));
    assetGroupHeading.hidden =
      assetGroupHeading.dataset.assetHeadingCategory !== activeLibraryCategory || groupMatchCount === 0;
    if (!isGroupExpanded) for (const groupCard of groupCards) groupCard.hidden = true;
  }
  runtime.assetSearchEmptyElement && (runtime.assetSearchEmptyElement.hidden = !librarySearchText || assetMatchCount > 0);
}

/**
 * 手风琴收叠：点标题即切换该组，并把同大类其余分组一律收起，
 * 因此任意时刻最多只有一个分组展开；展开中的那组再点一次会收起（全部收起也允许）。
 */
export function toggleAssetGroup(runtime: StudioAppRuntime, assetGroupHeading: StudioControlElement) {
  // 搜索态分组强制展开，此时标题不参与收叠。
  if ((runtime.assetSearchInput?.value || "").trim()) return;
  const isExpanding = assetGroupHeading.dataset.assetExpanded !== "true";
  for (const otherAssetGroupHeading of runtime.assetHeadingCategoryControls)
    otherAssetGroupHeading.dataset.assetExpanded = String(
      isExpanding && otherAssetGroupHeading === assetGroupHeading,
    );
  runtime.filterAssetList();
}

export function setAssetCategory(runtime: StudioAppRuntime, assetCategory: any) {
  // 合法大类只在模型库里定义一次：非法值回落 `home`，卡片过滤与按钮态都用收窄后的值。
  const selectedAssetCategory = normalizeLibraryCategory(assetCategory),
    ao7 = runtime.getPreviewScopeSelection();
  (runtime.hideLightGroupActionMenu(), (runtime.appCtx.activeLibraryCategory = selectedAssetCategory));
  for (const assetCategoryButton of runtime.assetCategoryButtons) {
    const isActiveAssetCategory =
      assetCategoryButton.dataset.assetCategory === selectedAssetCategory;
    (assetCategoryButton.classList.toggle("active", isActiveAssetCategory),
      assetCategoryButton.setAttribute("aria-pressed", String(isActiveAssetCategory)));
  }
  // 切大类回到「全部收起」的初始态：不同大类的同名分区（如宠物用品）不会带着上一个大类的展开态。
  (resetAssetGroupExpansion(runtime), runtime.filterAssetList());
  for (const setAssetCategoryToolButton of runtime.toolButtons)
    setAssetCategoryToolButton.disabled =
      selectedAssetCategory === "courtyard" &&
      !courtyardToolAllowed2(setAssetCategoryToolButton.dataset.tool);
  for (const toolControlEntry of [
    "global-wall-height",
    "global-wall-thickness",
    "global-wall-opacity",
    "toggle-floor-edge",
  ]) {
    const elementById = document.getElementById(toolControlEntry) as StudioControlElement | null;
    elementById && (elementById.disabled = selectedAssetCategory === "courtyard");
  }
  ((runtime.assetGridElement.hidden = selectedAssetCategory === "light"),
    (runtime.lightAssetRowElement.hidden = selectedAssetCategory !== "light"));
  (runtime.appCtx.selectedItem && !runtime.isSelectionAllowed(runtime.appCtx.selectedItem) && runtime.refreshSelection(),
    runtime.appCtx.selectedItems.length && runtime.refreshSelection(),
    runtime.selectStudioTool("select"),
    runtime.syncLightGroupList(),
    runtime.refreshStudioUi(),
    runtime.refreshStudioView(),
    ao7 !== runtime.getPreviewScopeSelection() && runtime.setPreviewScope(ao7));
}

export function closeOpenPopovers(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.pendingFloorMenuId = ""), runtime.floorRenameDialogElement.close());
}

export function applyLightGroupRename(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.renamingLightGroupId = ""), runtime.lightGroupRenameDialogElement.close());
}

export function createLightGroup(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.pendingLightPropertyApply = null), runtime.lightPropertyApplyDialogElement.close());
}

export function collectLightTargetInputs(runtime: StudioAppRuntime, lightTargetRoot = runtime.lightPropertyTargetListElement) {
  return [...lightTargetRoot.querySelectorAll("[data-light-target-item-id]")];
}

export function syncLightTargetGroups(runtime: StudioAppRuntime, ) {
  const ys2 = runtime.collectLightTargetInputs(),
    checkedGroupToggleCount = ys2.filter(
      (lightGroupToggleInput: any) => lightGroupToggleInput.checked,
    ).length;
  ((runtime.lightPropertySelectionCountElement.textContent =
    checkedGroupToggleCount + "/" + ys2.length + " 灯"),
    (runtime.lightPropertyToggleAllButton.disabled = !ys2.length),
    (runtime.lightPropertyToggleAllButton.textContent =
      ys2.length && checkedGroupToggleCount === ys2.length ? "取消全选" : "全选"));
  for (const lightTargetGroupRow of runtime.lightPropertyTargetListElement.querySelectorAll(
    "[data-light-target-group-id]",
  )) {
    const ys3 = runtime.collectLightTargetInputs(lightTargetGroupRow),
      checkedTargetToggleCount = ys3.filter(
        (lightTargetToggleInput: any) => lightTargetToggleInput.checked,
      ).length;
    ((lightTargetGroupRow.querySelector("[data-light-target-group-count]").textContent =
      checkedTargetToggleCount + "/" + ys3.length + " 灯"),
      (lightTargetGroupRow.querySelector("[data-light-target-group-toggle]").textContent =
        ys3.length && checkedTargetToggleCount === ys3.length ? "取消全选" : "全选"));
  }
}

export function buildLightGroupList(runtime: StudioAppRuntime, listedLightGroup: any) {
  runtime.lightPropertyTargetListElement.replaceChildren();
  let lightGroupListIndex = 0;
  for (const listedGroup of runtime.appCtx.studioState.lightGroups) {
    const lightGroupItems = runtime.appCtx.studioState.items.filter(
      (lightGroupItem) =>
        lampItemTypeSet.has(lightGroupItem.type) && lightGroupItem.lightGroupId === listedGroup.id,
    );
    if (!lightGroupItems.length) continue;
    lightGroupListIndex += lightGroupItems.length;
    const lightGroupSection = document.createElement("section");
    ((lightGroupSection.className = "light-property-target-group"),
      (lightGroupSection.dataset.lightTargetGroupId = listedGroup.id));
    const lightGroupHeader = document.createElement("header"),
      lightGroupHeading = document.createElement("strong");
    lightGroupHeading.textContent = listedGroup.name;
    const lightGroupCountBadge = document.createElement("span");
    lightGroupCountBadge.dataset.lightTargetGroupCount = "";
    const lightTargetToggleButton = document.createElement("button");
    ((lightTargetToggleButton.type = "button"),
      (lightTargetToggleButton.dataset.lightTargetGroupToggle = ""),
      (lightTargetToggleButton.textContent = "取消全选"),
      lightGroupHeader.append(lightGroupHeading, lightGroupCountBadge, lightTargetToggleButton));
    const lightTargetListContainer = document.createElement("div");
    lightTargetListContainer.className = "light-property-target-grid";
    const lightItemCountsByType = new Map();
    for (const countedLightItem of lightGroupItems)
      lightItemCountsByType.set(
        countedLightItem.type,
        (lightItemCountsByType.get(countedLightItem.type) || 0) + 1,
      );
    const lightItemIndexByType = new Map();
    for (const indexedLightItem of lightGroupItems) {
      const downlight6 = (itemTypeCatalog as any)[indexedLightItem.type] || itemTypeCatalog.downlight,
        lightItemTypeIndex = (lightItemIndexByType.get(indexedLightItem.type) || 0) + 1;
      lightItemIndexByType.set(indexedLightItem.type, lightItemTypeIndex);
      const lightTargetLabel = document.createElement("label");
      lightTargetLabel.className = "light-property-target-item";
      const lightTargetCheckbox = document.createElement("input");
      ((lightTargetCheckbox.type = "checkbox"),
        (lightTargetCheckbox.checked = true),
        (lightTargetCheckbox.dataset.lightTargetItemId = indexedLightItem.id));
      const lightTargetNameLabel = document.createElement("span"),
        lightTargetItemTitle = document.createElement("strong");
      lightTargetItemTitle.textContent =
        lightItemCountsByType.get(indexedLightItem.type) > 1
          ? downlight6.name + " " + lightItemTypeIndex
          : downlight6.name;
      const lightTargetDetailNote = document.createElement("small"),
        kd3 = normalizeLightPropertyValue(
          listedLightGroup,
          indexedLightItem[listedLightGroup],
          indexedLightItem.type,
        );
      ((lightTargetDetailNote.textContent =
        (indexedLightItem.id === runtime.appCtx.selectedItem?.id ? "当前灯 · " : "") +
        "当前 " +
        formatLightPropertyValue(listedLightGroup, kd3)),
        lightTargetNameLabel.append(lightTargetItemTitle, lightTargetDetailNote),
        lightTargetLabel.append(lightTargetCheckbox, lightTargetNameLabel),
        lightTargetListContainer.append(lightTargetLabel));
    }
    (lightGroupSection.append(lightGroupHeader, lightTargetListContainer),
      runtime.lightPropertyTargetListElement.append(lightGroupSection));
  }
  if (!lightGroupListIndex) {
    const lightGroupEmptyMessage = document.createElement("p");
    ((lightGroupEmptyMessage.className = "light-property-target-empty"),
      (lightGroupEmptyMessage.textContent = "当前没有可应用的灯具。"),
      runtime.lightPropertyTargetListElement.append(lightGroupEmptyMessage));
  }
  runtime.syncLightTargetGroups();
}

export function postBridgeState(runtime: StudioAppRuntime, bridgeStateName = "ready") {
  !runtime.isAutoDiagramEmbed ||
    !runtime.autoDiagramComponentId ||
    window.parent === window ||
    !runtime.appCtx.studioProject ||
    window.parent.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-base-lighting-state",
        componentId: runtime.autoDiagramComponentId,
        status: bridgeStateName,
        lighting: normalizeBaseLighting2(runtime.appCtx.baseLightingSettings),
        savedLighting: normalizeBaseLighting2(runtime.appCtx.studioProject.baseLighting),
        defaults: normalizeBaseLighting2(DEFAULT_BASE_LIGHTING2),
      },
      window.location.origin,
    );
}

export function postBridgeFloors(runtime: StudioAppRuntime, ) {
  !runtime.isAutoDiagramEmbed ||
    !runtime.autoDiagramComponentId ||
    window.parent === window ||
    !runtime.appCtx.studioProject ||
    window.parent.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-floor-state",
        componentId: runtime.autoDiagramComponentId,
        floors: runtime.appCtx.studioProject.floors.map((bridgeFloorEntry: any) => ({
          id: bridgeFloorEntry.id,
          name: bridgeFloorEntry.name,
        })),
        floorSelection:
          runtime.getPreviewFloorMode() === "all" ? "all" : runtime.getActiveFloor()?.id || runtime.appCtx.activeFloorId,
      },
      window.location.origin,
    );
}

export async function waitForStageReady(runtime: StudioAppRuntime, ) {
  if (!runtime.areLightsEnabled()) return;
  runtime.scheduleStudioRender(0);
  const stageReadyDeadline = performance.now() + 1800;
  for (
    ;
    runtime.areLightsEnabled() &&
    (!runtime.appCtx.isCacheReady || runtime.appCtx.isFrameDirty || runtime.previewLightCacheCanvasElement.hidden) &&
    performance.now() < stageReadyDeadline;
  )
    await new Promise(requestAnimationFrame);
}

export function jumpWorkflowStep(runtime: StudioAppRuntime, step: string) {
    patchStudioFacadeState({ workflowStep: step });
    if (step === "background") {
      runtime.importPlanButton?.focus?.();
      runtime.importPlanButton?.click?.();
      return;
    }
    if (step === "scale") {
      runtime.selectStudioTool("scale");
      return;
    }
    if (step === "walls") {
      runtime.selectStudioTool("wall");
      return;
    }
    if (step === "items") {
      try {
        runtime.setAssetCategory?.("home");
      } catch { /* 可选注入钩子未提供或抛错：调用方继续后续流程 */ }
      runtime.selectStudioTool("select");
      return;
    }
    if (step === "lights") {
      try {
        runtime.setAssetCategory?.("light");
      } catch { /* 可选注入钩子未提供或抛错：调用方继续后续流程 */ }
      runtime.selectStudioTool("select");
      return;
    }
    if (step === "export") {
      runtime.openExportPanel();
    }
  }
