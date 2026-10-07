/**
 * 迁移工具（阶段 3.2 第二梯队）：修掉「严格档把宽松代码的类型推断变窄」造成的报错。
 *
 * 严格档下有两类**根因**会让下游成片报错，而它们本身并不出现在诊断里：
 *
 * 1. `const list = []` / `const map = {}` —— 宽松档推断为 `any[]` / `any`，严格档变成
 *    `never[]` / `{}`，于是下游 `list.push(x)` 报 TS2345、`map.key` 报 TS2339、
 *    `map[key]` 报 TS7053。根因是**声明缺类型**，修法是在声明处补显式宽类型
 *    （`any[]` / `Record<string, any>`），运行时语义完全不变。
 * 2. `TABLE[key]`（`key` 为 `any`）对没有索引签名的字面量类型取下标 —— 报 TS7053。
 *    修法是在**取下标处**把对象表达式断言为 `any`：`(TABLE as any)[key]`，同样零运行时差异。
 *
 * 用法：
 *   node scripts/strictify-legacy-types.mjs --widen            # 补空字面量声明的类型
 *   node scripts/strictify-legacy-types.mjs --index-cast <诊断文件>
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const STUDIO_ROOT = path.join('src', 'studio')

function listStudioFiles(dir = STUDIO_ROOT) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listStudioFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** 自校验：改完必须还能被 TS 无语法错误解析，否则回滚。 */
function stillParses(file, text) {
  return (
    ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      .parseDiagnostics.length === 0
  )
}

/** 空字面量的「宽类型」写法（严格档下这两者本该是 any 而非 never/{}）。 */
const WIDE_ARRAY = 'any[]'
const WIDE_RECORD = 'Record<string, any>'

function isEmptyLiteral(node) {
  if (!node) return null
  if (ts.isArrayLiteralExpression(node) && node.elements.length === 0) return 'array'
  if (ts.isObjectLiteralExpression(node) && node.properties.length === 0) return 'object'
  return null
}

/**
 * 根因 1：空字面量（`[]` / `{}`）在严格档下推断为 `never[]` / `{}`，下游成片
 * 「Property does not exist on type 'never'」「not assignable to type 'never'」。
 *
 * 处理四种承载位置，全部是纯类型层面的补标注（运行时零差异）：
 * - 变量声明：`const list = []` → `const list: any[] = []`
 * - 参数默认值：`function f(list = [])` → `function f(list: any[] = [])`
 * - 对象属性：`{ attributes: [] }` → `{ attributes: [] as any[] }`
 * - 返回值属性同对象字面量。
 */
