#!/usr/bin/env node
/**
 * 样式债门禁（棘轮型，与 `check-studio-type-debt.mjs` 同一族）。
 *
 * ## 为什么需要它
 *
 * 审计口径：`!important` 380 处、硬编码色 2,969 处、裸 `z-index` 232 处。这三类东西
 * **没有任何门禁看得见**，而且每一处的出现都是「当下最省事的那个选择」：
 *
 * - `!important`：压过别人的样式比自己改对选择器快 —— 它是样式层级的**负和手段**（对方只能再加一个）；
 * - 硬编码色：写 `#8b9dc3` 比查令牌表快，于是同一语义的色在几十个文件里各写各的，
 *   改主题时漏一处就是一屏「补丁色」；
 * - 裸 `z-index`：随手写 `9999` 能当下解决遮挡，但下一个浮层写 `10000` 就又把它盖住
 *   —— 审计里 10000/10010 夹在 `--z-modal:1000` 与 `--z-drawer:11000` 之间就是这么来的。
 *
 * 这三类**都不会让任何测试失败**：构建不报错、`tsc` 不报错、eslint 不报错、页面看起来也正常。
 *
 * ## 收口方式
 *
 * 1. **硬规则：裸 `z-index` 的取值必须已登记**（`zIndexValues`）。同一数值在任何文件里重复用都不拦
 *    （那是「复用既有档位」），但出现一个**没登记过的新数值**就红 —— 这正是「随手写 9999」的形态。
 *    想让新数值合法，只有两条路：用 `--z-*` 层令牌，或 `--update` 显式认领（认领会出现在 diff 里）。
 * 2. **棘轮：每文件的 `!important` 与硬编码色计数不得超基线**，且下降后必须 `--update` 收紧，
 *    否则基线会退化成「历史最大集合」。
 * 3. **口径只算样式文本**：`.css` 全文、`.vue`/`.html` 只取 `<style>` 区；注释先抹白
 *    （文档里举例写的 `#fff`、`!important` 不是债）；颜色与 `z-index` 只在**声明值**里数
 *    （选择器里的 `#id`、`url(#grad)` 会被整段扫的写法误判成颜色）。
 *
 * ## 口径与审计数字的关系（不要直接对比）
 *
 * 审计口径的「硬编码色 2,969」只数了十六进制色、且只数主应用 `src`；本门禁的口径更宽：
 * 十六进制色 **加上** `rgb()/rgba()/hsl()/hsla()` 的**数值**首参（`rgba(var(--x), .2)` 不算，
 * 那是已令牌化的形态），并且覆盖 `public/static` 这份**手写的静态运行面**样式
 * （它不是 `src` 的生成物，两边都在维护）。所以基线绝对数更大是口径差异，不是债务变多：
 *
 * | 根 | `!important` | 硬编码色 |
 * | --- | --- | --- |
 * | `homeos/frontend/src` | 373（审计 380，P1 清掉 7 处） | 8,047 |
 * | `homeos/frontend/public/static` | 136 | 3,023 |
 * | `homeos-store/frontend/src` | 0 | 0 |
 *
 * 门禁的价值在**棘轮**（只减不增）与**新裸 `z-index` 数值必红**，而不在这几个绝对数。
 *
 * 用法：
 * ```bash
 * node ops/style/check-style-debt.mjs            # 门禁（CI 跑这条）
 * node ops/style/check-style-debt.mjs --update   # 收紧基线（只在真降下来之后跑）
 * node ops/style/check-style-debt.mjs --report   # 只打印分布，不判成败
 * ```
 * `--root=<dir>[,<dir>…]`（仓库根相对或绝对）与 `--baseline=<file>` 供自检注入 fixture。
 *
 * ## 为什么住在 `ops/style/` 而不是任一前端的 `scripts/gates/`
 *
 * 扫描面跨两个前端（`homeos/frontend` + `homeos-store/frontend`），而**独立部署护栏**
 * （`ops/check/check_deploy_independence.py`）禁止任一前端的脚本里出现兄弟项目的路径字面量
 * —— 这条规则本轮真的把我拦下来了：第一版放在 `homeos/frontend/scripts/gates/` 时被报
 * 「字符串里出现兄弟项目路径 `homeos-store/frontend/src`」。`ops/**` 是跨项目层，放这里才对。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { blankComments, extractStyleText, rel, walk } from '../lib/scan.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
const DEFAULT_BASELINE = path.join(HERE, 'style-debt-baseline.json')

/** 默认扫描面：两个前端的样式来源（`public/static` 里也有独立样式表）。 */
const DEFAULT_ROOTS = ['homeos/frontend/src', 'homeos/frontend/public/static', 'homeos-store/frontend/src']

const argv = process.argv.slice(2)
const wantUpdate = argv.includes('--update')
const reportOnly = argv.includes('--report')
const rootArg = argv.find((a) => a.startsWith('--root='))
const baselineArg = argv.find((a) => a.startsWith('--baseline='))

