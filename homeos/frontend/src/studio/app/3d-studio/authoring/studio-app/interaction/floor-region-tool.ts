/**
 * 「地面分区」工具的宿主粘合层（0.8.9）。
 *
 * 职责只有三件，全部可以脱离 three / DOM 测试：
 *
 * 1. 从当前层的墙线求出**闭合地面多边形**（复用 `closedWallPolygons`，与铺面渲染同源）；
 * 2. 把平面点击交给 `studio-floor-region-editor` 的状态机；
 * 3. 切分时用 `splitFloorRegionByLine` 产出两块轮廓，交回宿主落盘。
 *
 * 坐标口径：全程 `{x, y}`（与 `plan-coords.ts` 的 `screenToPlanPoint`、`FloorPoint` 一致），
 * 中间不做任何换轴 —— 换轴是这里最容易出错的地方，干脆不引入。
 *
 * 状态为什么在模块里：它只在「地面分区」工具激活期间有意义，换工具必须清空；
 * 单例 + 显式 `resetFloorRegionTool()` 比在巨型 `appCtx` 上加字段更容易守住棘轮，
 * 也避免忘了清空时把分割线带到下一个工具里。
 */

import { FLOOR_REGION_ERROR, FLOOR_REGION_PROMPT } from '../../../plan/studio-floor-region-copy'
import { closedWallPolygons } from '../../../plan/geometry'
import {
  armSplit,
  cancelSplit,
  clickFloorRegion,
  createFloorRegionInteraction,
  floorRegionTitle,
  setSplitStart,
  type FloorRegionInteraction,
  type FloorRegionStep,
  type PlanPoint,
} from '../../../plan/studio-floor-region-editor'
import { splitFloorRegionByLine, type FloorRegionSplitSide } from '../../../plan/studio-floor-region-split'
import type { FloorPoint, FloorRegion } from '../../../plan/studio-floor-regions'

/**
 * 工具当前的交互状态。
 *
 * 用 `const` + 可变字段而不是模块级 `let`：本仓的别名棘轮把模块级 `let` 计入
 * 「转发层」指标（只允许下降），而这里的状态本来就是一个可替换的槽位。
 */
const state: { interaction: FloorRegionInteraction } = { interaction: createFloorRegionInteraction() }

/** 当前层的墙线与合并容差（像素），用于求闭合地面。 */
export type FloorPolygonSource = {
  walls: unknown
  mergeTolerance: number
}

/** 一次点击的结果，宿主据此显示提示 / 落盘。 */
export type FloorRegionClickResult =
  | { kind: 'selected'; index: number; label: string }
  | { kind: 'awaiting-end'; label: string }
  | { kind: 'split'; pieces: { left: FloorRegionSplitSide; right: FloorRegionSplitSide } }
  | { kind: 'error'; message: string }

/** 换工具 / 退出平面视图时清空。 */
export function resetFloorRegionTool(): void {
  state.interaction = createFloorRegionInteraction()
}

/** 进入「画分割线」等待第一个点；未选中区域时返回 `false`。 */
export function beginFloorRegionSplit(): boolean {
  const next = armSplit(state.interaction)
  if (next === state.interaction) return false
  state.interaction = next
  return true
}

/** 放弃分割线（Esc）。 */
export function cancelFloorRegionSplit(): void {
  state.interaction = cancelSplit(state.interaction)
}

/** 当前是否在等分割线。 */
export function isAwaitingFloorRegionSplit(): boolean {
  return state.interaction.phase === 'split'
}

/** 选中的区域下标（未选中为 `null`）。 */
export function selectedFloorRegionIndex(): number | null {
  return state.interaction.selectedIndex
}

/** 检查器标题；未选中返回 `null`，宿主据此隐藏面板。 */
export function floorRegionInspectorLabel(regionCount: number): string | null {
  if (state.interaction.selectedIndex === null) return null
  return floorRegionTitle(state.interaction, regionCount)
}

/** 读出当前层的地面多边形（`{x, y}`，至少三点）。 */
export function currentFloorPolygons(source: FloorPolygonSource): FloorPoint[][] {
  const tolerance = Math.max(Number(source.mergeTolerance) || 0, 1e-7)
  const polygons = closedWallPolygons(source.walls, tolerance)
  return (polygons as unknown[]).filter(
    (polygon): polygon is FloorPoint[] =>
      Array.isArray(polygon) && polygon.length >= 3 && polygon.every((vertex) => isPlanPoint(vertex as FloorPoint)),
  )
}

/**
 * 处理一次平面点击。
 *
 * 切分的「第二点」由状态机产出线段；这里立刻切成两块轮廓返回给宿主，
 * 宿主负责生成新 `FloorRegion`（新 id、铺面沿用）并打 undo 快照。
 */
