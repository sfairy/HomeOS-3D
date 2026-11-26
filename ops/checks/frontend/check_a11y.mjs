#!/usr/bin/env node
/**
 * 可访问性冒烟扫描（axe-core + CDP）。
 *
 * ## 为什么需要
 *
 * 仓库里已有 35 处 `prefers-reduced-motion`、233 个带 `aria-` 的文件，但**没有任何
 * 自动化的可访问性判定**：对比度、可聚焦性、表单标签、按钮可访问名这些回归只能靠人看。
 *
 * ## 口径与棘轮
 *
 * - 只跑 WCAG 2.1 A/AA 规则集，按 `ruleId` 计数（不按节点数：一个规则命中 40 个节点
 *   和命中 4 个节点，修法往往是同一个）；
 * - 与基线比对时**只拦新增**：某条规则命中数变多即失败；变少永远通过；
 * - 基线文件 `ops/checks/baselines/frontend/a11y-baseline.json`。
 *
 * ## 前置
 *
 * 与视觉检查相同：开发服务器 + `--remote-debugging-port=9222` 的浏览器；
 * 需要登录的页面给 `HOMEOS_VISUAL_COOKIE`。
 *
 * ```bash
 * node ops/checks/frontend/check_a11y.mjs --update
 * node ops/checks/frontend/check_a11y.mjs
 * node ops/checks/frontend/check_a11y.mjs --only auth-login
 * ```
 *
 * 退出码：0 通过 / 1 有新增违规 / 3 环境缺失。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { BASES, cdpAvailable, evaluate, loadScenarios, withPage } from '../lib/cdp-session.mjs'

const require = createRequire(import.meta.url)
const HERE = import.meta.dirname
const REPO_ROOT = path.resolve(HERE, '../../..')
const SCENARIOS_PATH = path.join(REPO_ROOT, 'ops/checks/visual/scenarios.json')
const BASELINE_PATH = path.join(REPO_ROOT, 'ops/checks/baselines/frontend/a11y-baseline.json')

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const ONLY = (argValue('only', '') || '').split(',').filter(Boolean)
const UPDATE = process.argv.includes('--update')

/** axe 的浏览器构建；从 node_modules 读一次，避免每次都要网络。 */
function axeSource() {
  const file = require.resolve('axe-core/axe.min.js')
  return readFileSync(file, 'utf8')
}

async function scan(scenario, source) {
  return withPage(scenario, async ({ session }) => {
    // 注入走 Runtime.evaluate（而不是 initScript）：axe 不需要从文档开始监听。
    await session.send('Runtime.evaluate', { expression: source })
    return evaluate(
      session,
      `(async () => {
        const result = await axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
          resultTypes: ['violations'],
        })
        return result.violations.map((violation) => ({
          ruleId: violation.ruleId,
          impact: violation.impact,
          nodes: violation.nodes.length,
          help: violation.help,
        }))
      })()`,
    )
  })
}

function summarize(violations) {
  const counts = {}
  for (const violation of violations) {
    counts[violation.ruleId] = (counts[violation.ruleId] ?? 0) + 1
  }
  return counts
}

async function main() {
  const hasCookie = Boolean(process.env.HOMEOS_VISUAL_COOKIE)
  const scenarios = (await loadScenarios(SCENARIOS_PATH)).filter(
    (item) => (ONLY.length === 0 || ONLY.includes(item.name)) && (!item.requiresAuth || hasCookie),
  )
  if (scenarios.length === 0) {
    console.error('[a11y] 没有可扫描场景。')
    return 2
  }
  if (!(await cdpAvailable())) {
    console.error('[a11y] CDP 不可用；先启动带 --remote-debugging-port=9222 的浏览器。')
    return 3
  }
  try {
    const response = await fetch(BASES[scenarios[0].base], { signal: AbortSignal.timeout(2500) })
    if (!response.ok && response.status >= 500) throw new Error(String(response.status))
  } catch {
    console.error(`[a11y] 前端不可达：${BASES[scenarios[0].base]}；先跑 bun run dev。`)
    return 3
  }

  const source = axeSource()
  const current = {}
  for (const scenario of scenarios) {
    const violations = await scan(scenario, source)
    current[scenario.name] = summarize(violations)
    const total = violations.reduce((sum, item) => sum + 1, 0)
    console.log(`[a11y] ${scenario.name} 违规规则 ${total} 条`)
    for (const violation of violations) {
      console.log(`  - ${violation.ruleId}（${violation.impact}，${violation.nodes} 个节点）${violation.help}`)
    }
  }

  if (UPDATE) {
    mkdirSync(path.dirname(BASELINE_PATH), { recursive: true })
    writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
    console.log(`[a11y] 基线已写入 ${path.relative(REPO_ROOT, BASELINE_PATH)}`)
    return 0
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error('[a11y] 缺少基线；先跑 --update。')
    return 2
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const problems = []
  for (const [scenario, counts] of Object.entries(current)) {
    for (const [ruleId, count] of Object.entries(counts)) {
      const allowed = Number(baseline[scenario]?.[ruleId] ?? 0)
      if (count > allowed) problems.push(`${scenario}: ${ruleId} 由 ${allowed} 增至 ${count}`)
    }
  }
  if (problems.length) {
    console.error('[a11y] 出现新增违规：')
    for (const problem of problems) console.error(`  - ${problem}`)
    return 1
  }
  console.log('[a11y] 通过（无新增违规）')
  return 0
}

process.exit(await main())
