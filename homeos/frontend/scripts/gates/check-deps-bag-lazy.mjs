#!/usr/bin/env node
/**
 * 切片依赖袋「惰性」门禁。
 *
 * 拦什么
 * 声明级（`--mode=fn`）切片会在宿主里生成依赖袋工厂
 * `function xDeps() { return ({ … }); }`。袋成员若写成**裸值**（`{ a, b }` 或 `c: expr`），
 * 就等于「在构建袋的那一刻把每个成员都求值一遍」：
 *
 *   - 宿主的名字声明在袋构造点**之后**是切片常态（切片方向上就是「定义往下游搬」）；
 *   - 袋却可能被 boot 早期路径提前构造（例如 `mount` 顶层直接调用的 `bindNavigationDrag()`）。
 *
 * 两者一撞，尚未初始化的 `const` 立刻 TDZ 抛错，而**报错名是压缩后的临时名**
 * （`Cannot access '$' before initialization`），源文件里查无此名，反查成本极高。
 * 真踩过：`stageSurfaceSyncDeps()` 里的 `renderMarkerPositions($)` 与
 * `idleIconVisibilityControl(ko)` —— 3D 交互界面直接白屏。
 *
 * 判据（纯语法，不做数据流推理）
 * 袋字面量第一层的**每个成员都必须是访问器**：`get x() { return …; }`（有外层写入的再带 `set`）。
 * 惰性访问器读穿透到宿主变量，**与声明顺序彻底无关**，因此这一类错误被从根上消除；
 * 这条口径与语句级切片既有产出（`hostCallBody` 全 getter）一致。
 *
 * 两个刻意选择：
 *   1. **按「成员块」判定而非「按行」**：`c: (a) => f(a)`、跨行属性值同样是急切求值的成员，
 *      只按单行正则扫会静默漏掉（`entities.store.ts` 的 `patchProjectionsFromChanges` 就是这样）。
 *   2. **只认零参 `*Deps()`**：生成器产物一律零参；带形参的 `*Deps(x)` 是手写的「从入参派生
 *      一个对象」的适配器，成员来自形参属性而非宿主闭包，没有声明顺序问题 —— 不该误报。
 *
 * 两种形态 = 两条判据（差在**是否提升**，这是判据的物理依据）：
 *
 *   A. `function xDeps() { return ({ … }); }` —— **提升**，本作用域任意位置都能调它，
 *      包括它自己那一行之前。所以成员**必须一律是访问器**（严格判据，见 findBagViolations）。
 *
 *   B. `const xDeps = () => ({ … });` —— **不提升**，任何调用都必然发生在它自己那一行执行之后。
 *      于是「声明早于袋定义行」的成员一定已初始化，急切求值无害；只有**词法声明在袋定义行之后**
 *      的成员会在袋被提前构造时 TDZ —— 对这一形态只判声明顺序（findLateDeclMembers），
 *      不为「天然安全」的成员白改一堆代码。
 *
 * ⚠ 形态 A 的解析一旦漏掉 B，门禁会**悄悄变瞎**：本仓真踩过 —— `panel-rendering.ts` 的 4 个
 *   箭头袋挂在挂载早期的 `ensureItemCollections()` 上，而 `editorSession` / `kindSessionsByKind`
 *   等名字的 `const` 声明在函数体后段，浏览器里报的是 `Cannot access 'F' before initialization`。
 *
 * 第三类违规（两种形态都要查，与惰性无关）：**袋成员直接转发同名全局函数**。
 * `deps.getComputedStyle(el)` 把接收者绑成**袋对象**，而 Window 上的方法只接受 Window
 * （或 `undefined`，即裸调用全局）作接收者，普通对象一律 `TypeError: Illegal invocation`
 * —— 真踩过：`syncPanelChrome → refreshStageUi → toggleModuleTabsCore` 整条链断掉。
 * 见 RECEIVER_SENSITIVE_GLOBALS（名单在 Chrome 里逐个实测得出）与 findNativeForwardMembers()。
 *
 * 用法：node scripts/check-deps-bag-lazy.mjs [--json]
 *   exit 0 = 全部惰性；exit 1 = 存在非访问器成员（打印 文件:行 与成员名）
 */
