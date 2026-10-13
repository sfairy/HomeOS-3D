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

export const OUT_DIR = path.join(REPO_ROOT, 'ops', 'tokens', 'reports')
