#!/usr/bin/env node
/**
 * GLB 资产几何压缩脚本（B17，默认 dry-run，绝不原地改写资产）。
 *
 * 为什么需要它
 * ------------
 * 3D 资产库是「完整件 + lite」成对存在的：336 个 `<名>.glb`（可编辑原网格）与 336 个
 * `<名>-lite.glb`（运行时首选，Draco）。报告 docs/perf/2026-11-06-performance-architecture-review.md
 * 的 B17 最初把「311 个未压缩」当成运行时体积，实际它们全是**完整件**；压缩完整件会违反
 * `ops/checks/studio/audit_glb_assets.mjs` 的硬规则（完整件不允许 Draco，导出/再编辑要原网格）。
 *
 * 因此本脚本**默认只处理 `-lite.glb`**：完整件原样拷贝、只作为输出目录的完整性占位。
 * 要处理完整件必须显式 `--include-full`，且门禁 `check:assets` 会判红 —— 除非同时改基线，
 * 不要这么做。
 *
 * 本脚本做三件事
 * --------------
 * 1. 默认 dry-run：只解析 GLB 头里的 JSON chunk，按 lite / 完整件分别统计「已压缩 / 未压缩 /
 *    含 KTX2」，不写任何文件；
 * 2. --write --out <目录>：把候选 GLB 压到**另一个目录**（保持相对路径），写后回读校验，
 *    校验失败的文件不落入输出目录；输出体积没有变小的文件退回「原样拷贝」；
 * 3. --verify --out <目录>：对已产出的输出目录做同样口径的独立校验（可放进 CI / 发布前）。
 *
 * 校验口径（报告 B17 要求「可解码、体积与包围盒不变」）
 * ---------------------------------------------------
 * - 输出必须能被 NodeIO 重新解码（Draco / Meshopt 解码器都要注册）；
 * - mesh 数、primitive 数必须与输入一致；
 * - 场景级世界坐标包围盒（含节点变换）每轴误差 <= max(1e-3, 包围盒边长 * 0.002)：
 *   Draco 14bit 位置量化的误差上限约为边长 / 2^14 ≈ 6e-5 倍，0.2% 留了足够余量，
 *   同时能挡住「变换丢了 / 单位错了」这类真问题。
 *
 * KTX2 纹理压缩不在本脚本内
 * -------------------------
 * 现有依赖 @gltf-transform/functions 4.5.1 的 textureCompress 只支持 jpeg/png/webp/avif，
 * 不含 KTX2；KTX2 编码需要外部 KTX-Software（toktx）或 basisu。本脚本不新增第三方依赖，
 * 因此 --ktx2 只做前置检查：找不到工具就打印安装/执行步骤并退出（exit 2），不会写坏资产。
 * 几何压缩（Draco 默认 / --codec meshopt）是纯 JS 依赖，本机可直接跑。
 *
 * 用法
 * ----
 *   node ops/scripts/optimize-glb-assets.mjs                          # dry-run 统计
 *   node ops/scripts/optimize-glb-assets.mjs --write --out /tmp/glb-opt
 *   node ops/scripts/optimize-glb-assets.mjs --verify --out /tmp/glb-opt
 *   node ops/scripts/optimize-glb-assets.mjs --write --out /tmp/glb-opt --codec meshopt
 *   node ops/scripts/optimize-glb-assets.mjs --include-full --limit 5 --filter 床 --verbose
 *
 * 退出码：0 = 正常 / 校验通过；1 = 有文件压缩或校验失败；2 = 参数或前置条件不满足。
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 默认资产目录：3D Studio 的 GLB 模型库（目录名是中文分类，靠 readdir 递推，不做硬编码）。 */
const DEFAULT_SOURCE_DIR = join(REPO_ROOT, 'homeos/frontend/public/static/3d-studio/models')

/** 已压缩扩展名白名单：用于「为什么跳过」可查。 */
const GLB_EXT = '.glb'

const DEFAULT_CODEC = 'draco'
const CODECS = new Set(['draco', 'meshopt'])

