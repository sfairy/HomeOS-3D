#!/usr/bin/env node
/**
 * `check-vite-chunk-groups.mjs` 的负向自检：**真的把配置改坏**，逐条确认每个分支都会拦。
 *
 * ## 为什么需要它
 *
 * 这条门禁是「解析型」的：它靠文本切片从 `vite.config.ts` 里抠出 `name` / `test`，
 * 最危险的死法不是误报，而是**悄悄变瞎** —— 抠 `test` 的正则换了写法、括号配对算错、
 * 组数解析成 0，只要「解析不到就跳过」，门禁会永远打印「通过」而配置照样悬空。
 * （本文件的 S0 组就是真实发生过的两次：捕获组多带了两侧斜杠 → 所有组都被判死；
 * 单行 `test:` 不被行锚定匹配到 → 整条门禁自身失效。两者都是解析问题，不是配置问题。）
 *
 * 因此这里不复述判定逻辑，而是：
 *   1. 在**真实配置文本**上注入悬空（死组 / 死分支 / 改名 `codeSplitting`），确认会拦；
 *   2. 用合成组对象把每个分支（依赖组跳过、entriesAware 跳过、无 name、test 非字面量）压一遍；
 *   3. 固定住「真实配置 × 真实源码树 → 0 问题」这条绿化断言，防止它哪天悄悄红着进 CI。
 *
 * ## 用法
 *
 *     node scripts/_vite_chunk_groups_selftest.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  ChunkGateError,
  FRONTEND_ROOT,
  alternationBranches,
  assertUsable,
  checkGroups,
  collectModules,
  parseGroups,
  splitTopLevel,
} from './check-vite-chunk-groups.mjs'
import { check, report } from '../_smoke_harness.mjs'

const CONFIG = path.join(FRONTEND_ROOT, 'vite.config.ts')
const CONFIG_TEXT = fs.readFileSync(CONFIG, 'utf8')
const MODULES = collectModules(FRONTEND_ROOT)

/** 断言某次调用抛出「门禁自身失效」，返回它是否抛了。 */
function throwsGateError(fn) {
  try {
    fn()
    return false
  } catch (error) {
    if (error instanceof ChunkGateError) return true
    throw error
  }
}

/** 在真实配置文本上做一次替换（替换必须命中，否则说明配置已漂、自检需要跟着改）。 */
function mutateConfig(from, to) {
  if (!CONFIG_TEXT.includes(from)) throw new Error(`自检需要改写的片段不在配置里：${from}`)
  const mutated = CONFIG_TEXT.replace(from, to)
  return checkGroups(parseGroups(mutated), MODULES)
}

console.log('分块组门禁自检')

// ── S1 解析：真实配置 ────────────────────────────────────────────────────────
const groups = parseGroups(CONFIG_TEXT)
check('S1a 真实配置解析出 ≥20 组', groups.length >= 20, `实际 ${groups.length}`)
check(
  'S1b 每组都有 name',
  groups.every((g) => g.name),
  `缺 name 的组数：${groups.filter((g) => !g.name).length}`,
)
check(
  'S1c 非兜底组都能抠出 test 字面量',
  groups.filter((g) => !g.test && !g.entriesAware).length === 0,
  `抠不出的组：${groups.filter((g) => !g.test && !g.entriesAware).map((g) => g.name).join(', ')}`,
)
check(
  'S1d 抠出的 test 不带两侧斜杠（否则正则首位会被要求匹配字面量 `/`）',
  groups.every((g) => !g.test || (!g.test.startsWith('/') && !g.test.endsWith('/'))),
)
check('S1e 源码模块宇宙非空（≥1000）', MODULES.length >= 1000, `实际 ${MODULES.length}`)
check(
  'S1f 文件宇宙是 posix 绝对路径（与 rolldown 的 test 入参同形）',
  MODULES.every((f) => f.startsWith('/') && !f.includes('\\')),
)

// ── S2 真实配置 × 真实树 = 绿化（固定住） ─────────────────────────────────────
const live = checkGroups(groups, MODULES)
check(
  'S2a 真实配置 × 真实源码树 → 0 问题',
  live.problems.length === 0,
  live.problems.map((p) => `${p.kind} [${p.group}] ${p.detail}`).join('\n         '),
)
check('S2b 依赖组（node_modules）被显式跳过而非误判', live.skippedDependencyGroups.length >= 5, `实际跳过 ${live.skippedDependencyGroups.length}`)
check(
  'S2c 兜底组（entriesAware，无 test）不是被当成死组',
  groups.some((g) => g.entriesAware && !g.test),
)

