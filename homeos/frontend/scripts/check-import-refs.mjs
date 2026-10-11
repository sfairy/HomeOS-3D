#!/usr/bin/env node
/**
 * 引用完整性门禁（imports + 注释里的 `@/` 说明都必须能解析成真实文件）。
 *
 * ## 为什么需要它
 *
 * `check-frontend-deps.mjs` 管的是**依赖方向**（谁不许 import 谁），它对「这个路径到底存在吗」
 * 一无所知；而且它的 `walk()` 只从 `src/` 起步，`scripts/*.ts` 完全在管辖之外。
 * 2026-10-11 实测到了这个盲区的代价：
 *
 *     scripts/_entity_control_logic_smoke.ts
 *       } from '../src/composables/entity/control/cover-control-core'
 *
 * 那两个内核早在一个批次前就迁到了 `src/shared/entity/utils/control/`。于是这个脚本
 * `Cannot find module` 直接崩 —— 而 `check:deps` 全绿、typecheck 全绿、lint 全绿，
 * 因为**没有任何门禁真的去 lstat 这些路径**；CI 的 smoke job 又只跑 Python 冒烟，
 * 它压根没被执行过。它就这样红着，直到有人手动敲那条命令。
 *
 * 本门禁做且只做一件很窄的事：把每一个 import / export spec（`@/…` 与相对路径）
 * **真去文件系统解析一次**，解析不出来就报错。
 *
 * 另外把**注释与 `.md` 文档里出现的 `@/…`** 也一并解析：批量改路径时，注释/文档是最容易被正则
 * 「顺手套用前缀」的地方 —— 旧前缀被整套换成新前缀、尾段却仍是错的名字，于是生成一条
 * 看起来合理、实际不存在的路径（本仓库真实案例：`client-system.util` 被连同前缀换成
 * `…/shared/client/utils/client-system.util`，而真名是 `system.util`）。
 * 同一批次里这样清掉 9 处。这类腐烂没有编译器把关，只能靠门禁。
 * （`.md` 只走这一遍，不解析文档里的 `import` 示例 —— 示例是示意，不是真引用。）
 *
 * 还有一类没有编译器兜底的引用：**样式表**。`.css` 不进 TS 模块图，`@import './x.css'` /
 * `url('a.woff2')` 的路径全靠 `vite build` 兜底，而悬空时它通常只是**告警或静默跳过**
 * （样式悄悄丢一段），不是构建失败。所以 `.css` 也扫，但只解析引号形式的 `@import`/`url()`
 * 目标（理由见 `CSS_REF_RE`）。本会话删掉三个 `views/styles/*.css` 时，正是靠 build 恰好绿
 * 才没出事 —— 门禁当时看不见 `.css` 里的任何路径。
 *
 * 由此得出本仓库的一条**注释纪律**：注释里不要写完整的假 `@/` 路径，改用占位符
 * （`@/components/<x>`、`@/foo/**`）或省掉 `@/` 前缀（写 `…/shared/client/utils/system.util`）。
 * 这不是洁癖：注释里的路径一旦写成完整形式，就会被当成真引用校验。
 *
 * ## 边界
 *
 * - 不判依赖方向 —— 那是 `check-frontend-deps.mjs` 的职责；
 * - 不管裸模块名（`vue` / `node:fs` / `@homeos/shared`）—— 那是包解析，不归这里；
 * - 跳过含通配/占位的说明（`@/x/**`、`@/shared/<域>/utils/…`）—— 文档里合法的模式写法；
 * - 跳过 `import.meta.glob` 的 glob 串；
 * - **文档（`.md`）**：`@/` 字样**全查**（含行内反引号与代码块 —— 反引号里的内容就是正文，
 *   不是「字符串数据」，故文档不套用 opaque 过滤）；相对路径不查（md 里的 `./x` 相对的是文档，
 *   不对应模块图），文档里的 `import` 示例也不走第一遍 —— 避免与「`@/` 字样」这一遍重复报。
 *   文档没有编译器兜底，恰是路径说明最容易腐烂的地方（首批实测在 `src/README.md` 抓到 6 处）；
 * - **样式表（`.css`）**：只查引号形式的 `@import '…'` / `url('…')` 目标，`@/` 与相对路径
 *   都过同一套解析（`toAbsBase` + `resolves`，含 `.js`→`.ts` 映射与目录 index）。
 *   裸 URL（`url(//cdn…)`、`data:`）不问；`@import` 的 `@/` 目标会先塞进 `specs`，
 *   让「`@/` 字样」那遍不重复报同一条；
 * - **跳过落在字符串 / 模板串里的 spec** —— 那是「数据」，工具链不会去解析它：
 *   codegen 脚本模板串里的相对路径相对的是**输出文件**而非脚本自己；
 *   `l.includes('from "./x"')` 里 `from` 自己就写在引号内。生成物的正确性由
 *   「已提交的生成文件本身」兜住（它就在 `src/` 下，会被照常检查）。
 * - 认 TS/NodeNext 写法：源码写 `./x.js` 而磁盘上是 `./x.ts` 视为可解析。
 *
 * ## 用法
 *
 *     node scripts/check-import-refs.mjs                  # 检查本目录（frontend）
 *     node scripts/check-import-refs.mjs --root <dir>     # 检查任意根（自检脚本用）
 *     node scripts/check-import-refs.mjs --alias @store/  # 换源码别名前缀（商店用 @store/）
 *     node scripts/check-import-refs.mjs --quiet          # 只在失败时输出
 *
 * 负向自检见 `scripts/_import_refs_selftest.mjs`（真的把副本改坏，逐条确认会拦）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const flagValue = (name, fallback) => {
  const i = argv.indexOf(name)
  return i === -1 || i + 1 >= argv.length ? fallback : argv[i + 1]
}
const QUIET = argv.includes('--quiet')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(flagValue('--root', path.resolve(HERE, '..')))
const SRC = path.join(ROOT, 'src')
/**
 * 源码别名前缀（默认本应用的 `@/`）。商店（homeos-store）用 `@store/`，故参数化：
 * 门禁本身只认「别名前缀 + 相对本文件的路径」两种引用形态，别名是什么由调用方决定。
 * 末尾一律补 `/`，保证 `@store` 与 `@store/` 两种写法都按前缀匹配。
 */
