import {
  closestReachPoint,
  convexHull,
  crossProduct,
  itemPlanCorners,
  normalizeVector,
  rayPolygonDistance,
  subtract,
  vectorLength,
  type PlanRectLike,
  type Point,
} from './studio-placement'
import type {
  LightRangeArchiveEntry,
  LightRangeArchiveStore,
  LightRegionDescriptor,
  LightRegionOverrides,
  LightRegionOverrideStore,
} from '@/domain/api/studio'

/**
 * 接触阴影的位姿解析器：给一根节点返回「阴影烘焙时用的世界矩阵」。
 * 节点若带 userData.contactShadowRestMatrix（静止姿态），用它覆盖自身矩阵；
 * 覆盖会沿父链向上传染，子节点跟着用被覆盖的父世界矩阵相乘。
 */
export function createContactShadowPoseResolver() {
  const poseByObject = new Map()
  function resolvePose(object: any): any {
    if (poseByObject.has(object)) return poseByObject.get(object)
    const parentPose: any = object.parent ? resolvePose(object.parent) : null,
      restMatrix = object.userData?.contactShadowRestMatrix,
      hasRestMatrix = Array.isArray(restMatrix) && restMatrix.length === 16 && restMatrix.every(Number.isFinite),
      overridden: any = hasRestMatrix || !!parentPose?.overridden
    let worldMatrix = object.matrixWorld
    if (overridden) {
      const localMatrix = hasRestMatrix ? object.matrix.clone().fromArray(restMatrix) : object.matrix
      worldMatrix = parentPose ? parentPose.world.clone().multiply(localMatrix) : localMatrix.clone()
    }
    const pose: any = {
      world: worldMatrix,
      overridden: overridden,
    }
    return (poseByObject.set(object, pose), pose)
  }
  return (object: any) => resolvePose(object).world
}

/**
 * 毫米间距标尺（0.8.7 `studio-distance-rulers.js` 的对应实现）。
 *
 * 给选中物件量出「到墙面」和「到相邻物件」的最近间距，并支持直接输入毫米。
 *
 * **单位约定（最容易错的地方）**：场景里 `x / y` 是**平面像素**，而
 * `width / depth / height / elevation` 是**米**。所以本模块所有对外函数都显式接收
 * `pixelsPerMeter`：几何在像素空间算（与墙面 start/end 同一坐标系），
 * `DistanceGap.meters` 是米（换算只做一次，在产出时）。
 *
 * **为什么按旋转四角算**：早期版本用轴对齐包围盒（AABB），旋转 30° 的沙发量出来是
 * 「包围盒到墙」，比真实最近的表面远出十几厘米。0.8.7 用本体局部法线 + Minkowski 凸包，
 * 量的是**真实外表面**，标尺线也正好落在物件边上。
 */

/** 本体的四条局部方向（0.8.7 的 `key` 与中文名）。 */
export type RulerSideKey = 'width-' | 'width+' | 'depth-' | 'depth+'

export const RULER_SIDE_KEYS: readonly RulerSideKey[] = ['width-', 'width+', 'depth-', 'depth+']

/** 方向 → 中文（面板与标尺标签共用）。 */
export const RULER_SIDE_LABELS: Record<RulerSideKey, string> = {
  'width-': '本体左侧',
  'width+': '本体右侧',
  'depth-': '本体后侧',
  'depth+': '本体前侧',
}

/** 一条标尺：方向、间距（米）、参照物、两端点（平面像素）。 */
export type DistanceGap = {
  key: RulerSideKey
  /** 中文方向名（`本体左侧` …）。 */
  name: string
  /** 本体局部方向（单位向量，平面像素空间）。 */
  direction: Point
  targetId: string
  targetKind: 'item' | 'wall'
  /** 参照物记录（墙面记录或物件记录），供名称 / 备注展示。 */
  target: Record<string, unknown>
  /** 参照物位姿指纹：提交前用它判断「参照物是否被挪过」。 */
  targetStamp: string
  /** 间距（米）。0 表示贴合。 */
  meters: number
  /** 标尺线段起点（物件表面，平面像素）。 */
  start: Point
  /** 标尺线段终点（参照物表面，平面像素）。 */
  end: Point
}

export type MeasureInput = {
  item: PlanRectLike
  items: PlanRectLike[]
  /** 墙面：`start / end` 已是平面像素，`thickness` 是米。 */
  walls: Array<{ id?: string; start: Point; end: Point; thickness?: number }>
  pixelsPerMeter: number
  /** 超过这个距离（米）就不画：户型外的空旷区域标尺没有意义。 */
  maxMeters?: number
}

/** 默认墙面厚度（米）：与 `applyToolSetting` / 场景构建的缺省保持一致。 */
const DEFAULT_WALL_THICKNESS = 0.15
const DEFAULT_MAX_METERS = 100

type TargetPolygon = {
  id: string
  kind: 'item' | 'wall'
  record: Record<string, unknown>
  polygon: Point[]
}

/**
 * 参照物位姿指纹（0.8.7 `targetStamp` = `JSON.stringify(record)`）。
 *
 * 为什么整条序列化而不是挑几个字段：上游连 `remark`（备注）都算进去 —— 标尺输入框
 * 正在编辑时改备注，旧读数就该作废。少挑字段会让「改完备注按旧读数移动」这种情况溜过去。
 */
