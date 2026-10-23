/**
 * 用 glTF-Transform 读模型（含 Draco 解码），提供世界包围盒、拓扑统计与逐材质几何指纹。
 *
 * 为什么不自己解 BIN：668 个文件里有 256 个用 `KHR_draco_mesh_compression`，POSITION 在
 * Draco 段里，只有解码后才拿得到顶点。glTF-Transform + `draco3dgltf` 是这个仓库里唯一
 * 既能解码又能**原样写回**（材质名 / 顺序 / extras 不动）的组合。
 *
 * 坐标口径：一切对外数字都是**世界坐标**（`node.getWorldMatrix()` 连乘到根），因为
 * `floor-lamp.glb` 这类 SimLab 导出把 1000× 缩放和旋转藏在节点里，只读 accessor 的
 * min/max 会得到「1467m 宽的落地灯」这种假数据。
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import fs from 'node:fs'
import path from 'node:path'
import { AssetDamageError, glbFingerprint } from './asset-guard.mjs'
import {
  analyzeTopology,
  cleanPrimitive,
  triangleArea,
} from './geometry-ops.mjs'

let ioPromise = null

/** 单例 IO：Draco 解码器初始化一次（wasm 编译 ~200ms，每个进程只做一次）。 */
function getIO() {
  if (!ioPromise) {
    ioPromise = (async () => {
      const [decoder, encoder] = await Promise.all([
        draco3d.createDecoderModule(),
        draco3d.createEncoderModule(),
      ])
      // 注册**全部**扩展，而不是只注册 Draco：
      // 16 个文件（car / piano / elevator / steel-stairs / glass-stairs / air-outlet /
      // tea-bar-machine / pipeline-water-purifier）用 `KHR_materials_pbrSpecularGlossiness`，
      // 未注册时 glTF-Transform 只打一行 warning 就把它整段丢掉 —— 材质名还在，颜色没了。
      return new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
          'draco3d.decoder': decoder,
          'draco3d.encoder': encoder,
        })
    })()
  }
  return ioPromise
}

/** 读 GLB → Document（调用方负责 `doc.dispose()`）。 */
export async function loadDocument(filePath) {
  const io = await getIO()
  return io.read(filePath)
}

/** 写 GLB（几何重建 / lite 重生成用）。 */
export async function writeDocument(doc, filePath) {
  const io = await getIO()
  /**
   * 落盘前先在内存里编码，并与磁盘上的旧文件比对：**丢扩展或丢贴图就拒绝写入**。
   *
   * 为什么不能只靠 `registerExtensions(ALL_EXTENSIONS)`：glTF-Transform 只回写它实现了的
   * 扩展，任何未实现的（包括将来新增的厂商扩展）都会在读的时候被丢掉，写回时无声消失。
   * 2026-10-22 的批量修复就是这样丢了 5 个文件的 `KHR_materials_pbrSpecularGlossiness`
   * 与车模内嵌贴图：文件还能加载，只是颜色/贴图没了，门禁也看不出来。
   *
   * 只做 JSON 修补的场景（改名、改 extras）不该走这里 —— 用 `glb-io.patchGlbJson`
   * 直接替换 JSON chunk，BIN 逐字节保留。
   */
  const previous = fs.existsSync(filePath) ? glbFingerprint(fs.readFileSync(filePath)) : null
  const encoded = Buffer.from(await io.writeBinary(doc))
  if (previous) {
    const next = glbFingerprint(encoded)
    const lostExtensions = previous.extensions.filter((extension) => !next.extensions.includes(extension))
    const drift = []
    if (lostExtensions.length) drift.push(`extensionsUsed 丢失 ${lostExtensions.join(', ')}`)
    if (next.images < previous.images) drift.push(`内嵌贴图 images ${previous.images} → ${next.images}`)
    if (next.textures < previous.textures) drift.push(`纹理 textures ${previous.textures} → ${next.textures}`)
    if (drift.length) {
      throw new AssetDamageError(`写回 ${path.basename(filePath)}`, drift)
    }
  }
  fs.writeFileSync(filePath, encoded)
}