const ALIAS_RAW = flagValue('--alias', '@/')
const ALIAS = ALIAS_RAW.endsWith('/') ? ALIAS_RAW : `${ALIAS_RAW}/`
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 需要扫描的代码文件类型；`.d.ts` 是声明产物，跳过。 */
const SCAN_EXT = /\.(ts|tsx|vue|js|mjs|cjs)$/
/**
 * 文档：只走「注释 `@/` 字样」这一遍，**不解析文档里的 import 示例**（示例是示意，不是真引用）。
 * 扫它是因为 `.md` 是路径说明最容易腐烂、且完全没有编译器/类型检查兜底的地方 ——
 * 首批实测就在 `src/README.md` 里抓到 6 处（列历史已删路径时顺带写了 `@/` 前缀）。
 */
const DOC_EXT = /\.md$/
/**
 * 样式表：只解析 `@import` / `url()` 的**引用目标**。
 *
 * 为什么连 CSS 也要查：`.css` 不进 TS 模块图，`vite build` 是它唯一的兜底 ——
 * 而悬空引用在 CSS 里表现为「样式静默丢失」（构建告警或直接跳过），不是构建失败。
 * 本会话删掉 `views/styles/{SetupView,life-view,widget-builder-view}.css` 时，正是靠 build
 * 恰好绿才没出事；门禁本身当时**看不见** `.css` 里的任何路径。
 */
const CSS_EXT = /\.css$/
const SKIP_DIRS = new Set(['node_modules', 'dist', '__pycache__', 'coverage', '.git'])
/** 解析候选：先按「原样 + 常见扩展名」，再试目录 index。 */
const FILE_EXT = ['', '.ts', '.tsx', '.vue', '.js', '.mjs', '.cjs', '.css', '.json', '.scss', '.svg']
const INDEX_EXT = ['/index.ts', '/index.tsx', '/index.vue', '/index.js', '/index.mjs']

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** 把 `别名…` / 相对 spec 解析成绝对基准路径；不归本门禁管的返回 null。 */
function toAbsBase(fromFile, spec) {
  const cleaned = spec.split('?')[0].split('#')[0]
  if (cleaned.startsWith(ALIAS)) return path.join(SRC, cleaned.slice(ALIAS.length))
  if (cleaned.startsWith('.')) return path.resolve(path.dirname(fromFile), cleaned)
  return null
}

