/**
 * 前端检查的公共骨架：一次遍历、一份 AST、统一输出。
 *
 * 为什么抽出这一层
 * ---------------
 * 近 2000 个 `.ts` / `.vue` 被多条前端检查反复遍历时，耗时几乎全在重复的 IO 与解析上。
 * `createContext()` 提供**按进程缓存**的 `walk` / `text` / `sourceFile`，批量入口
 * （`run_frontend_checks.mjs`）里所有模块共用一份，同一文件只读一次、只解析一次。
 *
 * 这里**只管上下文与输出**，不再提供基线读写：「只许降的数字棘轮」已按
 * 「不设数字门槛」全部删除，留下读写基线的骨架只会变成没有消费者的死代码。
 *
 * 与 `ops/lib/ratchet.py` 同构：Python 侧也只剩「解析缓存 + 结果对象」。
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, sep } from 'node:path'

import { walkFiles } from './walk.mjs'

/** `typescript` 只在真正需要 AST 的检查里加载：不需要 AST 的检查不该付启动成本。 */
let cachedTs
function typescript() {
  if (!cachedTs) cachedTs = createRequire(import.meta.url)('typescript')
  return cachedTs
}

/**
 * 一次进程内共享的读取上下文。
 *
 * 批量入口创建一份传给所有模块；单跑时各脚本自己建一份，行为完全一致。
 *
 * @param {string} repoRoot
 */
export function createContext(repoRoot) {
  /** @type {Map<string, string>} */
  const textCache = new Map()
  /** @type {Map<string, string[]>} */
  const walkCache = new Map()
  /** @type {Map<string, import('typescript').SourceFile>} */
  const sourceCache = new Map()

  return {
    repoRoot,

    /** 仓库相对路径（统一 `/` 分隔，报告里不出现本机绝对路径）。 */
    rel(file) {
      return relative(repoRoot, file).split(sep).join('/')
    },

    /** 读文本，按绝对路径缓存：同一文件被多条检查读到时只落一次盘。 */
    text(file) {
      const cached = textCache.get(file)
      if (cached !== undefined) return cached
      const value = readFileSync(file, 'utf8')
      textCache.set(file, value)
      return value
    },

    /**
     * 遍历某个仓库相对目录，返回**排序后**的绝对路径。
     *
     * `extensions` 与 `skipDirs` 都参与缓存键：同一目录被两条检查用不同筛选条件扫时
     * 各缓存一份，不会互相污染。
     *
     * @param {string} relDir 仓库相对目录
     * @param {Set<string>} extensions
     * @param {Set<string>} [skipDirs] 额外跳过的目录名（默认见 `walk.mjs`）
     * @returns {string[]}
     */
    walk(relDir, extensions, skipDirs) {
      const key = `${relDir}|${[...extensions].sort().join(',')}|${skipDirs ? [...skipDirs].sort().join(',') : ''}`
      const cached = walkCache.get(key)
      if (cached) return cached
      const files = walkFiles(join(repoRoot, relDir), { extensions, ...(skipDirs ? { skipDirs } : {}) }).sort()
      walkCache.set(key, files)
      return files
    },

    /**
     * 解析成 TypeScript `SourceFile` 并缓存。
     *
     * 同一文件只解析一次，而不是每条检查各解析一遍。
     *
     * Vue SFC 不走这里：它要按 `<script>` 块分别解析，由调用方自行处理。
     *
     * @param {string} file 绝对路径
     * @param {number} scriptKind `ts.ScriptKind.*`
     */
    sourceFile(file, scriptKind) {
      const key = `${file}|${scriptKind}`
      const cached = sourceCache.get(key)
      if (cached) return cached
      const ts = typescript()
      const parsed = ts.createSourceFile(file, this.text(file), ts.ScriptTarget.Latest, true, scriptKind)
      sourceCache.set(key, parsed)
      return parsed
    },
  }
}

/**
 * 统一的检查结果。
 *
 * `summary` 是成功的单行摘要；`problems` 非空即失败；`hints` 只在失败时打印。
 *
 * @typedef {object} CheckResult
 * @property {string} name
 * @property {string} summary
 * @property {string[]} [problems]
 * @property {string[]} [hints]
 * @property {string[]} [notes] 成功时也打印的附加信息（如存量分布）
 * @property {object} [json] `--json` 的输出载荷
 */

/**
 * 打印一个检查结果并返回退出码。
 *
 * @param {CheckResult} result
 * @param {{json?: boolean}} [options]
 * @returns {number} 0 / 1
 */
export function report(result, { json = false } = {}) {
  const problems = result.problems ?? []
  if (json) {
    console.log(JSON.stringify(result.json ?? { name: result.name, problems }, null, 2))
    return problems.length > 0 ? 1 : 0
  }
  if (problems.length > 0) {
    console.error(`${result.name} 失败：${problems.length} 项`)
    for (const line of problems) console.error(`  - ${line}`)
    for (const hint of result.hints ?? []) console.error(`  ${hint}`)
    return 1
  }
  console.log(`${result.name} 通过：${result.summary}`)
  for (const note of result.notes ?? []) console.log(`  ${note}`)
  return 0
}
