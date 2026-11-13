#!/usr/bin/env node
/**
 * 重复代码棘轮（jscpd 包装，只读判定）。
 *
 * 为什么需要它
 * ------------
 * 仓库已有「文件规模」「函数复杂度」「`any` 数量」三类棘轮，唯独没有一条在看**重复代码**。
 * 于是「再抄一份」永远不会触发红灯：每次抄写都小到不值得评审，累积起来就是同一张契约表
 * 存在三份、同一份默认值存在两处。本脚本把 jscpd 的检测结果变成可比较的基线。
 *
 * 口径（与 `.jscpd.json` 同源，不要在两处各写一份）
 * ------------------------------------------------
 * - M1 精确克隆：token 级完全相同（空白不参与比较），连续 ≥ `minLines` 行且 ≥ `minTokens` 个 token；
 * - `mode: "strict"`：jscpd 里检出率最高的模式。选它而不是 `weak`（跳过注释）是刻意的 ——
 *   门禁宁可多报也不漏报，被跳过的注释差异不该把真实重复藏起来。
 * - 近似重复（相似度阈值）由 `ops/checks/dup_near.py` 单独出清单，**不进本门禁**：
 *   相似度带主观阈值，卡在 CI 上会制造为过门禁而改代码的动机。
 *
 * 棘轮语义
 * --------
 * 基线记录两样东西：
 *   1. `totals.duplicatedLines` —— 重复行总数；
 *   2. `entries` —— 每个克隆的指纹 + 出现位置 + 行数。
 *
 * 判定：
 * - `duplicatedLines` **增加即失败**；
 * - 出现基线里没有的指纹 **即失败**（新长出来的重复，即使总量因为别处删掉而没涨）；
 * - 例外：若同一对文件在基线里有**更大的**克隆（`entries[].lines` 更大），则该指纹算
 *   「重复变小」而不是「新增」。没有这条例外，把一个 43 行克隆修到 19 行会被判成
 *   「新增 1 处重复」—— 门禁反过来惩罚改善。总量棘轮仍是兜底：老克隆还在、又长新的，
 *   `duplicatedLines` 必然上升。
 * - `percentage` 只打印不判定：删掉一个干净的大文件会让占比**上升**，拿它当闸门会误伤。
 *
 * 指纹为什么要归一化片段
 * ----------------------
 * 直接哈希原文会被「整体缩进变了」这类纯排版改动全部失效 —— 而这恰好是搬运代码时最常见
 * 的副作用。因此每行去掉首尾空白、丢掉空行后再哈希：缩进无关，内容相关。行号**不进**指纹，
 * 上下插入几行不会误报。
 *
 * 用法
 * ----
 *     node ops/checks/check_duplicates.mjs                  # 门禁（默认）
 *     node ops/checks/check_duplicates.mjs --report         # 只打印，不判定
 *     node ops/checks/check_duplicates.mjs --update         # 重写基线（只能变小或等价，见下）
 *     node ops/checks/check_duplicates.mjs --json           # 机器可读
 *     node ops/checks/check_duplicates.mjs --artifact before # 另存归一化报告到 docs/analysis/code-duplication/<name>.json
 *
 * `--update` 允许重写基线，但**拒绝把总量改大**：要放宽必须显式传 `--allow-increase`，
 * 让「重复度上升」成为一次需要写明理由的评审动作，而不是顺手 `--update` 掉。
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const BASELINE_PATH = path.join(REPO_ROOT, 'ops/checks/duplication-baseline.json')
const CONFIG_PATH = path.join(REPO_ROOT, '.jscpd.json')
const ANALYSIS_DIR = path.join(REPO_ROOT, 'docs/analysis/code-duplication')

/**
 * 扫描根目录。与 `.jscpd.json` 的 `ignore` 配合使用：
 * 这里只列「哪些目录算源码」，排除规则统一交给配置文件，避免两处分叉。
 */
const SCAN_ROOTS = [
  'homeos/frontend/src',
  'homeos/frontend/scripts',
  'homeos/backend/src',
  'homeos-store/frontend/src',
  'homeos-store/backend/src',
  'packages/shared/src',
  'packages/shared-py',
  'ops',
]

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)
const flagValue = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : null
}

