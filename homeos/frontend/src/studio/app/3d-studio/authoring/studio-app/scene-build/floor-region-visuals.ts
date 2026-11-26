/**
 * 地面分区板与地暖盘管的**挂载器**（0.8.9）。
 *
 * 与 `plan/studio-floor-render.ts` 的分工：那边只算规格（纯函数、可断言），
 * 这边唯一职责是把规格变成 three 对象并挂进场景根。
 *
 * ## 必须保持的三件事
 *
 * 1. **先隐藏整板再挂分区板**：两张面共面会 z-fighting，表现为地面持续闪烁；
 *    找不到整板时仍然挂分区板（宁可少一层阴影，也不要地面不出现）。
 * 2. **分区板带 `regionReceiverKind = 'floor'`**：与整板同标记，才不会被
 *    「导出 / 阴影」两条链路当成外来物体。
 * 3. **盘管用 `LineSegments` 而不是管子**：几十米管径做 TubeGeometry 会给每层增加
 *    数万三角面；一根 1.5px 的线在俯视里已经够辨识。
 *
 * ## 为什么用窄类型而不是宽类型转换
 *
 * three 由 `/static/vendor/...` 以原始 ES 模块导入，没有类型声明。用 `as` 直转宽类型
 * 会把「拼错类名」也放过去（运行期才炸），而本仓的宽类型棘轮只降不升。
 * 这里声明一个**只含用到成员**的接口，拼错会当场编译失败。
 */

import * as ns from '/static/vendor/three/0.187.0/three.module.min.js'

import {
  resolveFloorRegionPlates,
  resolveHeatingPolylines,
  shouldRenderHeating,
  type FloorRenderRecord,
  type HeatingPolyline,
} from '../../../plan/studio-floor-render'

/** 盘管离地高度（米）：略高于地面板，避免与板共面闪烁。 */
const HEATING_LIFT = 0.004

/** 盘管颜色（橙红，与「供热」语义一致）。 */
const HEATING_COLOR = 0xd4622a

/** 平面点（`{x, y}`，与 `FloorPoint` 同形）。 */
type PlanPt = { x: number; y: number }
type ThreeColor = { clone: () => ThreeColor; multiplyScalar: (scale: number) => ThreeColor }
/** three 对象里本模块用到的成员。 */
type ThreeObject = {
  visible: boolean
  name: string
  position: { set: (x: number, y: number, z: number) => void }
  rotation: { x: number; y: number; z: number }
  userData: Record<string, unknown>
  children: ThreeObject[]
  traverse: (visitor: (child: ThreeObject) => void) => void
  add: (...children: ThreeObject[]) => void
  remove: (...children: ThreeObject[]) => void
}
type ThreeShape = {
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  closePath: () => void
  holes: ThreeShape[]
}
type ThreeGeometry = { dispose: () => void; setAttribute: (name: string, attribute: unknown) => void }

type ThreeNamespace = {
  Group: new () => ThreeObject
  Mesh: new (geometry: ThreeGeometry, material: unknown) => ThreeObject
  LineSegments: new (geometry: ThreeGeometry, material: unknown) => ThreeObject
  Shape: new () => ThreeShape
  ShapeGeometry: new (shape: ThreeShape, curveSegments?: number) => ThreeGeometry
  BufferGeometry: new () => ThreeGeometry
  Float32BufferAttribute: new (array: number[], itemSize: number) => unknown
  LineBasicMaterial: new (options: { color: number; transparent?: boolean; opacity?: number }) => unknown
  MeshStandardMaterial: new (options: { color: ThreeColor | number; roughness: number; metalness: number }) => unknown
  Color: new (color: unknown) => ThreeColor
}

const three = ns as unknown as ThreeNamespace

/** 分区板材质参数（由 `plan/studio-floor-render.ts` 产出）。 */
export type FloorRegionMaterialParams = { brightness: number; roughness: number }

/**
 * 分区板材质工厂。
 *
 * 用整板同款基础色乘上分区的明度系数 —— 换贴图会在相邻分区之间错位（木纹对不上），
 * 只调明度在视觉上等价于「同一批木料的不同深浅」。
 */
