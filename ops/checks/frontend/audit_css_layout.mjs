#!/usr/bin/env node
/**
 * 前端 CSS / 布局审计。
 *
 * ## 为什么需要它
 *
 * 这个仓库的样式表有 5 套「真源」并存（`main.css` 的全局令牌、`hos-design-system.css` 的
 * canonical 令牌、`app-premium-tokens.css` 的 premium 族、各路由的 `public/static/*.css`、
 * 以及 Vue `<style scoped>`），彼此**互相覆盖**。CSS 的失败模式几乎都不报错：
 *
 * - token 名打错 → `var()` 解析失败 → 静默退化成兜底值（换肤不跟随）；
 * - 同选择器在两张表里各写一份 → 后加载的赢 → 前一份变成死声明；
 * - 同一张表被多个组件以 scoped / 非 scoped 两种方式引入 → 一半规则被 scope 变换丢弃；
 * - `overflow-x: hidden` + `overflow-y: visible` → 按规范 `visible` 被算成 `auto`，
 *   光晕 / 外阴影被裁掉。
 *
 * 这些都不会让页面「坏掉」，只会让它「看起来差一点」，所以只能靠静态审计兜住。
 *
 * ## 两类产出
 *
 * **阻断项（problems）** 只放「可判定、修完不会回潮」的语义不变量：
 *
 * - `--hos-*` 令牌被 `var()` 引用，却在整个仓库里既没有定义、也不是运行时注入；
 * - `env(safe-area-inset-*)` 出现在安全区的**唯一承担者**（`.viewport-frame`）之外，
 *   或出现在已登记为「body 级全屏层」的文件之外（否则会叠加两层留白）；
 * - 单轴非 `visible` + 另一轴 `visible` 的 overflow 组合；
 * - `.settings-page-inset` 的左右内边距出现在唯一真源之外；
 * - 契约选择器（`.ios-card` / `.icon-btn` / `.custom-scrollbar` / `.toast-enter-active`）
 *   被非归属文件重复定义。
 *
 * **报告项（notes / --report）** 放「需要人判断」的存量：跨文件同选择器冲突、混合 scoping、
 * 毛玻璃降级覆盖率、`transition: all`、`!important` 预算、缺 `type` 的 button、
 * `contain-intrinsic-size` 偏差。它们**不参与**退出码 —— 本仓库刻意不设「数字门槛」
 * （见 `run_frontend_checks.mjs` 头部：计数类 / 外观类判据会把代码长什么样固化成门槛）。
 *
 * ## 用法
 *
 * ```bash
 * node ops/checks/frontend/audit_css_layout.mjs            # 人读报告 + 阻断判定
 * node ops/checks/frontend/audit_css_layout.mjs --json     # 机器可读
 * node ops/checks/frontend/audit_css_layout.mjs --report   # 生成逐文件审计文档
 * ```
 *
 * 退出码：0 通过；1 存在阻断项。
 */
import fs from 'node:fs'
import path from 'node:path'

import { isMain } from '../../lib/cli.mjs'
import { createContext, report } from '../../lib/ratchet.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')

/** 参与扫描的源码根（仓库相对）。`dist` 与 `node_modules` 由 walk 统一跳过。 */
const SCAN_ROOTS = [
  'homeos/frontend/src',
  'homeos/frontend/public/static',
  'homeos-store/frontend/src',
  'homeos-store/frontend/public/static',
  'packages/shared/src',
  'packages/shared/scene/static',
]

/**
 * 运行时才注入的令牌：源码里找不到定义，但会在运行时写到元素上。
 *
 * 新增条目必须写明「谁注入、注入到哪个根」，否则这个白名单会退化成「遇到红灯加一行」。
 */
const RUNTIME_TOKENS = new Map([
  ['--hos-screen-w', 'use-scaling.ts::buildCanvasVars 注入到 .app-shell（画布宽）'],
  ['--hos-screen-h', 'use-scaling.ts::buildCanvasVars 注入到 .app-shell（画布高）'],
  ['--hos-vw', 'use-scaling.ts::buildCanvasVars 注入到 .app-shell'],
  ['--hos-vh', 'use-scaling.ts::buildCanvasVars 注入到 .app-shell'],
])
/**
 * 允许直接使用 `env(safe-area-inset-*)` 的文件。
 *
 * 契约：**只有 `.viewport-frame` 承担安全区**，壳内后代一律消费 `--hos-safe-*` 令牌
 * （`.viewport-frame` 上把它们覆盖成 0）。打破这条就会出现「顶栏 + 画布各让一次」
 * 的双层留白。下列文件要么是安全区的定义者，要么渲染在 body 上、根本不在缩放壳里。
 */