const ROOTS = (rootArg ? rootArg.slice('--root='.length).split(',') : DEFAULT_ROOTS).map((item) =>
  path.resolve(REPO_ROOT, item.trim()),
)
const BASELINE_FILE = baselineArg ? path.resolve(baselineArg.slice('--baseline='.length)) : DEFAULT_BASELINE

// `--update --root=<fixture>` 会拿 fixture 的计数覆盖**真实基线**（自检最容易踩的坑自己先堵上）。
if (wantUpdate && rootArg && !baselineArg) {
  console.error('✗ 拒绝执行：`--update` 与 `--root=` 同用会把 fixture 计数写进真实基线，须同时给 `--baseline=`。')
  process.exit(2)
}

/** CSS 颜色字面量：`#rgb/#rrggbb/#rrggbbaa`；`rgb()/rgba()/hsl()/hsla()` 的**数值**首参。 */
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b(?![\w-])/g
//: `rgba(var(--x), .2)` 不算硬编码色（首参是 `var(` 时不匹配）—— 这正是「已令牌化」的形态。
const FUNC_COLOR = /\b(?:rgba?|hsla?)\(\s*[0-9.]/g
const IMPORTANT = /!important/g
//: 裸数值 `z-index`（`z-index: var(--z-modal)` 不匹配 → 已令牌化的不算债）。
//: 裸数值 `z-index` 的判定见 `NUMERIC_VALUE`（值本身就是数字），故此处不再需要单独正则。

const lineOf = (text, index) => text.slice(0, index).split('\n').length

/**
 * 取出样式里的**声明**（`prop: value`）。
 *
 * 为什么不能直接扫整段样式：`#faded` 这样的 id 选择器、`url(#grad)` 这样的片段标识都会
 * 命中十六进制色的正则，于是「硬编码色」会混入噪声；而 `z-index` 的判定也必须知道属性名
 * （值本身只是个数字，光看值无法区分 `z-index: 900` 与 `width: 900px`）。
 */
function declarations(style) {
  const found = []
  for (const m of style.matchAll(/([-a-zA-Z]+)\s*:\s*([^;{}]*)/g)) {
    found.push({ prop: m[1].toLowerCase(), value: m[2].trim(), at: m.index })
  }
  return found
}

//: 声明值里直接写数字的裸层级（`z-index: var(--z-modal)` 的值不是纯数字，天然不匹配）。
const NUMERIC_VALUE = /^-?\d+$/

const styleFiles = []
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue
  for (const file of walk(root, new Set(['.css', '.vue', '.html']))) styleFiles.push(file)
}
styleFiles.sort()

const counts = { important: {}, hardcodedColor: {} }
const zIndexValues = new Map()
const hits = []
let scannedFiles = 0

for (const file of styleFiles) {
  const repoRel = rel(REPO_ROOT, file)
  const relPath = repoRel.startsWith('..') ? rel(ROOTS[0], file) : repoRel
  const raw = fs.readFileSync(file, 'utf8')
  // 只取样式文本、并抹白注释：文档里举例写的 `#fff` / `!important` / `z-index: 9999` 都不是债。
  const style = blankComments(extractStyleText(file, raw))
  if (!style.trim()) continue
  scannedFiles += 1

  // 颜色与 z-index 只在**声明值**里统计（选择器里的 `#id`、`url(#grad)` 不是颜色）。
  const decls = declarations(style)
  const important = [...style.matchAll(IMPORTANT)]
  const colors = decls.flatMap((decl) => [...decl.value.matchAll(HEX_COLOR), ...decl.value.matchAll(FUNC_COLOR)])
  const zIndex = decls.filter((decl) => decl.prop === 'z-index' && NUMERIC_VALUE.test(decl.value))

  if (important.length) counts.important[relPath] = important.length
  if (colors.length) counts.hardcodedColor[relPath] = colors.length

  for (const decl of zIndex) {
    const value = Number(decl.value)
    if (!zIndexValues.has(value)) zIndexValues.set(value, { count: 0, first: `${relPath}:${lineOf(style, decl.at)}` })
    zIndexValues.get(value).count += 1
  }

  for (const m of important.slice(0, 2)) hits.push({ kind: 'important', file: relPath, line: lineOf(style, m.index) })
  for (const decl of zIndex.slice(0, 2))
    hits.push({ kind: 'rawZIndex', file: relPath, line: lineOf(style, decl.at) })
}

const total = (obj) => Object.values(obj).reduce((a, b) => a + b, 0)
const sumCounts = (map) => [...map.values()].reduce((a, b) => a + b.count, 0)

/**
 * 按扫描根汇总（各根是不同性质的样式面，混成一个总数会掩盖分布）。
 *
 * 只汇总 `!important` 与硬编码色：裸 `z-index` 的口径是「**取值**是否已登记」
 * （`zIndexValues` 以数值为键、不记归属文件），拆不到每个根上，硬拆反而给出错误分布。
 */
