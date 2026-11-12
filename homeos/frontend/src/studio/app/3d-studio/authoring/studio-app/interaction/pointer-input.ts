import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { restorePlacementScene as restorePlacementScene2 } from '../../items/studio-placement'
import { anchorGate as anchorGate2 } from '../../../plan/courtyard-drawing'
import {
  axisLockedPoint as axisLockedPoint2,
  clampWindowT as clampWindowT2,
  nearestWall as nearestWall2,
} from '../../../plan/geometry'
import { itemTypeCatalog } from '../../items/item-catalog'
import { doorTypeCatalog } from '../../scene/payload/studio-scene-payload'

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
          runtime.planCanvasElement.style.cursor =
            df2?.type === 'rotate-item' ? 'grab' : df2?.type === 'resize-item' ? 'nwse-resize' : ''
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
  ;(runtime.appCtx.marqueeBox = null),
    activeDragGesture.type === 'pan' && runtime.refreshStudioView(),
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
