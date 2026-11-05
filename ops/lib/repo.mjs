/** 根目录 scripts 共用：仓库根路径 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** `scripts/lib` → 仓库根 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