import fs from 'node:fs'
import path from 'node:path'

export const GATE_NAME = '依赖袋惰性门禁'

const SKIP_DIR = /(^|\/)(node_modules|dist|\.git)\//

/** 从 (openLine, openCol) 的花括号起做配平，返回结束位置 */
function braceMatch(lines, openLine, openCol) {
  let depth = 0
  for (let k = openLine; k < lines.length; k++) {
    for (let c = k === openLine ? openCol : 0; c < lines[k].length; c++) {
      if (lines[k][c] === '{') depth++
      else if (lines[k][c] === '}') {
        depth--
        if (depth === 0) return { endLine: k, endCol: c }
      }
    }
  }
  return null
}

const FN_BAG_RE = /^\s*function\s+([A-Za-z_$][\w$]*Deps)\s*\(\s*\)\s*(?::[^{]*)?\{/
const ARROW_BAG_RE = /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*Deps)\s*=\s*\(\s*\)\s*(?::[^=]*)?=>/

/** 定位 `function xDeps() { … return ({…}) }` 的返回字面量（零参 thunk 才算；**提升**形态） */
export function functionBagLiterals(lines) {
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    const fm = FN_BAG_RE.exec(lines[i])
    if (!fm) continue
    let dep = 0
    let started = false
    let bodyEnd = lines.length - 1
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') {
          dep++
          started = true
        } else if (ch === '}') dep--
      }
      if (started && dep === 0) {
        bodyEnd = j
        break
      }
    }
    for (let j = i; j <= bodyEnd; j++) {
      if (!/return\s*\(?\s*\{/.test(lines[j])) continue
      const openCol = lines[j].indexOf('{', lines[j].indexOf('return'))
      const end = braceMatch(lines, j, openCol)
      if (!end) continue
      ranges.push({ bag: fm[1], defLine: i, openLine: j, openCol, ...end, form: 'fn' })
      break
    }
  }
  return ranges
}

/**
 * 定位 `const xDeps = () => ({ … })` 的返回字面量（也认块体 `() => { return ({…}) }`）。
 * **不提升**形态：只能在自己那一行执行之后被调用，故判据是声明顺序（见 findLateDeclMembers）。
 */
