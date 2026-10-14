/**
 * 布局契约回归（P1-layout 的成绩单棘轮）。
 *
 * P1-layout 修的是一批「typecheck / lint / 令牌门禁全部看不见」的布局缺陷：层级取值、
 * 窄屏塌陷、表格横向可滚、移动端可视高度与安全区、顶栏文案溢出。这些缺陷的共同特点是
 * **删掉修复代码后一切门禁照旧全绿**，只有真机上肉眼才能发现，所以单独用一份源码级棘轮
 * 把它们钉住：
 *
 * 1. **层级**：`.device-row-menu` 必须有显式 z-index（否则它是 auto，同层内靠 DOM 顺序
 *    决定谁压谁）；`climate-panel.css` 不得再出现裸 `z-index: 10000/10010` 这类夹在
 *    `--z-modal(1000)` 与 `--z-drawer(11000)` 之间的值；令牌阶梯必须严格递增。
 * 2. **塌陷**：4 列 KPI 网格与 2 列分析面板网格在 640px 以下必须降到 2 列 / 1 列。
 * 3. **横向可滚**：包着表格的滚动容器必须显式写 `overflow-x`，不能依赖
 *    「`overflow-y: auto` + `overflow-x: visible` ⇒ 规范隐式改成 auto」这条路。
 * 4. **可视高度**：`100vh` 声明后面必须跟一条 `100dvh`；`.viewport-frame` 必须带
 *    `env(safe-area-inset-*)` 与 `box-sizing: border-box`。
 * 5. **顶栏品牌**：`.tab-bar__brand-text` / `.tab-bar__title` 必须能收缩并省略号截断。
 * 6. **studio 外壳顺序**：`page-assets.ts` 的路由样式表必须落在 Vite 打包 CSS **之前**
 *    （锚点缺失也不能追加到 `<head>` 末尾）；旧包 `app.css` 不得再定义外壳三区网格 ——
 *    这两条正是 studio-chrome.css 那 52 条 `!important` 存在的根因。
 *
 * 口径说明：这是**已收敛清单的棘轮**，不是全仓样式扫描器。旧静态包
 * （`homeos/frontend/public/static/{app,renderer,studio,auth,display}.css`）里还有一批
 * `100vh` 没配 `dvh`，属于 P3「样式去债」，这里只登记基线数目（只能减不能增），
 * 不把它们算成红灯。
 *
 * 用法：`bun run scripts/smoke/_layout_contracts_smoke.ts`（在 homeos/frontend 下执行）。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { check, report, section } from '../_smoke_harness'

const FRONTEND_SRC = join(import.meta.dir, '..', '..', 'src')
const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')
const LEGACY_STATIC = join(REPO_ROOT, 'homeos', 'frontend', 'public', 'static')

/* ------------------------------------------------------------------ *
 * 极简 CSS 解析：选择器 + 外层 at-rule + 声明体
 * ------------------------------------------------------------------ */

interface CssRule {
  selector: string
  /** 外层 at-rule 前奏（由外到内），例如 `['@media (max-width: 639px)']` */
  atRules: string[]
  body: string
}

/** 剥注释：注释里常出现 `{`/`}`，不剥会切坏块结构。 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function parseInto(src: string, prefix: string[], rules: CssRule[]): void {
  let cursor = 0
  let start = 0
  while (cursor < src.length) {
    if (src[cursor] !== '{') {
      cursor += 1
      continue
    }
    const selector = src.slice(start, cursor).trim().replace(/\s+/g, ' ')
    let depth = 1
    let end = cursor + 1
    while (end < src.length && depth > 0) {
      if (src[end] === '{') depth += 1
      else if (src[end] === '}') depth -= 1
      end += 1
    }
    const body = src.slice(cursor + 1, end - 1)
    if (selector.startsWith('@')) parseInto(body, [...prefix, selector], rules)
    else if (selector !== '') rules.push({ selector, atRules: prefix, body })
    cursor = end
    start = end
  }
}

function parseCss(css: string): CssRule[] {
  const rules: CssRule[] = []
  parseInto(stripComments(css), [], rules)
  return rules
}

function readRules(absPath: string): CssRule[] {
  return parseCss(readFileSync(absPath, 'utf8'))
}

/** 命中选择器完全一致的规则（`a, b {}` 的 `b` 也命中，与浏览器一致）。 */
function rulesFor(rules: CssRule[], selector: string): CssRule[] {
  return rules.filter((rule) =>
    rule.selector
      .split(',')
      .map((part) => part.trim())
      .includes(selector),
  )
}

