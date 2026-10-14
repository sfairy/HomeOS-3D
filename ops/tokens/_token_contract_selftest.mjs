#!/usr/bin/env node
/**
 * 令牌契约门禁的**注入式自检**：证明新增的两条判据真的会红。
 *
 * 为什么必须有：判据「扫不到就放行」时，形同虚设的失效方式是**静默**的 ——
 * 规则写法一变（例如有人把 `:is(` 挪到下一行、或把注释改掉），门禁照样打印
 * 「✓ 全部通过」，而缺陷已经漏过去了。所以这里把每一类缺陷**注入**到合成样式文本，
 * 断言判据全部拦下；同时断言真实 `main.css` 干净（防止判据写法与真文件脱节）。
 *
 * 用法：`node ops/tokens/_token_contract_selftest.mjs`
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { findSelectorVar, glassFallbackLists, parseIsArgs } from './selector-var.mjs'
import { compareRatchet, readBaseline, BASELINE_KEY } from './baseline-ratchet.mjs'
import { blankComments } from '../lib/scan.mjs'
import { radiusDeclarations, radiusProblemsOf } from './radius-scale.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
const MAIN_CSS = path.join(REPO_ROOT, 'homeos', 'frontend', 'src', 'assets', 'styles', 'main.css')
const BASELINE_FILE = path.join(HERE, 'token-contract-baseline.json')

/** 打印用仓库相对路径。 */
const relOf = (file) => path.relative(REPO_ROOT, file)

const failures = []
let checks = 0

function check(label, condition, detail = '') {
  checks += 1
  if (!condition) failures.push(`${label}${detail ? `（${detail}）` : ''}`)
}

// ── 判据一：选择器位置的 var() ───────────────────────────────────────────────

// 这就是实际翻车的那一行（修复前的写法）。
check(
  '注入 `:is(var(--glass-fallback-selectors))` → 拦下',
  findSelectorVar(':is(var(--glass-fallback-selectors)) { backdrop-filter: none; }').length === 1,
)

// 选择器位置带前缀（真实文件里的静态模式组就是这种形态）。
check(
  '注入 `html[data-x] :is(var(--y))` → 拦下',
  findSelectorVar('html[data-glass-effect="static"] :is(var(--list)) { color: red; }').length === 1,
)

// `var()` 在选择器里且文件是多行时，行号要落在正确的那一行。
{
  const multi = ['a { color: red; }', '', ':is(', '  var(--list)', ') { color: blue; }'].join('\n')
  const hits = findSelectorVar(multi)
  check('多行选择器里的 var() 行号正确', hits.length === 1 && hits[0].line === 4, JSON.stringify(hits))
}

// 合法的声明值位置**不得**误报 —— 否则门禁会因为噪音被整体关掉。
check(
  '声明值位置的 var() → 不误报',
  findSelectorVar('.a { color: var(--x); backdrop-filter: var(--blur); }').length === 0,
)
check(
  '多行声明块里的 var() → 不误报',
  findSelectorVar('.a,\n.b {\n  color: var(--x);\n  border: 1px solid var(--y);\n}').length === 0,
)
check('注释里提到 var() → 不误报', findSelectorVar('/* 别写 :is(var(--x)) */\n.a { color: red; }').length === 0)
check(
  'at-rule 条件里的 var() → 拦下（同样解析期失效）',
  findSelectorVar('@media (min-width: var(--bp)) { .a { color: red; } }').length === 1,
)

// ── 判据二：毛玻璃禁用组两份清单一致 ─────────────────────────────────────────

check('解析 :is() 实参列表', parseIsArgs('.a, .b , .c').join('|') === '.a|.b|.c', parseIsArgs('.a, .b , .c').join('|'))

const COARSE_ONLY = [
  '.a',
  '.b',
].join('\n')

{
  // 两份一致 → 无问题。
  const same = [
    '.widget-wrapper { will-change: auto !important; }',
    ':is(.a, .b) { backdrop-filter: none !important; }',
    'html[data-glass-effect="static"] :is(.a, .b) { backdrop-filter: none !important; }',
  ].join('\n')
  const lists = glassFallbackLists(same)
  check('两份一致的清单被正确解析', lists.coarse?.join('|') === '.a|.b' && lists.static?.join('|') === '.a|.b', JSON.stringify(lists))
  check('两份一致的清单内容相同', COARSE_ONLY.length > 0 && lists.coarse.join('\n') === lists.static.join('\n'))
}

