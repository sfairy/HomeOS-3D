/**
 * 地暖盘管的**铺设路径**（0.8.9 `studio-underfloor-heating.js`）。
 *
 * 公告：「壁挂炉制热时可显示当前楼层地暖盘管」。这里只算**路径**（一串折线），
 * 管子半径 / 材质 / 是否显示由上层决定 —— 几何算错的表现是管子穿墙或盘不成蛇形，
 * 那类错误必须在 node 里能复现。
 *
 * ## 形状：蛇形（boustrophedon）
 *
 * 真实地暖就是「一根管来回折」，所以按分区的包围盒铺若干条等距横线，相邻两条在端点
 * 交替相接。间距默认 0.2m（住宅常见 150–300mm，取中间偏密）。
 *
 * ## 两条硬约束
 *
 * 1. **只在分区内部布管**：每条横线要按分区的实际轮廓裁剪；直接铺满包围盒会在
 *    异形房间（L 形、带斜角）里把管子铺到房外。
 * 2. **必须留边距**：管子离墙 0.15m 左右，否则渲染时管壁会穿过墙体。
 *
 * 裁剪用「按 y 求环的横向区间」：把轮廓与水平线求交，取区间中点判定内/外，
 * 再合并成若干段。这比逐条横线做多边形裁剪简单，也够用（分区是房间，不是自交图形）。
 */

import { dedupeRing } from '../plan/studio-floor-region'
import type { FloorPoint, FloorRegion } from '../plan/studio-floor'

/** 管间距（米）。 */
export const UNDERFLOOR_HEATING_SPACING = 0.2

/** 离墙边距（米）。 */
export const UNDERFLOOR_HEATING_MARGIN = 0.15

/** 管半径（米，仅用于渲染，路径生成不依赖它）。 */
export const UNDERFLOOR_HEATING_RADIUS = 0.008

/** 单个分区允许的最大折线数（防病态输入卡死渲染）。 */
export const UNDERFLOOR_HEATING_MAX_LINES = 200

/** 一条水平线与环的交点 x 坐标（升序）。 */
function horizontalCrossings(ring: readonly FloorPoint[], y: number): number[] {
  const crossings: number[] = []
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]!
    const end = ring[(index + 1) % ring.length]!
    // 半开区间判定：避免顶点恰好落在扫描线上时被数两次。
    const straddles = (start.y <= y && end.y > y) || (end.y <= y && start.y > y)
    if (!straddles) continue
    const ratio = (y - start.y) / (end.y - start.y || 1e-9)
    crossings.push(start.x + (end.x - start.x) * ratio)
  }
  return crossings.sort((left, right) => left - right)
}

/** 把一条水平线裁剪成「环内的若干线段」。 */
export function clipHorizontalSpan(ring: readonly FloorPoint[], y: number): Array<[number, number]> {
  const crossings = horizontalCrossings(ring, y)
  const spans: Array<[number, number]> = []
  for (let index = 0; index + 1 < crossings.length; index += 2) {
    const left = crossings[index]!
    const right = crossings[index + 1]!
    if (right - left > 1e-6) spans.push([left, right])
  }
  return spans
}

/** 环的包围盒。 */
export function ringBounds(ring: readonly FloorPoint[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of ring) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  return { minX, maxX, minY, maxY }
}

/** 一条管段（世界坐标，端点顺序即走向）。 */
export type UnderfloorSegment = { from: FloorPoint; to: FloorPoint }

/** 一行盘管的一段：按边距裁掉两端，方向由 `reverse` 决定（蛇形）。 */
function rowSegments(
  spans: ReadonlyArray<readonly [number, number]>,
  y: number,
  margin: number,
  reverse: boolean,
): UnderfloorSegment[] {
  const segments: UnderfloorSegment[] = []
  for (const [rawLeft, rawRight] of spans) {
    const left = rawLeft + margin
    const right = rawRight - margin
    if (right - left <= 1e-6) continue
    segments.push({
      from: { x: reverse ? right : left, y },
      to: { x: reverse ? left : right, y },
    })
  }
  return segments
}

