/**
 * S7 候选内核：用 `martinez-polygon-clipping` 实现并集 / 差集。
 *
 * 这不是产品代码，只给 `ops/checks/plan-geometry-invariants.mjs --entry` 与
 * `ops/checks/plan-geometry-golden.mjs --entry` 用：把同一个导出形状
 * （`validatedUnionPolygonLoops` / `subtractPolygonLoops` + 原语）指向候选实现，
 * 跑同一组数学不变量与同一批真实/合成用例。全绿才有资格讨论「是否替换」。
 *
 * 与被替换实现的关系
 * ------------------
 * - `polygonArea` / `pointInPolygon` / 墙段拆分合并 / 规范化键：**直接复用**原模块，
 *   它们不属于布尔内核，替换它们不在本步范围内。
 * - 并集 / 差集：改成 martinez 的二元运算折叠。
 * - 面积校验（`validatedUnionPolygonLoops` 的验收条件）：**原样保留**。
 * - 输出规范化：原实现有两处刻意的容差行为，必须显式复刻，否则输出的「集合正确但
 *   表示不同」：
 *   1. 顶点按 `epsilon * 8` 量化 —— 容差内的缝隙会被焊死；
 *   2. 共线顶点被剔除（`clampT`）—— 直边中间不留分段点。
 *   martinez 用稳健谓词判断接触，任何浮点噪声都会当成真实缝隙（一条墙条会被拆成两段），
 *   且会保留边界上的共线顶点。这两点差异会被下游的地板偏移 / 三角化放大成缝或接缝线，
 *   所以候选必须自己补上。
 *
 * 环的符号约定保持不变：外环正面积、洞负面积。
 *
 * S7 结论（评估后不合并）
 * ----------------------
 * - 不变量：45 / 45 通过（`plan-geometry-invariants.mjs --entry`）。
 * - 黄金对比：容差 1e-6 / 1e-7，41 个用例 × 5 个种子，净面积 / 环数洞数 / 栅格内外 /
 *   三角化面积四项完全一致。
 * - 容差 1e-5 仍不一致：该档旧内核经常返回空（400 个真实随机子集里 22 次），候选能算出
 *   结果；另有少数用例面积相对差约 2e-5（旧内核按输出点量化，候选按输入栅格吸附）。
 *   按方案「证据不足即不改」的保守规则，**不替换产品内核**。
 * - 收益复核：可删的旧内核约 235 行，但候选要复刻「容差吸附 + 共线剔除」语义，产品版
 *   仍需 120～150 行，净收益仅约 50～150 行 —— 低于方案估算的 250～400 行。
 *
 * 重跑前先装依赖（本文件不参与产品构建，仓库默认不保留该依赖）：
 *
 *     bun add -D --exact martinez-polygon-clipping@0.7.3
 *     node ops/checks/plan-geometry-invariants.mjs --entry ops/checks/candidates/geometry-martinez.ts
 *     node ops/checks/plan-geometry-golden.mjs --entry ops/checks/candidates/geometry-martinez.ts
 */

import { diff, union } from 'martinez-polygon-clipping'
import {
  canonicalPolygonKey,
  mergeCollinearWallSegments,
  pointInPolygon,
  polygonArea,
  splitWallSegments,
} from '../../../homeos/frontend/src/studio/app/3d-studio/plan/geometry'

export { canonicalPolygonKey, mergeCollinearWallSegments, pointInPolygon, polygonArea, splitWallSegments }

type PlanPoint = { x: number; y: number }
type PlanLoop = PlanPoint[]
type Position = [number, number]

/** 与 `unionLoops` 的 epsilon 下限一致：调用方传 0 时仍按 1e-7 处理。 */
const MIN_EPSILON = 1e-7

/** 按指定栅格吸附并去重；闭合重复点一并去掉（原实现由 `clampT` 做同一件事）。 */
function snapLoop(loop: PlanLoop, step: number): PlanLoop {
  const snap = (value: number) => Math.round(value / step) * step
  const points: PlanLoop = []
  for (const point of loop) {
    const snapped = { x: snap(point.x), y: snap(point.y) }
    const previous = points.at(-1)
    if (previous && previous.x === snapped.x && previous.y === snapped.y) continue
    points.push(snapped)
  }
  while (points.length > 1) {
    const first = points[0] as PlanPoint
    const last = points[points.length - 1] as PlanPoint
    if (first.x !== last.x || first.y !== last.y) break
    points.pop()
  }
  return points
}