export function arrowBagLiterals(lines) {
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    const fm = ARROW_BAG_RE.exec(lines[i])
    if (!fm) continue
    let k = i
    let rest = lines[i].slice(fm[0].length)
    while (k < lines.length && !rest.trim()) {
      k++
      rest = k < lines.length ? lines[k] : ''
    }
    if (k >= lines.length) continue
    const head = rest.trimStart()
    const lead = rest.length - head.length
    if (head.startsWith('(')) {
      // 表达式体：字面量从 `(` 之后的第一个 `{` 开始
      for (let p = k; p < lines.length; p++) {
        const col = lines[p].indexOf('{', p === k ? lead + 1 : 0)
        if (col < 0) continue
        const end = braceMatch(lines, p, col)
        if (end) ranges.push({ bag: fm[1], defLine: i, openLine: p, openCol: col, ...end, form: 'arrow' })
        break
      }
    } else if (head.startsWith('{')) {
      // 块体：块内找 `return ({…})`
      const bodyEnd = braceMatch(lines, k, lead)
      if (!bodyEnd) continue
      for (let j = k; j <= bodyEnd.endLine; j++) {
        const rm = /return\s*\(?\s*\{/.exec(lines[j])
        if (!rm) continue
        const col = lines[j].indexOf('{', rm.index + rm[0].length - 1)
        const end = braceMatch(lines, j, col)
        if (end) ranges.push({ bag: fm[1], defLine: i, openLine: j, openCol: col, ...end, form: 'arrow' })
        break
      }
    }
  }
  return ranges
}

/** 全部依赖袋（两种形态）。成员判据按 `form` 分流，别把两者混用 */
export function bagLiterals(lines) {
  return [...functionBagLiterals(lines), ...arrowBagLiterals(lines)]
}

/** 把字面量切成第一层成员块（按第一层逗号），返回 { startLine, text } */
function membersOf(lines, r) {
  const out = []
  let depth = 0
  let curStartLine = -1
  let cur = ''
  const flush = () => {
    if (cur.trim()) out.push({ startLine: curStartLine + 1, text: cur })
    cur = ''
    curStartLine = -1
  }
  for (let i = r.openLine; i <= r.endLine; i++) {
    const startCol = i === r.openLine ? r.openCol + 1 : 0
    const text = lines[i]
    let inStr = null
    let tmpl = false
    for (let c = startCol; c < text.length; c++) {
      const ch = text[c]
      const nx = text[c + 1]
      if (tmpl) {
        if (ch === '`') tmpl = false
        cur += ch
        continue
      }
      if (inStr) {
        if (ch === '\\') {
          cur += ch + nx
          c++
          continue
        }
        if (ch === inStr) inStr = null
        cur += ch
        continue
      }
      if (ch === '/' && nx === '/') break
      if (ch === '`') {
        tmpl = true
        cur += ch
        continue
      }
      if (ch === '"' || ch === "'") {
        inStr = ch
        cur += ch
        continue
      }
      if (ch === '}' && depth === 0) break // 字面量结束
      if ('{[('.includes(ch)) depth++
      else if ('}])'.includes(ch)) depth--
      else if (ch === ',' && depth === 0) {
        flush()
        continue
      }
      if (curStartLine < 0 && /\S/.test(ch)) curStartLine = i
      cur += ch
    }
    if (curStartLine >= 0) cur += '\n'
  }
  flush()
  return out
}

/** 成员的诊断名：`k: v` 取 k，裸简写取整名 */
function memberName(text) {
  const t = text.trim()
  return /^([A-Za-z_$][\w$]*)\s*:/.exec(t)?.[1] ?? /^([A-Za-z_$][\w$]*)$/.exec(t)?.[1] ?? t.slice(0, 24)
}

/**
 * 第三类违规：**袋成员直接转发同名全局函数 → 接收者被绑成袋对象 → `Illegal invocation`**。
 *
 * `deps.getComputedStyle(el)` 这类调用里 `this` 是袋对象；而下列名字是 Window 上的方法，WebIDL
 * 只接受 Window（或 `undefined` —— 裸调用全局）作接收者，普通对象一律抛
 * `TypeError: Illegal invocation`。裸调用全局没事（`stage-handlers.ts` 的 `getComputedStyle(el)`），
 * 转发进袋再以成员形式调就炸（真踩过：`syncPanelChrome → refreshStageUi → toggleModuleTabsCore`）。
 *
 * 名单是**实测**得出的：在 Chrome 里逐一试 `{m: window.m}.m(...)`，抛 `Illegal invocation` 的入列。
 * ⚠ 别凭直觉加：`fetch` / `scrollTo` / `scrollBy` 实测**不抛**（接收者校验放宽），加了会误报。
 *
 * 修法：注入时包一层把接收者钉死，例如
 *   `const getComputedStyleForDeps = (el: Element) => window.getComputedStyle(el);`
 * （与 `climate-panel` / `purifier-extras` 用 `defaultView.getComputedStyle` 同理）。
 */
export const RECEIVER_SENSITIVE_GLOBALS = new Set([
  'getComputedStyle',
  'structuredClone',
  'matchMedia',
  'getSelection',
  'postMessage',
  'reportError',
  'btoa',
  'atob',
  'focus',
  'blur',
  'print',
  'open',
  'close',
  'moveTo',
  'resizeTo',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'queueMicrotask',
])

/** 成员块是否「原样转发同名标识符」（裸值简写 / `k: k` / `get k() { return k; }`），是则返回该名 */
function forwardedIdent(text) {
  const t = text.trim()
  const shorthand = /^([A-Za-z_$][\w$]*)$/.exec(t)
  if (shorthand) return shorthand[1]
  const kv = /^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)$/.exec(t)
  if (kv && kv[1] === kv[2]) return kv[1]
  const accessor = /^get\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\{\s*return\s+([A-Za-z_$][\w$]*)\s*;?\s*\}$/.exec(t)
  if (accessor && accessor[1] === accessor[2]) return accessor[1]
  return null
}

