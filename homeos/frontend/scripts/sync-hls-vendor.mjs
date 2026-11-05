#!/usr/bin/env node
/**
 * 同步随镜像出货的 hls.js 运行时副本：public/static/vendor/hls.js/<版本>/。
 *
 * 为什么需要本脚本
 * ----------------
 * 主应用不把 hls.js 打进 bundle：camera 模块在首次需要 HLS 时才按根绝对 URL
 * /static/vendor/hls.js/<版本>/hls.min.js 注入 <script>（见 src/shared/camera/hls-loader.ts），
 * 而 npm 里的 hls.js 只用于类型位。于是「npm 装的 hls.js 版本」与「真正出货的运行时副本」
 * 是两条独立的线 —— 本次审计就是两条线漂了：vendor 停在 1.7.3，而 bun.lock 与
 * homeos/frontend/package.json 都是 1.7.4。这类漂移没有门禁时无人发现，也不会报错，
 * 只是浏览器一直在跑旧版本、享受不到新版本修复。
 *
 * 本脚本把这一步变成可重复的单向生成：**版本真源是 node_modules/hls.js/package.json**，
 * 不手抄版本号、不手工拷文件。hls-loader.ts 里的版本常量与 URL 由 --check 校验，一旦
 * 与 node_modules 不一致就失败。
 *
 * 产物结构（与 hls-loader.ts 的约定一一对应）：
 *
 *   public/static/vendor/hls.js/<版本>/
 *     hls.min.js   <- node_modules/hls.js/dist/hls.min.js
 *     LICENSE      <- node_modules/hls.js/LICENSE（Apache-2.0，分发时必须附带）
 *
 * 用法：
 *   bun run --cwd homeos/frontend sync:hls          # 按 node_modules 版本重新生成
 *   bun run --cwd homeos/frontend sync:hls --check  # 只校验，不写盘（CI / 门禁用）
 *   bun run --cwd homeos/frontend sync:hls --prune  # 生成后删掉其它版本的旧副本
 *
 * 退出码：0 成功（写模式允许源码版本常量尚未跟进，只告警）；1 校验失败 / 写盘失败；2 参数错误。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** 前端根（homeos/frontend）。 */
const frontendRoot = path.resolve(__dirname, '..')
/** 工作区根。 */
const repoRoot = path.resolve(frontendRoot, '../..')
const hlsPkgDir = path.join(repoRoot, 'node_modules', 'hls.js')
const frontendPkgPath = path.join(frontendRoot, 'package.json')
const vendorRoot = path.join(frontendRoot, 'public', 'static', 'vendor', 'hls.js')
/** 版本字面量只出现在这些形态里；codemod / 校验都只认这些前缀。 */
const VENDOR_URL_PREFIX = '/static/vendor/hls.js/'
const SRC_SCAN_DIR = path.join(frontendRoot, 'src')
const SRC_SCAN_SUFFIXES = ['.ts', '.tsx', '.js', '.mjs', '.vue']

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const prune = args.includes('--prune')
const help = args.includes('--help') || args.includes('-h')

/** hls.js 包内要出货的两个文件（顺序无关）。 */
const ARTIFACTS = [
  { name: 'hls.min.js', from: path.join(hlsPkgDir, 'dist', 'hls.min.js'), to: 'hls.min.js' },
  { name: 'LICENSE', from: path.join(hlsPkgDir, 'LICENSE'), to: 'LICENSE' },
]

function fail(message) {
  console.error('[hls-vendor] ' + message)
  process.exit(1)
}

function info(message) {
  console.log('[hls-vendor] ' + message)
}

function warn(message) {
  console.warn('[hls-vendor] 警告：' + message)
}

function printUsage() {
  console.log('用法：node scripts/sync-hls-vendor.mjs [--check] [--prune]')
  console.log('  --check  只校验 vendor 副本与源码版本常量，不写盘（CI 用）')
  console.log('  --prune  生成后删除其它版本的旧副本（默认保留，避免源码未跟进时断链）')
}

if (help) {
  printUsage()
  process.exit(0)
}
if (checkOnly && prune) {
  fail('--prune 不能与 --check 同时使用（校验模式不写盘）。')
}
const KNOWN = new Set(['--check', '--prune', '--help', '-h'])
for (const arg of args) {
  if (!KNOWN.has(arg)) {
    console.error('[hls-vendor] 未知参数：' + arg)
    printUsage()
    process.exit(2)
  }
}

