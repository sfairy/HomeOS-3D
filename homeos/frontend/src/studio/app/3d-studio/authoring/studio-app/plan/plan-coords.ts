import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { sceneContentBounds as sceneContentBounds2 } from '../../../plan/courtyard-drawing'
import {
  clamp as clamp2,
  clampWindowT as clampWindowT2,
  closedWallFloorPolygons as closedWallFloorPolygons2,
  unclosedWallEndpoints as unclosedWallEndpoints2,
  wallIntersections as wallIntersections2,
  wallJoinExtensions as wallJoinExtensions2,
} from '../../../plan/geometry'
import {
  itemPlanFootprint as itemPlanFootprint2,
  itemPlanFootprintOffset as itemPlanFootprintOffset2,
} from '../../items/studio-item-posture'
import type { PlanEditPreviewFlags } from '../../types/studio-app-types'

export function planToScreen(runtime: StudioAppRuntime, planPointInput: any) {
  return {
    x: planPointInput.x * runtime.appCtx.planView.zoom + runtime.appCtx.planView.offsetX,
    y: planPointInput.y * runtime.appCtx.planView.zoom + runtime.appCtx.planView.offsetY,
  }
}

export function screenToPlanPoint(runtime: StudioAppRuntime, screenPointInput: any) {
  const halfViewWidth = runtime.appCtx.planViewWidth / 2,
    halfViewHeight = runtime.appCtx.planViewHeight / 2,
    viewRotationRadians = (-runtime.appCtx.planView.rotation * Math.PI) / 180,
    cos = Math.cos(viewRotationRadians),
    sin = Math.sin(viewRotationRadians),
    centeredX = screenPointInput.x - halfViewWidth,
    centeredY = screenPointInput.y - halfViewHeight
  return {
    x: halfViewWidth + centeredX * cos - centeredY * sin,
    y: halfViewHeight + centeredX * sin + centeredY * cos,
  }
}

export function screenToPlan(runtime: StudioAppRuntime, screenPoint: any) {
  const nl2 = runtime.screenToPlanPoint(screenPoint)
  return {
    x: (nl2.x - runtime.appCtx.planView.offsetX) / runtime.appCtx.planView.zoom,
    y: (nl2.y - runtime.appCtx.planView.offsetY) / runtime.appCtx.planView.zoom,
  }
}

export function eventToLocalPoint(runtime: StudioAppRuntime, pointerEventArg: any) {
  const boundingClientRect = runtime.planCanvasElement.getBoundingClientRect()
  return {
    x: pointerEventArg.clientX - boundingClientRect.left,
    y: pointerEventArg.clientY - boundingClientRect.top,
  }
}

export function getCanvasSize(runtime: StudioAppRuntime) {
  return sceneContentBounds2(runtime.appCtx.studioState)
}

export function resetView(runtime: StudioAppRuntime) {
  const ey2 = runtime.getCanvasSize(),
    viewPadding = clamp2(Math.min(runtime.appCtx.planViewWidth, runtime.appCtx.planViewHeight) * 0.045, 18, 34),
    availableWidth = Math.max(runtime.appCtx.planViewWidth - viewPadding * 2, 80),
    availableHeight = Math.max(runtime.appCtx.planViewHeight - viewPadding * 2, 80),
    isQuarterTurn = Math.abs(runtime.appCtx.planView.rotation / 90) % 2 === 1,
    height2 = isQuarterTurn ? ey2.height : ey2.width,
    width2 = isQuarterTurn ? ey2.width : ey2.height
  ;(runtime.appCtx.planView.zoom = clamp2(Math.min(availableWidth / height2, availableHeight / width2), 0.03, 8)),
    (runtime.appCtx.planView.offsetX =
      runtime.appCtx.planViewWidth / 2 - (ey2.minX + ey2.width / 2) * runtime.appCtx.planView.zoom),
    (runtime.appCtx.planView.offsetY =
      runtime.appCtx.planViewHeight / 2 - (ey2.minY + ey2.height / 2) * runtime.appCtx.planView.zoom),
    (runtime.appCtx.isAutoFitRequested = true),
    runtime.refreshStudioView()
}

export function zoomByScale(
  runtime: StudioAppRuntime,
  zoomScale: any,
  zoomScreenPoint = {
    x: runtime.appCtx.planViewWidth / 2,
    y: runtime.appCtx.planViewHeight / 2,
  },
) {
  const pr2 = runtime.screenToPlan(zoomScreenPoint),
    nl3 = runtime.screenToPlanPoint(zoomScreenPoint)
  ;(runtime.appCtx.planView.zoom = clamp2(runtime.appCtx.planView.zoom * zoomScale, 0.03, 12)),
    (runtime.appCtx.planView.offsetX = nl3.x - pr2.x * runtime.appCtx.planView.zoom),
    (runtime.appCtx.planView.offsetY = nl3.y - pr2.y * runtime.appCtx.planView.zoom),
    runtime.refreshStudioView()
}

