#!/usr/bin/env bun
/**
 * 生成随镜像出货的 three 运行时副本：`public/static/vendor/three/<版本>/`。
 *
 * 为什么需要本脚本
 * ----------------
 * 主应用的 3D Studio 不把 `three` 打进 bundle：`vite-studio.ts` 的 `isRuntimeExternal`
 * 把 `three` 与 `/static/vendor/**` 一律外置，浏览器直接按根绝对 URL 加载这份副本，
 * 而 npm 的 `three` 只用于 `typeof import("three")` 这类**类型位**。
 *
 * 于是「npm 装的 three 版本」与「真正出货的运行时副本」是两条独立的线。此前副本是手工
 * 拷进去的（附带手改 import 说明符），结果 npm 升到 0.186.1 之后副本还停在 0.186.0：
 * 类型检查按 0.186.1 解析，浏览器跑 0.186.0 —— 用上 0.186.1 新增 API 时表现为
 * 「tsc 通过、运行期 undefined」，且没有任何门禁能发现。本脚本把这一步变成可重复的
 * 单向生成：**版本真源是 `node_modules/three/package.json`**，不再手抄。
 *
 * 产物结构（被 tsconfig 的 `paths`、源码 import 与 CI 断言三处引用，改版本时四处一起走）：
 *
 *   public/static/vendor/three/<版本>/
 *     three.module.min.js        ← node_modules/three/build/three.module.js（esbuild 压缩）
 *     three.core.min.js          ← node_modules/three/build/three.core.js（esbuild 压缩）
 *     OrbitControls.js           ← examples/jsm/controls/OrbitControls.js
 *     RoundedBoxGeometry.js      ← examples/jsm/geometries/RoundedBoxGeometry.js
 *     BufferGeometryUtils.js     ← examples/jsm/utils/BufferGeometryUtils.js
 *     SkeletonUtils.js           ← examples/jsm/utils/SkeletonUtils.js（GLTFLoader 依赖）
 *     GLTFLoader.js              ← examples/jsm/loaders/GLTFLoader.js
 *     DRACOLoader.js             ← examples/jsm/loaders/DRACOLoader.js
 *     GLTFExporter.js            ← examples/jsm/exporters/GLTFExporter.js
 *     LICENSE                    ← node_modules/three/LICENSE
 *     draco/{LICENSE,draco_decoder.js,draco_decoder.wasm,draco_wasm_wrapper.js}
 *
 * addon 为什么不必压缩、只改说明符
 * --------------------------------
 * three 的 addon 是 ESM 源码，浏览器直接吃；压缩收益有限，而「改说明符」才是必需项：
 * 上游写的是裸包名 `from 'three'`，浏览器解析不了（副本里没有 import map），必须改成同
 * 目录的相对路径 `./three.module.min.js`。GLTFLoader 额外跨目录引用两个 utils，同样拍平到
 * 同级。
 *
 * draco 的 Apache-2.0 LICENSE 为什么在仓库里另存一份
 * -------------------------------------------------
 * three 的 npm 包里 `examples/jsm/libs/draco/` 只有 `README.md` 与 `gltf/` 二进制，
 * 没有 LICENSE（上游仓库里才有）。为了避免构建期联网取许可证，这里把它作为第三方许可
 * 文本随仓库保存（`scripts/three-vendor/draco-LICENSE.txt`），版本升级时不需要变动。
 *
 * 两份 LICENSE 不是重复文件，**别删任何一份**：
 *   - `scripts/three-vendor/draco-LICENSE.txt` 是**源**（唯一手写来源，版本升级时不动）；
 *   - `public/static/vendor/three/<ver>/draco/LICENSE` 是**产物**（本脚本从源拷贝），
 *     必须随 `.js`/`.wasm` 一起分发 —— Apache-2.0 要求分发二进制时附带许可证。
 * 两者字节相同是设计结果，`--check` 会校验这份拷贝没有被改坏。
 *
 * 用法：
 *   bun run --cwd homeos/frontend sync:three            # 按 node_modules 的版本重新生成
 *   bun run --cwd homeos/frontend sync:three --check    # 只校验，不写盘（CI 用）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** 前端根（homeos/frontend）。 */
