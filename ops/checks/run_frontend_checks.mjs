#!/usr/bin/env node
/**
 * 前端静态检查批量入口：一个进程、一次遍历、一份 AST 缓存。
 *
 * ## 为什么合并
 *
 * 同一批源码（近 2000 个 `.ts/.vue`）被多条检查反复遍历时，耗时几乎全在重复的 IO 与
 * 解析上，而不是断言本身。合并后 `createContext()` 的 `walk` / `text` / `sourceFile`
 * 三个缓存跨模块共享，同一文件只读一次、只解析一次。
 *
 * ## 保留哪些
 *
 * 只保留**能指出具体语义错误**的两条守卫：离线计数口径（按设备而非按实体）、受限写法
 * （中文格式与实体显示名必须走统一出口）。计数类 / 外观类 / 命名形态类已全部删除：
 * 它们把「代码长什么样」固化成门槛，基线只能靠重录维持。
 *
 * ## 失败语义不变
 *
 * - 任一模块失败 = 整体退出 1（门禁仍是「全绿或失败」，不给部分通过）；
 * - 单条失败不中断其余模块：跑完再看总账，避免「修好第一条才发现后面还有三条」；
 * - 失败模块打印自己的全部问题，成功模块只留一行摘要；
 * - 单项调试仍走原脚本（`bun run check:offline-counting` 等），本入口只是把它们串起来。
 *
 * ## 用法
 *
 * ```bash
 * bun run check:frontend                        # 全部
 * bun run check:frontend -- --module aliases    # 只跑名字匹配的模块（子串，可重复）
 * node ops/checks/run_frontend_checks.mjs --list
 * ```
 */
import { join } from 'node:path'
import process from 'node:process'

import { parseBatchArgs, selectModules, summarise } from '../lib/batch.mjs'
import { createContext } from '../lib/ratchet.mjs'
import { audit as offlineCountingAudit } from './frontend/check_offline_counting.mjs'
import { audit as restrictedAudit } from './frontend/check_restricted_syntax.mjs'

/**
 * `run(ctx)` 返回 `ratchet.js` 的 RatchetResult。
 *
 * 顺序沿用原 `gate:static`（快而确定的在前），便于与历史日志对照。
 * `covers` 供 `gates.mjs` 做覆盖对照，避免合并后「某个检查悄悄消失」。
 */
const MODULES = [
  {
    name: 'offline-counting',
    covers: ['check:offline-counting'],
    run: () => offlineCountingAudit(),
  },
  { name: 'restricted-syntax', covers: ['check:restricted-syntax'], run: (ctx) => restrictedAudit(ctx) },
]

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
