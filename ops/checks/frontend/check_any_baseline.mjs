#!/usr/bin/env node
/**
 * `any` 计数棘轮（studio 范围）。
 *
 * 为什么不是直接把 `biome.json` 的 `noExplicitAny` 设为 error：studio 里现存
 * 17000+ 处 `any`（大量是 WebGL / three.js 边界与历史 deps 包），一次性清零不现实；
 * 但「不再变多」可以从今天开始守。做法与 `check_silent_except.py` 一致：
 *
 * - 基线 `ops/checks/baselines/frontend/any-baseline.json` 记录**逐文件**计数与总数；
 * - 任一文件比基线多、或总数比基线多 → 失败（新增文件从 0 起算）；
 * - 清理后重跑 `--update` 压低基线，基线只降不升。
 *
 * 统计口径：把 `any` 当作独立类型 token（`(?<![A-Za-z0-9_$])any(?![A-Za-z0-9_$])`），
 * 因此 `: any`、`<any>`、`as any`、`any[]`、`Record<string, any>` 都算，`company`、
 * `many` 等标识符不算。
 *
 * 用法（单跑；批量入口 `bun run check:frontend` 也会带上它）：
 *   node ops/checks/check_any_baseline.mjs            # 校验
 *   node ops/checks/check_any_baseline.mjs --update   # 重写基线（只能变小才该跑）
 *   node ops/checks/check_any_baseline.mjs --json     # 机器可读输出
 */
import { join } from 'node:path'

import { isMain } from '../../lib/cli.mjs'
import { createCli, defineRatchet, singleMetric } from '../../lib/ratchet.mjs'

const SCOPE = 'homeos/frontend/src/studio'
const BASELINE_REL = 'ops/checks/baselines/frontend/any-baseline.json'
const EXTENSIONS = new Set(['.ts', '.tsx', '.vue', '.mjs', '.js'])
const ANY_TOKEN = /(?<![A-Za-z0-9_$])any(?![A-Za-z0-9_$])/g

/**
 * 按目录汇总存量：基线是逐文件的，「总数 16914」本身不告诉任何人该先收哪一块。
 * 分组刻意用业务分区而不是 `studio/` 一整块：app（编辑器/渲染）与 runtime（舞台逐文件
 * 产物）的容忍度不同，混在一起看会掩盖「舞台产物本可以更干净」这个事实。
 */
const AREA_RULES = [
  ['studio/app/3d-studio', 'studio/app/3d-studio'],
  ['studio/app/editor', 'studio/app/editor'],
  ['studio/app/renderer', 'studio/app/renderer'],
  ['studio/app/bridge', 'studio/app/bridge'],
  ['studio/app/shared', 'studio/app/shared'],
  ['studio/app/display', 'studio/app/display'],
  ['studio/app/others', 'studio/app'],
  ['studio/runtime', 'studio/runtime'],
  ['studio/chrome', 'studio/chrome'],
  ['studio/platform', 'studio/platform'],
]

/**
 * 扫描 `studio/**` 的 `any` 计数。
 *
 * @param {ReturnType<typeof createContext>} ctx
 * @returns {{counts: Record<string, number>, total: number, byArea: Map<string, number>}}
 */
export function scan(ctx) {
  const counts = {}
  let total = 0
  for (const file of ctx.walk(SCOPE, EXTENSIONS)) {
    const count = (ctx.text(file).match(ANY_TOKEN) || []).length
    if (count === 0) continue
    counts[ctx.rel(file)] = count
    total += count
  }

  const byArea = new Map(AREA_RULES.map(([label]) => [label, 0]))
  for (const [file, count] of Object.entries(counts)) {
    const area = AREA_RULES.find(
      ([, prefix]) => file.startsWith(`homeos/frontend/src/${prefix}/`) || file === `homeos/frontend/src/${prefix}`,
    )
    const label = area ? area[0] : 'others'
    byArea.set(label, (byArea.get(label) ?? 0) + count)
  }
  for (const [label, count] of [...byArea]) {
    if (count === 0) byArea.delete(label)
  }
  return { counts, total, byArea }
}

export const { audit } = defineRatchet({
  name: 'any 棘轮',
  baselineRel: BASELINE_REL,
  // 单指标计数：`counts` 是 `{file: number}`，包装成 `{file: {count}}` 交给通用骨架。
  scan: (ctx) => {
    const scanned = scan(ctx)
    return { counts: singleMetric(scanned.counts), totals: { count: scanned.total, byArea: scanned.byArea } }
  },
  metrics: ['count'],
  summary: (counts, totals) => `${Object.keys(counts).length} 个文件 / 共 ${totals.count} 处`,
  formatProblem: (file, _metric, before, after) => `${file}: ${before} → ${after}（+${after - before}）`,
  payload: (counts, totals) => ({
    total: totals.count,
    files: Object.fromEntries(Object.entries(counts).map(([file, found]) => [file, found.count])),
  }),
  // 总数兜底：逐文件都没超、但总数超了（新增文件或计数转移）也要拦。
  extraProblems: ({ totals, baseline }) => {
    const before = baseline.total ?? 0
    return totals.count > before ? [`总数 ${before} → ${totals.count}（+${totals.count - before}）`] : []
  },
  hints: ({ baselineRel }) => [
    '说明：这是「不许变多」的门禁。确实需要新增 any 时，先在评审里说明理由，',
    `再改 \`${baselineRel}\`（基线只该被 --update 压低）。`,
  ],
  notes: ({ totals }) => {
    const { byArea } = totals
    return [
      '存量分布（按目录）：',
      ...[...byArea].map(([area, count]) => {
        const share = totals.count > 0 ? ((count / totals.count) * 100).toFixed(1) : '0.0'
        return `${area.padEnd(28)} ${String(count).padStart(6)} 处  ${share.padStart(5)}%`
      }),
    ]
  },
})

/** 单跑入口：`--update` 重写基线，`--json` 机器可读。 */
export const cli = createCli(audit, { repoRoot: join(import.meta.dirname, '../../..') })

if (isMain(import.meta.url)) process.exit(cli())