export function rotatePlanView(runtime: StudioAppRuntime) {
  ;(runtime.appCtx.planView.rotation = (runtime.appCtx.planView.rotation + 90) % 360),
    (runtime.appCtx.studioState.settings.planViewRotation = runtime.appCtx.planView.rotation),
    runtime.resetView(),
    runtime.markDocumentDirty()
}

export function resizePlanStage(runtime: StudioAppRuntime) {
  const planStageRect = runtime.planStageElement.getBoundingClientRect()
  ;(runtime.appCtx.planViewWidth = Math.max(Math.round(planStageRect.width), 1)),
    (runtime.appCtx.planViewHeight = Math.max(Math.round(planStageRect.height), 1))
  const min = Math.min(window.devicePixelRatio || 1, 2)
  ;(runtime.planCanvasElement.width = Math.round(runtime.appCtx.planViewWidth * min)),
    (runtime.planCanvasElement.height = Math.round(runtime.appCtx.planViewHeight * min)),
    runtime.planCanvasRenderer.setTransform(min, 0, 0, min, 0, 0),
    runtime.appCtx.isAutoFitRequested ? runtime.refreshStudioView() : runtime.resetView()
}

export function buildSnapIndex(runtime: StudioAppRuntime, snapTolerancePx: any) {
  const snapTolerance = Math.max(1, snapTolerancePx * 0.01),
    join = runtime.appCtx.studioState.walls
      .map(
        (snapWallRecord) =>
          snapWallRecord.id +
          ',' +
          snapWallRecord.start.x +
          ',' +
          snapWallRecord.start.y +
          ',' +
          snapWallRecord.end.x +
          ',' +
          snapWallRecord.end.y +
          ',' +
          snapWallRecord.thickness +
          ',' +
          (snapWallRecord.allowOpenEnd === true ? 1 : 0),
      )
      .join(';')
  let cachedSnapIndex = runtime.wallJoinCacheByWall.get(runtime.appCtx.studioState)
  return (
    (!cachedSnapIndex || cachedSnapIndex.signature !== snapTolerance + '|' + join) &&
      ((cachedSnapIndex = {
        signature: snapTolerance + '|' + join,
        tolerance: snapTolerance,
        floorPolygons: null as any,
        intersections: null as any,
        joinExtensions: null as any,
        unclosedEndpoints: null as any,
      }),
      runtime.wallJoinCacheByWall.set(runtime.appCtx.studioState, cachedSnapIndex)),
    cachedSnapIndex
  )
}

export function closedWallLoops(runtime: StudioAppRuntime, wallLoopList: any) {
  const _l2 = runtime.buildSnapIndex(wallLoopList)
  return (
    (_l2.floorPolygons ||= closedWallFloorPolygons2(runtime.appCtx.studioState.walls, _l2.tolerance)), _l2.floorPolygons
  )
}

export function computeWallIntersections(runtime: StudioAppRuntime, intersectWallList: any) {
  const _l3 = runtime.buildSnapIndex(intersectWallList)
  return ((_l3.intersections ||= wallIntersections2(runtime.appCtx.studioState.walls)), _l3.intersections)
}

export function computeSurfaceExclusions(runtime: StudioAppRuntime, exclusionWallList: any) {
  const _l4 = runtime.buildSnapIndex(exclusionWallList)
  return ((_l4.joinExtensions ||= wallJoinExtensions2(runtime.appCtx.studioState.walls)), _l4.joinExtensions)
}

export function computeWallPolygons(runtime: StudioAppRuntime, polygonWallList: any) {
  const _l5 = runtime.buildSnapIndex(polygonWallList)
  return (
    (_l5.unclosedEndpoints ||= unclosedWallEndpoints2(
      runtime.appCtx.studioState.walls,
      _l5.tolerance,
      runtime.closedWallLoops(polygonWallList),
    )),
    _l5.unclosedEndpoints
  )
}

export function wallWindowSpan(runtime: StudioAppRuntime, windowRecord: any) {
  const owningWall = runtime.appCtx.studioState.walls.find((wallMatch) => wallMatch.id === windowRecord.wallId)
  if (!owningWall) return null
  const wallDeltaX = owningWall.end.x - owningWall.start.x,
    wallDeltaY = owningWall.end.y - owningWall.start.y,
    hypot = Math.hypot(wallDeltaX, wallDeltaY)
  if (!hypot) return null
  const windowClampT = clampWindowT2(owningWall, windowRecord, runtime.getPixelsPerMeter() || 1),
    windowCenterPoint = {
      x: owningWall.start.x + wallDeltaX * windowClampT,
      y: owningWall.start.y + wallDeltaY * windowClampT,
    },
    windowHalfWidth = Math.min((windowRecord.width * (runtime.getPixelsPerMeter() || 1)) / 2, hypot / 2),
    wallUnitVector = {
      x: wallDeltaX / hypot,
      y: wallDeltaY / hypot,
    }
  return {
    wall: owningWall,
    center: windowCenterPoint,
    start: {
      x: windowCenterPoint.x - wallUnitVector.x * windowHalfWidth,
      y: windowCenterPoint.y - wallUnitVector.y * windowHalfWidth,
    },
    end: {
      x: windowCenterPoint.x + wallUnitVector.x * windowHalfWidth,
      y: windowCenterPoint.y + wallUnitVector.y * windowHalfWidth,
    },
    unit: wallUnitVector,
  }
}

