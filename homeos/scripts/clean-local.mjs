/**
 * 在部署或发布前移除本地构建/运行时的临时产物。
 *
 * 用法：
 *   bun scripts/clean-local.mjs           # 仅构建缓存（安全）
 *   bun scripts/clean-local.mjs --all     # 同时移除 node_modules（不删 assets/ 种子素材）
 *
 * 绝不删除 .env / backend/.env（本地密钥）。
 * 始终从仓库根目录解析路径（而非 process.cwd()）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './lib/repo.mjs'

const ROOT = REPO_ROOT
const allMode = process.argv.includes('--all')

const DIRS = [
  'dist',
  'packages/shared/dist',
  // Python 主后端数据目录（HOMEOS_DATA_DIR 缺省为 backend/data）
  'backend/data',
  'frontend/.vite',
]

if (allMode) {
  DIRS.push(
    'node_modules',
    'frontend/node_modules',
    'packages/shared/node_modules',
  )
}

const SKIP_WALK = new Set([
  'node_modules',
  'dist',
  '.git',
  'coverage',
  '.vite',
  'generated',
])

function rm(target) {
  const abs = path.join(ROOT, target)
  if (!fs.existsSync(abs)) return false
  try {
    fs.rmSync(abs, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    return true
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? err.code : undefined
    if (code === 'EACCES' || code === 'EBUSY' || code === 'ENOTEMPTY') {
      console.error(
        `skip ${target}/ (${code}): path is locked. On Windows stop bun/node dev servers ` +
          `(dev:backend / dev:frontend / vite / eslint), then retry.`,
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

removed += pruneEmptyDirs(['backend/src', 'frontend/src', 'frontend', 'packages/shared/src'])

if (removed === 0 && locked === 0) {
  console.log('nothing to clean')
} else {
  console.log(`done (${removed} path(s)${locked ? `, ${locked} locked` : ''})`)
}

if (locked > 0) process.exit(1)