const MODE_REPORT = hasFlag('report')
const MODE_UPDATE = hasFlag('update')
const ALLOW_INCREASE = hasFlag('allow-increase')
const AS_JSON = hasFlag('json')
const ARTIFACT = flagValue('artifact')

/** 相对仓库根的路径：报告里出现绝对路径会把本机用户名写进版本库。 */
function toRelative(absolute) {
  const rel = path.relative(REPO_ROOT, absolute)
  return rel.startsWith('..') ? absolute : rel.split(path.sep).join('/')
}

/** 指纹用的片段归一化：丢缩进、丢空行，保留内容与顺序。 */
function normalizeFragment(fragment) {
  return fragment
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * 克隆指纹。路径对排序后再拼：jscpd 的 first/second 顺序在个别情况下会互换，
 * 不排序会让同一个克隆在两个方向上算出两个指纹。
 */
function fingerprint(firstPath, secondPath, fragment) {
  const [a, b] = [firstPath, secondPath].sort()
  return createHash('sha1')
    .update(`${a}\u0000${b}\u0000${normalizeFragment(fragment)}`)
    .digest('hex')
}

/** 无序路径对：用来判断「同一对文件之间」的重复规模是否缩小了。 */
function pairKey(firstPath, secondPath) {
  return [firstPath, secondPath].sort().join('\u0000')
}

function readJscpdVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'node_modules/jscpd/package.json'), 'utf8')).version
  } catch {
    return 'unknown'
  }
}

function readConfig() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  return { minLines: raw.minLines, minTokens: raw.minTokens, mode: raw.mode, format: raw.format }
}

/** 跑 jscpd，返回已归一化的结果。 */
function runJscpd() {
  const binary = path.join(REPO_ROOT, 'node_modules/.bin', process.platform === 'win32' ? 'jscpd.cmd' : 'jscpd')
  if (!fs.existsSync(binary)) {
    throw new Error('未找到 jscpd。先执行 `bun install`（jscpd 已登记为根 devDependency）。')
  }
  const outputDir = path.join(ANALYSIS_DIR, 'report')
  fs.mkdirSync(outputDir, { recursive: true })

  const roots = SCAN_ROOTS.filter((root) => fs.existsSync(path.join(REPO_ROOT, root)))
  const result = spawnSync(binary, [...roots, '-c', CONFIG_PATH, '-o', outputDir], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`jscpd 退出码 ${result.status}\n${result.stdout || ''}${result.stderr || ''}`)
  }

  const reportPath = path.join(outputDir, 'jscpd-report.json')
  if (!fs.existsSync(reportPath)) {
    throw new Error(`jscpd 未生成报告：${reportPath}`)
  }
  const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8'))

  const clones = (raw.duplicates ?? []).map((clone) => {
    const firstPath = toRelative(clone.firstFile.name)
    const secondPath = toRelative(clone.secondFile.name)
    return {
      format: clone.format,
      kind: clone.kind,
      lines: clone.lines,
      tokens: clone.tokens,
      first: { path: firstPath, start: clone.firstFile.start, end: clone.firstFile.end },
      second: { path: secondPath, start: clone.secondFile.start, end: clone.secondFile.end },
      fingerprint: fingerprint(firstPath, secondPath, clone.fragment ?? ''),
      // 只留两行预览：完整片段在 HTML 报告里（本地生成、不进版本库）。
      // 把 199 个克隆的整段源码提交进 docs/ 会让仓库多出几百 KB 的重复内容 —— 那是新的重复。
      preview: (clone.fragment ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 2)
        .map((line) => (line.length > 120 ? `${line.slice(0, 117)}...` : line)),
    }
  })

  const totals = raw.statistics.total
  const byFormat = {}
  for (const [name, stat] of Object.entries(raw.statistics.formats ?? {})) {
    byFormat[name] = {
      sources: stat.sources,
      lines: stat.lines,
      duplicatedLines: stat.duplicatedLines,
      percentage: Number(stat.percentage.toFixed(4)),
      clones: stat.clones,
    }
  }

  return {
    tool: 'jscpd',
    toolVersion: readJscpdVersion(),
    config: readConfig(),
    scanRoots: SCAN_ROOTS,
    totals: {
      sources: totals.sources,
      lines: totals.lines,
      clones: totals.clones,
      duplicatedLines: totals.duplicatedLines,
      percentage: Number(totals.percentage.toFixed(4)),
      tokens: totals.tokens,
      duplicatedTokens: totals.duplicatedTokens,
    },
    byFormat,
    clones: clones.sort((a, b) => b.lines - a.lines),
  }
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null
  const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))

  // 兼容第一版基线（只有 `fingerprints: string[]`）：那版没有路径与行数，
  // 因此无法判断「同一对文件之间缩小了」，只能按严格模式判。读到就照严格判，
  // 并在报告里提示需要 `--update` 升级格式。
  if (Array.isArray(raw.fingerprints) && !Array.isArray(raw.entries)) {
    return {
      ...raw,
      legacy: true,
      entries: raw.fingerprints.map((fp) => ({ fingerprint: fp, first: null, second: null, lines: 0 })),
    }
  }
  return { ...raw, legacy: false, entries: raw.entries ?? [] }
}

