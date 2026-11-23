#!/usr/bin/env node
/**
 * 巨型文件「耦合度」度量与棘轮（只读判定，只许下降）。
 *
 * 为什么不能只看行数
 * -----------------
 * `check:file-size` 已经在守「文件不能再变长」，但行数不是拆不动的真正原因。实测三个
 * 巨型编排文件（`studio-app/boot.ts` 4199 / `editor/home/lifecycle/boot.ts` 4917 /
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
 * 棘轮只看「变多」：任一文件任一指标超过基线即失败。减少不失败，但应 `--update` 压低。
 *
 * 用法
 * ----
 *   node ops/checks/check_giant_files.mjs            # 校验
 *   node ops/checks/check_giant_files.mjs --update   # 重写基线
 *   node ops/checks/check_giant_files.mjs --report   # 只打印度量表（不判定）
 *   node ops/checks/check_giant_files.mjs --json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseArgs } from '../lib/args.mjs'
import { walkFiles } from '../lib/walk.mjs'

const { has, repoRoot, value } = parseArgs()
const update = has('update')
const asJson = has('json')
const report = has('report')
const minLines = Number(value('min-lines', '1500'))
const BASELINE = join(repoRoot, 'ops/checks/giant-files-baseline.json')
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
      `巨型文件基线已更新：${Object.keys(counts).length} 个文件，lines=${totals.lines} ` +
        `depsEntries=${totals.depsEntries}`,
    )
    return 0
  }

  const ranked = Object.entries(counts).sort((a, b) => b[1].depsEntries - a[1].depsEntries)

  if (report) {
    console.log(`巨型文件耦合度量（≥ ${minLines} 行，共 ${ranked.length} 个）`)
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
    console.error(`巨型文件棘轮：读不到基线（${error.message}）。首次启用请先跑 --update。`)
    return 2
  }

  const baselineFiles = baseline.files || {}
  const problems = []
  for (const [file, found] of Object.entries(counts).sort()) {
    const before = baselineFiles[file]
    if (!before) {
      problems.push(`${file}: 新出现 ≥ ${minLines} 行的文件（lines=${found.lines}）`)
      continue
    }
    for (const metric of METRICS) {
      if (found[metric] > (before[metric] ?? 0)) {
        problems.push(`${file}: ${metric} ${before[metric] ?? 0} → ${found[metric]}`)
      }
    }
  }
  for (const metric of METRICS) {
    const before = baseline.totals?.[metric] ?? 0
    if (totals[metric] > before) problems.push(`总数 ${metric}: ${before} → ${totals[metric]}`)
  }

  if (asJson) {
    console.log(JSON.stringify({ totals, violations: problems }, null, 2))
  } else if (problems.length > 0) {
    console.error(`巨型文件棘轮失败：${problems.length} 项变多`)
    for (const line of problems) console.error(`  - ${line}`)
    console.error('  说明：行数已由 check:file-size 守；这里守的是**扇出**（imports / deps）。')
    console.error('  拆分应先收依赖再搬代码，拆完跑 --update 压低基线（只该下降）。')
  } else {
    console.log(
      `巨型文件棘轮通过：${Object.keys(counts).length} 个文件，` +
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