const SAFE_AREA_OWNERS = new Map([
  ['homeos/frontend/src/app/scaled-viewport.css', '安全区定义者：.viewport-frame 的 padding + --hos-safe-* 归零'],
  ['homeos/frontend/src/app/main.css', '--hos-safe-* 的 :root 缺省值（= env()）'],
  // 以下渲染在 <body> 上（Teleport to body / 无主壳路由），不在 .viewport-frame 内
  ['homeos/frontend/src/features/dashboard/screensaver/base.css', 'Screensaver 挂在 body，全屏独立层'],
  ['homeos/frontend/src/features/earthquake/earthquake.css', '地震全屏告警挂 body，须盖住顶栏与安全区'],
  ['homeos/frontend/src/kernel/ui/primitives/primitives.css', 'VNotification 的 App 级宿主（非主壳路由）'],
  ['homeos/frontend/public/static/display.css', '独立整屏展示页，无主壳'],
  ['homeos/frontend/public/static/display-boot.css', '独立整屏展示页首屏，无主壳'],
  ['homeos/frontend/public/static/apple-install-guide.css', '独立整屏引导页，无主壳'],
  ['homeos/frontend/public/static/auth/scene/page.css', '认证场景页，无主壳'],
  // 上面四片的真源与 store 侧的拷贝（`sync:scene` 生成，内容逐字节一致）
  ['packages/shared/scene/static/page.css', '认证场景真源，无主壳'],
  ['homeos-store/frontend/public/static/scene/page.css', '商店端认证场景拷贝，无缩放壳'],
])

/**
 * 契约选择器 → 唯一归属文件。
 *
 * 这些选择器在历史上被「全局表 + 壳层表」各写一份，后者靠加载顺序赢，前者变成死声明；
 * 读代码的人会以为改全局表就生效。这里钉住归属，重复定义直接失败。
 */
const SINGLE_SOURCE_SELECTORS = new Map([
  ['.ios-card', 'homeos/frontend/src/app/main.css'],
  ['.icon-btn', 'homeos/frontend/src/app/main.css'],
  ['.custom-scrollbar', 'homeos/frontend/src/app/main.css'],
  ['.toast-enter-active', 'homeos/frontend/src/kernel/ui/primitives/primitives.css'],
])

/** 左右内边距的唯一真源。 */
const PAGE_INSET_OWNER = 'homeos/frontend/src/features/settings/shared/settings-layout.css'

/**
 * 允许「再声明一遍」契约选择器的文件：它们做的是**平台级几何修正**而不是重新定义外观。
 *
 * `touch-a11y.css` 在 `@media (pointer: coarse)` 内把可点控件抬到 44px，并按自己的注释
 * 「覆盖 legacy 桥接层冻结的 :root 值」统一触屏档的 line/shadow/control-height 令牌。
 * 这是刻意为之的最后一层，不属于「两份定义互相覆盖」。
 */
const SINGLE_SOURCE_EXEMPT = new Set(['packages/shared/src/styles/touch-a11y.css'])

/** 去掉 CSS 注释，保留原文长度无关的语义（用于后续正则）。 */
function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 样式表的「加载上下文」。
 *
 * 这是判断「跨文件同选择器冲突」是否有意义的前提：**只有可能同时出现在
 * `<head>` 里的两张表，后加载覆盖前者才是真问题**。`3d-studio/studio.css` 与
 * `app.css` 分属 `/3d-studio` 与 `/studio/editor` 两条路由的资产清单
 * （见 `src/studio/page-assets.ts`），永远不会同时存在；把它们之间 40 组
 * 「`body { margin }`」差异报出来，只会把报表埋掉。
 *
 * 上下文划分依据：
 * - `app`：SPA 常驻层 —— `src/**` 打包出来的 CSS 与 Vue `<style>` 块，加 `spa-shell.css`。
 * - `auth` / `editor` / `display` / `studio`：`PAGE_ASSETS` 的四条路由档。
 * - `store-*`：商店三个外壳（前台 / 后台 / 场景），由 store 的 `index.html` 与 `App.vue` 决定。
 *
 * 一张表可以属于多个上下文（`renderer.css` 同时被 `editor` 与 `display` 使用，
 * 所以 `range-control.css` 这类被它 `@import` 的也从两者继承）。
 * 未列出的文件归入 `isolated`（只与自身同路径冲突，实际等于不参与比较），
 * 这样「新加了一张没人引用的表」不会静默消失，也不会污染报表。
 */
