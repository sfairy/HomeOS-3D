/**
 * GLB 的 JSON 层结构手术：删节点、删 accessor、摘属性，并重排所有引用。
 *
 * 与 `glb-bin-io.mjs` 的分工：那个负责「删 bufferView 后重建 BIN」，这里负责
 * 「删掉 JSON 里的条目并把引用改对」。两者都刻意**不碰顶点数据**：
 *
 * - Draco 压缩的 lite 件，几何在 Draco 流里。用 glTF-Transform 解压再压回去会让小文件
 *   从 4.6KB 涨到 5.9KB（实测 127%，超过体积预算的 1.2×），而我们要摘的只是 UV 这种
 *   几百字节的属性 —— 所以走 JSON 手术：删掉 `attributes.TEXCOORD_0`（含 Draco 扩展里
 *   的那一条）后，加载器不再请求这个属性，几何流一个字节都没动。
 * - 非压缩的完整件，UV 的 accessor 独占一条 bufferView 时由调用方连同 view 一起 drop，
 *   BIN 交给 `repackGlb` 重排。
 *
 * 所有函数都是纯函数：入参是解析后的 glTF JSON，就地修改；返回被删掉的下标清单，
 * 便于调用方做断言与日志。
 */

/**
 * 删除若干 accessor，并重写所有引用（primitive 的 indices / attributes / morph targets、
 * skin 的 inverseBindMatrices、animation sampler 的 input / output）。
 *
 * @returns {{ removed: number[], remap: Map<number, number>, freedBufferViews: number[] }}
 *   `freedBufferViews`：只剩被删 accessor 引用的 bufferView（调用方可据此 drop）。
 */
export function dropAccessors(json, accessorIndices) {
  const drop = new Set(accessorIndices)
  if (!drop.size) return { removed: [], remap: new Map(), freedBufferViews: [] }

  const accessors = json.accessors ?? []
  for (const index of drop) {
    if (index < 0 || index >= accessors.length) throw new Error(`accessor 下标 ${index} 越界`)
  }

  // 引用面先算清楚：删完再补就晚了（数组已经变了）。
  const referenced = new Set()
  const addRef = (index) => {
    if (index !== undefined && index !== null) referenced.add(index)
  }
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      addRef(primitive.indices)
      for (const value of Object.values(primitive.attributes ?? {})) addRef(value)
      for (const target of primitive.targets ?? []) for (const value of Object.values(target ?? {})) addRef(value)
    }
  }
  for (const skin of json.skins ?? []) addRef(skin.inverseBindMatrices)
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers ?? []) {
      addRef(sampler.input)
      addRef(sampler.output)
    }
  }
  for (const index of drop) {
    if (referenced.has(index)) throw new Error(`accessor ${index} 仍被 primitive / skin / animation 引用，不能删除`)
  }

  const viewSet = (index) => {
    const found = new Set()
    const accessor = accessors[index]
    if (!accessor) return found
    if (accessor.bufferView !== undefined) found.add(accessor.bufferView)
    if (accessor.sparse) {
      const sparseIndices = accessor.sparse.indices?.bufferView
      const sparseValues = accessor.sparse.values?.bufferView
      if (sparseIndices !== undefined) found.add(sparseIndices)
      if (sparseValues !== undefined) found.add(sparseValues)
    }
    return found
  }
  // 只剩被删 accessor 引用的 bufferView 可以一起回收。
  const candidateViews = new Set()
  const remainingViews = new Set()
  for (let index = 0; index < accessors.length; index += 1) {
    const views = viewSet(index)
    for (const view of views) (drop.has(index) ? candidateViews : remainingViews).add(view)
  }
  const freedBufferViews = [...candidateViews].filter((view) => !remainingViews.has(view))

  const remap = new Map()
  let cursor = 0
  for (let index = 0; index < accessors.length; index += 1) {
    if (drop.has(index)) continue
    remap.set(index, cursor)
    cursor += 1
  }
  const mapIndex = (index) => {
    if (index === undefined || index === null) return index
    const next = remap.get(index)
    if (next === undefined) throw new Error(`引用的 accessor ${index} 已被删除`)
    return next
  }

  json.accessors = accessors.filter((_, index) => !drop.has(index))
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.indices !== undefined) primitive.indices = mapIndex(primitive.indices)
      for (const [name, value] of Object.entries(primitive.attributes ?? {})) {
        primitive.attributes[name] = mapIndex(value)
      }
      for (const target of primitive.targets ?? []) {
        for (const [name, value] of Object.entries(target ?? {})) target[name] = mapIndex(value)
      }
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = mapIndex(skin.inverseBindMatrices)
  }
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers ?? []) {
      sampler.input = mapIndex(sampler.input)
      sampler.output = mapIndex(sampler.output)
    }
  }

  return { removed: [...drop].sort((a, b) => a - b), remap, freedBufferViews }
}

/**
 * 删除若干节点，并重写场景 / 父子 / 蒙皮 / 动画里的节点引用。
 *
 * 「只删不在任何 scene 里的节点」由调用方保证：被引用的节点一旦删掉，模型就会丢件，
 * 那是比死节点严重得多的事故。
 *
 * @returns {{ removed: number[], remap: Map<number, number> }}
 */
