/**
 * 平面几何原语：点距、点到线段投影、线段求交、二维向量辅助。
 *
 * 从 `geometry.ts` 拆出（纯移动）。这三个函数同时被 `geometry.ts`（墙体/吸附）与
 * `geometry-polygons.ts`（多边形布尔运算）使用；放在独立模块里是为了让两个上层模块
 * 都向下依赖它，而不是互相 import 形成环 —— 跨 chunk 的循环 import 会让被 import 的
 * `const` 在初始化前读到 undefined（仓库里 `shared-registry` 分包的注释记录过这类黑屏）。
 */
import { clamp } from './geometry-clamp'

export { clamp } from './geometry-clamp'

export function distance(firstPoint: any, secondPoint: any) {
  return Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y)
}
export function projectPointToSegment(point: any, segmentStart: any, segmentEnd: any) {
  const segmentDeltaX = segmentEnd.x - segmentStart.x,
    segmentDeltaY = segmentEnd.y - segmentStart.y,
    segmentLengthSquared = segmentDeltaX * segmentDeltaX + segmentDeltaY * segmentDeltaY
  if (segmentLengthSquared <= 1e-7)
    return {
      point: {
        ...segmentStart,
      },
      t: 0,
      distance: distance(point, segmentStart),
    }
  const projectionRatio = clamp(
      ((point.x - segmentStart.x) * segmentDeltaX + (point.y - segmentStart.y) * segmentDeltaY) / segmentLengthSquared,
      0,
      1,
    ),
    projectedPoint = {
      x: segmentStart.x + segmentDeltaX * projectionRatio,
      y: segmentStart.y + segmentDeltaY * projectionRatio,
    }
  return {
    point: projectedPoint,
    t: projectionRatio,
    distance: distance(point, projectedPoint),
  }
}

export function segmentIntersection(firstStart: any, firstEnd: any, secondStart: any, secondEnd: any) {
  const firstDeltaX = firstEnd.x - firstStart.x,
    firstDeltaY = firstEnd.y - firstStart.y,
    secondDeltaX = secondEnd.x - secondStart.x,
    secondDeltaY = secondEnd.y - secondStart.y,
    crossProduct = firstDeltaX * secondDeltaY - firstDeltaY * secondDeltaX
  if (Math.abs(crossProduct) <= 1e-7) return null
  const startOffsetX = secondStart.x - firstStart.x,
    startOffsetY = secondStart.y - firstStart.y,
    firstParam = (startOffsetX * secondDeltaY - startOffsetY * secondDeltaX) / crossProduct,
    secondParam = (startOffsetX * firstDeltaY - startOffsetY * firstDeltaX) / crossProduct
  return firstParam < -1e-7 || firstParam > 1 + 1e-7 || secondParam < -1e-7 || secondParam > 1 + 1e-7
    ? null
    : {
        x: firstStart.x + firstDeltaX * clamp(firstParam, 0, 1),
        y: firstStart.y + firstDeltaY * clamp(firstParam, 0, 1),
      }
}

export function cross2d(firstVector: any, secondVector: any) {
  return firstVector.x * secondVector.y - firstVector.y * secondVector.x
}

export function pointDelta(tipPoint: any, originPoint: any) {
  return {
    x: tipPoint.x - originPoint.x,
    y: tipPoint.y - originPoint.y,
  }
}

export function lerpPoint(startPoint: any, endPoint: any, ratio: any) {
  return {
    x: startPoint.x + (endPoint.x - startPoint.x) * ratio,
    y: startPoint.y + (endPoint.y - startPoint.y) * ratio,
  }
}
