import { type FloorPoint, type FloorRegion } from './studio-floor'

/**
 * 地面分区工具的**全部用户文案**（0.8.9 `studio-floor-region-editor.js`）。
 *
 * 为什么集中成一个模块：同一句话分散在三个文件里写，必然会漂移 ——
 * 属性面板标题、画布提示、toast 各写一份，改一处只修一个入口（这正是
 * `DIFF-AND-PORT-PLAN.md` 附录十七记录的教训）。
 *
 * 上游的 `原色 / 浅色` 是面板按钮，`木地板 / 瓷砖` 是同一档在平面图例里的叫法；
 * 两者不是同一条文案，都要保留。
 */

/** 引导语：随状态切换（未选中 / 已选中 / 标记起点 / 点终点）。 */
export const FLOOR_REGION_PROMPT = Object.freeze({
  idle: '在平面图中点选房间或已有分区。',
  selected: '点选房间或已有分区，可以设置铺面，也可以画分割线。',
  selectedShort: '选择铺面，或在这块地面上画分割线。',
  splitStart: '点击所选区域的边界，标记分割起点。',
  splitEnd: '点击对侧边界完成分割，Esc 取消。',
})

/** 失败提示。 */
export const FLOOR_REGION_ERROR = Object.freeze({
  noFloor: '请选择有闭合墙体的室内地面。',
  notNearEdge: '请靠近所选区域的边界。',
  splitInvalid: '分割线需留在所选区域内，避开洞口，并将区域分成两块。',
  tooComplex: '分区边界过于复杂，或已达到本层分区上限。',
})

/** 面板按钮与图例。 */
export const FLOOR_REGION_LABEL = Object.freeze({
  cut: '画分割线',
  cancel: '取消画线',
  remove: '移除分区',
  wood: '原色',
  tile: '浅色',
  /** 平面图图例（与按钮同档，但用材质名而不是色档名）。 */
  legendWood: '木地板',
  legendTile: '瓷砖',
  /** 深浅滑条的档位说明。 */
  woodTone: '原色深浅',
  tileTone: '浅色深浅',
})

/** 铺面按钮 → 深浅档位的说明文案。 */
export function floorRegionToneLabel(finish: string): string {
  if (finish === 'wood') return FLOOR_REGION_LABEL.woodTone
  if (finish === 'tile') return FLOOR_REGION_LABEL.tileTone
  return '深浅'
}

/**
 * 地面分区的**交互状态机**（0.8.9）。
 *
 * 为什么单独一层：`handlePointerDown` / `StudioPlanPanel` 这类宿主文件已经很大，
 * 继续往里塞交互细节会越来越难读。把「点地面 → 选中哪块 → 要不要切成两块」抽成纯函数后，
 * 宿主只加 10 行左右的转发，而所有边界（点在墙外、线不穿过地面、两次点同一处）都能在这里断言。
 *
 * 三种输入模式：
 *
 * 1. `select`：单击 → 命中点所在的那块地面；
 * 2. `split`：两次单击 → 一条分割线，把选中的地面切成两块（不命中就报错，不做静默无效操作）；
 * 3. `cancel`：放弃当前分割线，回到 `select`。
 */

/** 平面点（米，与 plan 坐标 / FloorPoint 同形：{x, y}）。 */
export type PlanPoint = { x: number; y: number }

/** 地面区域（与 `studio-floor-regions.ts` 的几何字段同形，但只取交互需要的部分）。 */
export type FloorRegionLike = {
  id?: string
  polygon: ReadonlyArray<PlanPoint>
}

/** 状态机阶段。 */
export type FloorRegionPhase = 'select' | 'split'

/** 一次交互的完整状态。 */
export type FloorRegionInteraction = {
  phase: FloorRegionPhase
  /** `split` 阶段的第一个点；`select` 阶段为 `null`。 */
  splitStart: PlanPoint | null
  /** 已选中的区域下标（`floorRegions` 数组下标）；`null` 表示没选中。 */
  selectedIndex: number | null
}

/** 「点在哪块地面里」的判定误差（米）：墙厚以内都算命中，避免点墙中心线落空。 */
export const REGION_HIT_TOLERANCE = 0.05

