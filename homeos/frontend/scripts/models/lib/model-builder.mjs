/**
 * 精修件重建器：把「槽位 → 构件分组」的几何写成 GLB（完整件 + Draco lite）。
 *
 * 关键约束（计划 §5.6）：**材质数组原样保留**。重建只换几何，材质名、顺序、PBR 全部沿用
 * 源文件的 `materials`，因为 `studio-external-models.ts` 里还有按 `material-<n>` 下标取色的
 * 遗留分支（basin 的台面是下标 1、nightstand 的台面是下标 2），改名会让这些分支静默失效。
 */
import fs from 'node:fs'
import path from 'node:path'
import { Document, Material, PropertyType } from '@gltf-transform/core'
import { KHRDracoMeshCompression } from '@gltf-transform/extensions'
import { draco, prune } from '@gltf-transform/functions'
import { parseGlb, modelsDir, parseModelPath } from './glb-io.mjs'
import { LITE_GUARD, assertPreserved } from './asset-guard.mjs'
import { writeDocument } from './model-document.mjs'

/** 读源文件的材质定义（只取重建需要的字段，纹理在精修件里不保留）。 */
export function readSourceMaterials(filePath) {
  const { json } = parseGlb(fs.readFileSync(filePath))
  return (json.materials ?? []).map((material) => {
    const pbr = material.pbrMetallicRoughness ?? {}
    return {
      name: material.name ?? '',
      baseColor: pbr.baseColorFactor ?? [1, 1, 1, 1],
      roughness: pbr.roughnessFactor ?? 1,
      metallic: pbr.metallicFactor ?? 1,
      emissive: material.emissiveFactor ?? null,
      alphaMode: material.alphaMode ?? 'OPAQUE',
      alphaCutoff: material.alphaCutoff ?? 0.5,
      doubleSided: material.doubleSided ?? false,
      textured: Boolean(pbr.baseColorTexture),
    }
  })
}

function createMaterial(document, spec, materialIndex) {
  const material = document
    .createMaterial(spec.name || `material-${materialIndex}`)
    .setBaseColorFactor(spec.baseColor)
    .setRoughnessFactor(spec.roughness)
    .setMetallicFactor(spec.metallic)
    .setDoubleSided(spec.doubleSided)
  if (spec.alphaMode === 'MASK') material.setAlphaMode(Material.AlphaMode.MASK).setAlphaCutoff(spec.alphaCutoff)
  else if (spec.alphaMode === 'BLEND') material.setAlphaMode(Material.AlphaMode.BLEND)
  if (spec.emissive) material.setEmissiveFactor(spec.emissive)
  return material
}

/**
 * 写完整件。
 * @param {{filePath:string, materials:object[], groups:{name:string, material:number, geometry:object}[], extras?:object}} options
 */
export async function writeFullModel({ filePath, materials, groups, extras, rootName }) {
  const document = new Document()
  const buffer = document.createBuffer()
  const materialList = materials.map((spec, index) => createMaterial(document, spec, index))
  const root = document.getRoot()
  root.setExtras({ ...(root.getExtras() ?? {}), ...(extras ?? {}) })

  /**
   * 场景根节点：与全库其它 GLB 的结构一致（`scenes[0].nodes = [0]`，根节点无 mesh、
   * 用 children 挂各构件）。**没有 scene 的 GLB 在 three 里 `gltf.scene === undefined`**
   * —— `GLTFLoader` 取 `dependencies[0][json.scene || 0]`，`scenes` 缺省时拿到 undefined，
   * 加载器不会报错，但整件模型什么都不显示（`loadResult.scene || loadResult.scenes?.[0]`
   * 两条都是空）。这一条曾经漏过：30 款精修件重建后全库「看起来是空的」。
   */
  /**
   * 根节点 / scene 名沿用**英文模型 id**（不是磁盘上的中文文件名）。重建时先写
   * `*.rebuild.tmp.glb` 过闸门，若按临时文件名取名，闸门会把「根节点名变化」当成退化
   * 而拒绝落盘（`basin` 就撞过）；文件名的中文主干也会让内部标识跟着 UI 文案漂移。
   */
  const modelId =
    rootName ??
    parseModelPath(
      path.relative(modelsDir, filePath).replace(/\.rebuild\.tmp\.glb$/i, '.glb'),
    ).id
  const rootNode = document.createNode(modelId)

  for (const group of groups) {
    const geometry = group.geometry
    const vertexCount = geometry.positions.length / 3
    const position = document
      .createAccessor(group.name + '-position')
      .setType('VEC3')
      .setArray(new Float32Array(geometry.positions))
      .setBuffer(buffer)
    const normal = document
      .createAccessor(group.name + '-normal')
      .setType('VEC3')
      .setArray(new Float32Array(geometry.normals))
      .setBuffer(buffer)
    const uv = document
      .createAccessor(group.name + '-uv')
      .setType('VEC2')
      .setArray(new Float32Array(geometry.uvs))
      .setBuffer(buffer)
    // 索引类型按顶点数选：<65536 用 Uint16，省一半 BIN 体积。
    const indices =
      vertexCount < 65536
        ? new Uint16Array(geometry.indices)
        : new Uint32Array(geometry.indices)
    const index = document
      .createAccessor(group.name + '-index')
      .setType('SCALAR')
      .setArray(indices)
      .setBuffer(buffer)
    const primitive = document
      .createPrimitive()
      .setAttribute('POSITION', position)
      .setAttribute('NORMAL', normal)
      .setAttribute('TEXCOORD_0', uv)
      .setIndices(index)
      .setMaterial(materialList[group.material] ?? null)
    const mesh = document.createMesh(group.name).addPrimitive(primitive)
    rootNode.addChild(document.createNode(group.name).setMesh(mesh))
  }

  const scene = document.createScene(modelId).addChild(rootNode)
  root.setDefaultScene(scene)

  await writeDocument(document, filePath)
  root.dispose?.()
  return filePath
}

