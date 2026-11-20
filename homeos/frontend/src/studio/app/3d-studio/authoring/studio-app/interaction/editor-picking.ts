/**
 * 3D 视口内的拾取（0.8.7 `pickEditorItems` 的对应实现）。
 *
 * 三种策略，按可靠性从高到低：
 * 1. **场景网格**：`traverseVisible` 收集可拾取网格（有实例表 / 编辑器范围 / 物件标记），
 *    与射线求交。命中实例时经 `instanceItemIds[instanceId]` 折算到物件 id。
 * 2. **单物件网格**：调用方给了 `objectFor(id)` 时，只对那一个物件的网格求交（精确）。
 * 3. **包围盒回退**：物件网格不可见 / 没有网格（灯具、隐形设备）时，用状态里的
 *    `width/depth` + 楼层矩阵构造 `Box3`，再 `ray.intersectBox`。
 *
 * 第 3 条是「灯具点不中」的根因修复点：灯具的模型在 3D 里往往不可见或极小，
 * 只靠网格射线永远选不中，而它们在平面上的占位是明确的。
 */

/** 一条拾取结果。`kind` 决定后续用哪套属性面板与拖动规则。 */
export interface EditorPick {
  kind: 'item' | 'light'
  id: string
  /** 命中的世界坐标（可选，用于把拖动锚点放在手指按下的位置）。 */
  point?: { x: number; y: number; z: number }
  /** 命中方式：诊断与测试用。 */
  via?: 'mesh' | 'object' | 'bounds'
  /** 命中距离（世界米）：候选排序与「重叠拾取」的默认顺序都按它。 */
  distance?: number
}

type SceneObject = {
  isInstancedMesh?: boolean
  isMesh?: boolean
  instanceId?: number
  userData?: Record<string, unknown>
  parent?: SceneObject | null
  visible?: boolean
  material?: { visible?: boolean } | Array<{ visible?: boolean }>
  position?: { x: number; y: number; z: number }
  traverseVisible?: (visit: (node: SceneObject) => void) => void
}

/** 命中记录里用到的字段（three 的 `Intersection` 最小子集）。 */
type Intersection = {
  object?: SceneObject
  instanceId?: number
  distance?: number
  point?: { x: number; y: number; z: number }
  face?: { materialIndex?: number }
}

type Raycaster = {
  ray: unknown
  intersectObjects: (objects: unknown[], recursive?: boolean) => Intersection[]
  intersectObject?: (object: unknown, recursive?: boolean) => Intersection[]
}

/** 材质级可见性：隐藏材质（例如透明掩码件）不该挡住后面的物件。 */
function materialVisible(hit: Intersection): boolean {
  const material = hit.object?.material
  if (Array.isArray(material)) return material[hit.face?.materialIndex ?? 0]?.visible !== false
  return material?.visible !== false
}

/** 合批实例：`instanceItemIds[instanceId]` 就是物件 id（实例号在相交记录上）。 */
function instancePickOf(object: SceneObject, instanceId: unknown): EditorPick | null {
  const ids = object.userData?.instanceItemIds
  if (!object.isInstancedMesh || !Array.isArray(ids)) return null
  const id = ids[Number(instanceId)]
  return typeof id === 'string' && id ? { kind: 'item', id } : null
}

/** 从命中的网格往上找物件标识；合批实例优先用实例表。 */
export function pickIdFromObject(object: SceneObject | null | undefined, instanceId?: unknown): EditorPick | null {
  let cursor = object
  // 深度上限防止异常场景图（自引用）把拾取卡死。
  for (let depth = 0; cursor && depth < 12; depth += 1) {
    const instancePick = instancePickOf(cursor, instanceId)
    if (instancePick) return instancePick
    const taggedItemId = (cursor.userData || {}).editorItemId
    if (typeof taggedItemId === 'string' && taggedItemId) return { kind: 'item', id: taggedItemId }
    cursor = cursor.parent
  }
  return null
}

