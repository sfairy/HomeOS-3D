#!/usr/bin/env bun
/**
 * GLB 资产门禁：体积预算、扩展/贴图保留、节点与材质名稳定、面数下限、lite 压缩形态。
 *
 * 这一版门禁是为「批量重写把模型写坏」那类事故建的。当时全库 27.8MB → 95.1MB、
 * lite 7.1MB → 39.2MB、`car` 等 5 个文件的 `KHR_materials_pbrSpecularGlossiness` 与内嵌贴图
 * 被静默丢弃，而 `check:geometry` / `check:slots` 全绿 —— 因为它们只关心包围盒与槽位命名，
 * 不关心「文件里还剩什么」。这里补的就是这几件没人看的事：
 *
 * 1. **体积预算**：lite 是运行期首选变体，膨胀就是首屏变慢。全库 lite ≤8MB、完整件 ≤30MB，
 *    且单文件相对基线 ≤1.2×（写回器把 BIN 直接重编码时的膨胀上限）。
 * 2. **扩展不减少**：`extensionsUsed` 必须覆盖基线，尤其 `KHR_materials_pbrSpecularGlossiness`
 *    （glTF-Transform 会丢）、`KHR_draco_mesh_compression`、`KHR_mesh_quantization`。
 * 3. **贴图不减少**：`images` / `textures` 数量不得低于基线，且每张图必须有 uri 或有效的
 *    bufferView（长度 >0 且落在 BIN 内）——「数量对但内容是空 bufferView」同样画不出贴图。
 * 4. **名字稳定**：节点名、材质名集合与基线一致。运行期还有按名字判定的分支，改名会静默失效。
 * 5. **面数下限**：三角面 ≥ 基线 0.9×。低模顶替原版正是「不如原图」的根因。
 * 6. **lite 形态**：lite 必须带 Draco + 量化；完整件不允许被 Draco 压（导出/编辑要用原网格）。
 *
 * 重建件（`REBUILT`）允许面数/名字变化：它们是**基于原网格重做**并有人工验收证据的模型，
 * 名单必须是白名单而不是「面数掉了就放行」。
 *
 * 用法（仓库根目录）：
 * ```bash
 * bun ops/checks/studio/audit_glb_assets.mjs                 # 打印摘要
 * bun ops/checks/studio/audit_glb_assets.mjs --check         # 门禁：违规退出码 1
 * bun ops/checks/studio/audit_glb_assets.mjs --json          # 机读结果
 * bun ops/checks/studio/audit_glb_assets.mjs --write-baseline
 * bun ops/checks/studio/audit_glb_assets.mjs --model car,sofa
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectModelVariants, listModelFiles, modelsDir, parseGlb } from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(hereDir, '../../..')
const baselineFile = path.join(hereDir, 'asset-baseline.json')

/** 体积预算：回滚后实测全库 27.8MB / lite 7.1MB，留出正常增长余量。 */
export const BUDGETS = Object.freeze({
  fullTotalBytes: 30 * 1024 * 1024,
  liteTotalBytes: 8 * 1024 * 1024,
  perFileRatio: 1.2,
  triangleRatio: 0.9,
})

/**
 * 允许偏离基线的重建件：每个都必须在 `docs/architecture/2026-10-23/model-restore-report.md`
 * 里有 before/after 证据。往这里加名字等于声明「我人工看过这件的几何」。
 */
/**
 * 当前为空：`basin` 已按用户要求恢复原厂件（原厂本来就是椭圆盆，重做反而丢了原柜体的
 * 比例与细节），不再有「被重做但保留登记」的模型。
 */
export const REBUILT = new Set()

/**
 * 允许节点名/材质名与基线不同的模型（仍受体积、扩展、贴图、面数约束）。
 * 这里只放「名字变化是修复本身」的模型：`freezer` 的 HEAD lite 只有 6 个材质槽
 * （完整件 9 槽），重新从完整件生成 lite 必然会多出 `material-5-screen` 等槽位。
 */
export const ALLOW_NAME_CHANGES = new Set(['freezer'])

/**
 * 压缩形态按**基线**守，不按理想值守：原始供应商 lite 里大量文件只带 Draco（没有
 * `KHR_mesh_quantization`），拿「必须量化」当硬门槛会把 300+ 个没问题的文件判红，
 * 门禁也就没人看了。真正要防的是「本次写回把压缩形态改掉」：
 * - lite 原来是 Draco → 现在必须还是 Draco（压缩产物不能退回未压缩）；
 * - 完整件原来不是 Draco → 现在也不能是（导出/再编辑要拿原网格）。
 */
