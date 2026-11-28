#!/usr/bin/env bun
/**
 * 贴图去重 / 重压缩（默认 dry-run）。
 *
 * 起因是一次模型体检的实测结果：全库只有 5 个 GLB 带内嵌贴图，其中
 * `小汽车.glb`、`小汽车-lite.glb`、`小汽车-开合件-lite.glb` 内嵌的是**同一张**
 * 1024×1024 PNG（SHA1 完全相同，510,896 字节）。一辆车在场景里同时加载车身与开合件，
 * 于是 1.0MB 的 lite 流量里约 998KB 是同一张图的两份拷贝。
 *
 * 另外这张图是 **PNG colorType=2（RGB，无 alpha 通道）**，而材质写的是
 * `alphaMode=MASK / alphaCutoff=0.5` —— alpha 测试永远不做裁剪，只是多一个分支。
 *
 * 本脚本做三件可验证的事：
 * 1. **同图去重**：内容完全相同的内嵌图只保留一份，写成 GLB 同目录下的外部文件，
 *    其余 GLB 的 `images[]` 改成 `uri` 引用并从 BIN 里移除（`glb-bin-io.mjs` 负责重排）；
 * 2. **按真实通道选格式**：无 alpha → JPEG（q92）；有 alpha → PNG（保持无损）。
 *    格式由 `sharp` 解码后的 `hasAlpha` 决定，不看 `mimeType` —— 导出器常把 RGBA 写成
 *    RGB，反过来也一样；
 * 3. **修无用 alpha 测试**：`MASK` 材质的 baseColor 贴图没有 alpha 通道 → 改 `OPAQUE`
 *    并删掉 `alphaCutoff`（视觉等价，少一个 shader 分支）。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/optimize_glb_textures.mjs            # dry-run，列出重复图与节省
 * bun ops/checks/studio/optimize_glb_textures.mjs --write    # 落盘（改动 GLB + 写共享图）
 * bun ops/checks/studio/optimize_glb_textures.mjs --check    # 门禁：还有重复图 / 无用 MASK 则退出码 1
 * ```
 *
 * 改完必须跑：`bun run check:model-assets`（几何 / 体积 / 贴图有效性）与
 * `bun ops/checks/studio/audit_glb_geometry.mjs --model <id>`（包围盒与面数应逐位不变）。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import {
  listModelFiles,
  modelsDir,
  parseGlb,
  parseModelPath,
  repoRoot,
} from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'
import { repackGlb } from '../../../homeos/frontend/scripts/models/lib/glb-bin-io.mjs'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
void hereDir

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)
const write = hasFlag('write')
const check = hasFlag('check')
const asJson = hasFlag('json')
const quality = Number(args[args.indexOf('--quality') + 1]) || 92

/**
 * 不参与优化的模型。
 *
 * `floor-lamp` 是 `落地灯（旧版）.glb` 的 id：它被登记为**已审孤儿**（只作 SimLab 原模型
 * 的质量对照，不进设计目录、运行时不加载）。它的 lite/full 也各存了一份相同的 2.5KB 贴图，
 * 去重收益不到 3KB，却会改动「对照基准」那份文件 —— 不值。
 */
const SKIP_MODEL_IDS = new Set(['floor-lamp'])

/** 扫描期发现的「GLB 指向的外置贴图不存在」（模块级，`scanImages` 里填）。 */
const missingExternalImages = []

/** 一次扫描的全部内嵌贴图。 */
function scanImages() {
  const entries = []
  for (const relativePath of listModelFiles()) {
    const { id } = parseModelPath(relativePath)
    if (SKIP_MODEL_IDS.has(id)) continue
    const absolute = path.join(modelsDir, relativePath)
    const buffer = fs.readFileSync(absolute)
    const { json, bin } = parseGlb(buffer)
    const images = json.images ?? []
    for (const [imageIndex, image] of images.entries()) {
      // 外置贴图只校验「文件还在」：这一步防的是「GLB 指向的共享图被误删 / 没落盘」——
      // 那种模型能正常解析、几何门禁也照过，只有真的去加载贴图时才 404（车壳变纯色）。
      if (typeof image.uri === 'string' && image.uri && !image.uri.startsWith('data:')) {
        const external = path.resolve(path.dirname(absolute), decodeURIComponent(image.uri))
        if (!fs.existsSync(external) || fs.statSync(external).size === 0) {
          missingExternalImages.push({ file: relativePath, uri: image.uri })
        }
        continue
      }
      if (typeof image.bufferView !== 'number') continue
      const view = json.bufferViews?.[image.bufferView]
      if (!view) continue
      const start = view.byteOffset ?? 0
      const bytes = bin.subarray(start, start + view.byteLength)
      entries.push({
        relativePath,
        absolute,
        buffer,
        json,
        imageIndex,
        bufferView: image.bufferView,
        bytes,
        hash: crypto.createHash('sha1').update(bytes).digest('hex'),
        // 引用该图的材质名（同名图可能被不同材质引用，取名时优先用最小的那个）。
        materialNames: materialNamesUsingImage(json, imageIndex),
      })
    }
  }
  return entries
}