const frontendRoot = path.resolve(__dirname, '..')
/** 工作区根。 */
const repoRoot = path.resolve(frontendRoot, '../..')
const nodeModulesThree = path.join(repoRoot, 'node_modules', 'three')
const vendorRoot = path.join(frontendRoot, 'public', 'static', 'vendor', 'three')
/** 版本字面量出现在这些形态里：`/static/vendor/three/<版本>/`；codemod 只认这个前缀。 */
const VENDOR_URL_PREFIX = '/static/vendor/three/'

const checkOnly = process.argv.includes('--check')

/**
 * addon 清单：`[产物名, 源相对 examples/jsm 的路径]`。
 *
 * 与 tsconfig 的 `paths`、`vendor-three-addons.ts` 的声明面一一对应；新增 addon 时三处
 * 一起改（本脚本只负责落盘，不碰类型声明）。
 */
const ADDONS = [
  ['OrbitControls.js', 'controls/OrbitControls.js'],
  ['RoundedBoxGeometry.js', 'geometries/RoundedBoxGeometry.js'],
  ['BufferGeometryUtils.js', 'utils/BufferGeometryUtils.js'],
  // GLTFLoader 内部 `import ... from '../utils/SkeletonUtils.js'`，必须一起带上。
  ['SkeletonUtils.js', 'utils/SkeletonUtils.js'],
  ['GLTFLoader.js', 'loaders/GLTFLoader.js'],
  ['DRACOLoader.js', 'loaders/DRACOLoader.js'],
  ['GLTFExporter.js', 'exporters/GLTFExporter.js'],
]

function fail(message) {
  console.error(`[three-vendor] ${message}`)
  process.exit(1)
}

function readThreeVersion() {
  const manifest = path.join(nodeModulesThree, 'package.json')
  if (!fs.existsSync(manifest)) {
    fail(`找不到 ${path.relative(repoRoot, manifest)}：请先在仓库根执行 bun install。`)
  }
  const { version } = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  if (typeof version !== 'string' || !version.trim()) {
    fail(`${path.relative(repoRoot, manifest)} 缺少 version 字段。`)
  }
  return version.trim()
}

/* ------------------------------------------------------------------ *
 * 代码库里的版本字面量 codemod
 * ------------------------------------------------------------------ */

/** 不参与扫描的目录：构建产物、依赖、图谱缓存与本地 venv。 */
const SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  '.graphflow',
  '.venv',
  '.venv-store',
  '.pnpm-store',
  'build',
])
/** 只扫这些后缀：版本字面量只可能出现在源码 / 配置 / 构建脚本里。 */
const SCAN_SUFFIXES = new Set(['.ts', '.tsx', '.vue', '.js', '.mjs', '.json', '.sh', '.css', '.html'])

function* walkFiles(root) {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIR_NAMES.has(entry.name)) stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!SCAN_SUFFIXES.has(path.extname(entry.name))) continue
      yield full
    }
  }
}

/**
 * `/static/vendor/three/<版本>/` 的匹配式。
 *
 * 版本段限定成「数字.数字.数字 + 可选后缀」而不是任意非斜杠字符：脚本文档与注释里写着
 * `/static/vendor/three/<版本>/` 这种占位写法，若不限定就会把占位符当成真版本号改掉。
 */
const VENDOR_URL_PATTERN = `${VENDOR_URL_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+\\.\\d+\\.\\d+[^/"'\`]*)`

/**
 * 把代码库里所有 `/static/vendor/three/<旧版本>/` 改成新版本。
 *
 * 为什么要扫全仓而不是写死文件清单：引用点分布在源码 import、tsconfig 的 `paths`、
 * vite 插件常量与 CI 的产物断言里（当前 27 个文件、52 处），手写清单下次升级必漏，
 * 而漏掉的那种最坏是「tsconfig 指旧路径 → 类型解析失败」或「CI 断言查已删的旧目录
 * → 构建绿灯但其实副本没换」。
 *
 * 只替换 URL 前缀紧邻的那一段版本号，不动 `three` 的 npm 依赖版本（`package.json`
 * 的 `"three": "0.186.1"` 没有这个前缀，自然不受影响）。
 */
