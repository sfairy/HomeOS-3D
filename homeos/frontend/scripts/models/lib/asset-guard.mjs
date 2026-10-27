/**
 * 模型资产「不许变坏」的统一闸门。
 *
 * 背景（2026-10-23 回滚的原因）：早期的批量修复脚本各自只校验自己关心的那一维 ——
 * 几何修复只比材质/贴图，变体补全校验只比变体是否存在，`rebuild-items` 只比尺寸偏差。
 * 结果是 30 款精修件把 3804 面的沙发换成 180 面、
 * 把带车漆图集的车换成纯色壳，全库 lite 从 7.1MB 涨到 41MB，而所有门禁都是绿的。
 *
 * 这个模块把「相对源件的可观测退化」收敛成一份指纹比对，脚本落盘前后各调一次：
 * - 丢扩展 / 丢内嵌贴图 / 材质或节点改名 / 动画通道减少 → 一律拒绝；
 * - 面数掉超过 10% / 体积涨超过阈值 → 拒绝；
 * - 只有调用方显式声明 `allow` 的项才放行（例如 lite 相对完整件新增 Draco 扩展）。
 *
 * 指纹只读 GLB 的 JSON chunk，不解码 Draco —— 它要在每次落盘时同步执行。
 */
import fs from 'node:fs'
import { parseGlb } from './glb-io.mjs'

export class AssetDamageError extends Error {
  constructor(label, drift) {
    super(`${label} 与源件相比出现退化：\n${drift.map((item) => `  - ${item}`).join('\n')}`)
    this.name = 'AssetDamageError'
    this.drift = drift
  }
}

/**
 * GLB 结构指纹。
 * @param {Buffer|string} source 文件路径或 GLB 字节
 */
export function glbFingerprint(source) {
  const buffer = Buffer.isBuffer(source) ? source : fs.readFileSync(source)
  const { json, byteLength } = parseGlb(buffer)
  const nodes = json.nodes ?? []
  const meshes = json.meshes ?? []
  const materials = json.materials ?? []
  const accessors = json.accessors ?? []
  const primitives = meshes.flatMap((mesh) => mesh.primitives ?? [])

  let triangles = 0
  let vertices = 0
  for (const primitive of primitives) {
    const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION
    triangles += Math.floor((accessors[accessorIndex]?.count ?? 0) / 3)
    vertices += accessors[primitive.attributes?.POSITION]?.count ?? 0
  }

  /** 没有被任何 primitive / 动画 / 蒙皮引用的 accessor：导出器的垃圾，会原样占 BIN。 */
  const usedAccessors = new Set()
  for (const primitive of primitives) {
    for (const accessorIndex of Object.values(primitive.attributes ?? {})) usedAccessors.add(accessorIndex)
    if (primitive.indices !== undefined) usedAccessors.add(primitive.indices)
    for (const target of primitive.targets ?? []) {
      for (const accessorIndex of Object.values(target)) usedAccessors.add(accessorIndex)
    }
  }
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers ?? []) {
      usedAccessors.add(sampler.input)
      usedAccessors.add(sampler.output)
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) usedAccessors.add(skin.inverseBindMatrices)
  }

  return {
    byteLength,
    bufferBytes: (json.buffers ?? []).reduce((sum, bufferEntry) => sum + (bufferEntry.byteLength ?? 0), 0),
    triangles,
    vertices,
    materials: materials.map((material) => material.name ?? ''),
    materialNames: materials.map((material) => material.name ?? '').sort(),
    nodeNames: nodes.map((node) => node.name ?? '').filter(Boolean).sort(),
    nodeCount: nodes.length,
    extensions: [...(json.extensionsUsed ?? [])].sort(),
    images: (json.images ?? []).length,
    textures: (json.textures ?? []).length,
    animations: (json.animations ?? []).length,
    animationChannels: (json.animations ?? []).reduce((sum, animation) => sum + (animation.channels ?? []).length, 0),
    accessors: accessors.length,
    orphanAccessors: accessors.length - usedAccessors.size,
    hasUv: primitives.some((primitive) => 'TEXCOORD_0' in (primitive.attributes ?? {})),
  }
}

const sameList = (before, after) => JSON.stringify(before) === JSON.stringify(after)
const relative = (after, before) => (before > 0 ? after / before : 1)

const DEFAULTS = Object.freeze({
  /** 允许的面数下降比例（0.9 = 最多掉 10%）。 */
  minTriangleRatio: 0.9,
  /** 允许的体积膨胀比例。lite 是压缩产物，阈值单独给。 */
  maxGrowth: 1.5,
  /** 允许新增的扩展（lite 会新增 Draco）。 */
  allowedNewExtensions: ['KHR_draco_mesh_compression'],
  /** 允许的材质改名（默认不留口子：改名必须同步迁移运行期分支）。 */
  allowRenames: false,
})

/**
 * 比对两份指纹，返回退化描述（空数组 = 通过）。
 * @param {ReturnType<typeof glbFingerprint>} before
 * @param {ReturnType<typeof glbFingerprint>} after
 * @param {object} [options]
 */
export function fingerprintDrift(before, after, options = {}) {
  const settings = { ...DEFAULTS, ...options }
  const drift = []

  const droppedExtensions = before.extensions.filter((extension) => !after.extensions.includes(extension))
  if (droppedExtensions.length) drift.push(`扩展丢失：${droppedExtensions.join(', ')}`)

  if (after.images < before.images) drift.push(`内嵌贴图丢失：${before.images} → ${after.images}`)
  if (after.textures < before.textures) drift.push(`纹理对象丢失：${before.textures} → ${after.textures}`)
  if (after.materials.length < before.materials.length) {
    drift.push(`材质槽减少：${before.materials.length} → ${after.materials.length}`)
  }
  if (!settings.allowRenames && !sameList(before.materialNames, after.materialNames)) {
    drift.push('材质名变化（会打穿按名取色的运行期分支）')
  }
  if (!settings.allowRenames && !sameList(before.nodeNames, after.nodeNames)) {
    drift.push('节点名变化（会打穿按节点名挂动画/交互的分支）')
  }
  if (after.animationChannels < before.animationChannels) {
    drift.push(`动画通道减少：${before.animationChannels} → ${after.animationChannels}`)
  }
  if (before.hasUv && !after.hasUv) drift.push('UV 丢失（贴图会被压成一个点）')

  const triangleRatio = relative(after.triangles, before.triangles)
  if (triangleRatio < settings.minTriangleRatio) {
    drift.push(`面数下降：${before.triangles} → ${after.triangles}（${Math.round(triangleRatio * 100)}%）`)
  }
  const growth = relative(after.byteLength, before.byteLength)
  if (growth > settings.maxGrowth) {
    drift.push(`体积膨胀：${before.byteLength} → ${after.byteLength} 字节（${Math.round(growth * 100)}%）`)
  }
  return drift
}

/**
 * 落盘闸门：退化则抛 {@link AssetDamageError}。
 * @param {string} label 日志里显示的模型/文件标识
 * @param {Buffer|string} before 源件（改写前的原始字节，或完整件路径）
 * @param {Buffer|string} after 待落盘产物
 */
export function assertPreserved(label, before, after, options) {
  const drift = fingerprintDrift(glbFingerprint(before), glbFingerprint(after), options)
  if (drift.length) throw new AssetDamageError(label, drift)
  return glbFingerprint(after)
}

/** lite 变体相对完整件的专用口径：允许新增 Draco、允许体积变小。 */
export const LITE_GUARD = Object.freeze({ maxGrowth: 1.2, minTriangleRatio: 0.9 })
