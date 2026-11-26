/**
 * 地面分区的**切分与吸附**（0.8.9 `splitFloorRegion` / `snapFloorRegionEdge`）。
 *
 * 绘制页的交互是「点一条分割线的起点与终点，把选中的分区切成两块」。这里只做几何，
 * 不碰 DOM —— 切分算错的表现是分区消失或出现自交多边形，这类错误必须能在 node 里重现。
 *
 * ## 算法：半平面裁剪（Sutherland–Hodgman）
 *
 * 把分区轮廓分别裁剪到分割线两侧，得到两块。选它而不是「求两个交点再走环」的原因：
 *
 * - 交点法必须假定「分割线恰好穿过轮廓两次」，而用户画的线经常一端落在区域外
 *   （此时只有一个交点，走环会得到一条退化的自交环）；
 * - 半平面裁剪对**凸**多边形严格正确，对轻度凹多边形也能给出可用的结果；
 * - 失败模式单一：某一侧点数不足 3 → 返回 `null`，UI 显示「分割线需留在所选区域内」。
 *
 * 已知限制（写在这里而不是留给下一个人踩）：对**深度凹**的区域，裁剪可能得到
 * 一个自交环而不是多个环。所以切分成功后还要过一次 `hasSelfIntersection`，
 * 自交就当作切分失败 —— 宁可让用户重画，也不要产生一个渲染成碎片的分区。
 */

import type { FloorPoint, FloorRegion } from './studio-floor-regions'

/** 面积下限（平方场景单位）。低于它的碎块视为「没切开」。 */
export const MIN_REGION_AREA = 0.01

/** 顶点离分割线多近才算「在线上」（场景单位）。 */
export const SPLIT_EPSILON = 1e-6

/** 环的有向面积（格林公式；正负只表示绕向）。 */
export function ringArea(ring: readonly FloorPoint[]): number {
  let total = 0
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const point = ring[index]!
    const last = ring[previous]!
    total += last.x * point.y - point.x * last.y
  }
  return total / 2
}

/** 无向面积。 */
export function ringAreaAbs(ring: readonly FloorPoint[]): number {
  return Math.abs(ringArea(ring))
}

/** 点在有向直线的哪一侧：>0 左侧，<0 右侧，≈0 在线上。 */
function sideOfLine(point: FloorPoint, origin: FloorPoint, direction: FloorPoint): number {
  return (point.x - origin.x) * direction.y - (point.y - origin.y) * direction.x
}

/** 两条线段的交点（参数用于在环上定位）。无交点返回 `null`。 */
function segmentIntersection(
  segmentStart: FloorPoint,
  segmentEnd: FloorPoint,
  lineStart: FloorPoint,
  lineEnd: FloorPoint,
): FloorPoint | null {
  const segmentDirection = { x: segmentEnd.x - segmentStart.x, y: segmentEnd.y - segmentStart.y }
  const lineDirection = { x: lineEnd.x - lineStart.x, y: lineEnd.y - lineStart.y }
  const denominator = segmentDirection.x * lineDirection.y - segmentDirection.y * lineDirection.x
  if (Math.abs(denominator) < SPLIT_EPSILON) return null
  const delta = { x: lineStart.x - segmentStart.x, y: lineStart.y - segmentStart.y }
  const alongSegment = (delta.x * lineDirection.y - delta.y * lineDirection.x) / denominator
  if (alongSegment < -SPLIT_EPSILON || alongSegment > 1 + SPLIT_EPSILON) return null
  return {
    x: segmentStart.x + segmentDirection.x * alongSegment,
    y: segmentStart.y + segmentDirection.y * alongSegment,
  }
}

/** 把交点并入保留侧的输出环（先留当前点，再补交点）。 */
function pushClippedVertex(
  output: FloorPoint[],
  current: FloorPoint,
  next: FloorPoint,
  lineStart: FloorPoint,
  lineEnd: FloorPoint,
  currentSide: number,
  nextSide: number,
): void {
  if (currentSide >= -SPLIT_EPSILON) output.push(current)
  const crosses =
    (currentSide > SPLIT_EPSILON && nextSide < -SPLIT_EPSILON) ||
    (currentSide < -SPLIT_EPSILON && nextSide > SPLIT_EPSILON)
  if (!crosses) return
  const intersection = segmentIntersection(current, next, lineStart, lineEnd)
  if (intersection) output.push(intersection)
}

/**
 * 用一条无限长直线把环裁剪到「左侧」或「右侧」。
 *
 * `keepLeft` 决定保留哪一侧；`direction` 是线的方向向量（不需要归一化）。
 */
export function clipRingByLine(
  ring: readonly FloorPoint[],
  lineStart: FloorPoint,
  lineEnd: FloorPoint,
  keepLeft: boolean,
): FloorPoint[] {
  const direction = { x: lineEnd.x - lineStart.x, y: lineEnd.y - lineStart.y }
  if (Math.abs(direction.x) < SPLIT_EPSILON && Math.abs(direction.y) < SPLIT_EPSILON) return []
  const sign = keepLeft ? 1 : -1
  const output: FloorPoint[] = []
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]!
    const next = ring[(index + 1) % ring.length]!
    pushClippedVertex(
      output,
      current,
      next,
      lineStart,
      lineEnd,
      sideOfLine(current, lineStart, direction) * sign,
      sideOfLine(next, lineStart, direction) * sign,
    )
  }
  return dedupeRing(output)
}

