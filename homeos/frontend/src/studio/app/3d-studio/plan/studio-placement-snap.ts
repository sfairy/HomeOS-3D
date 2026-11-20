/**
 * 拖动物件时的吸附（0.8.7 `studio-placement-guides.js` 的 `snapPlacement`）。
 *
 * 与绘制时的 `snapPoint` 是**两套**候选：
 * - 绘制吸附（端点 / 交点 / 墙线 / 15° / 栅格）服务「画墙、画参考线」；
 * - 这里服务「把一件家具摆到位置上」—— 关心的是边缘对齐、中心对齐、贴墙，
 *   而且必须按物件**旋转后的四角**算，而不是按光标的包围盒。
 *
 * 两类吸附默认分别可关（`snapObjectWalls` / `snapModels`），因为窄房间里
 * 「老是吸到墙上」会让人无法微调。
 *
 * 全部纯函数：输入是像素坐标与 OBB，输出是「修正后的位移 + 命中的引导线」。
 * 不做 DOM、不读 DOM，便于用固定样例断言。
 */
import {
  dotProduct,
  itemAxes,
  itemPlanCorners,
  normalizeVector,
  projectRange,
  subtract,
  vectorLength,
  type PlanRectLike,
  type Point,
} from './studio-placement-geometry'

/** 一条引导线：`start → end` 是「物件会贴上去的那一段」。 */
export type PlacementGuide = {
  start: Point
  end: Point
  /** 参照物 id（墙面 id 或物件 id）。 */
  targetId: string
  /** `中心对齐` / `边缘对齐` / `贴合墙面`。 */
  label: string
}

export type SnapPlacementInput = {
  /** 被拖动的物件（多选时是整组，吸附按组合包围盒整体平移）。 */
  moving?: PlanRectLike[]
  /** 单点吸附（缩放时用被拖的那条边作为点）；与 `moving` 二选一。 */
  point?: Point | null
  /** 可吸附的其它物件。 */
  targets?: PlanRectLike[]
  /** 墙面：`start / end` 为平面像素，`thickness` 为米。 */
  walls?: Array<{ id?: string; start: Point; end: Point; thickness?: number }>
  pixelsPerMeter: number
  /** 容差（平面像素）。用 `placementTolerance()` 算，不要写死。 */
  tolerance: number
  /** 上一次命中的候选键：命中过的放宽阈值，避免在同一处来回抖。 */
  previous?: string[]
  /** 只允许沿这个方向吸附（灯带沿轴向移动、缩放只动一条边）。 */
  freedom?: Point | null
}

export type SnapPlacementResult = {
  /** 需要加到所有被拖物件上的像素位移。 */
  x: number
  y: number
  guides: PlacementGuide[]
  /** 本次命中的候选键，下一次调用作为 `previous` 传回来。 */
  keys: string[]
}

const DEFAULT_WALL_THICKNESS = 0.15

type Candidate = {
  /** 约束法线（单位向量）。 */
  normal: Point
  /** 沿法线的原始差值（目标投影 − 自身投影）。 */
  offset: number
  /** 实际作用方向（`freedom` 时为自由轴）。 */
  vector: Point
  /** 沿 `vector` 需要的修正量。 */
  correction: number
  key: string
  targetId: string
  label: string
  start: Point
  end: Point
  score: number
}

/** 一次吸附计算的共享上下文。 */
type SnapContext = {
  corners: Point[]
  centroid: Point
  maxRadius: number
  movingIds: Set<string | undefined>
  previousKeys: Set<string>
  tolerance: number
  freedom: Point | null
  pixelsPerMeter: number
}

type PushCandidate = (
  normal: Point,
  targetValue: number,
  ownValue: number,
  key: string,
  targetId: string,
  label: string,
  start: Point,
  end: Point,
) => void

/** 组合的质心：多选时用所有角点的平均，不用 `moving[0]`，否则组合整体会被拉偏。 */
function cornersCentroid(corners: Point[]): Point {
  if (!corners.length) return { x: 0, y: 0 }
  let sumX = 0
  let sumY = 0
  for (const corner of corners) {
    sumX += corner.x
    sumY += corner.y
  }
  return { x: sumX / corners.length, y: sumY / corners.length }
}

/**
 * 候选入列：两层阈值。
 *
 * 第一层按法线差值过滤（避免远处的参照物），第二层按「实际修正量」过滤
 * （`freedom` 会把法线差值放大成 1/dot）。命中过的候选两层都放宽，形成迟滞。
 */