/**
 * 丢掉文档里已经存在的 Draco 扩展实例。
 *
 * 为什么要显式丢：对「已经是 Draco 的源件」（全库 256 个 lite、以及 `suv`/`scooter`
 * 这类以 Draco 形式入库的完整件）直接再 `createExtension(KHRDracoMeshCompression)`
 * 会得到**两个实例**；写回时旧实例仍在、`draco()` 只压缩新的一份，于是 BIN 里同时留下
 * 压缩段与未压缩回退段 —— 实测 `suv-lite` 因此从 126KB 涨到 1.5MB。
 */
export function stripMeshCompression(document) {
  for (const extension of document.getRoot().listExtensionsUsed()) {
    if (extension.extensionName === 'KHR_draco_mesh_compression') extension.dispose()
  }
}

/**
 * 清掉没有任何 primitive / 动画 / 蒙皮引用的 accessor。
 *
 * 来源是导出器留下的孤儿 accessor：`suv` 的 180 个 accessor 里只有 60 个在用，
 * 另外 120 个会以裸字节形式留在 BIN 里（约 1.4MB）。只清 accessor，不碰材质/节点，
 * 免得把「死材质」这类需要保留的槽位一起删掉。
 */
export function pruneOrphanAccessors(document) {
  // `keepAttributes` 必须开：glTF-Transform 默认会顺手删掉「材质没用到」的顶点属性，
  // 全库有 200+ 个件带 TEXCOORD_0 但材质暂时不用贴图（`freezer` 就是），
  // 默认值会把 UV 一起删掉，将来加贴图就会压成一个点。
  return document.transform(prune({ propertyTypes: [PropertyType.ACCESSOR], keepAttributes: true }))
}

/**
 * 由完整件重出 lite（Draco 压缩，材质与节点不动，落盘前对完整件做保真断言）。
 *
 * 断言口径：
 * - 材质名 / 节点名 / 贴图 / 扩展 / 面数 / 体积走 JSON 指纹（见 `asset-guard`）；
 * - 顶点数**不能**拿来判退化：Draco 会把完全重复的顶点去重（`floor-lamp` 15645 → 6721），
 *   这是无损的，所以几何正确性改用解码后的世界包围盒判定（误差 ≤1%）。
 */
export async function writeLiteFrom(filePath, litePath) {
  const { loadDocument, worldBounds } = await import('./model-document.mjs')
  const sourceBytes = fs.readFileSync(filePath)
  const document = await loadDocument(filePath)
  const sourceSize = worldBounds(document).size
  stripMeshCompression(document)
  await pruneOrphanAccessors(document)
  document.createExtension(KHRDracoMeshCompression).setRequired(true)
  await document.transform(
    draco({
      method: 'edgebreaker',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeColor: 8,
      quantizeGeneric: 12,
    }),
  )
  await writeDocument(document, litePath)
  // lite 与完整件必须只差「压缩」：材质名、贴图、节点、面数都不许动。
  assertPreserved(`lite ${path.basename(litePath)}`, sourceBytes, fs.readFileSync(litePath), LITE_GUARD)
  const liteDoc = await loadDocument(litePath)
  const liteSize = worldBounds(liteDoc).size
  const drift = sourceSize.map((value, axis) => Math.abs(liteSize[axis] - value) / Math.max(1e-6, value))
  if (Math.max(...drift) > 0.01) {
    throw new Error(
      `lite ${path.basename(litePath)} 包围盒漂移 ${drift.map((value) => `${(value * 100).toFixed(2)}%`).join('/')} > 1%`,
    )
  }
  liteDoc.getRoot().dispose?.()
  document.getRoot().dispose?.()
  return litePath
}