export function targetStampOf(target: Record<string, unknown> | undefined | null): string {
  if (!target) return ''
  try {
    return JSON.stringify(target)
  } catch {
    // 记录里可能有循环引用（极少见）：退化成「无法校验」，由调用方重新测量。
    return ''
  }
}

/** 墙面 → 按厚度向两侧偏移后的矩形（平面像素）。 */
function wallPolygon(wall: MeasureInput['walls'][number], pixelsPerMeter: number): Point[] | null {
  const start = wall.start
  const end = wall.end
  const deltaX = Number(end.x) - Number(start.x)
  const deltaY = Number(end.y) - Number(start.y)
  const length = Math.hypot(deltaX, deltaY)
  if (length < 1e-7) return null
  const halfThickness = ((Number(wall.thickness) || DEFAULT_WALL_THICKNESS) * pixelsPerMeter) / 2
  const offsetX = (-deltaY / length) * halfThickness
  const offsetY = (deltaX / length) * halfThickness
  return [
    { x: start.x + offsetX, y: start.y + offsetY },
    { x: start.x - offsetX, y: start.y - offsetY },
    { x: end.x - offsetX, y: end.y - offsetY },
    { x: end.x + offsetX, y: end.y + offsetY },
  ]
}

/** 四条本体局部方向（沿物件自身的宽/深轴，而不是世界轴）。 */
function rulerDirections(item: PlanRectLike): Array<{ key: RulerSideKey; name: string; direction: Point }> {
  const rotation = ((Number(item.rotation) || 0) * Math.PI) / 180
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return [
    { key: 'width-', name: RULER_SIDE_LABELS['width-'], direction: { x: -cos, y: -sin } },
    { key: 'width+', name: RULER_SIDE_LABELS['width+'], direction: { x: cos, y: sin } },
    { key: 'depth-', name: RULER_SIDE_LABELS['depth-'], direction: { x: sin, y: -cos } },
    { key: 'depth+', name: RULER_SIDE_LABELS['depth+'], direction: { x: -sin, y: cos } },
  ]
}

/** 参照物候选：其它物件（排除自己、无尺寸、隐藏已由调用方过滤）。 */
function collectItemPolygons(item: PlanRectLike, items: PlanRectLike[], pixelsPerMeter: number): TargetPolygon[] {
  const polygons: TargetPolygon[] = []
  for (const candidate of items) {
    if (candidate.id !== undefined && candidate.id === item.id) continue
    if (!(Number(candidate.width) > 0 && Number(candidate.depth) > 0)) continue
    polygons.push({
      id: String(candidate.id ?? ''),
      kind: 'item',
      record: candidate as unknown as Record<string, unknown>,
      polygon: itemPlanCorners(candidate, pixelsPerMeter),
    })
  }
  return polygons
}

/** 参照物候选：墙面按厚度生成矩形（零厚度墙面会让「贴墙 0mm」永远差半堵墙）。 */
function collectWallPolygons(walls: MeasureInput['walls'], pixelsPerMeter: number): TargetPolygon[] {
  const polygons: TargetPolygon[] = []
  for (const wall of walls) {
    const polygon = wallPolygon(wall, pixelsPerMeter)
    if (!polygon) continue
    polygons.push({
      id: String(wall.id ?? ''),
      kind: 'wall',
      record: wall as unknown as Record<string, unknown>,
      polygon,
    })
  }
  return polygons
}

/**
 * Minkowski 和：把「物件平移多少才会碰到参照物」变成「原点射线与凸包的交点」。
 *
 * 直觉：参照物多边形的每一点都减去物件的四个角，得到的点集就是所有「刚好接触」的平移量。
 * 于是「沿某个方向最近的间距」= 从原点沿该方向第一次进入这个凸包的距离。
 */
function sweepHull(itemCorners: Point[], polygon: Point[]): Point[] {
  const candidates: Point[] = []
  for (const corner of polygon) {
    for (const itemCorner of itemCorners) candidates.push(subtract(corner, itemCorner))
  }
  return convexHull(candidates)
}

/**
 * 量出四条方向上最近的间距。
 *
 * 每个方向只留**最近**的一个参照物：标尺回答的是「我要贴过去还差多少」，
 * 同时画到五件家具的距离只会糊成一团。某个方向没有参照物就不出这条标尺
 * （上游用 `flatMap`，缺一条不影响其它三条）。
 */
export function measureItemGaps({
  item,
  items,
  walls,
  pixelsPerMeter,
  maxMeters = DEFAULT_MAX_METERS,
}: MeasureInput): DistanceGap[] {
  if (!(pixelsPerMeter > 0) || !(Number(item.width) > 0 && Number(item.depth) > 0)) return []
  const itemCorners = itemPlanCorners(item, pixelsPerMeter)
  const targets = [...collectItemPolygons(item, items, pixelsPerMeter), ...collectWallPolygons(walls, pixelsPerMeter)]
  const withSweep = targets.map((target) => ({ ...target, sweep: sweepHull(itemCorners, target.polygon) }))
  const maxPixels = maxMeters * pixelsPerMeter
  return rulerDirections(item).flatMap(({ key, name, direction }) => {
    let best: (TargetPolygon & { sweep: Point[]; distance: number }) | null = null
    for (const target of withSweep) {
      const distance = rayPolygonDistance(target.sweep, direction)
      if (distance === null || distance > maxPixels) continue
      if (best && distance >= best.distance - 1e-7) continue
      best = { ...target, distance }
    }
    if (!best) return []
    const origin = {
      x: Number(item.x) + direction.x * best.distance,
      y: Number(item.y) + direction.y * best.distance,
    }
    const end = closestReachPoint(itemCorners, best.polygon, direction, best.distance, origin)
    return [
      {
        key,
        name,
        direction,
        targetId: best.id,
        targetKind: best.kind,
        target: best.record,
        targetStamp: targetStampOf(best.record),
        meters: best.distance / pixelsPerMeter,
        start: { x: end.x - direction.x * best.distance, y: end.y - direction.y * best.distance },
        end,
      },
    ]
  })
}

