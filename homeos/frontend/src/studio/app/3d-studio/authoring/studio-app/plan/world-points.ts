import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { clamp as clamp2, nearestWall as nearestWall2 } from '../../../plan/geometry'
import { finite as finite2 } from '../../../loaders/studio-normalization'

export function planToWorldPoint(_runtime: StudioAppRuntime, calibrationFloor: any, planPoint: any) {
  const pixelsPerMeter = calibrationFloor?.scene?.calibration?.pixelsPerMeter || 1,
    localX = (planPoint.x - finite2(calibrationFloor?.originX, 0)) / pixelsPerMeter,
    localY = (planPoint.y - finite2(calibrationFloor?.originY, 0)) / pixelsPerMeter,
    rotationRadians = -ns2.MathUtils.degToRad(finite2(calibrationFloor?.rotation, 0))
  return {
    x: finite2(calibrationFloor?.offsetX, 0) + Math.cos(rotationRadians) * localX + Math.sin(rotationRadians) * localY,
    z: finite2(calibrationFloor?.offsetZ, 0) - Math.sin(rotationRadians) * localX + Math.cos(rotationRadians) * localY,
  }
}

export function worldToPlanPoint(_runtime: StudioAppRuntime, calibrationSourceFloor: any, worldAnchorPoint: any) {
  const inversePixelsPerMeter = calibrationSourceFloor?.scene?.calibration?.pixelsPerMeter || 1,
    inverseRotation = -ns2.MathUtils.degToRad(finite2(calibrationSourceFloor?.rotation, 0)),
    relativeX = worldAnchorPoint.x - finite2(calibrationSourceFloor?.offsetX, 0),
    relativeZ = worldAnchorPoint.z - finite2(calibrationSourceFloor?.offsetZ, 0)
  return {
    x:
      finite2(calibrationSourceFloor?.originX, 0) +
      (Math.cos(inverseRotation) * relativeX - Math.sin(inverseRotation) * relativeZ) * inversePixelsPerMeter,
    y:
      finite2(calibrationSourceFloor?.originY, 0) +
      (Math.sin(inverseRotation) * relativeX + Math.cos(inverseRotation) * relativeZ) * inversePixelsPerMeter,
  }
}

export function worldPointForFloor(
  runtime: StudioAppRuntime,
  sourcePoint: any,
  sourceFloorArg: any,
  calibratedFloor: any,
) {
  return runtime.worldToPlanPoint(calibratedFloor, runtime.planToWorldPoint(sourceFloorArg, sourcePoint))
}

export function getActiveWalls(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.alignmentState) return []
  const ae3 = runtime.getActiveFloor()
  return runtime.appCtx.alignmentState.referenceFloor.scene.walls.map((segmentRecord: any) => ({
    ...segmentRecord,
    start: runtime.worldPointForFloor(segmentRecord.start, runtime.appCtx.alignmentState.referenceFloor, ae3),
    end: runtime.worldPointForFloor(segmentRecord.end, runtime.appCtx.alignmentState.referenceFloor, ae3),
  }))
}

export function startFloorAlign(runtime: StudioAppRuntime) {
  const ae4 = runtime.getActiveFloor(),
    activeFloorSequenceIndex =
      runtime.appCtx.studioProject?.floors.findIndex((activeFloorLookup: any) => activeFloorLookup.id === ae4?.id) ??
      -1,
    previousFloor =
      activeFloorSequenceIndex > 0 ? runtime.appCtx.studioProject.floors[activeFloorSequenceIndex - 1] : null
  if (!(!ae4 || !previousFloor)) {
    if (!ae4.scene.calibration || !previousFloor.scene.calibration) {
      runtime.showToast('当前层和参照层都需要先完成比例校准。', 'error')
      return
    }
    ;(runtime.appCtx.alignmentState = {
      floorId: ae4.id,
      referenceFloor: previousFloor,
      stage: 'reference',
      referencePoint: null as any,
    }),
      runtime.refreshSelection(),
      runtime.selectStudioTool('select'),
      (runtime.planCanvasElement.style.cursor = 'crosshair'),
      runtime.renderFloorList(),
      runtime.refreshStudioView(),
      runtime.showToast('先在半透明的' + previousFloor.name + '上点击一个参照点。')
  }
}

export function cancelFloorAlign(runtime: StudioAppRuntime) {
  runtime.appCtx.alignmentState &&
    ((runtime.appCtx.alignmentState = null),
    (runtime.planCanvasElement.style.cursor = ''),
    runtime.selectStudioTool('select'),
    runtime.renderFloorList(),
    runtime.refreshStudioView(),
    runtime.showToast('已取消楼层对齐。', 'success'))
}