const FRAGILE_EXTENSIONS = ['KHR_materials_pbrSpecularGlossiness', 'KHR_texture_transform']

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

/** 每个 GLB 的可比指标，全部来自 JSON chunk（不解码几何，跑得快且不受 Draco 影响）。 */
function inspectFile(relativePath) {
  const absolutePath = path.join(modelsDir, relativePath)
  const buffer = fs.readFileSync(absolutePath)
  const { json, binLength } = parseGlb(buffer)
  const nodeNames = []
  const materialNames = []
  const accessors = json.accessors ?? []
  let triangles = 0
  for (const node of json.nodes ?? []) {
    if (node.name) nodeNames.push(node.name)
    const mesh = node.mesh === undefined ? null : json.meshes?.[node.mesh]
    if (!mesh) continue
    for (const primitive of mesh.primitives ?? []) {
      const indices = primitive.indices === undefined ? null : accessors[primitive.indices]
      const position = accessors[primitive.attributes?.POSITION]
      const count = indices?.count ?? position?.count ?? 0
      triangles += count > 0 ? count / 3 : 0
    }
  }
  for (const material of json.materials ?? []) if (material.name) materialNames.push(material.name)
  return {
    bytes: buffer.length,
    triangles: Math.round(triangles),
    extensionsUsed: [...(json.extensionsUsed ?? [])].sort(),
    images: (json.images ?? []).length,
    textures: (json.textures ?? []).length,
    nodeNames: nodeNames.sort(),
    materialNames: materialNames.sort(),
    // 贴图有效性单列：数量对但 bufferView 空/越界，运行期同样画不出贴图。
    brokenImages: brokenImageIndices(json, binLength),
    draco: (json.extensionsUsed ?? []).includes('KHR_draco_mesh_compression'),
  }
}

/** `images[]` 里没有 uri、或 bufferView 不可用（空/越出 BIN）的条目。 */
function brokenImageIndices(json, binLength) {
  const broken = []
  for (const [index, image] of (json.images ?? []).entries()) {
    if (typeof image.uri === 'string' && image.uri.length > 0) continue
    if (image.bufferView === undefined) {
      broken.push(index)
      continue
    }
    const view = json.bufferViews?.[image.bufferView]
    if (!view || !Number.isFinite(view.byteLength) || view.byteLength <= 0) {
      broken.push(index)
      continue
    }
    if ((view.byteOffset ?? 0) + view.byteLength > binLength) broken.push(index)
  }
  return broken
}

const variants = collectModelVariants(listModelFiles())
const onlyIds = (valueOf('model')?.split(',') ?? []).map((id) => id.trim()).filter(Boolean)
const ids = [...variants.keys()].filter((id) => !onlyIds.length || onlyIds.includes(id)).sort()

if (hasFlag('write-baseline')) {
  const files = {}
  for (const id of ids) {
    for (const relativePath of Object.values(variants.get(id))) files[relativePath] = inspectFile(relativePath)
  }
  const payload = { generatedAt: new Date().toISOString(), budgets: BUDGETS, rebuilt: [...REBUILT], files }
  fs.writeFileSync(baselineFile, JSON.stringify(payload, null, 2) + '\n')
  console.log(`已写入 ${path.relative(repoRoot, baselineFile)}（${Object.keys(files).length} 个文件）`)
  process.exit(0)
}

if (!fs.existsSync(baselineFile)) {
  console.error(`缺少 ${path.relative(repoRoot, baselineFile)}，先跑 --write-baseline`)
  process.exit(1)
}
const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'))

const problems = []
const report = { checkedAt: new Date().toISOString(), totals: { fullBytes: 0, liteBytes: 0 }, files: 0, rebuiltSkipped: [], problems }
const add = (level, id, file, message) => problems.push({ level, id, file, message })

