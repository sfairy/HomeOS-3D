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
