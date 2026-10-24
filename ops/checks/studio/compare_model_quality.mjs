#!/usr/bin/env bun
/**
 * 模型损伤台账：逐文件比对「HEAD 里的原始 GLB」与「当前工作区里的 GLB」。
 *
 * 为什么需要它：2026-10-22 的批量修复把 672 个 GLB 全量重写了一遍，`check:geometry`
 * / `check:slots` 只看新文件自己的内部一致性（包围盒对不对、槽位契约有没有兑现），
 * 完全没有「和原版比」这一维 —— 于是低模重建顶替原模型、贴图与扩展被写丢、
 * lite 从 Draco 变成不压缩，全部绿灯通过。这个脚本补的就是那一维。
 *
 * 判定只读 GLB 的 **JSON chunk**，不解 Draco、不读顶点：
 * 面数 / 节点 / 材质 / 扩展 / 贴图 / accessor 结构都在 JSON 里，速度足够跑全库。
 * 顶点级证据（包围盒、拓扑）仍由 `audit_glb_geometry.mjs` 负责。
 *
 * 用法（仓库根目录）：
 * ```bash
 * bun ops/checks/studio/compare_model_quality.mjs                 # 打印汇总 + 写 md/json
 * bun ops/checks/studio/compare_model_quality.mjs --model sofa,basin
 * bun ops/checks/studio/compare_model_quality.mjs --json          # 只输出机读结果
 * bun ops/checks/studio/compare_model_quality.mjs --check         # CI：有 restore/rework 即失败
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  composeMatrix,
  listModelFiles,
  modelsDir,
  parseModelPath,
  parseGlb,
  readModelAtRevision,
  repoRoot,
  round,
  specsDir,
} from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

const only = (valueOf('model')?.split(',') ?? []).map((id) => id.trim()).filter(Boolean)
const asJson = hasFlag('json')
const checkMode = hasFlag('check')
const outDir = path.join(repoRoot, valueOf('out') ?? 'docs/architecture/2026-10-23')

/**
 * 已经动过刀的配方件：这些模型的原始件本身有真实缺陷（平板盆、实心柜体…），
 * 不能简单回滚，需要在原网格上做局部修复。名单只登记**已确认**的款，
 * 其余配方件一律按「重建损失细节」回滚。
 */
/**
 * 当前为空：`basin` 一度被列为「需局部重建」，但实际对拍后确认**原厂件本来就是椭圆盆**
 * （盆胆 544 × 315、深 116mm），重做把柜体比例也一并改了，反而偏离用户要的「以前的盆」。
 * 已恢复原厂件，不再登记 rework。
 */
const SURGICAL_REWORK = new Map()

/**
 * 本轮**有意**改动的文件：它们与 HEAD 不同不是损伤，而是回滚后补的缺口。
 * 台账里列成 keep，并在原因里写清楚改了什么，避免下次审计又把它们当退化。
 */
const INTENTIONAL_DELTA = new Map([
  ['floor-lamp', '新补的 lite 由原始完整件重出（此前只有损坏批次生成的 992 面 lite）'],
  ['floating-stairs', 'lite 由完整件重出，材质名与完整件统一'],
  ['suv', '新增完整件 + 由其重出 lite（此前只有 lite）'],
  ['scooter', '新增完整件 + 由其重出 lite，材质名随完整件统一'],
  ['freezer', 'lite 由完整件重出：HEAD 的 lite 只有 6 个材质槽（完整件 9 槽），角色表按完整件生成会导致 lite 槽位错配'],
])

/**
 * 已确认的 **lite 重出**：lite 与完整件的材质集（或同名参数）不一致时，由完整件重出 lite
 * （`ensure_variants.mjs --sync-materials`）。运行时优先加载 lite，lite 少一个槽位，
 * 那个构件在场景里就真的没有材质可换（调色板给了颜色也无处落地）。
 *
 * 登记后**只豁免「材质改名」这一条**：lite 从完整件继承全部材质名，名字集合必然与 HEAD
 * 不同。其余硬损伤（贴图丢失、面数腰斩、节点改名、primitive 拆分…）照旧判回滚 ——
 * 这个豁免不能变成「整件放行」。
 */