/** 分割线最短长度（米）：短于此视为误触。 */
export const MIN_SPLIT_LENGTH = 0.3

export function createFloorRegionInteraction(): FloorRegionInteraction {
  return { phase: 'select', splitStart: null, selectedIndex: null }
}

/**
 * 射线法点包含判定（与 `pointInPolygon` 同口径，但带**容差**）。
 *
 * 容差的意义：用户点在墙体中心线上（正好压在区域边界）时，严格的射线法结果
 * 取决于浮点奇偶，表现为「同一块地有时能选、有时选不中」。这里把边界附近
 * `tolerance` 内的点都算命中。
 */
export function pointHitsRegion(
  point: PlanPoint,
  polygon: ReadonlyArray<PlanPoint>,
  tolerance = REGION_HIT_TOLERANCE,
): boolean {
  if (polygon.length < 3) return false
  if (pointInsidePolygon(point, polygon)) return true
  return distanceToPolygonSquared(point, polygon) <= tolerance * tolerance
}

/**
 * 点到多边形**边**的最短距离平方。
 *
 * 注意是「到边」而不是「到顶点」：矩形的一边长 4m，两个顶点都离得远，
 * 但边中点离点只有 0 —— 只比顶点会让「点长墙中心线」时有时无地选不中。
 */
export function distanceToPolygonSquared(point: PlanPoint, polygon: ReadonlyArray<PlanPoint>): number {
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if (!start || !end) continue
    best = Math.min(best, distanceToSegmentSquared(point, start, end))
  }
  return best
}

function distanceToSegmentSquared(point: PlanPoint, start: PlanPoint, end: PlanPoint): number {
  const dx = end.x - start.x
  const dz = end.y - start.y
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared === 0) return distanceSquared(start, point)
  // 投影参数 t 夹到 [0,1]：线段两端之外的最近点就是端点。
  const rawT = ((point.x - start.x) * dx + (point.y - start.y) * dz) / lengthSquared
  const t = Math.min(1, Math.max(0, rawT))
  return distanceSquared({ x: start.x + dx * t, y: start.y + dz * t }, point)
}

/**
 * 点包含（射线法）。
 */
export function pointInsidePolygon(point: PlanPoint, polygon: ReadonlyArray<PlanPoint>): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index]
    const prior = polygon[previous]
    if (!current || !prior) continue
    const straddles = current.y > point.y !== prior.y > point.y
    if (!straddles) continue
    const crossX = ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x
    if (point.x < crossX) inside = !inside
  }
  return inside
}

/**
 * 命中测试：返回**最上面**（数组中最后声明）的那块地面。
 *
 * 为什么取最后一块而不是第一块：后画的区域总是覆盖在先画的上面（铺面渲染同口径），
 * 用户看到的是上层那块，点选也应当选它。
 */
export function resolveRegionAt(
  point: PlanPoint,
  regions: ReadonlyArray<FloorRegionLike>,
): { index: number; region: FloorRegionLike } | null {
  for (let index = regions.length - 1; index >= 0; index -= 1) {
    const region = regions[index]
    if (!region) continue
    if (pointHitsRegion(point, region.polygon)) return { index, region }
  }
  return null
}

/** 交互的下一步。 */
export type FloorRegionStep =
  | { kind: 'select'; index: number }
  | { kind: 'split-armed'; start: PlanPoint }
  | { kind: 'split'; start: PlanPoint; end: PlanPoint; index: number }
  | { kind: 'error'; message: string }

/**
 * 处理一次单击。
 *
 * `phase = select`：命中则选中；没命中 → `error`（不静默，否则用户不知道「点了没反应」）。
 * `phase = split`：这是第二个点 → 产出分割线；太短或与第一点重合 → `error` 并**保留**第一点，
 * 让用户可以直接重画第二个点，而不是从头再来。
 */