/**
 * 归一化一个输入环：丢弃非数组 / 顶点不足 / 含非有限坐标 / 零面积的环，
 * 并把顶点吸附到与 `unionLoops` 相同的栅格上。
 */
function cleanLoop(rawLoop: unknown, tolerance: number): PlanLoop | null {
  if (!Array.isArray(rawLoop) || rawLoop.length < 3) return null
  const rawPoints: PlanLoop = []
  for (const rawVertex of rawLoop) {
    if (rawVertex === null || typeof rawVertex !== 'object') return null
    const x = Number((rawVertex as PlanPoint).x)
    const y = Number((rawVertex as PlanPoint).y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    rawPoints.push({ x, y })
  }
  // 输入先吸附到 `epsilon * 8` 栅格：恰好相接的墙段只有落在同一栅格上才会被
  // martinez 判成接触（它会把坐标扰动到 1e-13 量级，否则一条连续墙条会被拆成两段）。
  const points = snapLoop(rawPoints, tolerance * 8)
  if (points.length < 3) return null
  if (Math.abs(polygonArea(points)) <= tolerance * tolerance) return null
  return points
}

function cleanLoops(rawLoops: unknown, tolerance: number): PlanLoop[] {
  if (!Array.isArray(rawLoops)) return []
  const loops: PlanLoop[] = []
  for (const rawLoop of rawLoops) {
    const cleaned = cleanLoop(rawLoop, tolerance)
    if (cleaned) loops.push(cleaned)
  }
  return loops
}

/**
 * 剔除共线顶点：与原实现 `clampT` 的判定同源（`|cross| <= 容差 × 相邻边长积`）。
 * 直边中间的分段点不改变点集与面积，但会改变顶点数、三角化结果与下游偏移的接缝。
 */
function removeCollinearPoints(loop: PlanLoop, tolerance: number): PlanLoop {
  const points = [...loop]
  let hasRemoved = true
  while (hasRemoved && points.length >= 3) {
    hasRemoved = false
    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index - 1 + points.length) % points.length] as PlanPoint
      const corner = points[index] as PlanPoint
      const following = points[(index + 1) % points.length] as PlanPoint
      const incoming = { x: corner.x - previous.x, y: corner.y - previous.y }
      const outgoing = { x: following.x - corner.x, y: following.y - corner.y }
      const edgeLengthProduct = Math.max(Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y), 1)
      if (Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x) > tolerance * edgeLengthProduct) continue
      points.splice(index, 1)
      hasRemoved = true
      break
    }
  }
  return points
}

function toMultiPolygon(loops: PlanLoop[]): Position[][][] {
  // 每个环是一个「无洞多边形」：Polygon = [ring]，MultiPolygon = Polygon[]。
  // 环必须闭合（首点重复一次）——martinez 依赖闭合环判断边。
  return loops.map((loop) => {
    const ring: Position[] = loop.map((point) => [point.x, point.y] as Position)
    const first = loop[0] as PlanPoint
    ring.push([first.x, first.y])
    return [ring]
  })
}

/**
 * martinez 的返回值是 `Polygon | MultiPolygon`，两者深度差一层。
 * 用「第一个位置的第一个分量是不是数组」区分，避免猜错层级。
 */
function polygonsOf(geometry: unknown): unknown[][] {
  if (!Array.isArray(geometry) || geometry.length === 0) return []
  const first = geometry[0]
  if (!Array.isArray(first) || first.length === 0) return []
  const head = first[0]
  if (!Array.isArray(head) || head.length === 0) return []
  const isMultiPolygon = Array.isArray(head[0])
  return isMultiPolygon ? (geometry as unknown[][]) : [geometry as unknown[]]
}

/**
 * 把运算结果还原为「外环正、洞负、无闭合重复点、无共线顶点」的环列表，
 * 并按 |面积| 降序（与原实现的排序一致）。
 */
