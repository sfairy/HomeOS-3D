/**
 * 门禁脚本的「是否被直接执行」判定（node / bun 通用）。
 *
 * 为什么需要它
 * ------------
 * 批量入口（`run_frontend_checks.mjs` 等）要在同一个进程里 import 各检查模块，而各模块
 * 原本在文件末尾直接 `process.exit(...)`。直接 import 会当场退出整个批次。
 *
 * Bun 有 `import.meta.main`，但它描述的是**当前模块**，在共享库里读到的永远是共享库自己，
 * 因此不能抽成函数（`isMain()` 里读 `import.meta.main` 恒为 false）。Node 则根本没有这个字段。
 * 这里统一用「入口路径 vs 模块路径」比较，两种运行时下行为一致。
 *
 * 用法：
 * ```js
 * import { isMain } from '../lib/cli.mjs'
 *
 * export function audit(ctx) { … return problems.length === 0 }
 *
 * if (isMain(import.meta.url)) process.exit(audit(createContext()) ? 0 : 1)
 * ```
 */
import { realpathSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * `realpath` 失败时退回原路径：被删/不可读的入口不该让判定抛错。
 *
 * @param {string} file
 * @returns {string}
 */
function normalize(file) {
  try {
    return realpathSync.native(file)
  } catch {
    return path.resolve(file)
  }
}

/**
 * 当前模块是否是进程入口。
 *
 * 被 import 时 `process.argv[1]` 指向批次入口，与模块路径不等 → false；
 * 被直接执行（`node ops/checks/x.mjs`、`bun ops/checks/x.mjs`、`bun run check:x`）→ true。
 *
 * @param {string} moduleUrl `import.meta.url`
 * @returns {boolean}
 */
export function isMain(moduleUrl) {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return normalize(fileURLToPath(moduleUrl)) === normalize(entry)
  } catch {
    return false
  }
}