/** @returns {Array<{line:number,bag:string,member:string}>} 两种形态的袋都查 */
export function findNativeForwardMembers(sourceText, label = '') {
  const lines = String(sourceText).split('\n')
  const problems = []
  for (const r of bagLiterals(lines)) {
    for (const m of membersOf(lines, r)) {
      const t = m.text
      if (!t.trim() || t.trim().startsWith('...') || t.trim().startsWith('/*') || t.trim().startsWith('//'))
        continue
      const name = forwardedIdent(t)
      if (name && RECEIVER_SENSITIVE_GLOBALS.has(name)) {
        problems.push({ line: m.startLine, bag: r.bag, member: name, file: label })
      }
    }
  }
  return problems
}

/**
 * 分析一段源码里**提升形态**（`function xDeps()`）的依赖袋：成员必须一律是访问器。
 * @returns {{ bags: number, members: number, problems: Array<{line:number,bag:string,member:string}> }}
 */
export function findBagViolations(sourceText, label = '') {
  const lines = String(sourceText).split('\n')
  const problems = []
  let bags = 0
  let members = 0
  for (const r of functionBagLiterals(lines)) {
    bags++
    for (const m of membersOf(lines, r)) {
      members++
      const t = m.text.trim()
      if (
        !t ||
        t.startsWith('...') ||
        t.startsWith('get ') ||
        t.startsWith('set ') ||
        t.startsWith('/*') ||
        t.startsWith('//')
      )
        continue
      problems.push({ line: m.startLine, bag: r.bag, member: memberName(t), file: label })
    }
  }
  return { bags, members, problems }
}

/** 袋所在宿主函数的形参名集合（排除「参数被当成晚声明」的误报，例如宿主的上下文对象 `e`） */
function hostParams(lines, defLine) {
  const out = new Set()
  const HEAD = /(?:function\s+[A-Za-z_$][\w$]*\s*|(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)\(/
  for (let i = defLine - 1; i >= 0; i--) {
    const hm = HEAD.exec(lines[i])
    if (!hm) continue
    let depth = 0
    let buf = ''
    for (let k = i; k < lines.length; k++) {
      const seg = k === i ? lines[i].slice(hm.index + hm[0].length - 1) : lines[k]
      let done = false
      for (const ch of seg) {
        if (ch === '(') depth++
        else if (ch === ')') {
          depth--
          if (depth === 0) {
            done = true
            break
          }
        } else if (depth > 0) buf += ch
      }
      if (done) break
    }
    for (const part of buf.split(',')) {
      const id = /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)/.exec(part)
      if (id) out.add(id[1])
    }
    break
  }
  return out
}

/**
 * 成员名对应的**词法**声明行（`const|let|var|class`），没找到返回 -1。
 * 命中的 `function` 声明按提升处理（返回 -1）：提升的名字永远已可用，不会 TDZ。
 *
 * 两处必须小心，否则袋子**自己那一行**会被当成声明（实测踩过 `normalizeDocument: (x: any) => …`）：
 *   1. `=` 后面不能跟 `>`：`k: (x) => …` 的 `=>` 满足「`k = 值`」的字面形状，但它不是声明；
 *   2. 袋字面量内部的行整段跳过（对象字面量的成员不会是 `const` 声明）。
 *
 * 续声明符行（`const a = …,` 换行后的 `  b = …`）还要看上一非空行是否以逗号收尾，否则那是普通赋值。
 * @returns {number} 行号（0 基）
 */
export function lexicalDeclLine(lines, name, skipLines = null) {
  const head = new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var|class)\\s+${name}\\b`)
  const inList = new RegExp(`[,()]\\s*${name}\\s*(?::[^=]*)?=(?!=|>)`)
  const cont = new RegExp(`^\\s+${name}\\s*(?::[^=]*)?=(?!=|>)`)
  for (let i = 0; i < lines.length; i++) {
    if (skipLines?.has(i)) continue
    const L = lines[i]
    if (new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`).test(L)) return -1
    if (head.test(L) || inList.test(L)) return i
    if (cont.test(L)) {
      let p = i - 1
      while (p >= 0 && !lines[p].trim()) p--
      if (p >= 0 && /,\s*$/.test(lines[p])) return i
    }
  }
  return -1
}

