#!/usr/bin/env bun
/**
 * 0.9.0 配置 UI 的对账工具（文案 / 选择器 / 类名）。
 *
 * ## 它回答什么问题
 *
 * 「这一版配置面板，和 0.9.0 还差什么？」这个问题最容易被两种错误答案糊弄：
 *
 * 1. **按文件体积排序** —— 混淆产物里体积小但语义重的文件会被漏掉；
 * 2. **文本差集当判据** —— 本项目把 `input, select` 写成合并选择器、把规则拆到多个文件，
 *    文本比对会报「缺 101 条」，而实测计算样式完全一致（假阴性）。
 *
 * 所以本工具只做**线索收集**，三份互补的输出：
 *
 * - `--copy`：把 0.9.0 的配置 UI 模块解码成明文，列出**本地一处都没命中**的中文串
 *   （逐字文案差集，是真正需要人判断的那份清单）；
 * - `--classes`：解出 0.9.0 用到的 `i3d-*` / `hb-*` 类名，列出本地 TS/Vue 里没有消费者的
 *   （有样式没 DOM、或有 DOM 没样式，都会在这里显形）；
 * - `--selectors`：paren-aware 拆选择器后比 9 张样式表（**只是线索**：命中不代表一致，
 *   没命中不一定缺失，必须用计算样式复核）。
 *
 * ## 用法
 *
 * ```bash
 * # 1) 全部三份报告（人读）
 * node ops/tools/config-ui-parity.mjs
 *
 * # 2) 只看文案缺口
 * node ops/tools/config-ui-parity.mjs --copy
 *
 * # 3) 机读
 * node ops/tools/config-ui-parity.mjs --json > /tmp/parity.json
 *
 * # 4) 换基准版本
 * node ops/tools/config-ui-parity.mjs --root 源代码 --ref 0.9.0
 * ```
 *
 * 退出码：报告工具，有缺口也返回 0；参数或路径错误返回 2。
 * 想把它当门禁用，请消费 `--json`（`copy` 数组长度应保持为 0 或全部登记过）。
 */
import fs from 'node:fs'
import path from 'node:path'

import { decodeObfuscatedFile } from '../lib/deob-decode.mjs'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const valueOf = (name, fallback) => {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}

const REPO = path.resolve(valueOf('repo', '.'))
/** 参考版本所在目录（`0.9.0/` 的父目录）。与 `--repo` 分开：跑 `--root 源代码` 时仓库根仍是当前目录。 */
const REF_ROOT = path.resolve(valueOf('root', '源代码'))
const REF = valueOf('ref', '0.9.0')
const JSON_OUT = flag('json')
const ONLY_COPY = flag('copy')
const ONLY_CLASSES = flag('classes')
const ONLY_SELECTORS = flag('selectors')
const ALL = !ONLY_COPY && !ONLY_CLASSES && !ONLY_SELECTORS

const REF_FRONTEND = path.join(REF_ROOT, REF, 'frontend')
const REF_MODULES = path.join(REF_FRONTEND, 'modules/interaction3d')
const OURS = path.join(REPO, 'homeos/frontend')

if (!fs.existsSync(REF_MODULES)) {
  console.error(`找不到 0.9.0 配置 UI 模块：${REF_MODULES}`)
  process.exit(2)
}

/**
 * 参与对账的 0.9.0 模块。
 *
 * 只收「配置面板」这条链路：编辑器壳（`editor.js`）、配置总装（`config-editor.js`）、
 * 四个专用编辑器（安防 / 人体 / 照射范围 / 灯效）、面板侧渲染（`cover-panel.js` 等）。
 * `stage.js` / `runtime.js` 是运行时不在此列 —— 它们的差异是播放行为，不是配置界面。
 */
const CONFIG_MODULES = [
  'static/modules/interaction3d/editor.js',
  'static/modules/interaction3d/binding-repair.js',
  'static/modules/interaction3d/editor-pickers.js',
  'modules/interaction3d/config-editor.js',
  'modules/interaction3d/device-entity-config.js',
  'modules/interaction3d/indicator-condition-editor.js',
  'modules/interaction3d/extra-sources-editor.js',
  'modules/interaction3d/security-editor.js',
  'modules/interaction3d/presence-editor.js',
  'modules/interaction3d/cover-panel.js',
  'modules/interaction3d/vacuum-map-editor.js',
  'modules/interaction3d/window-opener.js',
  'modules/interaction3d/light-effects-editor.js',
  'modules/interaction3d/light-range-editor.js',
  'modules/interaction3d/range-dialog.js',
  'modules/interaction3d/cover-feedback.js',
  'modules/interaction3d/popup-preview.js',
  'modules/interaction3d/light-extra-panel.js',
  'modules/interaction3d/light-color-picker.js',
]

