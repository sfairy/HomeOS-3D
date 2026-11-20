/**
 * 3D 叠层的「读取状态」与「离地吸附目标」（从 `editor-3d-wiring` 拆出）。
 *
 * 这两块都是决策而不是换算：`readOverlayState` 决定手柄显不显示、能不能拖、显示什么文案；
 * `elevationTargetsOf` 决定离地拖动会吸到地板还是桌面上。放在一起是因为它们共用
 * 同一份「物件 / 包围盒 / 相机」的上下文。
 */
import * as three from '/static/vendor/three/0.187.0/three.module.min.js'
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { itemElevationMeaning } from '../../../loaders/studio-normalization'
import { editNumberText } from '../../studio-edit-metrics'
import { itemTypeCatalog, lampItemTypeSet } from '../../items/item-catalog'
import { isPlacedItemHidden, isPlacedItemLocked } from '../../items/placed-item-state'
import { isItemEditable, isItemInLibraryScope, isItemShown } from '../../items/placed-item-visibility'
import { isCourtyardDrawing } from '../../../plan/courtyard-drawing'
import type { EditorPick } from '../interaction/editor-picking'
import type { ElevationTarget, Vec3 } from '../interaction/editor-3d-gesture'
import { projectedHeightHandle, projectedPixelsPerMeter, verticalRayParameter } from '../interaction/editor-3d-gesture'
import type { EditorOverlayRead } from './editor-3d-overlay'
import { findItem, itemsOf, planPointOf, type Geometry, type SceneObjectLike } from './editor-3d-geometry'

/** 模型装载中（pending / queued / active 任一非零）：此时改几何画面上看不到。 */
export function modelPendingOf(runtime: StudioAppRuntime): boolean {
  const state = (
    runtime as unknown as { externalModelRegistry?: { modelLoadState?: () => Record<string, number> } }
  ).externalModelRegistry?.modelLoadState?.()
  if (!state) return false
  return Number(state.pending || 0) + Number(state.queued || 0) + Number(state.active || 0) > 0
}

/**
 * 竖直方向的屏幕像素/米：把世界点沿 **+Y** 推 1m 再投影。
 *
 * 离地吸附的容差必须用它（0.8.7 `gS()` 就是 `point + (0,1,0)`）：用相机右向算出来的
 * 是水平方向的尺度，俯视时两者相差数倍，吸附半径会明显偏小或偏大。
 * 而高度**手柄的臂长**用的是右向 px/m（上游 `fS()`），两者不能混用。
 */
export function verticalScreenPixelsPerMeter(geometry: Geometry, world: Vec3): number {
  return projectedPixelsPerMeter(geometry.project, world, { x: world.x, y: world.y + 1, z: world.z })
}

/** 相机右向量在屏幕上 1m 对应的像素数（高度手柄臂长用它换算，与上游 `fS()` 一致）。 */
export function screenPixelsPerMeter(runtime: StudioAppRuntime, geometry: Geometry, world: Vec3): number {
  const camera = runtime.appCtx.threeCamera as { quaternion?: unknown } | null
  if (!camera?.quaternion) return 0
  const right = new three.Vector3(1, 0, 0).applyQuaternion(camera.quaternion as never)
  return projectedPixelsPerMeter(geometry.project, world, {
    x: world.x + right.x,
    y: world.y + right.y,
    z: world.z + right.z,
  })
}

/** 高度手柄：屏幕 30px 对应多少世界高度，投影回来求方向与长度。 */
function heightHandleGeometry(runtime: StudioAppRuntime, geometry: Geometry, base: Vec3) {
  const pixelsPerMeter = screenPixelsPerMeter(runtime, geometry, base)
  const baseScreen = geometry.project(base)
  if (!baseScreen) return null
  const heightDelta = pixelsPerMeter > 0 ? 30 / Math.max(1, pixelsPerMeter) : 0
  const tip = heightDelta ? geometry.project({ x: base.x, y: base.y + heightDelta, z: base.z }) : null
  const handle = projectedHeightHandle(baseScreen, tip)
  return handle ? { ...handle, baseScreen } : null
}