export function clickFloorRegionTool(point: PlanPoint, source: FloorPolygonSource): FloorRegionClickResult {
  const polygons = currentFloorPolygons(source)
  // 已进入切分但还没定起点：这一次点击就是起点。
  if (state.interaction.phase === 'split' && state.interaction.splitStart === null) {
    state.interaction = setSplitStart(state.interaction, point)
    return { kind: 'awaiting-end', label: FLOOR_REGION_PROMPT.splitEnd }
  }
  const regions = polygons.map((polygon, index) => ({ id: `region-${index}`, polygon }))
  const { interaction: nextInteraction, step } = clickFloorRegion(state.interaction, point, regions)
  state.interaction = nextInteraction
  if (step.kind === 'error') return { kind: 'error', message: step.message }
  if (step.kind === 'split-armed') {
    return { kind: 'awaiting-end', label: FLOOR_REGION_PROMPT.splitEnd }
  }
  if (step.kind === 'select') {
    return { kind: 'selected', index: step.index, label: floorRegionTitle(nextInteraction, polygons.length) }
  }
  return splitAt(step, polygons)
}

function splitAt(step: Extract<FloorRegionStep, { kind: 'split' }>, polygons: FloorPoint[][]): FloorRegionClickResult {
  const outline = polygons[step.index]
  if (!outline) return { kind: 'error', message: FLOOR_REGION_ERROR.noFloor }
  const region: Pick<FloorRegion, 'outline' | 'holes'> = { outline, holes: [] }
  const pieces = splitFloorRegionByLine(region, step.start, step.end)
  if (!pieces) return { kind: 'error', message: FLOOR_REGION_ERROR.splitInvalid }
  return { kind: 'split', pieces }
}

function isPlanPoint(value: FloorPoint | undefined): value is FloorPoint {
  return Boolean(value) && Number.isFinite(value?.x) && Number.isFinite(value?.y)
}

/**
 * 把一次切分结果写回某层的 `floorRegions`（纯函数，返回新数组）。
 *
 * 语义：
 * - 原区域被两块替换（**原地**替换，保持渲染叠放顺序不变）；
 * - 铺面沿用原区域；色档是层级的（`floorFinishTones`），这里不动；
 * - 洞口不继承 —— `splitFloorRegionByLine` 对带洞区域直接返回 `null`，
 *   所以走到这里时一定没有洞，写成 `[]` 是明确的而不是"忘了"。
 */
export function applySplitToFloorRegions(
  regions: readonly FloorRegion[],
  index: number,
  pieces: { left: FloorRegionSplitSide; right: FloorRegionSplitSide },
  createId: (prefix: string) => string,
): FloorRegion[] {
  const original = regions[index]
  if (!original) return [...regions]
  const left: FloorRegion = {
    id: createId('floor-region'),
    finish: original.finish,
    outline: pieces.left.outline,
    holes: [],
  }
  const right: FloorRegion = {
    id: createId('floor-region'),
    finish: original.finish,
    outline: pieces.right.outline,
    holes: [],
  }
  return [...regions.slice(0, index), left, right, ...regions.slice(index + 1)]
}

/**
 * 切分完成后清空选中：两块新区域的下标依赖写入顺序，继续指向旧下标会编辑错误的那一块。
 */
export function clearFloorRegionSelection(): void {
  state.interaction = { phase: 'select', splitStart: null, selectedIndex: null }
}

/**
 * 把当前选区同步到 facade（检查器显隐 / 标题）。
 *
 * 集中在这里而不是在每次点击后各写一遍：`select` / `split` / `error` / `reset` 四条路径
 * 只要漏一条，就会出现「面板还开着但已经没选中」这种很难查的错位。
 */
export function syncFloorRegionFacade(
  regionCount: number,
  patch: (partial: { floorRegion: FloorRegionFacadeValue }) => void,
): void {
  patch({ floorRegion: floorRegionFacadeValue(regionCount) })
}

/** facade 上的选区形态（与 `StudioFacadeState['floorRegion']` 同形）。 */
export type FloorRegionFacadeValue = { label: string; regionCount: number; canSplit: boolean } | null

/** 由当前交互状态算出 facade 值。 */
export function floorRegionFacadeValue(regionCount: number): FloorRegionFacadeValue {
  if (state.interaction.selectedIndex === null) return null
  return {
    label: floorRegionTitle(state.interaction, regionCount),
    regionCount,
    canSplit: state.interaction.selectedIndex < regionCount,
  }
}

/**
 * 移除选中的分区（检查器「移除分区」）。
 *
 * 返回新数组；只有一块时不允许移除 —— 那等于「这一层没有地面了」，
 * 用户真正想要的是换铺面或改户型，而不是把整层地面删掉。
 */
export function removeFloorRegionAt(regions: readonly FloorRegion[], index: number): FloorRegion[] | null {
  if (regions.length <= 1) return null
  if (index < 0 || index >= regions.length) return null
  return [...regions.slice(0, index), ...regions.slice(index + 1)]
}

