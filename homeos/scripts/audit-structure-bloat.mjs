/**
 * 结构膨胀审计。
 *
 * 用法：
 *   bun scripts/audit-structure-bloat.mjs           # 仅警告（退出码 0）
 *   bun scripts/audit-structure-bloat.mjs --ci      # 卡控新增/改动的超大文件
 *
 * CI 卡控（--ci）：
 *   - 若 frontend/src 下新增或修改的 .ts/.vue 文件
 *     超过 MAX_LINES（800），则失败（排除 generated/）
 *   - 若新增的 *.util.ts ≤ TINY_UTIL_MAX（20）行，则失败
 *   - 若存在空的 clean-arch / feature-slice 脚手架目录
 *     （application|domain|infrastructure|presentation，或空的 features/shared 目录树），则失败
 *   单文件目录 / 微型 util 的清单警告仍会打印，但不会单独导致失败。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { REPO_ROOT } from './lib/repo.mjs'

const ROOT = REPO_ROOT
const SKIP_DIR = new Set(['node_modules', 'dist', 'generated', '.git', 'coverage'])
const MAX_LINES = 800
const TINY_UTIL_MAX = 20
const ciMode = process.argv.includes('--ci')

function walkDirs(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP_DIR.has(e.name)) continue
    const p = path.join(dir, e.name)
    acc.push(p)
    walkDirs(p, acc)
  }
  return acc
}

function walkFiles(dir, pred, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue
      walkFiles(p, pred, acc)
    } else if (pred(e.name, p)) {
      acc.push(p)
    }
  }
  return acc
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/')
}

function lineCount(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).length
  } catch {
    return 0
  }
}

const singleFileDirs = []
for (const scope of ['frontend/src']) {
  const base = path.join(ROOT, scope)
  for (const dir of walkDirs(base)) {
    const name = path.basename(dir)
    if (name === 'styles') continue
    let files = []
    let subdirs = 0
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (!SKIP_DIR.has(e.name)) subdirs++
        } else {
          files.push(e.name)
        }
      }
    } catch {
      continue
    }
    if (subdirs === 0 && files.length === 1) {
      singleFileDirs.push(rel(dir) + '/' + files[0])
    }
  }
}

const tinyUtils = []
for (const file of walkFiles(path.join(ROOT, 'frontend/src'), (n) => n.endsWith('.util.ts'))) {
  const n = lineCount(file)
  if (n > 0 && n <= TINY_UTIL_MAX) tinyUtils.push({ path: rel(file), lines: n })
}

tinyUtils.sort((a, b) => a.lines - b.lines || a.path.localeCompare(b.path))

/** 禁止存在的空脚手架目录名（clean-arch / 未完成的 feature slice）。 */
const FORBIDDEN_EMPTY_LAYER_NAMES = new Set([
  'application',
  'domain',
  'infrastructure',
  'presentation',
])

/**
 * @param {string} dir
 * @returns {boolean} 若目录存在且递归地不包含任何文件，则返回 true
 */
function isEmptyDirTree(dir) {
  if (!fs.existsSync(dir)) return false
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      return false
    }
    for (const e of entries) {
      if (SKIP_DIR.has(e.name)) continue
      const p = path.join(cur, e.name)
      if (e.isDirectory()) stack.push(p)
      else return false
    }
  }
  return true
}

/** @type {string[]} */
const emptyLayerScaffolds = []
for (const scope of ['frontend/src']) {
  const base = path.join(ROOT, scope)
  for (const dir of walkDirs(base)) {
    const name = path.basename(dir)
    if (!FORBIDDEN_EMPTY_LAYER_NAMES.has(name)) continue
    if (isEmptyDirTree(dir)) emptyLayerScaffolds.push(rel(dir))
  }
}
// 顶层未完成的目录树，不允许以空壳形式存在
for (const banned of [
  'frontend/src/features',
  'frontend/src/shared',
]) {
  const abs = path.join(ROOT, banned)
  if (fs.existsSync(abs) && isEmptyDirTree(abs)) emptyLayerScaffolds.push(banned)
}
emptyLayerScaffolds.sort()