/** 标尺可接受的输入范围（毫米）：与 0.8.7 的提示一致。 */
export const RULER_MIN_MM = 0
export const RULER_MAX_MM = 100000

/**
 * 输入校验：返回 `null` 表示非法（提示文案由调用方给）。
 *
 * 不取整：0.8.7 的输入框接受 `405.374` 这种读数，取整会让「读出来 405.374、
 * 输回去变成 405」在原处产生 0.374mm 的跳变。
 */
export function parseRulerMillimeters(raw: unknown): number | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  if (value < RULER_MIN_MM || value > RULER_MAX_MM) return null
  return value
}

/**
 * 米 → 标尺读数（毫米，最多 3 位小数、去掉尾零）。
 *
 * 对应 0.8.7 `studio-distance-rulers.js` 的 `String(Number((m*1000).toFixed(3)))`：
 * 标签因此会出现 `405.374 mm` / `278.6 mm`，而不是被取整成 `405 mm` / `279 mm`。
 */
export function metersToMillimeters(meters: number): number {
  return Number(Number(Number(meters || 0) * 1000).toFixed(3))
}

/**
 * 按标尺方向把物件推到「距参照物 N 米」。
 *
 * 只改一条方向上的位置：标尺回答的是「这一个方向差多少」，顺手修正另一个轴
 * 会让用户觉得「输入 200 结果位置整体跳了」。
 *
 * @param meters 目标间距（米，已由毫米输入除以 1000）
 */
export function positionForGap(
  item: PlanRectLike,
  gap: Pick<DistanceGap, 'direction' | 'meters'>,
  meters: number,
  pixelsPerMeter: number,
): Point {
  if (!(Number.isFinite(meters) && meters >= 0 && meters <= 100 && pixelsPerMeter > 0)) {
    throw Error('请输入 0–100000 mm 的有效间距')
  }
  const delta = (gap.meters - meters) * pixelsPerMeter
  return {
    x: Number(item.x) + gap.direction.x * delta,
    y: Number(item.y) + gap.direction.y * delta,
  }
}

/** 方向单位向量（供吸附 / 测试复用）。 */
export function rulerDirectionUnit(gap: Pick<DistanceGap, 'direction'>): Point {
  return normalizeVector(gap.direction)
}

/** 方向向量的叉积（诊断用：判断两条标尺是否互相垂直）。 */
export function rulerDirectionsPerpendicular(
  first: Pick<DistanceGap, 'direction'>,
  second: Pick<DistanceGap, 'direction'>,
): boolean {
  return Math.abs(crossProduct(first.direction, second.direction)) > 0.999
}

/** 线段长度（诊断 / 测试用）。 */
export function gapLengthPixels(gap: Pick<DistanceGap, 'start' | 'end'>): number {
  return vectorLength(subtract(gap.end, gap.start))
}

/**
 * 屏幕坐标的视图旋转：`planToScreen` 之后再做一次**绕视口中心**的 `+rotation`。
 *
 * 为什么标尺必须自己转这一次：画布在 `refreshStudioView` 里用
 * `translate(中心) → rotate(planView.rotation) → translate(-中心)` 旋转整个平面，
 * 而标尺的 HTML 标签与标尺虚线都是**独立于画布**绘制的（叠层 / `restore()` 之后）。
 * 只用 `planToScreen` 会让它们停在未旋转的位置 —— 视图转 180° 时就变成关于视口中心
 * 的镜像，读数正确但贴在别处（「边距显示错位」）。
 *
 * 与 `plan-coords.ts` 的 `screenToPlanPoint`（`-rotation`）互为逆变换：
 * 「鼠标点哪，标签就落在哪」，否则输入的间距会落到别的物件上。
 *
 * 按**每次渲染建一次**的投影器用（`createViewRotation`）：一帧里 4 条标尺的两端、
 * 4 个手柄角点加旋转手柄共十来个点，共用同一次变换，既不重复算，
 * 也不会出现「标签用了这一帧、虚线用了下一帧」的错位。
 */