const DECLARED_LITE_REBUILD = new Map([
  ['chair', 'lite 缺 shadow / surface / accent 三个槽位，由完整件重出对齐（审计 C4）'],
  ['sofa', 'lite 缺 frame 槽位，由完整件重出对齐（审计 C4）'],
  ['table', 'lite 缺 shadow / surface 槽位，由完整件重出对齐（审计 C4）'],
  ['tvstand', 'lite 缺 fabric / accent 槽位，由完整件重出对齐（审计 C4）'],
  ['office-chair', 'lite 缺 surface 槽位，由完整件重出对齐（审计 C4）'],
  ['rounddiningtable', 'lite 缺 shadow / surface 槽位，由完整件重出对齐（审计 C4）'],
  ['squarecoffeetable', 'lite 缺 fabric / accent 槽位，由完整件重出对齐（审计 C4）'],
])

/** 判定阈值。 */
const DECIMATION_RATIO = 0.9
const LITE_GROWTH_RATIO = 1.2
const FULL_GROWTH_RATIO = 1.5

const specs = JSON.parse(fs.readFileSync(path.join(specsDir, 'model-specs.json'), 'utf8')).models
const nameById = new Map(Object.values(specs).map((spec) => [spec.id, spec.name]))

/* ------------------------------------------------------------------ *
 * 指标
 * ------------------------------------------------------------------ */

/**
 * 从 GLB 的 JSON chunk 提取可比对的结构指纹。
 *
 * 刻意**不**记录节点/材质在数组里的下标：重排不是损伤。节点父子关系用名字对，
 * 这样重排后仍然可比；改名则会同时体现为「名字集合变化」与「父子边变化」。
 */
function measure(parsed, byteLength) {
  const json = parsed.json
  const nodes = json.nodes ?? []
  const meshes = json.meshes ?? []
  const materials = json.materials ?? []
  const primitives = meshes.flatMap((mesh) => mesh.primitives ?? [])
  const accessors = json.accessors ?? []
  const animations = json.animations ?? []

  let triangles = 0
  for (const primitive of primitives) {
    const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION
    const count = accessors[accessorIndex]?.count ?? 0
    triangles += Math.floor(count / 3)
  }

  const nameOf = (index) => nodes[index]?.name ?? `node-${index}`
  const edges = []
  nodes.forEach((node) => {
    for (const child of node.children ?? []) edges.push(`${node.name ?? '?'}>${nameOf(child)}`)
  })

  const rootNodes = (json.scenes ?? []).flatMap((scene) => scene.nodes ?? [])
  /**
   * 根变换用**等效矩阵**比较，而不是比较 `matrix` / TRS 字段是否同一种写法：
   * 导出器把 `scale` 改写成 `matrix` 并不改变物体位置，直接比字段会把 137 个文件
   * 误判成「根变换变化」。
   */
  const rootTransforms = rootNodes.map((index) => {
    const node = nodes[index] ?? {}
    const effective = node.matrix
      ? node.matrix
      : composeMatrix({
          translation: node.translation ?? [0, 0, 0],
          rotation: node.rotation ?? [0, 0, 0, 1],
          scale: node.scale ?? [1, 1, 1],
        })
    return `${node.name ?? ''}:${effective.map((value) => round(value, 4)).join(',')}`
  })

  const textureSlots = materials.map((material) => {
    const pbr = material.pbrMetallicRoughness ?? {}
    return {
      name: material.name ?? '',
      baseColor: Boolean(pbr.baseColorTexture),
      metallicRoughness: Boolean(pbr.metallicRoughnessTexture),
      normal: Boolean(material.normalTexture),
      emissive: Boolean(material.emissiveTexture),
      occlusion: Boolean(material.occlusionTexture),
      specGloss: Boolean(material.extensions?.KHR_materials_pbrSpecularGlossiness),
    }
  })

  return {
    byteLength,
    bufferBytes: (json.buffers ?? []).reduce((sum, buffer) => sum + (buffer.byteLength ?? 0), 0),
    triangles,
    primitives: primitives.length,
    meshes: meshes.length,
    accessors: accessors.length,
    nodes: nodes.length,
    nodeNames: nodes.map((node) => node.name ?? '').filter(Boolean).sort(),
    nodeEdges: edges.sort(),
    materials: materials.length,
    materialSlots: materials.map((material) => material.name ?? ''),
    materialNames: materials.map((material) => material.name ?? '').sort(),
    extensions: [...(json.extensionsUsed ?? [])].sort(),
    images: (json.images ?? []).length,
    textures: (json.textures ?? []).length,
    samplers: (json.samplers ?? []).length,
    textureSlots,
    animations: animations.length,
    animationChannels: animations.reduce((sum, animation) => sum + (animation.channels ?? []).length, 0),
    animationNames: animations.map((animation) => animation.name ?? '').sort(),
    skins: (json.skins ?? []).length,
    rootTransforms,
    attrs: [...new Set(primitives.flatMap((primitive) => Object.keys(primitive.attributes ?? {})))].sort(),
  }
}

