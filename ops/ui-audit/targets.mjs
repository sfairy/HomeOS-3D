/**
 * 审计目标根：两个主项目的样式与代码来源，加上两侧共用的场景/共享包。
 * 所有审计脚本共用，避免各脚本各写一份根目录列表而漂移。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 每个目标：id、人类可读名、项目归属、绝对根、审计子根（相对该根）。 */
export const TARGETS = [
  {
    id: 'homeos',
    label: 'homeos 主控应用',
    project: 'homeos',
    root: path.join(REPO_ROOT, 'homeos', 'frontend'),
    scan: ['src', 'public/static'],
  },
  {
    id: 'store',
    label: 'homeos-store 授权商店',
    project: 'store',
    root: path.join(REPO_ROOT, 'homeos-store', 'frontend'),
    scan: ['src', 'public/static'],
  },
  {
    id: 'design',
    label: 'design/ 场景源（入户页母版）',
    project: 'homeos',
    root: path.join(REPO_ROOT, 'design'),
    scan: ['.'],
  },
  {
    id: 'shared',
    label: '@homeos/shared 共享包',
    project: 'shared',
    root: path.join(REPO_ROOT, 'packages', 'shared'),
    scan: ['src'],
  },
]

/** 展开成绝对扫描目录列表。 */
export function scanDirs(target) {
  return target.scan.map((s) => path.join(target.root, s))
}

export const OUT_DIR = path.join(REPO_ROOT, 'ops', 'ui-audit', 'reports')

/**
 * 「同源镜像」样式表组：场景样式在 design/ 母版、主应用 public/static、商店 public/static
 * 三处各存一份（逐字同构，由 ops/verify_scene_sync.py 校验）。它们之间的「重复」是设计内
 * 的镜像，不算可清理的重复定义 —— 审计时单列。
 */
export const MIRROR_PATTERNS = [
  /^design\/scene\//,
  /^homeos\/frontend\/public\/static\/auth\/scene\//,
  /^homeos-store\/frontend\/public\/static\/scene\//,
]

export function isMirror(relPath) {
  return MIRROR_PATTERNS.some((re) => re.test(relPath))
}

/**
 * 「策展令牌字典」：逐条带注释、含**刻意预留**的设计令牌（例如 main.css 的
 * `--accent-*` 调色板、`--*-ipad-*` 变体族）。这里的令牌即使当前无消费者也是保留项，
 * 不作为「无用定义」；未被引用的只记入 `reserved`，与真正的 `dead` 分开。
 */
export const CURATED_TOKEN_FILES = new Set([
  'homeos/frontend/src/assets/styles/main.css',
  'homeos/frontend/src/assets/styles/hos-design-system.css',
])

export function isCuratedTokenFile(relPath) {
  return CURATED_TOKEN_FILES.has(relPath)
}