export function createViewRotation(
  rotationDegrees: number,
  viewport: { width: number; height: number },
): (point: Point) => Point {
  const rotation = Number(rotationDegrees) || 0
  const halfWidth = (Number(viewport.width) || 0) / 2
  const halfHeight = (Number(viewport.height) || 0) / 2
  // 零旋转原样返回。除了省算，也让「未旋转视图」这条最常见的路径保持**逐位不变**。
  if (!rotation) return (point) => point

  // 平面视图只按 90° 步进（`plan-coords.ts` 的 `rotatePlanView` 每次 +90°）。
  // 四分之一转用整数「交换 / 取反」而不是三角函数：三角函数会把 554 算成
  // 554.0000000000001，标签 left 上就会写出带一长串小数的 px；归一化之后
  // 360° / -90° 这类等价角度也不必再算一次。
  const quarterTurns = rotation / 90
  if (Math.abs(quarterTurns - Math.round(quarterTurns)) < 1e-9) {
    const steps = ((Math.round(quarterTurns) % 4) + 4) % 4
    if (!steps) return (point) => point
    // 屏幕 y 向下，所以 +90° 与 canvas `rotate()` 同向：(dx, dy) → (-dy, dx)。
    const turn = steps === 1 ? turnOneQuarter : steps === 2 ? turnHalf : turnThreeQuarters
    return (point) => {
      const [rotatedX, rotatedY] = turn(point.x - halfWidth, point.y - halfHeight)
      return { x: halfWidth + rotatedX, y: halfHeight + rotatedY }
    }
  }

  // 兜底：理论上不会走到这里（视图旋转是 90° 的倍数），但别让非整转直接算错。
  const radians = (rotation * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return (point) => {
    const centeredX = point.x - halfWidth
    const centeredY = point.y - halfHeight
    return {
      x: halfWidth + centeredX * cos - centeredY * sin,
      y: halfHeight + centeredX * sin + centeredY * cos,
    }
  }
}

/** 绕中心 +90°（屏幕坐标，y 向下）。 */
const turnOneQuarter = (x: number, y: number): [number, number] => [-y, x]
/** 绕中心 180°。 */
const turnHalf = (x: number, y: number): [number, number] => [-x, -y]
/** 绕中心 +270°（等价 -90°）。 */
const turnThreeQuarters = (x: number, y: number): [number, number] => [y, -x]

/** 单点的便捷包装（测试 / 一次性换算用；批量请用 `createViewRotation`）。 */
export function rotateScreenForView(
  point: Point,
  rotationDegrees: number,
  viewport: { width: number; height: number },
): Point {
  return createViewRotation(rotationDegrees, viewport)(point)
}

/* ---------------------------------------------------------------- 标签排版 */

/**
 * 标签排版用的盒子尺寸（屏幕像素）。
 *
 * `fullHeight` 要含上方那行参照物名称：它是绝对定位在标签上沿**之外**的，
 * 漏掉的话候选评分会以为「标签没压到东西」，两条标尺的名字就会叠在一起。
 */
export type LabelMetrics = {
  halfWidth: number
  halfHeight: number
  fullHeight: number
}

export type ScreenRect = { left: number; right: number; top: number; bottom: number }

/** 障碍分档：`hard` 压住就藏（挡住手柄操作），`soft` 只扣分（另一条标尺的标签）。 */
export type LabelObstacles = { hard: ScreenRect[]; soft: ScreenRect[] }

export type LabelPlacement = {
  point: Point
  rect: ScreenRect
  /** 与 `hard` 障碍的重叠面积：> 0 表示「这条标签该藏起来」。 */
  hardCovered: number
  score: number
}

/** 候选落点的网格阶数（0.8.7 `[0,-1,1,-2,2]`，两个方向各五档）。 */
export const LABEL_CANDIDATE_STEPS: readonly number[] = [0, -1, 1, -2, 2]
/** 候选之间的步距留白（0.8.7 的 `+6`）。 */
export const LABEL_STEP_GAP = 6
/** 压住手柄框的权重：任何正面积都远大于「软遮挡 + 距离」，保证能躲就躲。 */
export const HARD_OBSTACLE_WEIGHT = 1e8
/** 软遮挡的权重：仍优先错开，但不会因此整条消失。 */
export const SOFT_OBSTACLE_WEIGHT = 4e3

function rectAt(point: Point, metrics: LabelMetrics): ScreenRect {
  return {
    left: point.x - metrics.halfWidth,
    right: point.x + metrics.halfWidth,
    top: point.y - metrics.fullHeight,
    bottom: point.y + metrics.halfHeight,
  }
}

function overlapArea(first: ScreenRect, second: ScreenRect): number {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top))
  return width * height
}

function overlapAreaTotal(rect: ScreenRect, obstacles: ScreenRect[]): number {
  return obstacles.reduce((sum, obstacle) => sum + overlapArea(rect, obstacle), 0)
}

/** 夹进视口：标签整体留在可视区内（含上方参照物名的那一截）。 */
function clampInsideViewport(point: Point, metrics: LabelMetrics, viewport: { width: number; height: number }): Point {
  const { halfWidth, halfHeight, fullHeight } = metrics
  return {
    x: Math.max(halfWidth, Math.min(viewport.width - halfWidth, point.x)),
    y: Math.max(fullHeight, Math.min(viewport.height - halfHeight, point.y)),
  }
}

/** 首选点周围的候选：25 档网格 + 贴着每个障碍四条边的落点。 */
function labelCandidates(preferred: Point, metrics: LabelMetrics, obstacles: LabelObstacles): Point[] {
  const { halfWidth, halfHeight, fullHeight } = metrics
  const candidates: Point[] = []
  for (const stepY of LABEL_CANDIDATE_STEPS) {
    for (const stepX of LABEL_CANDIDATE_STEPS) {
      candidates.push({
        x: preferred.x + stepX * (halfWidth * 2 + LABEL_STEP_GAP),
        y: preferred.y + stepY * (fullHeight + halfHeight + LABEL_STEP_GAP),
      })
    }
  }
  // 贴边候选是「绕开手柄框」唯一的出路：网格候选被夹进视口之后往往仍压住它。
  // 软障碍（已放下的标签）同样给候选，好让两条标尺错开而不是硬叠。
  for (const group of [obstacles.hard, obstacles.soft]) {
    for (const obstacle of group) {
      candidates.push(
        { x: obstacle.left - halfWidth - LABEL_STEP_GAP, y: preferred.y },
        { x: obstacle.right + halfWidth + LABEL_STEP_GAP, y: preferred.y },
        { x: preferred.x, y: obstacle.top - halfHeight - LABEL_STEP_GAP },
        { x: preferred.x, y: obstacle.bottom + fullHeight + LABEL_STEP_GAP },
      )
    }
  }
  return candidates
}

