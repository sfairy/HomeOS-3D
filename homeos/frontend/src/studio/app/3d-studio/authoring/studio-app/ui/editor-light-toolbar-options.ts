/**
 * 灯带工具条的选项装配（从 `editor-3d-wiring` 拆出）。
 *
 * 只负责把 runtime 翻译成工具条需要的回调：位姿、锚点、圆环几何、提交链路。
 * 角度换算与拖动状态机在 `editor-light-gizmo*.ts` 与 `editor-light-toolbar.ts` 里。
 */
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import type { Vec3 } from '../interaction/editor-3d-gesture'
import type { LightAxis } from '../interaction/editor-light-gizmo'
import { lightFrame } from '../interaction/editor-light-gizmo'
import type { LightToolbarOptions } from './editor-light-toolbar'
import { findItem, planPointOf, type Geometry } from './editor-3d-geometry'
import { writeItemState, type SelectionBridge } from './editor-3d-selection'
import { isLightItem, modelPendingOf, screenPixelsPerMeter } from './editor-3d-overlay-state'
import { applyPlacementSnap } from '../interaction/placement-snap-apply'
import {
  isGizmoEligibleItem,
  isItemEditable,
  isItemInLibraryScope,
  isItemShown,
} from '../../items/placed-item-visibility'
import { libraryModeOf } from './library-mode'
import type { SnapSensingOptions } from './editor-light-toolbar-types'
import { elevationLimitsOf, type TransactionState } from './editor-3d-overlay-options'

export interface ToolbarOptionDeps {
  runtime: StudioAppRuntime
  geometry: Geometry
  selection: SelectionBridge
  tx: TransactionState
  beginInteraction: () => void
  commitLights: () => void
}

/**
 * gizmo 的锚点与世界坐标（圆环中心 / 移动箭头原点都从这里出发）。
 *
 * 高度必须按 0.8.7 分成两支：
 * - 灯具 → `lS()`：就在 `elevation` 上（灯位圆点也在发光面附近，两者才对得上）；
 * - 家具 → `ec()`：包围盒中点。
 *
 * 灯具若也按 `elevation + height/2` 取中点，浅俯角下圆环会浮到灯体上方几十毫米，
 * 而灯位圆点仍在发光面，看起来就是「圆点和坐标系不是同一个地方」。
 */
function anchorOf(runtime: StudioAppRuntime, geometry: Geometry, selection: SelectionBridge): Vec3 | null {
  const id = selection.ids()[0]
  const item = id ? findItem(runtime, id) : undefined
  const plan = id ? planPointOf(runtime, id) : null
  if (!item || !plan) return null
  const elevation = isLightItem(item) ? plan.elevation : plan.elevation + Number(item.height || 0) / 2
  return geometry.toWorld(plan.x, plan.y, elevation)
}

/** 三轴圆环中心：灯具发光面 / 家具几何中心。 */
function centerOf(runtime: StudioAppRuntime, geometry: Geometry, selection: SelectionBridge): Vec3 | null {
  return anchorOf(runtime, geometry, selection)
}

/**
 * 圆环半径（米）：**固定 42 屏幕像素**（0.8.7 `(mode==='rotate'?0x2a:0x3a)/pxPerMeter`）。
 *
 * 用物件尺寸当半径会让大沙发画出直径两三米的环、小台灯缩成一个点；
 * 固定屏幕尺寸后，任何物件在任何相机距离下看到的环都一样大。
 * 像素/米必须在**锚点**上量：同一屏里俯角不同，天花板附近和地面附近的像素/米并不相等。
 */
function radiusOf(runtime: StudioAppRuntime, geometry: Geometry, selection: SelectionBridge): number {
  const anchor = anchorOf(runtime, geometry, selection)
  if (!anchor) return 0.3
  const screenPixels = screenPixelsPerMeter(runtime, geometry, anchor)
  return screenPixels > 0 ? 42 / screenPixels : 0.3
}