/** 该文件是否用了 Draco。 */
export function usesDraco(doc) {
  const root = doc.getRoot()
  return root.listExtensionsUsed().some((extension) => extension.extensionName === 'KHR_draco_mesh_compression')
}

/* ------------------------------------------------------------------ *
 * 世界变换
 * ------------------------------------------------------------------ */

/** 列主序 4×4 × 点（只取 xyz）。 */
export function transformPoint(matrix, x, y, z) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ]
}

const emptyBounds = () => ({
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
})

function growBounds(bounds, point) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (point[axis] < bounds.min[axis]) bounds.min[axis] = point[axis]
    if (point[axis] > bounds.max[axis]) bounds.max[axis] = point[axis]
  }
}

/** 世界包围盒（坐标轴对齐，逐顶点变换后取 min/max，等于 three 的 `Box3.setFromObject`）。 */
export function worldBounds(doc) {
  const bounds = emptyBounds()
  let vertexCount = 0
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const matrix = node.getWorldMatrix()
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION')
      if (!position) continue
      const array = position.getArray()
      const elementSize = position.getElementSize()
      for (let index = 0; index < array.length; index += elementSize) {
        growBounds(bounds, transformPoint(matrix, array[index], array[index + 1], array[index + 2]))
        vertexCount += 1
      }
    }
  }
  if (!Number.isFinite(bounds.min[0])) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0], vertexCount }
  return {
    min: bounds.min,
    max: bounds.max,
    size: [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]],
    vertexCount,
  }
}

/* ------------------------------------------------------------------ *
 * 逐 primitive / 逐材质统计
 * ------------------------------------------------------------------ */

/** 取一条 primitive 的原始数组（世界坐标）。 */
function readPrimitive(primitive, matrix) {
  const position = primitive.getAttribute('POSITION')
  if (!position) return null
  const source = position.getArray()
  const elementSize = position.getElementSize()
  const positions = new Float32Array((source.length / elementSize) * 3)
  for (let index = 0; index < source.length / elementSize; index += 1) {
    const point = transformPoint(matrix, source[index * elementSize], source[index * elementSize + 1], source[index * elementSize + 2])
    positions[index * 3] = point[0]
    positions[index * 3 + 1] = point[1]
    positions[index * 3 + 2] = point[2]
  }
  const normalAttribute = primitive.getAttribute('NORMAL')
  let normals
  if (normalAttribute) {
    const normalSource = normalAttribute.getArray()
    normals = new Float32Array(normalSource.length)
    normals.set(normalSource)
  }
  const uvAttribute = primitive.getAttribute('TEXCOORD_0')
  let uvs
  if (uvAttribute) {
    const uvSource = uvAttribute.getArray()
    uvs = new Float32Array(uvSource.length)
    uvs.set(uvSource)
  }
  const indexAttribute = primitive.getIndices()
  const indices = indexAttribute
    ? new Uint32Array(indexAttribute.getArray())
    : Uint32Array.from({ length: positions.length / 3 }, (_, index) => index)
  return { positions, normals, uvs, indices }
}

const materialNameOf = (material) => (material ? material.getName() || '' : '')

/**
 * 逐材质聚合的几何指纹：面积占比、三角面占比、包围盒、薄厚比、竖向位置带、壳数。
 *
 * 这些数字是「这个槽位到底是什么构件」的唯一客观依据 —— 名字不可信（`material-3`、
 * `body` 都可能指任何构件），但面积占比 86% 且贴地、薄厚比 <0.05 的槽位几乎只能是台面。
 */