/**
 * 单个候选的得分：先「硬遮挡」，再「软遮挡」，最后才是「离首选点多远」。
 *
 * 三档必须跨数量级：硬遮挡任何正面积都该胜过「软遮挡 + 距离」，
 * 软遮挡又该胜过纯距离（宁可挪一格，也不要两条读数压在一起）。
 */
function labelScore(
  rect: ScreenRect,
  point: Point,
  preferred: Point,
  obstacles: LabelObstacles,
): { score: number; hardCovered: number } {
  const hardCovered = overlapAreaTotal(rect, obstacles.hard)
  const softCovered = overlapAreaTotal(rect, obstacles.soft)
  return {
    hardCovered,
    score:
      hardCovered * HARD_OBSTACLE_WEIGHT +
      softCovered * SOFT_OBSTACLE_WEIGHT +
      (point.x - preferred.x) ** 2 +
      (point.y - preferred.y) ** 2,
  }
}

/**
 * 在候选里挑「遮挡最少、离首选点最近」的落点。
 *
 * 与 0.8.7 的差异留在**调用方**：`hardCovered > 0` 只说明「压住了手柄框」，
 * 是否隐藏由 UI 层决定（正在输入的标签不藏）。
 */
export function bestLabelPlacement(
  preferred: Point,
  metrics: LabelMetrics,
  viewport: { width: number; height: number },
  obstacles: LabelObstacles,
): LabelPlacement {
  let best: LabelPlacement | null = null
  for (const candidate of labelCandidates(preferred, metrics, obstacles)) {
    const point = clampInsideViewport(candidate, metrics, viewport)
    const rect = rectAt(point, metrics)
    const scored = labelScore(rect, point, preferred, obstacles)
    if (!best || scored.score < best.score) best = { point, rect, ...scored }
  }
  if (best) return best
  const rect = rectAt(preferred, metrics)
  return { point: preferred, rect, score: 0, hardCovered: overlapAreaTotal(rect, obstacles.hard) }
}

/**
 * 平面画布上的选中手柄（0.8.7 `studio-app.js` 选中态绘制的对应实现）。
 *
 * 0.8.7 的形态只有三样：
 * - 旋转矩形四边的 **虚线框**（`#ffb14f`、1.5px、`[5,3]`）；
 * - 四角 + 四边中点（风扇只有四角）的 **圆形标记** `drawPoint(point,'#ffb14f',3.5)`
 *   —— 深底 `#0e151b` + 2px 描边，四角与边中点完全同形；
 * - 顶边（出风口是右侧）一条 **1px 引线** + 半径 3.5 的圆点，就是旋转控制。
 *
 * 上一版在这里画过「一圈旋转环 + 中心十字 + 四角方块 / 四边圆点混用」，
 * 那是照着截图猜的形态：0.8.7 既没有环、也没有中心十字，且手柄样式只有一种。
 * 小尺寸物件的门控也按上游：短边不足 18 屏幕像素时只留旋转圆点，其余手柄收起
 * （否则一个 20px 的插座会被 9 个标记糊死）。
 */

const HANDLE_COLOR = '#ffb14f'
/** 标记底色：深底 + 彩色描边（0.8.7 `drawPoint` 的 `#0e151b`）。标尺端点复用同一常量。 */
export const POINT_MARKER_FILL = '#0e151b'
/** 标记半径（像素）：0.8.7 `drawPoint(..., 3.5)`。 */
const HANDLE_RADIUS = 3.5
/** 手柄线宽（像素）：0.8.7 `drawPoint` 内部固定 2。 */
const HANDLE_STROKE = 2
/** 虚线框线宽 / 节奏：0.8.7 `{width:1.5, dash:[5,3]}`。 */
const FRAME_WIDTH = 1.5
const FRAME_DASH: number[] = [5, 3]
/** 短边小于该屏幕像素数时收起缩放手柄（0.8.7 的 0x12）。 */
const MIN_SIDE_PX = 18

export interface HandleDrawingDeps {
  context: CanvasRenderingContext2D
  planToScreen: (point: { x: number; y: number }) => { x: number; y: number }
  /** `buildHandleGeometry` 的返回（corners / edges / rotationStem / rotationHandle）。 */
  handles: {
    corners: Array<{ point: { x: number; y: number } }>
    edges: Array<{ point: { x: number; y: number } }>
    rotationStem: { x: number; y: number }
    rotationHandle: { x: number; y: number }
  }
  /** 物件中心（平面像素）。 */
  center: { x: number; y: number }
  /** 物件类型：风扇不画四边中点（0.8.7 同）。 */
  type?: string
}

/** 0.8.7 `drawPoint`：深底 + 彩色描边的圆点。 */
function drawMarker(context: CanvasRenderingContext2D, point: { x: number; y: number }, color = HANDLE_COLOR): void {
  context.beginPath()
  context.arc(point.x, point.y, HANDLE_RADIUS, 0, Math.PI * 2)
  context.fillStyle = POINT_MARKER_FILL
  context.fill()
  context.lineWidth = HANDLE_STROKE
  context.strokeStyle = color
  context.stroke()
}