function isVersion(text) {
  const parts = text.split('.')
  if (parts.length !== 3) return false
  return parts.every(function (part) {
    if (part.length === 0) return false
    for (const ch of part) {
      if (ch < '0' || ch > '9') return false
    }
    return true
  })
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function readPackageJson(file, label) {
  let parsed
  try {
    parsed = JSON.parse(readText(file))
  } catch (error) {
    fail('读不到 ' + label + '：' + file + '（' + error.message + '）')
  }
  return parsed
}

function fileBytesEqual(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return false
  const left = fs.readFileSync(a)
  const right = fs.readFileSync(b)
  return left.equals(right)
}

function walkSourceFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const found = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // 源码树里没有 node_modules / dist；保留这层过滤防止将来有人把生成物放进来。
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      found.push.apply(found, walkSourceFiles(full))
      continue
    }
    if (
      SRC_SCAN_SUFFIXES.some(function (suffix) {
        return entry.name.endsWith(suffix)
      })
    ) {
      found.push(full)
    }
  }
  return found
}

/** 收集源码里的版本引用：URL 字面量与 HLS_SCRIPT_VERSION 常量必须同时指向 node_modules 版本。 */
function collectSourceRefs() {
  const refs = []
  for (const file of walkSourceFiles(SRC_SCAN_DIR)) {
    const lines = readText(file).split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const urlAt = line.indexOf(VENDOR_URL_PREFIX)
      if (urlAt >= 0) {
        const rest = line.slice(urlAt + VENDOR_URL_PREFIX.length)
        const version = rest.split('/')[0]
        if (isVersion(version)) {
          refs.push({ file: file, line: index + 1, kind: 'URL', version: version, text: line.trim() })
        }
      }
      if (line.indexOf('HLS_SCRIPT_VERSION') >= 0) {
        const eqAt = line.indexOf('=')
        if (eqAt >= 0) {
          const afterEq = line.slice(eqAt + 1)
          const firstQuote = afterEq.indexOf("'")
          const secondQuote = afterEq.indexOf("'", firstQuote + 1)
          if (firstQuote >= 0 && secondQuote > firstQuote) {
            const version = afterEq.slice(firstQuote + 1, secondQuote)
            if (isVersion(version)) {
              refs.push({ file: file, line: index + 1, kind: '常量', version: version, text: line.trim() })
            }
          }
        }
      }
    }
  }
  return refs
}

function listVendorVersions() {
  if (!fs.existsSync(vendorRoot)) return []
  return fs
    .readdirSync(vendorRoot, { withFileTypes: true })
    .filter(function (entry) {
      return entry.isDirectory() && isVersion(entry.name)
    })
    .map(function (entry) {
      return entry.name
    })
    .sort()
}

