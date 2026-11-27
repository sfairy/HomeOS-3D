import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { distance as distance2, pointInRotatedRectangle as pointInRotatedRectangle2 } from '../plan/geometry'
import { isCourtyardDrawing as isCourtyardDrawing2 } from '../loaders/studio-normalization'
import {
  itemPlanFootprint as itemPlanFootprint2,
  itemPlanFootprintCenter as itemPlanFootprintCenter2,
  itemWithPlanFootprint as itemWithPlanFootprint2,
} from '../items/studio-item-posture'
import { isPointInBounds, boundsIntersectSegment } from '../geometry'

/**
 * 3D 视口编辑的几何计算（0.8.7 `studio-editor-3d.js` 中 `verticalRayParameter` /
 * `snapEditorElevation` / `projectedHeightHandle` 的对应实现）。
 *
 * 全部是纯函数：输入射线 / 平面 / 屏幕坐标，输出世界坐标或角度。
 * 交互层（`editor-3d-overlay.ts`）只负责事件与 DOM，几何错误不会藏在事件回调里。
 */

export type Vec3 = { x: number; y: number; z: number }
export type Ray = { origin: Vec3; direction: Vec3 }

/** 世界坐标（米）↔ 平面像素：原点与比例尺由 `createFloorWorldMapper` 给。 */
export interface PlanMapper {
  pixelsPerMeter: number
  origin: { x: number; y: number }
}

export function worldToPlan(mapper: PlanMapper, worldX: number, worldZ: number): { x: number; y: number } {
  return {
    x: worldX * mapper.pixelsPerMeter + mapper.origin.x,
    y: worldZ * mapper.pixelsPerMeter + mapper.origin.y,
  }
}

/** 射线与水平面 `y = planeY` 的交点；射线平行于平面或交点在背后时返回 `null`。 */
export function groundPointFromRay(ray: Ray, planeY: number): Vec3 | null {
  const directionY = ray.direction.y
  if (Math.abs(directionY) < 1e-6) return null
  const t = (planeY - ray.origin.y) / directionY
  if (!Number.isFinite(t) || t <= 0) return null
  return {
    x: ray.origin.x + ray.direction.x * t,
    y: planeY,
    z: ray.origin.z + ray.direction.z * t,
  }
}

function dotProduct(first: Vec3, second: Vec3): number {
  return first.x * second.x + first.y * second.y + first.z * second.z
}

/**
 * 射线与「过 `point`、方向为 `axis`」的直线最近点的参数（直线上的 t）。
 *
 * 轴与射线几乎平行时返回 `null`：那时整条轴退化成屏幕上的一个点，
 * 任何屏幕位移都对应无穷大的世界位移，拖动会直接飞掉。
 */
export function axisRayParameter(ray: Ray, point: Vec3, axis: Vec3): number | null {
  const along = dotProduct(ray.direction, axis)
  const denominator = 1 - along * along
  if (denominator < 0.00001) return null
  const offset = { x: point.x - ray.origin.x, y: point.y - ray.origin.y, z: point.z - ray.origin.z }
  return (along * dotProduct(ray.direction, offset) - dotProduct(axis, offset)) / denominator
}

/**
 * 离地高度手柄用的「竖直射线参数」（0.8.7 `verticalRayParameter`）。
 *
 * 手柄在屏幕上上下拖，但物件在世界上只能沿 Y 移动；把指针射线投影到过物件的竖直轴上，
 * 取参数差就是世界高度差。早期版本投影到「朝向相机的竖直平面」，相机接近俯视时平面
 * 与视线几乎平行，参数会剧烈放大 —— 这是「抬高时物件突然飞到天花板」的根因。
 */
export function verticalRayParameter(ray: Ray, point: Vec3): number | null {
  return axisRayParameter(ray, point, { x: 0, y: 1, z: 0 })
}

/** 世界高度 → 状态里的 `elevation`（米）。两者同量纲，保留函数是为了语义清楚。 */
export function elevationFromWorldY(worldY: number): number {
  return worldY
}

export type ElevationTarget = { value: number; label: string }

export type SnapElevationInput = {
  /** 未吸附的目标高度（米）。 */
  raw: number
  /** 拖动开始时的原始高度：按步长取整时以它为基准，避免累积误差。 */
  original: number
  minimum?: number
  maximum?: number
  /** 步长（米）；`0` 表示不量化。 */
  step?: number
  /** 吸附目标（贴合地面 / 落台 …），优先于步长。 */
  targets?: ElevationTarget[]
  /** 目标的吸附容差（米）。 */
  tolerance?: number
}

/**
 * 把离地高度吸附到「目标 > 步长 > 原值」。
 *
 * 目标优先且只在容差内命中：用户把物件拖到桌面上方 2cm 时应该落到桌面，
 * 拖到离桌面 40cm 时不该被吸过去。
 */