/** HEAD 里的原始字节；未跟踪的新文件返回 null。 */
function readHeadBytes(relativePath) {
  return readModelAtRevision(relativePath)
}

/* ------------------------------------------------------------------ *
 * 逐文件比对
 * ------------------------------------------------------------------ */

const differs = (before, after) => (Array.isArray(before) ? JSON.stringify(before) !== JSON.stringify(after) : before !== after)

/**
 * 已声明的槽位改名（新名 → 旧名），由 `repair_glb_material_slots.mjs --emit-generated` 生成。
 *
 * 用途：区分「契约驱动的改名」与「材质被写坏」。前者每个新名都能反查到旧名，
 * 运行期仍按旧名取色；后者查不到，历史分支会静默失效，必须回滚。
 */
const { LEGACY_MATERIAL_ALIASES } = await import(
  pathToFileURL(
    path.join(
      repoRoot,
      'homeos/frontend/src/studio/app/3d-studio/materials/legacy-material-aliases.generated.ts',
    ),
  ).href
)
const declaredRenameTo = new Map(
  Object.entries(LEGACY_MATERIAL_ALIASES).map(([next, legacy]) => [
    String(next).toLowerCase(),
    String(legacy).toLowerCase(),
  ]),
)

/** 改名是否全部在别名表里登记过（数量也要对得上，避免「改名 + 顺手删材质」蒙混过关）。 */
function renameIsDeclared(beforeNames, afterNames) {
  const before = new Set(beforeNames.map((name) => name.toLowerCase()))
  const after = new Set(afterNames.map((name) => name.toLowerCase()))
  const removed = [...before].filter((name) => !after.has(name))
  if (!removed.length) return false
  const added = [...after].filter((name) => !before.has(name))
  if (added.length !== removed.length) return false
  const removedSet = new Set(removed)
  return added.every((name) => removedSet.has(declaredRenameTo.get(name) ?? ''))
}

function compareFile(relativePath) {
  const parsedPath = parseModelPath(relativePath)
  const headBytes = readHeadBytes(relativePath)
  const currentBytes = fs.readFileSync(path.join(modelsDir, relativePath))
  if (!headBytes) {
    return {
      id: parsedPath.id,
      variant: parsedPath.variant,
      path: relativePath,
      newFile: true,
      bytesAfter: currentBytes.length,
    }
  }
  const before = measure(parseGlb(headBytes), headBytes.length)
  const after = measure(parseGlb(currentBytes), currentBytes.length)

  const droppedExtensions = before.extensions.filter((extension) => !after.extensions.includes(extension))
  const addedExtensions = after.extensions.filter((extension) => !before.extensions.includes(extension))
  const renamedMaterials = differs(before.materialNames, after.materialNames)
  const renameResultIsDeclared =
    renamedMaterials && renameIsDeclared(before.materialNames, after.materialNames)
  const renamedNodes = differs(before.nodeNames, after.nodeNames)
  const reparentedNodes = differs(before.nodeEdges, after.nodeEdges)
  const triangleRatio = before.triangles > 0 ? after.triangles / before.triangles : 1
  const growth = before.byteLength > 0 ? after.byteLength / before.byteLength : 1
  const lostTextureSlots = before.textureSlots.length - after.textureSlots.length

  const flags = []
  if (droppedExtensions.length) flags.push('扩展丢失')
  if (after.images < before.images) flags.push('内嵌贴图丢失')
  if (after.textures < before.textures) flags.push('纹理对象丢失')
  if (lostTextureSlots > 0) flags.push('材质槽减少')
  if (triangleRatio < DECIMATION_RATIO) flags.push('面数腰斩')
  if (before.triangles > 0 && triangleRatio > 1.4) flags.push('面数暴涨')
  if (renameResultIsDeclared) flags.push('槽位改名（已声明）')
  else if (renamedMaterials) flags.push('材质改名')
  if (renamedNodes) flags.push('节点改名')
  if (reparentedNodes && !renamedNodes) flags.push('层级变化')
  if (differs(before.rootTransforms, after.rootTransforms)) flags.push('根变换变化')
  if (differs(before.animationChannels, after.animationChannels)) flags.push('动画通道变化')
  if (differs(before.attrs, after.attrs)) flags.push('顶点属性变化')
  if (differs(before.primitives, after.primitives)) flags.push('primitive 合并/拆分')
  const growthLimit = parsedPath.variant === 'lite' ? LITE_GROWTH_RATIO : FULL_GROWTH_RATIO
  if (growth > growthLimit) flags.push('体积膨胀')
  if (growth < 0.5) flags.push('体积骤减')

  return {
    id: parsedPath.id,
    variant: parsedPath.variant,
    path: relativePath,
    newFile: false,
    flags,
    droppedExtensions,
    addedExtensions,
    triangleRatio: round(triangleRatio, 3),
    growth: round(growth, 3),
    before: {
      bytes: before.byteLength,
      bufferBytes: before.bufferBytes,
      triangles: before.triangles,
      materials: before.materials,
      nodes: before.nodes,
      images: before.images,
      textures: before.textures,
      extensions: before.extensions,
      animations: before.animations,
    },
    after: {
      bytes: after.byteLength,
      bufferBytes: after.bufferBytes,
      triangles: after.triangles,
      materials: after.materials,
      nodes: after.nodes,
      images: after.images,
      textures: after.textures,
      extensions: after.extensions,
      animations: after.animations,
    },
  }
}

