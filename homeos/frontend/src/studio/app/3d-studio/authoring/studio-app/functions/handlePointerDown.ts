





import {
  anchorGate as anchorGate2,
  remapCourtyardAttachments as remapCourtyardAttachments2,
} from "../../../plan/courtyard-drawing";


























import {
  axisLockedPoint as axisLockedPoint2,
  clampWindowT as clampWindowT2,
  closedWallPolygons as closedWallPolygons2,
  distance as distance2,
  nearestWall as nearestWall2,
  uncoveredCollinearWallSegments as uncoveredCollinearWallSegments2,
} from "../../../plan/geometry";














import { itemTypeCatalog } from "../../items/item-catalog";




import {
  generateId,
} from '../../ui/studio-app-helpers';


import { doorTypeCatalog } from "../../scene/studio-scene-payload";









import type { StudioAppContext } from "../studio-app-context";
export interface HandlePointerDownDeps { activeDoorType: keyof typeof doorTypeCatalog; appCtx: StudioAppContext; applyPlacementChange: any; axisLockedDistance: any; captureUndoSnapshot: any; createSceneItem: any; createSelectionRef: any; deselectAll: any; endStudioGesture: any; ensureCalibrationReady: any; eventToLocalPoint: any; finishWallButton: any; gardenGateItemType: any; getCurrentPreviewScope: any; getPixelsPerMeter: any; getPreviewScopeSelection: any; hitTestHandle: any; hitTestPlanItem: any; isSameAlignmentFloor: any; markDocumentDirty: any; markWallsChanged: any; planCanvasElement: any; pushUndoEntry: any; referenceMetersInput: any; referencePixelsElement: any; refreshPreviewScene: any; refreshScopeItems: any; refreshSelection: any; refreshStudioUi: any; refreshStudioView: any; resetPlanInteraction: any; scaleDialogElement: any; screenToPlan: any; screenToPlanPoint: any; selectSceneObject: any; setPreviewScope: any; showToast: any; updateMarqueeOverlay: any; validateSelectionChange: any; }

