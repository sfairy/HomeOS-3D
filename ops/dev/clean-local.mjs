/**
 * 在部署或发布前移除本地构建/运行时的临时产物。
 *
 * 用法：
 *   bun ops/dev/clean-local.mjs            # 仅构建缓存与工具缓存（安全）
 *   bun ops/dev/clean-local.mjs --dry-run  # 只打印将删除的路径，不落盘
 *   bun ops/dev/clean-local.mjs --all      # 再移除 node_modules / .venv-store / __pycache__
 *                                          # （不删 assets-default/ 种子素材）
 *
 * 绝不删除 .env / backend/.env（本地密钥），也不清理 homeos/data、homeos-store/data、
 * homeos/backups（运行期数据与现场备份）。这些删了就不可再生，不属于「清理」范围。
 * 始终从仓库根目录解析路径（而非 process.cwd()）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from '../lib/repo.mjs'

const ROOT = REPO_ROOT
const allMode = process.argv.includes('--all')
const dryRun = process.argv.includes('--dry-run')

const DIRS = [
  'dist',
  'packages/shared/dist',
  // Vite 缓存；homeos/data 是运行期数据，刻意不在这里。
  'homeos/frontend/.vite',
  // GraphFlow 的本地索引 / 会话缓存（各子项目各一份，全部 gitignored）。
  '.graphflow',
  'homeos/.graphflow',
  'homeos/frontend/.graphflow',
  'homeos/backend/.graphflow',
  'homeos-store/backend/.graphflow',
  // Python 工具缓存（.venv-store 本身只在 --all 时删）。
  '.ruff_cache',
  'homeos/backend/.ruff_cache',
  // `sync:scene` 的生成物：真源在 packages/shared/scene/static，下一次 dev / build 会重铺。
  // 只列生成出来的四张表与字体目录 —— 同目录的 scene-depth.js 是手抄兜底件，必须留在库里。
  'homeos/frontend/public/static/auth/scene/fonts.css',
  'homeos/frontend/public/static/auth/scene/page.css',
  'homeos/frontend/public/static/auth/scene/panel.css',
  'homeos/frontend/public/static/auth/scene/scene.css',
  'homeos/frontend/public/static/auth/scene/fonts',
  'homeos-store/frontend/public/static/scene',
]

if (allMode) {
  DIRS.push('node_modules', 'homeos/frontend/node_modules', 'packages/shared/node_modules', '.venv-store')
}

const SKIP_WALK = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
  '.vite',
  'generated',
  '.venv-store',
  '.graphflow',
  '.ruff_cache',
])

function rm(target) {
  const abs = path.join(ROOT, target)
  const rel = path.relative(ROOT, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    console.error(`refuse ${target}: outside repo root`)
    process.exit(1)
  }
  if (!fs.existsSync(abs)) return false
  try {
    fs.rmSync(abs, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    return true
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined
    if (code === 'EACCES' || code === 'EBUSY' || code === 'ENOTEMPTY') {
      console.error(
        `skip ${target}/ (${code}): path is locked. On Windows stop bun/node dev servers ` +
          `(dev:backend / dev:frontend / vite / biome), then retry.`,
      )
      return 'locked'
    }
    throw err
  }
}

/** 移除扫描根目录下的空目录树（最深者优先）。 */
function pruneEmptyDirs(scanRoots) {
  const empty = []

  function walk(dir) {
    if (!fs.existsSync(dir)) return
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_WALK.has(e.name)) continue
      walk(path.join(dir, e.name))
    }
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return
    }
    if (entries.length !== 0) return
    const rel = path.relative(ROOT, dir).split(path.sep).join('/')
    // 绝不移除顶层项目目录
    if (!rel || rel === '.' || !rel.includes('/')) return
    empty.push(rel)
  }

  for (const root of scanRoots) {
    walk(path.join(ROOT, root))
  }

  empty.sort((a, b) => b.split('/').length - a.split('/').length || a.localeCompare(b))
  let n = 0
  for (const rel of empty) {
    if (rm(rel) === true) {
      console.log(`removed empty ${rel}/`)
      n++
    }
  }
  return n
}

/**
 * 递归移除所有 `__pycache__`（仅 `--all`）。
 *
 * 编译产物没有跨机器意义，干净检出后第一次跑 Python 就会重新生成；但 `--all` 之外
 * 留在盘上能省下反复编译的时间，所以默认不清。
 */
function removePycache() {
  const found = []

  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_WALK.has(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.name === '__pycache__') {
        found.push(path.relative(ROOT, full).split(path.sep).join('/'))
        continue
      }
      walk(full)
    }
  }

  walk(ROOT)
  let n = 0
  for (const rel of found) {
    if (rm(rel) === true) {
      console.log(`removed ${rel}/`)
      n++
    }
  }
  return n
}

if (dryRun) {
  for (const d of DIRS) {
    if (fs.existsSync(path.join(ROOT, d))) console.log(`would remove ${d}/`)
  }
  if (allMode) console.log('would remove every __pycache__/ (except node_modules / .venv-store)')
  console.log('dry run: nothing removed')
  process.exit(0)
}

let removed = 0
let locked = 0
for (const d of DIRS) {
  const result = rm(d)
  if (result === true) {
    console.log(`removed ${d}/`)
    removed++
  } else if (result === 'locked') {
    locked++
  }
}

if (allMode) removed += removePycache()

removed += pruneEmptyDirs(['homeos/backend/src', 'homeos/frontend/src', 'homeos/frontend', 'packages/shared/src'])

if (removed === 0 && locked === 0) {
  console.log('nothing to clean')
} else {
  console.log(`done (${removed} path(s)${locked ? `, ${locked} locked` : ''})`)
}

if (locked > 0) process.exit(1)
