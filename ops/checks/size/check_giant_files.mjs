#!/usr/bin/env node
/**
 * 大文件「耦合度」度量（只读，手动入口）。
 *
 * 这不是门禁
 * ----------
 * 「多少行算巨型文件」是项目取舍，不是能由门禁固化的客观阈值。这条脚本因此不再进
 * `gate:*` / `pre-push`，只保留为手动审计 `audit:giant-files`：拆分前评估「先搬哪个
 * 文件、要先收哪些依赖」时运行。`--min-lines` 只是**报告的筛选参数**，不是项目定义。
 *
 * 为什么不能只看行数
 * -----------------
 * `audit:file-size` 还能给出单文件行数，但行数不是拆不动的真正原因。实测三个
 * 大编排文件（`studio-app/boot.ts` 4199 / `editor/home/lifecycle/boot.ts` 4917 /
 * `runtime/core/stage.ts` 4866）里，真正的障碍是**扇出**：
 *
 * - `studio-app/boot.ts` 有 16 组 `xxx(...args)` → `xxxImpl(...args, xxxDeps())` 包装，
 *   `xxxDeps()` 一共枚举 **426 个依赖**，单个函数最多 51 个；
 * - 这些依赖是闭包内的模块级可变状态，所以「把函数搬走」必须先搬状态。
 *
 * 只看行数会得出「只要切一半就完事」的错误结论；看依赖扇出才知道该先做什么
 * （先把 40+ 个依赖收进一个显式 context，再按族搬迁）。
 *
 * 口径
 * ----
 * 对每个 ≥ `MIN_LINES` 行的前端 / 后端源文件统计：
 * - `lines`：行数；
 * - `imports`：import 语句条数（外部扇入）；
 * - `depsFns`：`function xxxDeps()` 数量（依赖注入包装层）；
 * - `depsEntries`：这些 `xxxDeps()` 里列出的依赖条目总数（真正的耦合强度）。
 *
 * 手动审计只看「变多」：任一文件任一指标超过基线即报出。减少则鼓励 `--update` 压低。
 *
 * 用法
 * ----
 *   bun run audit:giant-files                     # 对比基线
 *   bun run audit:giant-files -- --update         # 重写基线
 *   bun run audit:giant-files -- --report         # 只打印度量表（不判定）
 *   bun run audit:giant-files -- --json
 *   bun run audit:giant-files -- --min-lines 800  # 改报告筛选门槛（不是项目定义）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../../lib/args.mjs'
import { walkFiles } from '../../lib/walk.mjs'

const { has, repoRoot, value } = parseArgs()
const update = has('update')
const asJson = has('json')
const report = has('report')
// 报告筛选门槛：只统计 ≥ 3000 行的文件。和 `check_file_size.py` 用同一个默认值只是
// 为了让两份手写报告能对照，**不是**「巨型文件」的项目定义。
const minLines = Number(value('min-lines', '3000'))
const BASELINE = join(repoRoot, 'ops/checks/baselines/size/giant-files-baseline.json')
const ROOTS = ['homeos/frontend/src', 'homeos-store/frontend/src', 'homeos/backend/src', 'homeos-store/backend/src']
const EXTENSIONS = new Set(['.ts', '.vue', '.py'])

const IMPORT_LINE = /^\s*(import\s|from\s+\S+\s+import\s)/
const DEPS_FN = /^(?:\s*)function\s+\w+Deps\s*\(/

/** 统计一个文件的行数 / import 数 / deps 扇出。 */
export function measure(file) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const imports = lines.filter((line) => IMPORT_LINE.test(line)).length

  let depsFns = 0
  let depsEntries = 0
  for (let i = 0; i < lines.length; i += 1) {
    if (!DEPS_FN.test(lines[i])) continue
    depsFns += 1
    // 依赖对象是 `return {` 之后、列 0 的 `}` 之前；只数非空非注释行。
    let j = i + 1
    while (j < lines.length && !/^\s*return\s*\{/.test(lines[j])) j += 1
    j += 1
    while (j < lines.length && lines[j] !== '}' && lines[j] !== '  }') {
      const trimmed = lines[j].trim()
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) depsEntries += 1
      j += 1
    }
  }
  return { lines: lines.length - 1, imports, depsFns, depsEntries }
}