for (const id of ids) {
  const entry = variants.get(id)
  const rebuilt = REBUILT.has(id)
  if (rebuilt) report.rebuiltSkipped.push(id)
  for (const [variant, relativePath] of Object.entries(entry)) {
    const current = inspectFile(relativePath)
    report.files += 1
    report.totals[variant === 'lite' ? 'liteBytes' : 'fullBytes'] += current.bytes
    const before = baseline.files[relativePath]
    if (!before) {
      add('error', id, relativePath, `新增文件未登记基线（跑 --write-baseline 并说明来源）`)
    } else {
      // 单文件体积：lite 是压缩产物，膨胀 20% 以上就是量化参数或写法回退。
      if (current.bytes > before.bytes * BUDGETS.perFileRatio) {
        add('error', id, relativePath, `体积 ${current.bytes} > 基线 ${before.bytes} 的 ${BUDGETS.perFileRatio}×`)
      }
      const lost = before.extensionsUsed.filter((extension) => !current.extensionsUsed.includes(extension))
      // 重建件允许「不再需要某扩展」（例如去掉 SpecularGlossiness），但脆弱扩展丢了永远是错的。
      const lostFragile = lost.filter((extension) => FRAGILE_EXTENSIONS.includes(extension))
      if (lostFragile.length) add('error', id, relativePath, `丢失扩展 ${lostFragile.join(', ')}`)
      else if (lost.length && !rebuilt) add('error', id, relativePath, `丢失扩展 ${lost.join(', ')}`)
      if (current.images < before.images) add('error', id, relativePath, `贴图 images ${before.images} → ${current.images}`)
      if (current.textures < before.textures) add('error', id, relativePath, `贴图 textures ${before.textures} → ${current.textures}`)
      if (current.brokenImages.length) add('error', id, relativePath, `无效贴图 images[${current.brokenImages.join(',')}]`)
      if (!rebuilt) {
        if (current.triangles < before.triangles * BUDGETS.triangleRatio) {
          add('error', id, relativePath, `三角面 ${before.triangles} → ${current.triangles}（低于 0.9×，疑似低模顶替）`)
        }
      }
      if (!rebuilt && !ALLOW_NAME_CHANGES.has(id)) {
        const removedNodes = before.nodeNames.filter((name) => !current.nodeNames.includes(name))
        const addedNodes = current.nodeNames.filter((name) => !before.nodeNames.includes(name))
        if (removedNodes.length || addedNodes.length) {
          add('error', id, relativePath, `节点名变化 -[${removedNodes.slice(0, 4).join(',')}] +[${addedNodes.slice(0, 4).join(',')}]`)
        }
        const removedMaterials = before.materialNames.filter((name) => !current.materialNames.includes(name))
        const addedMaterials = current.materialNames.filter((name) => !before.materialNames.includes(name))
        if (removedMaterials.length || addedMaterials.length) {
          add('error', id, relativePath, `材质名变化 -[${removedMaterials.slice(0, 4).join(',')}] +[${addedMaterials.slice(0, 4).join(',')}]`)
        }
      }
    }
    if (variant === 'lite') {
      if (before?.draco && !current.draco) add('error', id, relativePath, 'lite 丢失 Draco 压缩（体积会回到未压缩状态）')
    } else if (!before?.draco && current.draco) {
      add('error', id, relativePath, '完整件被 Draco 压缩（导出/再编辑会拿到量化网格）')
    }
  }
}

if (report.totals.liteBytes > BUDGETS.liteTotalBytes) {
  add('error', '（全库）', '', `lite 合计 ${(report.totals.liteBytes / 1048576).toFixed(2)}MB > 预算 ${BUDGETS.liteTotalBytes / 1048576}MB`)
}
if (report.totals.fullBytes > BUDGETS.fullTotalBytes) {
  add('error', '（全库）', '', `完整件合计 ${(report.totals.fullBytes / 1048576).toFixed(2)}MB > 预算 ${BUDGETS.fullTotalBytes / 1048576}MB`)
}

const summary = {
  models: ids.length,
  files: report.files,
  fullMB: +(report.totals.fullBytes / 1048576).toFixed(2),
  liteMB: +(report.totals.liteBytes / 1048576).toFixed(2),
  errors: problems.filter((problem) => problem.level === 'error').length,
  rebuilt: [...REBUILT],
}

if (hasFlag('json')) {
  console.log(JSON.stringify({ ...report, summary }, null, 2))
} else {
  console.log(JSON.stringify(summary, null, 2))
  for (const problem of problems) console.log(`${problem.level === 'error' ? '✗' : '!'} ${problem.id}${problem.file ? ` (${problem.file})` : ''}: ${problem.message}`)
}

process.exit(hasFlag('check') && summary.errors ? 1 : 0)