function buildBaseline(current) {
  return {
    tool: current.tool,
    toolVersion: current.toolVersion,
    config: current.config,
    scanRoots: current.scanRoots,
    totals: current.totals,
    byFormat: current.byFormat,
    // 存路径与行数，而不只是指纹：判断「新增」时需要区分
    // 「凭空长出一处重复」与「同一对文件之间的重复从 43 行缩到 19 行」。
    entries: current.clones
      .map((clone) => ({
        fingerprint: clone.fingerprint,
        first: clone.first.path,
        second: clone.second.path,
        lines: clone.lines,
      }))
      .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)),
  }
}

function pct(value) {
  return `${value.toFixed(3)}%`
}

function summarize(current, baseline) {
  const lines = []
  const delta = baseline ? current.totals.duplicatedLines - baseline.totals.duplicatedLines : 0
  lines.push(
    `重复代码：${current.totals.duplicatedLines} 行 / ${current.totals.lines} 行 (${pct(current.totals.percentage)})，${current.totals.clones} 个克隆`,
  )
  if (baseline) {
    const sign = delta > 0 ? '+' : ''
    lines.push(`基线对比：${sign}${delta} 行 (基线 ${baseline.totals.duplicatedLines} 行)`)
  }
  for (const [name, stat] of Object.entries(current.byFormat).sort((a, b) => b[1].lines - a[1].lines)) {
    lines.push(
      `  ${name.padEnd(12)} ${String(stat.sources).padStart(5)} 文件 ${String(stat.lines).padStart(8)} 行 重复 ${String(stat.duplicatedLines).padStart(6)} 行 (${pct(stat.percentage)})`,
    )
  }
  return lines
}