/** 取某属性在该规则里的所有声明值（同名多次声明按出现顺序）。 */
function declValues(rule: CssRule, prop: string): string[] {
  const values: string[] = []
  const re = new RegExp(`(?:^|[;{])\\s*${prop}\\s*:([^;}]+)`, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(rule.body)) !== null) values.push(match[1].trim())
  return values
}

function hasDecl(rule: CssRule, prop: string, pattern?: RegExp): boolean {
  return declValues(rule, prop).some((value) => (pattern ? pattern.test(value) : true))
}

function hasRule(rules: CssRule[], selector: string, prop: string, pattern?: RegExp): boolean {
  return rulesFor(rules, selector).some((rule) => hasDecl(rule, prop, pattern))
}

/** 命中「在 max-width ≤ 给定值 的媒体查询里」的规则。 */
function narrowRules(rules: CssRule[], selector: string, maxWidth: number): CssRule[] {
  return rulesFor(rules, selector).filter((rule) =>
    rule.atRules.some((prelude) => {
      const match = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(prelude)
      return match !== null && Number(match[1]) <= maxWidth
    }),
  )
}

/* ------------------------------------------------------------------ *
 * 目录级扫描（dvh / 安全区）
 * ------------------------------------------------------------------ */

interface ViewportHeightDeclaration {
  file: string
  value: string
}

const VIEWPORT_HEIGHT_RE = /(?:^|[;\s{])(?:min-|max-)?height:\s*([^;]*\b100vh\b[^;]*)/g

/**
 * 找出所有「视口高度」声明里没有配 `dvh` 的（配对口径：紧跟的下一行含 `100dvh`）。
 * `skipCalcOnly` 排除「`100vh` 只出现在 calc() 里做列宽/画布换算」的声明——那不是
 * 「铺满视口」语义，换 dvh 反而会改错量。
 */
function uncoveredViewportHeights(
  files: string[],
  options: { skipCalcOnly?: boolean } = {},
): ViewportHeightDeclaration[] {
  const out: ViewportHeightDeclaration[] = []
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      VIEWPORT_HEIGHT_RE.lastIndex = 0
      const match = VIEWPORT_HEIGHT_RE.exec(line)
      if (match === null) continue
      if (/dvh/.test(line)) continue
      if (options.skipCalcOnly === true && /calc\(/.test(match[1])) continue
      if (/100dvh/.test(lines[index + 1] ?? '')) continue
      out.push({ file, value: match[1].trim() })
    }
  }
  return out
}

function cssFilesUnder(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (full.endsWith('.css') || full.endsWith('.vue')) out.push(full)
    }
  }
  walk(root)
  return out
}

/* ------------------------------------------------------------------ *
 * ① 层级
 * ------------------------------------------------------------------ */

const DEVICES_THEME = join(FRONTEND_SRC, 'views', 'styles', 'devices-theme.css')
const CLIMATE_PANEL = join(FRONTEND_SRC, 'studio', 'runtime', 'climate', 'climate-panel.css')
const MAIN_LAYOUT = join(FRONTEND_SRC, 'layouts', 'styles', 'main-layout.css')
const HOME_MODE = join(FRONTEND_SRC, 'features', 'home-mode', 'editor', 'styles', 'HomeMode.css')
const SCALED_VIEWPORT = join(FRONTEND_SRC, 'assets', 'styles', 'scaled-viewport.css')
const MAIN_CSS = join(FRONTEND_SRC, 'assets', 'styles', 'main.css')

