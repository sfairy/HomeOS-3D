#!/usr/bin/env node
/**
 * 前端静态检查批量入口：一个进程、一次遍历、一份 AST 缓存。
 *
 * ## 为什么合并
 *
 * 此前 `gate:static` 里这 10 条检查是 10 个独立步骤，每条都重新启动一次 node、重新遍历
 * 同一批源码（1974 个 `.ts/.vue`），其中 4 条还要各自 `ts.createSourceFile` 一遍。
 * 耗时几乎全在重复的 IO 与解析上，而不是断言本身。
 *
 * 合并后：`createContext()` 的 `walk` / `text` / `sourceFile` 三个缓存跨模块共享，
 * 同一文件只读一次、只解析一次（实测 10 条约 2.4s）。
 *
 * ## 失败语义不变
 *
 * - 任一模块失败 = 整体退出 1（门禁仍是「全绿或失败」，不给部分通过）；
 * - 单条失败不中断其余模块：跑完再看总账，避免「修好第一条才发现后面还有三条」；
 * - 失败模块打印自己的全部问题，成功模块只留一行摘要；
 * - 单项调试仍走原脚本（`bun run check:any` 等），本入口只是把它们串起来。
 *
 * ## 用法
 *
 * ```bash
 * bun run check:frontend                     # 全部
 * bun run check:frontend -- --module any     # 只跑名字匹配的模块（子串，可重复）
 * node ops/checks/run_frontend_checks.mjs --list
 * ```
 */
import { join } from 'node:path'
import process from 'node:process'

import { parseBatchArgs, selectModules, summarise } from '../lib/batch.mjs'
import { createContext } from '../lib/ratchet.mjs'
import { audit as anyAudit } from './frontend/check_any_baseline.mjs'
import { audit as aliasAudit } from './frontend/check_alias_ratchet.mjs'
import { audit as complexityAudit } from './frontend/check_frontend_complexity.mjs'
import { audit as stylesAudit } from './frontend/check_hardcoded_styles.mjs'
import { audit as cssTokensAudit } from './frontend/check_css_tokens.mjs'
import { audit as canvasAudit } from './frontend/check_canvas_breakpoints.mjs'
import { audit as perfAudit } from './frontend/check_perf_ratchet.mjs'
import { audit as restrictedAudit } from './frontend/check_restricted_syntax.mjs'
import { audit as uiOverflowAudit } from './frontend/ui_overflow_ratchet.mjs'

/**
 * `run(ctx)` 返回 `ratchet.js` 的 RatchetResult。
 *
 * 顺序沿用原 `gate:static`（快而确定的在前），便于与历史日志对照。
 * `covers` 供 `gates.mjs` 做覆盖对照，避免合并后「某个检查悄悄消失」。
 */
const MODULES = [
  { name: 'any', covers: ['check:any'], run: (ctx) => anyAudit(ctx) },
  { name: 'aliases', covers: ['check:aliases'], run: (ctx) => aliasAudit(ctx) },
  { name: 'css-duplicates', covers: ['check:css-duplicates'], run: (ctx) => cssDuplicates(ctx) },
  { name: 'css-tokens', covers: ['check:css-tokens'], run: (ctx) => cssTokensAudit(ctx) },
  { name: 'styles', covers: ['check:styles'], run: (ctx) => stylesAudit(ctx) },
  { name: 'ui-overflow', covers: ['check:ui-overflow'], run: (ctx) => uiOverflowAudit(ctx) },
  { name: 'perf-ratchet', covers: ['check:perf-ratchet'], run: (ctx) => perfAudit(ctx) },
  { name: 'canvas-breakpoints', covers: ['check:canvas-breakpoints'], run: (ctx) => canvasAudit(ctx) },
  { name: 'restricted-syntax', covers: ['check:restricted-syntax'], run: (ctx) => restrictedAudit(ctx) },
  {
    name: 'frontend-complexity',
    covers: ['check:frontend-complexity'],
    run: (ctx) => complexityAudit(ctx),
  },
]

/**
 * `merge-css-duplicates` 在 `ops/scripts/`（构建期也会用到），这里动态 import：
 * 只有真的跑这一条时才加载它的解析器。
 */
async function cssDuplicates(ctx) {
  const { audit } = await import('../scripts/merge-css-duplicates.mjs')
  return audit(ctx, { write: false })
}

/**
 * @param {{modules?: string[]}} [options]
 */
export async function run(options = {}) {
  const ctx = createContext(join(import.meta.dirname, '../..'))
  const selected = selectModules(MODULES, options.modules ?? [], 'run_frontend_checks')
  if (!selected) return 2

  const results = []
  for (const module of selected) {
    let outcome
    try {
      const result = await module.run(ctx)
      outcome = { name: module.name, ok: (result.problems ?? []).length === 0, result }
    } catch (error) {
      outcome = { name: module.name, ok: false, error }
    }
    results.push(outcome)

    if (outcome.ok) {
      console.log(`  PASS ${outcome.result.name}：${outcome.result.summary}`)
      continue
    }

    const result = outcome.result
    console.error(`  FAIL ${result?.name ?? module.name}`)
    if (outcome.error) console.error(outcome.error?.stack ?? outcome.error)
    for (const line of result?.problems ?? []) console.error(`    - ${line}`)
    for (const hint of result?.hints ?? []) console.error(`    ${hint}`)
  }

  return summarise(results, '前端静态检查')
}

const args = parseBatchArgs(process.argv.slice(2))
if (args.list) {
  for (const module of MODULES) console.log(module.name)
  process.exit(0)
}
process.exit(await run({ modules: args.modules }))