function screenDistance(first: { x: number; y: number }, second: { x: number; y: number }): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

export function drawItemHandles(deps: HandleDrawingDeps): void {
  const { context, handles } = deps
  const corners = handles.corners.map((corner) => deps.planToScreen(corner.point))
  if (corners.length < 4) return
  context.save()

  // 虚线框：四段独立的虚线（0.8.7 用 `drawLine` 逐段画，转角处不闭合缺口）。
  context.strokeStyle = HANDLE_COLOR
  context.lineWidth = FRAME_WIDTH
  context.setLineDash(FRAME_DASH)
  context.beginPath()
  corners.forEach((corner, index) => {
    const next = corners[(index + 1) % corners.length]
    context.moveTo(corner.x, corner.y)
    context.lineTo(next.x, next.y)
  })
  context.stroke()
  context.setLineDash([])

  // 短边不足 18px 时只留旋转圆点：小件被 9 个标记盖住就点不中本体。
  const shortSide = Math.min(screenDistance(corners[0], corners[1]), screenDistance(corners[1], corners[2]))
  if (shortSide >= MIN_SIDE_PX) {
    for (const corner of corners) drawMarker(context, corner)
    if (deps.type !== 'fan') {
      for (const edge of handles.edges) drawMarker(context, deps.planToScreen(edge.point))
    }
  }

  // 旋转引线 + 圆点：0.8.7 只画这一根，不画整圈。
  const stem = deps.planToScreen(handles.rotationStem)
  const knob = deps.planToScreen(handles.rotationHandle)
  context.strokeStyle = HANDLE_COLOR
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(stem.x, stem.y)
  context.lineTo(knob.x, knob.y)
  context.stroke()
  drawMarker(context, knob)

  context.restore()
}

/**
 * 绘制页与 3D 交互控件**共用**的柔光范围存储（0.8.9 `studio-light-ranges.js`）。
 *
 * 背景：0.8.9 之前，柔光范围只存在 3D 控件的 `properties.lightRegionOverrides` 里，
 * 户型绘制页的「轻量柔光」预览看不到它；0.8.9 把它上提成**按场景（sceneId）共享**的
 * 一份数据，绘制页写入、控件读取并同步，反之亦然。
 *
 * 存储位置（studio 草稿 / 文档）：
 * - `lightRegionOverrides[sceneId][regionKey] = descriptor`
 * - `lightRangeArchive[sceneId] = [{ floorId, itemId, previous, at }, …]`
 *
 * `regionKey` 由运行时范围编辑器生成（不透明字符串），本模块只做**净化**与**按场景解析**，
 * 不解析键的内部结构 —— 这样编辑器换键格式不会波及存储层。
 *
 * 注意：`theme` 之外的场景风格（如自然木语）没有柔光支持，由 `FLOOR`/光照层判断，
 * 本模块不参与。
 */

/** 绘制页自身的柔光范围所用的保留 scene id。与 0.8.9 `STUDIO_RANGE_SCENE_ID` 同义。 */
export const STUDIO_RANGE_SCENE_ID = '__studio-floorplan__'

/**
 * 柔光范围的合约类型真源在 `@/domain/api/studio`（domain 不得反向依赖 studio）。
 * 这里再导出，既有 `from './studio'` 的相对引用无需改动。
 */
export type {
  LightRangeArchiveEntry,
  LightRangeArchiveStore,
  LightRegionDescriptor,
  LightRegionOverrides,
  LightRegionOverrideStore,
} from '@/domain/api/studio'

const MAX_SCENES = 64
const MAX_REGIONS_PER_SCENE = 512
const MAX_ARCHIVE_ENTRIES = 200
const MAX_KEY_LENGTH = 96
const MAX_ROTATION = 180

const PROFILE_KEYS = new Set([
  'shape',
  'width',
  'depth',
  'rotation',
  'softness',
  'heightMin',
  'heightMax',
  'offsetX',
  'offsetZ',
  'moveCenter',
])

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function clampOptional(value: number | undefined, min: number, max: number): number | undefined {
  return value === undefined ? undefined : value < min ? min : value > max ? max : value
}

/** 数值字段名（`NUMERIC_FIELDS` 的键只可能是这几个）。 */
type NumericProfileKey = 'width' | 'depth' | 'rotation' | 'softness' | 'heightMin' | 'heightMax' | 'offsetX' | 'offsetZ'

/** 数值字段表：顺序即写回顺序。 */
const NUMERIC_FIELDS: ReadonlyArray<readonly [NumericProfileKey, number, number]> = [
  ['width', 0.5, 20],
  ['depth', 0.5, 20],
  ['rotation', -MAX_ROTATION, MAX_ROTATION],
  ['softness', 5, 100],
  ['heightMin', 0, 20],
  ['heightMax', 0, 20],
  ['offsetX', -50, 50],
  ['offsetZ', -50, 50],
]

function normalizeShape(value: unknown): LightRegionDescriptor['shape'] | undefined {
  return value === 'circle' || value === 'square' || value === 'strip' ? value : undefined
}

function applyNumericFields(target: LightRegionDescriptor, source: Record<string, unknown>): void {
  for (const [key, min, max] of NUMERIC_FIELDS) {
    const value = clampOptional(toNumber(source[key]), min, max)
    if (value !== undefined) target[key] = value
  }
}