function materialNamesUsingImage(json, imageIndex) {
  const textureIndices = new Set(
    (json.textures ?? [])
      .map((texture, index) => (texture.source === imageIndex ? index : null))
      .filter((v) => v !== null),
  )
  const names = []
  for (const material of json.materials ?? []) {
    const pbr = material.pbrMetallicRoughness ?? {}
    const infos = [
      pbr.baseColorTexture,
      pbr.metallicRoughnessTexture,
      material.normalTexture,
      material.emissiveTexture,
      material.occlusionTexture,
    ]
    if (infos.some((info) => info && textureIndices.has(info.index))) names.push(material.name ?? '')
  }
  return names.filter(Boolean)
}

/** 该模型的所有 `MASK` 材质里，baseColor 贴图**没有 alpha 通道**的那些。 */
async function uselessAlphaTests(entry) {
  const { json, imageIndex } = entry
  const textureIndices = new Set(
    (json.textures ?? [])
      .map((texture, index) => (texture.source === imageIndex ? index : null))
      .filter((v) => v !== null),
  )
  const targets = []
  for (const material of json.materials ?? []) {
    if ((material.alphaMode ?? 'OPAQUE') !== 'MASK') continue
    const baseColor = material.pbrMetallicRoughness?.baseColorTexture
    if (!baseColor || !textureIndices.has(baseColor.index)) continue
    targets.push(material.name ?? '')
  }
  return targets
}

/** 由材质名派生共享贴图文件名：`car_tms` → `car-tms`。 */
function assetBaseName(group) {
  const candidate = group
    .flatMap((entry) => entry.materialNames)
    .map((name) =>
      name
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase(),
    )
    .filter(Boolean)
    .sort((left, right) => left.length - right.length)[0]
  return candidate || 'shared-atlas'
}

const round1 = (value) => Math.round(value * 10) / 10

