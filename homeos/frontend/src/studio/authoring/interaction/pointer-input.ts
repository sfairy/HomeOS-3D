import {
  anchorGate as anchorGate2,
  remapCourtyardAttachments as remapCourtyardAttachments2,
  isCourtyardGate as isCourtyardGate2,
} from '../plan/courtyard-drawing'
import {
  axisLockedPoint as axisLockedPoint2,
  clampWindowT as clampWindowT2,
  closedWallPolygons as closedWallPolygons2,
  distance as distance2,
  nearestWall as nearestWall2,
  uncoveredCollinearWallSegments as uncoveredCollinearWallSegments2,
  itemRotationFromPointers as itemRotationFromPointers2,
  planDragDelta as planDragDelta2,
  projectPointToSegment as projectPointToSegment2,
  resizeRotatedItemFromCorner as resizeRotatedItemFromCorner2,
  resizeRotatedItemFromEdge as resizeRotatedItemFromEdge2,
} from '../plan/geometry'
import { itemTypeCatalog } from '../items/item-catalog'
import { isPlacedItemLocked } from '../items/placed-item-state'
import { generateId } from '../ui/studio-app-helpers'
import { doorTypeCatalog } from '../scene/payload/studio-scene-payload'
import { handleFloorRegionPointer } from './tools'
import { patchStudioFacadeState } from '../../engine/studio-facade'
import { type StudioAppContext } from '../app-context'
import { fanDimensions as fanDimensions2 } from '../items/studio-fan'
import {
  normalizeCurtainTrack as normalizeCurtainTrack2,
  curtainFootprintDepth as curtainFootprintDepth2,
} from '@app/shared/scene/studio-curtain-track'
import {
  finite as finite2,
  itemMinimumHeight as itemMinimumHeight2,
  itemMinimumFootprint as itemMinimumFootprint2,
} from '../loaders/studio-normalization'
import {
  itemFromPlanFootprintResize as itemFromPlanFootprintResize2,
  itemWithPlanFootprint as itemWithPlanFootprint2,
} from '../items/studio-item-posture'
import { applyPlacementSnap, applyPointSnap, quantizePlanDelta } from './drag-and-drop'
import { type PlacementGuide } from '../plan/studio-placement'
import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { offerOverlapPickerFor } from '../ui/wiring'
import { restorePlacementScene as restorePlacementScene2 } from '../items/studio-placement'

export interface HandlePointerDownDeps {
  activeDoorType: keyof typeof doorTypeCatalog
  appCtx: StudioAppContext
  applyPlacementChange: any
  axisLockedDistance: any
  captureUndoSnapshot: any
  createSceneItem: any
  createSelectionRef: any
  deselectAll: any
  endStudioGesture: any
  ensureCalibrationReady: any
  eventToLocalPoint: any
  finishWallButton: any
  gardenGateItemType: any
  getCurrentPreviewScope: any
  getPixelsPerMeter: any
  getPreviewScopeSelection: any
  hitTestHandle: any
  hitTestPlanItem: any
  /** 重叠区域按下时优先拖的那件（当前选中的、被压住的候选）；无则返回 null。 */
  overlapDragTarget?: (planPoint: unknown) => string | null
  isSameAlignmentFloor: any
  markDocumentDirty: any
  markWallsChanged: any
  planCanvasElement: any
  pushUndoEntry: any
  referenceMetersInput: any
  referencePixelsElement: any
  refreshPreviewScene: any
  refreshScopeItems: any
  refreshSelection: any
  refreshStudioUi: any
  refreshStudioView: any
  resetPlanInteraction: any
  scaleDialogElement: any
  screenToPlan: any
  screenToPlanPoint: any
  selectSceneObject: any
  setPreviewScope: any
  showToast: any
  updateMarqueeOverlay: any
  validateSelectionChange: any
}

/**
 * 按下落点归谁。
 *
 * 命中测试只返回最上面那件，但用户可能刚从重叠浮层里选了被压住的那件：这时再按下去
 * 必须拖**它**（否则每次按下都会被浮层接管，选中之后永远拖不动）。
 *
 * Alt 是「复制并拖动」，跟随命中结果：复制的是最上面那件。
 */
function resolvePointerHit(
  deps: HandlePointerDownDeps,
  hit: { kind: string; id: string } | null,
  planPoint: unknown,
  event: { altKey?: boolean },
): { kind: string; id: string } | null {
  if (hit?.kind !== 'item') return hit
  if (deps.appCtx.activeToolName !== 'select' || event.altKey) return hit
  const preferredId = deps.overlapDragTarget?.(planPoint)
  return preferredId ? { kind: 'item', id: preferredId } : hit
}

/**
 * 命中物件后是否进入「拖动」手势。
 *
 * 锁定的物件仍要能选中（否则没法在面板里解锁），但拒绝拖动 —— 只建立选中态。
 * 判定收在模块级而不是内联，是为了不推高 `handlePointerDown` 的分支数（它有行数/复杂度预算）。
 */
function canStartItemDrag(appCtx: StudioAppContext, hit: { kind: string; id: string } | null): boolean {
  return hit?.kind === 'item' && !isPlacedItemLocked(appCtx, hit.id)
}

/** 角手柄与边手柄的公共字段：谁命中就用谁的坐标。 */
function resizeHandleOf(hit: {
  corner?: { x: number; y: number; opposite: unknown }
  edge?: { x: number; y: number; opposite: unknown }
}) {
  const handle = hit.corner ?? hit.edge!
  return { edge: hit.edge ?? null, handle: { x: handle.x, y: handle.y }, anchor: { ...(handle.opposite as object) } }
}