/** 包围盒校验容差：绝对 1e-3，或边长 0.2%（Draco 14bit 量化误差约 6e-5 倍边长）。 */
const BBOX_ABS_TOLERANCE = 1e-3
const BBOX_REL_TOLERANCE = 0.002

const args = process.argv.slice(2)
const options = {
  source: DEFAULT_SOURCE_DIR,
  out: '',
  write: false,
  verify: false,
  codec: DEFAULT_CODEC,
  ktx2: false,
  force: false,
  includeFull: false,
  limit: 0,
  filter: '',
  verbose: false,
  help: false,
}

function fail(message, code = 2) {
  console.error('[glb-opt] ' + message)
  process.exit(code)
}

function parseArgs(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true
        break
      case '--write':
        options.write = true
        break
      case '--verify':
        options.verify = true
        break
      case '--ktx2':
        options.ktx2 = true
        break
      case '--force':
        options.force = true
        break
      case '--include-full':
        options.includeFull = true
        break
      case '--verbose':
        options.verbose = true
        break
      case '--source':
      case '--out':
      case '--codec':
      case '--limit':
      case '--filter': {
        const value = argv[++i]
        if (!value) fail('参数 ' + arg + ' 缺少取值')
        if (arg === '--source') options.source = value
        else if (arg === '--out') options.out = value
        else if (arg === '--codec') options.codec = value
        else if (arg === '--limit') options.limit = Number.parseInt(value, 10)
        else options.filter = value
        break
      }
      default:
        fail('未知参数：' + arg + '（--help 查看用法）')
    }
  }
  if (options.help) return
  if (!CODECS.has(options.codec)) fail('--codec 只支持 draco / meshopt，收到：' + options.codec)
  if (!Number.isFinite(options.limit) || options.limit < 0) fail('--limit 必须是 >= 0 的整数')
  if (options.write && options.verify) fail('--write 与 --verify 不能同时使用：先压缩，再单独校验')
  if ((options.write || options.verify) && !options.out) fail('--write / --verify 必须同时给 --out 目录')
  if (options.write && isInside(resolve(options.source), resolve(options.out))) {
    fail('--out 不能指向 --source 内部：本脚本坚持「输出到另一个目录」，绝不原地改写资产')
  }
  if (resolve(options.source) === resolve(options.out)) fail('--out 不能等于 --source')
}

const HELP = `GLB 资产几何压缩（B17）

用法：
  node ops/scripts/optimize-glb-assets.mjs [选项]

选项：
  --source <dir>   资产源目录（默认 homeos/frontend/public/static/3d-studio/models）
  --out <dir>      --write / --verify 的输出目录（必须与源目录不同）
  --write          压缩到 --out（保持相对路径；默认 dry-run 不写盘）
  --verify         校验 --out 里每个输出与源文件：可解码、mesh/primitive 数、世界包围盒
  --codec <name>   几何编码：draco（默认）或 meshopt
  --force          连已压缩过的 GLB 也重新压（默认跳过已有 KHR_draco / EXT_meshopt 的文件）
  --include-full   也压缩完整件（默认只压 -lite.glb；压缩完整件会让 check:assets 判红）
  --limit <n>      只处理前 n 个候选（压测 / 抽样）
  --filter <s>     只处理相对路径包含该子串的文件（大小写不敏感）
  --ktx2           KTX2 纹理压缩前置检查（需要外部 toktx / basisu；本机无工具会直接报步骤）
  --verbose        每处理一个文件打印一行
  --help           打印本帮助

执行步骤（建议顺序）：
  1) node ops/scripts/optimize-glb-assets.mjs                     # 先看统计
  2) node ops/scripts/optimize-glb-assets.mjs --write --out /tmp/glb-opt
  3) node ops/scripts/optimize-glb-assets.mjs --verify --out /tmp/glb-opt
  4) 人工抽查 /tmp/glb-opt 后，按 manifest 替换 public 资产；原 GLB 保留一份用于回滚

注意：本仓库的运行时入口已经全部指向 -lite.glb。完整件是导出/再编辑用的原网格，
check:assets 会拒绝 Draco 过的完整件；--include-full 只用于一次性诊断，不要发布。
`