export function createFloorRegionMaterialFactory(baseColor: unknown) {
  const color = new three.Color(baseColor)
  return (params: FloorRegionMaterialParams) =>
    new three.MeshStandardMaterial({
      color: color.clone().multiplyScalar(params.brightness),
      roughness: params.roughness,
      metalness: 0,
    })
}

export type MountFloorRegionOptions = {
  /** 场景根（通常 `appCtx.sceneRootNode`）。 */
  root: ThreeObject | null | undefined
  /** 当前楼层记录（含 `floorRegions` / `floorFinishTones` / `underfloorHeating`）。 */
  floorRecord: FloorRenderRecord | null | undefined
  /** 场景风格（只影响 `theme` 铺面的明度）。 */
  sceneStyle?: string
  /** 平面点 → 世界坐标。 */
  toWorld: (point: PlanPt) => { x: number; z: number }
  /** 地面板顶面的世界高度（米）。 */
  floorSurfaceY: number
  /** 材质工厂：给参数、出 MeshStandardMaterial（由宿主注入，复用其基础色）。 */
  createMaterial: (params: FloorRegionMaterialParams) => unknown
}

/** 宿主上下文里本模块用到的部分。 */
type FloorSceneAppCtx = {
  sceneRootNode?: ThreeObject | null
  activeFloorId?: string
  sceneStyle?: unknown
  studioProject?: { floors?: ReadonlyArray<{ id?: string } & FloorRenderRecord> }
}

/**
 * 宿主适配：从编辑器上下文取「当前楼层记录 + 场景根 + 风格」。
 *
 * 两个调用点（`buildStudioScene` 单层 / `buildArchitectureLayer` 多层）都用它，
 * 避免各自推导一遍楼层记录 —— 推导写两遍必然会在某次重构后不一致。
 */
export function mountFloorRegionVisualsForScene(options: {
  appCtx: FloorSceneAppCtx
  toWorld: (point: PlanPt) => { x: number; z: number }
  floorSurfaceY: number
  floorColor: unknown
}): ThreeObject | null {
  const { appCtx, toWorld, floorSurfaceY, floorColor } = options
  const floorRecord = (appCtx.studioProject?.floors || []).find(
    (floorCandidate) => floorCandidate.id === appCtx.activeFloorId,
  )
  return mountFloorRegionVisuals({
    root: appCtx.sceneRootNode,
    floorRecord,
    sceneStyle: String(appCtx.sceneStyle || 'default'),
    toWorld,
    floorSurfaceY,
    createMaterial: createFloorRegionMaterialFactory(floorColor),
  })
}

/**
 * 挂载分区板与盘管。
 *
 * 返回挂上的分组（没有手工分区时返回 `null`，调用方什么都不要做）。
 * 挂之前会清掉上一轮的同类节点 —— 重建楼层时不能叠加。
 */
export function mountFloorRegionVisuals(options: MountFloorRegionOptions): ThreeObject | null {
  const { root, floorRecord, sceneStyle = 'default', toWorld, floorSurfaceY, createMaterial } = options
  if (!root) return null

  disposePreviousVisuals(root)

  const plates = resolveFloorRegionPlates(floorRecord, sceneStyle)
  if (!plates) {
    // 关键：没有手工分区时把整板**显回来**。只藏不显会让「删掉全部分区」变成地面消失。
    setWholeFloorPlateVisible(root, true)
    return null
  }

  // 整板退场：分区板会覆盖同一块地面，留着就是闪烁。
  setWholeFloorPlateVisible(root, false)

  const group = new three.Group()
  group.userData.floorRegionPlates = true
  group.name = 'floor-region-plates'
  for (const plate of plates) {
    const mesh = buildPlateMesh(plate, toWorld, floorSurfaceY, createMaterial)
    if (mesh) group.add(mesh)
  }
  const coils = buildHeatingGroup(floorRecord, toWorld, floorSurfaceY)
  if (coils) group.add(coils)
  root.add(group)
  return group
}