export function handlePointerDown(deps: HandlePointerDownDeps, handlePointerDownPointerDownEvent: any) {
  const {
    activeDoorType,
    appCtx,
    applyPlacementChange,
    axisLockedDistance,
    captureUndoSnapshot,
    createSceneItem,
    createSelectionRef,
    deselectAll,
    endStudioGesture,
    ensureCalibrationReady,
    eventToLocalPoint,
    finishWallButton,
    gardenGateItemType,
    getCurrentPreviewScope,
    getPixelsPerMeter,
    getPreviewScopeSelection,
    hitTestHandle,
    hitTestPlanItem,
    isSameAlignmentFloor,
    markDocumentDirty,
    markWallsChanged,
    planCanvasElement,
    pushUndoEntry,
    referenceMetersInput,
    referencePixelsElement,
    refreshPreviewScene,
    refreshScopeItems,
    refreshSelection,
    refreshStudioUi,
    refreshStudioView,
    resetPlanInteraction,
    scaleDialogElement,
    screenToPlan,
    screenToPlanPoint,
    selectSceneObject,
    setPreviewScope,
    showToast,
    updateMarqueeOverlay,
    validateSelectionChange,
  } = deps

  if (handlePointerDownPointerDownEvent.button !== 0 && handlePointerDownPointerDownEvent.button !== 1) return
  planCanvasElement.focus({
    preventScroll: true,
  })
  const pointerDownPoint = eventToLocalPoint(handlePointerDownPointerDownEvent),
    pr3 = screenToPlan(pointerDownPoint)
  if (
    handlePointerDownPointerDownEvent.button === 1 ||
    appCtx.isMiddleButtonPanning ||
    appCtx.activeToolName === 'pan'
  ) {
    handlePointerDownPointerDownEvent.preventDefault(),
      resetPlanInteraction(),
      (appCtx.marqueeBox = {
        type: 'pan',
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        screen: screenToPlanPoint(pointerDownPoint),
        visibleScreen: pointerDownPoint,
        offsetX: appCtx.planView.offsetX,
        offsetY: appCtx.planView.offsetY,
      }),
      planCanvasElement.classList.add('panning'),
      updateMarqueeOverlay(),
      planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId)
    return
  }
  if (appCtx.alignmentState && isSameAlignmentFloor(pr3)) return
  // 拖动类平面工具按名称查表：新增工具只加一个条目，不再给这个函数添分支
  // （`floor-region` 就是这样并进来的）。
  const planDragToolHandler: Record<string, (() => void) | undefined> = {
    flooropening: () => {
      if (!ensureCalibrationReady()) return
      handlePointerDownPointerDownEvent.preventDefault(),
        resetPlanInteraction(),
        (appCtx.marqueeBox = {
          type: 'draw-flooropening',
          pointerId: handlePointerDownPointerDownEvent.pointerId,
          start: pr3,
          current: pr3,
        }),
        planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId)
    },
    // 0.8.9：点选地面 / 画分割线。判定与落盘全在 `floor-region-tool`，这里只转发。
    'floor-region': () => {
      handlePointerDownPointerDownEvent.preventDefault()
      handleFloorRegionPointer(
        {
          point: pr3,
          source: { walls: appCtx.studioState.walls, mergeTolerance: Math.max(1, getPixelsPerMeter() * 0.01) },
          activeFloorId: appCtx.activeFloorId,
          floors: appCtx.studioProject?.floors || [],
          createId: generateId,
          pushUndoEntry,
          markDocumentDirty,
          notify: showToast,
        },
        patchStudioFacadeState,
      )
      refreshStudioView()
    },
  }
  const planDragHandler = planDragToolHandler[appCtx.activeToolName]
  if (planDragHandler) {
    planDragHandler()
    return
  }
  if (appCtx.activeToolName === 'scale') {
    if (!appCtx.previewEndPoint) {
      ;(appCtx.previewEndPoint = pr3), refreshStudioView()
      return
    }
    const point = handlePointerDownPointerDownEvent.shiftKey ? axisLockedPoint2(pr3, appCtx.previewEndPoint).point : pr3
    if (distance2(appCtx.previewEndPoint, point) < 12 / appCtx.planView.zoom) {
      showToast('参考线太短，请重新选择终点。', 'error')
      return
    }
    ;(appCtx.measureSpan = {
      start: appCtx.previewEndPoint,
      end: point,
    }),
      (appCtx.previewEndPoint = null),
      (referencePixelsElement.textContent =
        Math.round(distance2(appCtx.measureSpan.start, appCtx.measureSpan.end)) + ' px'),
      (referenceMetersInput.value = appCtx.studioState.calibration?.reference?.meters || 3),
      scaleDialogElement.showModal(),
      requestAnimationFrame(() => referenceMetersInput.select()),
      refreshStudioView()
    return
  }
  if (appCtx.activeToolName === 'wall') {
    if (!ensureCalibrationReady()) return
    const ju2 = axisLockedDistance(pr3, appCtx.segmentStartPoint, handlePointerDownPointerDownEvent.shiftKey)
    if (!appCtx.segmentStartPoint) {
      ;(appCtx.segmentStartPoint = {
        ...ju2.point,
      }),
        (appCtx.snapEndpointPoint = {
          ...ju2.point,
        }),
        (appCtx.wallSegmentCount = 0),
        (finishWallButton.hidden = false),
        refreshStudioView()
      return
    }
    if (distance2(appCtx.segmentStartPoint, ju2.point) < getPixelsPerMeter() * 0.08) {
      showToast('墙段太短，请选择更远的终点。', 'error')
      return
    }
    const wallDraft = {
        id: generateId('wall'),
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
      uncoveredWallSegments = uncoveredCollinearWallSegments2(wallDraft, appCtx.studioState.walls, minWallLength)
    if (!uncoveredWallSegments.length) {
      ;(appCtx.segmentStartPoint = {
        ...ju2.point,
      }),
        showToast('该位置已有墙体，已跳过重复墙段。'),
        refreshStudioView()
      return
    }
    const isWallSplitAmbiguous =
      uncoveredWallSegments.length !== 1 ||
      distance2(uncoveredWallSegments[0].start, wallDraft.start) > minWallLength ||
      distance2(uncoveredWallSegments[0].end, wallDraft.end) > minWallLength
    deselectAll()
    const wallMergeTolerance = Math.max(1, getPixelsPerMeter() * 0.01),
      closedWallCount = closedWallPolygons2(appCtx.studioState.walls, wallMergeTolerance).length,
      splitWallSegments = uncoveredWallSegments.map((wallSegmentPiece, wallSegmentIndex) => ({
        ...wallDraft,
        id: wallSegmentIndex === 0 ? wallDraft.id : generateId('wall'),
        start: wallSegmentPiece.start,
        end: wallSegmentPiece.end,
      }))
    appCtx.studioState.walls.push(...splitWallSegments), markWallsChanged(), (appCtx.wallSegmentCount += 1)
    const hasWallPolygonGrown =
      closedWallPolygons2(appCtx.studioState.walls, wallMergeTolerance).length > closedWallCount
    hasWallPolygonGrown
      ? refreshPreviewScene()
      : (appCtx.segmentStartPoint = {
          ...ju2.point,
        }),
      selectSceneObject('wall', splitWallSegments[0].id),
      (finishWallButton.hidden = hasWallPolygonGrown),
      refreshScopeItems(),
      markDocumentDirty(),
      hasWallPolygonGrown
        ? showToast('空间已闭合，地面已生成。可继续绘制下一个空间。', 'success')
        : isWallSplitAmbiguous && showToast('已跳过与现有墙体重合的部分。', 'success')
    return
  }
  if (appCtx.activeToolName === 'courtyard-gate') {
    if (!ensureCalibrationReady()) return
    const placedElementRecord = {
      ...(itemTypeCatalog as any)[gardenGateItemType],
      type: gardenGateItemType,
      ...pr3,
    }
    if (!anchorGate2(placedElementRecord, appCtx.studioState.items, getPixelsPerMeter(), 24 / appCtx.planView.zoom)) {
      showToast('请靠近一段足够宽的围挡放置庭院门。', 'error')
      return
    }
    createSceneItem(gardenGateItemType, placedElementRecord)
    return
  }
  if (appCtx.activeToolName === 'window') {
    if (!ensureCalibrationReady()) return
    const nearestWindowWall = nearestWall2(pr3, appCtx.studioState.walls, 18 / appCtx.planView.zoom)
    if (!nearestWindowWall) {
      showToast('请靠近一段墙体放置窗户。', 'error')
      return
    }
    const ft5 = captureUndoSnapshot(),
      newWindowRecord = {
        id: generateId('window'),
        wallId: nearestWindowWall.wall.id,
        t: nearestWindowWall.t,
        width: 1.4,
        height: 1.35,
        sill: 0.85,
      }
    if (
      ((newWindowRecord.t = clampWindowT2(nearestWindowWall.wall, newWindowRecord, getPixelsPerMeter())),
      appCtx.studioState.windows.push(newWindowRecord),
      !validateSelectionChange(ft5))
    )
      return
    applyPlacementChange(ft5)
    const ao2 = getPreviewScopeSelection()
    selectSceneObject('window', newWindowRecord.id),
      refreshScopeItems('architecture'),
      setPreviewScope(ao2),
      markDocumentDirty()
    return
  }
  if (appCtx.activeToolName === 'door') {
    if (!ensureCalibrationReady()) return
    const nearestDoorWall = nearestWall2(pr3, appCtx.studioState.walls, 18 / appCtx.planView.zoom)
    if (!nearestDoorWall) {
      showToast('请靠近一段墙体放置门。', 'error')
      return
    }
    const ft6 = captureUndoSnapshot(),
      solid3 = doorTypeCatalog[activeDoorType] || doorTypeCatalog.solid,
      newDoorRecord = {
        id: generateId('door'),
        wallId: nearestDoorWall.wall.id,
        t: nearestDoorWall.t,
        width: solid3.width,
        height: solid3.height,
        sill: 0,
        doorType: activeDoorType,
        hinge: 'left',
        swing: 1,
      }
    if (
      ((newDoorRecord.t = clampWindowT2(nearestDoorWall.wall, newDoorRecord, getPixelsPerMeter())),
      appCtx.studioState.doors.push(newDoorRecord),
      !validateSelectionChange(ft6))
    )
      return
    applyPlacementChange(ft6)
    const ao3 = getPreviewScopeSelection()
    selectSceneObject('door', newDoorRecord.id),
      refreshScopeItems('architecture'),
      setPreviewScope(ao3),
      markDocumentDirty()
    return
  }
  if (appCtx.activeToolName === 'railing') {
    if (!ensureCalibrationReady()) return
    const nearestRailingWall = nearestWall2(pr3, appCtx.studioState.walls, 18 / appCtx.planView.zoom)
    if (!nearestRailingWall) {
      showToast('请靠近一段墙体放置栏杆。', 'error')
      return
    }
    const ft7 = captureUndoSnapshot(),
      newRailingRecord = {
        id: generateId('railing'),
        wallId: nearestRailingWall.wall.id,
        t: nearestRailingWall.t,
        width: 2,
        height: 1.1,
        sill: 0,
      }
    if (
      ((newRailingRecord.t = clampWindowT2(nearestRailingWall.wall, newRailingRecord, getPixelsPerMeter())),
      appCtx.studioState.railings.push(newRailingRecord),
      !validateSelectionChange(ft7))
    )
      return
    applyPlacementChange(ft7)
    const ao4 = getPreviewScopeSelection()
    selectSceneObject('railing', newRailingRecord.id),
      refreshScopeItems('architecture'),
      setPreviewScope(ao4),
      markDocumentDirty()
    return
  }
  if (appCtx.activeToolName === 'label') {
    createSceneItem('planlabel', pr3)
    return
  }
  const df3 = hitTestHandle(pr3)
  if (df3) {
    resetPlanInteraction()
    const newItemRecord = {
      ...df3.item,
    }
    ;(appCtx.marqueeBox =
      df3.type === 'resize-item'
        ? {
            type: 'resize-item',
            pointerId: handlePointerDownPointerDownEvent.pointerId,
            originalItem: newItemRecord,
            // 角手柄与边手柄共用一个字段：`handle` 是 ±1 方向向量，`press` 才是按下时命中的是哪一种。
            ...resizeHandleOf(df3),
            // 拖拽起点的真实平面坐标：`handle` 只是 ±1 的方向向量，不能当点用。
            startPointer: {
              ...pr3,
            },
            before: captureUndoSnapshot(),
            moved: false,
          }
        : {
            type: 'rotate-item',
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
      planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId)
    return
  }
  const ao5 = getPreviewScopeSelection(),
    fy2 = resolvePointerHit(deps, hitTestPlanItem(pr3), pr3, handlePointerDownPointerDownEvent)
  if (!fy2) {
    resetPlanInteraction(),
      handlePointerDownPointerDownEvent.shiftKey || refreshSelection(),
      (appCtx.marqueeBox = {
        type: 'marquee',
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
      planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId)
    return
  }
  resetPlanInteraction()
  const ft8 = fy2.kind === 'item' ? captureUndoSnapshot() : null,
    ne9 = fy2.kind === 'item' && appCtx.selectedItems.length > 0 && createSelectionRef('item', fy2.id)
  let placedItems: any = [],
    shouldRebuildItems = false
  if (fy2.kind === 'item') {
    if (ne9) {
      const existingItemIdSet = new Set(
        appCtx.selectedItems
          .filter((itemHistoryEntry: any) => itemHistoryEntry.kind === 'item')
          .map((itemIdEntry: any) => itemIdEntry.id),
      )
      placedItems = appCtx.studioState.items.filter((historyItem) => existingItemIdSet.has(historyItem.id))
    } else {
      selectSceneObject('item', fy2.id)
      const foundPlacementItem = appCtx.studioState.items.find((matchingItem) => matchingItem.id === fy2.id)
      foundPlacementItem && (placedItems = [foundPlacementItem])
    }
    if (handlePointerDownPointerDownEvent.altKey && placedItems.length) {
      const clonedItems = placedItems.map((clonedItemSource: any) => ({
        ...structuredClone(clonedItemSource),
        id: generateId('item'),
      }))
      remapCourtyardAttachments2(placedItems, clonedItems),
        pushUndoEntry(clonedItems),
        appCtx.studioState.items.push(...clonedItems),
        (placedItems = clonedItems),
        clonedItems.length === 1
          ? selectSceneObject('item', clonedItems[0].id)
          : ((appCtx.selectedItem = null),
            (appCtx.selectedItems = clonedItems.map((publishedItem: any) => ({
              kind: 'item',
              id: publishedItem.id,
            })))),
        (shouldRebuildItems = true)
    }
  } else selectSceneObject(fy2.kind, fy2.id)
  refreshStudioUi(), refreshStudioView(), setPreviewScope(ao5)
  const qa4 = getCurrentPreviewScope()
  canStartItemDrag(appCtx, fy2)
    ? (appCtx.marqueeBox = {
        type: 'move-items',
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
    : ['window', 'door', 'railing'].includes(fy2.kind) &&
      (appCtx.marqueeBox = {
        type: 'move-opening',
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        start: pr3,
        before: captureUndoSnapshot(),
        previewScope: 'architecture',
        moved: false,
      }),
    appCtx.marqueeBox
      ? planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId)
      : endStudioGesture()
}

/** 指针事件的只读子集（这里只关心修饰键）。 */
type PointerLike = { shiftKey: boolean; altKey: boolean; pointerId?: number }

/** 缩放 / 旋转会改的尺寸字段（缺字段的物件按 0 处理）。 */
type ResizeItemLike = {
  id?: string
  type: string
  x: number
  y: number
  width: number
  depth: number
  height: number
  rotation?: number
}

export interface HandlePointerUpDeps {
  appCtx: StudioAppContext
  drawMarqueeOverlay: any
  eventToLocalPoint: any
  getPixelsPerMeter: any
  getSelectedObject: any
  isSnapEnabled: any
  refreshStudioView: any
  renderPlanScene: any
  screenToPlan: any
  screenToPlanPoint: any
  toggleSnapSetting: any
}

/** 缩放时的尺寸 + 模式提示（0.8.7：单边尺寸 / 整体等比 / 高度保持）。 */
function resizeModeLabel(edge: unknown, shiftKey: boolean, itemType: string | undefined): string {
  return edge ? '单边尺寸' : shiftKey || itemType === 'fan' ? '整体等比' : '高度保持'
}

/** 缩放反馈整句（画布标签用，不再写 `#snap-indicator`）。 */
function buildResizeLabel(
  item: { width?: number; depth?: number; height?: number; type?: string },
  edge: unknown,
  shiftKey: boolean,
  guides: PlacementGuide[],
  appCtx: StudioAppContext,
): string {
  const base = `宽 ${Number(item.width || 0).toFixed(2)} × 深 ${Number(item.depth || 0).toFixed(2)} × 高 ${Number(item.height || 0).toFixed(2)} m · ${resizeModeLabel(edge, shiftKey, item.type)}`
  return guides.length
    ? `${base} · ${guides.map((guide) => `${guide.label} · ${guideTargetName(appCtx, guide)}`.trim()).join(' / ')}`
    : base
}

/**
 * 拖动反馈文案的「目标名」：墙面 → 墙面；物件 → 目录名（无则退类型）。
 *
 * 与 0.8.7 同：`label · targetName`，多根引导线用 ` / ` 连接。
 */
function guideTargetName(appCtx: StudioAppContext, guide: PlacementGuide): string {
  if (!guide.targetId) return ''
  const wall = (appCtx.studioState.walls as Array<{ id?: string }>).find((candidate) => candidate.id === guide.targetId)
  if (wall) return '墙面'
  const item = (appCtx.studioState.items as Array<Record<string, unknown>>).find(
    (candidate) => String(candidate.id) === guide.targetId,
  )
  if (!item) return ''
  const catalogEntry = (itemTypeCatalog as Record<string, { name?: string }>)[String(item.type)]
  return String(catalogEntry?.name || item.type || '')
}

/** 拖动反馈整句：`移动 1.23 m` + 命中引导线。 */
function buildDragLabel(
  appCtx: StudioAppContext,
  delta: { x: number; y: number },
  pixelsPerMeter: number,
  guides: PlacementGuide[],
): string {
  const distanceMeters = Math.hypot(delta.x, delta.y) / (pixelsPerMeter || 1)
  return guides.length
    ? `移动 ${distanceMeters.toFixed(2)} m · ${guides
        .map((guide) => `${guide.label} · ${guideTargetName(appCtx, guide)}`.trim())
        .join(' / ')}`
    : ''
}

/**
 * 单件 / 多选拖动的落位收尾：庭院门洞吸附，以及材质吸附加引导线。
 *
 * 收在模块级是为了不推高 `handlePointerUp` 的分支数（它已在棘轮阈值附近）。
 * 吸附在**每帧**都会走到这里（`handlePointerMove` 按帧复用 `handlePointerUp`），
 * 所以这里同时负责：吸附位移、网格量化、画布反馈文案。
 */
function snapDraggedItem(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
  pointerEvent: { altKey: boolean },
  rawDelta: { x: number; y: number },
): void {
  const originals = appCtx.marqueeBox?.originals ?? []
  if (!originals.length) {
    appCtx.placementGuides = []
    return
  }
  const pixelsPerMeter = deps.getPixelsPerMeter() || 100
  const draggedIds = originals.map((original: { id: string }) => String(original.id))
  anchorCourtyardGateOnce(appCtx, itemsByItemId, draggedIds, pixelsPerMeter)
  const snapResult = applyPlacementSnap(appCtx, draggedIds, pixelsPerMeter, {
    zoom: appCtx.planView.zoom,
    previousKeys: appCtx.marqueeBox?.snapKeys,
  })
  if (appCtx.marqueeBox) appCtx.marqueeBox.snapKeys = snapResult.keys
  // 命中吸附：位移直接来自吸附解，不再叠加网格量化。
  // 没吸上任何东西时按 5cm（Alt 1cm）网格量化：两者互斥，避免「先被网格吸住再被墙吸走」。
  // 注意量化的是**指针位移本身**（`snapResult.delta` 在没有命中时恒为 0，
  // 拿它去量化等于没量化 —— 这是首版实现漏掉的一步）。
  const offset = snapResult.guides.length
    ? snapResult.delta
    : residualToGrid(appCtx, rawDelta, pixelsPerMeter, pointerEvent.altKey)
  shiftItems(itemsByItemId, originals as Array<{ id: string }>, offset)
  appCtx.placementGuides = snapResult.guides
}

/** 庭院门的门洞吸附：只在单件拖动时做（多件一起拖不可能是「把门放进洞口」）。 */
function anchorCourtyardGateOnce(
  appCtx: StudioAppContext,
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
  draggedIds: string[],
  pixelsPerMeter: number,
): void {
  if (draggedIds.length !== 1) return
  const item = itemsByItemId.get(draggedIds[0])
  if (!item || !isCourtyardGate2(item)) return
  anchorGate2(item, appCtx.studioState.items, pixelsPerMeter, 24 / appCtx.planView.zoom)
}

/**
 * 把「已应用的指针位移」再微调到一个网格点所需的**增量**。
 *
 * 调用方已经按 `rawDelta` 落过位；这里返回 `grid(rawDelta) - rawDelta`，
 * 再叠一次就到了网格上（而不是把物件再挪一整格）。
 */
function residualToGrid(
  appCtx: StudioAppContext,
  rawDelta: { x: number; y: number },
  pixelsPerMeter: number,
  altKey: boolean,
): { x: number; y: number } {
  const target = quantizePlanDelta(appCtx, rawDelta, pixelsPerMeter, altKey)
  return { x: target.x - rawDelta.x, y: target.y - rawDelta.y }
}

/** 给一组物件叠加同一个像素位移。 */
function shiftItems(
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
  originals: Array<{ id: string }>,
  offset: { x: number; y: number },
): void {
  for (const original of originals) {
    const item = itemsByItemId.get(String(original.id))
    if (!item) continue
    item.x += offset.x
    item.y += offset.y
  }
}

/** 把「起始快照 + 位移」落到状态里（多选整体平移，保持相对位置）。 */
function applyMoveOffsets(
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
  originals: Array<{ id: string; x: number; y: number }>,
  offset: { x: number; y: number },
): void {
  for (const original of originals) {
    const item = itemsByItemId.get(original.id)
    if (!item) continue
    item.x = original.x + offset.x
    item.y = original.y + offset.y
  }
}

/** 位移是否真的改动了至少一件（死区判定与「是否记为一次编辑」都看它）。 */
function anyItemMoved(
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
  originals: Array<{ id: string; x: number; y: number }>,
): boolean {
  return originals.some((original) => {
    const item = itemsByItemId.get(original.id)
    if (!item) return false
    return Math.abs(item.x - original.x) > 0.000001 || Math.abs(item.y - original.y) > 0.000001
  })
}

/** 移动手势的画布反馈：锚点取第一件中心，文案带吸附目标名。 */
function writeMoveFeedback(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  itemsByItemId: Map<string, { id: string; x: number; y: number }>,
): void {
  const firstOriginal = appCtx.marqueeBox.originals[0]
  const firstCurrent = firstOriginal ? itemsByItemId.get(firstOriginal.id) : undefined
  if (!firstOriginal || !firstCurrent) {
    appCtx.dragFeedback = null
    return
  }
  const movedOffset = { x: firstCurrent.x - firstOriginal.x, y: firstCurrent.y - firstOriginal.y }
  appCtx.dragFeedback = {
    point: { x: Number(firstCurrent.x), y: Number(firstCurrent.y) },
    label: buildDragLabel(appCtx, movedOffset, deps.getPixelsPerMeter() || 100, appCtx.placementGuides),
    guides: appCtx.placementGuides,
  }
}

/** 移动手势：位移 → 吸附 / 量化 → 反馈。 */
function applyMoveItemsGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  pr4: { x: number; y: number },
  pointerUpEvent: PointerLike,
): void {
  if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.start) * appCtx.planView.zoom < 3) return
  // Shift 锁轴；网格量化与吸附在 `snapDraggedItem` 里做（两者互斥，命中吸附时不再量化）。
  const dragDelta = planDragDelta2(appCtx.marqueeBox.start, pr4, pointerUpEvent.shiftKey)
  const itemsByItemId: Map<string, { id: string; x: number; y: number }> = new Map(
    appCtx.studioState.items.map((entry) => [entry.id, entry]),
  )
  applyMoveOffsets(itemsByItemId, appCtx.marqueeBox.originals, dragDelta)
  snapDraggedItem(deps, appCtx, itemsByItemId, pointerUpEvent, dragDelta)
  writeMoveFeedback(deps, appCtx, itemsByItemId)
  appCtx.marqueeBox.moved = anyItemMoved(itemsByItemId, appCtx.marqueeBox.originals)
  deps.refreshStudioView()
}

