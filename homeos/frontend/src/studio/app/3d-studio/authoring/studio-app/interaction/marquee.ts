import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { distance as distance2, pointInRotatedRectangle as pointInRotatedRectangle2 } from '../../../plan/geometry'
import { isCourtyardDrawing as isCourtyardDrawing2 } from '../../../loaders/studio-normalization'
import {
  itemPlanFootprint as itemPlanFootprint2,
  itemPlanFootprintCenter as itemPlanFootprintCenter2,
  itemWithPlanFootprint as itemWithPlanFootprint2,
} from '../../items/studio-item-posture'
import { isPointInBounds } from '../geometry/bounds'
import { boundsIntersectSegment } from '../geometry/bounds'

export function hitTestHandle(runtime: StudioAppRuntime, pointerPoint: any) {
  if (
    runtime.appCtx.activeToolName !== 'select' ||
    runtime.appCtx.selectedItem?.kind !== 'item' ||
    runtime.appCtx.selectedItems.length
  )
    return null
  const at3 = runtime.getSelectedObject()
  if (!at3 || isCourtyardDrawing2(at3)) return null
  const ky2 = runtime.buildHandleGeometry(at3),
    handleHitRadius = 9 / Math.max(runtime.appCtx.planView.zoom, 0.01)
  if (distance2(pointerPoint, ky2.rotationHandle) <= handleHitRadius)
    return {
      type: 'rotate-item',
      item: at3,
      controls: ky2,
    }
  if (
    at3.type === 'smart-socket-86' &&
    Math.min(at3.width, at3.depth) * runtime.getPixelsPerMeter() * runtime.appCtx.planView.zoom < 18
  )
    return null
  const hitCorner = ky2.corners.find(
    (cornerCandidate: any) => distance2(pointerPoint, cornerCandidate.point) <= handleHitRadius,
  )
  return hitCorner
    ? {
        type: 'resize-item',
        item: at3,
        controls: ky2,
        corner: hitCorner,
      }
    : null
}

export function boundsFromCorners(_runtime: StudioAppRuntime, cornerA: any, cornerB: any) {
  return {
    minX: Math.min(cornerA.x, cornerB.x),
    minY: Math.min(cornerA.y, cornerB.y),
    maxX: Math.max(cornerA.x, cornerB.x),
    maxY: Math.max(cornerA.y, cornerB.y),
  }
}

export function marqueeDelta(runtime: StudioAppRuntime, marqueeStartPoint: any, marqueeCurrentPoint: any) {
  const ry2 = runtime.boundsFromCorners(marqueeStartPoint, marqueeCurrentPoint),
    scenePixelsPerMeter = runtime.getPixelsPerMeter() || 100,
    intersectingWalls: any[] = []
  if (!(runtime.appCtx.activeLibraryCategory === 'light') && runtime.appCtx.activeLibraryCategory !== 'courtyard') {
    for (const wallHit of runtime.appCtx.studioState.walls)
      boundsIntersectSegment(wallHit.start, wallHit.end, ry2) &&
        intersectingWalls.push({
          kind: 'wall',
          id: wallHit.id,
        })
    for (const windowHit of runtime.appCtx.studioState.windows) {
      const xo4 = runtime.wallWindowSpan(windowHit)
      xo4 &&
        boundsIntersectSegment(xo4.start, xo4.end, ry2) &&
        intersectingWalls.push({
          kind: 'window',
          id: windowHit.id,
        })
    }
    for (const doorHit of runtime.appCtx.studioState.doors) {
      const xo5 = runtime.wallWindowSpan(doorHit)
      xo5 &&
        boundsIntersectSegment(xo5.start, xo5.end, ry2) &&
        intersectingWalls.push({
          kind: 'door',
          id: doorHit.id,
        })
    }
    for (const railingHit of runtime.appCtx.studioState.railings) {
      const xo6 = runtime.wallWindowSpan(railingHit)
      xo6 &&
        boundsIntersectSegment(xo6.start, xo6.end, ry2) &&
        intersectingWalls.push({
          kind: 'railing',
          id: railingHit.id,
        })
    }
  }
  const marqueeCorners = [
    {
      x: ry2.minX,
      y: ry2.minY,
    },
    {
      x: ry2.maxX,
      y: ry2.minY,
    },
    {
      x: ry2.maxX,
      y: ry2.maxY,
    },
    {
      x: ry2.minX,
      y: ry2.maxY,
    },
  ]
  for (const itemBoundsRecord of runtime.appCtx.studioState.items) {
    if (!runtime.isPlanItemVisible(itemBoundsRecord)) continue
    const itemRotationRad = (itemBoundsRecord.rotation * Math.PI) / 180,
      cos2 = Math.cos(itemRotationRad),
      sin2 = Math.sin(itemRotationRad),
      itemBoundsFootprint = itemPlanFootprint2(itemBoundsRecord),
      itemBoundsCenter = itemPlanFootprintCenter2(itemBoundsRecord, scenePixelsPerMeter),
      halfWidthPx = (itemBoundsFootprint.width * scenePixelsPerMeter) / 2,
      halfDepthPx = (itemBoundsFootprint.depth * scenePixelsPerMeter) / 2,
      itemCornerPoints = [
        [-halfWidthPx, -halfDepthPx],
        [halfWidthPx, -halfDepthPx],
        [halfWidthPx, halfDepthPx],
        [-halfWidthPx, halfDepthPx],
      ].map(([cornerLocalX, cornerLocalY]) => ({
        // 角点按**占位盒中心**算：半圆柱 / 四分之一圆柱的锚点在圆弧圆心，不在框中心。
        x: itemBoundsCenter.x + cornerLocalX * cos2 - cornerLocalY * sin2,
        y: itemBoundsCenter.y + cornerLocalX * sin2 + cornerLocalY * cos2,
      }))
    ;(isPointInBounds(itemBoundsCenter, ry2) ||
      itemCornerPoints.some((cornerPoint) => isPointInBounds(cornerPoint, ry2)) ||
      marqueeCorners.some((cornerTestPoint) =>
        pointInRotatedRectangle2(
          cornerTestPoint,
          itemWithPlanFootprint2(itemBoundsRecord, scenePixelsPerMeter),
          scenePixelsPerMeter,
        ),
      )) &&
      intersectingWalls.push({
        kind: 'item',
        id: itemBoundsRecord.id,
      })
  }
  return intersectingWalls
}