/** 拆掉上一轮挂的节点（分层重建 / 切楼层都会走到这里）。 */
function disposePreviousVisuals(root: ThreeObject): void {
  for (const staleNode of [...root.children]) {
    const isOurs = staleNode.userData?.floorRegionPlates === true || staleNode.userData?.underfloorHeating === true
    if (!isOurs) continue
    root.remove(staleNode)
    disposeOwnedResources(staleNode)
  }
}

/** 只释放本模块自己 new 的几何 / 材质（分区板材质可能共享贴图）。 */
function disposeOwnedResources(node: ThreeObject): void {
  node.traverse((child) => {
    ;(child as unknown as { geometry?: ThreeGeometry }).geometry?.dispose?.()
    if (child.userData?.floorRegionPlate !== true && child.userData?.underfloorHeating !== true) return
    ;(child as unknown as { material?: { dispose?: () => void } }).material?.dispose?.()
  })
}

/** 整板显隐（保留节点：关掉分区后要能原样显回来）。 */
function setWholeFloorPlateVisible(root: ThreeObject, visible: boolean): void {
  for (const node of root.children) {
    if (node.userData?.regionReceiverKind === 'floor') node.visible = visible
  }
  root.userData.floorRegionPlatesActive = !visible
}

function buildPlateMesh(
  plate: { outline: PlanPt[]; holes: PlanPt[][]; params: FloorRegionMaterialParams },
  toWorld: (point: PlanPt) => { x: number; z: number },
  floorSurfaceY: number,
  createMaterial: (params: FloorRegionMaterialParams) => unknown,
): ThreeObject | null {
  const shape = ringToShape(plate.outline, toWorld)
  if (!shape) return null
  for (const hole of plate.holes) {
    const holePath = ringToShape(hole, toWorld)
    if (holePath) shape.holes.push(holePath)
  }
  const mesh = new three.Mesh(new three.ShapeGeometry(shape, 1), createMaterial(plate.params))
  // 与整板同姿态：XZ 平面、顶面抬到地面高度。
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(0, floorSurfaceY, 0)
  mesh.userData.regionReceiverKind = 'floor'
  mesh.userData.exportRole = 'plan'
  mesh.userData.floorRegionPlate = true
  return mesh
}

/** 平面环 → three.Shape（`Shape` 用 xy，映射到世界 xz）。 */
function ringToShape(ring: readonly PlanPt[], toWorld: (point: PlanPt) => { x: number; z: number }): ThreeShape | null {
  if (!Array.isArray(ring) || ring.length < 3) return null
  const shape = new three.Shape()
  ring.forEach((point, index) => {
    const world = toWorld(point)
    if (index === 0) shape.moveTo(world.x, world.z)
    else shape.lineTo(world.x, world.z)
  })
  shape.closePath()
  return shape
}

/** 盘管分组（没有可画的段时返回 `null`）。 */
function buildHeatingGroup(
  floorRecord: FloorRenderRecord | null | undefined,
  toWorld: (point: PlanPt) => { x: number; z: number },
  floorSurfaceY: number,
): ThreeObject | null {
  const polylines = resolveHeatingPolylines(floorRecord, toWorld)
  if (!shouldRenderHeating(floorRecord, polylines.length)) return null
  const positions = heatingPositions(polylines, floorSurfaceY)
  if (positions.length === 0) return null
  const geometry = new three.BufferGeometry()
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3))
  const lines = new three.LineSegments(
    geometry,
    new three.LineBasicMaterial({ color: HEATING_COLOR, transparent: true, opacity: 0.72 }),
  )
  lines.userData.underfloorHeating = true
  lines.userData.exportRole = 'plan'
  lines.name = 'underfloor-heating'
  return lines
}

/** 折线 → 顶点数组（每两段一条线段）。 */
function heatingPositions(polylines: readonly HeatingPolyline[], floorSurfaceY: number): number[] {
  const positions: number[] = []
  for (const polyline of polylines) {
    const [start, end] = polyline.points
    if (!start || !end) continue
    positions.push(start.x, floorSurfaceY + HEATING_LIFT, start.z, end.x, floorSurfaceY + HEATING_LIFT, end.z)
  }
  return positions
}