const devicesTheme = readRules(DEVICES_THEME)
const climatePanel = readRules(CLIMATE_PANEL)
const mainLayout = readRules(MAIN_LAYOUT)
const homeMode = readRules(HOME_MODE)
const scaledViewport = readRules(SCALED_VIEWPORT)
const mainCss = readRules(MAIN_CSS)

section('① 层级：行菜单、浮层令牌与阶梯单调')

check(
  '行菜单：.device-row-menu 显式声明 z-index',
  hasRule(devicesTheme, '.device-row-menu', 'z-index', /^\s*\d+\s*$/),
  rulesFor(devicesTheme, '.device-row-menu')
    .flatMap((rule) => declValues(rule, 'z-index'))
    .join('/'),
)
check(
  '行菜单：遮罩走 --z-* 令牌而非裸值',
  hasRule(devicesTheme, '.device-row-menu-overlay', 'z-index', /^var\(--z-[a-z-]+\)$/),
)

for (const [label, selector] of [
  ['手势提示', '.i3d-extra-gesture-hint'],
  ['下拉浮层', '.i3d-extra-select-menu'],
] as const) {
  check(
    `气候面板：${label}走层级令牌`,
    hasRule(climatePanel, selector, 'z-index', /^var\(--z-[a-z-]+\)$/),
    rulesFor(climatePanel, selector)
      .flatMap((rule) => declValues(rule, 'z-index'))
      .join('/'),
  )
}

/** 裸 z-index 只要落在路由内浮层档（≥1000）就是层级塌陷的源头，必须走令牌。 */
const bareLayeredZIndex: string[] = []
for (const [label, rules] of [
  ['devices-theme.css', devicesTheme],
  ['climate-panel.css', climatePanel],
  ['main-layout.css', mainLayout],
  ['HomeMode.css', homeMode],
] as const) {
  for (const rule of rules) {
    for (const value of declValues(rule, 'z-index')) {
      if (/^\s*\d+\s*$/.test(value) && Number(value) >= 1000) {
        bareLayeredZIndex.push(`${label} ${rule.selector} → ${value}`)
      }
    }
  }
}
check(
  '层级：四个受管样式表内无裸值 ≥1000 的 z-index',
  bareLayeredZIndex.length === 0,
  bareLayeredZIndex.join('、'),
)

const ladder = rulesFor(mainCss, ':root')
  .flatMap((rule) => rule.body.match(/--z-[a-z-]+:\s*(\d+)/g) ?? [])
  .map((entry) => Number(entry.split(':')[1].trim()))
const ascending = ladder.every((value, index) => index === 0 || value > ladder[index - 1])
check(
  '层级：main.css 的 --z-* 阶梯严格递增（改档位必须同时改说明）',
  ladder.length >= 8 && ascending,
  ladder.join(' < '),
)

/* ------------------------------------------------------------------ *
 * ② 窄屏塌陷
 * ------------------------------------------------------------------ */

section('② 窄屏塌陷：KPI 网格与分栏网格')