function isInside(parent, child) {
  const rel = relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/** 运行时首选变体：`<名>-lite.glb`。完整件（没有 -lite 后缀）默认不压。 */
function isLiteGlb(file) {
  return /-lite\.glb$/i.test(file)
}

function walkGlb(dir) {
  const files = []
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile() && extname(entry.name).toLowerCase() === GLB_EXT) files.push(full)
    }
  }
  files.sort()
  return files
}

function matchesFilter(file, sourceDir) {
  if (!options.filter) return true
  return relative(sourceDir, file).toLowerCase().includes(options.filter.toLowerCase())
}

function applyLimit(files) {
  if (!options.limit || files.length <= options.limit) return files
  return files.slice(0, options.limit)
}

// ---------- GLB 头解析（dry-run 只依赖它，不加载 gltf-transform） ----------

const GLB_MAGIC = 0x46546c67 // 'glTF'
const GLB_CHUNK_JSON = 0x4e4f534a

function readGlbJson(file) {
  const buffer = readFileSync(file)
  if (buffer.length < 20) throw new Error('文件小于 20 字节，不是合法 GLB')
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('magic 不是 glTF')
  if (buffer.readUInt32LE(4) !== 2) throw new Error('只支持 GLB v2，实际版本 ' + buffer.readUInt32LE(4))
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset)
    const chunkType = buffer.readUInt32LE(offset + 4)
    offset += 8
    if (offset + chunkLength > buffer.length) throw new Error('chunk 长度越界')
    if (chunkType === GLB_CHUNK_JSON) {
      const text = buffer.toString('utf8', offset, offset + chunkLength).trim()
      return JSON.parse(text)
    }
    offset += chunkLength + ((4 - (chunkLength % 4)) % 4)
  }
  throw new Error('找不到 JSON chunk')
}

function inspectGlb(file) {
  const json = readGlbJson(file)
  const extensionsUsed = new Set(json.extensionsUsed || [])
  const imageMimeTypes = (json.images || []).map((image) => image.mimeType || '')
  let primitives = 0
  for (const mesh of json.meshes || []) primitives += (mesh.primitives || []).length
  return {
    file,
    size: statSync(file).size,
    hasDraco: extensionsUsed.has('KHR_draco_mesh_compression'),
    hasMeshopt: extensionsUsed.has('EXT_meshopt_compression'),
    hasKtx2: extensionsUsed.has('KHR_texture_basisu'),
    imageMimeTypes,
    meshes: (json.meshes || []).length,
    primitives,
  }
}

function isCompressed(info) {
  return info.hasDraco || info.hasMeshopt
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / 1024 / 1024).toFixed(2) + 'MB'
}

// ---------- KTX2 前置检查（不新增依赖，只给步骤） ----------

function hasCommand(name) {
  const result = spawnSync('sh', ['-c', 'command -v ' + name], { encoding: 'utf8' })
  return result.status === 0 && result.stdout.trim().length > 0
}

