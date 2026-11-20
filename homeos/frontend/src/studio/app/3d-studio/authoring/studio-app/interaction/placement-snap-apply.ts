/**
 * 把 `snapPlacement` 接进平面手势（0.8.7 `snapPlacement` 的调用点）。
 *
 * 为什么单独成模块：`handlePointerUp` / `pointer-input` 都已经贴着复杂度棘轮，这里要做
 * 「取被拖件 → 筛候选 → 算容差 → 吸附 → 交回位移与引导线」，塞进去必然超预算。
 *
 * 多选也吸附（0.8.7 同）：按**组合包围盒**整体平移，相对位置不变。
 * 早期版本因为「每件目标不同」直接跳过，结果是框选两件贴着墙的柜子时松手就散开。
 */
import type { StudioAppContext } from '../studio-app-context'
import { isPlacedItemHidden, isPlacedItemLocked } from '../../items/placed-item-state'
import {
  itemPlanCorners,
  placementTolerance,
  type Point,
  type PlanRectLike,
} from '../../../plan/studio-placement-geometry'
import { snapPlacement, type PlacementGuide } from '../../../plan/studio-placement-snap'

/** 墙面数组的类型（吸附模块只读 id / 端点 / 厚度）。 */
type SnapWalls = NonNullable<Parameters<typeof snapPlacement>[0]['walls']>

/** 不参与吸附的物件：洞口与铭牌在平面上是「标注」而不是可摆放的家具。 */
const NON_SNAPPABLE_TYPES = new Set(['flooropening', 'planlabel'])

export type PlacementSnapOptions = {
  /** 本次吸附的缩放（容差随缩放变化）。 */
  zoom?: number
  /** 上一次命中的候选键，用于迟滞。 */
  previousKeys?: string[]
  /** 只允许沿这个方向吸附（灯带轴向移动）。 */
  freedom?: Point | null
  /**
   * 用「拖动中的位姿」参与吸附，而不是场景里已提交的坐标（灯带轴向移动用）。
   *
   * 3D 里物件还没落位就要求吸附结果，场景数据仍是按下前的状态；
   * 不覆盖的话吸附永远按「起点」算，表现为吸附不生效。
   */
  moving?: SnapItem[]
}

export type PlacementSnapResult = {
  /** 需要加到所有被拖物件上的像素位移。 */
  delta: Point
  guides: PlacementGuide[]
  keys: string[]
}

type SnapItem = PlanRectLike & { id: string; type: string }

function itemPixelsPerMeter(appCtx: StudioAppContext, pixelsPerMeter: number): number {
  const scale = Number(pixelsPerMeter) || Number(appCtx.studioState?.calibration?.pixelsPerMeter) || 0
  return scale > 0 ? scale : 100
}

/** 吸附是否开启：总开关 + 按住 S 的临时关闭（0.8.7 `Qt()`）。 */
function snapEnabled(appCtx: StudioAppContext): boolean {
  return appCtx.studioState.settings?.snapEnabled !== false && !appCtx.isSnapTemporarilyOff
}

/** 两类吸附各自是否开启（两个都关时整体不做）。 */
function snapScope(settings: Record<string, unknown>): { walls: boolean; items: boolean } {
  return { walls: settings.snapObjectWalls !== false, items: settings.snapModels !== false }
}

/** 缩放：显式传入优先，否则取平面视图的当前缩放。 */
function resolveZoom(appCtx: StudioAppContext, rawZoom: unknown): number {
  const explicit = Number(rawZoom)
  if (explicit > 0) return explicit
  const current = Number(appCtx.planView?.zoom)
  return current > 0 ? current : 1
}

/** 吸附距离（像素）：设置里的值，缺省 13。 */
function resolveSnapTolerance(settings: Record<string, unknown>): number {
  const raw = Number(settings.snapTolerance)
  return raw > 0 ? raw : 13
}

/** 三类输入一次算齐：比例尺 / 缩放 / 容差。 */
function resolveSnapMetrics(appCtx: StudioAppContext, pixelsPerMeter: number, rawZoom: unknown) {
  const settings = (appCtx.studioState.settings ?? {}) as Record<string, unknown>
  const scale = itemPixelsPerMeter(appCtx, pixelsPerMeter)
  const zoom = resolveZoom(appCtx, rawZoom)
  return { settings, scale, zoom, tolerance: placementTolerance(scale, zoom, resolveSnapTolerance(settings)) }
}

/** 被拖件里有洞口 / 隐藏 / 锁定时不做吸附：它们本来就不该被「摆到某个精确位置」。 */
function isUnsnappable(appCtx: StudioAppContext, moving: SnapItem[]): boolean {
  return moving.some(
    (item) =>
      NON_SNAPPABLE_TYPES.has(String(item.type)) ||
      isPlacedItemHidden(appCtx, item.id) ||
      isPlacedItemLocked(appCtx, item.id),
  )
}

