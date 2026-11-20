/**
 * 3D 叠层的选项装配（从 `editor-3d-wiring` 拆出）。
 *
 * 选项对象里全是箭头函数，一个函数写下来必然超长；这里按用途拆成三块再合并：
 * - 移动 / 旋转 / 吸附（`createTransformOptions`）
 * - 离地 / 地面吸附 / 手势校验（`createElevationOptions`）
 * - 事务 / 拾取 / 避让（`createBindingOptions`）
 *
 * 每块只依赖 `geometry` 与 `selection`，不含算法。
 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { itemMinimumElevation } from '../../../loaders/studio-normalization'
import { applyPlacementSnap, quantizePlanDelta } from '../interaction/placement-snap-apply'
import type { ElevationTarget, Vec3 } from '../interaction/editor-3d-gesture'
import type { Editor3DOverlayOptions } from './editor-3d-overlay'
import { collectOverlayObstacles } from './overlay-obstacles'
import { findItem, planPointOf, type Geometry } from './editor-3d-geometry'
import { writeItemState, type SelectionBridge } from './editor-3d-selection'
import {
  elevationTargetsOf,
  focusSceneItem,
  isLightItem,
  readOverlayState,
  validateGestureOf,
  verticalScreenPixelsPerMeter,
} from './editor-3d-overlay-state'

export interface TransactionState {
  snapshot: unknown
}

export interface OverlayOptionDeps {
  runtime: StudioAppRuntime
  geometry: Geometry
  selection: SelectionBridge
  host: HTMLElement
  canvas: HTMLCanvasElement
  surfaceIndex: { surfaceAt: (x: number, z: number) => { height: number } | null }
  beginInteraction: () => void
  commit: () => boolean
  endInteraction: () => void
}

/** 移动 / 旋转 / 吸附：只改平面位姿，不动离地。 */
function createTransformOptions({ runtime, geometry, selection }: OverlayOptionDeps) {
  return {
    pointerRay: geometry.pointerRay,
    pickAt: geometry.pickAt,
    itemBaseWorldPoint: geometry.itemBaseWorldPoint,
    mapper: geometry.mapper,
    itemPlanPoint: geometry.itemPlanPoint,
    itemTopWorldPoint: geometry.itemTopWorldPoint,
    project: geometry.project,
    moveItem: (id: string, planX: number, planY: number) => {
      const item = findItem(runtime, id)
      if (!item) return
      item.x = planX
      item.y = planY
    },
    moveLiveItem: (id: string, planX: number, planY: number) => {
      const item = findItem(runtime, id)
      const object = selection.liveObject(id)
      if (!item || !object) return
      const world = geometry.toWorld(planX, planY, Number(item.elevation || 0))
      ;(object.position as { set: (x: number, y: number, z: number) => void }).set(world.x, world.y, world.z)
    },
    rotateItem: (id: string, degrees: number) =>
      writeItemState(runtime, selection, id, (item) => {
        item.rotation = degrees
      }),
    selectedIds: selection.ids,
    select: selection.select,
    /**
     * 单件落位：吸附优先，其次网格量化（0.8.7 `dS()`）。
     *
     * 顺序不能反：先量化再吸附会让「贴墙」永远差半步（量化把物件推离墙面），
     * 上游同样是「吸附命中就用吸附结果，未命中才量化」。
     */
    resolveMove: (
      id: string,
      start: { x: number; y: number },
      desired: { x: number; y: number },
      previousKeys: string[],
      event: { altKey?: boolean },
    ) => {
      const pixelsPerMeter = geometry.mapper().pixelsPerMeter
      const item = findItem(runtime, id)
      const snapped = applyPlacementSnap(runtime.appCtx, [id], pixelsPerMeter, {
        zoom: Number(runtime.appCtx.planView?.zoom) || 1,
        previousKeys,
        // 用「期望位置」参与计算：场景里的坐标还是上一帧的，直接量会滞后一帧。
        moving: item ? [{ ...(item as Record<string, unknown>), x: desired.x, y: desired.y } as never] : undefined,
      })
      if (snapped.keys.length) {
        runtime.appCtx.placementGuides = snapped.guides
        runtime.refreshStudioView?.()
        return { x: desired.x + snapped.delta.x, y: desired.y + snapped.delta.y, keys: snapped.keys }
      }
      runtime.appCtx.placementGuides = []
      // 未命中吸附 → 网格量化（上游 `dS()` 的 else 分支：量化的是**累计位移**，
      // 所以基准是 `start` 而不是当前位置，否则误差会逐帧累积成跳变）。
      const quantized = quantizePlanDelta(
        runtime.appCtx,
        { x: desired.x - start.x, y: desired.y - start.y },
        pixelsPerMeter,
        Boolean(event.altKey),
      )
      return { x: start.x + quantized.x, y: start.y + quantized.y, keys: [] }
    },
  }
}

/** 离地上下限：按类型定的最小安装高度与 6m 上限。 */
export function elevationLimitsOf(runtime: StudioAppRuntime, id: string): { minimum: number; maximum: number } {
  const item = findItem(runtime, id)
  const minimum =
    item?.type === 'airer'
      ? Math.max(0.5, Number(item?.airerExtension || 0.3) + 0.12)
      : itemMinimumElevation(item?.type)
  return { minimum, maximum: 6 }
}