/** 0.9.0 的样式表（配置界面实际加载的全部 9 张）。 */
const STYLE_TABLES = [
  'static/modules/interaction3d/bridge.css',
  'modules/interaction3d/runtime.css',
  'static/modules/interaction3d/controls.css',
  'static/modules/interaction3d/natural-theme.css',
  'modules/interaction3d/stage.css',
  'modules/interaction3d/cover-panel.css',
  'modules/interaction3d/climate-panel.css',
  'modules/interaction3d/nas-panel.css',
  'modules/interaction3d/presence-editor.css',
]

/** 递归列出目录下的文件（相对给定目录）。 */
function listFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) listFiles(full, out)
    else out.push(full)
  }
  return out
}

/** 本项目里可能消费类名/选择器的源码：TS / Vue / 全部 CSS（含 public 静态那一份）。 */
function repoCorpus() {
  const files = [...listFiles(path.join(OURS, 'src')), ...listFiles(path.join(OURS, 'public/static'))]
  const texts = []
  for (const file of files) {
    if (/\.(ts|vue|css)$/.test(file)) texts.push(fs.readFileSync(file, 'utf8'))
  }
  return texts.join('\n')
}

/**
 * paren-aware 拆逗号。
 *
 * 不能按 `,` 裸切：`:is(.a, .b) .c` 会被切成 `:is(.a` 与 `.b) .c` 两段垃圾，
 * 于是「缺 300 条」里有 200 条是切出来的假选择器。
 */
function splitSelectorList(text) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(' || char === '[') depth += 1
    if (char === ')' || char === ']') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += char
  }
  if (current.trim()) parts.push(current)
  return parts
    .map((part) =>
      part
        .replace(/\s+/g, ' ')
        // 属性值引号归一：上游写 `[data-scene-style=warm-wood]`，本项目写
        // `[data-scene-style="warm-wood"]` —— 语义相同。不归一的话
        // natural-theme.css 的 5 条主题规则会全部被报成「缺失」。
        .replace(/\[\s*([\w-]+)\s*([~^|$*]?=)\s*"([^"]*)"\s*\]/g, '[$1$2$3]')
        .replace(/\[\s*([\w-]+)\s*([~^|$*]?=)\s*'([^']*)'\s*\]/g, '[$1$2$3]')
        // 括号内的逗号与括号贴合也归一：本项目的美化输出是 `:is(\n a,\n b\n)`，
        // 上游压缩产物是 `:is(a,b)`。不归一，`natural-theme.css` 这种
        // 「一条规则一个 :is(...)」的文件会 100% 被误报。
        .replace(/\s*,\s*/g, ',')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .replace(/\s*([>+~])\s*/g, '$1')
        .trim(),
    )
    .filter(Boolean)
}

/** 从一张样式表里取「选择器 → 声明体」。注释先剔掉，否则注释里的 `{` 会错位。 */
function readRules(cssText) {
  // 只剔 `/* */` 注释，**保留**块注释里的内容之外的一切空白。
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = new Map()
  /**
   * 为什么不用 `(^|[}])` 做规则起点锚：
   *
   * 规则之间常夹着注释（本项目尤其多）。注释被剔掉后，规则之间只剩空白，但扫描指针已越过
   * 上一条的 `}`，于是「下一个字符必须是 `}`」的锚点失效 —— 紧跟注释的那条规则会被整条跳过。
   * 症状很隐蔽：`natural-theme.css` 里 `:is(…)` 变量块加了却永远报「缺失」。
   *
   * 改成不要求锚点、并显式跳过 `@` 开头的 at-rule 前置块（`@media`/`@supports` 的
   * prelude 里没有 `{}`，会被当作「选择器」抓出来 —— 用 `@` 过滤掉即可）。
   */
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  let match
  while ((match = pattern.exec(css))) {
    const selector = match[1].trim()
    if (!selector || selector.includes('@')) continue
    const body = match[2].trim()
    rules.set(selector, rules.has(selector) ? `${rules.get(selector)} | ${body}` : body)
  }
  return rules
}