/* ------------------------------------------------------------------ *
 * 逐模型判定
 * ------------------------------------------------------------------ */

const HARD_DAMAGE = new Set([
  '扩展丢失',
  '内嵌贴图丢失',
  '纹理对象丢失',
  '材质槽减少',
  '面数腰斩',
  '材质改名',
  '节点改名',
  '层级变化',
  '根变换变化',
  '动画通道变化',
  '顶点属性变化',
  'primitive 合并/拆分',
  '体积膨胀',
])

function verdictOf(id, files) {
  const real = files.filter((file) => !file.newFile)
  if (!real.length) return { verdict: 'keep', reasons: ['仓库里原本没有这个文件'] }
  if (SURGICAL_REWORK.has(id)) return { verdict: 'rework', reasons: [SURGICAL_REWORK.get(id)] }
  if (INTENTIONAL_DELTA.has(id)) return { verdict: 'keep', reasons: [INTENTIONAL_DELTA.get(id)] }
  const reasons = new Set()
  let restore = false
  const declaredLite = DECLARED_LITE_REBUILD.get(id)
  for (const file of real) {
    // lite 重出会从完整件继承材质名，只放过这一条 flag；其余硬损伤照旧。
    const declared = Boolean(declaredLite) && file.variant === 'lite'
    for (const flag of file.flags ?? []) {
      if (declared && flag === '材质改名') continue
      if (!HARD_DAMAGE.has(flag)) continue
      restore = true
      reasons.add(`${file.variant}：${flag}`)
    }
  }
  if (restore) return { verdict: 'restore', reasons: [...reasons] }
  if (declaredLite) return { verdict: 'keep', reasons: [declaredLite, ...(reasons.size ? [...reasons] : [])] }
  const soft = real.flatMap((file) => file.flags ?? [])
  if (!soft.length) return { verdict: 'keep', reasons: ['与原始件结构一致'] }
  return { verdict: 'keep', reasons: [`仅无害变化：${[...new Set(soft)].join('、')}`] }
}

const allFiles = listModelFiles().filter((relativePath) => {
  if (!only.length) return true
  return only.includes(parseModelPath(relativePath).id)
})

const fileReports = allFiles.map(compareFile)
const byId = new Map()
for (const report of fileReports) {
  const files = byId.get(report.id) ?? []
  files.push(report)
  byId.set(report.id, files)
}

const models = [...byId.entries()]
  .map(([id, files]) => {
    const { verdict, reasons } = verdictOf(id, files)
    const full = files.find((file) => file.variant === 'full')
    return {
      id,
      name: nameById.get(id) ?? id,
      folder: path.posix.dirname(full?.path ?? files[0].path),
      verdict,
      reasons,
      files: files.sort((a, b) => a.variant.localeCompare(b.variant)),
    }
  })
  .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))

const tally = { restore: 0, rework: 0, keep: 0 }
for (const model of models) tally[model.verdict] += 1

const bytesBefore = fileReports.reduce((sum, file) => sum + (file.before?.bytes ?? 0), 0)
const bytesAfter = fileReports.reduce((sum, file) => sum + (file.after?.bytes ?? file.bytesAfter ?? 0), 0)
const liteBefore = fileReports.filter((file) => file.variant === 'lite').reduce((sum, file) => sum + (file.before?.bytes ?? 0), 0)
const liteAfter = fileReports.filter((file) => file.variant === 'lite').reduce((sum, file) => sum + (file.after?.bytes ?? file.bytesAfter ?? 0), 0)