export function snapEditorElevation({
  raw,
  original,
  minimum = 0,
  maximum = 6,
  step = 0.05,
  targets = [],
  tolerance = 0,
}: SnapElevationInput): { value: number; label: string } {
  let value = raw
  let label = ''
  const nearest = targets
    .filter(
      (target) =>
        Number.isFinite(target.value) &&
        target.value >= minimum &&
        target.value <= maximum &&
        Math.abs(target.value - raw) <= tolerance,
    )
    .sort((first, second) => Math.abs(first.value - raw) - Math.abs(second.value - raw))[0]
  if (nearest) {
    value = nearest.value
    label = nearest.label
  } else if (step > 0) {
    value = Number((original + Math.round((raw - original) / step) * step).toFixed(12))
  }
  return { value: Math.max(minimum, Math.min(maximum, value)), label }
}

/** 旋转吸附：默认 15°，按住 Shift 关闭。 */
export function snapEditorRotation(degrees: number, step = 15, enabled = true): number {
  if (!enabled) return ((degrees % 360) + 360) % 360
  return (((Math.round(degrees / step) * step) % 360) + 360) % 360
}

/**
 * 高度手柄的屏幕几何：`base` 是物件顶面中心的投影，`tip` 是同一位置抬高 30px
 * 对应世界高度后的投影。
 *
 * @returns `angle`（弧度，0 = 正上方）与 `length`（像素）；长度小于 14px 时返回 `null`
 *          —— 手柄短到这个程度已经点不中，显示出来只会挡住物件。
 */
export function projectedHeightHandle(
  base: { x: number; y: number } | null,
  tip: { x: number; y: number } | null,
): { angle: number; length: number; tip: { x: number; y: number } } | null {
  if (!base || !tip) return null
  const deltaX = tip.x - base.x
  const deltaY = tip.y - base.y
  const length = Math.hypot(deltaX, deltaY)
  if (!Number.isFinite(length) || length < 14) return null
  return { angle: Math.atan2(deltaX, -deltaY), length, tip: { x: tip.x, y: tip.y } }
}

/**
 * 两个世界点在屏幕上的距离（像素）——「这个方向上 1m 等于多少 px」的通用换算。
 *
 * 相机右向与竖直方向的尺度**不同**：俯视时竖直方向几乎退化成 0，而右向不变。
 * 离地吸附容差必须用竖直方向（0.8.7 `gS()` 的 `point + (0,1,0)`），
 * 高度手柄臂长却用右向（`fS()`），混用会让吸附半径差好几倍。
 *
 * 任一投影失败（点在相机背后）返回 0，由调用方按「不可用」处理。
 */
export function projectedPixelsPerMeter(
  project: (world: Vec3) => { x: number; y: number } | null,
  from: Vec3,
  to: Vec3,
): number {
  const start = project(from)
  const end = project(to)
  if (!start || !end) return 0
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  return Number.isFinite(distance) ? distance : 0
}

/** 屏幕坐标 → 归一化设备坐标（-1..1，Y 轴翻转）。 */ export function screenToNdc(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
    y: -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
  }
}

/**
 * 旋转控制只认圆点（0.8.7 的 `9/zoom` 命中半径）。
 *
 * 上一版把整圈都当成命中带（并因此画了一圈旋转环），但 0.8.7 的旋转控制是
 * 「顶边引线 + 一个半径 3.5 的圆点」：环上任意位置可抓会让用户点在本体附近
 * 就被切进旋转，和「拖本体=移动」冲突。
 */
function hitsRotationControl(
  handles: { rotationHandle: { x: number; y: number } },
  pointerPoint: { x: number; y: number },
  hitRadius: number,
): boolean {
  return distance2(pointerPoint, handles.rotationHandle) <= hitRadius
}

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
  if (hitsRotationControl(ky2, pointerPoint, handleHitRadius))
    return {
      type: 'rotate-item',
      item: at3,
      controls: ky2,
    }
  // 0.8.7：短边不足 18 屏幕像素时收起缩放手柄（旋转圆点仍然可抓）。
  if (Math.min(at3.width, at3.depth) * runtime.getPixelsPerMeter() * runtime.appCtx.planView.zoom < 18) return null
  const hitCorner = ky2.corners.find(
    (cornerCandidate: any) => distance2(pointerPoint, cornerCandidate.point) <= handleHitRadius,
  )
  if (hitCorner)
    return {
      type: 'resize-item',
      item: at3,
      controls: ky2,
      corner: hitCorner,
    }
  // 0.8.7：边中点手柄 —— 只改宽度或只改深度（角手柄是两维一起改）；风扇不画边手柄。
  const edgeHandles = at3.type === 'fan' ? [] : (ky2.edges as Array<{ point: { x: number; y: number } }>)
  const hitEdge = edgeHandles.find((edgeCandidate) => distance2(pointerPoint, edgeCandidate.point) <= handleHitRadius)
  return hitEdge
    ? {
        type: 'resize-item',
        item: at3,
        controls: ky2,
        edge: hitEdge,
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