export function dropNodes(json, nodeIndices) {
  const drop = new Set(nodeIndices)
  if (!drop.size) return { removed: [], remap: new Map() }

  const nodes = json.nodes ?? []
  for (const index of drop) {
    if (index < 0 || index >= nodes.length) throw new Error(`node 下标 ${index} 越界`)
  }

  const remap = new Map()
  let cursor = 0
  for (let index = 0; index < nodes.length; index += 1) {
    if (drop.has(index)) continue
    remap.set(index, cursor)
    cursor += 1
  }
  const mapIndex = (index, where) => {
    if (index === undefined || index === null) return index
    const next = remap.get(index)
    if (next === undefined) throw new Error(`${where} 引用的节点 ${index} 已被删除`)
    return next
  }

  json.nodes = nodes.filter((_, index) => !drop.has(index))
  for (const scene of json.scenes ?? []) {
    scene.nodes = (scene.nodes ?? []).map((index) => mapIndex(index, 'scene.nodes'))
  }
  for (const node of json.nodes) {
    if (node.children) node.children = node.children.map((index) => mapIndex(index, 'node.children'))
    if (node.skin !== undefined && json.skins?.[node.skin] === undefined) {
      throw new Error(`node.skin ${node.skin} 不存在`)
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.skeleton !== undefined) skin.skeleton = mapIndex(skin.skeleton, 'skin.skeleton')
    if (skin.joints) skin.joints = skin.joints.map((index) => mapIndex(index, 'skin.joints'))
  }
  for (const animation of json.animations ?? []) {
    for (const channel of animation.channels ?? []) {
      if (channel.target?.node !== undefined) {
        channel.target.node = mapIndex(channel.target.node, 'animation.target.node')
      }
    }
  }

  return { removed: [...drop].sort((a, b) => a - b), remap }
}

/**
 * 摘掉某个顶点属性（`TEXCOORD_0` 这类），同时清掉 Draco 扩展里对应的条目。
 *
 * 必须在 `dropAccessors` **之前**调用：先摘属性才知道哪个 accessor 成了孤儿。
 * @returns {{ accessors: number[] }} 需要随后删除的 accessor 下标
 */
export function detachAttribute(json, attributeName) {
  const orphanAccessors = []
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessorIndex = primitive.attributes?.[attributeName]
      if (accessorIndex === undefined) continue
      delete primitive.attributes[attributeName]
      orphanAccessors.push(accessorIndex)
      const dracoAttributes = primitive.extensions?.KHR_draco_mesh_compression?.attributes
      if (dracoAttributes) delete dracoAttributes[attributeName]
    }
  }
  return { accessors: orphanAccessors }
}

/**
 * 不在任何 scene 里的节点下标。
 *
 * glTF 允许节点不被任何 scene 引用；three 的 GLTFLoader 按场景图建对象，那些节点永远不会
 * 被创建。它们却会污染**按节点实例**统计的面数（同一 mesh 被死节点再引用一次就多算一遍）
 * 与节点名集合 —— `越野车.glb` 的 `Assembly-3 → Component_Mesh → 20× Geom3D` 就是这样
 * 让 suv 一直被误报成 40,430 面（真实 20,215）。
 *
 * 判定只有这一份：所有消费方都 import 它，避免两处各写一套后出现
 * 「审计说 0、修复说 24」的分歧。
 */
export function unreachableNodeIndices(json) {
  const nodes = json.nodes ?? []
  const reachable = new Set()
  const walk = (index) => {
    if (index === undefined || index === null || reachable.has(index)) return
    reachable.add(index)
    for (const child of nodes[index]?.children ?? []) walk(child)
  }
  for (const scene of json.scenes ?? []) for (const root of scene.nodes ?? []) walk(root)
  return nodes.map((_, index) => index).filter((index) => !reachable.has(index))
}

/** 该文件是否还留着某个顶点属性（`TEXCOORD_0` 这类）。 */
export function declaresAttribute(json, attributeName) {
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.attributes?.[attributeName] !== undefined) return true
    }
  }
  return false
}

/**
 * 几何签名：三角面数 + `primitive → 材质名` 序列。
 *
 * 改 JSON 的手术（摘 UV、删节点、去贴图）都必须保持它不变 —— 三角面变了是丢件，
 * 材质序列变了是把 A 构件刷成 B 的外观。按**名字**比对而不是下标：材质下标会随删除漂移。
 */
export function geometrySignature(json) {
  const accessors = json.accessors ?? []
  let triangles = 0
  const materials = []
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const indices = accessors[primitive.indices]
      const position = accessors[primitive.attributes?.POSITION]
      triangles += (indices?.count ?? position?.count ?? 0) / 3
      materials.push(json.materials?.[primitive.material]?.name ?? '(无材质)')
    }
  }
  return { triangles: Math.round(triangles), materials }
}

/**
 * POSITION accessor 的 min/max 合并。
 *
 * 不依赖 Draco 解码就能拿到外接尺寸：glTF 规范要求 POSITION 必需 `min` / `max`，
 * Draco 压缩时它们仍留在 JSON 里。所以「JSON 手术没动几何」这件事可以零解码验证。
 */
export function positionBounds(json) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION]
      if (!accessor?.min || !accessor?.max) continue
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], accessor.min[axis])
        max[axis] = Math.max(max[axis], accessor.max[axis])
      }
    }
  }
  return { min, max }
}

/** Draco 流的逐段字节（改 JSON 前后必须逐字节相同）。 */
export function dracoStreams(json, bin) {
  const streams = []
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const index = primitive.extensions?.KHR_draco_mesh_compression?.bufferView
      if (index === undefined) continue
      const view = json.bufferViews?.[index]
      const start = view.byteOffset ?? 0
      streams.push(bin.subarray(start, start + view.byteLength))
    }
  }
  return streams
}