{
  // 两份漂移 → 必须能看出各自的差异项。
  const drifted = [
    '.widget-wrapper { will-change: auto !important; }',
    ':is(.a, .b) { backdrop-filter: none !important; }',
    'html[data-glass-effect="static"] :is(.a, .c) { backdrop-filter: none !important; }',
  ].join('\n')
  const lists = glassFallbackLists(drifted)
  const equal = lists.coarse.join('\n') === lists.static.join('\n')
  check('漂移的清单被判为不一致', !equal, JSON.stringify(lists))
  check(
    '漂移时能定位差异项',
    lists.coarse.filter((i) => !lists.static.includes(i)).join(',') === '.b' &&
      lists.static.filter((i) => !lists.coarse.includes(i)).join(',') === '.c',
  )
}

{
  // 规则被删 / 写法变了 → 锚点应返回 null，调用方据此报「解析失败」而不是静默通过。
  const missing = glassFallbackLists('.a { color: red; }')
  check('锚点找不到时返回 null（拒绝静默放行）', missing.coarse === null && missing.static === null, JSON.stringify(missing))
}

// ── 与真实文件对齐：合成用例通过但真文件写法不同 → 门禁实际已失效 ──────────────

if (!fs.existsSync(MAIN_CSS)) {
  failures.push(`真实 main.css 缺失：${MAIN_CSS}`)
} else {
  const real = fs.readFileSync(MAIN_CSS, 'utf8')
  check('真实 main.css 选择器位置无 var()', findSelectorVar(real).length === 0, `${findSelectorVar(real).length} 处`)
  const lists = glassFallbackLists(real)
  check('真实 main.css 两份禁用清单都能解析到', lists.coarse !== null && lists.static !== null)
  check(
    '真实 main.css 两份禁用清单逐项一致',
    lists.coarse !== null && lists.static !== null && lists.coarse.join('\n') === lists.static.join('\n'),
  )
  check(
    '真实 main.css 禁用清单规模合理（防解析成空列表）',
    lists.coarse !== null && lists.coarse.length >= 20,
    `coarse=${lists.coarse?.length}`,
  )
}

// ── 判据四：容忍档棘轮 ────────────────────────────────────────────────────────
// 棘轮的失效方式是「比对反了」：把新增判成消失、或读写键名不一致 —— 两种都会让门禁静默变瞎。
{
  const current = ['a.css|--x', 'b.css|--y']
  const baseline = ['b.css|--y', 'c.css|--z']
  const diff = compareRatchet(current, baseline)
  check('棘轮：新增项被识别', diff.added.join('|') === 'a.css|--x', JSON.stringify(diff))
  check('棘轮：消失项被识别', diff.removed.join('|') === 'c.css|--z', JSON.stringify(diff))
  check('棘轮：共有项计入 kept', diff.kept.join('|') === 'b.css|--y', JSON.stringify(diff))
  check('棘轮：计数取自去重集合', diff.currentCount === 2 && diff.baselineCount === 2, JSON.stringify(diff))

  const same = compareRatchet(current, [...current, current[0]])
  check('棘轮：集合一致时零增零减（重复项不算新增）', same.added.length === 0 && same.removed.length === 0, JSON.stringify(same))
}

// 与真实基线对齐：文件必须存在且形状正确，条目必须是 `<file>|<令牌名>` 形态 ——
// 形状一坏，`readBaseline` 会返回 null，门禁报「基线缺失」，而不是静默放行。
{
  const baseline = readBaseline(BASELINE_FILE)
  check(`真实基线可解析（${BASELINE_KEY}）`, baseline !== null, relOf(BASELINE_FILE))
  if (baseline !== null) {
    check('真实基线条目形如 `<file>|<name>`', baseline.every((key) => /^[^|]+\|--[a-zA-Z0-9-]+$/.test(key)), `${baseline.length} 项`)
    check('真实基线无重复条目', new Set(baseline).size === baseline.length, `${baseline.length} 项`)
  }
}