/**
 * 真去文件系统解析。
 *
 * @param {string} absBase 去掉查询串后的绝对路径（不含扩展名）
 * @param {{ allowDir?: boolean }} [opts] `allowDir` 供**注释说明**使用（文档里写「某个目录」是合法的），
 *   真实 import 一律不允许 —— 指向没有 index 的目录在打包时必然炸。
 */
function resolves(absBase, { allowDir = false } = {}) {
  for (const ext of FILE_EXT) if (isFile(absBase + ext)) return true
  for (const ext of INDEX_EXT) if (isFile(absBase + ext)) return true
  // TS/NodeNext 写法：源码里写 `./x.js` 实际指向 `./x.ts`
  // （真实案例：`homeos/frontend/vite.runtime.config.ts` → `../../ops/vite/build-helpers.js`，
  //   磁盘上是 `.ts`；跨出应用目录的构建助手也走这条解析）
  const tsMapped = absBase.replace(/\.js$/, '.ts').replace(/\.mjs$/, '.mts')
  if (tsMapped !== absBase && isFile(tsMapped)) return true
  if (allowDir && isDir(absBase)) return true
  return false
}

/**
 * 找出所有**不透明区间**：模板字面量（含 `${}` 插值内部）与同行成对的引号字符串。
 *
 * 为什么必须做 —— 两类真实的误报：
 *  1. codegen 脚本把「要生成的代码」整段写在模板串里（如已删的 `extract-stage-handlers.mjs`
 *     那种一次性切片工具），
 *     其中的 `import ... from '../../bath-heater/bath-heater'` 是**产物**的路径，相对的是
 *     输出文件而非脚本自己；打包器根本不会解析它，它只是数据。
 *  2. `l.includes('from "./stage/build-metadata"')` —— `from` 自己就写在引号里。
 *     这类靠「`from` 关键字是否落在引号内」区分：真 import 的 `from` 在引号**外**
 *     （`import x from '@/shared/utils/core/logger'`），所以匹配下标落在区间内即判定为数据。
 *
 * 保守方向很重要：宁可少跳（照旧校验、报错）也不要多跳（静默放行）。
 * 所以只会跳过**确实闭合**的区间 —— 同行内没闭合的引号、扫到 EOF 都没闭合的模板串，
 * 一律不生成区间，其内容继续参与校验，出错就报出来。
 *
 * 区间只在原文上定位、不删除字符，故 `code` 的下标与原文对齐（注释抹白也保长度）。
 */
function opaqueRanges(code) {
  const ranges = []
  let i = 0
  while (i < code.length) {
    const ch = code[i]
    if (ch === "'" || ch === '"') {
      let j = i + 1
      while (j < code.length && code[j] !== ch && code[j] !== '\n') {
        if (code[j] === '\\') j++
        j++
      }
      // 只接受同行闭合的字符串；跨行的 `'` 不是字符串（多半是散文/撇号）
      if (j < code.length && code[j] === ch) {
        ranges.push([i, j + 1])
        i = j + 1
        continue
      }
      i++
      continue
    }
    if (ch === '`') {
      const start = i
      let j = i + 1
      let depth = 0
      let closed = false
      while (j < code.length) {
        const c = code[j]
        if (c === '\\') { j += 2; continue }
        if (c === '$' && code[j + 1] === '{') { depth++; j += 2; continue }
        if (c === '}' && depth > 0) { depth--; j++; continue }
        if (c === '`' && depth === 0) { closed = true; break }
        j++
      }
      if (closed) ranges.push([start, j + 1])
      i = closed ? j + 1 : j
      continue
    }
    i++
  }
  return ranges
}

const inRange = (ranges, index) => ranges.some(([s, e]) => index >= s && index < e)

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if ((SCAN_EXT.test(entry.name) || DOC_EXT.test(entry.name) || CSS_EXT.test(entry.name)) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

/**
 * 把注释内容抹成空白（保留换行），使 spec 提取不会命中注释里的散文。
 *
 * 关键前提：本门禁的 import spec 只从**抹掉注释后**的文本里取，而注释里的 `@/…` 单独走
 * 第二遍（带占位符豁免）。两遍用不同严格度，才能既拦住事故又不误报文档。
 */
function blankComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
}

