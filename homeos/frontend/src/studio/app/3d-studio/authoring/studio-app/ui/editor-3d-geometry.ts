/**
 * 3D 视口编辑的坐标换算（从 `editor-3d-wiring` 拆出）。
 *
 * 世界坐标一律经过**楼层世界矩阵**：多楼层时楼层组带平移（全楼视图还有堆叠偏移），
 * 只用 `(x - origin) / ppm` 会把「二层右后角的柜子」拖到一层去 —— 早期版本就是这样。
 *
 * 拆成多个小工厂（投影 / 平面 / 拾取）而不是一个巨对象，是为了每段都能单独读：
 * 这些函数只做换算，不做决策。
 */
import * as three from '/static/vendor/three/0.187.0/three.module.min.js'
import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { pickEditorItems, type EditorPick } from '../interaction/editor-picking'
import { screenToNdc, type PlanMapper, type Ray, type Vec3 } from '../interaction/editor-3d-gesture'
import { sceneModelOrigin as sceneModelOriginOf } from '../../../plan/courtyard-drawing'
import { isPlacedItemHidden } from '../../items/placed-item-state'

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