function preflightKtx2() {
  const tools = ['toktx', 'basisu', 'gltf-transform'].filter((name) => hasCommand(name))
  if (tools.length >= 2 || tools.includes('gltf-transform')) {
    // 即使检测到工具，本脚本也不内置 KTX2 编码（需要 CLI 的 etc1s/uastc 命令与纹理回填），
    // 交回给操作者按下面步骤执行，避免「脚本可用但结果不可复核」。
    console.log('[glb-opt] --ktx2：检测到外部工具 ' + tools.join(', ') + '，但本脚本未内置 KTX2 编码流程。')
  } else {
    console.log('[glb-opt] --ktx2：未找到 KTX-Software（toktx）/ basisu / gltf-transform CLI。')
  }
  console.log('[glb-opt] KTX2 纹理压缩不在本脚本内：现有 @gltf-transform/functions 4.5.1 的 textureCompress')
  console.log('[glb-opt] 只支持 jpeg/png/webp/avif，KTX2 编码需要外部 KTX-Software。可选执行步骤：')
  console.log(
    '[glb-opt]   1) 安装 KTX-Software（https://github.com/KhronosGroup/KTX-Software/releases），把 toktx 放进 PATH；',
  )
  console.log('[glb-opt]   2) 安装 gltf-transform CLI：bun add -d @gltf-transform/cli')
  console.log('[glb-opt]   3) 逐个处理：gltf-transform etc1s <in.glb> <out.glb>（或 uastc 走高质量模式）')
  console.log('[glb-opt]   4) 再用本脚本 --write 做几何压缩，最后 --verify 回读校验。')
  console.log('[glb-opt] 本次不写任何资产。几何压缩（默认 Draco）可直接跑，不影响下面的统计。')
}

// ---------- 压缩 / 校验（write、verify 才加载 gltf-transform） ----------

async function loadPipeline() {
  let core
  let extensions
  let functions
  let draco3d
  let meshoptimizer
  try {
    core = await import('@gltf-transform/core')
    extensions = await import('@gltf-transform/extensions')
    functions = await import('@gltf-transform/functions')
    draco3d = (await import('draco3dgltf')).default
    meshoptimizer = await import('meshoptimizer')
  } catch (error) {
    fail('缺少 gltf-transform 依赖（应在根 package.json devDependencies 中）：' + error.message)
  }
  const { MeshoptDecoder, MeshoptEncoder } = meshoptimizer
  await MeshoptDecoder.ready
  await MeshoptEncoder.ready
  const io = new core.NodeIO().registerExtensions(extensions.ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
  io.setLogger(new core.Logger(core.Verbosity.ERROR))
  return { core, functions, io, MeshoptEncoder }
}

function sceneBounds(core, doc) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const scene of doc.getRoot().listScenes()) {
    for (const node of scene.listChildren()) {
      const bounds = core.getBounds(node)
      if (!bounds.min.every(Number.isFinite)) continue
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], bounds.min[i])
        max[i] = Math.max(max[i], bounds.max[i])
      }
    }
  }
  return { min, max, valid: min.every(Number.isFinite) }
}

function docStats(doc) {
  const root = doc.getRoot()
  let primitives = 0
  for (const mesh of root.listMeshes()) primitives += mesh.listPrimitives().length
  const used = root.listExtensionsUsed().map((extension) => extension.extensionName)
  return { meshes: root.listMeshes().length, primitives, used }
}

function bboxWithinTolerance(before, after) {
  if (!before.valid || !after.valid) return { ok: false, reason: '包围盒无效' }
  const details = []
  for (let i = 0; i < 3; i++) {
    const extent = Math.max(before.max[i] - before.min[i], after.max[i] - after.min[i], 1e-6)
    const allow = Math.max(BBOX_ABS_TOLERANCE, extent * BBOX_REL_TOLERANCE)
    const delta = Math.max(Math.abs(before.min[i] - after.min[i]), Math.abs(before.max[i] - after.max[i]))
    details.push({ axis: i, delta, allow })
    if (delta > allow)
      return {
        ok: false,
        reason: '第 ' + i + ' 轴包围盒偏移 ' + delta.toExponential(2) + ' > ' + allow.toExponential(2),
      }
  }
  return { ok: true, details }
}

function verifyDocument(core, doc, expected, beforeBounds) {
  const stats = docStats(doc)
  if (stats.meshes !== expected.meshes) return 'mesh 数变化：' + expected.meshes + ' -> ' + stats.meshes
  if (stats.primitives !== expected.primitives)
    return 'primitive 数变化：' + expected.primitives + ' -> ' + stats.primitives
  const afterBounds = sceneBounds(core, doc)
  const bbox = bboxWithinTolerance(beforeBounds, afterBounds)
  if (!bbox.ok) return '包围盒校验失败：' + bbox.reason
  return ''
}