/** 缩放死区：`handle` 是 ±1 向量，拿它当点算距离永远超过阈值，所以用 `startPointer`。 */
function resizeDeadzone(pr4: { x: number; y: number }, appCtx: StudioAppContext): boolean {
  if (appCtx.marqueeBox.moved) return false
  const origin = appCtx.marqueeBox.startPointer || appCtx.marqueeBox.handle
  return distance2(pr4, origin) * appCtx.planView.zoom < 3
}

/** 缩放范围：扇形按比例、Shift 等比、其余只改被拖的维度。 */
function resizeLimitsOf(
  appCtx: StudioAppContext,
  source: { width: number; depth: number },
  minimumFootprint: number,
  heightMeters: number,
  shiftKey: boolean,
  itemType: string,
): { minimum: number; maximum: number } | undefined {
  if (itemType === 'fan') {
    const fanScale = fanDimensions2(appCtx.marqueeBox.originalItem).fanScale
    return { minimum: 0.6 / fanScale, maximum: 1.6 / fanScale }
  }
  if (!shiftKey) return undefined
  return {
    minimum: Math.max(
      minimumFootprint / Math.max(source.width, minimumFootprint),
      minimumFootprint / Math.max(source.depth, minimumFootprint),
      itemMinimumHeight2(appCtx.marqueeBox.originalItem.type) / heightMeters,
    ),
    maximum: Math.min(
      8 / Math.max(source.width, minimumFootprint),
      8 / Math.max(source.depth, minimumFootprint),
      6 / heightMeters,
    ),
  }
}