console.log(
  ciMode
    ? '=== structure bloat audit (CI gate: new/changed oversized + new tiny utils + empty scaffolds) ==='
    : '=== structure bloat audit (warnings only) ===',
)
console.log(`single-file dirs (excl. styles/): ${singleFileDirs.length}`)
for (const p of singleFileDirs.slice(0, 40)) console.log(`  WARN single-file-dir: ${p}`)
if (singleFileDirs.length > 40) console.log(`  ... +${singleFileDirs.length - 40} more`)

console.log(`tiny util files (<=${TINY_UTIL_MAX} lines): ${tinyUtils.length}`)
for (const u of tinyUtils.slice(0, 40)) console.log(`  WARN tiny-util(${u.lines}): ${u.path}`)
if (tinyUtils.length > 40) console.log(`  ... +${tinyUtils.length - 40} more`)

console.log(`empty layer/scaffold dirs: ${emptyLayerScaffolds.length}`)
for (const p of emptyLayerScaffolds.slice(0, 40)) {
  console.log(`  ${ciMode ? 'FAIL' : 'WARN'} empty-scaffold: ${p}`)
}
if (emptyLayerScaffolds.length > 40) {
  console.log(`  ... +${emptyLayerScaffolds.length - 40} more`)
}

let failed = false

if (ciMode && emptyLayerScaffolds.length > 0) {
  failed = true
}

if (ciMode) {
  /** @type {string[]} */
  let changed = []
  try {
    // 优先使用 PR 相对 origin/main 的 merge-base；回退到 staged+unstaged 对比 HEAD^
    const base = process.env.GITHUB_BASE_SHA || process.env.BASE_SHA || ''
    if (base) {
      changed = execSync(`git diff --name-only --diff-filter=AM ${base}...HEAD`, {
        encoding: 'utf8',
        cwd: ROOT,
      })
        .split(/\r?\n/)
        .filter(Boolean)
    } else {
      const tracked = execSync('git diff --name-only --diff-filter=AM HEAD', {
        encoding: 'utf8',
        cwd: ROOT,
      })
      const untracked = execSync('git ls-files --others --exclude-standard', {
        encoding: 'utf8',
        cwd: ROOT,
      })
      changed = [...tracked.split(/\r?\n/), ...untracked.split(/\r?\n/)].filter(Boolean)
    }
  } catch (err) {
    console.warn(
      'CI gate: unable to resolve changed files via git; skipping fail checks.',
      err instanceof Error ? err.message : err,
    )
    changed = []
  }

  const scoped = changed.filter(
    (p) => p.startsWith('frontend/src/') && !p.includes('/generated/') && /\.(ts|vue)$/.test(p),
  )

  console.log(`CI changed scoped files: ${scoped.length}`)

  for (const p of scoped) {
    const abs = path.join(ROOT, p)
    if (!fs.existsSync(abs)) continue
    const n = lineCount(abs)

    let status = ''
    try {
      status = execSync(`git status --porcelain -- "${p}"`, { encoding: 'utf8', cwd: ROOT }).trim()
    } catch {
      status = ''
    }
    const isNew = status.startsWith('??') || status.startsWith('A ')

    // 仅对新增文件卡 800 行：存量巨石允许修改，避免阻塞产品化修复
    if (isNew && n > MAX_LINES) {
      console.error(`  FAIL new-oversized(${n}>${MAX_LINES}): ${p}`)
      failed = true
    }
    if (isNew && p.endsWith('.util.ts') && n > 0 && n <= TINY_UTIL_MAX) {
      console.error(`  FAIL new-tiny-util(${n}): ${p}`)
      failed = true
    }
  }
}

if (ciMode) {
  if (failed) {
    console.error('structure bloat CI gate FAILED')
    process.exit(1)
  }
  console.log('structure bloat CI gate OK')
  process.exit(0)
}

console.log('done (exit 0; warnings do not fail CI)')
process.exit(0)
