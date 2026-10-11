#!/usr/bin/env node
/**
 * 切片依赖袋「惰性」门禁。
 *
 * 拦什么
 * ------
 * `ops/studio_slice_wrap.mjs` 声明级（`--mode=fn`）切片会在宿主里生成依赖袋工厂
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
 * -----------------------------
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
 * 用法：node scripts/check-deps-bag-lazy.mjs [--json]
 *   exit 0 = 全部惰性；exit 1 = 存在非访问器成员（打印 文件:行 与成员名）
 */
import fs from 'node:fs'
import path from 'node:path'

export const GATE_NAME = '依赖袋惰性门禁'

const SKIP_DIR = /(^|\/)(node_modules|dist|\.git)\//

/** 定位 `function xDeps() { … return {…} }` 的返回字面量（零参 thunk 才算） */
export function bagLiterals(lines) {
  const ranges = []
  for (let i = 0; i < lines.length; i++) {
    const fm = /^\s*function\s+([A-Za-z_$][\w$]*Deps)\s*\(\s*\)\s*(?::[^{]*)?\{/.exec(lines[i])
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
      let d2 = 0
      let endLine = -1
      let endCol = -1
      outer: for (let k = j; k <= bodyEnd; k++) {
        const startCol = k === j ? openCol : 0
        for (let c = startCol; c < lines[k].length; c++) {
          if (lines[k][c] === '{') d2++
          else if (lines[k][c] === '}') {
            d2--
            if (d2 === 0) {
              endLine = k
              endCol = c
              break outer
            }
          }
        }
      }
      if (endLine < 0) continue
      ranges.push({ bag: fm[1], openLine: j, openCol, endLine, endCol })
      break
    }
  }
  return ranges
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
 * 分析一段源码里的全部依赖袋。
 * @returns {{ bags: number, members: number, problems: Array<{line:number,bag:string,member:string}> }}
 */
export function findBagViolations(sourceText, label = '') {
  const lines = String(sourceText).split('\n')
  const problems = []
  let bags = 0
  let members = 0
  for (const r of bagLiterals(lines)) {
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
  const root = path.resolve(import.meta.dirname, '..')
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
      bags += res.bags
      members += res.members
      problems.push(...res.problems.map((p) => ({ ...p, kind: '惰性' })))
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
    if (setter.length) {
      console.error(`✗ ${GATE_NAME}：${setter.length} 个成员被写入却只有 getter（少了 set）\n`)
      for (const p of setter) console.error(`   ${p.file}:${p.line}  ${p.bag}.${p.member}`)
      console.error(
        `\n切片模块里有 \`deps.x = v\` 时，宿主必须给 \`set x(v) { x = v; }\`：\n` +
          `只给 getter 会在 ESM 严格模式当场 TypeError；给裸值则写进随即丢弃的袋对象（宿主变量永不更新）。\n`,
      )
    }
    console.error(`生成器口径见 ops/studio_slice_wrap.mjs：声明级必须与语句级同出一律访问器。`)
  } else {
    console.log(`✓ ${GATE_NAME}：${bags} 个袋、${members} 个成员全部惰性，且被写入的成员都有 setter`)
  }
  process.exit(problems.length ? 1 : 0)
}