/** 最低照到 ≤ 最高照到：与编辑器一致，冲突时把最高抬到最低之上。 */
function normalizeHeightOrder(descriptor: LightRegionDescriptor): void {
  const { heightMin, heightMax } = descriptor
  if (heightMin === undefined || heightMax === undefined || heightMax >= heightMin) return
  descriptor.heightMax = heightMin
}

/**
 * 单个区域描述符净化。
 *
 * 只保留已知字段（`PROFILE_KEYS`），数值按绘制面板的输入范围夹取 —— 与后端
 * `valid_light_region_overrides` 同一口径，避免「前端能存、后端拒收」。
 */
export function normalizeLightRegionDescriptor(raw: unknown): LightRegionDescriptor | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  // 全是未知键时视为「没有描述符」：存档里不堆无用对象。
  if (!Object.keys(source).some((key) => PROFILE_KEYS.has(key))) return null
  const descriptor: LightRegionDescriptor = {}
  const shape = normalizeShape(source.shape)
  if (shape) descriptor.shape = shape
  applyNumericFields(descriptor, source)
  normalizeHeightOrder(descriptor)
  if (typeof source.moveCenter === 'boolean') descriptor.moveCenter = source.moveCenter
  // 只有 `shape` 的空对象等价于「没有描述符」，直接丢弃，省得存档里堆 `{}`。
  return Object.keys(descriptor).length ? descriptor : null
}

/** 单个场景的 `regionKey → descriptor` 净化。 */
export function normalizeLightRegionOverridesForScene(raw: unknown): LightRegionOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const overrides: LightRegionOverrides = {}
  let count = 0
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_REGIONS_PER_SCENE) break
    if (!key || key.length > MAX_KEY_LENGTH) continue
    const descriptor = normalizeLightRegionDescriptor(value)
    if (!descriptor) continue
    overrides[key] = descriptor
    count++
  }
  return overrides
}

/** `sceneId → overrides` 的整表净化（丢掉空场景，避免存档膨胀）。 */
export function normalizeLightRegionOverrides(raw: unknown): LightRegionOverrideStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const store: LightRegionOverrideStore = {}
  let scenes = 0
  for (const [sceneId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (scenes >= MAX_SCENES) break
    if (!sceneId || sceneId.length > MAX_KEY_LENGTH) continue
    const overrides = normalizeLightRegionOverridesForScene(value)
    if (!Object.keys(overrides).length) continue
    store[sceneId] = overrides
    scenes++
  }
  return store
}

/** 键长度受限的字符串：超长视为无效（返回空串）。 */
function boundedKey(value: unknown): string {
  const key = String(value || '')
  return key.length > MAX_KEY_LENGTH ? '' : key
}

/** 单条撤销记录净化；结构不完整返回 null。 */
function normalizeArchiveEntry(rawEntry: unknown): LightRangeArchiveEntry | null {
  if (!rawEntry || typeof rawEntry !== 'object') return null
  const entry = rawEntry as Record<string, unknown>
  const floorId = boundedKey(entry.floorId)
  const itemId = boundedKey(entry.itemId)
  if (!floorId || !itemId) return null
  const previous = entry.previous === null ? null : normalizeLightRegionDescriptor(entry.previous)
  return { floorId, itemId, previous, at: toNumber(entry.at) ?? 0 }
}

/** 单个场景的撤销记录：结构净化 + 按时间升序 + 截断到上限。 */
function normalizeArchiveScene(value: unknown): LightRangeArchiveEntry[] {
  if (!Array.isArray(value)) return []
  const entries: LightRangeArchiveEntry[] = []
  for (const rawEntry of value) {
    const entry = normalizeArchiveEntry(rawEntry)
    if (entry) entries.push(entry)
  }
  entries.sort((left, right) => left.at - right.at)
  return entries.slice(-MAX_ARCHIVE_ENTRIES)
}

/** 撤销记录净化：只保留结构完整的条目，按时间升序、超出上限时丢最旧的。 */
export function normalizeLightRangeArchive(raw: unknown): LightRangeArchiveStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const store: LightRangeArchiveStore = {}
  for (const [sceneId, value] of Object.entries(raw as Record<string, unknown>)) {
    const entries = normalizeArchiveScene(value)
    if (!boundedKey(sceneId) || !entries.length) continue
    store[sceneId] = entries
  }
  return store
}

/**
 * 解析某个场景实际生效的柔光范围。
 *
 * 优先级：`sceneId` → `STUDIO_RANGE_SCENE_ID`（绘制页写入的公共范围）。
 * 内置模板没有自己的场景记录，始终走兜底（与 0.8.9「内置模板沿用控件自己的范围」一致）。
 */
export function resolveLightRanges(
  store: LightRegionOverrideStore | undefined,
  sceneId: string | null | undefined,
  { allowDefault = true }: { allowDefault?: boolean } = {},
): LightRegionOverrides {
  if (!store) return {}
  const explicit = sceneId ? store[sceneId] : undefined
  if (explicit && Object.keys(explicit).length) return explicit
  if (!allowDefault) return explicit || {}
  return store[STUDIO_RANGE_SCENE_ID] || explicit || {}
}