/**
 * 0.9.0 解码串里的「代码片段」长得也像文案（正则源码、`_0x…` 拼接残留），
 * 不剔掉就会在缺口清单里出现 `](_0x4ede9f)||!/occupancy…` 这种整行噪声。
 */
function looksLikeCode(text) {
  return text.includes('_0x') || /[{};]|=>|\b(?:function|return|const|let|var)\b/.test(text) || /^[\]\[)(.,]/.test(text)
}

/**
 * 展开 `:is(...)` / `:where(...)` 的逗号分支，得到一个选择器集合。
 *
 * 上游压缩产物常写 `.a input, .a select`，本项目顺手写成 `.a :is(input, select)`（或反过来）。
 * 两者在 CSS 里**完全等价**，但文本比对会把它们算成两条缺失。`natural-theme` 那 3 条、
 * `runtime.css` 的 `.i3d-editor input,.i3d-editor select` 都是这一类假阴性。
 *
 * 只做一层层剥离（不做完整选择器运算）：`A :is(B,C) D` → `A B D` 与 `A C D`。
 */
function expandSelector(selector) {
  const expanded = new Set([selector])
  let hasGroup = true
  while (hasGroup) {
    hasGroup = false
    for (const candidate of [...expanded]) {
      const groupMatch = candidate.match(/:i?s?\(([^()]*)\)|:where\(([^()]*)\)/)
      if (!groupMatch) continue
      const inner = groupMatch[1] ?? groupMatch[2] ?? ''
      const head = candidate.slice(0, groupMatch.index)
      const tail = candidate.slice((groupMatch.index ?? 0) + groupMatch[0].length)
      // 内层还有括号（`:is(.a :not(.b))`）时先不动，留给下一轮或放弃展开。
      if (/[()]/.test(inner)) continue
      const branches = inner
        .split(',')
        .map((branch) => branch.trim())
        .filter(Boolean)
      if (branches.length < 2) continue
      expanded.delete(candidate)
      for (const branch of branches) {
        expanded.add(
          (head + branch + tail)
            .replace(/\s+/g, ' ')
            .replace(/\s*([>+~])\s*/g, '$1')
            .trim(),
        )
      }
      hasGroup = true
      break
    }
  }
  return expanded
}

/**
 * 一条参考文案在本项目里的命中情况。
 *
 * - `exact`：本地有同一句字面量（最硬的证据）；
 * - `fragmented`：整句没有，但按数字/占位符切开后**每一段**都在本地出现过。
 *   这类是「运行时拼出来的」（`仅跟随天气状态；预览 ${n} 秒后…`、`按钮，最后点击…`、
 *   `设备配置 → 配置环境`），不能算缺口；
 * - `missing`：连片段都找不到，才是真缺口。
 */
function classifyCopy(text, corpus) {
  if (corpus.includes(text)) return 'exact'
  const fragments = text
    .split(/\d+|[，。；：、·…]+/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length >= 3)
  if (fragments.length && fragments.every((fragment) => corpus.includes(fragment))) return 'fragmented'
  return 'missing'
}

// ── 1) 文案差集 ─────────────────────────────────────────────────────────────

function copyGaps(corpus) {
  const report = []
  for (const modulePath of CONFIG_MODULES) {
    const absolute = path.join(REF_FRONTEND, modulePath)
    if (!fs.existsSync(absolute)) continue
    const { strings, decoded, total } = decodeObfuscatedFile(absolute)
    // 只留中文串；`\x20` 这类**未解码的源码字面量**要剔掉 —— 它们在数组里以转义形式出现，
    // 解码后的同一条文案（真实空格）会在后面单独命中，留着只会把缺口数量翻倍。
    const chinese = [...strings].filter(
      (text) => /[\u4e00-\u9fff]/.test(text) && !/\\x[0-9a-f]{2}/i.test(text) && !looksLikeCode(text),
    )
    const missing = []
    const fragmented = []
    for (const text of chinese) {
      const verdict = classifyCopy(text, corpus)
      if (verdict === 'missing') missing.push(text)
      else if (verdict === 'fragmented') fragmented.push(text)
    }
    report.push({
      module: modulePath,
      chineseStrings: chinese.length,
      missing,
      fragmented,
      decoded: `${decoded}/${total}`,
    })
  }
  return report
}

// ── 2) 类名消费者 ───────────────────────────────────────────────────────────