/** 窗帘非直轨时按深度比例缩放左右长度（否则弯轨会与机身错位）。 */
function applyCurtainTrackRatio(item: ResizeItemLike, original: ResizeItemLike): void {
  if (item.type !== 'curtain' || normalizeCurtainTrack2(item).curtainTrack === 'straight') return
  const config = normalizeCurtainTrack2(original)
  const ratio = Math.max(0.2, item.depth - 0.18) / Math.max(0.2, original.depth - 0.18)
  Object.assign(
    item,
    normalizeCurtainTrack2({
      ...item,
      curtainLeftLength: config.curtainLeftLength * ratio,
      curtainRightLength: config.curtainRightLength * ratio,
    }),
  )
  item.depth = curtainFootprintDepth2(item)
}

/** 写回缩放结果：尺寸、风扇比例、窗帘轨道，返回尺寸是否变化。 */
function applyResizeResult(
  appCtx: StudioAppContext,
  item: ResizeItemLike,
  result: { width: number; depth: number },
  pixelsPerMeter: number,
): boolean {
  const original = appCtx.marqueeBox.originalItem
  Object.assign(item, itemFromPlanFootprintResize2(original, result, pixelsPerMeter))
  if (item.type === 'fan') {
    Object.assign(item, fanDimensions2({ ...original, fanScale: result.width / 0.434 }))
  }
  if (item.type === 'curtain' && normalizeCurtainTrack2(item).curtainTrack !== 'straight') {
    applyCurtainTrackRatio(item, original)
  }
  return (
    Math.abs(item.x - original.x) > 0.000001 ||
    Math.abs(item.y - original.y) > 0.000001 ||
    Math.abs(item.width - original.width) > 0.000001 ||
    Math.abs(item.depth - original.depth) > 0.000001 ||
    Math.abs(item.height - original.height) > 0.000001
  )
}

