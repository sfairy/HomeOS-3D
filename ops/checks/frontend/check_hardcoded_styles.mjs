#!/usr/bin/env node
/**
 * 硬编码样式棘轮（颜色字面量 / 动效时长字面量）。
 *
 * 为什么不做一次性全量 codemod：审计实测 `homeos/frontend/src` 里有 2701 处硬编码色、
 * 706 种色值。一次改 2701 行无法视觉 review，也无法判断哪一处是真冗余、哪一处是
 * 渐变里的必要中间色。但「不再变多」可以从今天开始守 —— 做法与
 * `check_frontend_complexity.mjs` / `check_any_baseline.mjs` 同一范式：
 *
 * - 基线 `ops/checks/baselines/frontend/hardcoded-styles-baseline.json` 记录**逐文件**的计数；
 * - 任一文件比基线多，或新文件出现字面量 → 失败；
 * - 清理后跑 `--update` 压低基线，**基线只降不升**。
 *
 * 统计口径（只统计"本该用令牌"的写法，不误伤合法字面量）：
 *   color  —— `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`
 *   duration —— `123ms` / `1.2s` / `.5s`（裸时长；`0s`/`0ms` 不计，等于无动效）
 *   !important —— 单独计数（审计点名 364 处，同样是"压不住才写"的坏味道）
 *
 * 豁免（不算违规）：
 *   - 注释行（`//`、块注释、HTML 注释里的 `#`）
 *   - `#id` 选择器（`#app { … }`）—— `#` 后跟字母且不像 hex 的
 *   - SVG 的 `viewBox` / `id` / `url(#x)` 引用
 *   - `cubic-bezier(0.16, 1, 0.3, 1)` 里的数字（不是时长）
 *   - 媒体查询里的 `1100px`（带单位 px 的一律不认）
 *
 * 用法（单跑；批量入口 `bun run check:frontend` 也会带上它）：
 *   node ops/checks/check_hardcoded_styles.mjs           # 校验（CI / pre-commit）
 *   node ops/checks/check_hardcoded_styles.mjs --update  # 重写基线（只该在数字变小时跑）
 *   node ops/checks/check_hardcoded_styles.mjs --json    # 机器可读输出
 */
import { join } from 'node:path'

import { isMain } from '../../lib/cli.mjs'
import { createCli, defineRatchet } from '../../lib/ratchet.mjs'

const BASELINE_REL = 'ops/checks/baselines/frontend/hardcoded-styles-baseline.json'

/** 与 check_frontend_complexity.mjs 保持一致的两棵前端源码树。 */
const ROOTS = ['homeos/frontend/src', 'homeos-store/frontend/src']
const EXTENSIONS = new Set(['.css', '.scss', '.vue', '.ts', '.js'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '__snapshots__'])
const METRICS = ['color', 'duration', 'important']

/** `#abc` / `#abcd` / `#aabbcc` / `#aabbccdd`；前面不能紧跟标识符字符（排除 `url(#id)`）。 */
const HEX_COLOR = /(?<![\w&])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g
/** 时长字面量：前面是冒号/空格/逗号，且不是 `0s` / `0ms`。 */
const DURATION = /(?<![\w.-])(?!0(?:ms|s)\b)\d+(?:\.\d+)?m?s\b/g

/**
 * 去掉不参与统计的片段，避免误伤。
 *
 * 只做"抹平等长空白"而不是删行：抹成空格能保住原字符偏移，
 * 万一以后要给出行列号也不用重新算。
 */
export function stripNonCode(text) {
  let out = text
  // 块注释
  out = out.replace(/\/\*[\s\S]*?\*\//g, (match) => ' '.repeat(match.length))
  // HTML 注释
  out = out.replace(/<!--[\s\S]*?-->/g, (match) => ' '.repeat(match.length))
  // 行注释（不跨越换行，避免吃掉后面的代码）。前置 `[^:]` 让协议里的 `//` 不被误判。
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, (match) => ' '.repeat(match.length))
  // url(#some-id) / href="#anchor"：`#` 后面不是 hex 的本来就匹配不上 HEX_COLOR，
  // 但 `url(#abc)` 会被当成 6 位以下的短 hex，这里显式抹掉。
  out = out.replace(/url\(\s*#[^)]*\)/g, (match) => ' '.repeat(match.length))
  return out
}

/** 统计单个文件的 color / duration / important。 */
export function countText(raw) {
  const text = stripNonCode(raw)
  return {
    color: (text.match(HEX_COLOR) || []).length,
    duration: (text.match(DURATION) || []).length,
    important: (text.match(/!important/g) || []).length,
  }
}

/**
 * @param {ReturnType<typeof createContext>} ctx
 */
export function scan(ctx) {
  const counts = {}
  const totals = { files: 0, color: 0, duration: 0, important: 0 }
  for (const file of ctx.walkMany(ROOTS, EXTENSIONS, SKIP_DIRS)) {
    const result = countText(ctx.text(file))
    if (result.color === 0 && result.duration === 0 && result.important === 0) continue
    counts[ctx.rel(file)] = result
    totals.files += 1
    totals.color += result.color
    totals.duration += result.duration
    totals.important += result.important
  }
  return { counts, totals }
}

export const { audit } = defineRatchet({
  name: '硬编码样式棘轮',
  baselineRel: BASELINE_REL,
  scan,
  metrics: METRICS,
  summary: (counts, totals) =>
    `${totals.files} 个文件 / color=${totals.color} duration=${totals.duration} important=${totals.important}`,
  formatProblem: (file, metric, before, after) => `${file}: ${metric} ${before} -> ${after}`,
  // 新文件不按「变多」表述：它此前根本没被管理过，措辞要让人知道是「第一次引入硬编码」。
  extraProblems: ({ counts, baseline }) =>
    Object.keys(counts)
      .sort()
      .filter((file) => !baseline.files?.[file])
      .map((file) => {
        const found = counts[file]
        return (
          `${file}: 新文件引入硬编码（color=${found.color} duration=${found.duration}` +
          `${found.important ? ` important=${found.important}` : ''}）`
        )
      }),
  hints: [
    '说明：新增颜色请用 --hos-color-* / --hos-bg-* / --hos-fg-* 令牌；',
    '      新增时长请用 --hos-dur-{fast,base,slow,slower}。',
    '      基线只该被 --update 压低，不要手工改大。',
  ],
})

/** 单跑入口：`--update` 重写基线，`--json` 机器可读。 */
export const cli = createCli(audit, { repoRoot: join(import.meta.dirname, '../../..') })

if (isMain(import.meta.url)) process.exit(cli())