/** 轴是否可用：手柄存在 + 不是顶视 + 竖直轴与指针射线不平行。 */
function axisAvailableOf(runtime: StudioAppRuntime, geometry: Geometry, base: Vec3, hasHandle: boolean): boolean {
  if (!hasHandle) return false
  if ((runtime.getCameraView?.() ?? 'free') === 'top') return false
  const screen = geometry.project(base)
  if (!screen) return false
  const client = geometry.overlayToClient(screen.x, screen.y)
  const ray = geometry.pointerRay(client.x, client.y)
  return ray ? verticalRayParameter(ray, base) !== null : false
}

/** 是否可编辑：非舞台、未锁交互、模型就绪、在分类内 / 未隐藏 / 未锁定（0.8.7 `fS().editable`）。 */
function editableOf(runtime: StudioAppRuntime, item: SceneObjectLike, modelPending: boolean): boolean {
  if (runtime.isEmbeddedStage || runtime.appCtx.isInteractionLocked || modelPending) return false
  return isItemEditable(runtime.appCtx, item)
}

function selectedSingleId(selectedIds: string[]): string | null {
  return selectedIds.length === 1 ? selectedIds[0] : null
}

/**
 * 离地手柄的类型 / 作用域门控（0.8.7 `fS()` 的前半段）。为什么单独成函数：这五条判定
 * 是**并列的排除项**，摊在 `readOverlayState` 里会把那个函数推过复杂度棘轮。
 *
 * 1. 必须在当前素材分类作用域内（`Or`）——「家居」分类下选中一盏灯不会有离地手柄；
 * 2. 灯具不走这里（`fe.has`）——它们的离地高度在灯带工具条的 move 模式里拖；
 * 3. 庭院绘制没有「离地」语义；
 * 4. 楼板洞口 / 平面文字不是实体；
 * 5. 被「已放置」隐藏的物件本次编辑内不参与编辑（`En`）。
 */
function heightHandleAllowed(runtime: StudioAppRuntime, item: SceneObjectLike): boolean {
  if (!isItemInLibraryScope(runtime.appCtx, item)) return false
  if (isLightItem(item)) return false
  if (isCourtyardDrawing(item)) return false
  if (['flooropening', 'planlabel'].includes(String(item.type))) return false
  return isItemShown(runtime.appCtx, item)
}

/** 叠层读取状态（0.8.7 `fS()`）：`null` 表示不显示手柄。 */
export function readOverlayState(
  runtime: StudioAppRuntime,
  geometry: Geometry,
  selectedIds: string[],
): EditorOverlayRead | null {
  if (runtime.isEmbeddedStage || runtime.appCtx.isInteractionLocked) return null
  const id = selectedSingleId(selectedIds)
  if (!id) return null
  const item = findItem(runtime, id)
  const plan = planPointOf(runtime, id)
  if (!item || !plan) return null
  if (!heightHandleAllowed(runtime, item)) return null
  const bounds = geometry.itemHeightBounds(id)
  if (!bounds) return null
  // 0.8.7 `fS()` 传 `top = true`：手柄锚在**顶面**，不是地面。
  // 锚在地面会让箭头从物件底部往上长，视觉上像是「从地板伸出来的一根杆」，
  // 而且抬到 3m 的吸顶灯手柄会贴在地面附近。
  const topPoint = geometry.toWorld(plan.x, plan.y, bounds.max)
  const base = geometry.toWorld(plan.x, plan.y, plan.elevation)
  const handle = heightHandleGeometry(runtime, geometry, topPoint)
  if (!handle) return null
  const modelPending = modelPendingOf(runtime)
  const meaning = itemElevationMeaning(item.type)
  return {
    item,
    point: topPoint,
    screen: handle.baseScreen,
    angle: handle.angle,
    length: handle.length,
    tip: handle.tip,
    editable: editableOf(runtime, item, modelPending),
    reason: modelPending ? '模型正在准备，完成后可调整高度' : '',
    // 竖直轴锚点必须与被拖动的那个点同高（顶面），否则射线参数差会整体偏移。
    axisAvailable: axisAvailableOf(runtime, geometry, topPoint, true),
    // 0.8.7 `editNumberText`：`String(Number(v.toFixed(6)))` —— `0` 显示成 `0 m`，
    // 而不是 `0.00 m`；`0.54` 也不会被补成 `0.540`。
    text: `${meaning.label} ${editNumberText(plan.elevation)} m`,
    /** 离地手势的竖直轴锚点（底面中心）：拖动时 world Y 从 elevation 开始算。 */
    basePoint: base,
    /** 顶面离地高度（米）：手柄底端的世界高度。 */
    topElevation: bounds.max,
  }
}