/** 可吸附的邻居：排除自己、洞口/铭牌、隐藏项、无尺寸项。 */
function snapTargets(appCtx: StudioAppContext, draggedIds: Set<string>): SnapItem[] {
  const targets: SnapItem[] = []
  for (const candidate of appCtx.studioState.items as unknown as SnapItem[]) {
    const id = String(candidate.id ?? '')
    if (draggedIds.has(id)) continue
    if (NON_SNAPPABLE_TYPES.has(String(candidate.type))) continue
    if (isPlacedItemHidden(appCtx, id)) continue
    if (!(Number(candidate.width) > 0 && Number(candidate.depth) > 0)) continue
    targets.push(candidate)
  }
  return targets
}

/**
 * 对被拖动的物件做吸附。
 *
 * @returns 位移 + 引导线 + 本次命中的候选键；没有吸附时位移为 0。
 */
export function applyPlacementSnap(
  appCtx: StudioAppContext,
  draggedIds: string[],
  pixelsPerMeter: number,
  options: PlacementSnapOptions = {},
): PlacementSnapResult {
  const empty: PlacementSnapResult = { delta: { x: 0, y: 0 }, guides: [], keys: [] }
  // 总开关关掉、或按住 S 临时关闭时整体不吸附（早期只看了两个分类开关，S 无效）。
  if (!snapEnabled(appCtx)) return empty
  const metrics = resolveSnapMetrics(appCtx, pixelsPerMeter, options.zoom)
  const scope = snapScope(metrics.settings)
  if (!scope.walls && !scope.items) return empty
  const idSet = new Set(draggedIds.map(String))
  const moving =
    options.moving ?? (appCtx.studioState.items as unknown as SnapItem[]).filter((item) => idSet.has(String(item.id)))
  if (!moving.length || isUnsnappable(appCtx, moving)) return empty
  const result = snapPlacement({
    moving,
    targets: scope.items ? snapTargets(appCtx, idSet) : [],
    walls: scope.walls ? (appCtx.studioState.walls as unknown as SnapWalls) : [],
    pixelsPerMeter: metrics.scale,
    tolerance: metrics.tolerance,
    previous: options.previousKeys,
    freedom: options.freedom,
  })
  return { delta: { x: result.x, y: result.y }, guides: result.guides, keys: result.keys }
}

/**
 * 单点吸附（缩放的被拖边 / 灯带轴向移动）。
 *
 * 与整件吸附共用同一套候选与容差，只是把「物件四角」换成「一个点」：
 * 缩放时真正要贴墙的是被拖的那条边，不是整件。
 */
export function applyPointSnap(
  appCtx: StudioAppContext,
  excludeIds: string[],
  pixelsPerMeter: number,
  point: Point,
  options: PlacementSnapOptions = {},
): { point: Point; guides: PlacementGuide[]; keys: string[] } {
  const unchanged = { point, guides: [] as PlacementGuide[], keys: [] as string[] }
  if (!snapEnabled(appCtx)) return unchanged
  const metrics = resolveSnapMetrics(appCtx, pixelsPerMeter, options.zoom)
  const scope = snapScope(metrics.settings)
  if (!scope.walls && !scope.items) return unchanged
  const result = snapPlacement({
    point,
    targets: scope.items ? snapTargets(appCtx, new Set(excludeIds.map(String))) : [],
    walls: scope.walls ? (appCtx.studioState.walls as unknown as SnapWalls) : [],
    pixelsPerMeter: metrics.scale,
    tolerance: metrics.tolerance,
    previous: options.previousKeys,
  })
  return {
    point: { x: point.x + result.x, y: point.y + result.y },
    guides: result.guides,
    keys: result.keys,
  }
}

/**
 * 拖动位移的网格量化（0.8.7：5cm，按住 Alt 1cm）。
 *
 * 只在**没有吸附引导线**时使用：两条都会改位移，叠加起来会让物件先被网格吸住、
 * 再被墙面吸走，手感混乱。`snapGrid === false` 时不量化。
 */
export function quantizePlanDelta(
  appCtx: StudioAppContext,
  delta: Point,
  pixelsPerMeter: number,
  altKey: boolean,
): Point {
  const settings = (appCtx.studioState.settings ?? {}) as Record<string, unknown>
  if (settings.snapGrid === false || !snapEnabled(appCtx)) return delta
  const step = (altKey ? 0.01 : 0.05) * (pixelsPerMeter || 100)
  if (!(step > 0)) return delta
  return { x: Math.round(delta.x / step) * step, y: Math.round(delta.y / step) * step }
}

/** 组合包围盒（诊断 / 画布反馈用）：多选时把「组合」画成一个框。 */
export function movingBounds(appCtx: StudioAppContext, draggedIds: string[], pixelsPerMeter: number) {
  const idSet = new Set(draggedIds.map(String))
  const moving = (appCtx.studioState.items as unknown as SnapItem[]).filter((item) => idSet.has(String(item.id)))
  if (!moving.length) return null
  const corners = moving.flatMap((item) => itemPlanCorners(item, itemPixelsPerMeter(appCtx, pixelsPerMeter)))
  return {
    minX: Math.min(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  }
}