const summary = {
  generatedAt: new Date().toISOString(),
  models: models.length,
  files: fileReports.length,
  verdicts: tally,
  bytes: { before: bytesBefore, after: bytesAfter, ratio: round(bytesAfter / Math.max(1, bytesBefore), 3) },
  liteBytes: { before: liteBefore, after: liteAfter, ratio: round(liteAfter / Math.max(1, liteBefore), 3) },
  flagCounts: fileReports.reduce((counts, file) => {
    for (const flag of file.flags ?? []) counts[flag] = (counts[flag] ?? 0) + 1
    return counts
  }, {}),
  newFiles: fileReports.filter((file) => file.newFile).map((file) => file.path),
}

/* ------------------------------------------------------------------ *
 * 输出
 * ------------------------------------------------------------------ */

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`
const pct = (ratio) => `${Math.round(ratio * 100)}%`

if (!asJson) {
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'model-damage-triage.json'), `${JSON.stringify({ summary, models }, null, 2)}\n`)

  const lines = [
    '# GLB 损伤台账（HEAD 原始件 vs 当前工作区）',
    '',
    `生成时间：${summary.generatedAt}`,
    '',
    '判定依据只读 GLB 的 JSON chunk：扩展、贴图、材质/节点名、primitive 结构、accessor 面数、buffer 体积。',
    '顶点级几何（包围盒/拓扑）另见 `glb-geometry-audit.json`。',
    '',
    '## 汇总',
    '',
    '| 指标 | 数值 |',
    '| --- | --- |',
    `| 模型数 | ${summary.models} |`,
    `| 文件数 | ${summary.files} |`,
    `| restore（回滚） | ${tally.restore} |`,
    `| rework（局部修复） | ${tally.rework} |`,
    `| keep（原样保留） | ${tally.keep} |`,
    `| 全库体积 | ${mb(bytesBefore)} → ${mb(bytesAfter)}（${pct(bytesAfter / Math.max(1, bytesBefore))}） |`,
    `| lite 体积 | ${mb(liteBefore)} → ${mb(liteAfter)}（${pct(liteAfter / Math.max(1, liteBefore))}） |`,
    `| 新增文件 | ${summary.newFiles.length} |`,
    '',
    '## 损伤类型',
    '',
    '| 类型 | 文件数 |',
    '| --- | --- |',
    ...Object.entries(summary.flagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([flag, count]) => `| ${flag} | ${count} |`),
    '',
    '## 逐模型',
    '',
    '| 模型 | 名称 | 目录 | 结论 | 变体 | 三角面 | 体积 | 材质 | 节点 | 原因 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const model of models) {
    for (const file of model.files) {
      const triangles = file.newFile
        ? '新增'
        : `${file.before.triangles} → ${file.after.triangles}`
      const bytes = file.newFile
        ? `新增 ${Math.round(file.bytesAfter / 1024)} KB`
        : `${Math.round(file.before.bytes / 1024)} → ${Math.round(file.after.bytes / 1024)} KB`
      const materials = file.newFile ? '-' : `${file.before.materials} → ${file.after.materials}`
      const nodes = file.newFile ? '-' : `${file.before.nodes} → ${file.after.nodes}`
      lines.push(
        `| \`${model.id}\` | ${model.name} | ${model.folder} | ${model.verdict} | ${file.variant} | ${triangles} | ${bytes} | ${materials} | ${nodes} | ${model.reasons.join('；') || '-'} |`,
      )
    }
  }
  fs.writeFileSync(path.join(outDir, 'model-damage-triage.md'), `${lines.join('\n')}\n`)
  console.log(JSON.stringify(summary, null, 2))
  console.log(`\n台账：${path.relative(repoRoot, path.join(outDir, 'model-damage-triage.md'))}`)
}

if (asJson) console.log(JSON.stringify({ summary, models }, null, 2))

if (checkMode && tally.restore > 0) {
  console.error(`✗ 仍有 ${tally.restore} 款需要回滚（结构/贴图/面数与原始件不符）`)
  process.exit(1)
}
// `rework` 是已登记的局部修复（原模型本来就有缺陷、且报告里有 before/after 证据），
// 不是回归：门禁只拦 `restore`，但仍把名单打出来，防止它悄悄变多。
if (checkMode && tally.rework > 0) {
  const names = models.filter((model) => model.verdict === 'rework').map((model) => model.id)
  console.warn(`! 已登记局部修复 ${tally.rework} 款：${names.join(', ')}（见验收报告，不视为回滚待办）`)
}
if (checkMode) console.log(`✓ 模型与原始件结构一致：${tally.keep} 款`)