/** 离地：目标优先、5cm 网格（Alt 1cm），写入时同步三维对象。 */
function createElevationOptions({ runtime, geometry, selection, surfaceIndex }: OverlayOptionDeps) {
  return {
    setItemElevation: (id: string, elevation: number) => {
      writeItemState(runtime, selection, id, (item) => {
        item.elevation = elevation
      })
      const object = selection.liveObject(id)
      if (!object) return
      const item = findItem(runtime, id)
      const world = geometry.toWorld(Number(item?.x || 0), Number(item?.y || 0), elevation)
      ;(object.position as { set: (x: number, y: number, z: number) => void }).set(world.x, world.y, world.z)
    },
    elevationLimits: (id: string) => elevationLimitsOf(runtime, id),
    elevationTargets: (id: string, planX: number, planY: number, elevation: number): ElevationTarget[] =>
      elevationTargetsOf(runtime, geometry, (x, z) => surfaceIndex.surfaceAt(x, z), id, planX, planY, elevation),
    elevationTolerance: () => {
      // 容差是「屏幕上 13px 对应多少米」，且必须是**竖直**方向的像素/米（0.8.7 `gS()`）：
      // 用相机右向算，俯视/侧视时吸附半径会与上游差好几倍。
      const snapTolerance = Number(runtime.appCtx.studioState.settings?.snapTolerance || 13)
      const id = selection.ids()[0]
      if (!id) return 0
      const plan = planPointOf(runtime, id)
      if (!plan) return 0
      const world = geometry.toWorld(plan.x, plan.y, plan.elevation)
      const screenPixels = verticalScreenPixelsPerMeter(geometry, world)
      return screenPixels > 0 ? Math.min(0.15, snapTolerance / screenPixels) : 0
    },
    elevationStep: (event: { altKey?: boolean }) => {
      const settings = (runtime.appCtx.studioState.settings ?? {}) as Record<string, unknown>
      if (settings.snapGrid === false || !runtime.isSnapEnabled?.()) return 0
      return event.altKey ? 0.01 : 0.05
    },
  }
}

/** 标签避让的障碍物：切换条 + 灯带工具条（两者都是浮在画布上的可点元素）。 */
function obstaclesOf(runtime: StudioAppRuntime, host: HTMLElement) {
  const rects = collectOverlayObstacles(runtime.appCtx, host)
  const toolbar = globalThis.document.querySelector<HTMLElement>('.editor-light-toolbar')
  if (!toolbar || toolbar.offsetParent === null) return rects
  const hostRect = host.getBoundingClientRect()
  const rect = toolbar.getBoundingClientRect()
  rects.push({
    left: rect.left - hostRect.left,
    right: rect.right - hostRect.left,
    top: rect.top - hostRect.top,
    bottom: rect.bottom - hostRect.top,
  })
  return rects
}

/** 拖动中心十字的锚点：物件中心 / 光源中心 / 视图中心。 */
export function orbitPointOf(runtime: StudioAppRuntime, geometry: Geometry, selection: SelectionBridge) {
  const id = selection.ids()[0]
  const item = id ? findItem(runtime, id) : null
  const plan = id ? planPointOf(runtime, id) : null
  if (!item || !plan) {
    // 没有选中项时回落到场景中心（0.8.7 `rS()`）：拖动中也能看出「绕哪儿转」。
    const bounds = runtime.getSceneContentBounds?.() as { center?: Vec3 } | null
    const projected = bounds?.center ? geometry.project(bounds.center) : null
    return projected ? { ...projected, label: '视图中心' } : null
  }
  // 与灯带 gizmo 的锚点同源（0.8.7 `lS()` / `ec()`）：灯具在安装高度上，家具取包围盒中点。
  // 两边取不同的高度，转视角时十字会和圆环明显错开。
  const elevation = isLightItem(item)
    ? Number(plan.elevation || 0)
    : Number(plan.elevation || 0) + Number(item.height || 0) / 2
  const projected = geometry.project(geometry.toWorld(plan.x, plan.y, elevation))
  return projected ? { ...projected, label: isLightItem(item) ? '光源中心' : '物件中心' } : null
}

/** 事务 / 避让 / 可编辑判定。 */
function createBindingOptions(deps: OverlayOptionDeps) {
  const { runtime, geometry, selection, host, canvas, beginInteraction, commit, endInteraction } = deps
  return {
    host,
    canvas,
    beginInteraction,
    commit,
    endInteraction,
    viewportRect: () => host.getBoundingClientRect(),
    validateGesture: (id: string) => validateGestureOf(runtime, id),
    showToast: (message: string, level?: 'warning' | 'error') => runtime.showToast?.(message, level ?? 'warning'),
    isEditable: () => !runtime.isEmbeddedStage && !runtime.appCtx.isInteractionLocked,
    focusItem: (id: string) => focusSceneItem(runtime, geometry, id),
    orbitPoint: () => orbitPointOf(runtime, geometry, selection),
    obstacles: () => obstaclesOf(runtime, host),
    onError: (message: string) => runtime.showToast?.(message, 'error'),
  }
}

export function createOverlayOptions(deps: OverlayOptionDeps): Editor3DOverlayOptions {
  return {
    ...createTransformOptions(deps),
    ...createElevationOptions(deps),
    ...createBindingOptions(deps),
    read: () => readOverlayState(deps.runtime, deps.geometry, deps.selection.ids()),
  }
}