function widenEmptyLiterals(dry) {
  let files = 0
  let editsCount = 0
  for (const file of listStudioFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const edits = []

    const visit = (node) => {
      // 变量声明
      if (ts.isVariableDeclaration(node) && !node.type) {
        const kind = isEmptyLiteral(node.initializer)
        if (kind && ts.isIdentifier(node.name)) {
          edits.push({
            offset: node.name.getEnd(),
            text: kind === 'array' ? `: ${WIDE_ARRAY}` : `: ${WIDE_RECORD}`,
          })
        }
      }
      // 参数默认值
      if (ts.isParameter(node) && !node.type && node.initializer) {
        const kind = isEmptyLiteral(node.initializer)
        if (kind && ts.isIdentifier(node.name)) {
          edits.push({
            offset: node.name.getEnd(),
            text: kind === 'array' ? `: ${WIDE_ARRAY}` : `: ${WIDE_RECORD}`,
          })
        }
      }
      // 对象字面量属性（含 return { ... } 里的属性）
      if (ts.isPropertyAssignment(node)) {
        const kind = isEmptyLiteral(node.initializer)
        if (kind) {
          edits.push({
            offset: node.initializer.getEnd(),
            text: kind === 'array' ? ` as ${WIDE_ARRAY}` : ` as ${WIDE_RECORD}`,
          })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    if (!edits.length) continue

    let next = text
    let applied = 0
    for (const edit of edits.sort((a, b) => b.offset - a.offset)) {
      if (next.slice(edit.offset, edit.offset + 2) === ': ') continue
      next = next.slice(0, edit.offset) + edit.text + next.slice(edit.offset)
      applied += 1
    }
    if (!applied || next === text) continue
    if (!stillParses(file, next)) {
      console.warn(`[widen] 语法校验失败，跳过 ${file}`)
      continue
    }
    files += 1
    editsCount += applied
    if (!dry) fs.writeFileSync(file, next)
  }
  console.log(`[widen] 文件 ${files} 个，补类型标注 ${editsCount} 处${dry ? '（dry-run）' : ''}`)
}

const DIAG_RE = /^(?<file>.+?)\((?<line>\d+),(?<col>\d+)\): error TS(?<code>\d+):/

/**
 * 严格档下 `catch (e)` 的 `e` 是 `unknown`（`useUnknownInCatchVariables`），于是所有
 * `catch (e) { e.message }` 报 TS18046。补成 `catch (e: any)`：只改类型，运行时不变。
 */
function catchAny(dry) {
  let files = 0
  let count = 0
  for (const file of listStudioFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const edits = []
    const visit = (node) => {
      if (ts.isCatchClause(node)) {
        const variable = node.variableDeclaration
        if (variable && !variable.type && ts.isIdentifier(variable.name)) {
          edits.push({ offset: variable.name.getEnd(), text: ': any' })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    if (!edits.length) continue
    let next = text
    let applied = 0
    for (const edit of edits.sort((a, b) => b.offset - a.offset)) {
      if (next.slice(edit.offset, edit.offset + 2) === ': ') continue
      next = next.slice(0, edit.offset) + edit.text + next.slice(edit.offset)
      applied += 1
    }
    if (!applied || !stillParses(file, next)) continue
    files += 1
    count += applied
    if (!dry) fs.writeFileSync(file, next)
  }
  console.log(`[catch-any] 文件 ${files} 个，补标注 ${count} 处${dry ? '（dry-run）' : ''}`)
}

/** 根因 2：TS7053 取下标处把对象表达式断言为 any。 */
function indexCast(diagPath, dry) {
  const byFile = new Map()
  for (const rawLine of fs.readFileSync(diagPath, 'utf8').split('\n')) {
    const match = DIAG_RE.exec(rawLine.trim())
    if (!match || Number(match.groups.code) !== 7053) continue
    const file = match.groups.file
    if (!file.startsWith(STUDIO_ROOT) || !file.endsWith('.ts')) continue
    const entry = { line: Number(match.groups.line), col: Number(match.groups.col) }
    const list = byFile.get(file)
    if (list) list.push(entry)
    else byFile.set(file, [entry])
  }

  let files = 0
  let casts = 0
  for (const [file, diags] of byFile) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const starts = [0]
    for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1)

    const edits = []
    const seen = new Set()
    for (const diag of diags) {
      const lineStart = starts[diag.line - 1]
      if (lineStart === undefined) continue
      const offset = lineStart + (diag.col - 1)

      let target = null
      const visit = (node) => {
        if (ts.isElementAccessExpression(node) && node.getStart(sf) === offset) target = node
        ts.forEachChild(node, visit)
      }
      visit(sf)
      if (!target) continue
      const object = target.expression
      if (ts.isParenthesizedExpression(object)) continue
      const key = `${object.getStart()}:${object.getEnd()}`
      if (seen.has(key)) continue
      seen.add(key)
      edits.push({ offset: object.getStart(), text: '(' })
      edits.push({ offset: object.getEnd(), text: ' as any)' })
    }
    if (!edits.length) continue

    let next = text
    let applied = 0
    for (const edit of edits.sort((a, b) => b.offset - a.offset)) {
      next = next.slice(0, edit.offset) + edit.text + next.slice(edit.offset)
      applied += 1
    }
    if (!stillParses(file, next)) {
      console.warn(`[index-cast] 语法校验失败，跳过 ${file}`)
      continue
    }
    files += 1
    casts += applied / 2
    if (!dry) fs.writeFileSync(file, next)
  }
  console.log(`[index-cast] 文件 ${files} 个，加断言 ${casts} 处${dry ? '（dry-run）' : ''}`)
}

const NULL_DIAG_RE =
  /^(?<file>.+?)\((?<line>\d+),(?<col>\d+)\): error TS(?<code>\d+): '(?<expr>[^']+)' is possibly '(?:null|undefined|null' or 'undefined)'\./

/** 无「被引用的表达式名」可用、只能靠 AST 定位的空安全诊断。 */
const AST_NULL_CODES = new Set([
  2531, // Object is possibly 'null'.
  2532, // Object is possibly 'undefined'.
  2538, // Type 'undefined'/'unknown' cannot be used as an index type.
  2722, // Cannot invoke an object which is possibly 'undefined'.
])

/** 断言位置的下一个字符是否会让 `!` 变成别的语义 / 非法语法。 */
function unsafeAssertAt(text, at) {
  const rest = text.slice(at, at + 3)
  // `x!==` 会被词法成 `!==`（语义变了）；`x!++` / `x!?.y` 非法。
  if (rest.startsWith('==') || rest.startsWith('=')) return true
  if (rest.startsWith('++') || rest.startsWith('--')) return true
  return rest.startsWith('?')
}

/**
 * 从「起始偏移处的节点」推出该在哪断言：属性访问/调用的对象、下标的键、或该值本身。
 */
function astAssertOffset(sf, offset) {
  let node = null
  const visit = (n) => {
    if (n.getStart(sf) === offset) node = n
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(sf, visit)
  if (!node) return null
  if (ts.isStatement(node) || node.getWidth(sf) <= 0) return null

  const parent = node.parent
  if (parent) {
    if (ts.isPropertyAccessExpression(parent) && parent.expression === node) return node.getEnd()
    if (ts.isCallExpression(parent) && parent.expression === node) return node.getEnd()
    if (ts.isElementAccessExpression(parent) && parent.expression === node) return node.getEnd()
    if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node)
      return node.getEnd()
    // 其它父节点（二元/赋值等）下无法安全推断，跳过。
    if (ts.isPropertyAccessExpression(parent) || ts.isCallExpression(parent)) return null
  }
  return node.getEnd()
}

/**
 * 空安全类（TS18047 「X 可能是 null」/ TS18048 「X 可能是 undefined」）：在诊断给出的
 * 表达式后补非空断言 `!`。断言是**纯类型层**语法，编译产物与 `x.y` 完全一致（真为 null
 * 时同样抛错），因此不改变任何运行时行为；它把「这里假定非空」这一既有隐含契约显式化，
 * 供后续按需替换为真实判空。
 */
function nullAssert(diagPath, dry) {
  const byFile = new Map()
  for (const rawLine of fs.readFileSync(diagPath, 'utf8').split('\n')) {
    const trimmed = rawLine.trim()
    const quoted = NULL_DIAG_RE.exec(trimmed)
    const generic = /^(?<file>.+?)\((?<line>\d+),(?<col>\d+)\): error TS(?<code>\d+):/.exec(trimmed)
    const useAst = !quoted && generic && AST_NULL_CODES.has(Number(generic.groups.code))
    const match = quoted ?? (useAst ? generic : null)
    if (!match) continue
    const file = match.groups.file
    if (!file.startsWith(STUDIO_ROOT) || !file.endsWith('.ts')) continue
    const entry = {
      line: Number(match.groups.line),
      col: Number(match.groups.col),
      expr: quoted ? quoted.groups.expr : null,
    }
    const list = byFile.get(file)
    if (list) list.push(entry)
    else byFile.set(file, [entry])
  }

  let files = 0
  let asserts = 0
  let skipped = 0
  for (const [file, diags] of byFile) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    const starts = [0]
    for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1)

    const sfFor = (source) =>
      ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

    const offsets = new Map()
    for (const diag of diags) {
      const lineStart = starts[diag.line - 1]
      if (lineStart === undefined) {
        skipped += 1
        continue
      }
      const offset = lineStart + (diag.col - 1)
      let at = null
      if (diag.expr) {
        if (!text.startsWith(diag.expr, offset)) {
          skipped += 1
          continue
        }
        at = offset + diag.expr.length
      } else {
        at = astAssertOffset(sfFor(text), offset)
        if (at === null) {
          skipped += 1
          continue
        }
      }
      if (unsafeAssertAt(text, at)) {
        skipped += 1
        continue
      }
      offsets.set(at, '!')
    }
    if (!offsets.size) continue

    let next = text
    let applied = 0
    for (const [offset] of [...offsets.entries()].sort((a, b) => b[0] - a[0])) {
      next = next.slice(0, offset) + '!' + next.slice(offset)
      applied += 1
    }
    if (!stillParses(file, next)) {
      console.warn(`[null-assert] 语法校验失败，跳过 ${file}`)
      continue
    }
    files += 1
    asserts += applied
    if (!dry) fs.writeFileSync(file, next)
  }
  console.log(`[null-assert] 文件 ${files} 个，补 ! ${asserts} 处，跳过 ${skipped} 处${dry ? '（dry-run）' : ''}`)
}