/** 写入某场景的范围（返回新表，不改入参 —— 便于 React/Vue 侧比较引用）。 */
export function withLightRanges(
  store: LightRegionOverrideStore | undefined,
  sceneId: string,
  overrides: LightRegionOverrides,
): LightRegionOverrideStore {
  const next: LightRegionOverrideStore = { ...(store || {}) }
  const normalized = normalizeLightRegionOverridesForScene(overrides)
  if (Object.keys(normalized).length) next[sceneId] = normalized
  else delete next[sceneId]
  return next
}

/** 附一条撤销记录（返回新表）。 */
export function withArchivedLightRange(
  store: LightRangeArchiveStore | undefined,
  sceneId: string,
  entry: Omit<LightRangeArchiveEntry, 'at'> & { at?: number },
): LightRangeArchiveStore {
  const next: LightRangeArchiveStore = { ...(store || {}) }
  const entries = [...(next[sceneId] || [])]
  entries.push({
    floorId: entry.floorId,
    itemId: entry.itemId,
    previous: entry.previous === null ? null : normalizeLightRegionDescriptor(entry.previous),
    at: entry.at ?? Date.now(),
  })
  next[sceneId] = entries.slice(-MAX_ARCHIVE_ENTRIES)
  return next
}

/** 取出并移除最后一条撤销记录；返回 `{ store, entry }`（`entry` 为 null 表示无可撤销）。 */
export function popArchivedLightRange(
  store: LightRangeArchiveStore | undefined,
  sceneId: string,
): { store: LightRangeArchiveStore; entry: LightRangeArchiveEntry | null } {
  const next: LightRangeArchiveStore = { ...(store || {}) }
  const entries = [...(next[sceneId] || [])]
  const entry = entries.pop() ?? null
  if (entries.length) next[sceneId] = entries
  else delete next[sceneId]
  return { store: next, entry }
}

/** 只比较柔光相关字段是否变化（保存前跳过无变化写入）。 */
export function sameLightRegionOverrides(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {})
}

/**
 * 柔光范围通道（0.8.9 `studioLightRangeChannel`）。
 *
 * 上游用「通道」把「场景级共享范围」与「控件级覆盖」分开取；本项目
 * `resolveLightRanges()` 已经把两者合成一份结果，这里只导出上游名字作为
 * 语义别名，避免调用方以为有两套数据源。
 */
export const studioLightRangeChannel = resolveLightRanges

/**
 * 保存后「只改了柔光范围」的判定（0.8.9 `savedLightRangesOnlyChanged`）。
 *
 * 用途：保存成功后决定要不要重建整层灯光。只为柔光范围而重建全场景是最常见
 * 的性能浪费（一次保存几百毫秒）。
 */
export function savedLightRangesOnlyChanged(previous: unknown, next: unknown): boolean {
  return sameLightRegionOverrides(previous, next)
}

/**
 * 普通窗（矩形框 + 中梃）的盒体拆解。
 *
 * 框料深度以前写死 60mm，而默认墙厚 200mm —— 窗框像一张**悬在洞口中间的卡片**，
 * 两侧各留 70mm 的空腔，斜看时能从缝里看见墙体内部。现在按墙厚收口：两侧各留 5mm
 * 避免和墙面 z-fighting，薄墙保底 60mm、厚墙最多 200mm（再深就成了窗套）。
 *
 * 玻璃不动（25mm），始终居中 —— 玻璃跟着加厚只会让窗更像一块实心板。
 */

/** 框料向洞口内收一圈，避免和墙面共面闪烁。 */
function windowFrameBounds(width: number, height: number, sill = 0) {
  const inset = Math.min(0.001, width / 100, height / 100)
  return { width: width - 2 * inset, height: height - 2 * inset, sill: sill + inset }
}

/** 框料深度：按墙厚收口，`wallThickness` 缺省时沿用旧的 60mm。 */
export function openingFrameDepth(wallThickness?: number) {
  const thickness = Number(wallThickness)
  if (!Number.isFinite(thickness) || thickness <= 0) return 0.06
  return Math.max(0.06, Math.min(thickness - 0.01, 0.2))
}

export function windowGeometryParts(
  width: any,
  height: any,
  sillHeight: any,
  hasMullions = true,
  wallThickness?: number,
) {
  if (![width, height, sillHeight].every(Number.isFinite) || width <= 0 || height <= 0) return null
  const framed = windowFrameBounds(width, height, sillHeight)
  width = framed.width
  height = framed.height
  sillHeight = framed.sill
  const frameThickness = Math.min(0.045, width / 4, height / 4),
    frameDepth = openingFrameDepth(wallThickness),
    centerY = sillHeight + height / 2,
    glassParts = [[width - frameThickness, height - frameThickness, 0.025, 0, centerY, 0]],
    frameParts = [
      [width, frameThickness, frameDepth, 0, sillHeight + frameThickness / 2, 0],
      [width, frameThickness, frameDepth, 0, sillHeight + height - frameThickness / 2, 0],
      [frameThickness, height - 2 * frameThickness, frameDepth, -(width - frameThickness) / 2, centerY, 0],
      [frameThickness, height - 2 * frameThickness, frameDepth, (width - frameThickness) / 2, centerY, 0],
    ],
    isDivided = hasMullions && width > 1.2
  return (
    isDivided &&
      frameParts.push([
        frameThickness * 0.7,
        height - 2 * frameThickness,
        Math.max(frameDepth - 0.005, 0.04),
        0,
        centerY,
        0,
      ]),
    {
      glass: glassParts,
      frames: frameParts,
      divided: isDivided,
      frameDepth,
    }
  )
}