/** 缩放手势：被拖的边参与吸附 → 计算尺寸 → 写回 → 反馈。 */
function applyResizeGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  pr4: { x: number; y: number },
  pointerUpEvent: PointerLike,
): void {
  if (resizeDeadzone(pr4, appCtx)) return
  const item = deps.getSelectedObject()
  if (!item) return
  const pixelsPerMeter = deps.getPixelsPerMeter() || 100
  // 被拖的边本身参与吸附：贴墙 / 对齐邻居边缘时，尺寸跟着落在精确值上（0.8.7 同）。
  const snap = appCtx.marqueeBox.edge
    ? applyPointSnap(appCtx, [String(item.id ?? '')], pixelsPerMeter, pr4, {
        zoom: appCtx.planView.zoom,
        previousKeys: appCtx.marqueeBox.snapKeys,
      })
    : null
  if (snap) appCtx.marqueeBox.snapKeys = snap.keys
  const point = snap?.point ?? pr4
  const result = computeResize(appCtx, item, point, pixelsPerMeter, pointerUpEvent)
  // 先写回尺寸再拼文案：反过来的话标签显示的是**上一帧**的宽深高（差一格）。
  const changed = applyResizeResult(appCtx, item, result, pixelsPerMeter)
  appCtx.placementGuides = snap?.guides ?? []
  appCtx.dragFeedback = {
    point: { x: Number(item.x), y: Number(item.y) },
    label: buildResizeLabel(item, appCtx.marqueeBox.edge, pointerUpEvent.shiftKey, appCtx.placementGuides, appCtx),
    guides: appCtx.placementGuides,
  }
  appCtx.marqueeBox.moved = changed || appCtx.marqueeBox.moved
  deps.refreshStudioView()
}

/** 按手柄类型算新尺寸：边手柄改单维，角手柄改整体（Shift / 风扇等比）。 */
function computeResize(
  appCtx: StudioAppContext,
  item: ResizeItemLike,
  point: { x: number; y: number },
  pixelsPerMeter: number,
  event: PointerLike,
): { width: number; depth: number } {
  const heightMeters = Math.max(finite2(appCtx.marqueeBox.originalItem.height, 0.05), 0.001)
  const source = itemWithPlanFootprint2(appCtx.marqueeBox.originalItem, pixelsPerMeter)
  const minimumFootprint = itemMinimumFootprint2(appCtx.marqueeBox.originalItem.type)
  const limits = resizeLimitsOf(appCtx, source, minimumFootprint, heightMeters, event.shiftKey, item.type)
  const options = { ...limits, minimumDimension: minimumFootprint }
  if (appCtx.marqueeBox.edge) {
    return resizeRotatedItemFromEdge2(
      source,
      appCtx.marqueeBox.handle,
      appCtx.marqueeBox.anchor,
      point,
      pixelsPerMeter,
      options,
    )
  }
  return resizeRotatedItemFromCorner2(
    source,
    appCtx.marqueeBox.handle,
    appCtx.marqueeBox.anchor,
    point,
    pixelsPerMeter,
    event.shiftKey || item.type === 'fan',
    options,
  )
}

/** 旋转量化步长：Shift 15°、Alt 0.1°、默认 1°；`snapAngles === false` 时不量化。 */
function rotateStepFor(appCtx: StudioAppContext, event: PointerLike): number {
  if (event.shiftKey) return 15
  const settings = (appCtx.studioState.settings ?? {}) as Record<string, unknown>
  if (settings.snapAngles === false) return 0
  return event.altKey ? 0.1 : 1
}

/** 旋转手势：算角度 → 画布反馈。 */
function applyRotateGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  pr4: { x: number; y: number },
  pointerUpEvent: PointerLike,
): void {
  if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.startPointer) * appCtx.planView.zoom < 3) return
  const item = deps.getSelectedObject()
  if (!item) return
  item.rotation = itemRotationFromPointers2(
    appCtx.marqueeBox.originalItem.rotation,
    appCtx.marqueeBox.center,
    appCtx.marqueeBox.startPointer,
    pr4,
    rotateStepFor(appCtx, pointerUpEvent),
  )
  appCtx.placementGuides = []
  appCtx.dragFeedback = {
    point: { x: Number(appCtx.marqueeBox.center?.x ?? item.x), y: Number(appCtx.marqueeBox.center?.y ?? item.y) },
    label: `旋转 ${Number(item.rotation || 0).toFixed(1)}°`,
    guides: [],
  }
  appCtx.marqueeBox.moved = Math.abs(item.rotation - appCtx.marqueeBox.originalItem.rotation) > 0.000001
  deps.refreshStudioView()
}