/** 单个灯具的圆点位置；不在当前楼层 / 投影失败时返回 `null`。 */
function markerOf(
  runtime: StudioAppRuntime,
  geometry: Geometry,
  item: Record<string, unknown>,
): { id: string; name: string; screen: { x: number; y: number } } | null {
  const id = String(item.id || '')
  const plan = id ? planPointOf(runtime, id) : null
  if (!plan) return null
  // 0.8.7 `l0()`：锚点是**发光面**上的点 —— 从安装原点沿发光法线回退 25mm（灯带 40mm）。
  // 用模型半高（elevation + height/2）会把圆点顶到灯具中段，大俯角下明显偏出灯罩。
  const { normalAxis } = lightFrame(item)
  const offset = item.type === 'striplight' ? -0.04 : -0.025
  const world = geometry.toWorld(plan.x, plan.y, plan.elevation)
  world.x += normalAxis.x * offset
  world.y += normalAxis.y * offset
  world.z += normalAxis.z * offset
  const screen = geometry.project(world)
  if (!screen) return null
  return { id, name: String(item.note || item.name || item.type || '灯光'), screen }
}

/**
 * 这一帧到底要不要画灯位圆点（0.8.7 `c0()` 的门控）：选中「可进 gizmo 的物件」/ 已放置页签 / 灯光分类，
 * 三者都不成立时连 markers 都不算。选中判定只认单选，且该物件必须在当前素材分类作用域内、未被隐藏。
 *
 * 注意这里问的是「有没有 gizmoItem」而不是「选中的是不是灯」：0.8.7 的圆环对家具同样成立，
 * 门控因此也在家具上打开——只是那种情况下 markers 里没有灯（`Di()` 把它们挡在分类外）。
 */
function showsLightMarkers(runtime: StudioAppRuntime): boolean {
  const appCtx = runtime.appCtx
  const selected = appCtx.selectedItem as { kind?: string; id?: unknown } | null | undefined
  const hasMultiSelection = (appCtx.selectedItems ?? []).length > 0
  if (selected?.kind === 'item' && !hasMultiSelection) {
    const selectedItem = findItem(runtime, String(selected.id ?? ''))
    if (
      selectedItem &&
      isItemInLibraryScope(appCtx, selectedItem) &&
      isItemShown(appCtx, selectedItem) &&
      isGizmoEligibleItem(selectedItem)
    ) {
      return true
    }
  }
  return libraryModeOf(appCtx) === 'placed' || appCtx.activeLibraryCategory === 'light'
}

/**
 * 当前楼层的灯位圆点（只列 `Di()` 成立的灯：在分类内、未隐藏、未锁定）。嵌入舞台一个都不画：
 * 那是只读交互图，灯位圆点是编辑器的选中手柄，舞台的灯由 3D 光源本身表现。
 */
function markersOf(runtime: StudioAppRuntime, geometry: Geometry) {
  if (runtime.isEmbeddedStage || !showsLightMarkers(runtime)) return []
  // 与上游一致：投影到画布外的点不参与渲染，省掉一批必然被裁掉的节点。
  // 边界必须是**叠层坐标系**（布局像素），否则整页缩放后上半屏的点会被误裁。
  const canvasSize = geometry.hostSize()
  const markers: Array<{ id: string; name: string; screen: { x: number; y: number } }> = []
  for (const item of runtime.appCtx.studioState.items as Array<Record<string, unknown>>) {
    if (!isLightItem(item)) continue
    if (!isItemEditable(runtime.appCtx, item)) continue
    const marker = markerOf(runtime, geometry, item)
    if (!marker) continue
    if (marker.screen.x < 0 || marker.screen.x > canvasSize.width) continue
    if (marker.screen.y < 0 || marker.screen.y > canvasSize.height) continue
    markers.push(marker)
  }
  return markers
}

/** 可编辑：非舞台、未锁交互、在分类内 / 未隐藏 / 未锁定、模型就绪（0.8.7 `Di()` + 模型状态）。 */
function editableOf(runtime: StudioAppRuntime, item: Record<string, unknown>): boolean {
  if (runtime.isEmbeddedStage || runtime.appCtx.isInteractionLocked) return false
  return isItemEditable(runtime.appCtx, item) && !modelPendingOf(runtime)
}

/**
 * 吸附相关的读口，单独成函数是为了不让 `createToolbarOptions` 的字面量超过 80 行
 * 也便于单独检查这些默认值。
 */
