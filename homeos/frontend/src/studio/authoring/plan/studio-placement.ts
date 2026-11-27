/**
 * 平面摆放的公共几何（0.8.7 `studio-placement-guides.js` 的 `itemPlanCorners` /
 * `placementTolerance` / 投影工具，以及 `studio-distance-rulers.js` 的凸包与射线求交）。
 *
 * 为什么把标尺和吸附的几何放在一个文件：两者用的是同一套「旋转后四角（OBB）」语义 ——
 * 标尺要沿本体局部法线量到墙/邻件，吸附要把 OBB 投影到同一根轴上比较。
 * 各自复制一份，迟早会出现「标尺读 0mm 但拖过去吸不上」这种互相矛盾的结果。
 *
 * 单位约定：`x / y` 是**平面像素**，`width / depth` 是**米**；本模块只在
 * `itemPlanCorners` 里做一次 `width * ppm / 2`，其余函数都吃像素。
 */
export type Point = { x: number; y: number }

/** 只读需要的字段：`points` 相关的纯函数不引入宽类型。 */
export type PlanRectLike = {
  x: number
  y: number
  width: number
  depth: number
  rotation?: number
  id?: string
  type?: string
  name?: string
  remark?: string
  thickness?: number
}

/** 物件四角（平面像素），顺序 `[-1,-1] [1,-1] [1,1] [-1,1]`，随 `rotation` 旋转。 */
export function itemPlanCorners(item: PlanRectLike, pixelsPerMeter: number): Point[] {
  const rotation = ((Number(item.rotation) || 0) * Math.PI) / 180
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
  ].map(({ x: cornerSignX, y: cornerSignY }) => {
    const offsetX = (cornerSignX * ((Number(item.width) || 0) * pixelsPerMeter)) / 2
    const offsetY = (cornerSignY * ((Number(item.depth) || 0) * pixelsPerMeter)) / 2
    return {
      x: Number(item.x) + offsetX * cos - offsetY * sin,
      y: Number(item.y) + offsetX * sin + offsetY * cos,
    }
  })
}

/**
 * 吸附容差（平面像素）。
 *
 * 与缩放无关的固定像素容差在不同比例尺下手感完全不同：放大到 400% 还按 13px 算，
 * 实际只有 3cm；缩小到 50% 时又变成 26cm —— 于是「吸附」在缩小时像磁铁、放大时像没开。
 * 上游按 `13 / zoom` 换算并夹在 `0.3%–15%` 的物件尺度之间，这里照抄。
 */
export function placementTolerance(pixelsPerMeter: number, zoom: number, base = 13): number {
  const scale = pixelsPerMeter > 0 ? pixelsPerMeter : 1
  const safeZoom = zoom > 0 ? zoom : 1
  return Math.min(0.15 * scale, Math.max(0.003 * scale, base / Math.max(safeZoom, 0.01)))
}

export function subtract(first: Point, second: Point): Point {
  return { x: first.x - second.x, y: first.y - second.y }
}

export function dotProduct(first: Point, second: Point): number {
  return first.x * second.x + first.y * second.y
}

export function crossProduct(first: Point, second: Point): number {
  return first.x * second.y - first.y * second.x
}

export function vectorLength(vector: Point): number {
  return Math.hypot(vector.x, vector.y)
}

export function normalizeVector(vector: Point): Point {
  const length = vectorLength(vector) || 1
  return { x: vector.x / length, y: vector.y / length }
}

/** 物件的两根局部轴（单位向量）：长度轴与进深轴。 */
export function itemAxes(item: PlanRectLike): [Point, Point] {
  const rotation = ((Number(item.rotation) || 0) * Math.PI) / 180
  return [
    { x: Math.cos(rotation), y: Math.sin(rotation) },
    { x: -Math.sin(rotation), y: Math.cos(rotation) },
  ]
}

/** 点集在某轴上的投影区间 `[最小, 中心, 最大]`。 */
export function projectRange(points: Point[], axis: Point): [number, number, number] {
  const projections = points.map((point) => dotProduct(point, axis))
  const minimum = Math.min(...projections)
  const maximum = Math.max(...projections)
  return [minimum, (minimum + maximum) / 2, maximum]
}