/**
 * 给一个分区生成蛇形盘管路径。
 *
 * @param region     分区（只用 `outline`；洞暂不支持，有洞时按外环铺 —— 洞口下方
 *                   铺管在现实中确实存在，渲染上也看不出问题）
 * @param spacing    管间距（米）
 * @param margin     离墙边距（米）
 */
export function buildRegionHeatingPaths(
  region: Pick<FloorRegion, 'outline'>,
  spacing = UNDERFLOOR_HEATING_SPACING,
  margin = UNDERFLOOR_HEATING_MARGIN,
): UnderfloorSegment[] {
  const ring = dedupeRing(region.outline)
  if (ring.length < 3) return []
  const safeSpacing = spacing > 1e-6 ? spacing : UNDERFLOOR_HEATING_SPACING
  const bounds = ringBounds(ring)
  const usableMinY = bounds.minY + margin
  const usableMaxY = bounds.maxY - margin
  if (usableMaxY - usableMinY < safeSpacing) return []
  const lineCount = Math.min(
    UNDERFLOOR_HEATING_MAX_LINES,
    Math.max(1, Math.floor((usableMaxY - usableMinY) / safeSpacing) + 1),
  )
  // 行距按可用高度均分：比固定间距更整齐，也不会在最后一行留下半条空档。
  const step = lineCount > 1 ? (usableMaxY - usableMinY) / (lineCount - 1) : 0
  const segments: UnderfloorSegment[] = []
  for (let row = 0; row < lineCount; row += 1) {
    const y = lineCount > 1 ? usableMinY + step * row : (usableMinY + usableMaxY) / 2
    // 蛇形：奇数行反向走，让相邻行的端点相接。
    segments.push(...rowSegments(clipHorizontalSpan(ring, y), y, margin, row % 2 === 1))
  }
  return segments
}

/** 一层楼的全部盘管路径（按分区拼接）。 */
export function buildUnderfloorHeatingPaths(
  regions: readonly Pick<FloorRegion, 'outline'>[],
  spacing = UNDERFLOOR_HEATING_SPACING,
  margin = UNDERFLOOR_HEATING_MARGIN,
): UnderfloorSegment[] {
  const segments: UnderfloorSegment[] = []
  for (const region of regions) {
    segments.push(...buildRegionHeatingPaths(region, spacing, margin))
  }
  return segments
}

/**
 * 是否应该显示盘管。
 *
 * 公告写的是「壁挂炉**制热时**可显示」：所以需要 (a) 有壁挂炉、(b) 它在制热、
 * (c) 当前层有分区。三者缺一都不显示 —— 常驻显示会让画面变成一团管子。
 */
export function shouldShowUnderfloorHeating(options: {
  hasBoiler: boolean
  boilerHeating: boolean
  regionCount: number
}): boolean {
  return options.hasBoiler && options.boilerHeating && options.regionCount > 0
}

/**
 * 地暖盘管的完整构造（0.8.9 `createUnderfloorHeating`）。
 *
 * 本项目把「算路径」与「建 three 对象」拆开：这里只返回路径集合与是否显示，
 * `LineSegments` 的构造在 `scene-build/floor-region-visuals.ts`。分离后
 * 「盘管越出墙外」这类错可以在 node 里直接断言。
 */
export function createUnderfloorHeating(options: {
  regions: ReadonlyArray<{ outline: ReadonlyArray<FloorPoint> }>
  spacing?: number
  margin?: number
}): { visible: boolean; paths: UnderfloorSegment[] } {
  const paths = buildUnderfloorHeatingPaths(
    options.regions.map((region) => ({ outline: [...region.outline] })),
    options.spacing,
    options.margin,
  )
  return { visible: paths.length > 0, paths }
}