export function isSameAlignmentFloor(runtime: StudioAppRuntime, clickedPlanPoint: any) {
  if (!runtime.appCtx.alignmentState) return false
  const ae5 = runtime.getActiveFloor()
  if (!ae5 || ae5.id !== runtime.appCtx.alignmentState.floorId) return (runtime.cancelFloorAlign(), true)
  if (runtime.appCtx.alignmentState.stage === 'reference') {
    const activeWallList = runtime.getActiveWalls(),
      snappedPoint =
        nearestWall2(clickedPlanPoint, activeWallList, 18 / runtime.appCtx.planView.zoom)?.point || clickedPlanPoint
    return (
      (runtime.appCtx.alignmentState.referencePoint = runtime.worldPointForFloor(
        snappedPoint,
        ae5,
        runtime.appCtx.alignmentState.referenceFloor,
      )),
      (runtime.appCtx.alignmentState.stage = 'current'),
      runtime.renderFloorList(),
      runtime.refreshStudioView(),
      runtime.showToast('现在点击' + ae5.name + '上的同一个位置。'),
      true
    )
  }
  const vector =
      nearestWall2(clickedPlanPoint, ae5.scene.walls, 18 / runtime.appCtx.planView.zoom)?.point || clickedPlanPoint,
    $a2 = runtime.planToWorldPoint(
      runtime.appCtx.alignmentState.referenceFloor,
      runtime.appCtx.alignmentState.referencePoint,
    )
  return (
    (ae5.originX = vector.x),
    (ae5.originY = vector.y),
    (ae5.originInitialized = true),
    (ae5.offsetX = $a2.x),
    (ae5.offsetZ = $a2.z),
    (ae5.rotation = runtime.appCtx.alignmentState.referenceFloor.rotation || 0),
    (ae5.aligned = true),
    (ae5.alignmentPending = false),
    (ae5.alignment = {
      referenceFloorId: runtime.appCtx.alignmentState.referenceFloor.id,
      referencePoint: {
        ...runtime.appCtx.alignmentState.referencePoint,
      },
      currentPoint: {
        ...vector,
      },
    }),
    (runtime.appCtx.alignmentState = null),
    (runtime.planCanvasElement.style.cursor = ''),
    runtime.selectStudioTool('select'),
    runtime.syncGlobalControls(),
    runtime.refreshStudioView(),
    runtime.requestSceneRebuild({
      force: true,
    }),
    runtime.markDocumentDirty(),
    runtime.showToast(ae5.name + '已与下层参照点对齐。', 'success'),
    true
  )
}

export function updatePreviewFloorGap(runtime: StudioAppRuntime) {
  const previewFloorGapSize = clamp2(
    finite2(runtime.previewFloorGapInput.value, runtime.appCtx.studioProject?.previewFloorGap || 3),
    0,
    20,
  )
  Math.abs(previewFloorGapSize - finite2(runtime.appCtx.studioProject?.previewFloorGap, 3)) < 0.000001 ||
    ((runtime.appCtx.studioProject.previewFloorGap = previewFloorGapSize),
    (runtime.previewFloorGapInput.value = previewFloorGapSize.toFixed(1)),
    runtime.rebuildFloorLayers(),
    runtime.markDocumentDirty())
}

export function updateUniformOverviewStack(runtime: StudioAppRuntime) {
  ;(runtime.appCtx.studioProject.uniformOverviewStack = runtime.previewFloorUniformInput.checked),
    runtime.refreshSceneRender({
      scene: true,
    }),
    runtime.markDocumentDirty()
}

export function updateExportFloorGap(runtime: StudioAppRuntime) {
  const exportFloorGap = clamp2(
    finite2(runtime.exportFloorGapInput.value, runtime.appCtx.studioProject?.exportFloorGap || 3),
    0,
    20,
  )
  Math.abs(exportFloorGap - finite2(runtime.appCtx.studioProject?.exportFloorGap, 3)) < 0.000001 ||
    ((runtime.appCtx.studioProject.exportFloorGap = exportFloorGap),
    (runtime.exportFloorGapInput.value = exportFloorGap.toFixed(1)),
    runtime.rebuildFloorLayers(),
    (runtime.exportStatusElement.textContent = '全楼层间距已设为 ' + exportFloorGap.toFixed(1) + ' m'),
    runtime.markDocumentDirty())
}

export function floorElevationFor(runtime: StudioAppRuntime, elevationFloorRef: any) {
  if (runtime.getPreviewFloorMode() !== 'all') return 0
  const elevationFloorIndex = runtime.appCtx.studioProject.floors.findIndex(
    (elevationFloorMatch: any) => elevationFloorMatch.id === elevationFloorRef?.id,
  )
  return Math.max(elevationFloorIndex, 0) * finite2(runtime.appCtx.studioProject.exportFloorGap, 3)
}
