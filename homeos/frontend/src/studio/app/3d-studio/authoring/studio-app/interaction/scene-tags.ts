/**
 * 给场景对象补上「物件 id」标记（0.8.7 `createEditorSelectionCache` 的核心用途之一）。
 *
 * 新构建的场景本来会由 `buildLayerGroup` 直接写 `userData.editorItemId`，但这不够：
 * 老版本留下的持久化场景缓存里，Group 是没有这个 tag 的；合批出来的 `InstancedMesh`
 * 也可能缺少 `instanceItemIds`。没有 tag 就拾取不到，用户会觉得「3D 里点不动」。
 *
 * 这里按**世界坐标**回填：
 * - 普通 Group：`position` 就是 `toWorld(item)` + `elevation`，三点坐标唯一对应；
 * - 合批实例：每条实例矩阵的平移量同样是物件世界位置。
 *
 * 坐标只用来**补缺失的标记**，不参与拖动计算；即使缓存里的位置与状态有极小偏差，
 * 也只在 1cm 量级内匹配（必要时可调 `POSITION_EPSILON`）。
 */

/** 位置匹配精度（米）。 */
const POSITION_EPSILON = 0.01

type SceneNode = {
  type?: string
  isInstancedMesh?: boolean
  count?: number
  position?: { x: number; y: number; z: number }
  userData?: Record<string, unknown>
  traverse?: (visit: (node: SceneNode) => void) => void
}

function positionKey(x: number, y: number, z: number): string {
  const step = (value: number): number => Math.round(value / POSITION_EPSILON)
  return `${step(x)}:${step(y)}:${step(z)}`
}

/** 实例矩阵的平移量（由调用方用 three 计算，避免本模块依赖 three）。 */
export type InstanceOffset = (mesh: SceneNode, instanceIndex: number) => { x: number; y: number; z: number } | null

export interface AdoptSceneTagsOptions {
  sceneRoot: SceneNode | null | undefined
  items: Array<Record<string, unknown>>
  toWorld: (planX: number, planY: number) => { x: number; z: number }
  instanceOffset: InstanceOffset
}

/** 合批实例：逐条算世界位移并回填 `instanceItemIds`；返回补齐的条数。 */
function adoptInstanceIds(
  node: SceneNode,
  data: Record<string, unknown>,
  idByPosition: Map<string, string>,
  instanceOffset: InstanceOffset,
): number {
  if (Array.isArray(data.instanceItemIds)) return 0
  const count = Number(node.count || 0)
  const ids: string[] = []
  for (let index = 0; index < count; index += 1) {
    const offset = instanceOffset(node, index)
    ids.push(offset ? (idByPosition.get(positionKey(offset.x, offset.y, offset.z)) ?? '') : '')
  }
  data.instanceItemIds = ids
  return ids.filter(Boolean).length
}

/** @returns 补齐的标记数量（用于诊断 / 测试断言）。 */
export function adoptSceneItemTags({ sceneRoot, items, toWorld, instanceOffset }: AdoptSceneTagsOptions): number {
  if (!sceneRoot?.traverse) return 0
  const idByPosition = new Map<string, string>()
  for (const item of items) {
    const id = item.id
    if (typeof id !== 'string' || !id) continue
    const world = toWorld(Number(item.x || 0), Number(item.y || 0))
    idByPosition.set(positionKey(world.x, Number(item.elevation || 0), world.z), id)
  }
  if (!idByPosition.size) return 0

  let tagged = 0
  sceneRoot.traverse((node) => {
    const data = (node.userData || (node.userData = {})) as Record<string, unknown>
    if (typeof data.editorItemId === 'string') return
    if (node.isInstancedMesh) {
      tagged += adoptInstanceIds(node, data, idByPosition, instanceOffset)
      return
    }
    if (node.type !== 'Group' || !node.position) return
    const id = idByPosition.get(positionKey(node.position.x, node.position.y, node.position.z))
    if (!id) return
    data.editorItemId = id
    tagged += 1
  })
  return tagged
}