function createSnapOptions(
  runtime: StudioAppRuntime,
  geometry: Geometry,
  selectedId: () => string | null,
): SnapSensingOptions {
  return {
    // 灯带平移沿轴向吸附墙面 / 物件边缘（0.8.7 `hS()` 里的 `uh({freedom})`）：
    // 用拖动中的探针位姿参与计算，否则吸附永远按按下前的位置算。
    placementSnap: (pose, freedom) => {
      const id = selectedId()
      const item = id ? findItem(runtime, id) : null
      if (!id || !item) return null
      const result = applyPlacementSnap(runtime.appCtx, [id], geometry.mapper().pixelsPerMeter, {
        zoom: runtime.appCtx.planView?.zoom,
        freedom,
        moving: [{ ...(item as Record<string, unknown>), ...pose } as never],
      })
      return { delta: result.delta, keys: result.keys }
    },
    snapEnabled: () => runtime.isSnapEnabled?.() ?? true,
    snapAngles: () => (runtime.appCtx.studioState.settings ?? {}).snapAngles !== false,
    snapGrid: () => (runtime.appCtx.studioState.settings ?? {}).snapGrid !== false,
  }
}

export function createToolbarOptions(deps: ToolbarOptionDeps): LightToolbarOptions {
  const { runtime, geometry, selection, beginInteraction, commitLights } = deps
  // gizmo 只服务单选：0.8.7 `c0()` 同样要求 `be.length === 0`。
  // 多选时若取第一个 id，拖动圆环只会转其中一件，用户会以为「多选失效」。
  const selectedId = (): string | null => {
    const ids = selection.ids()
    return ids.length === 1 ? ids[0] : null
  }
  return {
    host: globalThis.document.getElementById('preview-3d') as HTMLElement,
    pose: () => {
      // 0.8.7 `c0()` 的 gizmoItem：单选任意物件都进 gizmo（非灯具在渲染层固定成 rotate），
      // 但必须在当前分类作用域内、未被隐藏、且类型可画圆环（`Or() && En() && lw()`）。
      // 「家居」分类下选中一盏灯在这里返回 null —— 工具条与灯位圆点因此一起消失，与上游一致。
      const id = selectedId()
      const item = id ? findItem(runtime, id) : null
      if (!id || !item) return null
      if (!isItemInLibraryScope(runtime.appCtx, item)) return null
      if (!isItemShown(runtime.appCtx, item)) return null
      if (!isGizmoEligibleItem(item)) return null
      return item as Record<string, unknown>
    },
    isLight: (pose) => isLightItem(pose as Record<string, unknown>),
    center: () => centerOf(runtime, geometry, selection),
    project: geometry.project,
    pointerRay: geometry.pointerRay,
    pixelsPerMeter: () => geometry.mapper().pixelsPerMeter,
    radius: () => radiusOf(runtime, geometry, selection),
    itemId: selectedId,
    markers: () => markersOf(runtime, geometry),
    editable: () => {
      const id = selectedId()
      const item = id ? findItem(runtime, id) : null
      return item ? editableOf(runtime, item as Record<string, unknown>) : false
    },
    minimumElevation: () => {
      const id = selectedId()
      return id ? elevationLimitsOf(runtime, id).minimum : 0
    },
    ...createSnapOptions(runtime, geometry, selectedId),
    onSelectItem: (id: string) => {
      runtime.selectSceneObject('item', id)
      runtime.refreshStudioUi?.()
      runtime.refreshStudioView?.()
    },
    onChange: (axis: LightAxis, degrees: number) => {
      const id = selectedId()
      const item = findItem(runtime, id ?? '')
      if (!id || !item) return
      // 任意一轴手调后就不再是预设安装方式，否则读档会被 `normalizeStripPoseRecord` 覆盖回去。
      // 家具没有 `stripMount`，只写角度。
      writeItemState(runtime, selection, id, (target) => {
        if (isLightItem(target)) target.stripMount = 'custom'
        target[axis] = ((degrees % 360) + 360) % 360
      })
      runtime.refreshStudioView?.()
    },
    onMovePose: (next: { x: number; y: number; elevation: number }) => {
      const id = selectedId()
      if (!id) return
      writeItemState(runtime, selection, id, (item) => {
        item.x = next.x
        item.y = next.y
        item.elevation = next.elevation
      })
      const object = selection.liveObject(id)
      if (object) {
        const world = geometry.toWorld(next.x, next.y, next.elevation)
        ;(object.position as { set: (x: number, y: number, z: number) => void }).set(world.x, world.y, world.z)
      }
      runtime.refreshStudioView?.()
    },
    onBegin: () => {
      beginInteraction()
    },
    onEnd: () => {
      commitLights()
    },
  }
}
