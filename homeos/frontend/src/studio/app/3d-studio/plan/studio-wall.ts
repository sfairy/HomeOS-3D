import { finite } from '../loaders/studio-normalization'
import { generateId } from '../authoring/ui/studio-app-helpers'
import { clamp, clampWindowT, splitWallSegments, validatedUnionPolygonLoops as validatedUnionPolygonLoops2 } from './geometry'
import { type WallSpanPadding } from '../authoring/types/studio-app-types'
import { validGeometryLoops as validGeometryLoops2 } from '../cache/geometry-persistent-cache'

/** 把窗 / 门 / 栏杆**重映射到拆段后的墙**：墙先按交点切段，再按 `t` 落到所属段的局部参数。
 *
 * 从 `../studio/studio-app.ts` 的巨型闭包中抽出（P4 拆单体）：纯函数，依赖全走显式 import。
 */

export function remapOpeningsToWalls(
  wallList: any,
  windowList: any,
  doorList: any,
  windowIndexFallback: any,
  railingList: any[] = [],
) {
  const wallPieces = splitWallSegments(wallList),
    wallPiecesByWallId = new Map(),
    remappedWalls: any[] = []
  for (const wallPiece of wallPieces) {
    const wallPieceRecord = {
        ...wallPiece.sourceWall,
        id: wallPiece.pieceIndex === 0 ? wallPiece.sourceWall.id : generateId('wall'),
        start: wallPiece.start,
        end: wallPiece.end,
      },
      wallPieceEntry = {
        ...wallPiece,
        wall: wallPieceRecord,
      }
    wallPiecesByWallId.has(wallPiece.sourceWall.id) || wallPiecesByWallId.set(wallPiece.sourceWall.id, []),
      wallPiecesByWallId.get(wallPiece.sourceWall.id).push(wallPieceEntry),
      remappedWalls.push(wallPieceRecord)
  }
  const snapOpeningToPiece = (openingRecord: any) => {
    const wallPieceList = wallPiecesByWallId.get(openingRecord.wallId)
    if (!wallPieceList?.length) return openingRecord
    const openingT = clamp(finite(openingRecord.t, 0.5), 0, 1),
      at2 =
        wallPieceList.find(
          (candidatePiece: any) => openingT >= candidatePiece.startT - 1e-7 && openingT <= candidatePiece.endT + 1e-7,
        ) || wallPieceList.at(-1),
      max = Math.max(at2.endT - at2.startT, 1e-7),
      remappedOpening = {
        ...openingRecord,
        wallId: at2.wall.id,
        t: clamp((openingT - at2.startT) / max, 0, 1),
      }
    return ((remappedOpening.t = clampWindowT(at2.wall, remappedOpening, windowIndexFallback || 1)), remappedOpening)
  }
  return {
    walls: remappedWalls,
    windows: windowList.map(snapOpeningToPiece),
    doors: doorList.map(snapOpeningToPiece),
    railings: railingList.map(snapOpeningToPiece),
  }
}

/** 墙段跨度在**平面上的四角足迹**（含首尾可选外扩），供墙带 / 踢脚等按跨度取面。
 *
 * 从 `../studio/studio-app.ts` 的巨型闭包中抽出（P4 拆单体）：纯函数。
 * `worldFromWallPoint` 由调用方注入 —— 单体内的世界坐标换算牵着相机与楼层状态，不跟着搬。
 */

export function buildWallSpanFootprint(
  wallSegment: any,
  wallSpan: any,
  _unusedWallSpanArg: any,
  worldFromWallPoint: any,
  wallSpanPadding: WallSpanPadding = {},
) {
  const wallSpanStartPoint = worldFromWallPoint(wallSegment.start),
    wallSpanEndPoint = worldFromWallPoint(wallSegment.end),
    wallSpanDeltaX = wallSpanEndPoint.x - wallSpanStartPoint.x,
    wallSpanDeltaZ = wallSpanEndPoint.z - wallSpanStartPoint.z,
    hypot5 = Math.hypot(wallSpanDeltaX, wallSpanDeltaZ)
  if (hypot5 <= 1e-7) return null
  const wallSpanDirection = {
      x: wallSpanDeltaX / hypot5,
      y: wallSpanDeltaZ / hypot5,
    },
    wallSpanNormal = {
      x: -wallSpanDirection.y,
      y: wallSpanDirection.x,
    },
    wallHalfThickness = wallSegment.thickness / 2,
    start3 =
      wallSpan.start <= 0.000001 ? wallSpan.start - Math.max(Number(wallSpanPadding.start) || 0, 0) : wallSpan.start,
    end2 =
      wallSpan.end >= hypot5 - 0.000001 ? wallSpan.end + Math.max(Number(wallSpanPadding.end) || 0, 0) : wallSpan.end,
    wallSpanInnerStart = {
      x: wallSpanStartPoint.x + wallSpanDirection.x * start3,
      y: wallSpanStartPoint.z + wallSpanDirection.y * start3,
    },
    wallSpanInnerEnd = {
      x: wallSpanStartPoint.x + wallSpanDirection.x * end2,
      y: wallSpanStartPoint.z + wallSpanDirection.y * end2,
    }
  return [
    {
      x: wallSpanInnerStart.x + wallSpanNormal.x * wallHalfThickness,
      y: wallSpanInnerStart.y + wallSpanNormal.y * wallHalfThickness,
    },
    {
      x: wallSpanInnerStart.x - wallSpanNormal.x * wallHalfThickness,
      y: wallSpanInnerStart.y - wallSpanNormal.y * wallHalfThickness,
    },
    {
      x: wallSpanInnerEnd.x - wallSpanNormal.x * wallHalfThickness,
      y: wallSpanInnerEnd.y - wallSpanNormal.y * wallHalfThickness,
    },
    {
      x: wallSpanInnerEnd.x + wallSpanNormal.x * wallHalfThickness,
      y: wallSpanInnerEnd.y + wallSpanNormal.y * wallHalfThickness,
    },
  ]
}

