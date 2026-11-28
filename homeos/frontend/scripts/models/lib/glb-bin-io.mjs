/**
 * GLB 的**二进制块**重写（与 `glb-io.mjs` 的「只换 JSON chunk」分工互补）。
 *
 * 为什么需要它：把内嵌贴图挪成外置文件、或替换贴图字节，都必须从 BIN 里拿走一段数据。
 * 这时**不能**只删 `bufferView` 条目 —— 后面所有 view 的 `byteOffset` 会整体前移，
 * accessor / image / Draco 扩展里记的都是下标与偏移，任何一处漏改都会让模型加载成
 * 一堆错位顶点（而且 three 不会报错，只是画错）。
 *
 * 因此这里的入口只有 `repackGlb(buffer, { replace, drop })`：
 * 1. 逐 view 取字节（可替换），按 4 字节对齐重新拼 BIN；
 * 2. 被 drop 的 view 连同所有引用一起重排（accessor / image / sparse / Draco）；
 * 3. 断言每条引用都还落在合法下标内，且 `buffers[0].byteLength` 与 BIN 实长一致。
 *
 * 4 字节对齐对 glTF 是充分条件：所有 accessor 的分量不超过 4 字节，view 起点对齐到 4
 * 之后，`accessor.byteOffset` 的原有对齐关系保持不变。
 */
import { parseGlb } from './glb-io.mjs'

const GLB_MAGIC = 0x46546c67
const GLB_VERSION = 2
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

const align4 = (value) => (value + 3) & ~3

/** 取一条 bufferView 的字节切片。 */
function viewBytes(json, bin, index) {
  const view = json.bufferViews?.[index]
  if (!view) throw new Error(`bufferView ${index} 不存在`)
  const start = view.byteOffset ?? 0
  const end = start + view.byteLength
  if (end > bin.length) throw new Error(`bufferView ${index} 越界（${end} > ${bin.length}）`)
  return bin.subarray(start, end)
}

/**
 * 重建 GLB 的 BIN，并按需替换 / 删除 bufferView。
 *
 * @param {Buffer} buffer 原始 GLB
 * @param {{ replace?: Map<number, Buffer>, drop?: Set<number>, mutateJson?: (json: any) => void }} options
 *   `replace`：view 下标 → 新字节（长度可变）；
 *   `drop`：要从 BIN 里移除的 view 下标（引用它们的字段会被重排，仍被 accessor 引用的 view 不允许 drop）；
 *   `mutateJson`：**在原始下标上**先改 JSON（典型用途：把内嵌贴图换成 `uri`，再 drop 它的 view）。
 *   顺序很重要：重排之后下标已经变了，晚改就找不到原图。
 * @returns {Buffer} 新的 GLB
 */