function syncVersionLiterals(version) {
  const pattern = new RegExp(VENDOR_URL_PATTERN, 'g')
  const changed = []
  for (const file of walkFiles(repoRoot)) {
    // 生成目标本身不参与（它是本次要覆盖的产物，且位于 vendorRoot 下）。
    if (file.startsWith(vendorRoot + path.sep)) continue
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (!text.includes(VENDOR_URL_PREFIX)) continue
    let hits = 0
    const next = text.replace(pattern, (match, segment) => {
      if (segment === version) return match
      hits += 1
      return match.replace(segment, version)
    })
    if (hits === 0) continue
    changed.push([path.relative(repoRoot, file), hits])
    if (!checkOnly) fs.writeFileSync(file, next, 'utf8')
  }
  return changed
}

/** 代码库里是否仍存在指向**其他**版本的 `/static/vendor/three/<别的版本>/` 引用。 */
function staleVersionLiterals(version) {
  const pattern = new RegExp(VENDOR_URL_PATTERN, 'g')
  const stale = new Map()
  for (const file of walkFiles(repoRoot)) {
    if (file.startsWith(vendorRoot + path.sep)) continue
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const match of text.matchAll(pattern)) {
      if (match[1] === version) continue
      const rel = path.relative(repoRoot, file)
      stale.set(rel, (stale.get(rel) ?? 0) + 1)
    }
  }
  return stale
}

/* ------------------------------------------------------------------ *
 * 产物生成
 * ------------------------------------------------------------------ */

/** 用 esbuild 压一个 three 的 build 产物，返回文本（不写盘，由调用方决定写还是比对）。 */
async function minifyThreeBuild(source) {
  const entry = path.join(nodeModulesThree, 'build', source)
  if (!fs.existsSync(entry)) fail(`缺少 ${path.relative(repoRoot, entry)}。`)
  const result = await build({
    entryPoints: [entry],
    bundle: false,
    write: false,
    minify: true,
    format: 'esm',
    // esnext：不做降级转换，语义与上游逐字一致（只去空白/注释、缩短局部名）。
    target: 'esnext',
  })
  if (result.errors.length > 0) fail(`${source} 压缩失败：${result.errors[0]?.text ?? '未知错误'}`)
  return result.outputFiles[0].text
}

/** 校验或写入单个产物文件；`checkOnly` 时只比对而不落盘。 */
function emit(targetDir, name, text) {
  const target = path.join(targetDir, name)
  if (checkOnly) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
    if (current !== text) {
      fail(`${name} 与 node_modules/three 不一致：请重跑 bun run --cwd homeos/frontend sync:three。`)
    }
    return
  }
  fs.writeFileSync(target, text, 'utf8')
}

