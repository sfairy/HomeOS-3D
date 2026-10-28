/**
 * 文档级水密修复：把**开口的薄壳**真正加厚闭合。
 *
 * 为什么单独一层：`specs/model-specs.json` 里曾经有 87 条 `topology` 例外，全部由实测自动
 * 生成 —— 门禁是绿的，但线上跑的模型确实漏光、没有体积、贴不紧。修的是**几何本身**，
 * 补不上就报错，绝不写例外。
 *
 * 做法（逐 primitive 独立，材质绑定不动）：
 * 1. `cleanTriangles` 去掉零面积 / 完全重叠面（只删面、不压实顶点，其它语义才不会错位）；
 * 2. `solidifyShells` 只对**有边界边的连通片**加厚：内层沿 `-normal` 偏移 t、绕序反转，
 *    边界环补侧壁四边形；闭合片原样返回；
 * 3. 片内用「原面 + 反向副本 + 侧壁」的子网格实测判定，0 边界边且 0 非流形边才落地。
 *
 * 厚度 `t = clamp(0.4mm, 最大边 × 0.0004, 1.5mm)`，朝内偏移，可见表面一个点都不动。
 * 局部坐标口径：节点带缩放的件按 `1 / maxAxisScale` 折算容差与厚度，
 * 否则「世界 0.01mm 焊接」在局部会跨过阈值、凭空多出几条非流形边。
 *
 * 判绿口径与审计完全一致：调用方用 `modelStatistics(doc)`（世界坐标、位置焊接 1e-5）复核，
 * `boundaryEdges === 0 && nonManifoldEdges === 0` 才算修好。
 */
import { maxAxisScale } from './glb-io.mjs'
import { loadDocument, modelStatistics, worldBounds, writeDocument } from './model-document.mjs'
import { writeLiteFrom } from './model-builder.mjs'
import {
  DEFAULT_WELD_TOLERANCE,
  cleanTriangles,
  solidifyShells,
} from './geometry-ops.mjs'

/** 厚度上下限（世界坐标，米）：下限 0.4mm 保证任何视角都不会看穿，上限 1.5mm 连 4.7m 的车模也看不出来。 */
export const THICKNESS_MIN = 0.0004
export const THICKNESS_MAX = 0.0015
/** 厚度相对模型最大边的比例。 */
export const THICKNESS_RATIO = 0.0004

/** 只有这三个语义由加厚重算；其余（TANGENT / COLOR_0 …）按锚点顶点整行复制。 */
const GEOMETRY_SEMANTICS = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0'])

/** 能装进 65535 就不必用 uint32：BIN 直接小一半。 */
function downcastIndices(indices) {
  let max = 0
  for (let index = 0; index < indices.length; index += 1) {
    if (indices[index] > max) max = indices[index]
  }
  return max < 65536 ? new Uint16Array(indices) : new Uint32Array(indices)
}

/** 读一条 primitive 的全部属性（含非标准语义），保留 type / normalized 以便原样写回。 */
function readAttributes(primitive) {
  const attributes = new Map()
  for (const semantic of primitive.listSemantics()) {
    const accessor = primitive.getAttribute(semantic)
    if (!accessor) continue
    const array = accessor.getArray()
    attributes.set(semantic, {
      array,
      type: accessor.getType(),
      normalized: accessor.getNormalized(),
      elementSize: accessor.getElementSize(),
      constructor: array.constructor,
    })
  }
  return attributes
}

/**
 * 写回一条 primitive。
 *
 * 新顶点只出现在 POSITION / NORMAL / TEXCOORD_0 上；TANGENT、COLOR_0 这类属性按
 * `additions`（每个新顶点是从哪个原顶点长出来的）整行复制 —— 漏掉任何一个语义，
 * 写出去的 GLB 属性长度就对不上，加载器会整件丢掉。
 */