const FROM_RE = /\bfrom\s*['"]([^'"]+)['"]/g
const DYN_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
const SIDE_RE = /(?:^|[\s;{(=])import\s+['"]([^'"]+)['"]/gm
/** 注释/散文里的别名 `@/` 字样；`<` `>` `*` `…` 是占位符，收集后再豁免。 */
const ALIAS_TOKEN_RE = new RegExp(`${escapeRegex(ALIAS)}[A-Za-z0-9_@./\\-<>*…]+`, 'g')
const PLACEHOLDER = /[*<>…{}]/
/**
 * 样式表里的引用目标：`@import 'x.css'` / `@import url('x.css')` / `url('a.woff2')`。
 * 只取**引号包起来**的形式 —— 未加引号的 `url(./a.png)` 在 CSS 里合法但本仓库没有，
 * 且裸写容易与函数调用混淆；宁可少查也不要误报（与本题「保守方向」一致）。
 */
const CSS_REF_RE = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?|url\(\s*['"]([^'"]+)['"]\s*\)/g

const violations = []
let fileCount = 0
let specCount = 0
let specsSeen = 0
let skippedInData = 0

function rel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/')
}

for (const file of walkTargets()) {
  fileCount++
  const text = fs.readFileSync(file, 'utf8')
  const isDoc = DOC_EXT.test(file)
  const isCss = CSS_EXT.test(file)
  // 文档没有「注释」也没有「字符串字面量」这两层概念：反引号里的内容就是**正文**，
  // 恰恰是 `@/` 路径引用最集中的地方。所以文档**不套用 opaque 过滤**（实测教训：
  // 套上之后 `src/README.md` 里 6 处悬空引用全被当成「数据」放过去了，检查形同虚设）。
  // CSS 同理：注释抹白对样式表无意义，`url(//cdn)` 里的 `//` 也不该被当成注释。
  const isPlain = isDoc || isCss
  const code = isPlain ? text : blankComments(text)
  const opaques = isPlain ? [] : opaqueRanges(code)

  // ── 第一遍：真实 import / export spec，严格解析（文档/CSS 跳过：前者示例是示意，后者不走模块图）──
  const specs = new Map() // spec → 首次出现下标（用于判断是否落在字符串/模板串里）
  if (!isPlain) {
    for (const re of [FROM_RE, DYN_RE, SIDE_RE]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(code))) {
        specsSeen++
        if (!specs.has(m[1])) specs.set(m[1], m.index)
      }
    }
  }

  for (const [spec, index] of specs) {
    const absBase = toAbsBase(file, spec)
    if (!absBase) continue // 裸模块名：不归本门禁管
    if (/[*{}]/.test(spec)) continue // import.meta.glob 的通配串
    // 落在字符串 / 模板串里的 spec 一律跳过：那是**数据**，工具链不会去解析它 ——
    // codegen 模板串里的相对路径相对的是输出文件（不是脚本），
    // `l.includes('from "./x"')` 里 `from` 自己就写在引号内。
    // 生成物的正确性由「已提交的生成文件本身」兜住：它就在 `src/` 下，会被本门禁照常检查。
    if (inRange(opaques, index)) {
      skippedInData++
      continue
    }
    specCount++
    if (!resolves(absBase)) {
      violations.push({
        file: rel(file),
        rule: '导入路径无法解析（文件不存在）',
        spec,
      })
    }
  }

  // ── 第二遍：注释/散文里的 `@/` 说明 ──
  ALIAS_TOKEN_RE.lastIndex = 0
  let t
  while ((t = ALIAS_TOKEN_RE.exec(text))) {
    let token = t[0].replace(/[.,;:)\]]+$/, '').replace(/\/+$/, '')
    if (specs.has(token)) continue // 已按严格规则查过
    if (inRange(opaques, t.index)) continue // 数据里的字样（codegen 模板串 / 字符串），不管
    if (PLACEHOLDER.test(token) || token.includes('...')) continue // 占位符写法
    if (!resolves(path.join(SRC, token.slice(ALIAS.length)), { allowDir: true })) {
      if (!resolvesTailStrip(token.slice(ALIAS.length))) {
        violations.push({
          file: rel(file),
          rule: '注释中的 @/ 引用无法解析',
          spec: token,
        })
      }
    }
  }

  // ── 样式表：`@import '…'` / `url('…')` 的资源路径 ──
  // 只查引号形式（见 CSS_REF_RE 说明）。分派规则按 CSS 语义来，**不能**照搬 JS 的「裸名即包」：
  //   * `url('…')` —— 永远是**相对本文件的资源**（CSS 没有「包」的概念），一律解析；
  //   * `@import '…'` —— 可能指向 npm 包（本仓真实案例：`@import "tailwindcss"`，Tailwind v4
  //     的包入口）。所以**只有显式相对**（`./` / `../`）才当文件，裸名 / 包子路径一律放行；
  //   * `@/…` —— 走 `SRC`（与本仓其它 vite 别名一致）；
  //   * 带 scheme（`data:` / `https:`）、协议相对（`//host`）、站点绝对（`/x`）—— 放行。
  if (isCss) {
    CSS_REF_RE.lastIndex = 0
    let c
    while ((c = CSS_REF_RE.exec(text))) {
      const target = c[1] ?? c[2]
      const isImportForm = c[1] != null
      if (!target) continue
      specsSeen++
      if (!specs.has(target)) specs.set(target, c.index) // 让 `@/` 那遍别再重复报同一条
      const clean = target.split('?')[0].split('#')[0]
      let absBase = null
      if (clean.startsWith(ALIAS)) {
        absBase = path.join(SRC, clean.slice(ALIAS.length))
      } else if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//') || target.startsWith('/')) {
        continue // 有 scheme / 协议相对 / 站点绝对：不归本门禁管
      } else if (isImportForm && !(clean.startsWith('./') || clean.startsWith('../'))) {
        continue // `@import "<包名>"`（含包子路径）：那是包解析，不是本门禁的事
      } else {
        absBase = path.resolve(path.dirname(file), clean)
      }
      specCount++
      if (!resolves(absBase)) {
        violations.push({
          file: rel(file),
          rule: '样式表引用无法解析（文件不存在）',
          spec: target,
        })
      }
    }
  }
}