/**
 * 台面索引（0.8.7 `studio-surface-index.js` 的对应实现）。
 *
 * 与「按状态字段估算」的差别：0.8.7 是**真的遍历三角面**，找到某一平面坐标下
 * 最高的那个面，并带回该面的法线。为什么必须这样：
 * - 圆桌 / 异形台面上，状态里的 `width×depth` 盒子会把「桌子外面」也算成台面；
 * - 斜靠的物件（靠垫、斜面板）顶面不是水平的，盒子法会给出错的高度；
 * - 有斜面的柜体，只有真正的水平三角面才应该当支撑面。
 *
 * 代价是遍历网格：所以索引**按需重建**（拖动开始 / 场景重建后），不在每帧调用。
 */

/** three 的最小结构化类型：只声明用到的成员，避免把整份类型定义拖进来。 */
type Vector3Like = {
  x: number
  y: number
  z: number
  set: (x: number, y: number, z: number) => Vector3Like
  applyMatrix4?: (matrix: unknown) => Vector3Like
}

type ThreeLike = {
  Vector3: new (x?: number, y?: number, z?: number) => Vector3Like
  Matrix3: new () => { getNormalMatrix: (m: unknown) => unknown }
}

/** 一条可命中的水平面记录：三角形 + 法线 + 高度。 */
interface SurfaceTriangle {
  ax: number
  ay: number
  az: number
  bx: number
  by: number
  bz: number
  cx: number
  cy: number
  cz: number
  normalY: number
}

export interface SurfaceHit {
  /** 该点台面的世界高度（米）。 */
  height: number
  /** 法线 Y 分量：越接近 1 越水平。 */
  normalY: number
}

export interface SurfaceIndex {
  /** 重建索引（场景重建 / 物件增删后调用）。 */
  rebuild: (root: unknown) => void
  /** 给定平面坐标处、不高于 `maxHeight` 的最高台面。 */
  surfaceAt: (x: number, z: number, maxHeight?: number) => SurfaceHit | null
  /** 把目标高度吸附到最近的台面；容差以外保持原值。 */
  snapElevation: (x: number, z: number, elevation: number, tolerance: number) => number
  /** 当前索引里的三角面数量（诊断用）。 */
  readonly size: number
  dispose: () => void
}

/** 只把「基本水平」的面当台面：斜面单独处理会让物件浮在半空。 */
const MIN_NORMAL_Y = 0.7
/** 低于这个高度的「台面」就是地板本身，不该吸。 */
const MIN_SURFACE_HEIGHT = 0.05