function createCandidatePusher(context: SnapContext, candidates: Candidate[]): PushCandidate {
  return (normal, targetValue, ownValue, key, targetId, label, start, end) => {
    const offset = targetValue - ownValue
    const seen = context.previousKeys.has(key)
    if (Math.abs(offset) > context.tolerance * (seen ? 1.4 : 1)) return
    let vector = normal
    let correction = offset
    if (context.freedom) {
      vector = normalizeVector(context.freedom)
      const projection = dotProduct(normal, vector)
      if (Math.abs(projection) < 0.25) return
      correction /= projection
    }
    if (Math.abs(correction) > context.tolerance * (seen ? 1.6 : 1.25)) return
    candidates.push({
      normal,
      offset,
      vector,
      correction,
      key,
      targetId,
      label,
      start,
      end,
      score: Math.abs(correction) / context.tolerance - (seen ? 0.35 : 0),
    })
  }
}

/** 一条法线上「目标的边 / 中心 / 边」与「自己的边 / 中心 / 边」两两组合。 */
function pushAxisCandidates(
  context: SnapContext,
  target: PlanRectLike,
  normal: Point,
  normalIndex: number,
  targetCorners: Point[],
  push: PushCandidate,
): void {
  const tangent = { x: -normal.y, y: normal.x }
  const ownRange = projectRange(context.corners, normal)
  const targetRange = projectRange(targetCorners, normal)
  const tangentProjections = [...context.corners, ...targetCorners].map((corner) => dotProduct(corner, tangent))
  const tangentMin = Math.min(...tangentProjections)
  const tangentMax = Math.max(...tangentProjections)
  for (let targetIndex = 0; targetIndex < 3; targetIndex += 1) {
    const targetValue = targetRange[targetIndex]
    const start = {
      x: normal.x * targetValue + tangent.x * tangentMin,
      y: normal.y * targetValue + tangent.y * tangentMin,
    }
    const end = {
      x: normal.x * targetValue + tangent.x * tangentMax,
      y: normal.y * targetValue + tangent.y * tangentMax,
    }
    for (let ownIndex = 0; ownIndex < ownRange.length; ownIndex += 1) {
      push(
        normal,
        targetValue,
        ownRange[ownIndex],
        `item:${target.id}:${normalIndex}:${targetIndex}:${ownIndex}`,
        String(target.id ?? ''),
        targetIndex === 1 ? '中心对齐' : '边缘对齐',
        start,
        end,
      )
    }
  }
}

/** 物件参照的候选：法线取「目标的轴」+「被拖件的轴」。 */
function pushItemCandidates(
  context: SnapContext,
  target: PlanRectLike,
  point: Point | null,
  push: PushCandidate,
): void {
  if (context.movingIds.has(target.id) || !(Number(target.width) > 0 && Number(target.depth) > 0)) return
  // 粗筛：目标离组合太远时连投影都不做。
  const reach =
    context.maxRadius +
    (Math.hypot(Number(target.width), Number(target.depth)) * context.pixelsPerMeter) / 2 +
    1.5 * context.pixelsPerMeter
  if (vectorLength(subtract(target, context.centroid)) > reach) return
  const targetCorners = itemPlanCorners(target, context.pixelsPerMeter)
  const normals = [...itemAxes(target), ...(point ? [] : itemAxes(referenceMovingAxis(context)))]
  normals.forEach((normal, normalIndex) => {
    // 两根轴共线（或反向）时只算一次，否则同一个候选会出现两条。
    if (normals.slice(0, normalIndex).some((other) => Math.abs(dotProduct(other, normal)) > 0.99999)) return
    pushAxisCandidates(context, target, normal, normalIndex, targetCorners, push)
  })
}

/** 被拖件的第二组轴：`moving[0]` 的朝向（组合里其余件按组合包围盒处理）。 */
function referenceMovingAxis(context: SnapContext & { moving?: PlanRectLike[] }): PlanRectLike {
  return context.moving?.[0] ?? { x: 0, y: 0, width: 1, depth: 1 }
}