const COLLAPSE_EXPECTATIONS: Array<[string, string, RegExp]> = [
  ['分析面板分栏', '.dev-analytics-grid', /^1fr$/],
  ['使用明细 4 列', '.device-analytics__usage-metrics', /repeat\(2,/],
  ['使用明细 3 列', '.device-analytics__usage-metrics--3', /repeat\(2,/],
  ['设备概览 KPI 4 列', '.device-overview__kpi', /repeat\(2,/],
]

for (const [label, selector, pattern] of COLLAPSE_EXPECTATIONS) {
  const narrowed = narrowRules(devicesTheme, selector, 640)
  check(
    `塌陷：${label}（${selector}）在 ≤640px 降列`,
    narrowed.some((rule) => hasDecl(rule, 'grid-template-columns', pattern)),
    narrowed.map((rule) => rule.atRules.join(' ') || '(无媒体查询)').join('、'),
  )
}

const homePillsNarrow = narrowRules(homeMode, '.home-mode-panel .hm-context-pills', 640)
check(
  '塌陷：HomeMode 上下文胶囊在 ≤640px 单列（2 列 × 148px 会撑破小屏容器）',
  homePillsNarrow.some((rule) => hasDecl(rule, 'grid-template-columns', /^1fr$/)),
  homePillsNarrow.map((rule) => rule.atRules.join(' ')).join('、'),
)

/* ------------------------------------------------------------------ *
 * ③ 表格横向可滚
 * ------------------------------------------------------------------ */

section('③ 表格横向可滚：显式 overflow-x')

const SCROLL_WRAPPERS: Array<[string, string]> = [
  ['使用排行', '.device-analytics__rank-scroll'],
  ['详情 Tab 排行', '.device-detail-tab__rank-scroll'],
  ['状态历史', '.device-history-panel__list-scroll'],
]
for (const [label, selector] of SCROLL_WRAPPERS) {
  const targets = rulesFor(devicesTheme, selector)
  check(
    `表格容器：${label}显式声明 overflow-x`,
    targets.some((rule) => hasDecl(rule, 'overflow-x', /auto|scroll/)),
    targets.flatMap((rule) => declValues(rule, 'overflow-x')).join('/'),
  )
}

/*
 * 商店侧的同名断言（静态壳表的 dvh 配对、`.table-wrap` / `.referral-table-wrap` 的横向可滚）
 * 不在这里：本工程是一棵可独立构建部署的树，源码与脚本里出现兄弟项目的路径会被
 * `verify:independence` 拦下（构建也会被绑死）。它们住在商店自己的冒烟里 ——
 * 「商店前端布局契约」那一条。
 */

/* ------------------------------------------------------------------ *
 * ④ 可视高度与安全区
 * ------------------------------------------------------------------ */

section('④ 可视高度（dvh）与视口安全区')

check(
  '视口壳：.viewport-frame 同时给 100vh 与 100dvh',
  hasRule(scaledViewport, '.viewport-frame', 'height', /^100vh$/) &&
    hasRule(scaledViewport, '.viewport-frame', 'height', /^100dvh$/),
)
check(
  '视口壳：.viewport-frame 让出系统安全区',
  hasRule(scaledViewport, '.viewport-frame', 'padding', /env\(safe-area-inset-top/) &&
    hasRule(scaledViewport, '.viewport-frame', 'padding', /env\(safe-area-inset-bottom/),
)
check(
  '视口壳：安全区 padding 不撑破 100vw/100dvh',
  hasRule(scaledViewport, '.viewport-frame', 'box-sizing', /border-box/),
)

const sourceTreeUncovered = uncoveredViewportHeights(cssFilesUnder(FRONTEND_SRC))
check(
  'dvh：本工程 src 内每条视口高度声明都配了 dvh',
  sourceTreeUncovered.length === 0,
  sourceTreeUncovered.map((item) => `${item.file.split('/').slice(-1)[0]} ${item.value}`).join('、'),
)

/**
 * 旧静态包的存量债务基线（P3「样式去债」范围）。数字只允许下降：
 * 新增一处没配 dvh 的 `100vh` 会让这条红，逼着人补 dvh 或显式下调基线。
 */
const LEGACY_VH_DEBT_BASELINE = 35
const legacyUncovered = uncoveredViewportHeights(cssFilesUnder(LEGACY_STATIC), {
  skipCalcOnly: true,
})
check(
  `dvh：旧静态包未配 dvh 的视口高度声明不超过基线 ${LEGACY_VH_DEBT_BASELINE} 条`,
  legacyUncovered.length <= LEGACY_VH_DEBT_BASELINE,
  `实际 ${legacyUncovered.length} 条`,
)

/* ------------------------------------------------------------------ *
 * ⑤ 顶栏品牌溢出
 * ------------------------------------------------------------------ */

section('⑤ 顶栏品牌：长站点标题省略号截断')

check(
  '顶栏：.tab-bar__brand-text 允许收缩并裁切',
  hasRule(mainLayout, '.tab-bar__brand-text', 'min-width', /^0$/) &&
    hasRule(mainLayout, '.tab-bar__brand-text', 'overflow', /hidden/),
)
check(
  '顶栏：.tab-bar__title 单行 + 省略号',
  hasRule(mainLayout, '.tab-bar__title', 'white-space', /nowrap/) &&
    hasRule(mainLayout, '.tab-bar__title', 'text-overflow', /ellipsis/) &&
    hasRule(mainLayout, '.tab-bar__title', 'overflow', /hidden/),
)
check(
  '顶栏：≤639px 品牌区可收缩（不能是 flex: 0 0 auto）',
  narrowRules(mainLayout, '.tab-bar__brand', 639).some(
    (rule) =>
      hasDecl(rule, 'flex', /^0\s+1\s+auto$/) ||
      (hasDecl(rule, 'flex-shrink', /^1$/) && hasDecl(rule, 'min-width', /^0$/)),
  ),
  narrowRules(mainLayout, '.tab-bar__brand', 639)
    .flatMap((rule) => declValues(rule, 'flex'))
    .join('/'),
)

/* ------------------------------------------------------------------ *
 * ⑥ studio 外壳与旧静态包的加载顺序（!important 对抗的根因）
 * ------------------------------------------------------------------ */

section('⑥ studio 外壳：路由样式表顺序与 !important 对抗')

const PAGE_ASSETS = join(FRONTEND_SRC, 'studio', 'page-assets.ts')
const pageAssetsSource = readFileSync(PAGE_ASSETS, 'utf8')
check(
  '页面资产：锚点缺失时插到第一张非受管样式表之前（不能追加到 head 末尾）',
  pageAssetsSource.includes(
    'const UNMANAGED_STYLESHEET_SELECTOR = `link[rel="stylesheet"]:not([${MANAGED_ATTR}])`',
  ) && pageAssetsSource.includes('else if (boundary) boundary.before(el)'),
  '缺兜底边界 → 路由外观会排到 Vite CSS 之后，「后加载的赢」反过来成立',
)

const legacyAppCss = readRules(join(LEGACY_STATIC, 'app.css'))
const chromeLayoutProps = new Set([
  'display',
  'grid-template-columns',
  'grid-template-areas',
  'width',
  'height',
  'transform',
  'position',
])
const legacyChromeRules = legacyAppCss.filter(
  (rule) =>
    (rule.selector.includes('.editor-chrome-root') ||
      rule.selector.includes('.studio-chrome-root')) &&
    [...chromeLayoutProps].some((prop) => hasDecl(rule, prop)),
)
check(
  '旧包 app.css 不再定义 studio 外壳的三区网格 / 折叠布局（对抗的另一半已删）',
  legacyChromeRules.length === 0,
  legacyChromeRules.map((rule) => rule.selector).join('、'),
)

const CHROME_CSS = join(FRONTEND_SRC, 'studio', 'chrome', 'studio-chrome.css')
const chromeImportantCount = (readFileSync(CHROME_CSS, 'utf8').match(/!important/g) ?? []).length
/**
 * 棘轮：顺序问题已从根因修掉（见上一条），但存量 52 条 `!important` 是**防御性**的，
 * 逐条摘除需要真机过一遍 studio 编辑器路由（存在同文件内「ID 选择器 vs !important」
 * 这类肉眼才能判定的取舍），归入 P3「样式去债」。这里只保证不再增加。
 */
const CHROME_IMPORTANT_BASELINE = 52
check(
  `studio-chrome.css 的 !important 不超过基线 ${CHROME_IMPORTANT_BASELINE}（只减不增）`,
  chromeImportantCount <= CHROME_IMPORTANT_BASELINE,
  `实际 ${chromeImportantCount} 条`,
)

report('布局契约回归')
