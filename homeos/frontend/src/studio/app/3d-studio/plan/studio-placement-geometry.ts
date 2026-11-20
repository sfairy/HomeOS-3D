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