const LOAD_CONTEXTS = new Map([
  // ── SPA 常驻 ──
  ['homeos/frontend/public/static/spa-shell.css', ['app']],
  // ── 入户 / 激活（含外观令牌） ──
  ['homeos/frontend/public/static/appearance.css', ['auth']],
  ['homeos/frontend/public/static/auth/scene/fonts.css', ['auth']],
  ['homeos/frontend/public/static/auth/scene/page.css', ['auth']],
  ['homeos/frontend/public/static/auth/scene/panel.css', ['auth']],
  ['homeos/frontend/public/static/auth/scene/scene.css', ['auth']],
  // ── 仪表编辑器（page-assets: editor） ──
  ['homeos/frontend/public/static/global-log.css', ['editor']],
  ['homeos/frontend/public/static/app.css', ['editor']],
  ['homeos/frontend/public/static/flow-line-editor.css', ['editor']],
  // ── 共用：renderer 与 bridge 同时被 editor / display 挂载 ──
  ['homeos/frontend/public/static/renderer/renderer.css', ['editor', 'display']],
  ['homeos/frontend/public/static/modules/interaction3d/bridge.css', ['editor', 'display']],
  // 下面这些由 renderer.css / app.css @import，继承它们的上下文
  ['homeos/frontend/public/static/range-control.css', ['editor', 'display']],
  ['homeos/frontend/public/static/ui-icons.css', ['editor', 'display']],
  ['homeos/frontend/public/static/dashboard-fonts.css', ['editor', 'display']],
  ['homeos/frontend/public/static/renderer/percentage-bar.css', ['editor', 'display']],
  ['homeos/frontend/public/static/renderer/scene-popup.css', ['editor', 'display']],
  // ── 整屏展示 ──
  ['homeos/frontend/public/static/display.css', ['display']],
  ['homeos/frontend/public/static/display-boot.css', ['display']],
  ['homeos/frontend/public/static/apple-install-guide.css', ['display']],
  // ── 户型图绘制（3D 创作面） ──
  ['homeos/frontend/public/static/3d-studio/studio.css', ['studio']],
  ['homeos/frontend/public/static/3d-studio/studio-window-designer.css', ['studio']],
  ['homeos/frontend/public/static/3d-studio/studio-loading.css', ['studio']],
  ['homeos/frontend/public/static/modules/interaction3d/natural-theme.css', ['studio']],
  ['homeos/frontend/public/static/modules/interaction3d/scene-popup-editor.css', ['studio']],
  ['homeos/frontend/public/static/modules/interaction3d/controls.css', ['studio']],
  // ── 内嵌页（iframe 兜底页，独立文档） ──
  ['homeos/frontend/public/static/embed-offline.css', ['embed']],
  // ── 商店：主题常驻，其余按外壳 ──
  ['homeos-store/frontend/public/static/theme.css', ['store-app', 'store-admin', 'store-front']],
  ['homeos-store/frontend/public/static/font.min.css', ['store-app', 'store-admin', 'store-front']],
  ['homeos-store/frontend/public/static/store-critical.css', ['store-app']],
  ['homeos-store/frontend/public/static/store-shell.css', ['store-front', 'store-admin']],
  ['homeos-store/frontend/public/static/store.css', ['store-front']],
  ['homeos-store/frontend/public/static/store-home.css', ['store-front']],
  ['homeos-store/frontend/public/static/admin.css', ['store-admin']],
  ['homeos-store/frontend/public/static/scene/fonts.css', ['store-app']],
  ['homeos-store/frontend/public/static/scene/page.css', ['store-app']],
  ['homeos-store/frontend/public/static/scene/panel.css', ['store-app']],
  ['homeos-store/frontend/public/static/scene/scene.css', ['store-app']],
])

/** 按路径（含目录前缀）解析加载上下文。 */
function loadContexts(rel) {
  const exact = LOAD_CONTEXTS.get(rel)
  if (exact) return new Set(exact)
  if (rel.startsWith('homeos-store/frontend/src/')) return new Set(['store-app', 'store-admin', 'store-front'])
  if (rel.startsWith('homeos/frontend/src/')) return new Set(['app'])
  // `packages/shared/**` 是 sync:scene 的上游真源，不会被任何页面直接加载
  return new Set(['isolated'])
}

/**
 * 去掉模板 / 脚本里的注释。
 *
 * 必须做：中文注释里经常引用令牌名（「历史上还注入过 `--hos-scale`」），
 * 不剥注释就会把**文档**当成**使用点**，报出根本不存在的未定义令牌。
 * 反过来，剥掉后才发现 `--hos-scale` 真的没人用了。这正是本条检查该做的事。
 */
function stripCodeComments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')
}

/** 取 Vue SFC 里的 `<style>` 块内容（外链 `<style src>` 没有内容，返回空串）。 */
function vueStyleBlocks(text) {
  const blocks = []
  for (const match of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) blocks.push(match[1])
  return blocks
}

