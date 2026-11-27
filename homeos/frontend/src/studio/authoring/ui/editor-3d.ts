/**
 * 3D 视口内的物品编辑：坐标换算、选中桥、叠层选项、状态读取、看门狗与装配。
 *
 * 为什么是一个文件：这些部分共享 `StudioAppRuntime` 与同一套相机/几何快照，
 * 装配顺序（arm → refresh → dispose）不可拆。按体量拆成 7 个文件后，
 * 每个文件头都写着「从 editor-3d-wiring 拆出」，说明拆分依据不是职责。
 */

import * as three from '/static/vendor/three/0.187.0/three.module.min.js'
import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { pickEditorItems, type EditorPick } from '../interaction/picking'
import {
  screenToNdc,
  type PlanMapper,
  type Ray,
  type Vec3,
  type ElevationTarget,
  projectedHeightHandle,
  projectedPixelsPerMeter,
  verticalRayParameter,
  snapEditorRotation,
} from '../interaction/gesture'
import { sceneModelOrigin as sceneModelOriginOf, isCourtyardDrawing } from '../plan/courtyard-drawing'
import { isPlacedItemHidden, isPlacedItemLocked } from '../items/placed-item-state'
import { applyItemOrientation } from '../geometry'
import { adoptSceneItemTags, createSurfaceIndex } from '../interaction/scene-tags'
import { itemMinimumElevation, itemElevationMeaning } from '../loaders/studio-normalization'
import {
  applyPlacementSnap,
  quantizePlanDelta,
  createDragController,
  NUDGE_STEP_METERS,
  ROTATE_STEP_DEGREES,
  type DragController,
  type DragControllerOptions,
  type GestureKind,
} from '../interaction/drag-and-drop'
import { collectOverlayObstacles } from './overlay-obstacles'
import { editNumberText } from '../studio-edit-metrics'
import { itemTypeCatalog, lampItemTypeSet } from '../items/item-catalog'
import { isItemEditable, isItemInLibraryScope, isItemShown } from '../items/placed-item-visibility'
import { layoutEditorLabels, type EditorLabelAnchor, type EditorLabelPlacement } from './editor-labels'
import { createLightToolbar, createToolbarOptions } from './light-toolbar'

/**
 * 3D 视口编辑的坐标换算（从 `editor-3d-wiring` 拆出）。
 *
 * 世界坐标一律经过**楼层世界矩阵**：多楼层时楼层组带平移（全楼视图还有堆叠偏移），
 * 只用 `(x - origin) / ppm` 会把「二层右后角的柜子」拖到一层去 —— 早期版本就是这样。
 *
 * 拆成多个小工厂（投影 / 平面 / 拾取）而不是一个巨对象，是为了每段都能单独读：
 * 这些函数只做换算，不做决策。
 */

export type SceneObjectLike = Record<string, unknown>
export type PlanPoint = { x: number; y: number; elevation: number; rotation: number }

/** three 的矩阵最小子集：只用到 clone / invert / applyMatrix4。 */
export type MatrixLike = { clone: () => MatrixLike; invert: () => MatrixLike }

/** 楼层世界坐标系：原点（平面像素）、比例尺、楼层组的世界矩阵。 */
export interface FloorFrame {
  origin: { x: number; y: number }
  pixelsPerMeter: number
  matrix: MatrixLike | null
}

export interface Geometry {
  mapper: () => PlanMapper
  toWorld: (planX: number, planY: number, elevation?: number) => Vec3
  fromWorld: (world: Vec3) => { x: number; y: number }
  pointerRay: (clientX: number, clientY: number) => Ray | null
  project: (world: Vec3) => { x: number; y: number } | null
  pickAt: (clientX: number, clientY: number) => EditorPick | null
  itemPlanPoint: (id: string) => PlanPoint | null
  itemBaseWorldPoint: (id: string) => Vec3 | null
  itemTopWorldPoint: (id: string) => Vec3 | null
  itemHeightBounds: (id: string) => { min: number; max: number; exact: boolean } | null
  /** 叠层坐标系尺寸（布局像素，与叠层 SVG 的 viewBox 同空间）。 */
  hostSize: () => { width: number; height: number }
  /** 叠层坐标（布局像素）→ 客户端坐标（视觉像素），用于把投影点喂回指针射线。 */
  overlayToClient: (x: number, y: number) => { x: number; y: number }
  clearCache: () => void
}

export interface GeometryDeps {
  /** 取某物件的三维对象（已加载模型）。 */
  liveObject: (id: string) => SceneObjectLike | null
  /** 拾取前确保 id 索引是最新的。 */
  ensureIndex: () => void
  /**
   * 叠层宿主（`#preview-3d`）。投影尺寸按它的布局盒算 —— 叠层 SVG 就挂在这里，
   * 若画布与宿主不等大（工具条占位、缩放壳层），用画布尺寸会让圆点按比例偏移。
   */
  host?: HTMLElement
}

export function itemsOf(runtime: StudioAppRuntime): SceneObjectLike[] {
  return (runtime.appCtx.studioState?.items || []) as SceneObjectLike[]
}

export function findItem(runtime: StudioAppRuntime, id: string): SceneObjectLike | undefined {
  return itemsOf(runtime).find((candidate) => candidate.id === id)
}

/** 楼层组：全楼视图按 `floorId` 找子节点，单层视图下 `sceneRootNode` 就是它。 */
function floorNodeOf(runtime: StudioAppRuntime) {
  const root = runtime.appCtx.sceneRootNode as { children?: Array<Record<string, unknown>> } | null
  if (!root) return null
  if (runtime.getPreviewFloorMode?.() !== 'all') return root
  const floorId = runtime.appCtx.activeFloorId
  return (
    (root.children || []).find(
      (child) => (child.userData as Record<string, unknown> | undefined)?.floorId === floorId,
    ) ?? root
  )
}

/**
 * 楼层坐标系读取器。
 *
 * **不做跨帧缓存**（与 0.8.7 `jl()` 一致：它每次现算 origin 与 `matrixWorld`）。
 * 曾经的缓存键是 `楼层:模式:sceneRevisionCount`，但编辑器里 `sceneRevisionCount`
 * 只在嵌入舞台递增，从不变化 —— 于是「绘制空间 / 移动墙体」改变模型包围盒中心
 * （`sceneModelOrigin`）之后，缓存的 origin 仍是旧值：灯位圆点、旋转环、高度手柄
 * 与拾取框整体偏移 `Δorigin / ppm`，而且再也不会自愈。全楼视图里楼层组的
 * `matrixWorld` 会被总览叠层动画连续改写，缓存同样会留下旧矩阵。
 */
export function createFrameReader(runtime: StudioAppRuntime): { frame: () => FloorFrame; clear: () => void } {
  const clear = (): void => {
    /* 无缓存可清；保留接口以免调用方（提交后 clearCache）还要判空。 */
  }
  const frame = (): FloorFrame => {
    const pixelsPerMeter = Number(runtime.getPixelsPerMeter() || 100)
    // 与 `createFloorWorldMapper` 同源，但不触发 `closedWallLoops`（那个才是真正贵的部分）。
    const state = runtime.appCtx.studioState
    const origin = runtime.appCtx.sceneModelOrigin ||
      (state ? sceneModelOriginOf(state, runtime.getActiveFloor()) : null) || {
        x: 0,
        y: 0,
      }
    const node = floorNodeOf(runtime) as {
      updateWorldMatrix?: (a: boolean, b: boolean) => void
      matrixWorld?: unknown
    } | null
    node?.updateWorldMatrix?.(true, false)
    const matrix = (node?.matrixWorld as MatrixLike | undefined)?.clone() ?? null
    return { origin, pixelsPerMeter, matrix }
  }
  return { frame, clear }
}

export function planPointOf(runtime: StudioAppRuntime, id: string): PlanPoint | null {
  const item = findItem(runtime, id)
  if (!item) return null
  return {
    x: Number(item.x || 0),
    y: Number(item.y || 0),
    elevation: Number(item.elevation || 0),
    rotation: Number(item.rotation || 0),
  }
}

/** 两个 4×4 矩阵快照是否一致（长度不同即不一致：缺矩阵 ⇄ 有矩阵必须重算）。 */
function matrixMatches(snapshot: number[], elements: ArrayLike<number> | undefined): boolean {
  if (!elements) return snapshot.length === 0
  if (snapshot.length !== 16) return false
  for (let index = 0; index < 16; index += 1) if (snapshot[index] !== elements[index]) return false
  return true
}

/** 真实几何高度范围：优先用已加载对象的包围盒，没有就按状态里的高（米）估算。 */
export function heightBoundsOf(
  runtime: StudioAppRuntime,
  id: string,
  liveObject: (id: string) => SceneObjectLike | null,
): { min: number; max: number; exact: boolean } | null {
  const item = findItem(runtime, id)
  if (!item) return null
  const elevation = Number(item.elevation || 0)
  const height = Number(item.height || 0)
  const object = liveObject(id) as {
    traverseVisible?: (visit: (node: { isMesh?: boolean }) => void) => void
  } | null
  if (object?.traverseVisible) {
    const box = new three.Box3()
    let hasMesh = false
    object.traverseVisible((node) => {
      if (!node.isMesh) return
      box.expandByObject(node as never)
      hasMesh = true
    })
    if (hasMesh && !box.isEmpty()) return { min: box.min.y, max: box.max.y, exact: true }
  }
  if (!(height > 0)) return null
  return { min: elevation, max: elevation + height, exact: true }
}