function writeAttributes(doc, primitive, { attributes, indices, additions }) {
  if (additions) {
    for (const [semantic, rows] of additions) {
      const attribute = attributes.get(semantic)
      if (!attribute) continue
      const { elementSize, constructor, array } = attribute
      const extended = new constructor(array.length + rows.length * elementSize)
      extended.set(array, 0)
      for (let slot = 0; slot < rows.length; slot += 1) {
        const source = rows[slot] * elementSize
        for (let component = 0; component < elementSize; component += 1) {
          extended[array.length + slot * elementSize + component] = array[source + component]
        }
      }
      attributes.set(semantic, { ...attribute, array: extended })
    }
  }
  for (const [semantic, attribute] of attributes) {
    const accessor = doc
      .createAccessor()
      .setType(attribute.type)
      .setNormalized(attribute.normalized)
      .setArray(attribute.array)
    primitive.setAttribute(semantic, accessor)
  }
  const indexAccessor = doc.createAccessor().setType('SCALAR').setArray(downcastIndices(indices))
  primitive.setIndices(indexAccessor)
}

/** 一条 primitive 的几何快照（纯数组，供修复前后对比）。 */
function snapshot(primitive) {
  const attributes = readAttributes(primitive)
  const position = attributes.get('POSITION')
  if (!position) return null
  const indexAccessor = primitive.getIndices()
  const vertexCount = position.array.length / position.elementSize
  const indices = indexAccessor
    ? new Uint32Array(indexAccessor.getArray())
    : Uint32Array.from({ length: vertexCount }, (_, index) => index)
  return { attributes, indices }
}

/**
 * 剪掉不再被任何 primitive / skin / animation 引用的 accessor。
 *
 * 不走 glTF-Transform 的 `prune()`：它会往 stdout 打一行统计，`--json` 的输出就没法解析了。
 * 也必须剪：替换属性会为每条 primitive 新建 accessor，旧的留着会把 BIN 写两遍（文件翻倍）。
 */
function pruneUnusedAccessors(doc) {
  const root = doc.getRoot()
  const used = new Set()
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) used.add(primitive.getAttribute(semantic))
      const indices = primitive.getIndices()
      if (indices) used.add(indices)
      for (const target of primitive.listTargets()) {
        for (const semantic of target.listSemantics()) used.add(target.getAttribute(semantic))
      }
    }
  }
  for (const skin of root.listSkins()) {
    const inverseBind = skin.getInverseBindMatrices()
    if (inverseBind) used.add(inverseBind)
  }
  for (const animation of root.listAnimations()) {
    for (const sampler of animation.listSamplers()) {
      used.add(sampler.getInput())
      used.add(sampler.getOutput())
    }
  }
  for (const accessor of root.listAccessors()) {
    if (!used.has(accessor)) accessor.dispose()
  }
}

/** 世界坐标里这件模型的厚度（米）。 */
export function thicknessFor(size) {
  const longest = Math.max(...size)
  return Math.min(THICKNESS_MAX, Math.max(THICKNESS_MIN, longest * THICKNESS_RATIO))
}

/**
 * 就地把整个文档的开口薄壳加厚。
 *
 * 共享网格（多个节点指向同一 mesh）只处理一次：容差按节点缩放折算，同一份顶点不可能
 * 同时满足两套容差。
 *
 * 注意别 `stripMeshCompression`：把 `KHR_draco_mesh_compression` 丢掉又写回，
 * `writeDocument` 的资产守卫会判「扩展丢失」直接拒绝（`floorlamp` 实测）。
 * glTF-Transform 读 Draco 时已经把数据解码进 accessor，扩展实例在写回时会按新数据重压。
 */