/**
 * **不提升形态**（`const xDeps = () => ({…})`）的 TDZ 判据：成员词法声明晚于袋定义行。
 *
 * 依据：箭头函数的 `const` 绑定不提升，任何调用都发生在它自己那一行执行之后 ——
 * 「声明早于袋定义行」的成员到此一定已初始化，急切求值无害；反之则可能在袋被提前构造时炸。
 * 这是**必要**条件而非充分条件：命中的成员未必真的会被提前求值，但把它改成访问器无副作用，
 * 所以宁可多报。
 *
 * @returns {{ bags: number, members: number, problems: Array<{line:number,bag:string,member:string,decl:number}> }}
 */
export function findLateDeclMembers(sourceText, label = '') {
  const lines = String(sourceText).split('\n')
  const problems = []
  // 袋字面量内部的行不是声明（对象成员形状与 `k = v` 撞车），整段跳过
  const skipLines = new Set()
  for (const b of bagLiterals(lines)) {
    for (let i = b.openLine; i <= b.endLine; i++) skipLines.add(i)
  }
  let bags = 0
  let members = 0
  for (const r of arrowBagLiterals(lines)) {
    bags++
    const params = hostParams(lines, r.defLine)
    for (const m of membersOf(lines, r)) {
      members++
      const t = m.text.trim()
      if (
        !t ||
        t.startsWith('...') ||
        t.startsWith('get ') ||
        t.startsWith('set ') ||
        t.startsWith('/*') ||
        t.startsWith('//')
      )
        continue
      const name = memberName(t)
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue
      if (params.has(name)) continue
      const decl = lexicalDeclLine(lines, name, skipLines)
      if (decl > r.defLine) {
        problems.push({ line: m.startLine, bag: r.bag, member: name, decl: decl + 1, file: label })
      }
    }
  }
  return { bags, members, problems }
}

/**
 * 第二类违规：**被写入的成员只有 getter**。
 *
 * 切片模块里有 `deps.x = v` 时，宿主侧必须给 `set x(v)`（写回灌宿主变量）。
 * 只给 getter 会在 ESM 严格模式下当场 TypeError；给裸值则写进「每次调用现建、随即丢弃」
 * 的袋对象，宿主变量永远不变（真踩过：备份弹窗把当前弹窗登记丢了、图标选择器拿不到 options）。
 *
 * ⚠ 判定必须**按袋**来做，不能用「全仓 deps.X 写入名」这种粗口径：同名成员可能属于不同的袋
 * （`deps.value` 的写入属于某个袋，而另一个袋里 `value` 是个函数），粗口径会把好成员判成违规
 * （tsc 报 TS2630 才暴露）。所以这里先把「袋 → 它的消费者模块」解出来，再在**那些模块**里找写入。
 *
 * @param writtenByBag Map<袋名, Set<被写入的成员名>>（见 collectBagWrites）
 */