/** 门窗移动：把 `t` 投影到所属墙段并夹在合法区间内。 */
function applyMoveOpeningGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  pr4: { x: number; y: number },
): void {
  if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.start) * appCtx.planView.zoom < 3) return
  const item = deps.getSelectedObject()
  const wall = appCtx.studioState.walls.find((candidate) => candidate.id === item?.wallId)
  if (!item || !wall) return
  item.t = clampWindowT2(
    wall,
    { ...item, t: projectPointToSegment2(pr4, wall.start, wall.end).t },
    deps.getPixelsPerMeter(),
  )
  const before = appCtx.marqueeBox.before?.[String(appCtx.selectedItem?.kind) + 's']?.find?.(
    (entry: { id?: string; t?: number }) => entry.id === item.id,
  )
  appCtx.marqueeBox.moved = !before || Math.abs(item.t - before.t) > 0.000001
  deps.refreshStudioView()
}

export function handlePointerUp(deps: HandlePointerUpDeps, pointerUpEvent: PointerLike) {
  const { appCtx, eventToLocalPoint, screenToPlan, toggleSnapSetting } = deps
  const local = eventToLocalPoint(pointerUpEvent)
  const plan = screenToPlan(local)
  if (appCtx.marqueeBox?.pointerId === pointerUpEvent.pointerId) {
    if (handleBoxGesture(deps, appCtx, local, plan, pointerUpEvent)) return
  }
  toggleSnapSetting(pointerUpEvent)
  if (appCtx.alignmentState || ['scale', 'wall', 'window', 'door', 'railing'].includes(appCtx.activeToolName)) {
    deps.refreshStudioView()
  }
}

/** 按手势类型分派；返回是否已接管（已接管则不再走「未拖动」的收尾）。 */
function handleBoxGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  local: { x: number; y: number },
  plan: { x: number; y: number },
  event: PointerLike,
): boolean {
  const box = appCtx.marqueeBox
  if (!box) return false
  const handlers: Record<string, () => void> = {
    'draw-flooropening': () => applyFloorOpeningGesture(deps, appCtx, plan, event),
    marquee: () => applyMarqueeGesture(deps, appCtx, plan),
    pan: () => applyPanGesture(deps, appCtx, local),
    'move-items': () => applyMoveItemsGesture(deps, appCtx, plan, event),
    'resize-item': () => applyResizeGesture(deps, appCtx, plan, event),
    'rotate-item': () => applyRotateGesture(deps, appCtx, plan, event),
    'move-opening': () => applyMoveOpeningGesture(deps, appCtx, plan),
  }
  const handler = handlers[String(box.type)]
  if (!handler) return false
  handler()
  return true
}

/** 楼板洞口：Shift 约束成正方形。 */
function applyFloorOpeningGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  plan: { x: number; y: number },
  event: PointerLike,
): void {
  appCtx.marqueeBox.current = event.shiftKey ? squareCorner(appCtx.marqueeBox.start, plan) : plan
  deps.refreshStudioView()
}

/** 以 `start` 为一角、把 `plan` 校正成正方形后的对角点。 */
function squareCorner(start: { x: number; y: number }, plan: { x: number; y: number }): { x: number; y: number } {
  const deltaX = plan.x - start.x
  const deltaY = plan.y - start.y
  const magnitude = Math.max(Math.abs(deltaX), Math.abs(deltaY))
  return { x: start.x + Math.sign(deltaX || 1) * magnitude, y: start.y + Math.sign(deltaY || 1) * magnitude }
}

/** 框选：更新终点与「是否算一次拖动」，再决定重绘哪一层。 */
function applyMarqueeGesture(
  deps: HandlePointerUpDeps,
  appCtx: StudioAppContext,
  plan: { x: number; y: number },
): void {
  appCtx.marqueeBox.current = plan
  appCtx.marqueeBox.moved = distance2(appCtx.marqueeBox.start, plan) * appCtx.planView.zoom >= 4
  if (deps.drawMarqueeOverlay()) deps.renderPlanScene()
  else deps.refreshStudioView()
}

/** 平移：按「屏幕位移 → 平面位移」更新 offset。 */
function applyPanGesture(deps: HandlePointerUpDeps, appCtx: StudioAppContext, local: { x: number; y: number }): void {
  const planPoint = deps.screenToPlanPoint(local)
  appCtx.planView.offsetX = appCtx.marqueeBox.offsetX + planPoint.x - appCtx.marqueeBox.screen.x
  appCtx.planView.offsetY = appCtx.marqueeBox.offsetY + planPoint.y - appCtx.marqueeBox.screen.y
  const overlayDrawn = deps.drawMarqueeOverlay({
    offsetX: local.x - appCtx.marqueeBox.visibleScreen.x,
    offsetY: local.y - appCtx.marqueeBox.visibleScreen.y,
  })
  if (!overlayDrawn) deps.refreshStudioView()
}