export function repackGlb(buffer, { replace = new Map(), drop = new Set(), mutateJson } = {}) {
  const parsed = parseGlb(buffer)
  const json = JSON.parse(JSON.stringify(parsed.json))
  const bin = parsed.bin
  // 先改 JSON：外置贴图要在 drop 之前把 `bufferView` 换成 `uri`，否则会被判成「引用已删除的 view」。
  mutateJson?.(json)
  const views = json.bufferViews ?? []
  if (!views.length) return buffer

  for (const index of [...replace.keys(), ...drop]) {
    if (index < 0 || index >= views.length) throw new Error(`bufferView 下标 ${index} 越界（共 ${views.length} 条）`)
  }
  // 先确认没人引用被删的 view：引用的重排由下面的 remap 完成，但「同一个 view 既是贴图
  // 又是顶点数据」这种复用不能靠重排解决，直接拒绝。
  const referencedByAccessor = new Set()
  for (const accessor of json.accessors ?? []) {
    if (accessor.bufferView !== undefined) referencedByAccessor.add(accessor.bufferView)
    if (accessor.sparse) {
      const sparseIndices = accessor.sparse.indices?.bufferView
      const sparseValues = accessor.sparse.values?.bufferView
      if (sparseIndices !== undefined) referencedByAccessor.add(sparseIndices)
      if (sparseValues !== undefined) referencedByAccessor.add(sparseValues)
    }
  }
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const dracoView = primitive.extensions?.KHR_draco_mesh_compression?.bufferView
      if (dracoView !== undefined) referencedByAccessor.add(dracoView)
    }
  }
  for (const index of drop) {
    if (referencedByAccessor.has(index)) {
      throw new Error(`bufferView ${index} 仍被 accessor / Draco 引用，不能删除（只允许删贴图区段）`)
    }
  }

  const remap = new Map()
  const nextViews = []
  const chunks = []
  let offset = 0
  for (let index = 0; index < views.length; index += 1) {
    if (drop.has(index)) continue
    const bytes = replace.get(index) ?? viewBytes(json, bin, index)
    const view = { ...views[index] }
    const aligned = align4(offset)
    if (aligned > offset) chunks.push(Buffer.alloc(aligned - offset, 0))
    view.byteOffset = aligned
    view.byteLength = bytes.length
    if (view.byteOffset === 0) delete view.byteOffset
    if (!(view.byteLength > 0)) throw new Error(`bufferView ${index} 会是 0 字节`)
    remap.set(index, nextViews.length)
    nextViews.push(view)
    chunks.push(bytes)
    offset = aligned + bytes.length
  }
  const nextBin = Buffer.concat(chunks)
  json.bufferViews = nextViews
  if (json.buffers?.length) json.buffers[0].byteLength = nextBin.length

  // 引用重排：accessor / sparse / image / Draco 扩展。
  const remapIndex = (value, where) => {
    if (value === undefined) return value
    const next = remap.get(value)
    if (next === undefined) throw new Error(`${where} 引用的 bufferView ${value} 已被删除`)
    return next
  }
  for (const accessor of json.accessors ?? []) {
    accessor.bufferView = remapIndex(accessor.bufferView, 'accessor.bufferView')
    if (accessor.sparse) {
      if (accessor.sparse.indices) {
        accessor.sparse.indices.bufferView = remapIndex(accessor.sparse.indices.bufferView, 'sparse.indices')
      }
      if (accessor.sparse.values) {
        accessor.sparse.values.bufferView = remapIndex(accessor.sparse.values.bufferView, 'sparse.values')
      }
    }
  }
  for (const image of json.images ?? []) image.bufferView = remapIndex(image.bufferView, 'image.bufferView')
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const draco = primitive.extensions?.KHR_draco_mesh_compression
      if (draco) draco.bufferView = remapIndex(draco.bufferView, 'KHR_draco_mesh_compression')
    }
  }

  return buildGlb(json, nextBin)
}

/** 拼 GLB：JSON 空格补齐 4 字节，BIN 补 0（与 glTF 2.0 规范一致）。 */
function buildGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)])
  const binChunk = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)])
  const header = Buffer.alloc(12)
  header.writeUInt32LE(GLB_MAGIC, 0)
  header.writeUInt32LE(GLB_VERSION, 4)
  header.writeUInt32LE(12 + 8 + jsonChunk.length + (binChunk.length ? 8 + binChunk.length : 0), 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonChunk.length, 0)
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4)
  if (!binChunk.length) return Buffer.concat([header, jsonHeader, jsonChunk])
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(binChunk.length, 0)
  binHeader.writeUInt32LE(CHUNK_BIN, 4)
  return Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk])
}

/** 读一个 view 的字节（贴图优化脚本取源图用）。 */
export function readBufferView(buffer, index) {
  const parsed = parseGlb(buffer)
  return viewBytes(parsed.json, parsed.bin, index)
}

/**
 * 一步完成「改 JSON + 重建 BIN」。
 *
 * 早期版本是「先 repack 再 mutate」，外置贴图时必然失败：repack 时 image 还指着要被删的
 * view，重排校验直接拒绝。现在两者都走 `repackGlb({ mutateJson, drop })`，上面的顺序
 * 约束（先改 JSON，再 drop）由实现保证。
 */
export function patchGlbDeep(buffer, { json: mutateJson, replace, drop } = {}) {
  return repackGlb(buffer, { replace, drop, mutateJson })
}