/** 参考侧样式表里定义过的类名（判断「有没有样式」的宇宙）。 */
function referenceStyleClasses() {
  const classes = new Set()
  for (const table of STYLE_TABLES) {
    const absolute = path.join(REF_FRONTEND, table)
    if (!fs.existsSync(absolute)) continue
    const css = fs.readFileSync(absolute, 'utf8')
    for (const match of css.matchAll(/\.((?:i3d|hb)-[a-z0-9-]+)/g)) classes.add(match[1])
  }
  return classes
}

function classGaps() {
  const refClasses = referenceStyleClasses()
  const classNames = new Set()
  for (const modulePath of CONFIG_MODULES) {
    const absolute = path.join(REF_FRONTEND, modulePath)
    if (!fs.existsSync(absolute)) continue
    for (const text of decodeObfuscatedFile(absolute).strings) {
      // 只保留「完整类名」：`i3d-auto-rotate-` 这类是 JS 里的前缀拼接，不是类名。
      if (/^(i3d|hb)-[a-z0-9-]+[a-z0-9]$/.test(text)) classNames.add(text)
    }
  }
  const cssFiles = [...listFiles(path.join(OURS, 'src')), ...listFiles(path.join(OURS, 'public/static'))].filter(
    (file) => file.endsWith('.css'),
  )
  const cssCorpus = cssFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  const tsCorpus = listFiles(path.join(OURS, 'src'))
    .filter((file) => /\.(ts|vue)$/.test(file))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n')

  const wired = []
  /** 0.9.0 有、本项目 CSS 有、但没有任何 DOM 消费：典型「加了死样式」或「DOM 没接」。 */
  const stylesWithoutDom = []
  /** 0.9.0 有、本项目 TS 用、但 CSS 没定义：必然退回默认排版。 */
  const domWithoutStyles = []
  for (const className of [...classNames].sort()) {
    const inCss = cssCorpus.includes(className)
    const inTs = tsCorpus.includes(className)
    if (inCss && inTs) wired.push(className)
    else if (inCss) stylesWithoutDom.push(className)
    else if (inTs) domWithoutStyles.push(className)
  }
  return {
    total: classNames.size,
    wired: wired.length,
    // 只报与配置界面相关的那一档（参考侧样式里确实定义过的），避免把元素 id 混进来。
    stylesWithoutDom: stylesWithoutDom.filter((name) => refClasses.has(name)),
    domWithoutStyles: domWithoutStyles.filter((name) => refClasses.has(name)),
    notUsedAnywhere: [...classNames].filter(
      (name) => !cssCorpus.includes(name) && !tsCorpus.includes(name) && refClasses.has(name),
    ),
  }
}

// ── 3) 选择器线索 ───────────────────────────────────────────────────────────

/**
 * 0.9.0 的 JS **实际产出过**的类名。
 *
 * 用途：区分两种「本地缺这个选择器」——
 *
 * - 类名在 0.9.0 的 JS 里有产出 → 真缺口：上游有 UI，我们没样式；
 * - 类名在所有 0.9.0 的 JS 里都没有 → **上游自己就是死 CSS**（例如
 *   `presence-pages`、`i3d-extra-number`、`i3d-floor-brightness`、`is-door-opener` 之外的
 *   几个）。这些不该计入我们的欠账：抄过来只会得到一段没有消费者的死样式。
 */
function referenceProducedClasses() {
  const produced = new Set()
  const files = listFiles(path.join(REF_FRONTEND)).filter(
    (file) => file.endsWith('.js') && /interaction3d|3d-studio/.test(file),
  )
  for (const file of files) {
    for (const text of decodeObfuscatedFile(file).strings) {
      if (/^(i3d|hb|presence|interaction3d)-[a-z0-9-]+$/.test(text)) produced.add(text)
    }
  }
  return produced
}