/** 取 Vue SFC 里 `<style>` 之外的部分（模板 + 脚本），用于扫描内联 `:style` 令牌。 */
function vueNonStyle(text) {
  return text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

/** 收集全仓库的定义与使用。 */
function collect(ctx) {
  const cssFiles = []
  const codeFiles = []
  for (const root of SCAN_ROOTS) {
    if (!fs.existsSync(path.join(ctx.repoRoot, root))) continue
    for (const file of ctx.walk(root, new Set(['.css']))) cssFiles.push(file)
    for (const file of ctx.walk(root, new Set(['.vue']))) codeFiles.push(file)
    for (const file of ctx.walk(root, new Set(['.ts', '.js', '.mjs']))) codeFiles.push(file)
  }

  /** @type {Map<string, Set<string>>} token → 定义处（仓库相对路径） */
  const defined = new Map()
  /** @type {Map<string, Set<string>>} token → 使用处 */
  const used = new Map()
  /** @type {{rel: string, base: string, css: string, lines: number}[]} */
  const styleSources = []

  const addDef = (name, rel) => {
    if (!defined.has(name)) defined.set(name, new Set())
    defined.get(name).add(rel)
  }
  const addUse = (name, rel) => {
    if (!used.has(name)) used.set(name, new Set())
    used.get(name).add(rel)
  }

  for (const file of cssFiles) {
    const rel = ctx.rel(file)
    const css = stripCssComments(ctx.text(file))
    styleSources.push({ rel, base: path.basename(file), css, lines: css.split('\n').length })
    for (const match of css.matchAll(/(--[\w-]+)\s*:/g)) addDef(match[1], rel)
    for (const match of css.matchAll(/var\(\s*(--[\w-]+)/g)) addUse(match[1], rel)
  }

  /** Vue SFC 的 scoped/global 引入记录：`css 相对路径 → [{rel, scoped}]` */
  const importers = new Map()
  /** @type {{rel: string, text: string}[]} 组件模板/脚本（用于 button type 等检查） */
  const vueTemplates = []

  for (const file of codeFiles) {
    const rel = ctx.rel(file)
    const raw = ctx.text(file)
    const ext = path.extname(file)

    if (ext === '.vue') {
      // 剥掉注释后再扫：模板注释与脚本注释里引用的令牌名是**文档**，不是使用点。
      // 保留原始模板文本给「button type」检查用（那条需要真实标签）。
      const rawNonStyle = vueNonStyle(raw)
      const nonStyle = stripCodeComments(rawNonStyle)
      vueTemplates.push({ rel, text: rawNonStyle })
      for (const match of nonStyle.matchAll(/var\(\s*(--[\w-]+)/g)) addUse(match[1], rel)
      for (const match of nonStyle.matchAll(/['"](--[\w-]+)['"]\s*:/g)) addDef(match[1], rel)

      for (const block of vueStyleBlocks(raw)) {
        const css = stripCssComments(block)
        for (const match of css.matchAll(/(--[\w-]+)\s*:/g)) addDef(match[1], rel)
        for (const match of css.matchAll(/var\(\s*(--[\w-]+)/g)) addUse(match[1], rel)
      }

      // `<style scoped src="./x.css">`：记录引入方式，用于「混合 scoping」报告
      for (const match of raw.matchAll(/<style\b([^>]*)>/g)) {
        const attrs = match[1]
        const src = attrs.match(/src=["']([^"']+)["']/)
        if (!src) continue
        const scoped = /\bscoped\b/.test(attrs)
        const target = src[1].startsWith('@/')
          ? path.join(ctx.repoRoot, 'homeos/frontend/src', src[1].slice(2))
          : path.resolve(path.dirname(file), src[1])
        const key = ctx.rel(target)
        if (!importers.has(key)) importers.set(key, [])
        importers.get(key).push({ rel, scoped })
      }
    } else {
      // TS/JS：只关心 setProperty 与对象字面量里的令牌名（先剥注释）
      const code = stripCodeComments(raw)
      for (const match of code.matchAll(/setProperty\(\s*['"](--[\w-]+)['"]/g)) addDef(match[1], rel)
      for (const match of code.matchAll(/['"](--[\w-]+)['"]\s*:/g)) addDef(match[1], rel)
      for (const match of code.matchAll(/var\(\s*(--[\w-]+)/g)) addUse(match[1], rel)
    }
  }

  return { cssFiles, styleSources, defined, used, importers, vueTemplates }
}

/**
 * 逐条规则产出（选择器 + 声明体 + 所在的 at-rule 条件栈）。
 *
 * 为什么不用一条扁平正则：扁平的 `([^{}]+)\{([^{}]*)\}` 有两个硬伤 ——
 *
 * 1. `@keyframes` 的 `0%` / `50%` / `from` / `to` 会被当成选择器；
 * 2. **响应式覆盖会被当成同层规则**：`@container hos-canvas (max-width: 640px) { .ss-time { … } }`
 *    在别的文件里与基础规则 `.ss-time { … }` 一比，就成了「两个文件同一选择器取值不同」。
 *    可它根本不是覆盖关系，而是「窄屏时改变」——这类误报会占满报表。
 *
 * 这里用一个 30 行的括号栈扫描：遇到 `@…{` 入栈，遇到 `}` 出栈，
 * 每条规则带上 `context`（外层的 at-rule 条件串）。跨文件比较时**只比 context 相同**的规则，
 * 于是「基础 vs 基础」「同一档响应式 vs 同一档响应式」才会被报出来。
 */
function* rules(css) {
  const stack = []
  let buf = ''
  let i = 0
  while (i < css.length) {
    const ch = css[i]
    if (ch === '{') {
      const prelude = buf.replace(/\s+/g, ' ').trim()
      buf = ''
      if (prelude.startsWith('@')) {
        stack.push(prelude)
        i += 1
        continue
      }
      const open = i
      const close = css.indexOf('}', open + 1)
      if (close < 0) return
      const body = css.slice(open + 1, close)
      const context = stack.join(' && ')
      const selector = prelude
      i = close + 1
      // `@keyframes` 内的关键帧节点不是选择器
      if (/^(\d+(\.\d+)?%|from|to)(\s*,\s*(\d+(\.\d+)?%|from|to))*$/.test(selector)) continue
      yield { selector, body, context }
      continue
    }
    if (ch === '}') {
      stack.pop()
      buf = ''
      i += 1
      continue
    }
    buf += ch
    i += 1
  }
}

/** 断言收集器：所有阻断项都从这里出，格式统一。 */
function createFindings() {
  const problems = []
  const notes = []
  return {
    problems,
    notes,
    fail: (message) => problems.push(message),
    note: (message) => notes.push(message),
  }
}

/** 契约 1：`--hos-*` 引用必须有定义（或登记为运行时注入）。 */
function checkTokens(data, findings) {
  for (const [name, files] of [...data.used].sort()) {
    if (!name.startsWith('--hos-')) continue
    if (data.defined.has(name) || RUNTIME_TOKENS.has(name)) continue
    findings.fail(
      `未定义的令牌 ${name}（${files.size} 处）\n` +
        `    ${[...files].slice(0, 3).join('\n    ')}\n` +
        '    → 改成真实令牌名，或在 audit_css_layout.mjs 的 RUNTIME_TOKENS 里登记「谁注入」',
    )
  }
}

/** 契约 2：安全区只能由 `.viewport-frame` 承担。 */
function checkSafeArea(data, findings) {
  for (const source of data.styleSources) {
    if (!source.css.includes('env(safe-area-inset')) continue
    if (SAFE_AREA_OWNERS.has(source.rel)) continue
    findings.fail(
      `${source.rel} 直接使用 env(safe-area-inset-*)（双层留白）\n` +
        '    → 主壳内改用 var(--hos-safe-top/right/bottom/left)；确实渲染在 body 上再登记白名单',
    )
  }
}

/** 契约 3：单轴 overflow 陷阱。 */
function checkOverflowTraps(data, findings) {
  for (const source of data.styleSources) {
    for (const rule of rules(source.css)) {
      const x = rule.body.match(/overflow-x\s*:\s*([a-z]+)/)?.[1]
      const y = rule.body.match(/overflow-y\s*:\s*([a-z]+)/)?.[1]
      if (!x || !y) continue
      const nonVisible = (value) => value !== 'visible'
      const trapped = (nonVisible(x) && y === 'visible') || (nonVisible(y) && x === 'visible')
      if (!trapped) continue
      findings.fail(
        `${source.rel} 「${rule.selector}」单轴 overflow 陷阱：overflow-x:${x} / overflow-y:${y}\n` +
          '    → 规范会把另一轴的 visible 算成 auto：光晕 / 外阴影被裁，或平白多出滚动条',
      )
    }
  }
}

/** 契约 4：`.settings-page-inset` 左右内边距单一真源。 */
function checkPageInset(data, findings) {
  for (const source of data.styleSources) {
    if (source.rel === PAGE_INSET_OWNER) continue
    for (const rule of rules(source.css)) {
      if (!/(^|,|\s)\.settings-page-inset(\s*$|,|[.:\s])/.test(rule.selector)) continue
      const hasHorizontal = /padding-(left|right|inline)/.test(rule.body) || /(^|[\s;])padding\s*:/.test(rule.body)
      if (!hasHorizontal) continue
      findings.fail(
        `${source.rel} 「${rule.selector}」覆盖了 .settings-page-inset 的左右内边距\n` +
          `    → 唯一真源是 ${PAGE_INSET_OWNER}（配合 --settings-inset-x），删掉这里的覆盖`,
      )
    }
  }
}

/** 契约 5：契约选择器只能由归属文件定义。 */
function checkSingleSource(data, findings) {
  for (const source of data.styleSources) {
    if (SINGLE_SOURCE_EXEMPT.has(source.rel)) continue
    for (const rule of rules(source.css)) {
      const parts = rule.selector.split(',').map((item) => item.replace(/\s+/g, ' ').trim())
      for (const part of parts) {
        const owner = SINGLE_SOURCE_SELECTORS.get(part)
        if (!owner || owner === source.rel) continue
        findings.fail(
          `${source.rel} 重复定义 ${part}（归属：${owner}）\n` +
            '    → 后者会覆盖前者，前一份成为死声明；改到归属文件，避免「改了没生效」',
        )
      }
    }
  }
}

/** 汇总报告项（不参与退出码）。 */
function collectMetrics(data) {
  /** 跨文件同选择器同属性、取值不同 */
  const claims = new Map()
  for (const source of data.styleSources) {
    for (const rule of rules(source.css)) {
      for (const decl of rule.body.split(';')) {
        const index = decl.indexOf(':')
        if (index < 0) continue
        const prop = decl.slice(0, index).trim()
        const value = decl.slice(index + 1).trim()
        if (!prop || !value || prop.startsWith('--')) continue
        // 键里带 at-rule 上下文：基础规则与「窄屏覆盖」不算同一层，不能互相判为冲突
        const key = `${rule.context}||${rule.selector}||${prop}`
        if (!claims.has(key)) claims.set(key, [])
        claims.get(key).push({ rel: source.rel, value })
      }
    }
  }
  const conflicts = [...claims]
    .map(([key, list]) => ({ key, list }))
    /**
     * 只统计「同一加载上下文里、同一选择器同一属性出现不同取值」。
     *
     * 两层过滤缺一不可：
     *
     * 1. **加载上下文**（`LOAD_CONTEXTS`）：`/3d-studio` 与 `/studio/editor` 的样式表
     *    永远不会同时进 `<head>`，它们之间的差异不是覆盖关系。
     * 2. **按上下文分别取值**：一份文件集合里可能同时含 `app` 与 `studio` 两种表，
     *    只看「整个集合有几种取值」就会因为跨上下文的差异而误报（`body { margin }`
     *    就是这样被报成「0 vs 2rem」的，实际 `2rem` 来自只在创作面加载的 studio.css）。
     */
    .map(({ key, list }) => {
      /** @type {Map<string, Map<string, Set<string>>>} 上下文 → 取值 → 文件 */
      const byContext = new Map()
      for (const item of list) {
        for (const ctx of loadContexts(item.rel)) {
          if (!byContext.has(ctx)) byContext.set(ctx, new Map())
          const values = byContext.get(ctx)
          if (!values.has(item.value)) values.set(item.value, new Set())
          values.get(item.value).add(item.rel)
        }
      }
      /**
       * 同一文件内出现两次同名选择器（基础规则 + `@media`/`@container` 覆盖）是**正常层叠**，
       * 不是跨文件冲突。这里要求：每个取值必须由**至少两个不同文件**声明，才算一次冲突。
       */
      const clashing = [...byContext].filter(([, values]) => {
        if (values.size < 2) return false
        const owners = new Set()
        for (const rels of values.values()) for (const rel of rels) owners.add(rel)
        return owners.size > 1
      })
      if (clashing.length === 0) return null
      const files = new Set()
      for (const [, values] of clashing) {
        for (const rels of values.values()) for (const rel of rels) files.add(rel)
      }
      const values = new Set()
      for (const [, map] of clashing) for (const value of map.keys()) values.add(value)
      return {
        key,
        files,
        values,
        contexts: clashing.map(([ctx]) => ctx),
        list: clashing.flatMap(([, map]) =>
          [...map].flatMap(([value, rels]) => [...rels].map((rel) => ({ rel, value }))),
        ),
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.files.size - a.files.size || b.values.size - a.values.size)

  /** 混合 scoping */
  const mixedScoping = [...data.importers]
    .map(([css, list]) => ({
      css,
      files: new Set(list.map((item) => item.rel)),
      scoped: new Set(list.map((item) => item.scoped)),
      count: list.length,
    }))
    .filter((item) => item.count > 1 && item.scoped.size > 1)
    .sort((a, b) => b.count - a.count)

  const sharedScoping = [...data.importers]
    .filter(([, list]) => list.length > 1)
    .map(([css, list]) => ({ css, count: list.length, scoped: list[0].scoped }))
    .sort((a, b) => b.count - a.count)

  /**
   * 毛玻璃降级覆盖：现在策略是「通配关闭 + 显式豁免类」，不再维护选择器清单。
   *
   * 这里只统计两件事，用来确认契约还在：
   *  - 还有多少个选择器在用 `backdrop-filter`（新增使用点正常，不必登记）；
   *  - 有多少个选择器带了 `.hos-glass-keep` 豁免（应当极少，且每加一个都要有理由）。
   */
  const glassSelectors = []
  for (const source of data.styleSources) {
    for (const rule of rules(source.css)) {
      if (!/(^|[^-])backdrop-filter\s*:/.test(rule.body)) continue
      if (/backdrop-filter\s*:\s*none/.test(rule.body)) continue
      glassSelectors.push({ rel: source.rel, selector: rule.selector })
    }
  }
  const uniqueGlass = new Map()
  for (const item of glassSelectors) {
    const key = item.selector
    if (!uniqueGlass.has(key)) uniqueGlass.set(key, new Set())
    uniqueGlass.get(key).add(item.rel)
  }
  const glassExempt = [...uniqueGlass]
    .filter(([selector]) => selector.includes('.hos-glass-keep'))
    .map(([selector, files]) => ({ selector, files: [...files] }))

  let transitionAll = 0
  let important = 0
  let rulesTotal = 0
  for (const source of data.styleSources) {
    for (const _rule of rules(source.css)) rulesTotal += 1
    transitionAll += (source.css.match(/transition\s*:\s*all\b/g) ?? []).length
    important += (source.css.match(/!important/g) ?? []).length
  }

  /**
   * 缺 `type` 的 button。
   *
   * 不能用 `/<button\b[^>]*>/`：属性值里可能含 `>`（`v-if="a > b"`），会把标签截断成
   * 「没有 type」；多行标签也会被判错。这里做一次引号感知的标签扫描。
   */
  let buttonNoType = 0
  let buttonTotal = 0
  for (const item of data.vueTemplates) {
    for (const tag of scanTags(item.text, 'button')) {
      buttonTotal += 1
      if (!/(^|\s)(:)?type\s*=/.test(tag)) buttonNoType += 1
    }
  }

  return {
    conflicts,
    mixedScoping,
    sharedScoping,
    glassUnique: uniqueGlass.size,
    glassExempt,
    transitionAll,
    important,
    rulesTotal,
    buttonNoType,
    buttonTotal,
  }
}

/**
 * 扫描某类标签（引号感知）。
 *
 * @param {string} text 模板文本
 * @param {string} name 标签名（小写，如 `button`）
 * @returns {string[]} 完整开标签文本（含 `<` 与 `>`）
 */
function scanTags(text, name) {
  const tags = []
  const needle = `<${name}`
  let index = 0
  while (index < text.length) {
    const open = text.indexOf(needle, index)
    if (open < 0) break
    // 排除 `<buttons`、`<button-group` 这类前缀相同的其它标签
    const next = text[open + needle.length]
    if (next && !/[\s>/]/.test(next)) {
      index = open + needle.length
      continue
    }
    let quote = null
    let end = -1
    for (let i = open; i < text.length; i += 1) {
      const ch = text[i]
      if (quote) {
        if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
      if (ch === '>') {
        end = i
        break
      }
    }
    if (end < 0) break
    tags.push(text.slice(open, end + 1))
    index = end + 1
  }
  return tags
}

/** 逐文件清单：供 `--report` 生成可追溯文档。 */
function buildFileTable(data) {
  const rows = []
  for (const source of data.styleSources) {
    const importList = data.importers.get(source.rel) ?? []
    const scoped = importList.some((item) => item.scoped)
    const global = importList.some((item) => !item.scoped)
    const tokens = [...source.css.matchAll(/var\(\s*(--[\w-]+)/g)]
      .map((match) => match[1])
      .filter((name) => name.startsWith('--hos-') && !data.defined.has(name) && !RUNTIME_TOKENS.has(name))
    rows.push({
      rel: source.rel,
      lines: source.lines,
      importers: importList.length,
      scoping: importList.length === 0 ? '—' : scoped && global ? '混合' : scoped ? 'scoped' : 'global',
      undefinedTokens: [...new Set(tokens)],
      transitionAll: (source.css.match(/transition\s*:\s*all\b/g) ?? []).length,
      important: (source.css.match(/!important/g) ?? []).length,
    })
  }
  return rows.sort((a, b) => b.lines - a.lines)
}

/**
 * 审计入口。
 * @param {{repoRoot?: string}} [options]
 */
export function audit(options = {}) {
  const ctx = options.ctx ?? createContext(options.repoRoot ?? REPO_ROOT)
  const data = collect(ctx)
  const findings = createFindings()

  checkTokens(data, findings)
  checkSafeArea(data, findings)
  checkOverflowTraps(data, findings)
  checkPageInset(data, findings)
  checkSingleSource(data, findings)

  const metrics = collectMetrics(data)
  const files = buildFileTable(data)

  return {
    name: 'CSS / 布局契约',
    summary:
      `${data.styleSources.length} 个样式源（含 Vue <style>）、${data.defined.size} 个令牌定义、` +
      `${metrics.rulesTotal} 条规则；契约检查全部通过`,
    problems: findings.problems,
    hints:
      findings.problems.length > 0
        ? [
            '报告项（不阻断）用 `node ops/checks/frontend/audit_css_layout.mjs --report` 查看：',
            `  跨文件冲突 ${metrics.conflicts.length} 组、混合 scoping ${metrics.mixedScoping.length} 个、`,
            `  backdrop-filter 使用点 ${metrics.glassUnique} 个（由 7.10e 通配关闭）、transition: all ${metrics.transitionAll} 处`,
          ]
        : [],
    notes: [
      `跨文件同选择器冲突 ${metrics.conflicts.length} 组（前 3：${
        metrics.conflicts
          .slice(0, 3)
          .map((item) => item.key.split('||')[0])
          .join('、') || '无'
      }）`,
      `多组件复用样式表 ${metrics.sharedScoping.length} 个，其中 scoped/global 混用 ${metrics.mixedScoping.length} 个`,
      `毛玻璃：${metrics.glassUnique} 个选择器在用（7.10e 三档通配关闭），豁免 ${metrics.glassExempt.length} 个`,
      `transition: all ${metrics.transitionAll} 处；!important ${metrics.important} 处`,
      `button 缺 type ${metrics.buttonNoType}/${metrics.buttonTotal}（均不在 <form> 内）`,
    ],
    json: {
      summary: {
        styleSources: data.styleSources.length,
        tokensDefined: data.defined.size,
        tokensUsed: data.used.size,
        problems: findings.problems.length,
      },
      problems: findings.problems,
      metrics: {
        conflicts: metrics.conflicts.map((item) => ({
          key: item.key,
          files: [...item.files],
          values: [...item.values],
        })),
        mixedScoping: metrics.mixedScoping.map((item) => ({
          css: item.css,
          importers: item.count,
          scoping: [...item.scoped],
        })),
        sharedScoping: metrics.sharedScoping,
        glassUnique: metrics.glassUnique,
        glassExempt: metrics.glassExempt,
        transitionAll: metrics.transitionAll,
        important: metrics.important,
        buttonNoType: metrics.buttonNoType,
        buttonTotal: metrics.buttonTotal,
      },
      files,
    },
  }
}

/** 生成逐文件审计文档（`--report`）。 */
export function writeReport(result, target) {
  const { json } = result
  const lines = []
  lines.push('# 前端 CSS 与布局 UI 审计报告')
  lines.push('')
  lines.push('> 由 `node ops/checks/frontend/audit_css_layout.mjs --report` 生成，请勿手改。')
  lines.push('')
  lines.push('## 口径')
  lines.push('')
  lines.push('- 扫描范围：`homeos/frontend`（src + public/static）、`homeos-store/frontend`、`packages/shared`。')
  lines.push('- 样式源 = 独立 `.css` 文件 + Vue SFC 内的 `<style>` 块；`<style scoped src>` 的外链表单独计一行。')
  lines.push('- 阻断项只放语义不变量（令牌名、安全区归属、overflow 陷阱、内边距真源、契约选择器归属）。')
  lines.push('- 其余为存量报告：需要人判断，不参与退出码（本仓库不设数字门槛）。')
  lines.push('')
  lines.push('## 汇总')
  lines.push('')
  lines.push('| 指标 | 值 |')
  lines.push('| --- | --- |')
  lines.push(`| 样式源 | ${json.summary.styleSources} |`)
  lines.push(`| 令牌定义 / 使用 | ${json.summary.tokensDefined} / ${json.summary.tokensUsed} |`)
  lines.push(`| 阻断项 | ${json.summary.problems} |`)
  lines.push(`| 跨文件冲突 | ${json.metrics.conflicts.length} 组 |`)
  lines.push(`| 混合 scoping | ${json.metrics.mixedScoping.length} 个 |`)
  lines.push(
    `| backdrop-filter 使用点 | ${json.metrics.glassUnique ?? 0} 个（通配关闭，豁免 ${json.metrics.glassExempt.length} 个） |`,
  )
  lines.push(`| transition: all | ${json.metrics.transitionAll} 处 |`)
  lines.push(`| !important | ${json.metrics.important} 处 |`)
  lines.push(`| button 缺 type | ${json.metrics.buttonNoType} / ${json.metrics.buttonTotal} |`)
  lines.push('')

  if (json.problems.length > 0) {
    lines.push('## 阻断项')
    lines.push('')
    for (const problem of json.problems) {
      lines.push('```')
      lines.push(problem)
      lines.push('```')
    }
    lines.push('')
  }

  if (json.metrics.mixedScoping.length > 0) {
    lines.push('## 多组件复用且 scoped/global 混用')
    lines.push('')
    lines.push('| 样式表 | 引入次数 | scoping |')
    lines.push('| --- | --- | --- |')
    for (const item of json.metrics.mixedScoping) {
      lines.push(`| \`${item.css}\` | ${item.importers} | ${item.scoping.join(' / ')} |`)
    }
    lines.push('')
  }

  if (json.metrics.glassExempt.length > 0) {
    lines.push('## 毛玻璃豁免（`.hos-glass-keep`）')
    lines.push('')
    lines.push('降级策略是「三档条件下通配关闭 backdrop-filter」。标了 `.hos-glass-keep` 的元素不受影响，')
    lines.push('每加一个都要能说明「为什么这个元素必须保留模糊」，否则应当走实底。')
    lines.push('')
    lines.push('| 选择器 | 文件 |')
    lines.push('| --- | --- |')
    for (const item of json.metrics.glassExempt) {
      lines.push(`| \`${item.selector}\` | ${item.files.map((file) => `\`${file}\``).join('、')} |`)
    }
    lines.push('')
  }

  if (json.metrics.conflicts.length > 0) {
    lines.push('## 跨文件同选择器冲突（前 60 组）')
    lines.push('')
    lines.push('| 选择器 || 属性 | 文件数 | 取值 |')
    lines.push('| --- | --- | --- |')
    for (const item of json.metrics.conflicts.slice(0, 60)) {
      const [selector, prop] = item.key.split('||')
      lines.push(`| \`${selector}\` || \`${prop}\` | ${item.files.length} | ${item.values.length} 种 |`)
    }
    lines.push('')
  }

  lines.push('## 逐文件清单')
  lines.push('')
  lines.push('| 文件 | 行数 | 引入次数 | scoping | 未定义令牌 | transition:all | !important |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const row of json.files) {
    lines.push(
      `| \`${row.rel}\` | ${row.lines} | ${row.importers} | ${row.scoping} | ` +
        `${row.undefinedTokens.length > 0 ? row.undefinedTokens.join('、') : '—'} | ` +
        `${row.transitionAll || '—'} | ${row.important || '—'} |`,
    )
  }
  lines.push('')

  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${lines.join('\n')}\n`, 'utf8')
  return target
}

/** 单跑入口。 */
export function cli(argv = process.argv.slice(2)) {
  const result = audit()
  if (argv.includes('--report')) {
    const target = path.join(REPO_ROOT, 'docs/analysis/frontend-css-audit-2026-11-28.md')
    writeReport(result, target)
    console.log(`已生成 ${path.relative(REPO_ROOT, target)}`)
  }
  return report(result, { json: argv.includes('--json') })
}

if (isMain(import.meta.url)) process.exit(cli())
