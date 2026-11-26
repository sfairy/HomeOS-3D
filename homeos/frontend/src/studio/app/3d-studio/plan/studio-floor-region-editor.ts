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

import { FLOOR_REGION_ERROR, FLOOR_REGION_PROMPT } from './studio-floor-region-copy'
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