/**
 * 高度包络读取器：按「对象身份 + 根节点世界矩阵」缓存 `heightBoundsOf` 的结果。
 *
 * 逐帧 `traverseVisible` + `Box3.expandByObject` 的代价随选中模型的面片数增长，
 * 而家具子树相对根是静止的：根矩阵没变就没有任何重算的理由。
 */
function createItemHeightBoundsReader(runtime: StudioAppRuntime, liveObject: (id: string) => SceneObjectLike | null) {
  let cached: {
    object: SceneObjectLike | null
    matrix: number[]
    value: { min: number; max: number; exact: boolean } | null
  } | null = null
  return {
    read(id: string) {
      const object = liveObject(id)
      const elements = (object as { matrixWorld?: { elements?: ArrayLike<number> } } | null)?.matrixWorld?.elements
      if (cached && cached.object === object && matrixMatches(cached.matrix, elements)) return cached.value
      const value = heightBoundsOf(runtime, id, liveObject)
      cached = {
        object,
        matrix: elements ? Array.from({ length: 16 }, (_, index) => elements[index]) : [],
        value,
      }
      return value
    },
    invalidate() {
      cached = null
    },
  }
}

/**
 * 只认「模型包围盒」的高度范围：拿不到对象时返回 `exact:false` 的占位（`min = max = elevation`）。
 *
 * 与 `heightBoundsOf` 的差别：后者会用 `elevation + height` 合成一个「可信」范围供手柄使用；
 * 而清单与重叠浮层的文案要区分「真实几何」与「元数据」—— 0.8.7 `Ii()` 在模型缓存缺失时
 * 就是 `{min: elevation, max: elevation, exact: false}`，于是行文案回落到类型化离地字段。
 */
export function exactHeightBoundsOf(
  runtime: StudioAppRuntime,
  id: string,
): { min: number; max: number; exact: boolean } {
  const plan = planPointOf(runtime, id)
  const elevation = Number(plan?.elevation ?? 0)
  const root = runtime.appCtx.sceneRootNode as { traverse?: (visit: (node: SceneObjectLike) => void) => void } | null
  let found: SceneObjectLike | null = null
  root?.traverse?.((node) => {
    if (found) return
    const nodeId = (node.userData as Record<string, unknown> | undefined)?.editorItemId
    if (nodeId === id) found = node
  })
  const bounds = found ? heightBoundsOf(runtime, id, () => found) : null
  return bounds ?? { min: elevation, max: elevation, exact: false }
}

/**
 * 直接按 id 从场景里取物件的真实高度包围盒（「已放置」清单与服务端无关地复用）。
 *
 * 为什么不让清单自己算 `elevation + height`：挂墙柜 / 电视的模型原点不在底面，
 * 用元数据算出来的 `min` 会比真实底面高出一截，「实际高度 1.20–1.20 m」这类读数就错了。
 * 这里按 `userData.editorItemId` 找对象再取 Box3，找不到才退回元数据。
 */
export function sceneHeightBoundsOf(
  runtime: StudioAppRuntime,
  id: string,
): { min: number; max: number; exact: boolean } | null {
  const root = runtime.appCtx.sceneRootNode as { traverse?: (visit: (node: SceneObjectLike) => void) => void } | null
  if (!root?.traverse) return heightBoundsOf(runtime, id, () => null)
  let found: SceneObjectLike | null = null
  root.traverse((node) => {
    if (found) return
    const nodeId = (node.userData as Record<string, unknown> | undefined)?.editorItemId
    if (nodeId === id) found = node
  })
  return heightBoundsOf(runtime, id, () => found)
}

/**
 * 叠层坐标系尺寸（**布局像素**，不是 `getBoundingClientRect()` 的视觉像素）。
 *
 * 开启「整页等比缩放」时 `.app-shell` 带 `transform: scale(0.75)` 之类：画布布局宽仍是
 * 1366，视觉宽只有 ~1025。叠层 SVG 是宿主的绝对定位子元素，`viewBox` 也按
 * `clientWidth/Height` 写，所以叠层坐标必须是布局像素 —— 用 `rect.width` 算投影，
 * 圆点会被压到 0.75 倍并整体往左上挤（本次的偏移就是这么来的）。
 * 0.8.7 的 `so()` 同样取 `#preview-3d.clientWidth / clientHeight`；尺寸为 0 时返回 null。
 */
function overlaySizeOf(element: HTMLElement | HTMLCanvasElement): { width: number; height: number } | null {
  const width = element.clientWidth
  const height = element.clientHeight
  if (!width || !height) return null
  return { width, height }
}