function main() {
  const current = runJscpd()
  const baseline = loadBaseline()

  fs.mkdirSync(ANALYSIS_DIR, { recursive: true })
  if (ARTIFACT) {
    fs.writeFileSync(
      path.join(ANALYSIS_DIR, `${ARTIFACT}.json`),
      `${JSON.stringify({ generatedAt: new Date().toISOString(), ...current }, null, 2)}\n`,
      'utf8',
    )
  }

  if (MODE_UPDATE) {
    if (baseline && !ALLOW_INCREASE && current.totals.duplicatedLines > baseline.totals.duplicatedLines) {
      console.error(
        `拒绝写回基线：重复行从 ${baseline.totals.duplicatedLines} 涨到 ${current.totals.duplicatedLines}。` +
          '\n确实要放宽请加 --allow-increase，并在 PR 里写明理由。',
      )
      process.exit(1)
    }
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(buildBaseline(current), null, 2)}\n`, 'utf8')
    if (!AS_JSON) {
      console.log(`已写入基线 ${path.relative(REPO_ROOT, BASELINE_PATH)}（${current.totals.duplicatedLines} 行重复）`)
      for (const line of summarize(current, baseline)) console.log(line)
    }
    return
  }

  for (const line of summarize(current, baseline)) {
    if (!AS_JSON) console.log(line)
  }

  if (MODE_REPORT || !baseline) {
    if (!baseline) console.log('\n无基线文件：本次只报告。用 --update 建立基线后再纳入门禁。')
    return
  }

  const known = new Set(baseline.entries.map((entry) => entry.fingerprint))
  // 同一对文件在基线里的最大重复行数。用来区分两种「指纹不在基线里」：
  //   (a) 凭空长出一处重复 —— 该失败；
  //   (b) 同一对文件之间的重复变小了（43 行 → 19 行）或标识符改名 —— 指纹必然变，
  //       但这不是新增重复，不该红灯。总量棘轮仍在兜底：如果老的还在、又长出新的，
  //       duplicatedLines 会上升，(b) 的豁免也就无从生效。
  const pairCeiling = new Map()
  for (const entry of baseline.entries) {
    if (!entry.first || !entry.second) continue
    const key = pairKey(entry.first, entry.second)
    pairCeiling.set(key, Math.max(pairCeiling.get(key) ?? 0, entry.lines))
  }

  const fresh = []
  const shrunk = []
  for (const clone of current.clones) {
    if (known.has(clone.fingerprint)) continue
    const ceiling = pairCeiling.get(pairKey(clone.first.path, clone.second.path)) ?? 0
    if (ceiling >= clone.lines) shrunk.push(clone)
    else fresh.push(clone)
  }
  const failures = []

  if (current.totals.duplicatedLines > baseline.totals.duplicatedLines) {
    failures.push(
      `重复行数上升：${baseline.totals.duplicatedLines} → ${current.totals.duplicatedLines}（+${current.totals.duplicatedLines - baseline.totals.duplicatedLines}）`,
    )
  }
  if (fresh.length > 0) {
    failures.push(`新增 ${fresh.length} 处重复代码：`)
    for (const clone of fresh.slice(0, 20)) {
      failures.push(
        `  ${clone.lines} 行 ${clone.first.path}:${clone.first.start} <-> ${clone.second.path}:${clone.second.start}`,
      )
    }
    if (fresh.length > 20)
      failures.push(`  …另有 ${fresh.length - 20} 处，见 docs/analysis/code-duplication/report/jscpd-report.html`)
  }

  const removed = baseline.entries.filter(
    (entry) => !current.clones.some((clone) => clone.fingerprint === entry.fingerprint),
  )

  // 人读的部分与机器读的部分严格分开：`--json` 时 stdout 必须只有那一个 JSON 文档，
  // 否则消费方得先剥掉前几行才能解析（`JSON.parse` 直接报 Extra data）。
  const notes = []
  if (shrunk.length > 0) {
    notes.push(`本次有 ${shrunk.length} 处重复变小（不是新增，已按同一对文件的行数上限放行）。`)
  }
  if (removed.length > 0) {
    notes.push(`本次消除了 ${removed.length} 处重复。跑 \`bun run update:duplication-baseline\` 把基线压低。`)
  }
  if (baseline.legacy) {
    notes.push('注意：基线还是第一版格式（只有指纹），无法判断「重复变小」。跑一次 `--update` 升级。')
  }

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        {
          totals: current.totals,
          baseline: baseline.totals,
          newClones: fresh.length,
          shrunkClones: shrunk.length,
          removedClones: removed.length,
          ok: failures.length === 0,
          notes,
        },
        null,
        2,
      ),
    )
  } else {
    for (const note of notes) console.log(`\n${note}`)
  }

  if (failures.length > 0) {
    console.error(`\n重复代码门禁失败：\n${failures.join('\n')}`)
    console.error('\n消除重复，或（仅在确有必要时）用 `bun run update:duplication-baseline` 显式改基线。')
    process.exit(1)
  }

  if (!AS_JSON) console.log('\n重复代码门禁通过。')
}

try {
  main()
} catch (error) {
  console.error(`check_duplicates 失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