/** 场景里**可能**属于某个物件的网格：有实例表、有编辑器范围、或带物件标记。 */
function collectPickableMeshes(root: SceneObject, collected: SceneObject[] = []): SceneObject[] {
  const visit = (node: SceneObject) => {
    const data = node.userData || {}
    if (
      node.isMesh &&
      (Array.isArray(data.instanceItemIds) || data.studioEditorItemRanges || typeof data.editorItemId === 'string')
    )
      collected.push(node)
  }
  if (root.traverseVisible) root.traverseVisible(visit)
  else if (root.isMesh) visit(root)
  return collected
}

/** 收窄到「某个 id 对应的网格」；用于第二策略。 */
function meshesOfObject(object: SceneObject, collected: SceneObject[] = []): SceneObject[] {
  const visit = (node: SceneObject) => {
    if (node.isMesh) collected.push(node)
  }
  if (object.traverseVisible) object.traverseVisible(visit)
  else if (object.isMesh) visit(object)
  return collected
}

/** 命中记录 → 拾取结果（带世界坐标）。 */
function toPick(hit: Intersection, pick: EditorPick): EditorPick {
  const point = hit.point
  const distance = Number.isFinite(Number(hit.distance)) ? Number(hit.distance) : undefined
  return point
    ? { ...pick, point: { x: Number(point.x), y: Number(point.y), z: Number(point.z) }, distance }
    : { ...pick, distance }
}

export interface PickEditorItemsOptions {
  raycaster: Raycaster
  /** 场景根（第一策略）。 */
  root?: SceneObject | null
  /** 候选物件（第三策略回退用）。 */
  items?: Array<Record<string, unknown>>
  /** 取某物件的三维对象（第二策略）。 */
  objectFor?: (id: string) => SceneObject | null
  /** 物件在本地空间的包围盒范围（`min/max` 为世界高度，`exact` 表示可信）。 */
  boundsFor?: (item: Record<string, unknown>) => { min: number; max: number; exact?: boolean } | null
  /** 楼层矩阵（含旋转与平移），用于把本地盒子摆到世界。 */
  floorMatrix?: unknown
  /** 平面原点与像素/米。 */
  origin?: { x: number; y: number }
  ppm?: number
}

/**
 * 拾取一次，返回**按距离排序、按 id 去重**的候选。
 *
 * 为什么返回数组而不是第一个：重叠拾取（0.8.7 的 `#overlap-items`）需要候选清单；
 * 调用方取第一个当主选中项即可。
 */
/** 策略 1：场景网格求交（合批实例经实例表折算 id）。 */
function pickFromSceneMeshes(raycaster: Raycaster, root: SceneObject): EditorPick[] {
  const meshes = collectPickableMeshes(root)
  if (!meshes.length) return []
  const picks: EditorPick[] = []
  for (const hit of raycaster.intersectObjects(meshes, false)) {
    if (!materialVisible(hit)) continue
    const pick = pickIdFromObject(hit.object, hit.instanceId)
    if (pick) picks.push(toPick(hit, pick))
  }
  return picks
}

/** 策略 3：包围盒回退（无网格 / 隐藏网格的物件，例如灯具）。 */
function pickFromBounds(
  three: { Matrix4: any; Vector3: any; Box3: any },
  raycaster: Raycaster,
  item: Record<string, unknown>,
  context: {
    boundsFor?: PickEditorItemsOptions['boundsFor']
    floorMatrix: unknown
    origin: { x: number; y: number }
    ppm: number
  },
): EditorPick | null {
  const id = String(item.id || '')
  const width = Number(item.width || 0)
  const depth = Number(item.depth || 0)
  if (!id || !(width > 0 && depth > 0)) return null
  const bounds = context.boundsFor?.(item)
  if (!bounds?.exact) return null
  const center = boxPickPoint(three, raycaster, {
    item,
    bounds,
    floorMatrix: context.floorMatrix,
    origin: context.origin,
    ppm: context.ppm,
  })
  return center ? { kind: 'item', id, point: center, via: 'bounds' } : null
}