function selectorHints() {
  const oursSelectors = new Set()
  const sources = [...listFiles(path.join(OURS, 'src')), ...listFiles(path.join(OURS, 'public/static'))].filter(
    (file) => file.endsWith('.css'),
  )
  for (const file of sources) {
    for (const selector of readRules(fs.readFileSync(file, 'utf8')).keys()) {
      for (const simple of splitSelectorList(selector)) {
        oursSelectors.add(simple)
        // `:is(a, b)` 与 `a, b` 等价：本地任一种写法都应算命中。
        for (const variant of expandSelector(simple)) oursSelectors.add(variant)
      }
    }
  }
  const produced = referenceProducedClasses()
  /** 这些是「容器/作用域」类，几乎所有规则都会带：只看它们会掩盖真正的缺失类。 */
  const GENERIC_CLASSES = new Set(['i3d-editor', 'i3d-climate-panel', 'interaction3d-stage', 'i3d-note'])
  const report = []
  for (const table of STYLE_TABLES) {
    const absolute = path.join(REF_FRONTEND, table)
    if (!fs.existsSync(absolute)) continue
    const rules = readRules(fs.readFileSync(absolute, 'utf8'))
    const missing = []
    const upstreamDead = []
    for (const [selector, body] of rules) {
      // 参考侧同样先展开，再逐个分支问「本地有没有」。
      const absent = splitSelectorList(selector).filter(
        (simple) => ![...expandSelector(simple)].some((variant) => oursSelectors.has(variant)),
      )
      if (!absent.length) continue
      const ownClasses = [...selector.matchAll(/\.([a-z][a-z0-9-]+)/g)]
        .map((match) => match[1])
        .filter((name) => !GENERIC_CLASSES.has(name))
      /**
       * 判定「上游这条规则到底可不可达」：要求它引用的**每一个**自有类名都被 0.9.0 产出过。
       *
       * 只要求「至少一个」会漏判：`.i3d-climate-panel .i3d-extra-button > .i3d-climate-choice`
       * 里 `i3d-climate-choice` 有产出、`i3d-extra-button` 没有 —— 前者会让整条规则被当成
       * 「我们的缺口」，而实际上上游根本构造不出 `.i3d-extra-button` 这个元素。
       */
      if (ownClasses.length && !ownClasses.every((name) => produced.has(name))) {
        upstreamDead.push({ selector })
      } else {
        missing.push({ selector, body, absent })
      }
    }
    report.push({ table, total: rules.size, missing, upstreamDead })
  }
  return report
}

// ── 输出 ────────────────────────────────────────────────────────────────────

const corpus = repoCorpus()
const payload = { ref: REF, modules: CONFIG_MODULES.length }

if (ALL || ONLY_COPY) payload.copy = copyGaps(corpus)
if (ALL || ONLY_CLASSES) payload.classes = classGaps()
if (ALL || ONLY_SELECTORS) payload.selectors = selectorHints()

if (JSON_OUT) {
  console.log(JSON.stringify(payload, null, 2))
} else {
  if (payload.copy) {
    const totalMissing = payload.copy.reduce((sum, entry) => sum + entry.missing.length, 0)
    const totalFragmented = payload.copy.reduce((sum, entry) => sum + entry.fragmented.length, 0)
    console.log(`\n## 文案差集：${totalMissing} 条真缺口；另有 ${totalFragmented} 条是运行时拼接（片段都在本地）`)
    for (const entry of payload.copy) {
      if (!entry.missing.length) continue
      console.log(
        `\n### ${entry.module}（解码 ${entry.decoded}，中文 ${entry.chineseStrings}，缺 ${entry.missing.length}）`,
      )
      console.log('  ' + entry.missing.join(' ‖ '))
    }
  }
  if (payload.classes) {
    const { total, wired, stylesWithoutDom, domWithoutStyles, notUsedAnywhere } = payload.classes
    console.log(`\n## 类名接线：0.9.0 用 ${total} 个，两端都有 ${wired} 个`)
    if (stylesWithoutDom.length)
      console.log(`  有样式无 DOM（${stylesWithoutDom.length}）：${stylesWithoutDom.join(' ')}`)
    if (domWithoutStyles.length)
      console.log(`  有 DOM 无样式（${domWithoutStyles.length}）：${domWithoutStyles.join(' ')}`)
    if (notUsedAnywhere.length) console.log(`  两端都没有（${notUsedAnywhere.length}）：${notUsedAnywhere.join(' ')}`)
  }
  if (payload.selectors) {
    const totalMissing = payload.selectors.reduce((sum, entry) => sum + entry.missing.length, 0)
    const totalDead = payload.selectors.reduce((sum, entry) => sum + entry.upstreamDead.length, 0)
    console.log(
      `\n## 选择器差集：${totalMissing} 条真缺口；另有 ${totalDead} 条属 0.9.0 自己的死样式（JS 无产出，不移植）`,
    )
    for (const entry of payload.selectors) {
      if (!entry.missing.length && !entry.upstreamDead.length) continue
      console.log(
        `  ${entry.table}：${entry.total} 条规则，真缺口 ${entry.missing.length}，上游死样式 ${entry.upstreamDead.length}`,
      )
      for (const item of entry.missing.slice(0, 8)) console.log(`     缺：${item.selector.replace(/\s+/g, ' ')}`)
    }
  }
}