/** 从网格几何里收集世界空间的水平三角面。 */
function collectTriangles(
  three: ThreeLike,
  node: {
    isMesh?: boolean
    isInstancedMesh?: boolean
    geometry?: {
      attributes?: {
        position?: {
          count: number
          getX: (i: number) => number
          getY: (i: number) => number
          getZ: (i: number) => number
        }
      }
      index?: { count: number; getX: (i: number) => number } | null
    }
    matrixWorld?: unknown
    visible?: boolean
    material?: { visible?: boolean }
  },
  out: SurfaceTriangle[],
): void {
  const geometry = node.geometry
  const position = geometry?.attributes?.position
  if (!node.isMesh || !position || node.visible === false || node.material?.visible === false) return
  // 合批实例的变换在实例矩阵里，节点 matrixWorld 不带它们；这类不参与台面（体量小、多为装饰件）。
  if (node.isInstancedMesh) return
  const index = geometry.index
  const triangleCount = Math.floor((index ? index.count : position.count) / 3)
  const matrix = node.matrixWorld
  const a = new three.Vector3()
  const b = new three.Vector3()
  const c = new three.Vector3()
  const ab = new three.Vector3()
  const ac = new three.Vector3()
  const normalMatrix = new three.Matrix3().getNormalMatrix(matrix)
  const normal = new three.Vector3()
  const readIndex = (i: number) => (index ? index.getX(i) : i)
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const ia = readIndex(triangle * 3)
    const ib = readIndex(triangle * 3 + 1)
    const ic = readIndex(triangle * 3 + 2)
    a.set(position.getX(ia), position.getY(ia), position.getZ(ia)).applyMatrix4?.(matrix)
    b.set(position.getX(ib), position.getY(ib), position.getZ(ib)).applyMatrix4?.(matrix)
    c.set(position.getX(ic), position.getY(ic), position.getZ(ic)).applyMatrix4?.(matrix)
    // 用变换后的顶点直接算法线（矩阵里可能含非等比缩放，normalMatrix 会偏）。
    ab.set(b.x - a.x, b.y - a.y, b.z - a.z)
    ac.set(c.x - a.x, c.y - a.y, c.z - a.z)
    const nx = ab.y * ac.z - ab.z * ac.y
    const ny = ab.z * ac.x - ab.x * ac.z
    const nz = ab.x * ac.y - ab.y * ac.x
    const length = Math.hypot(nx, ny, nz)
    if (!(length > 1e-9)) continue
    const normalY = Math.abs(ny / length)
    if (normalY < MIN_NORMAL_Y) continue
    out.push({
      ax: a.x,
      ay: a.y,
      az: a.z,
      bx: b.x,
      by: b.y,
      bz: b.z,
      cx: c.x,
      cy: c.y,
      cz: c.z,
      normalY,
    })
  }
  void normalMatrix
  void normal
}

/** 点是否落在三角形在 XZ 平面的投影里（重心坐标）。 */
function triangleHeightAt(triangle: SurfaceTriangle, x: number, z: number): number | null {
  const denominator =
    (triangle.bz - triangle.cz) * (triangle.ax - triangle.cx) +
    (triangle.cx - triangle.bx) * (triangle.az - triangle.cz)
  if (Math.abs(denominator) < 1e-12) return null
  const wa =
    ((triangle.bz - triangle.cz) * (x - triangle.cx) + (triangle.cx - triangle.bx) * (z - triangle.cz)) / denominator
  const wb =
    ((triangle.cz - triangle.az) * (x - triangle.cx) + (triangle.ax - triangle.cx) * (z - triangle.cz)) / denominator
  const wc = 1 - wa - wb
  // 留一点边界余量：正好落在边上的点也算命中（否则柜子边缘会漏吸）。
  if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) return null
  return wa * triangle.ay + wb * triangle.by + wc * triangle.cy
}

export function createSurfaceIndex(three: ThreeLike): SurfaceIndex {
  let triangles: SurfaceTriangle[] = []
  return {
    rebuild(root) {
      triangles = []
      const node = root as {
        traverseVisible?: (visit: (n: never) => void) => void
        traverse?: (visit: (n: never) => void) => void
      }
      const visit = (child: never) => collectTriangles(three, child as never, triangles)
      if (node?.traverseVisible) node.traverseVisible(visit)
      else node?.traverse?.(visit)
    },
    surfaceAt(x, z, maxHeight = Infinity) {
      let best: SurfaceHit | null = null
      for (const triangle of triangles) {
        const height = triangleHeightAt(triangle, x, z)
        if (height === null || height < MIN_SURFACE_HEIGHT || height > maxHeight) continue
        if (!best || height > best.height) best = { height, normalY: triangle.normalY }
      }
      return best
    },
    snapElevation(x, z, elevation, tolerance) {
      const surface = this.surfaceAt(x, z)
      // 只往上吸：物件从桌面拖走时应该跟手下降，而不是被下方某张桌子吸住。
      if (!surface || surface.height <= elevation) return elevation
      return surface.height - elevation <= tolerance ? surface.height : elevation
    },
    get size() {
      return triangles.length
    },
    dispose() {
      triangles = []
    },
  }
}