/**
 * 注释里常见 `路径.useFn` 这种写法（把路径与其导出混着写），逐级剥掉尾部 `.<segment>`
 * 再试。只用于注释遍 —— 真实 import 不做这种宽容。
 */
function resolvesTailStrip(relPath) {
  let p = relPath
  for (let i = 0; i < 3; i++) {
    const dot = p.lastIndexOf('.')
    const slash = p.lastIndexOf('/')
    if (dot <= slash) return false
    if (/\.(ts|vue|js|mjs|css)$/.test(p)) return false
    p = p.slice(0, dot)
    if (resolves(path.join(SRC, p), { allowDir: true })) return true
  }
  return false
}

function walkTargets() {
  const out = []
  for (const sub of ['src', 'scripts']) walk(path.join(ROOT, sub), out)
  // 根级配置（vite.config.ts / vite.runtime.config.ts / eslint.config.js / knip.*）也要管
  if (fs.existsSync(ROOT)) {
    for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (entry.isFile() && (SCAN_EXT.test(entry.name) || DOC_EXT.test(entry.name) || CSS_EXT.test(entry.name)) && !entry.name.endsWith('.d.ts')) {
        out.push(path.join(ROOT, entry.name))
      }
    }
  }
  return out
}

// ── 防「悄悄变瞎」：解析型门禁最常见的死法是匹配不到就跳过，此后永远报绿 ──
// 注意这里数的是**提取到的所有 spec**（含裸模块名、含落在数据里的），而不是「本门禁实际校验的条数」——
// 后者在只有裸导入的树里合法地为 0，拿它当瞎了的信号就会误报（自检 S8/S10 就是这么暴露的）。
if (fileCount < 5) {
  console.error(
    `引用完整性门禁自身异常：只扫到 ${fileCount} 个文件（root=${ROOT}）—— walk 逻辑可能已失效`,
  )
  process.exit(1)
}
if (specsSeen === 0) {
  console.error(
    `引用完整性门禁自身异常：${fileCount} 个文件里一条 import spec 都没提取到 —— 提取正则可能已失效`,
  )
  process.exit(1)
}

if (violations.length) {
  console.error(`import reference violations: ${violations.length}\n`)
  for (const v of violations.slice(0, 80)) {
    console.error(`  ${v.file}\n    [${v.rule}] ${v.spec}`)
  }
  if (violations.length > 80) console.error(`  … and ${violations.length - 80} more`)
  process.exit(1)
}

if (!QUIET) {
  console.log(
    `import reference check: ok（实检 ${specCount} 条 import spec + 注释/文档 @/ 引用，扫描 ${fileCount} 个文件；` +
      `另跳过 ${skippedInData} 条落在字符串/模板串里的 spec —— 那是数据，不归本门禁）`,
  )
}