async function runWrite(pipeline) {
  const { core, io } = pipeline
  const sourceDir = resolve(options.source)
  const outDir = resolve(options.out)
  mkdirSync(outDir, { recursive: true })
  const files = applyLimit(walkGlb(sourceDir).filter((file) => matchesFilter(file, sourceDir)))
  const summary = {
    scanned: files.length,
    improved: 0,
    unchanged: 0,
    skipped: 0,
    fullSkipped: 0,
    copied: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
  }
  const failures = []
  const improvements = []

  for (const file of files) {
    const rel = relative(sourceDir, file)
    const dest = join(outDir, rel)
    let info
    try {
      info = inspectGlb(file)
    } catch (error) {
      failures.push({ file: rel, error: '解析 GLB 失败：' + error.message })
      summary.failed++
      continue
    }
    if (!options.includeFull && !isLiteGlb(file)) {
      // 完整件是导出/再编辑用的原网格，check:assets 禁止 Draco；默认只拷贝，保证输出目录完整。
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(file, dest)
      summary.fullSkipped++
      summary.copied++
      continue
    }
    if (!options.force && isCompressed(info)) {
      // 已压缩的文件也原样拷贝一份，保证输出目录是「完整可替换的资产集」，
      // 否则 --verify 会把它当成漏产出（复制所有已压缩 lite 的成本远小于误判成本）。
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(file, dest)
      summary.skipped++
      summary.copied++
      continue
    }
    summary.bytesBefore += info.size
    mkdirSync(dirname(dest), { recursive: true })
    const temp = dest + '.tmp.glb'
    try {
      const doc = await io.read(file)
      const beforeStats = docStats(doc)
      const beforeBounds = sceneBounds(core, doc)
      await doc.transform(
        pipeline.functions.prune(),
        options.codec === 'draco'
          ? pipeline.functions.draco()
          : pipeline.functions.meshopt({ encoder: pipeline.MeshoptEncoder, level: 'high' }),
      )
      await io.write(temp, doc)
      const outSize = statSync(temp).size
      const back = await io.read(temp)
      const verifyError = verifyDocument(core, back, beforeStats, beforeBounds)
      if (verifyError) throw new Error(verifyError)
      const expectedExtension = options.codec === 'draco' ? 'KHR_draco_mesh_compression' : 'EXT_meshopt_compression'
      const backStats = docStats(back)
      if (!backStats.used.includes(expectedExtension)) throw new Error('输出缺少 ' + expectedExtension + ' 扩展')

      if (outSize < info.size) {
        renameSync(temp, dest)
        summary.improved++
        summary.bytesAfter += outSize
        improvements.push({ file: rel, before: info.size, after: outSize })
        if (options.verbose)
          console.log('[glb-opt] 压缩 ' + rel + '：' + formatBytes(info.size) + ' -> ' + formatBytes(outSize))
      } else {
        // 压不小就退回原文件，保证输出目录是一份完整、等价的资产集（而不是缺文件）。
        unlinkSync(temp)
        copyFileSync(file, dest)
        summary.unchanged++
        summary.copied++
        summary.bytesAfter += info.size
        if (options.verbose)
          console.log('[glb-opt] 保留原样 ' + rel + '：压缩后反而更大（' + formatBytes(outSize) + '）')
      }
    } catch (error) {
      if (existsSync(temp)) unlinkSync(temp)
      failures.push({ file: rel, error: error.message })
      summary.failed++
    }
  }

  console.log('')
  console.log('[glb-opt] 压缩完成（codec=' + options.codec + '）：')
  console.log(
    '[glb-opt]   扫描 ' +
      summary.scanned +
      ' 个 GLB，完整件原样拷贝 ' +
      summary.fullSkipped +
      ' 个，已压缩 lite 跳过 ' +
      summary.skipped +
      ' 个（均原样拷贝，保持输出目录完整）',
  )
  console.log(
    '[glb-opt]   体积变小 ' +
      summary.improved +
      ' 个，压不小保留原样 ' +
      summary.unchanged +
      ' 个，失败 ' +
      summary.failed +
      ' 个',
  )
  if (summary.improved > 0 || summary.unchanged > 0) {
    console.log(
      '[glb-opt]   候选总体积 ' +
        formatBytes(summary.bytesBefore) +
        ' -> ' +
        formatBytes(summary.bytesAfter) +
        '（压缩比 ' +
        ratio(summary.bytesBefore, summary.bytesAfter) +
        '）',
    )
  } else {
    console.log('[glb-opt]   没有需要压缩的候选（lite 均已 Draco；完整件受 check:assets 保护）')
  }
  printImprovements(improvements)
  if (failures.length > 0) {
    console.error('[glb-opt] 失败明细：')
    for (const failure of failures) console.error('[glb-opt]   ' + failure.file + '：' + failure.error)
    console.error('[glb-opt] 有 ' + failures.length + ' 个文件未产出，修好后重跑本命令。')
    return 1
  }
  console.log('[glb-opt] 输出目录：' + outDir + '（原资产未改动；确认无误后再按目录替换 public 资产并保留回滚副本）')
  return 0
}