/** 压缩 `node_modules/three/build/*.js` 到目标目录，并改写 core 的说明符。 */
async function writeMinifiedBundles(targetDir) {
  emit(targetDir, 'three.core.min.js', await minifyThreeBuild('three.core.js'))

  // three.module.js 引用的是 `./three.core.js`，而副本里那个文件叫 `three.core.min.js`：
  // 不改这一行浏览器就 404，且报错出现在运行时而不是构建期。
  const rewritten = (await minifyThreeBuild('three.module.js')).replace(
    /(["'])\.\/three\.core\.js\1/g,
    '$1./three.core.min.js$1',
  )
  if (!rewritten.includes('./three.core.min.js')) {
    fail('three.module.min.js 里没有出现 ./three.core.min.js：上游的 import 形态变了，请检查本脚本的改写规则。')
  }
  emit(targetDir, 'three.module.min.js', rewritten)
}

/** addon 的说明符改写：裸包名 → 同级相对路径；跨目录 utils → 拍平到同级。 */
function rewriteAddonSpecifiers(source) {
  return source
    .replace(/(["'])three\1/g, '"./three.module.min.js"')
    .replace(/(["'])\.\.\/utils\/([A-Za-z0-9_]+\.js)\1/g, '"./$2"')
    .replace(/(["'])\.\.\/geometries\/([A-Za-z0-9_]+\.js)\1/g, '"./$2"')
    .replace(/(["'])\.\.\/controls\/([A-Za-z0-9_]+\.js)\1/g, '"./$2"')
}

function writeAddons(targetDir) {
  for (const [output, relative] of ADDONS) {
    const source = path.join(nodeModulesThree, 'examples', 'jsm', relative)
    if (!fs.existsSync(source)) fail(`缺少 addon：${path.relative(repoRoot, source)}。`)
    const rewritten = rewriteAddonSpecifiers(fs.readFileSync(source, 'utf8'))
    const target = path.join(targetDir, output)
    if (checkOnly) {
      const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
      if (current !== rewritten) {
        fail(`${output} 与 node_modules/three 不一致：请重跑 bun run --cwd homeos/frontend sync:three。`)
      }
      continue
    }
    fs.writeFileSync(target, rewritten, 'utf8')
  }
}

/** draco 解码器：三份二进制取自 `libs/draco/gltf/`（体积更小的 glTF 专用版），许可证随仓库。 */
function writeDraco(targetDir) {
  const dracoTarget = path.join(targetDir, 'draco')
  const gltfDir = path.join(nodeModulesThree, 'examples', 'jsm', 'libs', 'draco', 'gltf')
  const files = ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js']
  const license = path.join(__dirname, 'three-vendor', 'draco-LICENSE.txt')
  if (!fs.existsSync(license)) fail(`缺少 ${path.relative(repoRoot, license)}。`)
  const results = []
  if (!checkOnly) fs.mkdirSync(dracoTarget, { recursive: true })
  for (const name of files) {
    const source = path.join(gltfDir, name)
    if (!fs.existsSync(source)) fail(`缺少 ${path.relative(repoRoot, source)}。`)
    results.push([name, fs.readFileSync(source)])
  }
  results.push(['LICENSE', fs.readFileSync(license)])
  for (const [name, content] of results) {
    const target = path.join(dracoTarget, name)
    if (checkOnly) {
      const current = fs.existsSync(target) ? fs.readFileSync(target) : null
      if (current === null || !current.equals(content)) {
        fail(`draco/${name} 与上游不一致：请重跑 bun run --cwd homeos/frontend sync:three。`)
      }
      continue
    }
    fs.writeFileSync(target, content)
  }
}

function writeThreeLicense(targetDir) {
  const source = path.join(nodeModulesThree, 'LICENSE')
  if (!fs.existsSync(source)) fail(`缺少 ${path.relative(repoRoot, source)}。`)
  const content = fs.readFileSync(source)
  const target = path.join(targetDir, 'LICENSE')
  if (checkOnly) {
    const current = fs.existsSync(target) ? fs.readFileSync(target) : null
    if (current === null || !current.equals(content)) {
      fail('LICENSE 与 node_modules/three 不一致：请重跑 bun run --cwd homeos/frontend sync:three。')
    }
    return
  }
  fs.writeFileSync(target, content)
}

function main() {
  const version = readThreeVersion()
  const targetDir = path.join(vendorRoot, version)
  console.log(`[three-vendor] three 版本真源：node_modules/three@${version}`)

  if (checkOnly) {
    if (!fs.existsSync(targetDir)) {
      fail(`缺少运行时副本 ${path.relative(repoRoot, targetDir)}：请执行 bun run --cwd homeos/frontend sync:three。`)
    }
    const stale = staleVersionLiterals(version)
    if (stale.size > 0) {
      const detail = [...stale].map(([file, count]) => `    ${file}（${count} 处）`).join('\n')
      fail(
        `以下文件仍引用 /static/vendor/three/ 下的其他版本（当前应为 ${version}）：\n${detail}\n` +
          '  请执行 bun run --cwd homeos/frontend sync:three 统一。',
      )
    }
  } else {
    // 先删整棵 vendor/three 再重建：旧版本目录与上游已删除的 addon 都会一并清掉，
    // 不会留下「上个版本的文件还在、被 URL 直接命中」的幽灵产物。
    fs.rmSync(vendorRoot, { recursive: true, force: true })
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const changed = syncVersionLiterals(version)
  if (changed.length > 0) {
    console.log(
      checkOnly
        ? `[three-vendor] 以下文件需要同步版本字面量（${changed.length} 个）`
        : `[three-vendor] 版本字面量已同步（${changed.length} 个文件）`,
    )
    for (const [file, count] of changed) console.log(`    ${file}（${count} 处）`)
    if (checkOnly) {
      fail('版本字面量未统一：请重跑 bun run --cwd homeos/frontend sync:three。')
    }
  }

  const run = async () => {
    await writeMinifiedBundles(targetDir)
    writeAddons(targetDir)
    writeDraco(targetDir)
    writeThreeLicense(targetDir)
  }
  return run().then(() => {
    console.log(
      checkOnly
        ? `[three-vendor] 校验通过：副本与 node_modules/three@${version} 一致。`
        : `[three-vendor] 已生成 ${path.relative(repoRoot, targetDir)}`,
    )
  })
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
