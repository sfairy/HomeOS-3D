/**
 * 前端棘轮的公共骨架：共享上下文、基线读写、逐文件比对、统一输出。
 *
 * 为什么抽出这一层
 * ---------------
 * `check_offline_counting` / `check_restricted_syntax` 等前端检查各自抄了
 * 一遍「遍历 → 逐文件计数 → 读基线 → 比变多 → 打印」。每加一条新检查就再抄一遍，
 * 结果是门禁代码自己成了重复代码；更实际的问题是**每个脚本
 * 都重新遍历一次同一个源码树**，多条前端检查加起来对近 2000 个 ts/vue 反复走了多遍。
 *
 * 现在：
 * - `createContext()` 提供**按进程缓存**的 `walk` / `text`，批量入口里所有模块共用一份；
 * - 判定语义固定为「只许降」：逐文件超基线 → 失败；总数超基线 → 失败；减少不失败；
 * - 输出格式统一，批量入口只打印一行 PASS / 失败时展开明细。
 *
 * 与 `ops/lib/ratchet.py` 同构：Python 侧早就有这一层，JS 侧此前没有。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, sep } from 'node:path'

import { walkFiles } from './walk.mjs'

/** `typescript` 只在真正需要 AST 的检查里加载：其余棘轮不该为它付启动成本。 */
let cachedTs
function typescript() {
  if (!cachedTs) cachedTs = createRequire(import.meta.url)('typescript')
  return cachedTs
}

/**
 * 一次进程内共享的读取上下文。
 *
 * 批量入口创建一份传给所有模块；单跑时 `cli()` 自己建一份，行为完全一致。
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

    /** 多个根目录合并后再排序（保持与单根遍历相同的稳定顺序）。 */
    walkMany(relDirs, extensions, skipDirs) {
      return relDirs.flatMap((dir) => this.walk(dir, extensions, skipDirs)).sort()
    },

    /**
     * 解析成 TypeScript `SourceFile` 并缓存。
     *
     * 复杂度与「受限写法」两条检查都要 AST：批量入口里同一文件只解析一次，而不是各解析
     * 一遍（此前 1974 个 ts/vue 被 ts.createSourceFile 走了两轮）。
     *
     * Vue SFC 不走这里：它要按 `<script>` 块分别解析，由调用方自行 `analyzeText`。
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
 * 读基线 JSON。
 *
 * 读不到不是「通过」：首次启用必须显式跑 `--update`。返回结构而不是抛错，是为了让批量
 * 入口能把「基线缺失」当成该模块的失败，而不是中断整批。
 *
 * @param {string} file 绝对路径
 * @param {string} label 展示名（仓库相对路径由调用方给）
 * @returns {{ok: true, data: any} | {ok: false, error: string}}
 */