export function updateMarqueeOverlay(runtime: StudioAppRuntime) {
  return !runtime.planCanvasElement.width || !runtime.planCanvasElement.height || !runtime.overlayCanvasRenderer
    ? false
    : (runtime.overlayCanvasElement.width !== runtime.planCanvasElement.width &&
        (runtime.overlayCanvasElement.width = runtime.planCanvasElement.width),
      runtime.overlayCanvasElement.height !== runtime.planCanvasElement.height &&
        (runtime.overlayCanvasElement.height = runtime.planCanvasElement.height),
      runtime.overlayCanvasRenderer.setTransform(1, 0, 0, 1, 0, 0),
      runtime.overlayCanvasRenderer.clearRect(
        0,
        0,
        runtime.overlayCanvasElement.width,
        runtime.overlayCanvasElement.height,
      ),
      runtime.overlayCanvasRenderer.drawImage(runtime.planCanvasElement, 0, 0),
      true)
}

export function drawMarqueeOverlay(
  runtime: StudioAppRuntime,
  { offsetX: overlayDrawX = 0, offsetY: overlayDrawY = 0 } = {},
) {
  if (
    !runtime.overlayCanvasElement.width ||
    !runtime.overlayCanvasElement.height ||
    runtime.overlayCanvasElement.width !== runtime.planCanvasElement.width ||
    runtime.overlayCanvasElement.height !== runtime.planCanvasElement.height
  )
    return false
  const overlayScaleX = runtime.planCanvasElement.width / Math.max(runtime.appCtx.planViewWidth, 1),
    overlayScaleY = runtime.planCanvasElement.height / Math.max(runtime.appCtx.planViewHeight, 1)
  return (
    runtime.planCanvasRenderer.save(),
    runtime.planCanvasRenderer.setTransform(1, 0, 0, 1, 0, 0),
    (runtime.planCanvasRenderer.fillStyle = '#0d1319'),
    runtime.planCanvasRenderer.fillRect(0, 0, runtime.planCanvasElement.width, runtime.planCanvasElement.height),
    runtime.planCanvasRenderer.drawImage(
      runtime.overlayCanvasElement,
      Math.round(overlayDrawX * overlayScaleX),
      Math.round(overlayDrawY * overlayScaleY),
    ),
    runtime.planCanvasRenderer.restore(),
    true
  )
}

export function renderPlanScene(runtime: StudioAppRuntime) {
  if (runtime.appCtx.marqueeBox?.type !== 'marquee') return
  const zr4 = runtime.planToScreen(runtime.appCtx.marqueeBox.start),
    zr5 = runtime.planToScreen(runtime.appCtx.marqueeBox.current),
    marqueeLeft = Math.min(zr4.x, zr5.x),
    marqueeTop = Math.min(zr4.y, zr5.y),
    abs = Math.abs(zr5.x - zr4.x),
    abs2 = Math.abs(zr5.y - zr4.y)
  runtime.planCanvasRenderer.save(),
    runtime.planCanvasRenderer.translate(runtime.appCtx.planViewWidth / 2, runtime.appCtx.planViewHeight / 2),
    runtime.planCanvasRenderer.rotate((runtime.appCtx.planView.rotation * Math.PI) / 180),
    runtime.planCanvasRenderer.translate(-runtime.appCtx.planViewWidth / 2, -runtime.appCtx.planViewHeight / 2),
    (runtime.planCanvasRenderer.fillStyle = 'rgba(255, 157, 46, .10)'),
    (runtime.planCanvasRenderer.strokeStyle = 'rgba(255, 176, 74, .92)'),
    (runtime.planCanvasRenderer.lineWidth = 1),
    runtime.planCanvasRenderer.setLineDash([6, 4]),
    runtime.planCanvasRenderer.fillRect(marqueeLeft, marqueeTop, abs, abs2),
    runtime.planCanvasRenderer.strokeRect(
      marqueeLeft + 0.5,
      marqueeTop + 0.5,
      Math.max(abs - 1, 0),
      Math.max(abs2 - 1, 0),
    ),
    runtime.planCanvasRenderer.restore()
}

export function getSelectedObject(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.selectedItem) return null
  const selectedObjectRecord = (
    (
      {
        wall: runtime.appCtx.studioState.walls,
        window: runtime.appCtx.studioState.windows,
        door: runtime.appCtx.studioState.doors,
        railing: runtime.appCtx.studioState.railings,
        item: runtime.appCtx.studioState.items,
      } as any
    )[runtime.appCtx.selectedItem.kind] || []
  ).find((selectedMatch: any) => selectedMatch.id === runtime.appCtx.selectedItem.id)
  return (selectedObjectRecord || (runtime.appCtx.selectedItem = null), selectedObjectRecord || null)
}