// ── 判据五：圆角尺度单一化 ────────────────────────────────────────────────────
// 这条判据的失效方式是「只看名字不看值」—— 那样 `--radius-sm: 12px` 会一路绿灯，
// 而它正是审计里「圆角尺度多出一档」的形态。所以下面既测「裸长度被拦」，也测「裸长度**没被**
// 当成合法别名放过去」。
{
  // 与门禁同口径：先抹白注释再抽取。注释里出现的 `--radius-sm: 12px`（例如解释
  // 「这个裸字面量已被收进规范族」的文档注释）不是声明，不抹白会把文档本身判成违规。
  const problems = (style) => radiusProblemsOf(radiusDeclarations(blankComments(style)))
  check(
    '注释里的圆角声明 → 不算声明（先抹白注释）',
    problems('/* 旧写法 --radius-sm: 12px 已收进规范族 */\n--radius-sm: var(--hos-radius-input);').length === 0,
  )

  // 真实翻车形态：旧族里写裸长度（原 `--radius-sm: 12px` / `--radius-xs: 8px`）。
  check(
    '旧族裸长度 → 拦下',
    problems('--radius-sm: 12px;').length === 1 && problems('--radius-sm: 12px;')[0].includes('--radius-sm'),
    JSON.stringify(problems('--radius-sm: 12px;')),
  )
  check('ipad 族裸长度 → 拦下', problems('--radius-ipad-pill: 9999px;').length === 1)
  // 别名（合法形态）不得误报，否则门禁会被噪音关掉。
  check('旧族别名 → 放行', problems('--radius-sm: var(--hos-radius-input);').length === 0)
  check('ipad 族别名 → 放行', problems('--radius-ipad-pill: var(--hos-radius-pill);').length === 0)

  // 规范族：登记过的长度放行，未登记的长度必须显式登记（这就是「加尺度要被看见」）。
  check('规范族登记过的长度 → 放行', problems('--hos-radius-input: 12px;').length === 0)
  check(
    '规范族未登记的长度 → 拦下',
    problems('--hos-radius-wild: 13px;').length === 1,
    JSON.stringify(problems('--hos-radius-wild: 13px;')),
  )
  check('规范族白名单里的折叠别名 → 放行', problems('--hos-radius-shell: var(--hos-radius-panel);').length === 0)
  check(
    '规范族折叠到未白名单的名字 → 拦下',
    problems('--hos-radius-weird: var(--hos-radius-panel);').length === 1,
  )
  check('calc() 也算「不是登记长度」→ 拦下', problems('--hos-radius-wild: calc(8px + 2px);').length === 1)

  // 前缀判定是「族」而不是白名单：旧族里出现没见过的后缀仍算别名（可放行），
  // 但名字连族都不属于时（如 `--radius2-sm`）必须归类，不能靠前缀侥幸通过。
  check(
    '旧族里的新后缀 → 放行（族判定不是白名单）',
    problems('--radius-ipad-ultra: var(--hos-radius-card);').length === 0,
  )
  check(
    '不属于任何族的圆角名 → 拦下',
    problems('--radius2-sm: var(--hos-radius-card);').length === 1,
    JSON.stringify(problems('--radius2-sm: var(--hos-radius-card);')),
  )

  // 行号与文件名要落到真实位置 —— 报错信息指错行等于让人去猜。
  const decls = radiusDeclarations('a {\n  color: red;\n}\n--radius-sm: 12px;', 'demo.css')
  check('圆角声明抽出名字/值/行号', decls.length === 1 && decls[0].line === 4 && decls[0].value === '12px', JSON.stringify(decls))
  check('圆角问题带归属文件与行号', radiusProblemsOf(decls)[0]?.includes('demo.css:4'), JSON.stringify(radiusProblemsOf(decls)))
}

// 与真实样式表对齐：真仓库的圆角声明必须全部合规 —— 否则说明判据与真文件写法脱节
// （例如判据只认 `--hos-radius-*`，而真文件里另有合法来源）。
{
  const styleDirs = [
    path.join(REPO_ROOT, 'homeos', 'frontend', 'src', 'assets', 'styles'),
    path.join(REPO_ROOT, 'homeos', 'frontend', 'public', 'static'),
  ]
  const real = []
  for (const dir of styleDirs) {
    if (!fs.existsSync(dir)) continue
    // 非递归：这两个目录的圆角声明都在第一层（`src/assets/styles/*.css` / `public/static/*.css`）。
    // 不用 `readdirSync(..., { recursive: true })`：那是 Node ≥20.12 才有的选项，
    // 自检在旧版 node 上会以「未知选项」直接崩掉，而不是给出可读的失败信息。
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.css')) continue
      const file = path.join(dir, name)
      if (!fs.statSync(file).isFile()) continue
      real.push(...radiusDeclarations(blankComments(fs.readFileSync(file, 'utf8')), relOf(file)))
    }
  }
  check('真实样式表里确实抽到了圆角声明（防判据空转）', real.length >= 15, `${real.length} 条`)
  check('真实样式表的圆角声明全部合规', radiusProblemsOf(real).length === 0, radiusProblemsOf(real).join('；'))
}

if (failures.length) {
  console.error('令牌契约门禁自检失败：')
  for (const item of failures) console.error(`  - ${item}`)
  process.exit(1)
}
console.log(`令牌契约门禁自检通过（${checks} 项断言）`)