function ratio(before, after) {
  if (before === 0) return 'n/a'
  return (after / before).toFixed(3) + 'x'
}

function printImprovements(improvements) {
  if (improvements.length === 0) return
  const sorted = [...improvements].sort((a, b) => b.before - b.after - (a.before - a.after)).slice(0, 10)
  console.log('[glb-opt]   节省最多的 ' + sorted.length + ' 个文件：')
  for (const item of sorted) {
    const saved = item.before - item.after
    console.log(
      '[glb-opt]     ' +
        item.file +
        '：' +
        formatBytes(item.before) +
        ' -> ' +
        formatBytes(item.after) +
        '（- ' +
        formatBytes(saved) +
        '）',
    )
  }
}

async function runVerify(pipeline) {
  const { core, io } = pipeline
  const sourceDir = resolve(options.source)
  const outDir = resolve(options.out)
  const files = applyLimit(walkGlb(sourceDir).filter((file) => matchesFilter(file, sourceDir)))
  const failures = []
  let checked = 0
  for (const file of files) {
    const rel = relative(sourceDir, file)
    const dest = join(outDir, rel)
    checked++
    if (!existsSync(dest)) {
      failures.push({ file: rel, error: '输出目录缺少该文件' })
      continue
    }
    try {
      const sourceDoc = await io.read(file)
      const sourceStats = docStats(sourceDoc)
      const sourceBounds = sceneBounds(core, sourceDoc)
      const outDoc = await io.read(dest)
      const verifyError = verifyDocument(core, outDoc, sourceStats, sourceBounds)
      if (verifyError) throw new Error(verifyError)
      if (!isLiteGlb(file)) {
        const outInfo = inspectGlb(dest)
        if (isCompressed(outInfo) && !isCompressed(inspectGlb(file))) {
          throw new Error('完整件被几何压缩（check:assets 会判红）；只允许压缩 -lite.glb')
        }
      }
      if (statSync(dest).size > statSync(file).size && !options.force) {
        failures.push({
          file: rel,
          error:
            '输出比源文件更大（' + formatBytes(statSync(file).size) + ' -> ' + formatBytes(statSync(dest).size) + '）',
        })
      }
      if (options.verbose) console.log('[glb-opt] 校验通过 ' + rel)
    } catch (error) {
      failures.push({ file: rel, error: error.message })
    }
  }
  console.log('')
  console.log('[glb-opt] 校验完成：检查 ' + checked + ' 个文件，失败 ' + failures.length + ' 个')
  if (failures.length > 0) {
    for (const failure of failures) console.error('[glb-opt]   ' + failure.file + '：' + failure.error)
    return 1
  }
  console.log('[glb-opt] 全部输出可解码、mesh/primitive 数一致、世界包围盒在量化容差内。')
  return 0
}

// ---------- dry-run 统计 ----------