export function materialFingerprints(doc) {
  const root = doc.getRoot()
  const byMaterial = new Map()
  const record = (material) => {
    const name = materialNameOf(material)
    if (!byMaterial.has(name)) {
      byMaterial.set(name, {
        material,
        name,
        triangles: 0,
        area: 0,
        bounds: emptyBounds(),
        shells: 0,
        nonManifoldEdges: 0,
        boundaryEdges: 0,
        primitives: 0,
        vertices: 0,
      })
    }
    return byMaterial.get(name)
  }
  // 先登记所有材质，保证「死材质」也能出现在指纹表里（triangles = 0）。
  for (const material of root.listMaterials()) record(material)
  for (const node of root.listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const matrix = node.getWorldMatrix()
    for (const primitive of mesh.listPrimitives()) {
      const entry = record(primitive.getMaterial())
      const data = readPrimitive(primitive, matrix)
      if (!data) continue
      entry.primitives += 1
      entry.vertices += data.positions.length / 3
      entry.triangles += data.indices.length / 3
      for (let offset = 0; offset < data.indices.length; offset += 3) {
        entry.area += triangleArea(data.positions, data.indices[offset], data.indices[offset + 1], data.indices[offset + 2])
      }
      for (let index = 0; index < data.positions.length; index += 3) {
        growBounds(entry.bounds, [data.positions[index], data.positions[index + 1], data.positions[index + 2]])
      }
      const topology = analyzeTopology(data)
      entry.shells += topology.shells
      entry.nonManifoldEdges += topology.nonManifoldEdges
      entry.boundaryEdges += topology.boundaryEdges
    }
  }
  return byMaterial
}

/** 整个模型的拓扑与规模（世界坐标、按材质无关）。 */
export function modelStatistics(doc) {
  const totals = {
    triangles: 0,
    vertices: 0,
    primitives: 0,
    materials: doc.getRoot().listMaterials().length,
    meshes: doc.getRoot().listMeshes().length,
    nodes: doc.getRoot().listNodes().length,
    shells: 0,
    nonManifoldEdges: 0,
    boundaryEdges: 0,
    degenerateFaces: 0,
    duplicatedFaces: 0,
    signedVolume: 0,
  }
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const matrix = node.getWorldMatrix()
    for (const primitive of mesh.listPrimitives()) {
      const data = readPrimitive(primitive, matrix)
      if (!data) continue
      totals.primitives += 1
      totals.vertices += data.positions.length / 3
      totals.triangles += data.indices.length / 3
      const topology = analyzeTopology(data)
      totals.shells += topology.shells
      totals.nonManifoldEdges += topology.nonManifoldEdges
      totals.boundaryEdges += topology.boundaryEdges
      totals.signedVolume += topology.signedVolume
    }
  }
  return totals
}

/** 该模型是否含动画 / 旋转部件（动画件不能烘焙世界变换、不能跨节点焊接）。 */
export function hasAnimation(doc) {
  const root = doc.getRoot()
  if (root.listAnimations().length) return true
  return root.listNodes().some((node) => {
    const extras = node.getExtras() || {}
    return Boolean(extras.fanPart || extras.rotationAxis || extras.contactShadowRestMatrix)
  })
}

/**
 * 逐 primitive 清理（焊接 + 去退化/重叠 + 可选补洞），返回**新的**数组，不改 Document。
 *
 * 只处理没有动画的节点：动画件（排气扇转子 / 吊扇 / 接触阴影）保留原样，避免把
 * `fanPart` 的旋转轴心焊歪。
 */
export function cleanDocumentGeometry(doc, { fillHoles = true, skipAnimated = true } = {}) {
  const animated = hasAnimation(doc)
  const reports = []
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const matrix = node.getWorldMatrix()
    for (const primitive of mesh.listPrimitives()) {
      const data = readPrimitive(primitive, matrix)
      if (!data) continue
      const materialName = materialNameOf(primitive.getMaterial())
      if (skipAnimated && animated) {
        reports.push({ node: node.getName(), materialName, skipped: 'animated' })
        continue
      }
      const result = cleanPrimitive(
        { positions: data.positions, normals: data.normals, uvs: data.uvs, indices: data.indices },
        { weld: true, fillHoles },
      )
      reports.push({ node: node.getName(), materialName, skipped: null, report: result.report })
    }
  }
  return reports
}

/** 文件字节数（报告用）。 */
export const fileBytes = (filePath) => fs.statSync(filePath).size
