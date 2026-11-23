#!/usr/bin/env node
/**
 * 别名 / 模块级可变状态棘轮（只读判定，只许下降）。
 *
 * 为什么需要它
 * ------------
 * 三个巨型编排文件（`studio-app/boot.ts` 4.2k、`editor/home/lifecycle/boot.ts` 4.9k、
 * `runtime/core/stage.ts` 4.9k）之所以难拆，很大一部分原因不是长度，而是**命名被别名吃掉**：
 *
 * - `moveStepMeters2` / `categoryControl2` 这类 `xxx2` 别名：说明同一个名字在一个作用域里
 *   撞了两次，读代码时得先去 import 表才能知道 `2` 是哪个来源；
 * - `xxxImpl` 别名：把「转发到真实实现」写成名字的一部分，同一个函数在文件里有两个名字；
 * - 模块级 `let` / `var`：跨函数共享的可变状态，是「这个文件不能机械拆分」的根因。
 *
 * 三者都不是本次能机械清完的（清错一个就是运行时 undefined），但**可以立刻停止变多**。
 * 拆分阶段每完成一块，跑 `--update` 压低基线即可。
 *
 * 口径
 * ----
 * - `alias2`：`import { a as a2 }` 或 `import { a2 }` 中字面量以「非数字 + 2」结尾的绑定名；
 * - `impl`：文件里出现 `XxxImpl` 形态的标识符（含声明与使用，按出现次数计）；
 * - `moduleLet`：行首的 `let` / `var` 声明（模块级可变状态）。
 *
 * 用法（单跑；批量入口 `bun run check:frontend` 也会带上它）：
 *   node ops/checks/check_alias_ratchet.mjs            # 校验
 *   node ops/checks/check_alias_ratchet.mjs --update   # 重写基线（只在数字下降时跑）
 *   node ops/checks/check_alias_ratchet.mjs --json
 *   node ops/checks/check_alias_ratchet.mjs --top 15   # 打印最脏的文件
 */
import { join } from 'node:path'

import { isMain } from '../../lib/cli.mjs'
import {
  createCli,
  createContext,
  perFileProblems,
  readBaseline,
  totalProblems,
  writeBaseline,
} from '../../lib/ratchet.mjs'

const BASELINE_REL = 'ops/checks/baselines/frontend/alias-baseline.json'
const ROOTS = ['homeos/frontend/src']
const EXTENSIONS = new Set(['.ts', '.vue'])
const METRICS = ['alias2', 'impl', 'moduleLet']

/** `import { a as a2 } from '...'` / `import { b2 } from '...'`：抽出被 `2` 污染的绑定名。 */
const IMPORT_BLOCK = /import\s*(?:type\s*)?\{([^}]*)\}\s*from/g
const ALIAS2 = /^[A-Za-z_$][\w$]*[A-Za-z_$]2$/
const IMPL = /\b[A-Za-z_$][\w$]*Impl\b/g
const MODULE_LET = /^(?:let|var)\s+/gm

/**
 * @param {string} text
 * @returns {{alias2: number, impl: number, moduleLet: number}}
 */
function countText(text) {
  let alias2 = 0
  for (const match of text.matchAll(IMPORT_BLOCK)) {
    for (const raw of match[1].split(',')) {
      const spec = raw.trim()
      if (!spec) continue
      const local = spec.includes(' as ') ? spec.split(' as ').pop().trim() : spec
      if (ALIAS2.test(local)) alias2 += 1
    }
  }
  return {
    alias2,
    impl: (text.match(IMPL) || []).length,
    moduleLet: (text.match(MODULE_LET) || []).length,
  }
}

/**
 * @param {ReturnType<typeof createContext>} ctx
 */
export function scan(ctx) {
  const counts = {}
  let totals = { alias2: 0, impl: 0, moduleLet: 0 }
  for (const file of ctx.walkMany(ROOTS, EXTENSIONS)) {
    const found = countText(ctx.text(file))
    if (found.alias2 === 0 && found.impl === 0 && found.moduleLet === 0) continue
    counts[ctx.rel(file)] = found
    totals = {
      alias2: totals.alias2 + found.alias2,
      impl: totals.impl + found.impl,
      moduleLet: totals.moduleLet + found.moduleLet,
    }
  }
  return { counts, totals }
}

/**
 * @param {ReturnType<typeof createContext>} ctx
 * @param {{update?: boolean, top?: number}} [options]
 */
export function audit(ctx, { update = false, top = 10 } = {}) {
  const baselinePath = join(ctx.repoRoot, BASELINE_REL)
  const { counts, totals } = scan(ctx)

  if (update) {
    writeBaseline(baselinePath, { totals, files: counts })
    return {
      name: '别名棘轮',
      summary:
        `基线已更新：${Object.keys(counts).length} 个文件，` +
        `alias2=${totals.alias2} impl=${totals.impl} moduleLet=${totals.moduleLet}`,
      updated: true,
      problems: [],
    }
  }

  const loaded = readBaseline(baselinePath, ctx.rel(baselinePath))
  if (!loaded.ok) return { name: '别名棘轮', summary: '', problems: [loaded.error] }

  const baselineFiles = loaded.data.files || {}
  const baselineTotals = loaded.data.totals || {}
  const problems = [
    ...perFileProblems(
      counts,
      baselineFiles,
      METRICS,
      (file, metric, before, after) => `${file}: ${metric} ${before} → ${after}`,
    ),
    ...totalProblems(
      totals,
      baselineTotals,
      METRICS,
      (metric, before, after) => `总数 ${metric}: ${before} → ${after}`,
    ),
  ]

  const worst = Object.entries(counts)
    .sort((a, b) => b[1].alias2 + b[1].impl + b[1].moduleLet - (a[1].alias2 + a[1].impl + a[1].moduleLet))
    .slice(0, top)

  return {
    name: '别名棘轮',
    summary:
      `${Object.keys(counts).length} 个文件，` +
      `alias2=${totals.alias2} impl=${totals.impl} moduleLet=${totals.moduleLet}`,
    problems,
    hints:
      problems.length > 0
        ? [
            '说明：新增别名意味着命名冲突或转发层；请在新代码里直接用原名。',
            '拆分后请跑 --update 压低基线（基线只该下降）。',
          ]
        : [],
    notes:
      problems.length === 0
        ? worst.map(
            ([file, found]) => `${file}: alias2=${found.alias2} impl=${found.impl} moduleLet=${found.moduleLet}`,
          )
        : [],
    json: { totals, baselineTotals, problems },
  }
}

/** 单跑入口。 */
export const cli = createCli(audit, { repoRoot: join(import.meta.dirname, '../../..') })

if (isMain(import.meta.url)) process.exit(cli())