export function readBaseline(file, label = file) {
  try {
    return { ok: true, data: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (error) {
    return { ok: false, error: `读不到基线 ${label}（${error.message}）。首次启用请先跑 --update 生成基线。` }
  }
}

/** 写基线：统一两空格缩进 + 末尾换行，让 diff 只看内容变化。 */
export function writeBaseline(file, payload) {
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

/**
 * 逐文件「只许降」比对。
 *
 * @param {Record<string, Record<string, number> | number>} counts 当前逐文件计数
 * @param {Record<string, Record<string, number> | number>} baselineFiles 基线逐文件计数
 * @param {string[]} metrics 需要比对的指标名（单指标棘轮传 `['count']`）
 * @param {(file: string, metric: string, before: number, after: number) => string} format
 * @returns {string[]}
 */
export function perFileProblems(counts, baselineFiles, metrics, format) {
  const problems = []
  for (const file of Object.keys(counts).sort()) {
    const found = counts[file]
    const before = baselineFiles[file] ?? {}
    for (const metric of metrics) {
      const afterValue = typeof found === 'number' ? found : (found[metric] ?? 0)
      const beforeValue = typeof before === 'number' ? before : (before[metric] ?? 0)
      if (afterValue > beforeValue) problems.push(format(file, metric, beforeValue, afterValue))
    }
  }
  return problems
}

/**
 * 总数兜底：逐文件都没超、但总数超了（新增文件或计数转移）也要拦。
 *
 * @param {Record<string, number>} totals
 * @param {Record<string, number>} baselineTotals
 * @param {string[]} metrics
 * @param {(metric: string, before: number, after: number) => string} format
 * @returns {string[]}
 */
export function totalProblems(totals, baselineTotals, metrics, format) {
  const problems = []
  for (const metric of metrics) {
    const after = totals[metric] ?? 0
    const before = baselineTotals[metric] ?? 0
    if (after > before) problems.push(format(metric, before, after))
  }
  return problems
}

/**
 * 统一的棘轮结果。
 *
 * `summary` 是成功的单行摘要；`problems` 非空即失败；`hints` 只在失败时打印。
 *
 * @typedef {object} RatchetResult
 * @property {string} name
 * @property {string} summary
 * @property {string[]} [problems]
 * @property {string[]} [hints]
 * @property {string[]} [notes] 成功时也打印的附加信息（如存量分布）
 * @property {object} [json] `--json` 的输出载荷
 */

/**
 * 打印一个棘轮结果并返回退出码。
 *
 * @param {RatchetResult} result
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

/**
 * 声明式棘轮：把「update 分支 / 读基线 / 逐文件比对 / 结果对象」这段骨架收成一处。
 *
 * 为什么需要它：`check_offline_counting` 这类检查的 `audit()` 骨架与计数式棘轮逐字相同，
 * 只有指标名与提示语不同 —— 这正是会被当成 15 行克隆的写法。抽出后每条检查只剩「怎么数」
 * 与「怎么表述」。
 *
 * @param {{
 *   name: string,
 *   baselineRel: string,
 *   scan: (ctx: object) => {counts: Record<string, any>, totals: Record<string, number>},
 *   metrics: string[],
 *   summary: (counts: Record<string, any>, totals: Record<string, number>) => string,
 *   formatProblem: (file: string, metric: string, before: number, after: number) => string,
 *   payload?: (counts: Record<string, any>, totals: Record<string, number>) => object,
 *   extraProblems?: (input: {counts: object, totals: object, baseline: object}) => string[],
 *   hints?: string[] | ((input: {problems: string[], baselineRel: string}) => string[]),
 *   notes?: (input: {counts: object, totals: object}) => string[],
 * }} config
 */
export function defineRatchet({
  name,
  baselineRel,
  scan,
  metrics,
  summary,
  formatProblem,
  payload,
  extraProblems,
  hints = [],
  notes,
}) {
  function audit(ctx, { update = false } = {}) {
    const baselinePath = join(ctx.repoRoot, baselineRel)
    const { counts, totals } = scan(ctx)

    if (update) {
      writeBaseline(baselinePath, payload ? payload(counts, totals) : { totals, files: counts })
      return { name, summary: `基线已更新：${summary(counts, totals)}`, updated: true, problems: [] }
    }

    const loaded = readBaseline(baselinePath, ctx.rel(baselinePath))
    if (!loaded.ok) return { name, summary: '', problems: [loaded.error] }

    const problems = [
      ...perFileProblems(counts, loaded.data.files || {}, metrics, formatProblem),
      ...(extraProblems ? extraProblems({ counts, totals, baseline: loaded.data }) : []),
    ]
    const resolvedHints = typeof hints === 'function' ? hints({ problems, baselineRel }) : hints

    return {
      name,
      summary: summary(counts, totals),
      problems,
      hints: problems.length > 0 ? resolvedHints : [],
      notes: problems.length === 0 ? (notes?.({ counts, totals }) ?? []) : [],
      json: { totals, problems },
    }
  }

  return { scan, audit }
}

/** 单指标棘轮的计数包装：`{file: count}` 与 `{file: {count}}` 两种形态都接受。 */
export function singleMetric(counts, metric = 'count') {
  return Object.fromEntries(Object.entries(counts).map(([file, value]) => [file, { [metric]: value }]))
}

/**
 * 构造单跑入口：解析 `--update` / `--json`，跑 `audit`，打印并返回退出码。
 *
 * 为什么抽出来：各棘轮的 CLI 尾巴逐字相同（`--update` → 打印摘要 → 否则 `report()`），
 * 各写一份只会变成一堆同构克隆。
 *
 * @param {(ctx: object, options: object) => object} audit
 * @param {{repoRoot: string, aliases?: string[]}} config
 *   `repoRoot` 是仓库根绝对路径（调用方用 `join(import.meta.dirname, '../..')` 给出）；
 *   `aliases` 是需要额外识别的「更新基线」开关（如 `--write`）。
 * @returns {(argv?: string[]) => number}
 */
export function createCli(audit, { repoRoot, aliases = [] } = {}) {
  return function cli(argv = process.argv.slice(2)) {
    const updateFlags = ['--update', ...aliases]
    const result = audit(createContext(repoRoot), { update: argv.some((arg) => updateFlags.includes(arg)) })
    if (result.updated) {
      console.log(result.summary)
      return 0
    }
    return report(result, { json: argv.includes('--json') })
  }
}