export function clickFloorRegion(
  interaction: FloorRegionInteraction,
  point: PlanPoint,
  regions: ReadonlyArray<FloorRegionLike>,
): { interaction: FloorRegionInteraction; step: FloorRegionStep } {
  if (interaction.phase === 'split') {
    const start = interaction.splitStart
    if (!start) {
      const selection = resolveRegionAt(point, regions)
      return selection
        ? finishSelect(interaction, selection.index, selection.region)
        : { interaction, step: { kind: 'error', message: FLOOR_REGION_PROMPT.idle } }
    }
    if (distanceSquared(start, point) < MIN_SPLIT_LENGTH * MIN_SPLIT_LENGTH) {
      return {
        interaction,
        step: { kind: 'error', message: `分割线太短（需 ≥ ${MIN_SPLIT_LENGTH}m），请重新选择终点。` },
      }
    }
    const index = interaction.selectedIndex
    if (index === null) {
      return { interaction: createFloorRegionInteraction(), step: { kind: 'error', message: FLOOR_REGION_PROMPT.idle } }
    }
    return {
      interaction: { phase: 'select', splitStart: null, selectedIndex: index },
      step: { kind: 'split', start, end: point, index },
    }
  }
  const selection = resolveRegionAt(point, regions)
  if (!selection) {
    return { interaction, step: { kind: 'error', message: FLOOR_REGION_ERROR.noFloor } }
  }
  return finishSelect(interaction, selection.index, selection.region)
}

function finishSelect(
  interaction: FloorRegionInteraction,
  index: number,
  region: FloorRegionLike,
): { interaction: FloorRegionInteraction; step: FloorRegionStep } {
  void region
  return {
    interaction: { ...interaction, selectedIndex: index },
    step: { kind: 'select', index },
  }
}

/**
 * 进入切分模式（选中区域后才允许）。
 */
export function armSplit(interaction: FloorRegionInteraction): FloorRegionInteraction {
  if (interaction.selectedIndex === null) return interaction
  return { phase: 'split', splitStart: null, selectedIndex: interaction.selectedIndex }
}

/**
 * 放弃当前分割线：保留选中，回到 `select`。
 */
export function cancelSplit(interaction: FloorRegionInteraction): FloorRegionInteraction {
  return { phase: 'select', splitStart: null, selectedIndex: interaction.selectedIndex }
}

/**
 * 记录切分的第一点（面板点「画分割线」后的第一次点击）。
 */
export function setSplitStart(interaction: FloorRegionInteraction, point: PlanPoint): FloorRegionInteraction {
  return { phase: 'split', splitStart: point, selectedIndex: interaction.selectedIndex }
}

/**
 * 检查面板是否该显示。
 */
export function shouldShowFloorRegionInspector(interaction: FloorRegionInteraction): boolean {
  return interaction.selectedIndex !== null
}

/**
 * 面板标题：带序号，避免用户不知道改的是哪一块。
 */
export function floorRegionTitle(interaction: FloorRegionInteraction, regionCount: number): string {
  if (interaction.selectedIndex === null) return '地面分区'
  return `地面分区 ${interaction.selectedIndex + 1}/${regionCount}`
}

function distanceSquared(first: PlanPoint, second: PlanPoint): number {
  const dx = first.x - second.x
  const dz = first.y - second.y
  return dx * dx + dz * dz
}

/**
 * 分区编辑器工厂（0.8.9 `createFloorRegionEditor`）。
 *
 * 上游是「一个对象 + 一堆方法」；本项目用显式步骤函数（`clickFloorRegion` /
 * `armSplit` / `setSplitStart` / `cancelSplit`），因为每一步都要能单独断言。
 * 这个工厂只是把步骤函数收口成上游形状，供需要「拿到编辑器再调用」的宿主使用。
 */
export function createFloorRegionEditor() {
  let interaction = createFloorRegionInteraction()
  return {
    get state() {
      return interaction
    },
    click(point: PlanPoint, regions: ReadonlyArray<FloorRegionLike>) {
      const outcome = clickFloorRegion(interaction, point, regions)
      interaction = outcome.interaction
      return outcome.step
    },
    armSplit() {
      interaction = armSplit(interaction)
      return interaction
    },
    setStart(point: PlanPoint) {
      interaction = setSplitStart(interaction, point)
      return interaction
    },
    cancel() {
      interaction = cancelSplit(interaction)
      return interaction
    },
    reset() {
      interaction = createFloorRegionInteraction()
      return interaction
    },
  }
}

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