function relative(file) {
  return path.relative(repoRoot, file)
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

if (!fs.existsSync(hlsPkgDir)) {
  fail('找不到 node_modules/hls.js —— 先在仓库根跑 bun install。')
}
const hlsPkg = readPackageJson(path.join(hlsPkgDir, 'package.json'), 'hls.js package.json')
const version = hlsPkg.version
if (!isVersion(version)) {
  fail('node_modules/hls.js 的 version 不是 x.y.z：' + String(version))
}
const targetDir = path.join(vendorRoot, version)

for (const artifact of ARTIFACTS) {
  if (!fs.existsSync(artifact.from)) {
    fail('hls.js@' + version + ' 包内缺少 ' + artifact.name + '：' + artifact.from)
  }
}

/** package.json 的依赖声明与 node_modules 版本是否同一线：只告警，不阻断（由 lock 负责精确解析）。 */
function checkDependencySpec() {
  if (!fs.existsSync(frontendPkgPath)) return
  const frontendPkg = readPackageJson(frontendPkgPath, 'homeos/frontend/package.json')
  const spec =
    (frontendPkg.dependencies && frontendPkg.dependencies['hls.js']) ||
    (frontendPkg.devDependencies && frontendPkg.devDependencies['hls.js'])
  if (!spec) {
    warn('homeos/frontend/package.json 里没有 hls.js 依赖声明。')
    return
  }
  if (String(spec).indexOf(version) < 0) {
    warn('homeos/frontend/package.json 的 hls.js 声明是 ' + spec + '，与 node_modules 的 ' + version + ' 不一致。')
  }
}

/** 校验 vendor 副本是否与 node_modules 逐字节一致。 */
function verifyVendorCopy() {
  const problems = []
  if (!fs.existsSync(targetDir)) {
    problems.push('缺少 vendor 目录：' + relative(targetDir))
    return problems
  }
  for (const artifact of ARTIFACTS) {
    const target = path.join(targetDir, artifact.to)
    if (!fs.existsSync(target)) {
      problems.push('缺少文件：' + relative(target))
    } else if (!fileBytesEqual(artifact.from, target)) {
      problems.push('内容与 node_modules 不一致：' + relative(target))
    }
  }
  return problems
}

/** 校验源码版本常量与 URL 都指向当前 node_modules 版本。 */
function verifySourceRefs(refs) {
  const problems = []
  if (refs.length === 0) {
    problems.push('源码里找不到任何 hls.js vendor 版本引用（' + relative(SRC_SCAN_DIR) + '）—— 约定被改坏了？')
    return problems
  }
  for (const ref of refs) {
    if (ref.version !== version) {
      problems.push(
        relative(ref.file) +
          ':' +
          ref.line +
          ' 引用 ' +
          ref.version +
          '，但 node_modules 是 ' +
          version +
          '（' +
          ref.kind +
          '：' +
          ref.text +
          '）',
      )
    }
  }
  return problems
}

const sourceRefs = collectSourceRefs()
const staleVendorVersions = listVendorVersions().filter(function (item) {
  return item !== version
})
const referencedVersions = new Set(
  sourceRefs.map(function (ref) {
    return ref.version
  }),
)

checkDependencySpec()

if (checkOnly) {
  const problems = verifyVendorCopy().concat(verifySourceRefs(sourceRefs))
  if (problems.length > 0) {
    console.error('[hls-vendor] 检查未通过（' + problems.length + ' 项）：')
    for (const problem of problems) console.error('  - ' + problem)
    console.error(
      '[hls-vendor] 修复：node homeos/frontend/scripts/sync-hls-vendor.mjs 生成 vendor，' +
        '再把 hls-loader.ts 的 URL 与 HLS_SCRIPT_VERSION 改成 ' +
        version +
        '。',
    )
    process.exit(1)
  }
  for (const stale of staleVendorVersions) {
    if (!referencedVersions.has(stale)) {
      warn('vendor 里还有无人引用的旧版本 ' + stale + '，可跑 --prune 清掉（不影响校验）。')
    }
  }
  info('检查通过：vendor ' + version + ' 与源码版本常量一致。')
  process.exit(0)
}

// ── 写模式 ───────────────────────────────────────────────────────────────────
fs.mkdirSync(targetDir, { recursive: true })
const written = []
for (const artifact of ARTIFACTS) {
  const target = path.join(targetDir, artifact.to)
  const data = fs.readFileSync(artifact.from)
  if (fileBytesEqual(artifact.from, target)) {
    info('已最新：' + relative(target))
    continue
  }
  const tmp = target + '.tmp-' + process.pid
  try {
    fs.writeFileSync(tmp, data)
    fs.chmodSync(tmp, 0o644)
    fs.renameSync(tmp, target)
  } catch (error) {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* 临时文件可能没建成，忽略 */
    }
    fail('写 ' + relative(target) + ' 失败：' + error.message)
  }
  written.push({ target: target, bytes: data.length })
}

for (const item of written) {
  info('已写入：' + relative(item.target) + '（' + formatBytes(item.bytes) + '）')
}
if (written.length === 0) info('vendor 副本无变化。')
info('vendor 版本：' + version + ' → ' + relative(targetDir))

if (prune) {
  for (const stale of staleVendorVersions) {
    fs.rmSync(path.join(vendorRoot, stale), { recursive: true, force: true })
    info('已删除旧版本：' + stale)
  }
} else if (staleVendorVersions.length > 0) {
  info('保留旧版本：' + staleVendorVersions.join('、') + '（改完源码常量后跑 --prune 清理）')
}

const remainingProblems = verifyVendorCopy()
if (remainingProblems.length > 0) {
  console.error('[hls-vendor] 写盘后校验失败：')
  for (const problem of remainingProblems) console.error('  - ' + problem)
  process.exit(1)
}
const sourceProblems = verifySourceRefs(sourceRefs)
if (sourceProblems.length > 0) {
  warn('vendor 已生成，但源码版本常量还没跟进（需要把 hls-loader.ts 两处改成 ' + version + '）：')
  for (const problem of sourceProblems) console.warn('  - ' + problem)
  warn('改完后再跑 --check 应通过；这一步刻意不自动改源码（源码归前端模块所有）。')
} else {
  info('源码版本常量已与 vendor 一致。')
}