export function handlePointerDown(deps: HandlePointerDownDeps, handlePointerDownPointerDownEvent: any) {
  const { activeDoorType, appCtx, applyPlacementChange, axisLockedDistance, captureUndoSnapshot, createSceneItem, createSelectionRef, deselectAll, endStudioGesture, ensureCalibrationReady, eventToLocalPoint, finishWallButton, gardenGateItemType, getCurrentPreviewScope, getPixelsPerMeter, getPreviewScopeSelection, hitTestHandle, hitTestPlanItem, isSameAlignmentFloor, markDocumentDirty, markWallsChanged, planCanvasElement, pushUndoEntry, referenceMetersInput, referencePixelsElement, refreshPreviewScene, refreshScopeItems, refreshSelection, refreshStudioUi, refreshStudioView, resetPlanInteraction, scaleDialogElement, screenToPlan, screenToPlanPoint, selectSceneObject, setPreviewScope, showToast, updateMarqueeOverlay, validateSelectionChange } = deps;

  if (
    handlePointerDownPointerDownEvent.button !== 0 &&
    handlePointerDownPointerDownEvent.button !== 1
  )
    return;
  planCanvasElement.focus({
    preventScroll: true,
  });
  const pointerDownPoint = eventToLocalPoint(handlePointerDownPointerDownEvent),
    pr3 = screenToPlan(pointerDownPoint);
  if (
    handlePointerDownPointerDownEvent.button === 1 ||
    appCtx.isMiddleButtonPanning ||
    appCtx.activeToolName === "pan"
  ) {
    (handlePointerDownPointerDownEvent.preventDefault(),
      resetPlanInteraction(),
      (appCtx.marqueeBox = {
        type: "pan",
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        screen: screenToPlanPoint(pointerDownPoint),
        visibleScreen: pointerDownPoint,
        offsetX: appCtx.planView.offsetX,
        offsetY: appCtx.planView.offsetY,
      }),
      planCanvasElement.classList.add("panning"),
      updateMarqueeOverlay(),
      planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId));
    return;
  }
  if (appCtx.alignmentState && isSameAlignmentFloor(pr3)) return;
  if (appCtx.activeToolName === "flooropening") {
    if (!ensureCalibrationReady()) return;
    (handlePointerDownPointerDownEvent.preventDefault(),
      resetPlanInteraction(),
      (appCtx.marqueeBox = {
        type: "draw-flooropening",
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        start: pr3,
        current: pr3,
      }),
      planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId));
    return;
  }
  if (appCtx.activeToolName === "scale") {
    if (!appCtx.previewEndPoint) {
      ((appCtx.previewEndPoint = pr3), refreshStudioView());
      return;
    }
    const point = handlePointerDownPointerDownEvent.shiftKey
      ? axisLockedPoint2(pr3, appCtx.previewEndPoint).point
      : pr3;
    if (distance2(appCtx.previewEndPoint, point) < 12 / appCtx.planView.zoom) {
      showToast("参考线太短，请重新选择终点。", "error");
      return;
    }
    ((appCtx.measureSpan = {
      start: appCtx.previewEndPoint,
      end: point,
    }),
      (appCtx.previewEndPoint = null),
      (referencePixelsElement.textContent =
        Math.round(distance2(appCtx.measureSpan.start, appCtx.measureSpan.end)) + " px"),
      (referenceMetersInput.value = appCtx.studioState.calibration?.reference?.meters || 3),
      scaleDialogElement.showModal(),
      requestAnimationFrame(() => referenceMetersInput.select()),
      refreshStudioView());
    return;
  }
  if (appCtx.activeToolName === "wall") {
    if (!ensureCalibrationReady()) return;
    const ju2 = axisLockedDistance(
      pr3,
      appCtx.segmentStartPoint,
      handlePointerDownPointerDownEvent.shiftKey,
    );
    if (!appCtx.segmentStartPoint) {
      ((appCtx.segmentStartPoint = {
        ...ju2.point,
      }),
        (appCtx.snapEndpointPoint = {
          ...ju2.point,
        }),
        (appCtx.wallSegmentCount = 0),
        (finishWallButton.hidden = false),
        refreshStudioView());
      return;
    }
    if (distance2(appCtx.segmentStartPoint, ju2.point) < getPixelsPerMeter() * 0.08) {
      showToast("墙段太短，请选择更远的终点。", "error");
      return;
    }
    const wallDraft = {
        id: generateId("wall"),
        start: {
          ...appCtx.segmentStartPoint,
        },
        end: {
          ...ju2.point,
        },
        height: appCtx.studioState.settings.wallHeight,
        thickness: appCtx.studioState.settings.wallThickness,
      },
      minWallLength = Math.max(0.75, getPixelsPerMeter() * 0.01),
      uncoveredWallSegments = uncoveredCollinearWallSegments2(
        wallDraft,
        appCtx.studioState.walls,
        minWallLength,
      );
    if (!uncoveredWallSegments.length) {
      ((appCtx.segmentStartPoint = {
        ...ju2.point,
      }),
        showToast("该位置已有墙体，已跳过重复墙段。"),
        refreshStudioView());
      return;
    }
    const isWallSplitAmbiguous =
      uncoveredWallSegments.length !== 1 ||
      distance2(uncoveredWallSegments[0].start, wallDraft.start) > minWallLength ||
      distance2(uncoveredWallSegments[0].end, wallDraft.end) > minWallLength;
    deselectAll();
    const wallMergeTolerance = Math.max(1, getPixelsPerMeter() * 0.01),
      closedWallCount = closedWallPolygons2(appCtx.studioState.walls, wallMergeTolerance).length,
      splitWallSegments = uncoveredWallSegments.map((wallSegmentPiece, wallSegmentIndex) => ({
        ...wallDraft,
        id: wallSegmentIndex === 0 ? wallDraft.id : generateId("wall"),
        start: wallSegmentPiece.start,
        end: wallSegmentPiece.end,
      }));
    (appCtx.studioState.walls.push(...splitWallSegments), markWallsChanged(), (appCtx.wallSegmentCount += 1));
    const hasWallPolygonGrown =
      closedWallPolygons2(appCtx.studioState.walls, wallMergeTolerance).length > closedWallCount;
    (hasWallPolygonGrown
      ? refreshPreviewScene()
      : (appCtx.segmentStartPoint = {
          ...ju2.point,
        }),
      selectSceneObject("wall", splitWallSegments[0].id),
      (finishWallButton.hidden = hasWallPolygonGrown),
      refreshScopeItems(),
      markDocumentDirty(),
      hasWallPolygonGrown
        ? showToast("空间已闭合，地面已生成。可继续绘制下一个空间。", "success")
        : isWallSplitAmbiguous && showToast("已跳过与现有墙体重合的部分。", "success"));
    return;
  }
  if (appCtx.activeToolName === "courtyard-gate") {
    if (!ensureCalibrationReady()) return;
    const placedElementRecord = {
      ...(itemTypeCatalog as any)[gardenGateItemType],
      type: gardenGateItemType,
      ...pr3,
    };
    if (
      !anchorGate2(placedElementRecord, appCtx.studioState.items, getPixelsPerMeter(), 24 / appCtx.planView.zoom)
    ) {
      showToast("请靠近一段足够宽的围挡放置庭院门。", "error");
      return;
    }
    createSceneItem(gardenGateItemType, placedElementRecord);
    return;
  }
  if (appCtx.activeToolName === "window") {
    if (!ensureCalibrationReady()) return;
    const nearestWindowWall = nearestWall2(pr3, appCtx.studioState.walls, 18 / appCtx.planView.zoom);
    if (!nearestWindowWall) {
      showToast("请靠近一段墙体放置窗户。", "error");
      return;
    }
    const ft5 = captureUndoSnapshot(),
      newWindowRecord = {
        id: generateId("window"),
        wallId: nearestWindowWall.wall.id,
        t: nearestWindowWall.t,
        width: 1.4,
        height: 1.35,
        sill: 0.85,
      };
    if (
      ((newWindowRecord.t = clampWindowT2(
        nearestWindowWall.wall,
        newWindowRecord,
        getPixelsPerMeter(),
      )),
      appCtx.studioState.windows.push(newWindowRecord),
      !validateSelectionChange(ft5))
    )
      return;
    applyPlacementChange(ft5);
    const ao2 = getPreviewScopeSelection();
    (selectSceneObject("window", newWindowRecord.id),
      refreshScopeItems("architecture"),
      setPreviewScope(ao2),
      markDocumentDirty());
    return;
  }
  if (appCtx.activeToolName === "door") {
    if (!ensureCalibrationReady()) return;
    const nearestDoorWall = nearestWall2(pr3, appCtx.studioState.walls, 18 / appCtx.planView.zoom);
    if (!nearestDoorWall) {
      showToast("请靠近一段墙体放置门。", "error");
      return;
    }
    const ft6 = captureUndoSnapshot(),
      solid3 = doorTypeCatalog[activeDoorType] || doorTypeCatalog.solid,
      newDoorRecord = {
        id: generateId("door"),
        wallId: nearestDoorWall.wall.id,
        t: nearestDoorWall.t,
        width: solid3.width,
        height: solid3.height,
        sill: 0,
        doorType: activeDoorType,
        hinge: "left",
        swing: 1,
      };
    if (
      ((newDoorRecord.t = clampWindowT2(nearestDoorWall.wall, newDoorRecord, getPixelsPerMeter())),
      appCtx.studioState.doors.push(newDoorRecord),
      !validateSelectionChange(ft6))
    )
      return;
    applyPlacementChange(ft6);
    const ao3 = getPreviewScopeSelection();
    (selectSceneObject("door", newDoorRecord.id),
      refreshScopeItems("architecture"),
      setPreviewScope(ao3),
      markDocumentDirty());
    return;
  }
  if (appCtx.activeToolName === "railing") {
    if (!ensureCalibrationReady()) return;
    const nearestRailingWall = nearestWall2(pr3, appCtx.studioState.walls, 18 / appCtx.planView.zoom);
    if (!nearestRailingWall) {
      showToast("请靠近一段墙体放置栏杆。", "error");
      return;
    }
    const ft7 = captureUndoSnapshot(),
      newRailingRecord = {
        id: generateId("railing"),
        wallId: nearestRailingWall.wall.id,
        t: nearestRailingWall.t,
        width: 2,
        height: 1.1,
        sill: 0,
      };
    if (
      ((newRailingRecord.t = clampWindowT2(
        nearestRailingWall.wall,
        newRailingRecord,
        getPixelsPerMeter(),
      )),
      appCtx.studioState.railings.push(newRailingRecord),
      !validateSelectionChange(ft7))
    )
      return;
    applyPlacementChange(ft7);
    const ao4 = getPreviewScopeSelection();
    (selectSceneObject("railing", newRailingRecord.id),
      refreshScopeItems("architecture"),
      setPreviewScope(ao4),
      markDocumentDirty());
    return;
  }
  if (appCtx.activeToolName === "label") {
    createSceneItem("planlabel", pr3);
    return;
  }
  const df3 = hitTestHandle(pr3);
  if (df3) {
    resetPlanInteraction();
    const newItemRecord = {
      ...df3.item,
    };
    ((appCtx.marqueeBox =
      df3.type === "resize-item"
        ? {
            type: "resize-item",
            pointerId: handlePointerDownPointerDownEvent.pointerId,
            originalItem: newItemRecord,
            handle: {
              x: df3.corner!.x,
              y: df3.corner!.y,
            },
            anchor: {
              ...df3.corner!.opposite,
            },
            before: captureUndoSnapshot(),
            moved: false,
          }
        : {
            type: "rotate-item",
            pointerId: handlePointerDownPointerDownEvent.pointerId,
            originalItem: newItemRecord,
            center: {
              x: newItemRecord.x,
              y: newItemRecord.y,
            },
            startPointer: {
              ...pr3,
            },
            before: captureUndoSnapshot(),
            moved: false,
          }),
      planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId));
    return;
  }
  const ao5 = getPreviewScopeSelection(),
    fy2 = hitTestPlanItem(pr3);
  if (!fy2) {
    (resetPlanInteraction(),
      handlePointerDownPointerDownEvent.shiftKey || refreshSelection(),
      (appCtx.marqueeBox = {
        type: "marquee",
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        start: pr3,
        current: pr3,
        additive: handlePointerDownPointerDownEvent.shiftKey,
        moved: false,
      }),
      refreshStudioUi(),
      refreshStudioView(),
      updateMarqueeOverlay(),
      handlePointerDownPointerDownEvent.shiftKey || setPreviewScope(ao5),
      planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId));
    return;
  }
  resetPlanInteraction();
  const ft8 = fy2.kind === "item" ? captureUndoSnapshot() : null,
    ne9 = fy2.kind === "item" && appCtx.selectedItems.length > 0 && createSelectionRef("item", fy2.id);
  let placedItems: any = [],
    shouldRebuildItems = false;
  if (fy2.kind === "item") {
    if (ne9) {
      const existingItemIdSet = new Set(
        appCtx.selectedItems
          .filter((itemHistoryEntry: any) => itemHistoryEntry.kind === "item")
          .map((itemIdEntry: any) => itemIdEntry.id),
      );
      placedItems = appCtx.studioState.items.filter((historyItem) =>
        existingItemIdSet.has(historyItem.id),
      );
    } else {
      selectSceneObject("item", fy2.id);
      const foundPlacementItem = appCtx.studioState.items.find(
        (matchingItem) => matchingItem.id === fy2.id,
      );
      foundPlacementItem && (placedItems = [foundPlacementItem]);
    }
    if (handlePointerDownPointerDownEvent.altKey && placedItems.length) {
      const clonedItems = placedItems.map((clonedItemSource: any) => ({
        ...structuredClone(clonedItemSource),
        id: generateId("item"),
      }));
      (remapCourtyardAttachments2(placedItems, clonedItems),
        pushUndoEntry(clonedItems),
        appCtx.studioState.items.push(...clonedItems),
        (placedItems = clonedItems),
        clonedItems.length === 1
          ? selectSceneObject("item", clonedItems[0].id)
          : ((appCtx.selectedItem = null),
            (appCtx.selectedItems = clonedItems.map((publishedItem: any) => ({
              kind: "item",
              id: publishedItem.id,
            })))),
        (shouldRebuildItems = true));
    }
  } else selectSceneObject(fy2.kind, fy2.id);
  (refreshStudioUi(), refreshStudioView(), setPreviewScope(ao5));
  const qa4 = getCurrentPreviewScope();
  (fy2.kind === "item"
    ? (appCtx.marqueeBox = {
        type: "move-items",
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        start: pr3,
        originals: placedItems.map((originalItemEntry: any) => ({
          id: originalItemEntry.id,
          x: originalItemEntry.x,
          y: originalItemEntry.y,
        })),
        before: ft8,
        copied: shouldRebuildItems,
        previewScope: qa4,
        moved: false,
      })
    : ["window", "door", "railing"].includes(fy2.kind) &&
      (appCtx.marqueeBox = {
        type: "move-opening",
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        start: pr3,
        before: captureUndoSnapshot(),
        previewScope: "architecture",
        moved: false,
      }),
    appCtx.marqueeBox
      ? planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId)
      : endStudioGesture());

}