// ── S3 真实配置上的负向注入：死组 / 死分支 / 结构改名 ─────────────────────────
const deadGroup = mutateConfig(
  String.raw`test: /src[\\/]views[\\/]auth[\\/]/,`,
  String.raw`test: /src[\\/]views[\\/]__no_such_dir__[\\/]/,`,
)
check(
  'S3a 把真实组指向不存在的目录 → 报死组且点名该组',
  deadGroup.problems.length === 1 &&
    deadGroup.problems[0].kind === 'dead-group' &&
    deadGroup.problems[0].group === 'views-auth',
  JSON.stringify(deadGroup.problems),
)

const deadBranch = mutateConfig(
  String.raw`test: /src[\\/]components[\\/]widgets[\\/](media|weather)[\\/]/,`,
  String.raw`test: /src[\\/]components[\\/]widgets[\\/](media|__ghost__)[\\/]/,`,
)
check(
  'S3b alternation 里一条分支无文件 → 报死分支（组本身仍算活）',
  deadBranch.problems.length === 1 &&
    deadBranch.problems[0].kind === 'dead-branch' &&
    deadBranch.problems[0].detail.includes('__ghost__'),
  JSON.stringify(deadBranch.problems),
)

check(
  'S3c 配置把 `codeSplitting` 改名 → 门禁判自身失效（而非「无组即通过」）',
  throwsGateError(() => parseGroups(CONFIG_TEXT.replace('codeSplitting:', 'chunkGrouping:'))),
)
check(
  'S3d 组对象括号不平衡 → 门禁判自身失效',
  throwsGateError(() => parseGroups('codeSplitting: { groups: [ { name: \'x\' ] }')),
)

// ── S4 合成组对象：每个分支都压一遍 ───────────────────────────────────────────
const files = ['/p/src/views/LoginView.vue', '/p/src/views/RegisterView.vue']
check(
  'S4a 全活组（含 alternation）→ 放行',
  checkGroups([{ name: 'ok', test: 'src/views/(Login|Register)View\\.vue' }], files).problems.length === 0,
)
check(
  'S4b 死组 → dead-group',
  checkGroups([{ name: 'gone', test: 'src/views/GhostView\\.vue' }], files).problems[0]?.kind === 'dead-group',
)
check(
  'S4c 死分支 → dead-branch',
  checkGroups([{ name: 'half', test: 'src/views/(Login|Ghost)View\\.vue' }], files).problems[0]?.kind === 'dead-branch',
)
const dep = checkGroups([{ name: 'vendor', test: 'node_modules/(vue|axios)' }], files)
check(
  'S4d 依赖组：不校验、记入跳过名单',
  dep.problems.length === 0 && dep.skippedDependencyGroups.join() === 'vendor',
)
check(
  'S4e 兜底组（entriesAware 无 test）：跳过而非报错',
  checkGroups([{ name: 'shared', entriesAware: true }], files).problems.length === 0,
)
check(
  'S4f 组缺 name → 门禁判自身失效',
  throwsGateError(() => checkGroups([{ test: 'src/views/LoginView\\.vue' }], files)),
)
check(
  'S4g test 不是字面量（变量调用）且非兜底 → 门禁判自身失效',
  throwsGateError(() => checkGroups(parseGroups('codeSplitting: { groups: [ { name: \'x\', test: someFn, priority: 1 } ] }'), files)),
)
check(
  'S4h 空宇宙防瞎：0 组 / 0 模块都判自身失效',
  throwsGateError(() => assertUsable([], files)) && throwsGateError(() => assertUsable(groups, [])),
)

// ── S5 工具函数：分支切分与嵌套保护 ──────────────────────────────────────────
check(
  'S5a splitTopLevel 不切字符类里的 `|`',
  splitTopLevel('a[\\/](b|c)', '|').length === 1,
)
const branches = alternationBranches('src[\\/](layouts[\\/]ShellOverlays|workers[\\/]ingest-bridge)')
check(
  'S5b 顶层 alternation 能带出字符类以外的分支',
  branches.length === 1 &&
    branches[0].parts.join() === 'layouts[\\/]ShellOverlays,workers[\\/]ingest-bridge',
  JSON.stringify(branches),
)
check('S5c 嵌套分组不当作分支集合（避免替换失真）', alternationBranches('(a|(b|c))').length === 0)
check(
  'S5d 单分支分组（如 `(vue|vue-router)` 这类只有一个分支时不算）',
  alternationBranches('(only)').length === 0,
)

report('分块组门禁自检')