export function updateSnapIndicator(runtime: StudioAppRuntime, snapWallTarget = runtime.appCtx.isForceSnapDisabled) {
  if (!runtime.appCtx.activeSnapTarget) return
  runtime.appCtx.hoverPoint = {
    ...runtime.appCtx.activeSnapTarget,
  }
  const snapPpm = runtime.getPixelsPerMeter() || 100,
    snapStatusLabel = runtime.appCtx.isSnapTemporarilyOff ? '吸附：临时关闭' : '吸附：关闭'
  if (runtime.appCtx.activeToolName === 'scale' && runtime.appCtx.previewEndPoint && snapWallTarget) {
    const snapGuidePoint = axisLockedPoint2(runtime.appCtx.activeSnapTarget, runtime.appCtx.previewEndPoint)
    ;(runtime.appCtx.hoverPoint = snapGuidePoint.point),
      (runtime.appCtx.snapHit = null),
      (runtime.snapIndicatorElement.textContent = '吸附：' + snapGuidePoint.label)
  } else
    runtime.appCtx.activeToolName === 'scale' &&
      ((runtime.appCtx.snapHit = null), (runtime.snapIndicatorElement.textContent = '吸附：自由'))
  if (
    ((runtime.cursorPositionElement.textContent =
      'X ' +
      (runtime.appCtx.hoverPoint.x / snapPpm).toFixed(2) +
      ' m · Y ' +
      (runtime.appCtx.hoverPoint.y / snapPpm).toFixed(2) +
      ' m'),
    runtime.appCtx.activeToolName === 'wall')
  )
    (runtime.appCtx.snapHit = runtime.axisLockedDistance(
      runtime.appCtx.activeSnapTarget,
      runtime.appCtx.segmentStartPoint,
      snapWallTarget,
    )),
      (runtime.snapIndicatorElement.textContent = runtime.formatMeasurement(runtime.appCtx.snapHit)
        ? '闭合：点击闭合空间'
        : runtime.appCtx.snapHit.kind
          ? (!runtime.isSnapEnabled() && snapWallTarget ? '锁定' : '吸附') + '：' + runtime.appCtx.snapHit.label
          : runtime.isSnapEnabled()
            ? '吸附：自由'
            : snapStatusLabel)
  else {
    if (runtime.appCtx.activeToolName === 'courtyard-gate')
      (runtime.gardenGateSnapCandidate = {
        ...(itemTypeCatalog as any)[runtime.gardenGateItemType],
        type: runtime.gardenGateItemType,
        ...runtime.appCtx.hoverPoint,
        rotation: 0,
      }),
        anchorGate2(
          runtime.gardenGateSnapCandidate,
          runtime.appCtx.studioState.items,
          snapPpm,
          24 / runtime.appCtx.planView.zoom,
        ) || (runtime.gardenGateSnapCandidate = null),
        (runtime.snapIndicatorElement.textContent = runtime.gardenGateSnapCandidate
          ? '吸附：围挡门洞'
          : '吸附：请靠近足够宽的围挡')
    else {
      if (['window', 'door', 'railing'].includes(runtime.appCtx.activeToolName)) {
        const nearestSnapWall = nearestWall2(
          runtime.appCtx.hoverPoint,
          runtime.appCtx.studioState.walls,
          16 / runtime.appCtx.planView.zoom,
        )
        if (nearestSnapWall) {
          const solid2 = doorTypeCatalog[runtime.activeDoorType] || doorTypeCatalog.solid,
            snapProbeOptions = {
              width:
                runtime.appCtx.activeToolName === 'door'
                  ? solid2.width
                  : runtime.appCtx.activeToolName === 'railing'
                    ? 2
                    : 1.4,
              t: nearestSnapWall.t,
            },
            snapResolvedProbe = {
              wall: nearestSnapWall.wall,
              t: clampWindowT2(nearestSnapWall.wall, snapProbeOptions, snapPpm),
            }
          ;(runtime.appCtx.windowPlacement = runtime.appCtx.activeToolName === 'window' ? snapResolvedProbe : null),
            (runtime.appCtx.doorPlacement = runtime.appCtx.activeToolName === 'door' ? snapResolvedProbe : null),
            (runtime.appCtx.railingPlacement = runtime.appCtx.activeToolName === 'railing' ? snapResolvedProbe : null),
            (runtime.snapIndicatorElement.textContent =
              runtime.appCtx.activeToolName === 'door'
                ? '吸附：墙体门洞'
                : runtime.appCtx.activeToolName === 'railing'
                  ? '吸附：墙体栏杆'
                  : '吸附：墙体')
        } else
          (runtime.appCtx.windowPlacement = null),
            (runtime.appCtx.doorPlacement = null),
            (runtime.appCtx.railingPlacement = null),
            (runtime.snapIndicatorElement.textContent = '吸附：未找到墙体')
      } else if (runtime.appCtx.activeToolName === 'pan') {
        ;(runtime.appCtx.snapHit = null),
          (runtime.appCtx.windowPlacement = null),
          (runtime.appCtx.doorPlacement = null),
          (runtime.appCtx.railingPlacement = null),
          (runtime.snapIndicatorElement.textContent = runtime.isSnapEnabled() ? '吸附：开启' : snapStatusLabel),
          (runtime.planCanvasElement.style.cursor = '')
      } else {
        if (runtime.appCtx.activeToolName !== 'scale') {
          ;(runtime.appCtx.snapHit = null),
            (runtime.appCtx.windowPlacement = null),
            (runtime.appCtx.doorPlacement = null),
            (runtime.appCtx.railingPlacement = null),
            (runtime.snapIndicatorElement.textContent = runtime.isSnapEnabled() ? '吸附：开启' : snapStatusLabel)
          const df2 = runtime.hitTestHandle(runtime.appCtx.hoverPoint)
          // 边手柄只改一个方向：上下边用 ns-resize，左右边用 ew-resize。
          const edgeCursor = df2?.edge ? (df2.edge.x !== 0 ? 'ew-resize' : 'ns-resize') : null
          runtime.planCanvasElement.style.cursor =
            df2?.type === 'rotate-item' ? 'grab' : df2?.type === 'resize-item' ? (edgeCursor ?? 'nwse-resize') : ''
        }
      }
    }
  }
}

export function toggleSnapSetting(runtime: StudioAppRuntime, snapToggleEvent: any) {
  ;(runtime.appCtx.isForceSnapDisabled = snapToggleEvent.shiftKey),
    (runtime.appCtx.activeSnapTarget = runtime.screenToPlan(runtime.eventToLocalPoint(snapToggleEvent))),
    runtime.updateSnapIndicator()
}

export function schedulePointerMove(runtime: StudioAppRuntime) {
  runtime.appCtx.pointerFrameId = 0
  const Hi2 = runtime.appCtx.activePointerState
  ;(runtime.appCtx.activePointerState = null), Hi2 && runtime.handlePointerUp(Hi2)
}

export function handlePointerMove(runtime: StudioAppRuntime, pointerMoveEvent: any) {
  ;(runtime.appCtx.activePointerState = {
    clientX: pointerMoveEvent.clientX,
    clientY: pointerMoveEvent.clientY,
    pointerId: pointerMoveEvent.pointerId,
    shiftKey: pointerMoveEvent.shiftKey,
  }),
    runtime.appCtx.pointerFrameId ||
      (runtime.appCtx.pointerFrameId = requestAnimationFrame(runtime.schedulePointerMove))
}

export function cancelPointerDrag(runtime: StudioAppRuntime, cancelPointerDragActivePointerId: any) {
  !runtime.appCtx.activePointerState ||
    runtime.appCtx.activePointerState.pointerId !== cancelPointerDragActivePointerId ||
    (runtime.appCtx.pointerFrameId && cancelAnimationFrame(runtime.appCtx.pointerFrameId),
    runtime.schedulePointerMove())
}

export function scheduleDragUpdate(runtime: StudioAppRuntime) {
  runtime.appCtx.renderLoopFrameId = 0
  const Gd2 = runtime.appCtx.pinchStartDistance,
    Wd2 = runtime.appCtx.pinchStartCenter
  ;(runtime.appCtx.pinchStartDistance = 1),
    (runtime.appCtx.pinchStartCenter = null),
    Wd2 && Math.abs(Gd2 - 1) > 1e-8 && runtime.zoomByScale(Gd2, Wd2)
}

export function handleCanvasWheel(runtime: StudioAppRuntime, wheelEvent: any) {
  ;(runtime.appCtx.pinchStartDistance *= Math.exp(-wheelEvent.deltaY * 0.0012)),
    (runtime.appCtx.pinchStartCenter = runtime.eventToLocalPoint(wheelEvent)),
    runtime.resetPlanInteraction(),
    runtime.appCtx.renderLoopFrameId ||
      (runtime.appCtx.renderLoopFrameId = requestAnimationFrame(runtime.scheduleDragUpdate)),
    window.clearTimeout(runtime.appCtx.renderLoopTimeoutId),
    (runtime.appCtx.renderLoopTimeoutId = window.setTimeout(() => {
      ;(runtime.appCtx.renderLoopTimeoutId = null),
        runtime.appCtx.renderLoopFrameId &&
          (cancelAnimationFrame(runtime.appCtx.renderLoopFrameId), runtime.scheduleDragUpdate()),
        runtime.endStudioGesture()
    }, 90))
}

/**
 * 手势结束时的重绘判定（0.8.7）。
 *
 * 单独成函数是因为内联要把三个条件叠在一行里（`||` / `&&` 都计复杂度），
 * 而 `finishPointerDrag` 已在棘轮阈值上。
 */
function withGuidesRepaint(runtime: StudioAppRuntime, isPan: boolean, hadGuides: boolean, hadFeedback: boolean): void {
  if (isPan || hadGuides || hadFeedback) runtime.refreshStudioView()
}

/**
 * 纯点击（按下 → 抬起没有拖动）落在重叠物件上：松手后再列候选。
 *
 * 浮层不能在按下时弹：那一刻画布已经 `setPointerCapture`，捕获期间的点击到不了浮层，
 * 结果就是「按下只弹窗、拖动永远起不来」。放到松手之后，拖动照常，单击仍能选到被压住的那件。
 */