/** 相机 / 射线 / 投影：三者都只依赖相机与画布。 */
function createCameraApi(runtime: StudioAppRuntime, canvas: HTMLCanvasElement, host?: HTMLElement) {
  const overlayHost: HTMLElement = host ?? canvas
  const raycaster = new three.Raycaster() as unknown as {
    setFromCamera: (coords: { x: number; y: number }, camera: object) => void
    ray?: { origin: Vec3; direction: Vec3 }
  }
  const screenPoint = new three.Vector3() as unknown as {
    set: (x: number, y: number, z: number) => unknown
    project: (camera: object) => { x: number; y: number; z: number }
  }
  return {
    hostSize: (): { width: number; height: number } => overlaySizeOf(overlayHost) ?? { width: 0, height: 0 },
    overlayToClient(x: number, y: number): { x: number; y: number } {
      // 布局盒 → 视觉盒是线性映射（整页 scale 后仍然成立），所以按两轴比例分别换算。
      // 直接用 `x + rect.left` 只在 scale=1 时正确：缩放后叠层坐标比视觉坐标大 1/s 倍。
      const rect = overlayHost.getBoundingClientRect()
      const size = overlaySizeOf(overlayHost)
      const scaleX = size ? rect.width / size.width : 1
      const scaleY = size ? rect.height / size.height : 1
      return { x: rect.left + x * scaleX, y: rect.top + y * scaleY }
    },
    pointerRay(clientX: number, clientY: number): Ray | null {
      const camera = runtime.appCtx.threeCamera
      if (!camera) return null
      // 指针是视觉坐标，换算 NDC 必须用 rect（含缩放后的真实位置）。
      raycaster.setFromCamera(screenToNdc(clientX, clientY, canvas.getBoundingClientRect()), camera)
      const ray = raycaster.ray
      if (!ray) return null
      return {
        origin: { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
        direction: { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
      }
    },
    project(world: Vec3): { x: number; y: number } | null {
      const camera = runtime.appCtx.threeCamera as { updateMatrixWorld?: (force?: boolean) => void } | null
      if (!camera) return null
      const size = overlaySizeOf(overlayHost)
      if (!size) return null
      // `Vector3.project` 用的是 `camera.matrixWorldInverse`，它只在 `render()` 或
      // `updateMatrixWorld()` 里刷新。OrbitControls 直接改 `position` + `lookAt` 后两者
      // 都还没跑，此时投影出来的是**上一帧的相机**：圆点会滞后一格（拖得越快偏得越多）。
      // 刷新一次是幂等的（矩阵没变就不重算），代价可忽略。
      camera.updateMatrixWorld?.()
      screenPoint.set(world.x, world.y, world.z)
      const projected = screenPoint.project(camera)
      // 与 0.8.7 的投影谓词一致：NDC 的 z 出 [-1,1] 说明点在相机后方 / 远裁面外，
      // 投出来的是镜像坐标，必须丢弃，否则灯位圆点会「跑到户型背后」。
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || projected.z < -1 || projected.z > 1)
        return null
      return { x: ((projected.x + 1) / 2) * size.width, y: ((-projected.y + 1) / 2) * size.height }
    },
    raycaster,
  }
}

/** 拾取：场景网格 → 单物件网格 → 包围盒回退（见 `editor-picking.ts`）。 */
function pickWithFrame(
  runtime: StudioAppRuntime,
  raycaster: ReturnType<typeof createCameraApi>['raycaster'],
  deps: GeometryDeps,
  frame: FloorFrame,
): EditorPick | null {
  const camera = runtime.appCtx.threeCamera
  if (!camera) return null
  deps.ensureIndex()
  const [hit] = pickEditorItems(three as never, {
    raycaster: raycaster as never,
    root: runtime.appCtx.sceneRootNode,
    // 隐藏的物件不再建对象，包围盒回退也必须一起跳过，否则「画面上没有、鼠标却点得中」。
    items: itemsOf(runtime).filter((pickCandidate) => !isPlacedItemHidden(runtime.appCtx, pickCandidate.id)),
    objectFor: (id) => deps.liveObject(id) as never,
    boundsFor: (item) => {
      const rawHeight = Number(item.height || 0)
      if (!(rawHeight > 0)) return null
      const elevation = Number(item.elevation || 0)
      return { min: elevation, max: elevation + rawHeight, exact: true }
    },
    floorMatrix: frame.matrix,
    origin: frame.origin,
    ppm: frame.pixelsPerMeter,
  })
  return hit ?? null
}

export function createGeometry(runtime: StudioAppRuntime, canvas: HTMLCanvasElement, deps: GeometryDeps): Geometry {
  const frames = createFrameReader(runtime)
  const camera = createCameraApi(runtime, canvas, deps.host)

  const toWorld = (planX: number, planY: number, elevation = 0): Vec3 => {
    const frame = frames.frame()
    const world = new three.Vector3(
      (planX - frame.origin.x) / frame.pixelsPerMeter,
      elevation,
      (planY - frame.origin.y) / frame.pixelsPerMeter,
    )
    if (frame.matrix) world.applyMatrix4(frame.matrix as never)
    return { x: world.x, y: world.y, z: world.z }
  }

  const fromWorld = (world: Vec3): { x: number; y: number } => {
    const frame = frames.frame()
    const local = new three.Vector3(world.x, world.y, world.z)
    if (frame.matrix) local.applyMatrix4(frame.matrix.invert() as never)
    return {
      x: local.x * frame.pixelsPerMeter + frame.origin.x,
      y: local.z * frame.pixelsPerMeter + frame.origin.y,
    }
  }

  /**
   * 选中物件的高度包络缓存。
   *
   * `heightBoundsOf` 每帧都要对整个子树 `traverseVisible` + `Box3.expandByObject`，
   * 而叠层刷新挂在主相机出图之后 —— 相机一转就重算一遍。这里按「对象身份 + 根节点
   * 世界矩阵」缓存：家具子树相对根是静止的，根没动就完全没有重算的理由；
   * 根动了（拖动 / 聚焦动画）矩阵必然变，立刻失效。
   */
  const heightBoundsReader = createItemHeightBoundsReader(runtime, deps.liveObject)
  const itemHeightBounds = heightBoundsReader.read

  return {
    mapper: () => {
      const frame = frames.frame()
      return { pixelsPerMeter: frame.pixelsPerMeter, origin: frame.origin }
    },
    toWorld,
    fromWorld,
    pointerRay: camera.pointerRay,
    project: camera.project,
    hostSize: camera.hostSize,
    overlayToClient: camera.overlayToClient,
    pickAt: (clientX, clientY) => {
      const cameraNode = runtime.appCtx.threeCamera
      if (!cameraNode) return null
      camera.raycaster.setFromCamera(screenToNdc(clientX, clientY, canvas.getBoundingClientRect()), cameraNode)
      const hit = pickWithFrame(runtime, camera.raycaster, deps, frames.frame())
      if (!hit) return null
      // 拾取层不读状态：灯具与物件的区分在调用方补，避免 picking 模块依赖 item 目录。
      return hit
    },
    itemPlanPoint: (id) => planPointOf(runtime, id),
    itemBaseWorldPoint: (id) => {
      const plan = planPointOf(runtime, id)
      return plan ? toWorld(plan.x, plan.y, plan.elevation) : null
    },
    itemTopWorldPoint: (id) => {
      const plan = planPointOf(runtime, id)
      if (!plan) return null
      const bounds = itemHeightBounds(id)
      return toWorld(plan.x, plan.y, bounds ? bounds.max : plan.elevation + Number(findItem(runtime, id)?.height || 0))
    },
    itemHeightBounds,
    clearCache: () => {
      heightBoundsReader.invalidate()
      frames.clear()
    },
  }
}

/**
 * 3D 视口编辑的选中桥（从 `editor-3d-wiring` 拆出）。
 *
 * 三件事：
 * 1. 把「场景树里的对象」和「状态里的 item id」对上（旧缓存 / 合批实例缺 tag，要回填）；
 * 2. 选中时重建场景（让选中项退出合批，这样才有描边与可拖对象）；
 * 3. 拖动期间按 id 取三维对象，写字状态时同步朝向。
 */

export interface SelectionBridge {
  ids: () => string[]
  select: (pick: EditorPick | null, additive: boolean) => void
  rebuildIndex: () => void
  liveObject: (id: string) => SceneObjectLike | null
  /** 索引脏了才重建（拾取前调用）。 */
  ensureIndex: () => void
  /** 场景重建后标记索引失效。 */
  invalidate: () => void
}

interface IndexState {
  entries: Map<string, SceneObjectLike>
  dirty: boolean
}

/** 选中项的 id 列表（单选与多选统一成数组）。 */
function selectedIds(runtime: StudioAppRuntime): string[] {
  const appCtx = runtime.appCtx
  if (appCtx.selectedItems?.length) {
    return (appCtx.selectedItems as EditorPick[]).filter((entry) => entry.kind === 'item').map((entry) => entry.id)
  }
  return appCtx.selectedItem?.kind === 'item' ? [appCtx.selectedItem.id] : []
}

/** 重建 id → 对象的索引；缺 tag 的对象先按世界坐标补齐。 */
function rebuildIndex(runtime: StudioAppRuntime, state: IndexState, mapper: () => PlanMapper): void {
  state.entries.clear()
  const root = runtime.appCtx.sceneRootNode
  adoptSceneItemTags({
    sceneRoot: root,
    items: itemsOf(runtime),
    toWorld: (planX, planY) => {
      const { pixelsPerMeter, origin } = mapper()
      return { x: (planX - origin.x) / pixelsPerMeter, z: (planY - origin.y) / pixelsPerMeter }
    },
    instanceOffset: (mesh, index) => {
      const matrix = new three.Matrix4()
      ;(mesh as unknown as { getMatrixAt: (i: number, m: object) => void }).getMatrixAt(index, matrix)
      return { x: matrix.elements[12], y: matrix.elements[13], z: matrix.elements[14] }
    },
  })
  root?.traverse?.((object: SceneObjectLike) => {
    const data = object.userData as Record<string, unknown> | undefined
    const id = data?.editorItemId
    if (typeof id === 'string' && id) state.entries.set(id, object)
  })
  state.dirty = false
}

/** 追加 / 移除一个选中项（Shift 点击）。 */
function toggleSelection(runtime: StudioAppRuntime, pick: EditorPick): void {
  const current = selectedIds(runtime)
  const next = current.includes(pick.id) ? current.filter((id) => id !== pick.id) : [...current, pick.id]
  runtime.appCtx.selectedItems = next.map((id) => ({ kind: 'item', id }) as EditorPick)
  runtime.appCtx.selectedItem = next.length ? { kind: 'item', id: next[next.length - 1] } : null
}

/**
 * 选中之后必须重建场景：选中项要退出合批（`createSelectionRef` 在重建时生效），
 * 否则既没有描边，拖动时也拿不到能实时移动的三维对象。
 */
function afterSelection(runtime: StudioAppRuntime, state: IndexState): void {
  state.dirty = true
  runtime.requestSceneRebuild?.({ scope: 'items', preserveLightCache: true })
  // 右侧属性面板由 `refreshStudioUi` 驱动；只刷 2D 平面的话会「选中了但面板不更新」。
  runtime.refreshStudioUi?.()
  runtime.refreshStudioView?.()
}

export function createSelectionBridge(runtime: StudioAppRuntime, mapper: () => PlanMapper): SelectionBridge {
  const state: IndexState = { entries: new Map(), dirty: true }
  const select = (pick: EditorPick | null, additive: boolean): void => {
    if (!pick) runtime.refreshSelection()
    else if (additive) toggleSelection(runtime, pick)
    else runtime.selectSceneObject('item', pick.id)
    rebuildIndex(runtime, state, mapper)
    afterSelection(runtime, state)
  }
  return {
    ids: () => selectedIds(runtime),
    select,
    rebuildIndex: () => rebuildIndex(runtime, state, mapper),
    invalidate: () => {
      state.dirty = true
    },
    ensureIndex: () => {
      if (state.dirty) rebuildIndex(runtime, state, mapper)
    },
    liveObject: (id) => state.entries.get(id) ?? null,
  }
}

/** 修改一个物件的状态，并把朝向同步到它的三维对象（拖动期间的即时反馈）。 */
export function writeItemState(
  runtime: StudioAppRuntime,
  selection: SelectionBridge,
  id: string,
  write: (item: SceneObjectLike) => void,
): void {
  const item = findItem(runtime, id)
  if (!item) return
  write(item)
  const object = selection.liveObject(id)
  if (object) applyItemOrientation(object, item)
}

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

/** 灯带工具条的 DOM 引用缓存：每帧 `querySelector` 是白跑的 O(n)，断开时才重新查。 */
let cachedLightToolbar: HTMLElement | null = null

function lightToolbarElement(): HTMLElement | null {
  if (cachedLightToolbar?.isConnected) return cachedLightToolbar
  cachedLightToolbar = globalThis.document.querySelector<HTMLElement>('.editor-light-toolbar')
  return cachedLightToolbar
}

/** 标签避让的障碍物：切换条 + 灯带工具条（两者都是浮在画布上的可点元素）。 */
function obstaclesOf(runtime: StudioAppRuntime, host: HTMLElement) {
  const rects = collectOverlayObstacles(runtime.appCtx, host)
  const toolbar = lightToolbarElement()
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

/**
 * 3D 叠层的「读取状态」与「离地吸附目标」（从 `editor-3d-wiring` 拆出）。
 *
 * 这两块都是决策而不是换算：`readOverlayState` 决定手柄显不显示、能不能拖、显示什么文案；
 * `elevationTargetsOf` 决定离地拖动会吸到地板还是桌面上。放在一起是因为它们共用
 * 同一份「物件 / 包围盒 / 相机」的上下文。
 */

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
 * 是**并列的排除项**，摊在 `readOverlayState` 里会让主线淹没在条件里。
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
    reason: modelPending ? '模型与灯光正在准备' : '',
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
  if (!item) return '当前分类已变化，操作已取消'
  const selected = runtime.appCtx.selectedItem as EditorPick | null | undefined
  if (selected?.kind !== 'item' || String(selected.id) !== id) return '当前分类已变化，操作已取消'
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

/**
 * 3D 编辑叠层的兜底看门狗（相机签名 + 降频轮询）。
 *
 * 从 `editor-3d-wiring` 拆出的原因有两个：
 * 1. 长度 —— 它自带一整套定时器 / 帧句柄状态，混在绑定函数里会把两者都顶过复杂度门禁的长度阈值；
 * 2. 职责 —— 这里只回答「叠层该不该重排」，不关心叠层由谁画、画了什么。
 */

/**
 * 相机 / 画布签名：任何一个数变了，叠层的投影就不再成立。
 *
 * 用三组 16 元矩阵（`matrixWorld` / `matrixWorldInverse` / `projectionMatrix`）+ 画布布局尺寸
 * + 场景修订号，比「监听某个事件」可靠 —— OrbitControls 会因相机模式切换被重建、
 * 帧循环有提前 return 的分支、`topRotation` 动画直接改矩阵而不发事件。
 *
 * `projectionMatrix` 不能漏：正交 ↔ 透视、改焦段、`resize` 都只动投影矩阵，
 * `matrixWorld` 可以一个字节都不变。
 *
 * 只做数值比较，不分配对象：调用方传入固定长度的 scratch 数组（3 项标量 + 3×16 矩阵）。
 * 早期版本每 tick 都 `push` 出一个 51 元素数组 —— 看门狗按帧跑，等于每秒 60 次纯分配。
 */
const SIGNATURE_SCALARS = 3
export const SIGNATURE_LENGTH = SIGNATURE_SCALARS + 3 * 16

export function writeCameraSignature(runtime: StudioAppRuntime, out: number[]): number[] {
  const camera = runtime.appCtx.threeCamera as {
    matrixWorld?: { elements?: ArrayLike<number> }
    matrixWorldInverse?: { elements?: ArrayLike<number> }
    projectionMatrix?: { elements?: ArrayLike<number> }
  } | null
  const canvas = runtime.appCtx.threeRenderer?.domElement as HTMLCanvasElement | undefined
  out[0] = canvas?.clientWidth ?? 0
  out[1] = canvas?.clientHeight ?? 0
  out[2] = runtime.appCtx.sceneRevisionCount
  let cursor = SIGNATURE_SCALARS
  for (const matrix of [camera?.matrixWorld, camera?.matrixWorldInverse, camera?.projectionMatrix]) {
    const elements = matrix?.elements
    if (elements) {
      for (let index = 0; index < 16; index += 1) out[cursor + index] = elements[index]
    } else {
      // 缺失时补 0 而不是缩短数组：长度一变就会被判成「变了」，每帧白白重排一次叠层。
      for (let index = 0; index < 16; index += 1) out[cursor + index] = 0
    }
    cursor += 16
  }
  return out
}

export function signatureChanged(previous: number[], next: number[]): boolean {
  if (previous.length !== next.length) return true
  for (let index = 0; index < next.length; index += 1) {
    // 相机矩阵有浮点抖动，1e-6 以内视为没动（否则松手后每帧都重排一次叠层）。
    // 前 3 项是画布宽高与场景修订号（整数），同一容差即可 —— 早期给它们 0.5 的余量，
    // 顺带把矩阵前三个元素也放过了一次，顶视旋转 90° 那种整元素变化会被吞掉。
    if (Math.abs(previous[index] - next[index]) > 1e-6) return true
  }
  return false
}

/** 交互窗口内按帧、静置后降到 5Hz 的排程器（帧句柄与定时器互斥，只有一个在跑）。 */
const IDLE_POLL_MS = 200
const ACTIVE_WINDOW_MS = 1500

function createWatchdogScheduler(tick: () => void) {
  let frame = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    /** tick 入口先调：清掉「已触发」的句柄，避免重复排程。 */
    consume: () => {
      frame = 0
      timer = null
    },
    clear: () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
    schedule: (isActive: boolean) => {
      if (isActive) {
        frame = requestAnimationFrame(tick)
        return
      }
      timer = setTimeout(tick, IDLE_POLL_MS)
    },
  }
}

/** 指针 / 可见性监听：指针或滚轮一到就回到逐帧模式（交互期响应与原实现一致）。 */
function bindWatchdogListeners(
  doc: Document | undefined,
  canvas: HTMLCanvasElement,
  onPointerActive: () => void,
  onVisibility: () => void,
): () => void {
  doc?.addEventListener('visibilitychange', onVisibility)
  canvas.addEventListener('pointerdown', onPointerActive, { passive: true })
  canvas.addEventListener('pointermove', onPointerActive, { passive: true })
  canvas.addEventListener('wheel', onPointerActive, { passive: true })
  return () => {
    doc?.removeEventListener('visibilitychange', onVisibility)
    canvas.removeEventListener('pointerdown', onPointerActive)
    canvas.removeEventListener('pointermove', onPointerActive)
    canvas.removeEventListener('wheel', onPointerActive)
  }
}

export interface OverlayWatchdog {
  start: () => void
  /** 叠层刚被刷新过（由 `update()` 调用）。 */
  touch: () => void
  dispose: () => void
}

/**
 * 交互窗口内按帧检查、静置后降到 5Hz 的看门狗。
 *
 * 为什么必须降频：SPA 里这个 rAF 永不停止，一台 24/7 的墙上平板光看门狗就是每天五百万次
 * 唤醒，而它绝大部分时间只是在比对 51 个浮点数。画面一旦真的变化（相机被拖 / 视角动画 /
 * 场景重建）都会有主相机出图，`installOverlayRefreshHook` 会先一步调用 `update()` 并
 * `touch()` 这里，所以降频不会让叠层变迟钝。
 */
export function createOverlayWatchdog(
  runtime: StudioAppRuntime,
  doc: Document | undefined,
  canvas: HTMLCanvasElement,
  previousSignature: number[],
  update: () => void,
): OverlayWatchdog {
  const probeSignature: number[] = new Array<number>(SIGNATURE_LENGTH).fill(0)
  const scheduler = createWatchdogScheduler(tick)
  let lastActivityAt = performance.now()
  let running = true
  let unbind: (() => void) | null = null

  const isActive = (): boolean => performance.now() - lastActivityAt < ACTIVE_WINDOW_MS

  function refreshIfCameraMoved(): void {
    writeCameraSignature(runtime, probeSignature)
    if (!signatureChanged(previousSignature, probeSignature)) return
    // 检测到变化就立刻回到逐帧模式：静置降频只是省唤醒，不能让「画面在动」也按 5Hz 追。
    // 主相机出图时 `installOverlayRefreshHook` 已经先一步刷过叠层，这里是它的兜底 ——
    // 兜底最多晚一个轮询间隔（200ms）发现变化，之后按帧跟上，不会持续滞后。
    lastActivityAt = performance.now()
    // 不在这里改 `previousSignature`：`update()` 会按它自己读到的签名记录，
    // 这样「本帧已经刷过」时看门狗自动跳过，叠层每帧只写一次 DOM。
    try {
      update()
    } catch (overlayError) {
      console.warn('[studio] 编辑叠层刷新失败', overlayError)
    }
  }

  function tick(): void {
    scheduler.consume()
    if (!running) return
    // 页面不可见时不比对也不排程：`visibilitychange` 回来时重新启动。
    if (!doc?.hidden) refreshIfCameraMoved()
    scheduler.schedule(isActive())
  }

  const markActive = (): void => {
    lastActivityAt = performance.now()
    if (!running) return
    scheduler.clear()
    scheduler.schedule(true)
  }

  const handleVisibility = (): void => {
    scheduler.clear()
    if (!running || doc?.hidden) return
    lastActivityAt = performance.now()
    scheduler.schedule(true)
  }

  return {
    start: () => {
      unbind = bindWatchdogListeners(doc, canvas, markActive, handleVisibility)
      scheduler.schedule(isActive())
    },
    touch: () => {
      lastActivityAt = performance.now()
    },
    dispose: () => {
      running = false
      scheduler.clear()
      unbind?.()
      unbind = null
    },
  }
}

/**
 * 3D 视口内的编辑叠层（0.8.7 `createEditor3DOverlay` 的对应实现）。
 *
 * 变更清单的原话是「可直接在 3D 画面中移动、旋转物件和调整离地高度」。落地方式是
 * **在画布上加一层 DOM 叠层 + 指针手势**，而不是往 WebGL 里塞 gizmo：
 * 手柄要显示数值、要能聚焦、要跟随 DPI 缩放，DOM 做这些比在 canvas 里画便宜得多。
 *
 * 与 OrbitControls 的关系是这个模块最需要小心的地方（0.8.7 同）：
 * - 画布上的**左键按下** → 只记下按下点并亮中心十字，不改选择、不拦截事件，OrbitControls 照常转视角；
 * - 左键**抬起且位移 < 4px** → 才算一次点击：用抬起位置拾取，命中就选中、点空白才取消选择；
 * - 物件的位置 / 旋转 / 离地只走手柄（`button.editor-height-arrow` 与灯带 gizmo 的圆环箭头），
 *   不靠「拖物件本体」——否则同一次左键拖动既想转视角又想搬东西。
 *
 * 「按下不改选择、松开才算点击」不是细节：0.8.7 的拾取监听挂在 `renderer.domElement`
 * 的 **pointerup** 上，且要求位移 < 4px。若改成 pointerdown 立刻判定，按住拖动转个视角、
 * 或点到宿主里的基础光面板 / 切换条，都会把选中项连同离地箭头、旋转环一起清掉 ——
 * 相机还能转（灯位圆点跟着走），但 gizmo 已经没了，看起来就是「坐标系不跟随」。
 *
 * 手势状态机在 `interaction/editor-3d-drag.ts`，几何在 `editor-3d-gesture.ts`；
 * 这里只负责 DOM、事件注册与手柄定位。
 *
 * DOM 契约与 0.8.7 **完全一致**，只有四个节点：
 * `button.editor-height-arrow`（内含 `span.editor-height-arrow-shape`）、
 * `span.editor-height-value`、`div.editor-orbit-marker`、`span.editor-orbit-caption`。
 * 本项目的旋转手柄与物件信息标签已按上游删除。
 */

/** 中心十字在「没有选中项 / 拖动中」时的展示时长（0.8.7 的 1400ms）。 */
const ORBIT_MARKER_DURATION_MS = 1400
/** 标签相对锚点的首选偏移（像素，与上游 `+12 / +5` 一致）。 */
const LABEL_OFFSET_X = 12
const LABEL_OFFSET_Y = 5

/** 叠层读取的状态（0.8.7 `fS()` 的返回值）。 */
export interface EditorOverlayRead {
  item: unknown
  /** 物件（顶面）中心的世界坐标。 */
  point: Vec3
  /** 物件顶面中心在画布内的屏幕坐标。 */
  screen: { x: number; y: number }
  angle: number
  length: number
  tip: { x: number; y: number }
  editable: boolean
  /** 不可编辑的原因（模型准备中 / 锁定 / 隐藏）。 */
  reason: string
  axisAvailable: boolean
  /** 例：`底部离地 0.54 m`。 */
  text: string
  /** 离地手势的竖直轴锚点（物件底面中心）。 */
  basePoint: Vec3
  /** 顶面（手柄锚点）的世界高度（米）。 */
  topElevation: number
}

/**
 * 叠层选项 = 拖动手势需要的全部回调（`DragControllerOptions`）+ 叠层自身需要的 DOM / 投影。
 *
 * 直接继承而不是重抄一遍：两边字段名完全一致，抄两份只会在改签名时漏掉一处。
 */
export interface Editor3DOverlayOptions extends DragControllerOptions {
  /** 叠层的宿主（通常是 `#preview-3d`）。 */
  host: HTMLElement
  /** 事件源（three 的 canvas）。 */
  canvas: HTMLCanvasElement
  /** 读取当前叠层状态；`null` 表示不显示。 */
  read: () => EditorOverlayRead | null
  /** 指针 → 命中的物件。 */
  pickAt: (clientX: number, clientY: number) => EditorPick | null
  /** 选中 / 取消选中（`additive` = Shift 追加）。 */
  select: (pick: EditorPick | null, additive: boolean) => void
  /** 当前是否允许在 3D 视口里编辑（例如嵌入舞台只读）。 */
  isEditable: () => boolean
  /** 双击聚焦物件（0.8.7 双击 = 把相机对准它）。 */
  focusItem?: (id: string) => void
  /**
   * 拖动期间的「中心十字」锚点（0.8.7 `orbitPoint`）：返回屏幕坐标与文案。
   * 未提供或不返回时隐藏；文案由调用方区分「物件中心 / 光源中心 / 视图中心」。
   */
  orbitPoint?: () => { x: number; y: number; label: string } | null
  /** 标签避让的障碍物（切换条 / 灯带工具条），坐标相对宿主。 */
  obstacles?: () => Array<{ left: number; right: number; top: number; bottom: number }>
  onError?: (message: string) => void
}

export interface Editor3DOverlay {
  update: () => void
  /** 结束进行中的拖动（工作区切换 / 场景重建 / 窗口失焦）；无手势时是空操作。 */
  cancel: () => void
  /** 拖动中 / 刚结束的短暂时间里画中心十字。 */
  showOrbit: () => void
  /** 当前是否有 3D 拖动手势进行中（标尺等叠层据此避让）。 */
  isDragging: () => boolean
  dispose: () => void
}

/** 叠层的 DOM 句柄（与上游四个节点一一对应）。 */
interface OverlayDom {
  root: HTMLElement
  /** 0.8.7 契约：`button.editor-height-arrow`（内部 `span.editor-height-arrow-shape`）。 */
  heightArrow: HTMLButtonElement
  /** 0.8.7 契约：`span.editor-height-value`（离地数值，独立于按钮）。 */
  heightValue: HTMLElement
  orbitMarker: HTMLElement
  orbitCaption: HTMLElement
}

function createOverlayDom(documentNode: Document, host: HTMLElement): OverlayDom {
  const root = documentNode.createElement('div')
  root.className = 'editor-3d-overlay'
  root.setAttribute('aria-hidden', 'true')

  // 高度箭头：0.8.7 用「按钮 + 内部形状」而不是一个圆点 —— 形状是竖条，
  // 长度由 `--editor-height-length` 控制，方向由 `--editor-height-angle` 控制。
  const heightArrow = documentNode.createElement('button')
  heightArrow.type = 'button'
  heightArrow.className = 'editor-height-arrow'
  heightArrow.setAttribute('aria-label', '拖动调整离地高度')
  heightArrow.tabIndex = -1
  const heightShape = documentNode.createElement('span')
  heightShape.className = 'editor-height-arrow-shape'
  heightShape.setAttribute('aria-hidden', 'true')
  heightArrow.append(heightShape)

  const heightValue = documentNode.createElement('span')
  heightValue.className = 'editor-height-value'
  heightValue.hidden = true

  const orbitMarker = documentNode.createElement('div')
  orbitMarker.className = 'editor-orbit-marker'
  orbitMarker.hidden = true
  orbitMarker.setAttribute('aria-hidden', 'true')

  const orbitCaption = documentNode.createElement('span')
  orbitCaption.className = 'editor-orbit-caption'
  orbitCaption.hidden = true
  orbitCaption.setAttribute('aria-hidden', 'true')

  root.append(heightArrow, heightValue, orbitMarker, orbitCaption)
  host.append(root)
  return { root, heightArrow, heightValue, orbitMarker, orbitCaption }
}

function placeHandle(element: HTMLElement, x: number, y: number): void {
  // 不取整：0.8.7 直接写 `style.left = screen.x + 'px'`。取整会让手柄 / 数值牌
  // 只能按 1px 台阶跳动，相机连续旋转时与圆环（0.1px 精度）不同步，看起来在抖。
  element.style.left = `${Number.isFinite(x) ? x : 0}px`
  element.style.top = `${Number.isFinite(y) ? y : 0}px`
}

/** 当前是否处于「拖动中 / 刚结束」窗口（决定中心十字显不显示）。 */
function orbitOf(
  options: Editor3DOverlayOptions,
  drag: DragController,
  orbitUntil: number,
): { x: number; y: number; label: string } | null {
  const active = Boolean(drag.current()) || Date.now() < orbitUntil
  return active ? (options.orbitPoint?.() ?? null) : null
}

/**
 * 组装这一帧需要避让排版的标签（与上游同一组）：高度数值 + 中心十字文案。
 *
 * 灯带 gizmo 的标签由 `editor-light-toolbar` 自己排版（它也有自己的 obstacles），
 * 所以这里只放叠层自己的两个。
 */
/**
 * 标签尺寸测量缓存。
 *
 * `buildOverlayLabels` 需要「这个数值牌有多宽」才能做避让。原实现每帧在**写完文本之后**
 * 读 `offsetWidth` —— 同一任务里的写入→读取会让浏览器强制同步布局，相机阻尼滑行时
 * 就是每秒 60 次。这里按文本缓存：文本不变就不读；文本变了也只读一次，
 * 且调用点已挪到所有 DOM 写入之前（读取不再把布局标脏）。
 */
interface LabelMetrics {
  text: string
  width: number
  height: number
  /** 尺寸是否真的量到了（隐藏元素量不到，此时结果不进缓存）。 */
  measured: boolean
}

const HIDDEN_LABEL_METRICS = new WeakMap<HTMLElement, LabelMetrics>()

function measureLabel(element: HTMLElement, fallbackWidth: number, fallbackHeight: number): LabelMetrics {
  const text = element.textContent ?? ''
  const cached = HIDDEN_LABEL_METRICS.get(element)
  if (cached && cached.measured && cached.text === text) return cached
  const width = element.offsetWidth
  const height = element.offsetHeight
  // 隐藏（`[hidden]` / `display:none`）时量到 0：这次结果**不能**进缓存，
  // 否则元素显示之后会一直拿兜底尺寸做避让。此时沿用上一次真实测量值。
  if (!width || !height) {
    return { text, width: cached?.width || fallbackWidth, height: cached?.height || fallbackHeight, measured: false }
  }
  const metrics: LabelMetrics = { text, width, height, measured: true }
  HIDDEN_LABEL_METRICS.set(element, metrics)
  return metrics
}

function buildOverlayLabels(
  dom: OverlayDom,
  read: EditorOverlayRead | null,
  orbit: { x: number; y: number; label: string } | null,
  metrics: { height: LabelMetrics; orbit: LabelMetrics },
): EditorLabelAnchor[] {
  const labels: EditorLabelAnchor[] = []
  if (read && !dom.heightArrow.hidden) {
    const anchor = read.tip ?? read.screen
    const { width, height } = metrics.height
    labels.push({
      id: 'height',
      anchor,
      width,
      height,
      preferred: { x: anchor.x + width / 2 + LABEL_OFFSET_X, y: anchor.y + height / 2 + LABEL_OFFSET_Y },
    })
  }
  if (orbit) {
    const { width, height } = metrics.orbit
    labels.push({
      id: 'orbit',
      anchor: { x: orbit.x, y: orbit.y },
      width,
      height,
      preferred: { x: orbit.x + width / 2 + 14, y: orbit.y + 19 },
    })
  }
  return labels
}

/** 把排版结果写回 DOM；缺失的标签保持隐藏。 */
function applyOverlayLabels(
  dom: OverlayDom,
  labels: EditorLabelAnchor[],
  placements: EditorLabelPlacement[],
  orbit: { x: number; y: number; label: string } | null,
): Map<string, { x: number; y: number }> {
  const byId = new Map(placements.map((placement) => [placement.id, placement]))
  const heightPlacement = byId.get('height')
  dom.heightValue.hidden = !heightPlacement
  if (heightPlacement) placeHandle(dom.heightValue, heightPlacement.x, heightPlacement.y)
  const orbitPlacement = byId.get('orbit')
  dom.orbitCaption.hidden = !orbitPlacement || !orbit
  if (orbitPlacement && orbit) {
    placeHandle(dom.orbitCaption, orbitPlacement.x, orbitPlacement.y)
    dom.orbitCaption.textContent = orbit.label
  }
  // 记录「相对锚点」的偏移，下一帧优先保持不动，避免拖动时左右横跳。
  const anchorById = new Map(labels.map((label) => [label.id, label.anchor]))
  const offsets = new Map<string, { x: number; y: number }>()
  for (const placement of placements) {
    const anchor = anchorById.get(placement.id)
    if (!anchor) continue
    offsets.set(placement.id, { x: placement.x - anchor.x, y: placement.y - anchor.y })
  }
  return offsets
}

/** 每帧 / 相机变化时重算手柄与标签位置。 */
function renderOverlay(
  options: Editor3DOverlayOptions,
  dom: OverlayDom,
  drag: DragController,
  state: { orbitUntil: number; previous: Map<string, { x: number; y: number }> },
): void {
  /*
   * 先读后写：这一帧需要的布局读数（标签尺寸 / 宿主尺寸 / 避让矩形）必须在任何 DOM
   * 写入之前取走。写在前面会把布局标脏，之后的每次读都要浏览器同步重排一遍 ——
   * 相机阻尼滑行时那边是每秒 60 次强制布局。
   */
  const read = options.read()
  const labelMetrics = {
    height: measureLabel(dom.heightValue, 90, 18),
    orbit: measureLabel(dom.orbitCaption, 70, 14),
  }
  const viewport = { width: options.host.clientWidth, height: options.host.clientHeight }
  const obstacles = options.obstacles?.() ?? []

  dom.root.classList.toggle('is-visible', Boolean(read))
  const orbit = orbitOf(options, drag, state.orbitUntil)
  dom.orbitMarker.hidden = !orbit
  if (orbit) placeHandle(dom.orbitMarker, orbit.x, orbit.y)

  if (!read) {
    dom.heightArrow.hidden = true
    dom.heightValue.hidden = true
    dom.orbitCaption.hidden = !orbit
    if (orbit) dom.orbitCaption.textContent = orbit.label
    return
  }
  const { screen, angle, length } = read
  dom.heightArrow.hidden = !read.axisAvailable
  dom.heightArrow.disabled = !read.editable
  dom.heightArrow.style.setProperty('--editor-height-angle', `${angle.toFixed(4)}rad`)
  dom.heightArrow.style.setProperty('--editor-height-length', `${length.toFixed(1)}px`)
  placeHandle(dom.heightArrow, screen.x, screen.y)
  dom.heightArrow.title =
    read.reason ||
    (read.editable
      ? '沿箭头拖动只调整安装/离地高度；键盘↑↓调整高度，Alt 精调，S 暂停吸附，Esc 取消'
      : '物品已锁定或隐藏，请先从已放置列表解锁/显示')
  dom.heightArrow.setAttribute('aria-label', `拖动调整离地高度${read.text ? `，${read.text}` : ''}`)
  dom.heightValue.textContent = read.text

  const labels = buildOverlayLabels(dom, read, orbit, labelMetrics)
  const placements = layoutEditorLabels(labels, {
    width: viewport.width,
    height: viewport.height,
    obstacles,
    previous: state.previous,
  })
  state.previous = applyOverlayLabels(dom, labels, placements, orbit)
}

interface OverlayHandlers {
  pointerDown: (event: PointerEvent) => void
  pointerUp: (event: PointerEvent) => void
  dblClick: (event: MouseEvent) => void
  keyDown: (event: KeyboardEvent) => void
  handlePointerDown: (kind: GestureKind) => (event: PointerEvent) => void
}

/**
 * 这次 pointerdown 是否应该走 3D 编辑：
 * 必须可编辑、左键、无修饰键，且**点在画布本身**（不是宿主的其它子节点）。
 *
 * 为什么必须限定画布：0.8.7 的拾取监听挂在 `renderer.domElement` 上，而这里的宿主
 * `#preview-3d` 里还有基础光调节面板、工作区切换条等可点节点。只判「不是叠层」的话，
 * 点一下这些面板就会被当成「点了空白」→ 取消选中 → 旋转环与离地箭头一起消失。
 *
 * 叠层自己的手柄 / 工具条 / gizmo 圆环也要排除：它们的 pointerdown 会先冒到宿主捕获阶段，
 * 若这里也记一笔按下点，抬起时就会凭空多出一次「点击」—— 把手柄下方那个物件选中/取消选中。
 * `editor-light-gizmo` 必须一并排除：它和叠层是兄弟节点，不属于 `.editor-3d-overlay`。
 */
function isPrimaryPointer(disposed: boolean, options: Editor3DOverlayOptions, event: PointerEvent): boolean {
  if (disposed || !options.isEditable()) return false
  if (event.button !== 0 || event.ctrlKey || event.metaKey) return false
  if (!options.canvas.contains(event.target as Node | null)) return false
  return !(event.target as Element | null)?.closest?.('.editor-3d-overlay, .editor-light-toolbar, .editor-light-gizmo')
}

/** 按下到抬起位移小于该值才算「点击」而不是拖动转视角（0.8.7 `_0x13b494` 的 4px）。 */
const PICK_CLICK_MAX_TRAVEL_PX = 4

function createHandlers(
  options: Editor3DOverlayOptions,
  drag: DragController,
  primarySelectedId: () => string | null,
  isDisposed: () => boolean,
  showOrbit: () => void,
): OverlayHandlers {
  /**
   * 按下画布时的位置。0.8.7 只在这里记一笔，真正的选择判定放到 pointerup ——
   * 「按一下就清选中」和「转个视角就清选中」是同一个 bug 的两种表现。
   */
  let press: { pointerId: number; clientX: number; clientY: number; shiftKey: boolean } | null = null

  const pointerDown = (event: PointerEvent): void => {
    if (!isPrimaryPointer(isDisposed(), options, event)) return
    // 0.8.7 `_0x5a64c7`：按下画布只记一笔并且亮中心十字（1.4s 后自己收），
    // **不拾取、不改选中、不 stopPropagation** —— 左键按下必须留给 OrbitControls 转视角。
    // 一旦在这里 stopPropagation，相机就再也转不动：灯位圆点由渲染钩子驱动仍会跟着相机走，
    // 而 gizmo 依赖的选中/手势被打断，表现出来就是「灯在动、坐标系不动」。
    showOrbit()
    press = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      shiftKey: event.shiftKey,
    }
  }

  const pointerUp = (event: PointerEvent): void => {
    const dragging = Boolean(drag.current())
    drag.finish(event)
    releasePointer(options.canvas, event.pointerId)
    const started = press
    press = null
    if (!started || started.pointerId !== event.pointerId) return
    // 拖动 / 取消（pointercancel）不是点击：0.8.7 同样只在「按下→抬起 < 4px」时拾取。
    if (event.type === 'pointercancel' || dragging) return
    if (isDisposed() || !options.isEditable()) return
    const travel = Math.hypot(event.clientX - started.clientX, event.clientY - started.clientY)
    if (travel >= PICK_CLICK_MAX_TRAVEL_PX) return
    // 0.8.7 `_0x13b494`：用**抬起位置**重新拾取；点空白才取消选择。
    const pick = options.pickAt(event.clientX, event.clientY)
    options.select(pick, started.shiftKey)
  }

  const dblClick = (event: MouseEvent): void => {
    if (isDisposed() || !options.isEditable() || !options.focusItem) return
    // 与拾取同口径：只有双击画布本身才算「聚焦物件」，宿主里的面板不算。
    if (!options.canvas.contains(event.target as Node | null)) return
    const pick = options.pickAt(event.clientX, event.clientY)
    if (!pick || pick.kind !== 'item') return
    event.preventDefault()
    event.stopPropagation()
    options.focusItem(pick.id)
  }

  const keyDown = (event: KeyboardEvent): void => {
    if (isDisposed() || !options.isEditable() || !primarySelectedId()) return
    const step = event.shiftKey ? NUDGE_STEP_METERS * 5 : event.altKey ? NUDGE_STEP_METERS / 5 : NUDGE_STEP_METERS
    const pixels = step * options.mapper().pixelsPerMeter
    const actions: Record<string, () => void> = {
      ArrowLeft: () => nudgeSelection(options, -pixels, 0),
      ArrowRight: () => nudgeSelection(options, pixels, 0),
      ArrowUp: () => nudgeSelection(options, 0, -pixels),
      ArrowDown: () => nudgeSelection(options, 0, pixels),
      PageUp: () => stepElevation(options, step),
      PageDown: () => stepElevation(options, -step),
      '[': () => stepRotation(options, -ROTATE_STEP_DEGREES),
      ']': () => stepRotation(options, ROTATE_STEP_DEGREES),
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    event.stopPropagation()
    action()
  }

  const handlePointerDown = (kind: GestureKind) => (event: PointerEvent) => {
    if (isDisposed() || !options.isEditable()) return
    event.stopPropagation()
    event.preventDefault()
    const primaryId = primarySelectedId()
    if (primaryId && drag.begin(kind, event, { kind: 'item', id: primaryId }))
      capturePointer(options.canvas, event.pointerId)
  }

  return { pointerDown, pointerUp, dblClick, keyDown, handlePointerDown }
}

export function createEditor3DOverlay(options: Editor3DOverlayOptions): Editor3DOverlay {
  const dom = createOverlayDom(options.host.ownerDocument, options.host)
  const drag = createDragController(options)
  let disposed = false
  const state = { orbitUntil: 0, previous: new Map<string, { x: number; y: number }>() }
  /** 中心十字的收起计时器（0.8.7 `_0x78bea4`）。 */
  let orbitTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * 叠层重排不能让手势中断：这里在事件处理里同步跑，抛错会把同一次 pointerdown 的
   * 其余监听（OrbitControls）一起打断，表现为「按一下整个预览卡住」。
   */
  const repaintOrbit = (): void => {
    try {
      renderOverlay(options, dom, drag, state)
    } catch (overlayError) {
      console.warn('[studio] 中心十字重排失败', overlayError)
    }
  }
  /**
   * 亮中心十字：**立即重排一次**，1.4s 后再重排收起（0.8.7 `_0x78bea4` 的定时器）。
   *
   * 只写 `orbitUntil` 而不重排的话，相机不动就没有下一帧 —— 用户按下画布后
   * 十字要等到下一次相机变化才出现，看起来像「没反应」。
   */
  const showOrbit = (): void => {
    state.orbitUntil = Date.now() + ORBIT_MARKER_DURATION_MS
    repaintOrbit()
    if (orbitTimer) clearTimeout(orbitTimer)
    orbitTimer = setTimeout(() => {
      orbitTimer = null
      if (!disposed) repaintOrbit()
    }, ORBIT_MARKER_DURATION_MS)
  }
  const primarySelectedId = (): string | null => options.selectedIds()[0] ?? null
  const handlers = createHandlers(options, drag, primarySelectedId, () => disposed, showOrbit)
  const contextLost = (): void => {
    drag.finishActive()
    renderOverlay(options, dom, drag, state)
  }

  /*
   * 必须挂在**宿主**的捕获阶段，而不是画布上。
   * OrbitControls 的 pointerdown 注册在画布上；同一个元素上的监听按注册顺序触发，
   * 它是先注册的，挂在画布上就抢不到。宿主是画布的祖先，捕获阶段一定先跑 ——
   * 这里只做「记下按下点 / 亮中心十字」，不拦截事件，所以左键拖动仍然是转视角
   * （0.8.7 的拾取同样发生在 pointerup，且挂在 `renderer.domElement` 上）。
   */
  options.host.addEventListener('pointerdown', handlers.pointerDown, { capture: true })
  window.addEventListener('pointermove', drag.move)
  window.addEventListener('pointerup', handlers.pointerUp)
  window.addEventListener('pointercancel', handlers.pointerUp)
  options.host.addEventListener('dblclick', handlers.dblClick)
  options.host.addEventListener('webglcontextlost', contextLost)
  dom.heightArrow.addEventListener('pointerdown', handlers.handlePointerDown('elevation'))
  options.host.addEventListener('keydown', handlers.keyDown)
  if (options.host.tabIndex < 0) options.host.tabIndex = 0

  return {
    update: () => {
      if (!disposed) renderOverlay(options, dom, drag, state)
    },
    cancel() {
      if (disposed) return
      drag.finishActive()
      renderOverlay(options, dom, drag, state)
    },
    showOrbit,
    isDragging: () => Boolean(drag.current()),
    dispose() {
      disposed = true
      if (orbitTimer) clearTimeout(orbitTimer)
      orbitTimer = null
      options.host.removeEventListener('pointerdown', handlers.pointerDown, { capture: true })
      window.removeEventListener('pointermove', drag.move)
      window.removeEventListener('pointerup', handlers.pointerUp)
      window.removeEventListener('pointercancel', handlers.pointerUp)
      options.host.removeEventListener('dblclick', handlers.dblClick)
      options.host.removeEventListener('webglcontextlost', contextLost)
      options.host.removeEventListener('keydown', handlers.keyDown)
      dom.root.remove()
    },
  }
}

/** 一次编辑事务：开始 → 改 → 提交 → 结束（键盘操作与拖动共用同一条链路）。 */
function withTransaction(options: Editor3DOverlayOptions, mutator: () => void): void {
  options.beginInteraction()
  mutator()
  options.commit()
  options.endInteraction()
}

function nudgeSelection(options: Editor3DOverlayOptions, deltaX: number, deltaY: number): void {
  const targets = options.selectedIds()
  const primaryId = targets[0]
  withTransaction(options, () => {
    for (const id of targets.length ? targets : primaryId ? [primaryId] : []) {
      const start = options.itemPlanPoint(id)
      if (!start) continue
      options.moveItem(id, start.x + deltaX, start.y + deltaY)
      options.moveLiveItem(id, start.x + deltaX, start.y + deltaY)
    }
  })
}

function stepElevation(options: Editor3DOverlayOptions, delta: number): void {
  const primaryId = options.selectedIds()[0]
  const plan = primaryId ? options.itemPlanPoint(primaryId) : null
  if (!primaryId || !plan) return
  const limits = options.elevationLimits(primaryId)
  withTransaction(options, () =>
    options.setItemElevation(primaryId, Math.min(limits.maximum, Math.max(limits.minimum, plan.elevation + delta))),
  )
}

function stepRotation(options: Editor3DOverlayOptions, delta: number): void {
  const primaryId = options.selectedIds()[0]
  const plan = primaryId ? options.itemPlanPoint(primaryId) : null
  if (!primaryId || !plan) return
  withTransaction(options, () => options.rotateItem(primaryId, snapEditorRotation(plan.rotation + delta)))
}

/** 指针捕获在合成事件 / 已失效的 pointerId 上会抛，捕获失败不该打断拖动手势。 */
function capturePointer(canvas: HTMLElement, pointerId: number): void {
  try {
    canvas.setPointerCapture?.(pointerId)
  } catch {
    /* 忽略：合成事件或指针已释放 */
  }
}

function releasePointer(canvas: HTMLElement, pointerId: number): void {
  try {
    canvas.releasePointerCapture?.(pointerId)
  } catch {
    /* 忽略：指针从未被捕获 */
  }
}

/**
 * 3D 视口编辑的装配层（0.8.7 `studio-app.js` 里 `createEditor3DOverlay({...})` 调用点的对应实现）。
 *
 * 职责边界刻意分开：
 * - `interaction/editor-picking.ts`        拾取（实例合批 / 祖先 tag / 包围盒回退）
 * - `interaction/editor-3d-gesture.ts`     几何（射线 / 平面 / 吸附）
 * - `ui/editor-3d-geometry.ts`             世界坐标换算（含楼层矩阵）
 * - `ui/editor-3d-selection.ts`            选中桥与场景索引
 * - `ui/editor-3d-overlay-state.ts`        叠层读取状态 / 离地目标 / 手势校验
 * - `ui/editor-3d-overlay.ts`              状态机与 DOM
 * - `ui/editor-3d-overlay-options.ts`      叠层选项装配
 * - `ui/editor-light-toolbar-options.ts`   灯带工具条选项装配
 *
 * 本文件只剩「事务 + 绑定生命周期」：不含算法，也不含回调拼装。
 */

export interface Editor3DBinding {
  update: () => void
  cancel: () => void
  /** 是否有 3D 拖动手势进行中（平面标尺据此整层收起）。 */
  isDragging: () => boolean
  dispose: () => void
}

const editor3DBindings = new WeakMap<object, Editor3DBinding>()
let armedRuntime: StudioAppRuntime | null = null

/** boot 结束时交给本模块的 runtime；渲染器可能还没创建，绑定推迟到第一次刷新。 */
export function armEditor3D(runtime: StudioAppRuntime): void {
  armedRuntime = runtime
}

/** 每次画布重绘 / UI 刷新后调用；未绑定时是空操作。 */
export function refreshEditor3D(appCtx: object): void {
  const existing = editor3DBindings.get(appCtx)
  if (existing) {
    existing.update()
    return
  }
  if (!armedRuntime || armedRuntime.appCtx !== appCtx) return
  bindEditor3D(armedRuntime).update()
}

/** 路由离开 / 舞台卸载时调用：摘掉画布与叠层的监听。 */
export function disposeEditor3D(appCtx: object): void {
  editor3DBindings.get(appCtx)?.dispose()
}

/** 结束进行中的 3D 编辑手势（工作区切换 / 场景重建 / 窗口失焦）。 */
export function cancelEditor3D(appCtx: object): void {
  editor3DBindings.get(appCtx)?.cancel()
}

/**
 * 灯带高度变化的强度补偿（0.8.7 `lightHeightResponse`）。
 *
 * 面光源越靠近被照面越亮是物理事实，但编辑时用户调的是「离地高度」，不是亮度：
 * 不补偿的话抬高 30cm 会让墙上的光斑突然消失。这里按高度比缩放强度，
 * 并把本次高度记为新的基准（下一次拖动的除数）。
 */
function compensateStripLightIntensity(object: Record<string, unknown>, nextHeight: number): void {
  const height = Math.max(0.05, Number(nextHeight) || 0)
  type LightNode = { isRectAreaLight?: boolean; intensity?: number; userData?: Record<string, unknown> }
  const traversable = object as { traverse?: (callback: (node: LightNode) => void) => void }
  traversable.traverse?.((node) => {
    const data = node.userData || {}
    if (!node.isRectAreaLight || data.lightSourceType !== 'continuous-area-strip') return
    const previous = Number(data.lightHeightResponse) || height
    const factor = height / previous
    node.intensity = Number(node.intensity || 0) * factor
    data.lightOnIntensity = Number(data.lightOnIntensity || 0) * factor
    if (Number.isFinite(data.regionFullIntensity)) data.regionFullIntensity = Number(data.regionFullIntensity) * factor
    data.lightHeightResponse = height
  })
}

/** 提交后按新离地补偿灯带强度（只对灯带生效）。 */
function compensateLightsAfterCommit(runtime: StudioAppRuntime, selection: SelectionBridge): void {
  for (const id of selection.ids()) {
    const item = findItem(runtime, id)
    const object = selection.liveObject(id)
    if (item && object) compensateStripLightIntensity(object, Number(item.elevation || 0))
  }
}

/** 事务：开始记一份撤销快照，提交时用它校验 / 回滚 / 重建。 */
function createTransaction(runtime: StudioAppRuntime, tx: TransactionState) {
  const beginInteraction = (): void => {
    tx.snapshot = runtime.captureUndoSnapshot?.() ?? null
    runtime.handleOrbitStart?.()
  }
  const commit = (scope: 'items' | 'lights'): boolean => {
    const accepted = tx.snapshot === null ? true : runtime.validateSelectionChange(tx.snapshot)
    if (accepted) runtime.applyPlacementChange?.(tx.snapshot)
    runtime.markDocumentDirty?.()
    runtime.requestSceneRebuild?.({ scope, preserveLightCache: true })
    // 提交后同步属性面板：否则「3D 里拖完，右侧离地字段还是旧值」。
    runtime.refreshStudioUi?.()
    runtime.refreshStudioView?.()
    tx.snapshot = null
    return accepted
  }
  const endInteraction = (): void => {
    runtime.handleOrbitEnd?.()
  }
  return { beginInteraction, commit, endInteraction }
}

/** 场景 / 渲染器缺失时的空绑定（嵌入舞台只读、首帧未就绪）。 */
function emptyBinding(): Editor3DBinding {
  return { update: () => {}, cancel: () => {}, isDragging: () => false, dispose: () => {} }
}

/**
 * 是否有 3D 拖动手势进行中。
 *
 * 平面标尺用它决定是否整层收起（0.8.7 `nS()` 的 `On`）：拖动物件时标尺压在
 * 手柄上会既看不清读数、也点不到手柄。
 */
export function isEditor3DGestureActive(appCtx: object): boolean {
  return editor3DBindings.get(appCtx)?.isDragging() ?? false
}

/**
 * 绑定所需的一整套对象：几何、选中桥、台面索引、事务。
 *
 * 抽成函数是为了让 `bindEditor3D` 只做「建叠层 + 挂监听 + 返回」，
 * 不把初始化细节和生命周期混在一起。
 */
interface BindingCore {
  geometry: Geometry
  selection: SelectionBridge
  surfaceIndex: ReturnType<typeof createSurfaceIndex>
  transaction: ReturnType<typeof createTransaction>
  tx: TransactionState
}

function createBindingCore(runtime: StudioAppRuntime, canvas: HTMLCanvasElement, host?: HTMLElement): BindingCore {
  let ensureIndex = (): void => {}
  let liveObject = (_id: string): Record<string, unknown> | null => null
  const geometry = createGeometry(runtime, canvas, {
    ensureIndex: () => ensureIndex(),
    liveObject: (id) => liveObject(id),
    host,
  })
  const selection = createSelectionBridge(runtime, geometry.mapper)
  const surfaceIndex = createSurfaceIndex(three as never)
  ensureIndex = selection.ensureIndex
  liveObject = selection.liveObject
  const tx: TransactionState = { snapshot: null }
  return { geometry, selection, surfaceIndex, transaction: createTransaction(runtime, tx), tx }
}

function createOverlayBinding(
  runtime: StudioAppRuntime,
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  core: BindingCore,
) {
  const { geometry, selection, surfaceIndex, transaction } = core
  return createEditor3DOverlay(
    createOverlayOptions({
      runtime,
      geometry,
      selection,
      host,
      canvas,
      surfaceIndex,
      beginInteraction: () => {
        selection.rebuildIndex()
        // 台面索引按需重建：拖动开始 / 场景重建后，不在每帧遍历网格。
        surfaceIndex.rebuild(runtime.appCtx.sceneRootNode)
        transaction.beginInteraction()
      },
      commit: () => {
        const accepted = transaction.commit('items')
        compensateLightsAfterCommit(runtime, selection)
        selection.invalidate()
        geometry.clearCache()
        return accepted
      },
      endInteraction: () => {
        transaction.endInteraction()
        selection.invalidate()
      },
    }),
  )
}

function createToolbarBinding(runtime: StudioAppRuntime, core: BindingCore) {
  const { geometry, selection, tx, transaction } = core
  return createLightToolbar(
    createToolbarOptions({
      runtime,
      geometry,
      selection,
      tx,
      beginInteraction: () => {
        selection.rebuildIndex()
        transaction.beginInteraction()
      },
      commitLights: () => {
        // gizmo 现在也服务家具：家具改的是位置/旋转，走 items 作用域才会重算
        // 接触阴影与合批；灯具仍按 lights 作用域保留灯光缓存。
        const id = selection.ids()[0]
        const item = id ? findItem(runtime, id) : null
        transaction.commit(item && !isLightItem(item) ? 'items' : 'lights')
        selection.invalidate()
      },
    }),
  )
}

export function bindEditor3D(runtime: StudioAppRuntime): Editor3DBinding {
  const host = globalThis.document.getElementById('preview-3d')
  const canvas = runtime.appCtx.threeRenderer?.domElement as HTMLCanvasElement | undefined
  if (!host || !canvas) return emptyBinding()
  const core = createBindingCore(runtime, canvas, host)
  const overlay = createOverlayBinding(runtime, canvas, host, core)
  const toolbar = createToolbarBinding(runtime, core)
  // 上一次真正重排叠层时的相机签名。`update()` 自己写它，看门狗只比对 ——
  // 否则「渲染末尾刷一次」与看门狗会在同一帧各写一次 DOM：两次读相机的时间点不同，
  // 相机在阻尼滑行时每帧都会变，第二次写入就比第一帧晚半帧，整层灯位圆点会在两个
  // 位置之间来回闪（这正是「旋转 / 缩放时灯光图抖动」的直接原因）。
  const previousSignature: number[] = new Array<number>(SIGNATURE_LENGTH).fill(0)
  writeCameraSignature(runtime, previousSignature)
  let watchdog: OverlayWatchdog | null = null
  const update = (): void => {
    overlay.update()
    toolbar.update()
    // 签名在**写完**之后记录：`project()` 会刷新 `camera.updateMatrixWorld()`，
    // 记在前面的签名可能已经过期，下一帧看门狗会再刷一次（多余的一次 DOM 写）。
    writeCameraSignature(runtime, previousSignature)
    watchdog?.touch()
  }
  watchdog = createOverlayWatchdog(runtime, globalThis.document, canvas, previousSignature, update)
  watchdog.start()

  const binding: Editor3DBinding = {
    update,
    isDragging: () => overlay.isDragging(),
    cancel: () => {
      overlay.cancel()
      toolbar.cancel()
      update()
    },
    dispose() {
      watchdog?.dispose()
      overlay.dispose()
      toolbar.dispose()
      editor3DBindings.delete(runtime.appCtx)
    },
  }
  editor3DBindings.set(runtime.appCtx, binding)
  return binding
}