function fromGeometry(geometry: unknown, tolerance: number): PlanLoop[] {
  const loops: PlanLoop[] = []
  for (const polygon of polygonsOf(geometry)) {
    if (!Array.isArray(polygon)) continue
    polygon.forEach((ring, ringIndex) => {
      if (!Array.isArray(ring)) return
      const rawPoints: PlanLoop = []
      for (const position of ring) {
        if (!Array.isArray(position)) return
        const x = Number(position[0])
        const y = Number(position[1])
        if (!Number.isFinite(x) || !Number.isFinite(y)) return
        rawPoints.push({ x, y })
      }
      const points = snapLoop(rawPoints, tolerance * 8)
      if (points.length < 3) return
      const area = polygonArea(points)
      if (Math.abs(area) <= tolerance * tolerance) return
      const isHole = ringIndex > 0
      // 外环必须正面积、洞必须负面积：绕向不对就整环反向（顶点集合不变）。
      const oriented = (isHole === area < 0 ? points : [...points].reverse()) as PlanLoop
      const simplified = removeCollinearPoints(oriented, tolerance)
      if (simplified.length < 3) return
      if (Math.abs(polygonArea(simplified)) <= tolerance * tolerance) return
      loops.push(simplified)
    })
  }
  return loops.sort((left, right) => Math.abs(polygonArea(right)) - Math.abs(polygonArea(left)))
}

function foldUnion(loops: PlanLoop[], tolerance: number): unknown {
  const first = loops[0]
  if (!first) return []
  let accumulated: unknown = toMultiPolygon([first])
  for (const loop of loops.slice(1)) {
    accumulated = union(accumulated as Position[][], toMultiPolygon([loop]) as Position[][][])
  }
  return accumulated
}

/** 原 `unionLoops` 的等价入口：并集 + 可选差集（`extraLoops` 就是洞）。 */
function unionLoopsReplacement(rawLoops: unknown, tolerance: number, holes: unknown): PlanLoop[] {
  const epsilon = Math.max(Number(tolerance) || 0, MIN_EPSILON)
  const primaryLoops = cleanLoops(rawLoops, epsilon)
  if (primaryLoops.length === 0) return []
  let result = foldUnion(primaryLoops, epsilon)
  const holeLoops = cleanLoops(holes, epsilon)
  if (holeLoops.length > 0) {
    // 洞按「并集」语义参与相减：原实现判定「点在任一洞里」即视为洞内，
    // 因此环中环（洞里的洞）应被外层洞吞掉，而不是重新变成实体。
    // 多个互相重叠的多边形直接塞进 MultiPolygon 不是 martinez 的合法输入，必须先合并。
    result = diff(result as Position[][], foldUnion(holeLoops, epsilon) as Position[][])
  }
  return fromGeometry(result, epsilon)
}

export function subtractPolygonLoops(targetLoops: unknown, holeLoops: unknown, loopTolerance = 0.000001): PlanLoop[] {
  return unionLoopsReplacement(targetLoops, loopTolerance, holeLoops)
}

/** 面积校验与 `geometry.ts` 中的同名函数逐字对齐（内核可换，验收条件不可换）。 */
export function validatedUnionPolygonLoops(rawLoops: unknown, validationTolerance = 0.000001): PlanLoop[] {
  const loopAreaTolerance = Math.max(Number(validationTolerance) || 0, 1e-7)
  const acceptedLoops = (Array.isArray(rawLoops) ? rawLoops : [])
    .filter((wellFormedLoop) => Array.isArray(wellFormedLoop) && wellFormedLoop.length >= 3)
    .filter((sizedLoop) => Math.abs(polygonArea(sizedLoop)) > loopAreaTolerance * loopAreaTolerance)
  if (acceptedLoops.length === 0) return []
  const unionedLoops = unionLoopsReplacement(acceptedLoops, loopAreaTolerance, [])
  if (unionedLoops.length === 0) return []
  const rawLoopAreaSum = acceptedLoops.reduce((total, loop) => total + Math.abs(polygonArea(loop)), 0)
  const unionedLoopArea = unionedLoops.reduce((total, loop) => total + polygonArea(loop), 0)
  const areaMismatchTolerance = Math.max(rawLoopAreaSum * 0.001, loopAreaTolerance * loopAreaTolerance * 1024)
  return unionedLoopArea <= areaMismatchTolerance || unionedLoopArea > rawLoopAreaSum + areaMismatchTolerance
    ? []
    : unionedLoops
}