/** 去掉连续重复点与首尾重合（裁剪会产出重复点，进渲染前必须清掉）。 */
export function dedupeRing(ring: readonly FloorPoint[], epsilon = SPLIT_EPSILON): FloorPoint[] {
  const points: FloorPoint[] = []
  for (const point of ring) {
    const previous = points[points.length - 1]
    if (previous && Math.abs(previous.x - point.x) < epsilon && Math.abs(previous.y - point.y) < epsilon) continue
    points.push({ x: point.x, y: point.y })
  }
  const first = points[0]
  const last = points[points.length - 1]
  if (
    points.length > 1 &&
    first &&
    last &&
    Math.abs(first.x - last.x) < epsilon &&
    Math.abs(first.y - last.y) < epsilon
  ) {
    points.pop()
  }
  return points
}

/** 线段相交（不含端点接触）：自交检测用。 */
function segmentsCross(a1: FloorPoint, a2: FloorPoint, b1: FloorPoint, b2: FloorPoint): boolean {
  const orientation = (p: FloorPoint, q: FloorPoint, r: FloorPoint) =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
  const o1 = orientation(a1, a2, b1)
  const o2 = orientation(a1, a2, b2)
  const o3 = orientation(b1, b2, a1)
  const o4 = orientation(b1, b2, a2)
  return o1 * o2 < -SPLIT_EPSILON && o3 * o4 < -SPLIT_EPSILON
}

/**
 * 环是否自交（非相邻边交叉）。
 *
 * 切分结果必须过这一关：半平面裁剪对深度凹区域可能产出自交环，
 * 那种环进渲染会变成碎片，比「切分失败」难排查得多。
 */
export function hasSelfIntersection(ring: readonly FloorPoint[]): boolean {
  const count = ring.length
  if (count < 4) return false
  for (let first = 0; first < count; first += 1) {
    const firstNext = (first + 1) % count
    for (let second = first + 2; second < count; second += 1) {
      const secondNext = (second + 1) % count
      // 相邻边共享端点，不算相交。
      if (first === secondNext || firstNext === second) continue
      if (segmentsCross(ring[first]!, ring[firstNext]!, ring[second]!, ring[secondNext]!)) return true
    }
  }
  return false
}

/** 切分结果：两块分区（id 由调用方给，这里只产出几何）。 */
export type FloorRegionSplitSide = {
  outline: FloorPoint[]
  holes: FloorPoint[][]
}

/**
 * 用一条分割线把一个分区切成两块。
 *
 * 返回 `null` 表示「切不开」，调用方应提示用户重画：
 * - 分割线没穿过区域（某一侧点数 < 3）；
 * - 某一侧面积过小（< `MIN_REGION_AREA`，用户会以为没切开）；
 * - 任一侧自交（深度凹区域的裁剪产物）。
 *
 * 洞不做切分：分区上有洞时直接拒绝（`holes.length > 0` → `null`）。理由见下 ——
 * 洞与分割线的组合会出现「洞被切成两半」的第四种情形，而没有对应 UI 表达它。
 */
export function splitFloorRegionByLine(
  region: Pick<FloorRegion, 'outline' | 'holes'>,
  lineStart: FloorPoint,
  lineEnd: FloorPoint,
): { left: FloorRegionSplitSide; right: FloorRegionSplitSide } | null {
  if (region.holes.length > 0) return null
  const left = dedupeRing(clipRingByLine(region.outline, lineStart, lineEnd, true))
  const right = dedupeRing(clipRingByLine(region.outline, lineStart, lineEnd, false))
  if (left.length < 3 || right.length < 3) return null
  if (ringAreaAbs(left) < MIN_REGION_AREA || ringAreaAbs(right) < MIN_REGION_AREA) return null
  if (hasSelfIntersection(left) || hasSelfIntersection(right)) return null
  return { left: { outline: left, holes: [] }, right: { outline: right, holes: [] } }
}

/** 点到线段的最短距离。 */
export function distanceToSegment(point: FloorPoint, start: FloorPoint, end: FloorPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < SPLIT_EPSILON) return Math.hypot(point.x - start.x, point.y - start.y)
  const raw = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
  const t = raw < 0 ? 0 : raw > 1 ? 1 : raw
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t))
}

/** 吸附结果：落到边上的点 + 它离原点多远 + 是哪条边（索引）。 */
export type FloorRegionSnap = {
  point: FloorPoint
  distance: number
  edgeIndex: number
}

/**
 * 把点吸附到分区轮廓上最近的位置（0.8.9 `snapFloorRegionEdge`）。
 *
 * 用于「点击所选区域的边界，标记分割起点」：用户点得不可能精确，必须吸附到边上，
 * 否则分割线的一端落在区域外，切分必然失败。
 *
 * 超过 `maxDistance` 返回 `null`，让 UI 提示「请靠近所选区域的边界」。
 */
export function snapToFloorRegionEdge(
  region: Pick<FloorRegion, 'outline'>,
  point: FloorPoint,
  maxDistance = Infinity,
): FloorRegionSnap | null {
  const ring = region.outline
  if (ring.length < 3) return null
  let best: FloorRegionSnap | null = null
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]!
    const end = ring[(index + 1) % ring.length]!
    const distance = distanceToSegment(point, start, end)
    if (best && distance >= best.distance) continue
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    const raw =
      lengthSquared < SPLIT_EPSILON ? 0 : ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
    const t = raw < 0 ? 0 : raw > 1 ? 1 : raw
    best = { point: { x: start.x + dx * t, y: start.y + dy * t }, distance, edgeIndex: index }
  }
  if (!best || best.distance > maxDistance) return null
  return best
}

/** 刀切之后给两块分区分配 id（保留原 id 给面积更大的一侧，另一侧派生）。 */
export function splitRegionIds(regionId: string, leftArea: number, rightArea: number): { left: string; right: string } {
  const suffix = `${Date.now().toString(36)}`
  return leftArea >= rightArea
    ? { left: regionId, right: `${regionId}~${suffix}` }
    : { left: `${regionId}~${suffix}`, right: regionId }
}