/** 墙面参照的候选：按 `thickness / 2` 向两侧偏移，支持斜墙。 */
function pushWallCandidates(
  context: SnapContext,
  wall: { id?: string; start: Point; end: Point; thickness?: number },
  point: Point | null,
  push: PushCandidate,
): void {
  const delta = subtract(wall.end, wall.start)
  if (vectorLength(delta) < 1e-6) return
  const unit = normalizeVector(delta)
  const normal = { x: -unit.y, y: unit.x }
  const ownAlongWall = projectRange(context.corners, unit)
  const startAlong = dotProduct(wall.start, unit)
  const endAlong = dotProduct(wall.end, unit)
  // 沿着墙的方向完全不重叠就不可能是「贴这面墙」。
  if (
    ownAlongWall[2] < Math.min(startAlong, endAlong) - context.tolerance ||
    ownAlongWall[0] > Math.max(startAlong, endAlong) + context.tolerance
  ) {
    return
  }
  const ownAcrossWall = projectRange(context.corners, normal)
  const wallAcross = dotProduct(wall.start, normal)
  const halfThickness = ((Number(wall.thickness) || DEFAULT_WALL_THICKNESS) * context.pixelsPerMeter) / 2
  for (const sign of [-1, 1]) {
    const shift = sign * halfThickness
    // 点吸附说明「这一侧就是要落的地方」；整件拖动时取靠近的那条边。
    const ownIndex = point || sign > 0 ? 0 : 2
    push(
      normal,
      wallAcross + shift,
      ownAcrossWall[ownIndex],
      `wall:${wall.id}:${sign}`,
      String(wall.id ?? ''),
      '贴合墙面',
      { x: wall.start.x + normal.x * shift, y: wall.start.y + normal.y * shift },
      { x: wall.end.x + normal.x * shift, y: wall.end.y + normal.y * shift },
    )
  }
}

/**
 * 第二根**垂直**引导线：同时对齐「右边贴柜子」和「上边留 20cm」是常态。
 *
 * 两条约束解出的位移要落在容差附近，否则说明它们「不兼容」（同一轴上互相打架）。
 */
function combinePerpendicular(
  best: Candidate,
  candidates: Candidate[],
  tolerance: number,
): { x: number; y: number; chosen: Candidate[] } {
  const perpendicular = candidates.find(
    (candidate) => Math.abs(candidate.normal.x * best.normal.y - candidate.normal.y * best.normal.x) > 0.35,
  )
  if (!perpendicular) return { x: best.vector.x * best.correction, y: best.vector.y * best.correction, chosen: [best] }
  const determinant = best.normal.x * perpendicular.normal.y - best.normal.y * perpendicular.normal.x
  const solvedX = (best.offset * perpendicular.normal.y - best.normal.y * perpendicular.offset) / determinant
  const solvedY = (best.normal.x * perpendicular.offset - best.offset * perpendicular.normal.x) / determinant
  return Math.hypot(solvedX, solvedY) <= tolerance * 1.8
    ? { x: solvedX, y: solvedY, chosen: [best, perpendicular] }
    : { x: best.vector.x * best.correction, y: best.vector.y * best.correction, chosen: [best] }
}

export function snapPlacement(input: SnapPlacementInput): SnapPlacementResult {
  const {
    moving = [],
    point = null,
    targets = [],
    walls = [],
    pixelsPerMeter,
    tolerance,
    previous = [],
    freedom = null,
  } = input
  if (!(pixelsPerMeter > 0 && tolerance > 0) || (!point && !moving[0])) {
    return { x: 0, y: 0, guides: [], keys: [] }
  }
  const corners = point ? [point] : moving.flatMap((item) => itemPlanCorners(item, pixelsPerMeter))
  const centroid = cornersCentroid(corners)
  const context: SnapContext & { moving?: PlanRectLike[] } = {
    corners,
    centroid,
    maxRadius: Math.max(...corners.map((corner) => vectorLength(subtract(corner, centroid)))),
    movingIds: new Set(moving.map((item) => item.id)),
    previousKeys: new Set(previous),
    tolerance,
    freedom,
    pixelsPerMeter,
    moving,
  }
  const candidates: Candidate[] = []
  const push = createCandidatePusher(context, candidates)
  for (const target of targets) pushItemCandidates(context, target, point, push)
  for (const wall of walls) pushWallCandidates(context, wall, point, push)
  candidates.sort((first, second) => first.score - second.score || first.key.localeCompare(second.key))
  const best = candidates[0]
  if (!best) return { x: 0, y: 0, guides: [], keys: [] }
  // `freedom` 下只有一个自由度，不存在「第二根线」。
  const combined = freedom
    ? { x: best.vector.x * best.correction, y: best.vector.y * best.correction, chosen: [best] }
    : combinePerpendicular(best, candidates, tolerance)
  return {
    x: combined.x,
    y: combined.y,
    guides: combined.chosen.map(({ start, end, targetId, label }) => ({ start, end, targetId, label })),
    keys: combined.chosen.map((candidate) => candidate.key),
  }
}
