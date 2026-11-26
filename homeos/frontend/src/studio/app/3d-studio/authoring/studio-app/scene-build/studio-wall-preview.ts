/**
 * 墙面家具预览的**批处理收尾**（0.8.9 `studio-wall-preview.js`）。
 *
 * ## 这个模块解决什么
 *
 * 挂墙家具（电视、壁挂空调、装饰画、壁灯…）在同一次装配里会被合批成 InstancedMesh。
 * 合批后同一批内所有实例共享一个 draw call，但它带来两个副作用：
 *
 * 1. **透明件失去稳定顺序**：合批把「先画不透明、后画透明」的绘制顺序抹平了，
 *    相邻两帧可能换上不同的顺序 —— 表现为玻璃面板闪烁（z-fighting 的邻居）。
 *    three 对透明物体按 `renderOrder` / `id` 排序，我们给每件透明/透射网格写一个
 *    **小数排序键**（`userData.studioEditorSortId`），键落在「本批最大 id 之上」，
 *    既不打乱不透明件，又让透明件在批内顺序确定。
 * 2. **批次可能漏件**：合批是按签名分组的，签名算错或可见性判断不一致时会静默漏掉
 *    一件。`planWallFurniture` 先做一次「声明参与合批的每一件都被覆盖」的校验，
 *    不满足就返回 `null`，调用方保持原状（宁可少一次优化，也不能让家具消失）。
 *
 * ## 与上游的两处有意差异
 *
 * - 上游还会重排 `root.children`（把批次与单品按固定顺序重挂）。本项目的图层顺序
 *   由 `scene-layers.ts` 统一管理（灯光/地面/墙体/物品各有固定层），在此重排会把
 *   层序打乱，因此只写排序键、不动 children。
 * - 上游的 `rebaseWallBatches`（墙体平移后按缓存原点重定位实例）在本项目**不需要**：
 *   墙体变动走整层重建（`scene-rebuild.ts`），批处理不复用，没有跨编辑累积漂移。
 *
 * ## 为什么类型这么窄
 *
 * 本模块只碰 three 的三样东西：`userData`、`material`、`traverse`。用窄接口而不是
 * 宽泛类型，既是门禁要求（宽类型棘轮只许下降），也顺手把「读哪个字段」写清楚了。
 */

/** 参与合批的节点标记（`scene-layers.ts` 写入）。 */
const ITEM_MODEL_LAYER = 'items'

/** three 的 Object3D 在本模块里被用到的部分。 */
export type SceneNodeLike = {
  id?: unknown
  userData?: Record<string, unknown> | null
  material?: unknown
  traverse?: (visit: (node: SceneNodeLike) => void) => void
}

/** 材质里只关心「是否透明 / 是否有透射」。 */
type MaterialLike = { transparent?: unknown; transmission?: unknown }

function isTransparentMesh(node: SceneNodeLike): boolean {
  const material = node.material
  if (!material) return false
  const list: unknown[] = Array.isArray(material) ? material : [material]
  return list.some((entry) => {
    const candidate = entry as MaterialLike | null | undefined
    return candidate?.transparent === true || Number(candidate?.transmission) > 0
  })
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

/** 节点覆盖的物品 id（合批节点用 `instanceItemIds`，单品用 `studioEditorItemId`）。 */
function coveredItemIds(node: SceneNodeLike): string[] {
  const userData = node.userData
  if (!userData) return []
  const instanceIds = stringList(userData.instanceItemIds)
  if (instanceIds.length) return instanceIds
  const ranges = userData.studioEditorItemRanges
  if (Array.isArray(ranges) && ranges.length) {
    return ranges
      .map((range) => (range && typeof range === 'object' ? String((range as { id?: unknown }).id ?? '') : ''))
      .filter(Boolean)
  }
  const single = userData.studioEditorItemId
  return typeof single === 'string' && single ? [single] : []
}

export type WallFurniturePlan = {
  /** 被节点覆盖的物品 id。 */
  ids: Set<string>
  /** 参与收尾的节点（物品层）。 */
  nodes: Set<SceneNodeLike>
  /** 合批节点本身。 */
  batches: SceneNodeLike[]
}

/**
 * 校验「声明参与合批的每一件都被某个节点覆盖」。
 *
 * @param root 场景根（内部按 `modelLayer === 'items'` 收集节点；合批节点可能在更深
 *   的层级，所以用 `traverse` 而不是只看 children）
 * @param visibleIds 本次声明要参与合批的物品 id
 * @returns 覆盖完整时返回计划；缺件/无可见件时返回 `null`（调用方保持原状）
 */
export function planWallFurniture(root: unknown, visibleIds: Iterable<string>): WallFurniturePlan | null {
  const wanted = new Set(Array.from(visibleIds, String).filter(Boolean))
  const sceneRoot = root as SceneNodeLike | null | undefined
  if (!wanted.size || typeof sceneRoot?.traverse !== 'function') return null
  const ids = new Set<string>()
  const covered = new Set<SceneNodeLike>()
  const batches: SceneNodeLike[] = []
  let hasProxy = false
  sceneRoot.traverse((node) => {
    const userData = node?.userData
    if (!userData) return
    // 选择代理不是真实家具：一旦混进来就不能按批次算顺序。
    if (userData.studioEditorSelectionProxy) hasProxy = true
    if (userData.modelLayer !== ITEM_MODEL_LAYER) return
    const nodeIds = coveredItemIds(node)
    if (!nodeIds.length) return
    for (const id of nodeIds) ids.add(id)
    covered.add(node)
    if (userData.instanceItemIds || userData.studioEditorItemRanges) batches.push(node)
  })
  if (hasProxy) return null
  for (const id of wanted) if (!ids.has(id)) return null
  return { ids, nodes: covered, batches }
}

/**
 * 给透明/透射网格写稳定排序键。
 *
 * 排序键取「本批最大对象 id + 名次比例」，因此：
 * - 一定大于该批内任何不透明件（不改变不透明件的先后）；
 * - 相邻透明件之间保持 1/(n+1) 的间距，后续插入还有空间。
 *
 * @returns 写入了多少个排序键（0 表示没有透明件或覆盖不完整）
 */
export function finishWallFurniture(root: unknown, visibleIds: Iterable<string>): number {
  const plan = planWallFurniture(root, visibleIds)
  if (!plan) return 0
  const transparent: SceneNodeLike[] = []
  let maxId = 0
  for (const node of plan.nodes) {
    node.traverse?.((mesh) => {
      maxId = Math.max(maxId, Number(mesh?.id ?? 0))
      if (mesh?.material && isTransparentMesh(mesh)) transparent.push(mesh)
    })
  }
  if (!transparent.length) return 0
  transparent.sort((left, right) => Number(left.id ?? 0) - Number(right.id ?? 0))
  const count = transparent.length
  transparent.forEach((mesh, index) => {
    const userData = (mesh.userData ??= {})
    userData.studioEditorSortId = maxId + (index + 1) / (count + 1)
  })
  return count
}