export function drawRailing(runtime: StudioAppRuntime, railingRecord: any, railingView: PlanEditPreviewFlags = {}) {
  const xo2 = runtime.wallWindowSpan(railingRecord)
  if (!xo2) return
  const railingSelected = runtime.createSelectionRef('railing', railingRecord.id),
    railingColor = railingView.preview ? 'rgba(123, 220, 240, .72)' : railingSelected ? '#ffaf46' : '#8bd7e8',
    railingLineWidth = Math.max(
      10,
      xo2.wall.thickness * (runtime.getPixelsPerMeter() || 100) * runtime.appCtx.planView.zoom + 5,
    )
  runtime.drawGuideSegment(xo2.start, xo2.end, {
    color: 'rgba(7, 16, 21, .94)',
    width: railingLineWidth,
    cap: 'butt',
  }),
    runtime.drawGuideSegment(xo2.start, xo2.end, {
      color: railingColor,
      width: railingSelected ? 5 : 3,
      cap: 'butt',
    }),
    runtime.drawGuideSegment(xo2.start, xo2.end, {
      color: 'rgba(224, 250, 255, .72)',
      width: 1,
      cap: 'butt',
    }),
    runtime.drawPointMarker(xo2.start, railingColor, railingSelected ? 3 : 2),
    runtime.drawPointMarker(xo2.end, railingColor, railingSelected ? 3 : 2),
    railingSelected &&
      !railingView.preview &&
      runtime.drawLabelText(xo2.center, '玻璃栏杆 · ' + railingRecord.width.toFixed(2) + ' m', '#8bd7e8')
}

/** 抬亮上限：抬到这个比例还没达标就认了，免得把颜色冲成纯白、丢掉档位辨识度。 */

/** WCAG 口径的相对亮度（sRGB → 线性）。 */

/** 平面图这扇门用哪块料代表（取「最占视线」的部件； */

/** 平面图门色：**与 3D 同一条取色链**（档位配方 → 主题键 → 逐门覆盖色）。 */
export function rotateLocalPoint(_runtime: StudioAppRuntime, originPoint: any, localOffsetX: any, localOffsetY: any) {
  const rotationRad = ((Number(originPoint.rotation) || 0) * Math.PI) / 180
  return {
    x: originPoint.x + localOffsetX * Math.cos(rotationRad) - localOffsetY * Math.sin(rotationRad),
    y: originPoint.y + localOffsetX * Math.sin(rotationRad) + localOffsetY * Math.cos(rotationRad),
  }
}

export function buildHandleGeometry(runtime: StudioAppRuntime, geometryItem: any) {
  const handlePixelsPerMeter = runtime.getPixelsPerMeter() || 100,
    handleFootprint = itemPlanFootprint2(geometryItem),
    /** 占位盒中心相对锚点的局部偏移（米 → 像素）：半圆柱 / 四分之一圆柱的锚点在圆弧圆心。 */
    handleFootprintOffset = itemPlanFootprintOffset2(geometryItem),
    handleCenterX = handleFootprintOffset.x * handlePixelsPerMeter,
    handleCenterY = handleFootprintOffset.y * handlePixelsPerMeter,
    halfItemWidth = (handleFootprint.width * handlePixelsPerMeter) / 2,
    halfItemDepth = (handleFootprint.depth * handlePixelsPerMeter) / 2
  return {
    corners: [
      {
        x: -1,
        y: -1,
      },
      {
        x: 1,
        y: -1,
      },
      {
        x: 1,
        y: 1,
      },
      {
        x: -1,
        y: 1,
      },
    ].map((handleDirections) => ({
      ...handleDirections,
      point: runtime.rotateLocalPoint(
        geometryItem,
        handleCenterX + handleDirections.x * halfItemWidth,
        handleCenterY + handleDirections.y * halfItemDepth,
      ),
      opposite: runtime.rotateLocalPoint(
        geometryItem,
        handleCenterX - handleDirections.x * halfItemWidth,
        handleCenterY - handleDirections.y * halfItemDepth,
      ),
    })),
    rotationStem: runtime.rotateLocalPoint(geometryItem, handleCenterX, handleCenterY - halfItemDepth),
    rotationHandle: runtime.rotateLocalPoint(
      geometryItem,
      handleCenterX,
      handleCenterY - halfItemDepth - 17 / Math.max(runtime.appCtx.planView.zoom, 0.01),
    ),
  }
}