/**
 * 墙体轮廓并集的**保守回退**（纯函数，不依赖 three）。
 *
 * `validatedUnionPolygonLoops` 一旦判定输入「有歧义 / 自交 / 顶点数对不上」就直接返回
 * 空数组。调用方原来的做法是把**原始环**原样丢给挤出：于是两段相互重叠的墙各自画
 * 一层双面半透明壳，重叠处比别处亮一档 —— 现场表现就是「接缝 / 重影 / 亮边」。
 *
 * 这里给出一个不会把墙画丢的回退：只丢掉**被其它环完全包住**的环（它在轮廓上不贡献
 * 任何面积，但会叠一层膜）；真正交叉的两个环（T 字墙）保持原样 —— 宁可留一条细缝，
 * 也不能把一面墙整段删掉。
 *
 * 失败次数对外暴露（`wallUnionFallbackCount`），由宿主写进
 * `renderer.domElement.dataset.wallUnionFallbacks`，验收脚本不用开控制台就能读到。
 */

/** 并集缓存只需要几何缓存句柄；用结构类型声明，避免与 studio-walls 形成类型环。 */
type WallUnionCacheDeps = {
  geometryCacheHandle?: {
    value: <T>(cacheKey: string, input: unknown, compute: () => T, validate: unknown) => T
  } | null
}

/** 平面环（与 `plan/geometry` 的环同构，只要求 x / y）。 */
type WallPlanLoop = { x: number; y: number }[]

let wallUnionFallbackTotal = 0

/** 墙体并集失败的累计次数（本页生命周期）。 */
export function wallUnionFallbackCount() {
  return wallUnionFallbackTotal
}

/** 只给测试用：把计数清零。 */
export function resetWallUnionFallbackCount() {
  wallUnionFallbackTotal = 0
}

function polygonSignedArea(loop: WallPlanLoop) {
  let area = 0
  for (let index = 0; index < loop.length; index += 1) {
    const current = loop[index],
      next = loop[(index + 1) % loop.length]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

/** 射线法：点是否在多边形内部（环坐标是平面米制）。 */
function pointInsideWallLoop(point: { x: number; y: number }, loop: WallPlanLoop) {
  let inside = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const current = loop[i],
      previous = loop[j],
      crossesRay =
        current.y > point.y !== previous.y > point.y &&
        point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y || 1e-12) + current.x
    crossesRay && (inside = !inside)
  }
  return inside
}

/**
 * 丢掉被其它环完全包住的环；全部被包住时保持原样（绝不让整组消失）。
 *
 * 判定是「**所有顶点**都落在另一个环内」，不是只看重心：T 字拼接的两个环重心可能
 * 都落在对方内部，只比重心会把一面墙整段删掉。
 */
export function dropContainedWallLoops<T extends WallPlanLoop>(loopList: T[]): T[] {
  if (loopList.length <= 1) return loopList
  const entries = loopList.map((loop) => ({ loop, area: Math.abs(polygonSignedArea(loop)) })),
    contained = new Set<(typeof entries)[number]>()
  for (const candidate of entries) {
    if (contained.has(candidate)) continue
    for (const hostEntry of entries) {
      if (hostEntry === candidate || contained.has(hostEntry)) continue
      const fullyInside =
        hostEntry.area >= candidate.area &&
        candidate.loop.every((vertex) => pointInsideWallLoop(vertex, hostEntry.loop))
      if (fullyInside) {
        contained.add(candidate)
        break
      }
    }
  }
  const keptLoops = entries.filter((entry) => !contained.has(entry)).map((entry) => entry.loop)
  return keptLoops.length ? keptLoops : loopList
}

/** 记录一次并集失败并返回保守回退后的环。 */
export function recordWallUnionFallback<T extends WallPlanLoop>(loopList: T[]): T[] {
  wallUnionFallbackTotal += 1
  return dropContainedWallLoops(loopList)
}

/** 墙体轮廓并集：经几何持久缓存复用，命中时跳过昂贵的多边形布尔运算。 */
export function cachedWallUnionLoops(deps: WallUnionCacheDeps, wallLoopList: any) {
  const computeUnionLoops = () => {
    const unifiedLoops = validatedUnionPolygonLoops2(wallLoopList, 1e-7)
    // 并集失败（输入有歧义/自交）时不再把重叠环原样丢给挤出：那会让重叠段各自
    // 画一层双面半透明壳，叠出亮边。改成保守回退并计数（见 studio-wall-shell）。
    return unifiedLoops.length ? unifiedLoops : recordWallUnionFallback(wallLoopList)
  }
  return deps.geometryCacheHandle
    ? deps.geometryCacheHandle.value('wall-union', wallLoopList, computeUnionLoops, validGeometryLoops2)
    : computeUnionLoops()
}