/** 落台目标的显示名：优先目录名，否则「支撑物」。 */
function supportName(item: SceneObjectLike | undefined): string {
  if (!item) return '支撑物'
  return String((itemTypeCatalog as Record<string, { name?: string }>)[String(item.type)]?.name || item.type)
}

/** 找出高度最接近该台面的物件（只用于文案）。 */
function supportOfSurface(runtime: StudioAppRuntime, geometry: Geometry, height: number): SceneObjectLike | undefined {
  return itemsOf(runtime).find((candidate) => {
    const bounds = geometry.itemHeightBounds(String(candidate.id))
    return bounds ? Math.abs(bounds.max - height) < 0.02 : false
  })
}

/**
 * 离地吸附目标：贴合本层地面 + 落台（三角面索引给出的支撑面）。
 *
 * 「只往上吸」：物件从桌面拖走时应该跟手下降，而不是被下方某张桌子吸住。
 */
export function elevationTargetsOf(
  runtime: StudioAppRuntime,
  geometry: Geometry,
  surfaceAt: (x: number, z: number) => { height: number } | null,
  id: string,
  planX: number,
  planY: number,
  elevation: number,
): ElevationTarget[] {
  const targets: ElevationTarget[] = []
  const bounds = geometry.itemHeightBounds(id)
  const item = findItem(runtime, id)
  if (bounds?.exact && item) {
    // 物件的「底面」在模型原点以上 min 米处：贴地就是把 elevation 压到 -min。
    targets.push({ value: Number(item.elevation || 0) - bounds.min, label: '贴合本层地面' })
  }
  if (runtime.appCtx.studioState.settings?.snapSurfaces === false) return targets
  const surface = surfaceAt(geometry.toWorld(planX, planY, elevation).x, geometry.toWorld(planX, planY, elevation).z)
  if (!surface || surface.height <= elevation) return targets
  targets.push({
    value: surface.height,
    label: `落台 ${supportName(supportOfSurface(runtime, geometry, surface.height))}`,
  })
  return targets
}

/** 手势校验（0.8.7 `gw()` 的中文化）：层 / 选择 / 锁定 / 模型就绪。 */
export function validateGestureOf(runtime: StudioAppRuntime, id: string): string | null {
  const item = findItem(runtime, id)
  if (!item) return '物品、楼层或分类已变化，操作已取消'
  const selected = runtime.appCtx.selectedItem as EditorPick | null | undefined
  if (selected?.kind !== 'item' || String(selected.id) !== id) return '物品、楼层或分类已变化，操作已取消'
  if (isPlacedItemHidden(runtime.appCtx, id) || isPlacedItemLocked(runtime.appCtx, id)) {
    return '物品已锁定或隐藏，请先从已放置列表解锁/显示'
  }
  if (modelPendingOf(runtime)) return '模型正在准备，请稍后再操作'
  return null
}

/** 双击聚焦：把 orbit 目标移到物件中心，相机保持相对偏移（距离与视角不变）。 */
export function focusSceneItem(runtime: StudioAppRuntime, geometry: Geometry, id: string): void {
  const item = findItem(runtime, id)
  const plan = planPointOf(runtime, id)
  const controls = runtime.appCtx.orbitControls as
    | {
        target?: { x: number; y: number; z: number; set?: (x: number, y: number, z: number) => void }
        update?: () => void
      }
    | undefined
  const camera = runtime.appCtx.threeCamera as { position?: { add?: (v: unknown) => void } } | undefined
  if (!item || !plan || !controls?.target) return
  const world = geometry.toWorld(plan.x, plan.y, plan.elevation + Number(item.height || 0) / 2)
  const target = controls.target
  const delta = new three.Vector3(
    world.x - Number(target.x || 0),
    world.y - Number(target.y || 0),
    world.z - Number(target.z || 0),
  )
  target.set?.(world.x, world.y, world.z)
  camera?.position?.add?.(delta)
  controls.update?.()
  runtime.refreshStudioView?.()
}

/** 灯类判定（面板与文案共用）。 */
export function isLightItem(item: SceneObjectLike | undefined): boolean {
  return !!item && lampItemTypeSet.has(String(item.type || ''))
}