/** CLI 入口与可测逻辑分开：`measure` 被 `ops/checks/unittests/giant-files.test.ts` 覆盖。 */
function main() {
  const files = ROOTS.flatMap((root) => walkFiles(join(repoRoot, root), { extensions: EXTENSIONS })).sort()
  const counts = {}
  for (const file of files) {
    const found = measure(file)
    if (found.lines < minLines) continue
    counts[relative(repoRoot, file)] = found
  }

  const METRICS = ['lines', 'imports', 'depsFns', 'depsEntries']
  const totals = Object.fromEntries(METRICS.map((metric) => [metric, 0]))
  for (const found of Object.values(counts)) {
    for (const metric of METRICS) totals[metric] += found[metric]
  }

  if (update) {
    writeFileSync(BASELINE, `${JSON.stringify({ minLines, totals, files: counts }, null, 2)}\n`, 'utf8')
    console.log(
      `大文件基线已更新：${Object.keys(counts).length} 个文件，lines=${totals.lines} ` +
        `depsEntries=${totals.depsEntries}`,
    )
    return 0
  }

  const ranked = Object.entries(counts).sort((a, b) => b[1].depsEntries - a[1].depsEntries)

  if (report) {
    console.log(`大文件耦合度量（≥ ${minLines} 行，共 ${ranked.length} 个，仅作参考口径）`)
    console.log('  depsEntries  depsFns  imports    lines  file')
    for (const [file, found] of ranked.slice(0, 15)) {
      console.log(
        `  ${String(found.depsEntries).padStart(11)}  ${String(found.depsFns).padStart(7)}  ` +
          `${String(found.imports).padStart(7)}  ${String(found.lines).padStart(7)}  ${file}`,
      )
    }
    return 0
  }

  let baseline
  try {
    baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
  } catch (error) {
    console.error(`大文件审计：读不到基线（${error.message}）。首次启用请先跑 --update。`)
    return 2
  }

  const baselineFiles = baseline.files || {}
  // 行数不参与判定：`audit:file-size` 已单独给出行数，两处都判会让同一处新增被报两次。
  // 这里只看**扇出**。
  const JUDGED = ['imports', 'depsFns', 'depsEntries']
  const problems = []
  for (const [file, found] of Object.entries(counts).sort()) {
    const before = baselineFiles[file]
    if (!before) {
      problems.push(`${file}: 新出现 ≥ ${minLines} 行的文件（lines=${found.lines}）`)
      continue
    }
    for (const metric of JUDGED) {
      if (found[metric] > (before[metric] ?? 0)) {
        problems.push(`${file}: ${metric} ${before[metric] ?? 0} → ${found[metric]}`)
      }
    }
  }
  for (const metric of JUDGED) {
    const before = baseline.totals?.[metric] ?? 0
    if (totals[metric] > before) problems.push(`总数 ${metric}: ${before} → ${totals[metric]}`)
  }

  if (asJson) {
    console.log(JSON.stringify({ totals, violations: problems }, null, 2))
  } else if (problems.length > 0) {
    console.error(`大文件审计：${problems.length} 项变多`)
    for (const line of problems) console.error(`  - ${line}`)
    console.error('  说明：行数由 audit:file-size 单独报告；这里只看**扇出**（imports / deps）。')
    console.error('  拆分应先收依赖再搬代码，拆完跑 --update 压低基线（只该下降）。')
  } else {
    console.log(
      `大文件审计通过：${Object.keys(counts).length} 个文件，` +
        `lines=${totals.lines} depsEntries=${totals.depsEntries} imports=${totals.imports}`,
    )
    for (const [file, found] of ranked.slice(0, 5)) {
      console.log(`    ${file}: depsEntries=${found.depsEntries} depsFns=${found.depsFns} lines=${found.lines}`)
    }
  }

  return problems.length > 0 ? 1 : 0
}

// 被 import 时不执行。`import.meta.main` 是 Node 24+/Bun 的能力；老解释器上回退到
// 比较 `process.argv[1]`，避免「门禁静默不执行 → 永远绿」。
const invokedDirectly =
  import.meta.main ?? (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
if (invokedDirectly) process.exit(main())