async function main() {
  const entries = scanImages()
  const byHash = new Map()
  for (const entry of entries) {
    const list = byHash.get(entry.hash) ?? []
    list.push(entry)
    byHash.set(entry.hash, list)
  }

  const duplicateGroups = [...byHash.entries()].filter(([, list]) => list.length > 1)
  const alphaFixups = []
  for (const entry of entries) {
    const targets = await uselessAlphaTests(entry)
    if (targets.length) alphaFixups.push({ ...entry, targets })
  }

  const report = {
    scanned: entries.length,
    missingExternalImages,
    duplicateGroups: duplicateGroups.map(([hash, list]) => ({
      hash: hash.slice(0, 12),
      bytes: list[0].bytes.length,
      files: list.map((entry) => entry.relativePath),
      materialNames: [...new Set(list.flatMap((entry) => entry.materialNames))],
    })),
    uselessMaskMaterials: alphaFixups.map((entry) => ({
      file: entry.relativePath,
      image: entry.imageIndex,
      materials: entry.targets,
    })),
  }

  if (asJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    console.log(`扫描 ${entries.length} 张内嵌贴图（${new Set(entries.map((e) => e.relativePath)).size} 个 GLB）`)
    for (const group of report.duplicateGroups) {
      console.log(`✗ 重复图 ${group.hash}（${group.bytes} 字节）× ${group.files.length}`)
      for (const file of group.files) console.log(`    ${file}`)
    }
    for (const missing of report.missingExternalImages) {
      console.log(`✗ ${missing.file}：外置贴图 ${missing.uri} 不存在`)
    }
    for (const entry of report.uselessMaskMaterials) {
      console.log(`! ${entry.file}：${entry.materials.join(' / ')} 是 MASK，但贴图没有 alpha 通道`)
    }
  }

  if (check) {
    /**
     * 门禁只拦「代价足够大」的重复：≥64KB 的内嵌图在 lite 里存两份就是 128KB 起步的
     * 首屏流量，值得强制去重。更小的（例如一对 128×128 的 2KB 图）由报告提示，
     * 不进退出码 —— 否则每个新导出的「lite + 完整件」双份贴图都会把门禁点红，
     * 而作者并不需要为此先跑一遍优化脚本。
     */
    const heavy = report.duplicateGroups.filter((group) => group.bytes >= 64 * 1024)
    const failures = []
    if (missingExternalImages.length) failures.push(`${missingExternalImages.length} 处外置贴图缺失`)
    if (heavy.length) failures.push(`${heavy.length} 组大体积重复内嵌贴图`)
    if (report.uselessMaskMaterials.length) failures.push(`${report.uselessMaskMaterials.length} 处无用 alpha 测试`)
    if (failures.length) {
      console.error(`✗ 贴图门禁：${failures.join('、')}`)
      console.error('  修：bun ops/checks/studio/optimize_glb_textures.mjs --write')
      process.exit(1)
    }
    const small = report.duplicateGroups.length - heavy.length
    console.log(
      `✓ 贴图门禁通过：无大体积重复内嵌图、无无用 alpha 测试` + (small ? `（${small} 组小图重复，仅提示）` : ''),
    )
    return
  }

  if (!write) {
    console.log('\n（dry-run：加 --write 才落盘）')
    return
  }

  let savedBytes = 0
  for (const [, group] of duplicateGroups) {
    const source = group[0]
    // 同一张图只留一份文件：放在第一个模型的目录旁（同目录的其它 GLB 用相对路径引用）。
    const folder = path.dirname(source.relativePath)
    const metadata = await sharp(source.bytes).metadata()
    const hasAlpha = metadata.hasAlpha === true
    const extension = hasAlpha ? '.png' : '.jpg'
    const fileName = `${assetBaseName(group)}${extension}`
    const relativeAsset = path.posix.join(folder, fileName)
    const absoluteAsset = path.join(modelsDir, relativeAsset)
    const encoded = hasAlpha
      ? await sharp(source.bytes).png({ compressionLevel: 9, effort: 10 }).toBuffer()
      : await sharp(source.bytes).jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer()
    fs.writeFileSync(absoluteAsset, encoded)
    console.log(
      `\n共享图 ${relativeAsset}：${source.bytes.length} → ${encoded.length} 字节` +
        `（${metadata.width}×${metadata.height} ${hasAlpha ? '含 alpha → PNG' : '无 alpha → JPEG'}）`,
    )

    for (const entry of group) {
      const uri = path.posix.relative(path.dirname(entry.relativePath), relativeAsset)
      const droppedView = entry.bufferView
      const next = repackGlb(entry.buffer, {
        mutateJson: (json) => {
          const image = json.images[entry.imageIndex]
          delete image.bufferView
          image.uri = uri
          image.mimeType = hasAlpha ? 'image/png' : 'image/jpeg'
        },
        drop: new Set([droppedView]),
      })
      // 安全断言：删掉贴图 view 之后，accessor 与 Draco 的字节必须还在（顺序与内容都不变）。
      assertGeometryPreserved(entry.buffer, next)
      savedBytes += entry.buffer.length - next.length
      fs.writeFileSync(entry.absolute, next)
      console.log(`  ${entry.relativePath}：${entry.buffer.length} → ${next.length} 字节（uri=${uri}）`)
    }
  }

  // 无用 alpha 测试：MASK 的 baseColor 贴图没有 alpha → OPAQUE。放在去重之后单独一遍，
  // 这样外置图与内嵌图的处理路径互不影响。
  for (const entry of alphaFixups) {
    const absolute = path.join(modelsDir, entry.relativePath)
    const buffer = fs.readFileSync(absolute)
    const next = repackGlb(buffer, {
      mutateJson: (json) => {
        for (const material of json.materials ?? []) {
          if ((material.alphaMode ?? 'OPAQUE') !== 'MASK') continue
          if (!entry.targets.includes(material.name ?? '')) continue
          material.alphaMode = 'OPAQUE'
          delete material.alphaCutoff
        }
      },
    })
    fs.writeFileSync(absolute, next)
    console.log(`\n${entry.relativePath}：MASK → OPAQUE（${entry.targets.join(' / ')}）`)
  }

  console.log(`\n完成：去重节省 ${round1(savedBytes / 1024)}KB；外部图 ${duplicateGroups.length} 份`)
  console.log(`仓库根：${path.relative(repoRoot, modelsDir)}`)
}

/** 改完的 GLB 必须与原件共享同一批 accessor / Draco 字节。 */
function assertGeometryPreserved(before, after) {
  const parse = (buffer) => parseGlb(buffer)
  const a = parse(before)
  const b = parse(after)
  const bytesOf = (parsed, index) => {
    const view = parsed.json.bufferViews[index]
    const start = view.byteOffset ?? 0
    return parsed.bin.subarray(start, start + view.byteLength)
  }
  for (const [index, accessor] of a.json.accessors.entries()) {
    if (accessor.bufferView === undefined) continue
    const nextView = b.json.accessors[index]?.bufferView
    if (nextView === undefined) throw new Error(`accessor ${index} 重排后丢了 bufferView`)
    if (!bytesOf(a, accessor.bufferView).equals(bytesOf(b, nextView))) {
      throw new Error(`accessor ${index} 的字节在重排后变了`)
    }
  }
  const dracoViews = (parsed) =>
    (parsed.json.meshes ?? []).flatMap((mesh) =>
      (mesh.primitives ?? [])
        .map((primitive) => primitive.extensions?.KHR_draco_mesh_compression?.bufferView)
        .filter((value) => value !== undefined),
    )
  const beforeViews = dracoViews(a)
  const afterViews = dracoViews(b)
  if (beforeViews.length !== afterViews.length) throw new Error('Draco primitive 数量在重排后变了')
  for (let index = 0; index < beforeViews.length; index += 1) {
    if (!bytesOf(a, beforeViews[index]).equals(bytesOf(b, afterViews[index]))) {
      throw new Error(`Draco primitive ${index} 的字节在重排后变了`)
    }
  }
  // 贴图外置后不该再有别的引用指向被删的 view。
  if (b.json.images.some((image) => image.bufferView !== undefined)) {
    throw new Error('仍有内嵌贴图指向 bufferView')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
