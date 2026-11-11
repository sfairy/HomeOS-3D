/** 目录遍历的唯一实现：所有门禁脚本共用，避免各自维护一份「跳过哪些目录」。
 *
 * 各脚本的跳过集合曾经各自硬编码（有的漏 `.git`、有的漏 `build`），
 * 结果是同一个仓库在不同门禁里「被扫描的文件数」不一致。这里默认取并集，
 * 需要窄集合的调用方显式传 `skipDirs`，让差异写在调用点上而不是藏在副本里。
 */
import { readdirSync } from 'node:fs'
import { extname, join } from 'node:path'

const DEFAULT_SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git'])

/**
 * 递归收集文件路径（深度优先、按目录项顺序）。
 *
 * @param {string} dir 起始目录
 * @param {{extensions?: Set<string> | null, skipDirs?: Set<string>}} [options]
 *   `extensions` 为 `null` 时不按扩展名过滤；目录名精确匹配 `skipDirs` 即跳过。
 * @param {string[]} [out] 复用已有数组（递归内部使用）
 * @returns {string[]}
 */
export function walkFiles(dir, { extensions = null, skipDirs = DEFAULT_SKIP_DIRS } = {}, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    // 目录不存在或不可读：与旧实现一致，静默返回已收集的部分。
    return out
  }
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, { extensions, skipDirs }, out)
    else if (!extensions || extensions.has(extname(entry.name))) out.push(full)
  }
  return out
}