function runDryRun() {
  const sourceDir = resolve(options.source)
  if (!existsSync(sourceDir)) fail('资产目录不存在：' + sourceDir)
  const allFiles = walkGlb(sourceDir)
  const files = applyLimit(allFiles.filter((file) => matchesFilter(file, sourceDir)))
  const stats = {
    total: 0,
    bytes: 0,
    lite: 0,
    liteBytes: 0,
    full: 0,
    fullBytes: 0,
    liteUncompressed: 0,
    liteUncompressedBytes: 0,
    fullUncompressed: 0,
    fullUncompressedBytes: 0,
    broken: 0,
  }
  const largest = []
  for (const file of files) {
    try {
      const info = inspectGlb(file)
      stats.total++
      stats.bytes += info.size
      const lite = isLiteGlb(file)
      if (lite) {
        stats.lite++
        stats.liteBytes += info.size
      } else {
        stats.full++
        stats.fullBytes += info.size
      }
      if (!isCompressed(info)) {
        if (lite) {
          stats.liteUncompressed++
          stats.liteUncompressedBytes += info.size
          largest.push(info)
        } else {
          stats.fullUncompressed++
          stats.fullUncompressedBytes += info.size
        }
      }
    } catch (error) {
      stats.broken++
      console.error('[glb-opt] 解析失败 ' + relative(sourceDir, file) + '：' + error.message)
    }
  }
  largest.sort((a, b) => b.size - a.size)
  console.log('[glb-opt] 资产目录：' + sourceDir)
  console.log(
    '[glb-opt] 共 ' +
      stats.total +
      ' 个 GLB，' +
      formatBytes(stats.bytes) +
      '（扫描子集：' +
      files.length +
      ' / 全部 ' +
      allFiles.length +
      '）',
  )
  console.log(
    '[glb-opt] lite ' +
      stats.lite +
      ' 个（' +
      formatBytes(stats.liteBytes) +
      '）；完整件 ' +
      stats.full +
      ' 个（' +
      formatBytes(stats.fullBytes) +
      '，默认原样拷贝）',
  )
  console.log(
    '[glb-opt] lite 未压缩候选 ' +
      stats.liteUncompressed +
      ' 个，' +
      formatBytes(stats.liteUncompressedBytes) +
      '；完整件未压缩 ' +
      stats.fullUncompressed +
      ' 个，' +
      formatBytes(stats.fullUncompressedBytes) +
      '（受 check:assets 保护，不压）',
  )
  if (options.includeFull) {
    console.log('[glb-opt] 警告：已启用 --include-full；压缩完整件会让 check:assets 判红，只用于一次性诊断。')
  }
  if (largest.length > 0) {
    console.log('[glb-opt] 最大的 5 个 lite 候选：')
    for (const info of largest.slice(0, 5)) {
      console.log(
        '[glb-opt]   ' +
          relative(sourceDir, info.file) +
          '：' +
          formatBytes(info.size) +
          '（' +
          info.meshes +
          ' mesh / ' +
          info.primitives +
          ' primitive）',
      )
    }
  }
  console.log('[glb-opt] 提示：本命令不写盘。真正压缩：--write --out <新目录>；二次校验：--verify --out <新目录>。')
  console.log('[glb-opt] 用 --ktx2 可查看 KTX2 纹理压缩的前置工具要求（本脚本不内置 KTX2 编码）。')
  return stats.broken > 0 ? 1 : 0
}

async function main() {
  parseArgs(args)
  if (options.help) {
    console.log(HELP)
    return 0
  }
  if (options.ktx2) preflightKtx2()
  if (options.write || options.verify) {
    if (!existsSync(resolve(options.source))) fail('资产目录不存在：' + resolve(options.source))
    const pipeline = await loadPipeline()
    return options.write ? runWrite(pipeline) : runVerify(pipeline)
  }
  return runDryRun()
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('[glb-opt] 未预期错误：' + (error && error.stack ? error.stack : error))
    process.exit(1)
  })