function offerOverlapAfterClick(
  runtime: StudioAppRuntime,
  gesture: { type?: string; moved?: boolean },
  event: { type?: string; altKey?: boolean; clientX: number; clientY: number },
): void {
  if (event.type === 'pointercancel' || event.altKey) return
  if (gesture.type !== 'move-items' || gesture.moved) return
  if (runtime.appCtx.activeToolName !== 'select') return
  const plan = runtime.screenToPlan(runtime.eventToLocalPoint(event))
  // 锚点用视口坐标：浮层是 `position: fixed` 的 body 子节点，画布局部坐标会偏。
  offerOverlapPickerFor(runtime.appCtx, plan, { x: event.clientX, y: event.clientY })
}

export function finishPointerDrag(runtime: StudioAppRuntime, pointerCancelEvent: any) {
  if (!runtime.appCtx.marqueeBox || runtime.appCtx.marqueeBox.pointerId !== pointerCancelEvent.pointerId) return
  if (runtime.appCtx.marqueeBox.type === 'draw-flooropening') {
    const { start: finishPointerDragDragStart, current: dragCurrent } = runtime.appCtx.marqueeBox
    try {
      runtime.planCanvasElement.releasePointerCapture(pointerCancelEvent.pointerId)
    } catch {
      /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */
    }
    ;(runtime.appCtx.marqueeBox = null), runtime.endStudioGesture()
    const dragDeltaXMeters = Math.abs(dragCurrent.x - finishPointerDragDragStart.x) / runtime.getPixelsPerMeter(),
      dragDeltaYMeters = Math.abs(dragCurrent.y - finishPointerDragDragStart.y) / runtime.getPixelsPerMeter()
    pointerCancelEvent.type !== 'pointercancel' && dragDeltaXMeters >= 0.1 && dragDeltaYMeters >= 0.1
      ? runtime.createSceneItem(
          'flooropening',
          {
            x: (finishPointerDragDragStart.x + dragCurrent.x) / 2,
            y: (finishPointerDragDragStart.y + dragCurrent.y) / 2,
          },
          {
            width: Math.min(20, dragDeltaXMeters),
            depth: Math.min(20, dragDeltaYMeters),
          },
        )
      : runtime.refreshStudioView()
    return
  }
  if (runtime.appCtx.marqueeBox.type === 'marquee') {
    const ao6 = runtime.getPreviewScopeSelection(),
      dragAdditionEntries = runtime.appCtx.marqueeBox.additive
        ? [...(runtime.appCtx.selectedItem ? [runtime.appCtx.selectedItem] : []), ...runtime.appCtx.selectedItems]
        : [],
      dy3 = runtime.appCtx.marqueeBox.moved
        ? runtime.marqueeDelta(runtime.appCtx.marqueeBox.start, runtime.appCtx.marqueeBox.current)
        : [],
      dragMergedEntries = [
        ...new Map(
          [...dragAdditionEntries, ...dy3].map((dragEntry) => [dragEntry.kind + ':' + dragEntry.id, dragEntry]),
        ).values(),
      ]
    dragMergedEntries.length === 1
      ? runtime.selectSceneObject(dragMergedEntries[0].kind, dragMergedEntries[0].id)
      : ((runtime.appCtx.selectedItem = null), (runtime.appCtx.selectedItems = dragMergedEntries))
    try {
      runtime.planCanvasElement.releasePointerCapture(pointerCancelEvent.pointerId)
    } catch {
      /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */
    }
    ;(runtime.appCtx.marqueeBox = null),
      runtime.refreshStudioUi(),
      runtime.refreshStudioView(),
      runtime.setPreviewScope(ao6),
      runtime.endStudioGesture()
    return
  }
  const activeDragGesture = runtime.appCtx.marqueeBox
  let copied = activeDragGesture.moved || activeDragGesture.copied
  if (copied && activeDragGesture.type === 'move-items')
    for (const draggedOriginal of activeDragGesture.originals) {
      const draggedItemRecord = runtime.appCtx.studioState.items.find(
        (draggedItem) => draggedItem.id === draggedOriginal.id,
      )
      draggedItemRecord &&
        anchorGate2(
          draggedItemRecord,
          runtime.appCtx.studioState.items,
          runtime.getPixelsPerMeter(),
          24 / runtime.appCtx.planView.zoom,
        )
    }
  if (copied && pointerCancelEvent.type !== 'pointercancel' && activeDragGesture.type === 'move-items') {
    const draggedOriginalIds = activeDragGesture.originals.map((draggedOriginalItem: any) => draggedOriginalItem.id)
    if (draggedOriginalIds.length === 1) {
      const firstDraggedItemRecord = runtime.appCtx.studioState.items.find(
        (firstDraggedItem) => firstDraggedItem.id === draggedOriginalIds[0],
      )
      firstDraggedItemRecord && runtime.finalizeAddedItem(firstDraggedItemRecord, draggedOriginalIds)
    }
  }
  if (
    (activeDragGesture.before && pointerCancelEvent.type === 'pointercancel'
      ? (restorePlacementScene2(runtime.appCtx.studioState, activeDragGesture.before),
        runtime.appCtx.selectedItem && !runtime.getSelectedObject() && runtime.refreshSelection(),
        (copied = false),
        runtime.refreshStudioView())
      : copied &&
        !runtime.validateSelectionChange(activeDragGesture.before) &&
        ((copied = false), runtime.refreshStudioView()),
    copied && (runtime.applyPlacementChange(runtime.appCtx.marqueeBox.before), runtime.markDocumentDirty()),
    ['move-items', 'resize-item', 'rotate-item', 'move-opening'].includes(activeDragGesture.type) &&
      runtime.refreshStudioUi(),
    copied && activeDragGesture.type === 'move-opening')
  )
    runtime.requestSceneRebuild({
      scope: 'architecture',
    })
  else {
    if (copied && ['move-items', 'resize-item', 'rotate-item'].includes(activeDragGesture.type)) {
      const activePlacedElement = runtime.getSelectedObject()
      runtime.requestSceneRebuild({
        scope:
          activeDragGesture.previewScope ||
          (activePlacedElement ? runtime.resolvePreviewScope(activePlacedElement) : runtime.getCurrentPreviewScope()),
      })
    }
  }
  runtime.appCtx.marqueeBox.type === 'pan' && runtime.planCanvasElement.classList.remove('panning')
  try {
    runtime.planCanvasElement.releasePointerCapture(pointerCancelEvent.pointerId)
  } catch {
    /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */
  }
  const hadGuides = (runtime.appCtx.placementGuides?.length ?? 0) > 0
  const hadFeedback = Boolean(runtime.appCtx.dragFeedback)
  ;(runtime.appCtx.marqueeBox = null),
    // 引导线与拖动反馈只属于拖动过程：手势结束就清，否则松手后画面还挂着一组虚线。
    (runtime.appCtx.placementGuides = []),
    (runtime.appCtx.dragFeedback = null),
    // 清掉引导线必须重绘一次：`move-items` 结束后原本不重绘（上面只给 `pan` 补了）。
    withGuidesRepaint(runtime, activeDragGesture.type === 'pan', hadGuides, hadFeedback),
    offerOverlapAfterClick(runtime, activeDragGesture, pointerCancelEvent),
    runtime.endStudioGesture()
}

export function handlePointerRelease(runtime: StudioAppRuntime, releasePointerId: any) {
  runtime.cancelPointerDrag(releasePointerId.pointerId), runtime.finishPointerDrag(releasePointerId)
}

export function refreshPreviewScene(runtime: StudioAppRuntime) {
  ;(runtime.appCtx.segmentStartPoint = null),
    (runtime.appCtx.snapEndpointPoint = null),
    (runtime.appCtx.wallSegmentCount = 0),
    (runtime.finishWallButton.hidden = true)
}

export function resetCameraView(runtime: StudioAppRuntime) {
  runtime.refreshPreviewScene(), runtime.refreshStudioView()
}