/** 按距离排序、按 id 去重（保留最近的那次命中）。 */
function orderPicks(picks: EditorPick[]): EditorPick[] {
  const ordered = picks.slice().sort((first, second) => (first.distance ?? Infinity) - (second.distance ?? Infinity))
  const deduped: EditorPick[] = []
  const kept = new Set<string>()
  for (const pick of ordered) {
    if (kept.has(pick.id)) continue
    kept.add(pick.id)
    deduped.push(pick)
  }
  return deduped
}

/**
 * 拾取一次，返回**按距离排序、按 id 去重**的候选。
 *
 * 为什么返回数组而不是第一个：重叠拾取（0.8.7 的 `#overlap-items`）需要候选清单；
 * 调用方取第一个当主选中项即可。
 */
export function pickEditorItems(
  three: { Matrix4: any; Vector3: any; Box3: any },
  options: PickEditorItemsOptions,
): EditorPick[] {
  const { raycaster, root, items = [], objectFor, boundsFor, floorMatrix, origin = { x: 0, y: 0 }, ppm = 100 } = options
  const picks: EditorPick[] = root ? pickFromSceneMeshes(raycaster, root) : []
  const seen = new Set(picks.map((pick) => pick.id))

  for (const item of items) {
    const id = String(item.id || '')
    if (!id || seen.has(id)) continue
    // 策略 2：单物件网格（精确）
    const object = objectFor?.(id)
    if (object) {
      const nearest = raycaster.intersectObjects(meshesOfObject(object), false).filter(materialVisible)[0]
      if (!nearest) continue
      seen.add(id)
      picks.push(toPick(nearest, { kind: 'item', id }))
      continue
    }
    // 策略 3：包围盒回退
    const pick = pickFromBounds(three, raycaster, item, { boundsFor, floorMatrix, origin, ppm })
    if (!pick) continue
    seen.add(id)
    picks.push(pick)
  }
  // 场景网格命中本来就是有序的，但「单物件网格 / 包围盒回退」是后追加的，
  // 不排序会让「被家具挡住的灯具」排在更近的家具前面（点花盆选中了灯）。
  return orderPicks(picks)
}

/** 用状态尺寸 + 楼层矩阵构造 Box3 并求交；命中返回世界坐标。 */
function boxPickPoint(
  three: { Matrix4: any; Vector3: any; Box3: any },
  raycaster: Raycaster,
  context: {
    item: Record<string, unknown>
    bounds: { min: number; max: number }
    floorMatrix: unknown
    origin: { x: number; y: number }
    ppm: number
  },
): { x: number; y: number; z: number } | null {
  const { item, bounds, floorMatrix, origin, ppm } = context
  const width = Number(item.width || 0)
  const depth = Number(item.depth || 0)
  const rotation = Number(item.rotation || 0)
  // 本地空间：盒子以物件中心为原点，Y 用 bounds（世界高度），XZ 用宽深。
  const local = new three.Matrix4()
    .makeTranslation((Number(item.x || 0) - origin.x) / ppm, 0, (Number(item.y || 0) - origin.y) / ppm)
    .multiply(new three.Matrix4().makeRotationY((-(rotation || 0) * Math.PI) / 180))
  const world = floorMatrix ? new three.Matrix4().multiplyMatrices(floorMatrix, local) : local
  const box = new three.Box3(
    new three.Vector3(-width / 2, bounds.min - 0.005, -depth / 2),
    new three.Vector3(width / 2, Math.max(bounds.max, bounds.min + 0.01), depth / 2),
  )
  // 把射线变换到盒子本地空间再求交，避免对盒子做矩阵变换后精度损失。
  const localRay = (raycaster.ray as { clone?: () => any }).clone?.()
  if (!localRay?.applyMatrix4) return null
  localRay.applyMatrix4(world.clone().invert())
  const hitPoint = localRay.intersectBox(box, new three.Vector3())
  if (!hitPoint) return null
  hitPoint.applyMatrix4(world)
  return { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z }
}