export function findSetterGaps(sourceText, writtenByBag, label = '') {
  const lines = String(sourceText).split('\n')
  const problems = []
  for (const r of bagLiterals(lines)) {
    const written = writtenByBag.get(r.bag)
    if (!written?.size) continue
    const hasSet = new Set()
    const getters = []
    for (let i = r.openLine; i <= r.endLine; i++) {
      const sm = /^\s*set\s+([A-Za-z_$][\w$]*)\s*\(/.exec(lines[i])
      if (sm) hasSet.add(sm[1])
      const gm = /^\s*get\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\{/.exec(lines[i])
      if (gm) getters.push({ line: i + 1, name: gm[1] })
    }
    for (const g of getters) {
      if (hasSet.has(g.name)) continue
      if (!written.has(g.name)) continue
      problems.push({ line: g.line, bag: r.bag, member: g.name, file: label })
    }
  }
  return problems
}

/**
 * 解出「依赖袋 → 该袋消费者模块里被 `deps.X` 写入的成员名」。
 *
 * 判据：**谁把袋直接收下** —— `<callee>(<bag>(), …)`，且 `<callee>` 是宿主 import 来的。
 * ⚠ 不要假设核心一定叫 `*Core`：`entities.store.ts` 的核心叫 `applyEntityStateUpdate`，
 * 用 `*Core` 口径会让整个文件解析出 0 个袋、第二类检查静默空转（真踩过）。
 */
export function collectBagWrites(hostText, { resolveSpecifier, readModule }) {
  const text = String(hostText)
  // import 映射：本地名 -> specifier
  const importMap = new Map()
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    const spec = m[2]
    for (const part of m[1].split(',')) {
      const seg = part.trim()
      if (!seg) continue
      const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(seg)
      importMap.set(asMatch ? asMatch[2] : seg, spec)
    }
  }
  const WRITE_RE = /deps\.([A-Za-z_$][\w$]*)\s*(?:=(?!=)|\+\+|--|[-+*/]=|\|\|=|&&=|\?\?=)/g
  const cache = new Map()
  const out = new Map()
  for (const m of text.matchAll(/([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*Deps)\s*\(\s*\)/g)) {
    const [, callee, bag] = m
    const spec = importMap.get(callee)
    if (!spec) continue
    let modText = cache.get(spec)
    if (modText === undefined) {
      try {
        modText = readModule(resolveSpecifier(spec)) ?? ''
      } catch {
        modText = ''
      }
      cache.set(spec, modText)
    }
    const set = out.get(bag) ?? new Set()
    for (const w of String(modText).matchAll(WRITE_RE)) set.add(w[1])
    out.set(bag, set)
  }
  return out
}

/**
 * 防瞎：宿主里确实有 `*Deps` 袋，却一个消费者都没解析出来 → 检查在空转，必须报错而不是报 ✓。
 */
export function findUnresolvedBagHosts(sourceText, writtenByBag, label = '') {
  const lines = String(sourceText).split('\n')
  const bags = new Set(bagLiterals(lines).map((r) => r.bag))
  if (!bags.size) return []
  const resolved = new Set([...writtenByBag.keys()])
  // 有写入的袋才算「必须解析成功」；全部袋都解析不到消费者 → 定为空转
  if ([...bags].every((b) => !resolved.has(b))) {
    return [{ file: label, bag: [...bags].join(', '), member: '', line: 0 }]
  }
  return []
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (SKIP_DIR.test(full)) continue
    if (e.isDirectory()) walk(full, out)
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)

if (isCli) {
  const root = path.resolve(import.meta.dirname, '../..')
  const json = process.argv.includes('--json')
  const srcDir = path.join(root, 'src')
  const problems = []
  let bags = 0
  let members = 0

  if (fs.existsSync(srcDir)) {
    const sources = []
    for (const file of walk(srcDir)) {
      const text = fs.readFileSync(file, 'utf8')
      const rel = path.relative(root, file)
      sources.push({ text, rel, abs: file })
      const res = findBagViolations(text, rel)
      const late = findLateDeclMembers(text, rel)
      bags += res.bags + late.bags
      members += res.members + late.members
      problems.push(...res.problems.map((p) => ({ ...p, kind: '惰性' })))
      problems.push(...late.problems.map((p) => ({ ...p, kind: '晚声明' })))
      problems.push(...findNativeForwardMembers(text, rel).map((p) => ({ ...p, kind: '裸转发' })))
    }
    // 第二类：被写入却只有 getter。按袋解析其消费者模块（不能用全仓写入名，同名成员可能属于不同的袋）
    const ALIASES = [
      ['@app/', 'src/studio/app/'],
      ['@runtime/', 'src/studio/runtime/'],
      ['@/', 'src/'],
    ]
    const resolveSpecifier = (fromFile, spec) => {
      if (spec.startsWith('.')) return path.resolve(path.dirname(fromFile), spec)
      for (const [pre, dir] of ALIASES) {
        if (spec.startsWith(pre)) return path.resolve(root, dir + spec.slice(pre.length))
      }
      return null
    }
    const readModule = (base) => {
      if (!base) return null
      for (const cand of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
        try {
          if (fs.statSync(cand).isFile()) return fs.readFileSync(cand, 'utf8')
        } catch {
          /* 继续 */
        }
      }
      return null
    }
    for (const { text, rel, abs } of sources) {
      const writtenByBag = collectBagWrites(text, {
        resolveSpecifier: (spec) => resolveSpecifier(abs, spec),
        readModule,
      })
      for (const p of findUnresolvedBagHosts(text, writtenByBag, rel)) problems.push({ ...p, kind: '空转' })
      for (const p of findSetterGaps(text, writtenByBag, rel)) problems.push({ ...p, kind: '写回' })
    }
  }

  if (json) {
    console.log(JSON.stringify({ bags, members, problems }, null, 2))
  } else if (problems.length) {
    const lazy = problems.filter((p) => p.kind === '惰性')
    const late = problems.filter((p) => p.kind === '晚声明')
    const forward = problems.filter((p) => p.kind === '裸转发')
    const setter = problems.filter((p) => p.kind === '写回')
    const vacuous = problems.filter((p) => p.kind === '空转')
    if (vacuous.length) {
      console.error(`✗ ${GATE_NAME}：${vacuous.length} 个宿主解析不出任何「袋 → 消费者」关系（检查在空转）\n`)
      for (const p of vacuous) console.error(`   ${p.file}  [${p.bag}]`)
      console.error(
        `\n有 \`*Deps\` 袋却解析不到消费者 = 第二类检查静默失效。\n` +
          `判据是 \`<callee>(<bag>(), …)\` 且 callee 由宿主 import —— 核心未必叫 \`*Core\`。\n`,
      )
    }
    if (lazy.length) {
      console.error(`✗ ${GATE_NAME}：${lazy.length}/${members} 个成员是裸值（应为 \`get x() { return x; }\`）\n`)
      for (const p of lazy) console.error(`   ${p.file}:${p.line}  ${p.bag}.${p.member}`)
      console.error(
        `\n裸值成员 = 构建袋那一刻急切求值；宿主里声明在袋构造点之后的名字会当场 TDZ\n` +
          `（压缩后报错名形如 \`Cannot access '$' before initialization\`，源文件查无此名）。\n`,
      )
    }
    if (late.length) {
      console.error(
        `✗ ${GATE_NAME}：${late.length} 个箭头形态袋成员声明在袋定义**之后**（会 TDZ）\n`,
      )
      for (const p of late) console.error(`   ${p.file}:${p.line}  ${p.bag}.${p.member}（声明在第 ${p.decl} 行）`)
      console.error(
        `\n箭头形态 \`const xDeps = () => ({…})\` **不提升**：只有声明在袋定义行之后的成员才有风险，\n` +
          `但这类袋常被挂载早期路径提前构造 → 成员改写成 \`get x() { return x; }\` 即可与声明顺序解耦。\n`,
      )
    }
    if (forward.length) {
      console.error(
        `✗ ${GATE_NAME}：${forward.length} 个袋成员直接转发同名全局函数（接收者会变成袋对象）\n`,
      )
      for (const p of forward) console.error(`   ${p.file}:${p.line}  ${p.bag}.${p.member}`)
      console.error(
        `\nWindow 上的方法（getComputedStyle / setTimeout / structuredClone…）只接受 Window 作接收者，\n` +
          `\`deps.X(...)\` 会把 \`this\` 绑成袋对象 → 运行时 \`TypeError: Illegal invocation\`。\n` +
          `注入时包一层钉死接收者：\`(…args) => window.X(…args)\`（裸调用全局反而没事，所以容易漏）。\n`,
      )
    }
    if (setter.length) {
      console.error(`✗ ${GATE_NAME}：${setter.length} 个成员被写入却只有 getter（少了 set）\n`)
      for (const p of setter) console.error(`   ${p.file}:${p.line}  ${p.bag}.${p.member}`)
      console.error(
        `\n切片模块里有 \`deps.x = v\` 时，宿主必须给 \`set x(v) { x = v; }\`：\n` +
          `只给 getter 会在 ESM 严格模式当场 TypeError；给裸值则写进随即丢弃的袋对象（宿主变量永不更新）。\n`,
      )
    }
    console.error(`切片生成器要求：声明级必须与语句级同出一律访问器。`)
  } else {
    console.log(
      `✓ ${GATE_NAME}：${bags} 个袋、${members} 个成员通过` +
        `（函数形态全访问器 + 箭头形态无晚声明 + 无裸转发原生方法），且被写入的成员都有 setter`,
    )
  }
  process.exit(problems.length ? 1 : 0)
}