/**
 * 单调链凸包。
 *
 * 共线的中间点会被剔除（`<= 1e-9` 判据）：Minkowski 和会产生大量共线冗余点，
 * 不剔除的话后面的射线-多边形求交要把每一条冗余边都算一遍。
 */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.slice()
  const sorted = points.slice().sort((first, second) => first.x - second.x || first.y - second.y)
  const lower: Point[] = []
  const upper: Point[] = []
  for (const point of sorted) {
    while (
      lower.length > 1 &&
      crossProduct(
        subtract(lower[lower.length - 1], lower[lower.length - 2]),
        subtract(point, lower[lower.length - 1]),
      ) <= 1e-9
    )
      lower.pop()
    lower.push(point)
  }
  for (const point of sorted.reverse()) {
    while (
      upper.length > 1 &&
      crossProduct(
        subtract(upper[upper.length - 1], upper[upper.length - 2]),
        subtract(point, upper[upper.length - 1]),
      ) <= 1e-9
    )
      upper.pop()
    upper.push(point)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * 从原点沿 `direction` 射出，与凸多边形第一次相交的参数 `t`。
 *
 * 返回 `null` 表示：原点在多边形内、射线与该多边形无交，或只有反方向的交。
 * 这是 slab 法在多边形上的推广 —— 每一条边给出一个 `t` 的上下界。
 */
export function rayPolygonDistance(polygon: Point[], direction: Point): number | null {
  let minimumT = -Infinity
  let maximumT = Infinity
  for (let index = 0; index < polygon.length; index += 1) {
    const point = polygon[index]
    const edge = subtract(polygon[(index + 1) % polygon.length], point)
    const denominator = crossProduct(edge, direction)
    const numerator = crossProduct(edge, point)
    if (Math.abs(denominator) < 1e-10) {
      // 射线与这条边平行：只要原点在这条边的外侧，就不可能相交。
      if (numerator > 1e-8) return null
      continue
    }
    if (denominator > 0) minimumT = Math.max(minimumT, numerator / denominator)
    else maximumT = Math.min(maximumT, numerator / denominator)
  }
  if (minimumT > maximumT + 1e-7 || maximumT < 1e-7 || minimumT < -1e-7) return null
  return Math.max(0, minimumT)
}

/** 线段 `a→b` 与 `c→d` 的交点；平行/共线时返回 `null`。 */
function segmentIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const ab = subtract(b, a)
  const cd = subtract(d, c)
  const denominator = crossProduct(ab, cd)
  if (Math.abs(denominator) < 1e-10) return null
  const offset = subtract(c, a)
  const t = crossProduct(offset, cd) / denominator
  const u = crossProduct(offset, ab) / denominator
  if (t < -1e-7 || t > 1 + 1e-7 || u < -1e-7 || u > 1 + 1e-7) return null
  return { x: a.x + ab.x * t, y: a.y + ab.y * t }
}

/**
 * 平移后物件的边与目标多边形的最先接触点（离 `origin` 最近的那个交点）。
 *
 * 只用来给标尺一条**看得见**的线段：起点在物件表面、终点在参照物表面。
 * 全靠距离数值也能算，但线段端点落在哪一侧决定了「这条线画出来对不对」。
 */
export function closestReachPoint(
  itemCorners: Point[],
  polygon: Point[],
  direction: Point,
  distance: number,
  origin: Point,
): Point {
  const shifted = itemCorners.map((corner) => ({
    x: corner.x + direction.x * distance,
    y: corner.y + direction.y * distance,
  }))
  const hits: Point[] = []
  for (let itemIndex = 0; itemIndex < 4; itemIndex += 1) {
    const itemStart = shifted[itemIndex]
    const itemEnd = shifted[(itemIndex + 1) % 4]
    for (let targetIndex = 0; targetIndex < polygon.length; targetIndex += 1) {
      const targetStart = polygon[targetIndex]
      const targetEnd = polygon[(targetIndex + 1) % polygon.length]
      const hit = segmentIntersection(itemStart, itemEnd, targetStart, targetEnd)
      if (hit) hits.push(hit)
    }
  }
  if (!hits.length) return origin
  hits.sort(
    (first, second) =>
      Math.hypot(first.x - origin.x, first.y - origin.y) - Math.hypot(second.x - origin.x, second.y - origin.y),
  )
  return hits[0]
}

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