/** 根因 3：`= null` / `= undefined` 在严格档下被推断为 `null` / `undefined` 类型。
 *
 * 宽松档里 `let x = null` 的 `x` 是 `any`，严格档变成 `null`，于是下游成片报错：
 * 给 `x` 赋真值 → TS2322；`x.foo` / `x()` → TS2339 / TS2722；`if (x)` 之后收窄成
 * `never` → 又一批 TS2339。这类「占位 null」在遗留代码里表达的是「待赋值」，语义上
 * 就是 `any`，因此在声明处显式补 `: any`（对象字面量属性补 ` as any`）。
 *
 * 只处理**没有显式类型标注**的位置；已标注类型的（如 `let s: Session = null`）属于
 * 「类型漏了 null」，交由 --union-null 处理。
 */
function widenNullish(dry) {
  const isNullish = (node) =>
    Boolean(
      node &&
        (node.kind === ts.SyntaxKind.NullKeyword ||
          (ts.isIdentifier(node) && node.text === 'undefined')),
    )
  let files = 0
  let editsCount = 0
  for (const file of listStudioFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const edits = []

    const visit = (node) => {
      if (
        (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isParameter(node)) &&
        !node.type &&
        node.initializer &&
        isNullish(node.initializer) &&
        ts.isIdentifier(node.name)
      ) {
        edits.push({ offset: node.name.getEnd(), text: ': any' })
      }
      if (ts.isPropertyAssignment(node) && isNullish(node.initializer)) {
        edits.push({ offset: node.initializer.getEnd(), text: ' as any' })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    if (!edits.length) continue

    let next = text
    let applied = 0
    for (const edit of edits.sort((a, b) => b.offset - a.offset)) {
      if (next.slice(edit.offset, edit.offset + 2) === ': ') continue
      next = next.slice(0, edit.offset) + edit.text + next.slice(edit.offset)
      applied += 1
    }
    if (!applied || next === text) continue
    if (!stillParses(file, next)) {
      console.warn(`[widen-null] 语法校验失败，跳过 ${file}`)
      continue
    }
    files += 1
    editsCount += applied
    if (!dry) fs.writeFileSync(file, next)
  }
  console.log(`[widen-null] 文件 ${files} 个，补标注 ${editsCount} 处${dry ? '（dry-run）' : ''}`)
}

/**
 * 根因 4：显式写了非空类型却用 `null` 初始化（`let s: Session = null`）。
 *
 * 这类声明原意就是「先置空、后再赋值」，只是类型少写了 `| null`。仅当类型本身不是
 * 联合类型（联合类型大概率已经包含 `null`，加了对齐风险更大）时，把 `T` 包成
 * `(T) | null`。纯类型层修改，运行时零差异。
 */
function unionNull(dry) {
  const isNullish = (node) => Boolean(node && node.kind === ts.SyntaxKind.NullKeyword)
  let files = 0
  let editsCount = 0
  for (const file of listStudioFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const edits = []

    const visit = (node) => {
      if (
        (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
        node.type &&
        node.initializer &&
        isNullish(node.initializer)
      ) {
        const type = node.type
        if (ts.isUnionTypeNode(type) || ts.isTypeLiteralNode(type)) {
          ts.forEachChild(node, visit)
          return
        }
        const typeText = type.getText(sf)
        if (typeText === 'any' || typeText === 'unknown' || typeText === 'never') {
          ts.forEachChild(node, visit)
          return
        }
        edits.push({ offset: type.getStart(sf), text: '(' })
        edits.push({ offset: type.getEnd(), text: ') | null' })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    if (!edits.length) continue

    let next = text
    let applied = 0
    for (const edit of edits.sort((a, b) => b.offset - a.offset)) {
      next = next.slice(0, edit.offset) + edit.text + next.slice(edit.offset)
      applied += 1
    }
    if (!applied || next === text) continue
    if (!stillParses(file, next)) {
      console.warn(`[union-null] 语法校验失败，跳过 ${file}`)
      continue
    }
    files += 1
    editsCount += applied / 2
    if (!dry) fs.writeFileSync(file, next)
  }
  console.log(`[union-null] 文件 ${files} 个，放宽 ${editsCount} 处${dry ? '（dry-run）' : ''}`)
}

/**
 * 空值不匹配类（TS2345 参数 / TS2322 赋值）：严格档下把「可能是 `undefined`/`null`」
 * 传给已声明非空的位置。诊断文本形如
 *   `Argument of type 'string | undefined' is not assignable to parameter of type 'string'`
 *
 * 只在**两侧去掉 nullish 后完全一致**时才动手（即错误纯粹来自空值），并在**值的一侧**
 * 补 `!`：`f(x)` → `f(x!)`、`obj.prop = v` → `obj.prop = v!`。非空断言是纯类型层语法，
 * 编译产物与原文完全一致（运行时真为 null 时同样抛错），因此不改任何行为，只是把
 * 「此处假定非空」这一既有隐含契约显式化。
 */
const ASSIGN_DIAG_RE =
  /^(?<file>.+?)\((?<line>\d+),(?<col>\d+)\): error TS(?<code>\d+): (?<kind>Argument of type|Type) '(?<from>.+?)' is not assignable to (?<kind2>parameter of type|type) '(?<to>.+?)'\./

/** 去掉联合类型里的 nullish 成员，用来判断两侧是否「只差空值」。 */
function stripNullish(typeText) {
  const parts = typeText
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && part !== 'null' && part !== 'undefined')
  if (!parts.length) return null
  return parts.join(' | ')
}

function isNullishOnlyMismatch(from, to) {
  if (!/(^|\|)\s*(null|undefined)\s*($|\|)/.test(from)) return false
  const fromBase = stripNullish(from)
  if (!fromBase) return false
  return fromBase === stripNullish(to)
}

/** 从诊断位置向上找到「该补 ! 的值表达式」。返回 null 表示不在安全处理范围。 */
function valueNodeForAssignError(node) {
  let current = node
  while (current) {
    const parent = current.parent
    if (!parent) return null
    if (ts.isBinaryExpression(parent) && parent.left === current) return parent.right
    if (ts.isPropertyAssignment(parent) && parent.initializer === current) return parent.initializer
    if (ts.isVariableDeclaration(parent) && parent.name === current) return parent.initializer
    if (ts.isParameter(parent) && parent.name === current) return parent.initializer
    if (ts.isReturnStatement(parent) && parent.expression === current) return parent.expression
    if (ts.isStatement(parent) || ts.isBlock(parent)) return null
    current = parent
  }
  return null
}

function expressionNodeAt(sf, offset) {
  let found = null
  const visit = (node) => {
    const start = node.getStart(sf)
    if (start === offset) {
      if (ts.isExpression(node)) found = node
      ts.forEachChild(node, visit)
      return
    }
    if (start < offset && offset < node.getEnd()) ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
  return found
}

function nullishMismatch(diagPath, dry) {
  const byFile = new Map()
  for (const rawLine of fs.readFileSync(diagPath, 'utf8').split('\n')) {
    const match = ASSIGN_DIAG_RE.exec(rawLine.trim())
    if (!match) continue
    const code = Number(match.groups.code)
    if (code !== 2345 && code !== 2322 && code !== 2769) continue
    if (!isNullishOnlyMismatch(match.groups.from, match.groups.to)) continue
    const file = match.groups.file
    if (!file.startsWith(STUDIO_ROOT) || !file.endsWith('.ts')) continue
    const entry = {
      line: Number(match.groups.line),
      col: Number(match.groups.col),
      code,
    }
    const list = byFile.get(file)
    if (list) list.push(entry)
    else byFile.set(file, [entry])
  }

  let files = 0
  let asserts = 0
  let skipped = 0
  for (const [file, diags] of byFile) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const starts = [0]
    for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1)

    const offsets = new Map()
    for (const diag of diags) {
      const lineStart = starts[diag.line - 1]
      if (lineStart === undefined) {
        skipped += 1
        continue
      }
      const offset = lineStart + (diag.col - 1)
      const node = expressionNodeAt(sf, offset)
      if (!node) {
        skipped += 1
        continue
      }
      let value = node
      if (diag.code === 2322) {
        value = valueNodeForAssignError(node)
        if (!value) {
          skipped += 1
          continue
        }
      }
      // 已经是 `x!` / 非表达式 / 语句级节点的一律跳过。
      const at = value.getEnd()
      if (text.slice(at - 1, at) === '!') {
        skipped += 1
        continue
      }
      if (unsafeAssertAt(text, at)) {
        skipped += 1
        continue
      }
      offsets.set(at, '!')
    }
    if (!offsets.size) continue

    let next = text
    let applied = 0
    for (const [offset] of [...offsets.entries()].sort((a, b) => b[0] - a[0])) {
      next = next.slice(0, offset) + '!' + next.slice(offset)
      applied += 1
    }
    if (!stillParses(file, next)) {
      console.warn(`[nullish] 语法校验失败，跳过 ${path.basename(file)}`)
      continue
    }
    files += 1
    asserts += applied
    if (!dry) fs.writeFileSync(file, next)
  }
  console.log(
    `[nullish] 文件 ${files} 个，补 ! ${asserts} 处，跳过 ${skipped} 处${dry ? '（dry-run）' : ''}`,
  )
}

/**
 * 根因 5：解构模式里的 `= null` 默认值。
 *
 * `function f({ key = null })` 里 `key` 的类型被推断成 `null`（宽松档是 `any`），于是
 * 传入真值就报「Type 'X' is not assignable to type 'null | undefined'」。绑定元素上**不能**
 * 直接写类型标注（`{ key: any = null }` 会被读成改名），因此给外层模式整体补 `: any`，
 * 与 TS7031 处理解构隐式 any 的做法一致。
 */
function widenDestructuredDefaults(dry) {
  const isNullish = (node) =>
    Boolean(
      node &&
        (node.kind === ts.SyntaxKind.NullKeyword ||
          (ts.isIdentifier(node) && node.text === 'undefined')),
    )
  let files = 0
  let editsCount = 0
  for (const file of listStudioFiles()) {
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const offsets = new Set()
    const visit = (node) => {
      if (ts.isBindingElement(node) && node.initializer && isNullish(node.initializer)) {
        const isPattern = (n) => Boolean(n) && (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n))
        let pattern = node
        while (pattern && !isPattern(pattern)) pattern = pattern.parent
        while (pattern && ts.isBindingElement(pattern.parent)) {
          let outer = pattern.parent
          while (outer && !isPattern(outer)) outer = outer.parent
          pattern = outer
        }
        const owner = pattern?.parent
        if (pattern && owner && (ts.isParameter(owner) || ts.isVariableDeclaration(owner)) && !owner.type) {
          offsets.add(pattern.getEnd())
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    if (!offsets.size) continue
    let next = text
    for (const offset of [...offsets].sort((a, b) => b - a)) {
      next = next.slice(0, offset) + ': any' + next.slice(offset)
    }
    if (!stillParses(file, next)) {
      console.warn(`[widen-destructured] 语法校验失败，跳过 ${file}`)
      continue
    }
    files += 1
    editsCount += offsets.size
    if (!dry) fs.writeFileSync(file, next)
  }
  console.log(
    `[widen-destructured] 文件 ${files} 个，补标注 ${editsCount} 处${dry ? '（dry-run）' : ''}`,
  )
}

function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  if (args.includes('--widen')) widenEmptyLiterals(dry)
  if (args.includes('--widen-null')) widenNullish(dry)
  if (args.includes('--widen-destructured')) widenDestructuredDefaults(dry)
  if (args.includes('--union-null')) unionNull(dry)
  if (args.includes('--nullish-fix')) {
    const diagPath = args.filter((arg) => !arg.startsWith('--'))[0]
    if (!diagPath) {
      console.error('--nullish-fix 需要诊断文件路径')
      process.exit(1)
    }
    nullishMismatch(diagPath, dry)
  }
  if (args.includes('--catch-any')) catchAny(dry)
  if (args.includes('--null-assert')) {
    const diagPath = args.filter((arg) => !arg.startsWith('--'))[0]
    if (!diagPath) {
      console.error('--null-assert 需要诊断文件路径')
      process.exit(1)
    }
    nullAssert(diagPath, dry)
  }
  if (args.includes('--index-cast')) {
    const diagPath = args.filter((arg) => !arg.startsWith('--'))[0]
    if (!diagPath) {
      console.error('--index-cast 需要诊断文件路径')
      process.exit(1)
    }
    indexCast(diagPath, dry)
  }
}

main()