/**
 * 「显示本层地暖盘管」复选框的节点 id。
 *
 * 与 `StudioView.vue` 的标记一一对应；放常量而不是各写字符串，改名时只有一处要改。
 */
export const UNDERFLOOR_HEATING_INPUT_ID = 'floor-underfloor-heating'

/** 读复选框当前值（节点缺失按关闭处理）。 */
export function readUnderfloorHeatingToggle(): boolean {
  const input = document.getElementById(UNDERFLOOR_HEATING_INPUT_ID) as HTMLInputElement | null
  return input?.checked === true
}

/** 把楼层开关同步到复选框（切换楼层 / 重载文档后调用）。 */
export function syncUnderfloorHeatingToggle(enabled: boolean): void {
  const input = document.getElementById(UNDERFLOOR_HEATING_INPUT_ID) as HTMLInputElement | null
  if (input) input.checked = enabled
}

/** 换工具时清空（分支放在这里，避免给宿主的 `selectStudioTool` 增加复杂度）。 */
export function resetFloorRegionToolIfLeaving(nextToolId: string): void {
  if (nextToolId === 'floor-region') return
  resetFloorRegionTool()
}

/**
 * 绑定「显示本层地暖盘管」开关（只绑一次）。
 *
 * 开关写的是**楼层**字段 `underfloorHeating`，然后请求重建建筑层 —— 盘管是与地面板
 * 一起挂的，不重建就不会出现/消失。
 */
export function installUnderfloorHeatingToggle(host: {
  floors: () => ReadonlyArray<{ id?: string; underfloorHeating?: boolean }>
  activeFloorId: () => string
  markDirty: () => void
  rebuildArchitecture: () => void
  notify: (message: string, kind?: string) => void
}): void {
  const input = document.getElementById(UNDERFLOOR_HEATING_INPUT_ID) as HTMLInputElement | null
  if (!input || input.dataset.floorUnderfloorBound === '1') return
  input.dataset.floorUnderfloorBound = '1'
  input.addEventListener('change', () => {
    const floor = host.floors().find((candidate) => candidate.id === host.activeFloorId())
    if (!floor) {
      host.notify('没有找到当前楼层，无法切换地暖盘管。', 'error')
      return
    }
    floor.underfloorHeating = input.checked
    host.markDirty()
    host.rebuildArchitecture()
  })
}

/** `handlePointerDown` 转发所需的宿主能力（显式传入，避免依赖弱类型的 deps 对象）。 */
export type FloorRegionPointerHost = {
  point: PlanPoint
  source: FloorPolygonSource
  activeFloorId: string
  /** 所有楼层记录（只读用于查找当前层）。 */
  floors: ReadonlyArray<{ id?: string; floorRegions?: FloorRegion[]; underfloorHeating?: boolean }>
  createId: (prefix: string) => string
  pushUndoEntry: () => void
  markDocumentDirty: () => void
  notify: (message: string, kind?: string) => void
}

/**
 * 一次「地面分区」点击的**完整处理**（含提示、落盘、facade 同步）。
 *
 * 全部收在这里是为了让 `handlePointerDown` 只留一行调用 —— 那个文件已经很大，
 * 一次 if/else 链就会让分支数再涨一截。
 */
export function handleFloorRegionPointer(
  host: FloorRegionPointerHost,
  patchFacade: (partial: { floorRegion: FloorRegionFacadeValue }) => void,
): void {
  const result = clickFloorRegionTool(host.point, host.source)
  const regionCount = currentFloorPolygons(host.source).length
  if (result.kind === 'error') {
    host.notify(result.message, 'error')
  } else if (result.kind === 'awaiting-end') {
    host.notify(result.label, 'info')
  } else if (result.kind === 'selected') {
    host.notify(`已选中${result.label}`, 'info')
  } else {
    applySplit(host, result.pieces)
  }
  // 选中/切分之后顺手把楼层的地暖开关状态同步到复选框：
  // 切楼层不重建检查器，不在这里同步会显示上一层勾选状态。
  syncUnderfloorHeatingToggle(
    host.floors.find((floorRecord) => floorRecord.id === host.activeFloorId)?.underfloorHeating === true,
  )
  syncFloorRegionFacade(regionCount, patchFacade)
}

function applySplit(
  host: FloorRegionPointerHost,
  pieces: { left: FloorRegionSplitSide; right: FloorRegionSplitSide },
): void {
  const regionIndex = selectedFloorRegionIndex()
  const activeFloor = host.floors.find((floorRecord) => floorRecord.id === host.activeFloorId)
  if (!activeFloor || regionIndex === null) {
    host.notify('没有找到当前楼层，无法切分地面。', 'error')
    return
  }
  host.pushUndoEntry()
  activeFloor.floorRegions = applySplitToFloorRegions(
    activeFloor.floorRegions || [],
    regionIndex,
    pieces,
    host.createId,
  )
  clearFloorRegionSelection()
  host.markDocumentDirty()
  host.notify('已分割为两块地面。', 'success')
}