export function repairDocumentWatertight(doc) {
  const report = {
    primitives: 0,
    thickenedPatches: 0,
    closedPatches: 0,
    rejectedPatches: 0,
    degenerateFaces: 0,
    duplicatedFaces: 0,
    addedTriangles: 0,
    worldThickness: 0,
    skipped: [],
  }
  const worldThickness = thicknessFor(worldBounds(doc).size)
  report.worldThickness = worldThickness
  const processed = new Set()
  const targets = []

  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const worldScale = Math.max(maxAxisScale(node.getWorldMatrix()), 1e-9)
    const tolerance = DEFAULT_WELD_TOLERANCE / worldScale
    const thickness = worldThickness / worldScale
    for (const primitive of mesh.listPrimitives()) {
      if (processed.has(primitive)) continue
      processed.add(primitive)
      const data = snapshot(primitive)
      if (!data) continue
      // 量化过的属性（normalized 的 POSITION / NORMAL）不能直接换成 Float32 —— 跳过，交人工。
      const quantized = [...GEOMETRY_SEMANTICS].some((semantic) => {
        const attribute = data.attributes.get(semantic)
        return attribute && attribute.constructor !== Float32Array
      })
      if (quantized) {
        report.skipped.push({ node: node.getName(), reason: '顶点属性是量化格式，需人工处理' })
        continue
      }
      targets.push({ primitive, data, tolerance, thickness })
    }
  }

  for (const { primitive, data, tolerance, thickness } of targets) {
    const position = data.attributes.get('POSITION')
    const normal = data.attributes.get('NORMAL')
    const uv = data.attributes.get('TEXCOORD_0')
    const cleaned = cleanTriangles(
      {
        positions: position.array,
        normals: normal?.array,
        uvs: uv?.array,
        indices: data.indices,
      },
      { mergeable: false },
    )
    const result = solidifyShells(cleaned.primitive, { thickness, tolerance })
    report.primitives += 1
    report.degenerateFaces += cleaned.degenerate
    report.duplicatedFaces += cleaned.duplicated
    report.thickenedPatches += result.thickenedPatches
    report.closedPatches += result.closedPatches
    report.rejectedPatches += result.rejectedPatches
    report.addedTriangles += result.addedTriangles
    if (!result.addedTriangles) {
      // 没有加厚也要把清掉的退化面写回去（那是纯粹的坏面）。
      if (cleaned.degenerate || cleaned.duplicated) {
        writeAttributes(doc, primitive, { attributes: data.attributes, indices: cleaned.primitive.indices })
      }
      continue
    }
    const additions = new Map()
    for (const semantic of data.attributes.keys()) {
      if (GEOMETRY_SEMANTICS.has(semantic)) continue
      additions.set(semantic, result.addedAnchors)
    }
    writeAttributes(doc, primitive, {
      attributes: new Map([
        ['POSITION', { ...position, array: result.primitive.positions }],
        ...(normal ? [['NORMAL', { ...normal, array: result.primitive.normals }]] : []),
        ...(uv ? [['TEXCOORD_0', { ...uv, array: result.primitive.uvs }]] : []),
        ...[...data.attributes].filter(([semantic]) => !GEOMETRY_SEMANTICS.has(semantic)),
      ]),
      indices: result.primitive.indices,
      additions,
    })
  }

  pruneUnusedAccessors(doc)
  return report
}

/**
 * 把一个 GLB 文件修到水密（修不好就原样不动）。
 *
 * 只在**复核通过**时落盘：`modelStatistics` 与审计同口径（世界坐标、位置焊接 1e-5），
 * 修完仍有边界边或非流形边就整件作废 —— 不写盘、不写例外、不退回半成品。
 *
 * @returns {{closed: boolean, wrote: boolean, liteRegenerated: boolean, before: object, after: object, geometry: object}}
 */
export async function sealModelFile({ fullPath, litePath = null, write = false }) {
  const doc = await loadDocument(fullPath)
  try {
    const before = modelStatistics(doc)
    if (before.boundaryEdges === 0 && before.nonManifoldEdges === 0) {
      return { closed: true, wrote: false, liteRegenerated: false, before, after: before, geometry: null }
    }
    const geometry = repairDocumentWatertight(doc)
    const after = modelStatistics(doc)
    const closed = after.boundaryEdges === 0 && after.nonManifoldEdges === 0
    if (!closed) return { closed: false, wrote: false, liteRegenerated: false, before, after, geometry }
    if (!write) return { closed: true, wrote: false, liteRegenerated: false, before, after, geometry }
    await writeDocument(doc, fullPath)
    let liteRegenerated = false
    if (litePath) {
      await writeLiteFrom(fullPath, litePath)
      liteRegenerated = true
    }
    return { closed: true, wrote: true, liteRegenerated, before, after, geometry }
  } finally {
    doc.getRoot().dispose?.()
  }
}