function byRoot(counts_) {
  return ROOTS.map((root) => {
    const prefix = `${rel(REPO_ROOT, root)}/`
    const sum = (obj) =>
      Object.entries(obj)
        .filter(([file]) => file.startsWith(prefix))
        .reduce((a, [, n]) => a + n, 0)
    return {
      root: rel(REPO_ROOT, root),
      important: sum(counts_.important),
      hardcodedColor: sum(counts_.hardcodedColor),
    }
  })
}

const summary = {
  scannedFiles,
  roots: ROOTS.map((root) => rel(REPO_ROOT, root)),
  important: total(counts.important),
  hardcodedColor: total(counts.hardcodedColor),
  rawZIndex: sumCounts(zIndexValues),
  rawZIndexValues: [...zIndexValues.keys()].sort((a, b) => a - b),
  perRoot: byRoot(counts),
}

if (wantUpdate) {
  fs.writeFileSync(
    BASELINE_FILE,
    `${JSON.stringify(
      {
        $comment:
          '样式债基线（棘轮：只减不增；`zIndexValues` 是硬规则——出现未登记的新裸 z-index 数值即红）。' +
          '由 `node ops/style/check-style-debt.mjs --update` 重记。',
        $scope: summary.roots,
        important: counts.important,
        hardcodedColor: counts.hardcodedColor,
        zIndexValues: summary.rawZIndexValues,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  console.log(
    `基线已更新：!important ${summary.important} 处 / 硬编码色 ${summary.hardcodedColor} 处 / ` +
      `裸 z-index ${summary.rawZIndex} 处（${summary.rawZIndexValues.length} 个不同数值）` +
      `（${rel(REPO_ROOT, BASELINE_FILE)}）`,
  )
  process.exit(0)
}

const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : null

const problems = []
const regressions = []
const drift = []
if (!baseline && !reportOnly) {
  problems.push(`基线缺失：${rel(REPO_ROOT, BASELINE_FILE)}（先跑 node ops/style/check-style-debt.mjs --update）`)
}

for (const key of ['important', 'hardcodedColor']) {
  const base = baseline?.[key] ?? {}
  for (const [file, n] of Object.entries(counts[key])) {
    const was = base[file] ?? 0
    if (n > was) regressions.push(`${key} 增加：${file} ${was} → ${n}`)
  }
  for (const [file, was] of Object.entries(base)) {
    const now = counts[key][file] ?? 0
    if (now < was) drift.push(`${key} 下降：${file} ${was} → ${now}（可 --update 收紧）`)
  }
}

// 硬规则：裸 z-index 的取值集合只许收缩 —— 出现新数值即红（`--report` 不判成败）。
const registeredZ = new Set(baseline?.zIndexValues ?? [])
if (baseline && !reportOnly) {
  for (const [value, info] of [...zIndexValues.entries()].sort((a, b) => a[0] - b[0])) {
    if (registeredZ.has(value)) continue
    problems.push(
      `裸 z-index 出现未登记数值 ${value}（${info.first}，共 ${info.count} 处）—— ` +
        '用 --z-* 层令牌（见 main.css 的层级表）；确属既有档位复用则 --update 认领',
    )
  }
}

console.log(`样式债（${summary.roots.join(' + ')}，扫描 ${scannedFiles} 个样式文件）：`)
console.log(`  !important       ${summary.important}`)
console.log(`  硬编码色         ${summary.hardcodedColor}`)
console.log(`  裸 z-index       ${summary.rawZIndex}（${summary.rawZIndexValues.length} 个不同数值）`)
// 各根性质不同（`src` 是源样式，`public/static` 是手写的静态运行面，两者都不是对方的生成物），
// 只报总数会让人以为「主应用 src 里有上万处硬编码色」——分布必须可见。
for (const row of summary.perRoot) {
  console.log(`   - ${row.root}：!important ${row.important} / 硬编码色 ${row.hardcodedColor}`)
}
for (const h of hits.slice(0, 20)) console.log(`   - ${h.kind} ${h.file}:${h.line}`)
if (hits.length > 20) console.log(`   … 其余 ${hits.length - 20} 条同类命中`)

if (reportOnly) process.exit(0)

for (const d of drift) console.log(`  ↳ ${d}`)
for (const p of problems) console.error(`✗ ${p}`)
for (const r of regressions) console.error(`✗ ${r}`)

if (problems.length + regressions.length > 0) {
  console.error(
    `\n✗ 样式债门禁未通过：${problems.length} 处硬违规 + ${regressions.length} 处棘轮回退` +
      `（当前 !important ${summary.important} / 硬编码色 ${summary.hardcodedColor} / 裸 z-index ${summary.rawZIndex}）。`,
  )
  process.exit(1)
}
console.log('\n✓ 样式债门禁通过：无未登记的新裸 z-index；!important 与硬编码色未超基线。')
