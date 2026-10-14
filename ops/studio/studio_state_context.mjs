#!/usr/bin/env node
/**
 * `studio_state_context.mjs` —— 把宿主闭包里的可变 `let` 状态改写为显式 `ctx.<name>` 引用。
 *
 * 为什么需要它
 * ------------
 * studio 宿主（`stage.ts` 的 `mountStage`、`home.ts` 的 `bootEditor()` 内层箭头、
 * `studio-app.ts` 的 `bootStudio()` 内层箭头与 `runStudioRenderLoop`）把几十上百个可变绑定
 * 藏在闭包里；切片时每个被搬走的函数都要重新捕获它们，「每切一刀都要重连一堆渲染循环状态」
 * 正是收敛的阻塞点。显式化（`let x` → `ctx.x`）是把这堆隐式捕获收进一个带**显式字段类型**的
 * 对象（禁止 `{[key:string]: any}` 开放袋子）的前置步骤。
 *
 * **按符号解析，不按名字匹配**：宿主里 `options` / `text` / `num` / `list` 这类常见名极易被同名
 * 参数或内层局部变量遮蔽，按名字改会误伤。这里用切片工具同款 `noResolve` 本地 Program + 类型
 * 检查器，只改**确指宿主那个 `let` 绑定**的标识符。
 *
 * 本工具只改**引用**：
 * - `get x(){}` / `set x(v){}` 的**键名**、对象字面量属性**键名**一律不动；
 * - 简写属性 `x,` 会展开成 `x: ctx.x,`（否则会变成非法的对象键）；
 * - 其余指向该绑定的标识符一律换成 `ctx.x`。
 *
 * `--drop-let` 再删掉这些绑定的 `let` 声明整行（宿主内**除嵌套函数以外**的任意深度，含 `if`/
 * `try` 块里）：
 * - 初值是**纯字面量**的（`""` / `0` / `false` / `null` / `[]` / `{ lights: [] }` …）直接删，
 *   值搬进 `createXxxContext()` 工厂（等价，且宿主净减）；
 * - 初值依赖宿主作用域的（`f()` / `mountOptions.x` …）必须用 `--keep-init=<名>` 或 `--keep-init=*`
 *   显式声明，声明**原位**改成 `ctx.x = <初值>`，语义与位置都不变（不会出现「先读到默认值」的窗口）。
 *
 * `--emit-ctx=<path>` 依据宿主 `let` 声明生成上下文模块（接口 + 工厂），字段顺序/类型/初值一一
 * 对应：纯字面量初值进工厂，其余留 `undefined` 占位（由宿主原位写回）。
 *
 * 用法：
 *   node ops/studio/studio_state_context.mjs --file=<宿主> (--fn=<宿主函数> | --at=<行号>) --names=a,b \
 *     [--ctx=ctx] [--list] [--dry-run] [--drop-let] [--keep-init=a|*]
 *   node ops/studio/studio_state_context.mjs --file=<宿主> (--fn=… | --at=…) --names=a,b \
 *     --emit-ctx=<新模块路径> --ctx-type=<接口名> [--ctx-factory=<工厂名>]
 * 退出码：0 = 完成（或 dry-run 通过）；1 = 语法自检不过 / 找不到目标；2 = 参数错。
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const arg = (k) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : undefined
}
const flag = (k) => process.argv.includes(`--${k}`)
const dirnameOf = (p) => {
  const i = p.lastIndexOf('/')
  return i === -1 ? '.' : p.slice(0, i)
}

const file = arg('file')
const fnName = arg('fn')
const atLine = arg('at') ? Number(arg('at')) : undefined
const names = (arg('names') ?? '').split(',').filter(Boolean)
const ctxName = arg('ctx') ?? 'ctx'
const dryRun = flag('dry-run')
const listOnly = flag('list')
const dropLet = flag('drop-let')
const keepInitArg = arg('keep-init') ?? ''
const keepAll = keepInitArg.split(',').includes('*')
const keepInit = new Set(keepInitArg.split(',').filter((n) => n && n !== '*'))
const emitCtxPath = arg('emit-ctx')
const ctxTypeName = arg('ctx-type') ?? 'HostContext'
const ctxFactoryName = arg('ctx-factory') ?? `create${ctxTypeName}`

const usage = () => {
  console.error(
    '用法：node ops/studio/studio_state_context.mjs --file=<宿主> (--fn=<宿主函数> | --at=<行号>) --names=a,b [--ctx=ctx] [--list] [--dry-run] [--drop-let] [--keep-init=a|*] [--emit-ctx=<路径> --ctx-type=<接口名>]',
  )
  process.exit(2)
}
if (!file || (!fnName && !atLine)) usage()
if (listOnly && (dropLet || emitCtxPath)) {
  console.error('× --list 只报告不改写，不能和 --drop-let / --emit-ctx 同用')
  process.exit(2)
}
if (!names.length && !listOnly) usage()

const src = fs.readFileSync(file, 'utf8')
const NAME = new Set(names)

function makeProgram(text) {
  const options = { target: ts.ScriptTarget.ESNext, noResolve: true, experimentalDecorators: true }
  // 注意：`createCompilerHost` 的 `getSourceFile` 走的是**磁盘**（只覆盖 `readFile` 没用），
  // 必须连 `getSourceFile` 一起覆盖，否则拿到的是写盘前的旧文本，偏移全错。
  let cached = null
  const program = ts.createProgram([file], options, {
    ...ts.createCompilerHost(options),
    fileExists: (f) => f === file,
    readFile: (f) => (f === file ? text : undefined),
    getSourceFile: (f, languageVersion) => {
      if (f !== file) return undefined
      cached ??= ts.createSourceFile(f, text, languageVersion, true, ts.ScriptKind.TS)
      return cached
    },
  })
  return { program, checker: program.getTypeChecker(), sf: program.getSourceFile(file) }
}

/** 宿主：命名函数 / 命名箭头（`--fn`）或指定起始行的任意带块体函数（`--at`）。 */
function findHostIn(sf) {
  let host = null
  const matchesAt = (node) => atLine !== undefined && ts.isFunctionLike(node) && node.body && ts.isBlock(node.body) && lineOf(sf, node.getStart(sf)) === atLine
  const visit = (node) => {
    if (!host && matchesAt(node)) host = node
    else if (!host && fnName && ts.isFunctionDeclaration(node) && node.name?.text === fnName) host = node
    else if (!host && fnName && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === fnName && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
      host = node.initializer
    if (!host) ts.forEachChild(node, visit)
  }
  visit(sf)
  return host
}

/** 宿主内（不含嵌套函数）所有「声明名全在本批名单里」的 `let` 语句。 */
function collectLetStatements(host) {
  const out = []
  const visit = (node) => {
    if (node !== host && ts.isFunctionLike(node)) return
    if (
      ts.isVariableStatement(node) &&
      (node.declarationList.flags & ts.NodeFlags.Let) !== 0 &&
      node.declarationList.declarations.length &&
      node.declarationList.declarations.every((d) => ts.isIdentifier(d.name) && NAME.has(d.name.text))
    )
      out.push(node)
    ts.forEachChild(node, visit)
  }
  visit(host.body)
  return out
}

/**
 * 纯字面量初值（可安全搬进工厂）：字符串/数字/布尔/null/undefined/纯数组/纯对象。
 *
 * 两条**必须**收录的形态，否则初值会被静默丢掉（实测踩过：`options: { lights: [] as any[] }`
 * 与 `furthestFloorOrder = -Infinity` 被判成「搬不动」，然后既没进工厂、宿主也没写回，
 * 字段就停在占位值上 → 运行时语义变了）：
 * 1. **类型断言**（`x as T` / `<T>x` / `x satisfies T` / 括号）不影响运行时值，拆掉继续判定；
 * 2. `-`/`+` 作用于 `Infinity` / `NaN` 这类**模块级常量**（`-Infinity` 是 `PrefixUnaryExpression`
 *    的 Identifier 操作数，不是 NumericLiteral）。
 */
function isPureLiteral(node) {
  if (!node) return false
  if (ts.isParenthesizedExpression(node)) return isPureLiteral(node.expression)
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression?.(node) || ts.isSatisfiesExpression?.(node)) {
    return isPureLiteral(node.expression)
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node)) return true
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword) return true
  if (ts.isIdentifier(node) && node.text === 'undefined') return true
  if (ts.isPrefixUnaryExpression(node)) {
    if (ts.isNumericLiteral(node.operand)) return true
    if (ts.isIdentifier(node.operand) && (node.operand.text === 'Infinity' || node.operand.text === 'NaN')) return true
    return false
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(isPureLiteral)
  if (ts.isObjectLiteralExpression(node)) return node.properties.every((p) => ts.isPropertyAssignment(p) && isPureLiteral(p.initializer))
  return false
}

/**
 * 字段类型推导：**能精确表达就精确表达，不能才退 `any`**。
 *
 * 退 `any` 不是无害的：宿主里 `ctx.studioState.items.map((x) => …)` 一旦 receiver 变成 `any`，
 * 回调参数就退化成隐式 `any`（`TS7006`），原有上下文推断被抹掉。实测 `studio-app.ts` 因此
 * 一次冒出 107 个错误。所以按下面顺序取类型：
 *
 *  1. **显式注解**（原作者的意图）→ 用 TS AST 收集「类型引用名」，只要这些名字都能在本模块
 *     表达出来（TS 内建 / 宿主已有的 import / TS 工具类型）就原样抄；`{ areaId: string }[]`
 *     这类**内联结构类型**也是自足的，属性名不会被误当成类型引用。
 *  2. **无注解但初值是 `import f` 的调用** → `ReturnType<typeof f>`：既精确又自足
 *     （`studioState = createStudioDocument()` 这种匿名大对象类型靠它才不用退 `any`）。
 *     `new X()` → `InstanceType<typeof X>`。
 *  3. 纯字面量初值 → `string` / `number` / `boolean`。
 *  4. 其余（本地声明类型、跨文件私有类型等无法自足表达者）→ `any`，并在文件头写明。
 *
 * 被用到的 import 会按**相对上下文模块**的路径补 `import type`，所以类型是真的搬过来，不是抄个名字。
 */
const BUILTIN_TYPES = new Set([
  'any', 'unknown', 'never', 'void', 'string', 'number', 'boolean', 'object', 'symbol', 'bigint',
  'null', 'undefined', 'true', 'false', 'this',
  'Array', 'ReadonlyArray', 'Record', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude',
  'Extract', 'NonNullable', 'ReturnType', 'Parameters', 'InstanceType', 'Awaited', 'ThisType',
  'Uppercase', 'Lowercase', 'Capitalize', 'Uncapitalize', 'PropertyKey',
  'Promise', 'Map', 'ReadonlyMap', 'Set', 'ReadonlySet', 'WeakMap', 'WeakSet', 'Date', 'RegExp',
  'Error', 'Function', 'Iterable', 'Iterator', 'IterableIterator', 'ArrayLike', 'JSON',
])

/**
 * 复制纯字面量初值时，剔掉 `x as any` / `x as any[]` 这类**纯断言**。
 *
 * 断言不影响运行时值，但会把 `as any` 记账搬进新模块 —— `check-studio-type-debt` 只减不增，
 * 复制一次就棘轮回退（实测：stage-context +2、editor-context +1）。用 AST 定位删除区间
 * （只在断言类型恰好是 `any` / `any[]` 时删），不做文本正则，避免误伤字符串里的 "as any"。
 */
function stripAnyAssertionText(node, sf) {
  const cuts = []
  const visit = (n) => {
    const isAssertion = ts.isAsExpression(n) || ts.isSatisfiesExpression(n)
    if (isAssertion && /^any(\[\])*$/.test(n.type.getText(sf).replace(/\s+/g, ''))) {
      cuts.push([n.expression.getEnd(), n.getEnd()]) // 表达式结尾 → 断言结尾（含 `as any[]`）
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  const base = node.getStart(sf)
  let text = node.getText(sf)
  for (const [s, e] of cuts.sort((a, b) => b[0] - a[0])) text = text.slice(0, s - base) + text.slice(e - base)
  return text
}

/** 收集类型节点里真正的**类型引用名**（属性名 / 字符串字面量成员不算）。 */
function typeRefNames(node) {
  const out = new Set()
  const takeLeft = (name) => {
    let left = name
    while (ts.isQualifiedName(left)) left = left.left
    if (ts.isIdentifier(left)) out.add(left.text)
  }
  const visit = (n) => {
    if (ts.isTypeReferenceNode(n)) takeLeft(n.typeName)
    else if (ts.isExpressionWithTypeArguments(n) && ts.isIdentifier(n.expression)) out.add(n.expression.text)
    else if (ts.isTypeQueryNode(n)) takeLeft(n.exprName)
    else if (ts.isImportTypeNode(n)) out.add('\u0000ImportType') // 内部 import() 类型：不复用
    if (ts.isTypeLiteralNode(n)) {
      for (const m of n.members) ts.forEachChild(m, visit) // 只下钻成员类型，成员名不参与
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}

/** 宿主的 import 表：本地名 -> { spec, form, exported }（form: named | default | namespace）。 */
function collectImports(sourceFile) {
  const map = new Map()
  for (const st of sourceFile.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue
    const spec = st.moduleSpecifier.text
    const clause = st.importClause
    if (clause.name) map.set(clause.name.text, { spec, form: 'default', exported: clause.name.text })
    const nb = clause.namedBindings
    if (!nb) continue
    if (ts.isNamespaceImport(nb)) map.set(nb.name.text, { spec, form: 'namespace', exported: nb.name.text })
    else {
      for (const el of nb.elements) {
        // 别名导入（`f as f2`）必须记下导出名，否则补出来的 `import type { f2 }` 解析不到。
        const exported = (el.propertyName ?? el.name).text
        map.set(el.name.text, { spec, form: 'named', exported })
      }
    }
  }
  return map
}

/** 宿主本文件里声明的类型/类名（不能跨文件 import，遇到就退 `any`）。 */
function collectLocalTypes(sourceFile) {
  const set = new Set()
  for (const st of sourceFile.statements) {
    if (
      (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isClassDeclaration(st) ||
        ts.isEnumDeclaration(st)) && st.name
    ) {
      set.add(st.name.text)
    }
  }
  return set
}
const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1

// —— 第一遍：原始文本上的符号解析 ——
const { checker, sf } = makeProgram(src)
const parentMap = new Map()
;(function walkParents(n) {
  ts.forEachChild(n, (c) => {
    parentMap.set(c, n)
    walkParents(c)
  })
})(sf)
const parentOf = (n) => parentMap.get(n)

const host = findHostIn(sf)
if (!host) {
  console.error(`✗ 找不到宿主 ${fnName ?? `@${atLine}`}（命名宿主用 --fn，匿名箭头用 --at=<其起始行号>）`)
  process.exit(1)
}
const hostLabel = fnName ?? `${ts.isFunctionDeclaration(host) ? 'function' : 'arrow'}@${lineOf(sf, host.getStart(sf))}`

// —— 目标绑定：按符号收集（同名遮蔽天然排除）——
const targetSymbols = new Map() // Symbol -> name
;(function collect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && NAME.has(node.name.text) && isLetDecl(node)) {
    const sym = checker.getSymbolAtLocation(node.name)
    if (sym) targetSymbols.set(sym, node.name.text)
  }
  ts.forEachChild(node, collect)
})(host)
function isLetDecl(decl) {
  const list = decl.parent
  return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Let) !== 0
}

const declaredNames = new Set(targetSymbols.values())
// 声明已被 `const ctx = …` 取代的名字：按「无本地符号」兜底匹配（被同名参数/局部遮蔽的仍有符号 → 天然排除）。
const fallbackNames = new Set(names.filter((n) => !declaredNames.has(n)))
const resolveName = (sym, text) => targetSymbols.get(sym) ?? (sym === undefined && fallbackNames.has(text) ? text : undefined)

// —— 报告命中（--list 只看不改）——
const refHits = []
const shorthandHits = []
const walkRefs = (node) => {
  if (ts.isShorthandPropertyAssignment(node) && NAME.has(node.name.text)) {
    // 悬空的简写（`{ x }`，x 的声明已被 ctx 取代）：getShorthandAssignmentValueSymbol 返回 undefined。
    // 不能退回 getSymbolAtLocation(node.name)——那会拿到「简写自身的属性符号」，把悬空误判为已解析。
    const sym = checker.getShorthandAssignmentValueSymbol?.(node)
    const name = resolveName(sym, node.name.text)
    if (name) shorthandHits.push({ node, name })
    return
  }
  if (ts.isIdentifier(node) && NAME.has(node.text) && !isNamePosition(node)) {
    const name = resolveName(checker.getSymbolAtLocation(node), node.text)
    if (name) refHits.push({ node, name })
  }
  ts.forEachChild(node, walkRefs)
}

/** 该标识符是否处于「名字位」（属性键 / 成员名 / 声明名）——处于名字位就不能改写。 */
function isNamePosition(node) {
  const p = parentOf(node)
  return (
    (ts.isPropertyAccessExpression(p) && p.name === node) ||
    (ts.isQualifiedName(p) && p.right === node) ||
    (ts.isPropertyAssignment(p) && p.name === node) ||
    (ts.isPropertyDeclaration(p) && p.name === node) ||
    (ts.isPropertySignature(p) && p.name === node) ||
    (ts.isMethodDeclaration(p) && p.name === node) ||
    (ts.isGetAccessor(p) && p.name === node) ||
    (ts.isSetAccessor(p) && p.name === node) ||
    (ts.isVariableDeclaration(p) && p.name === node) ||
    (ts.isParameter(p) && p.name === node) ||
    (ts.isBindingElement(p) && p.name === node) ||
    (ts.isFunctionDeclaration(p) && p.name === node) ||
    (ts.isFunctionExpression(p) && p.name === node)
  )
}

walkRefs(host)

const hitNames = new Set([...refHits, ...shorthandHits].map((h) => h.name))
const missing = names.filter((n) => !declaredNames.has(n) && !hitNames.has(n))
const unhandled = () => {
  const seen = new Set()
  for (const st of collectLetStatements(host)) for (const d of st.declarationList.declarations) seen.add(d.name.text)
  return [...declaredNames].filter((n) => !seen.has(n))
}

// —— --emit-ctx：生成上下文模块后退出 ——
if (emitCtxPath) {
  const notFound = unhandled()
  if (notFound.length) {
    console.error(`✗ 这些绑定的 \`let\` 声明没被识别为「整条语句都在本批名单里」：${notFound.join(', ')}`)
    process.exit(1)
  }
  const importMap = collectImports(sf)
  const localTypes = collectLocalTypes(sf)
  const usedImports = new Map() // 本地名 -> { spec, form }

  /** 见 `typeRefNames` 上方注释：能精确表达就精确表达，不能才退 `any`。 */
  const typeOfDecl = (d) => {
    const init = d.initializer
    if (d.type) {
      let ok = true
      for (const n of typeRefNames(d.type)) {
        if (BUILTIN_TYPES.has(n)) continue
        if (localTypes.has(n)) {
          ok = false // 宿主本文件声明的私有类型：搬不进新模块（撞名风险）
          break
        }
        const imp = importMap.get(n)
        if (imp) {
          usedImports.set(n, imp)
          continue
        }
        ok = false // 未知名字：不放进类型位
        break
      }
      // 注解不可自足时**不**退回字面量推断：`let x: LocalThing = null` 若写成 `null` 会反向收窄。
      return ok ? d.type.getText(sf).replace(/\s+/g, ' ').trim() : 'any'
    }
    if (init) {
      const callee = ts.isCallExpression(init) ? init.expression : ts.isNewExpression(init) ? init.expression : null
      if (callee && ts.isIdentifier(callee) && importMap.has(callee.text)) {
        usedImports.set(callee.text, importMap.get(callee.text))
        return ts.isCallExpression(init) ? `ReturnType<typeof ${callee.text}>` : `InstanceType<typeof ${callee.text}>`
      }
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return 'string'
      if (ts.isNumericLiteral(init) || (ts.isPrefixUnaryExpression(init) && ts.isNumericLiteral(init.operand))) return 'number'
      if (ts.isPrefixUnaryExpression(init) && ts.isIdentifier(init.operand) && (init.operand.text === 'Infinity' || init.operand.text === 'NaN'))
        return 'number'
      if (init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword) return 'boolean'
    }
    return 'any'
  }

  const decls = []
  for (const st of collectLetStatements(host)) for (const d of st.declarationList.declarations) decls.push(d)
  const fields = decls.map((d) => {
    const type = typeOfDecl(d)
    const movable = !!d.initializer && isPureLiteral(d.initializer)
    // 非字面量初值的字段只放占位：类型精确时必须显式转型（真值由宿主在原 `let` 位置写回）。
    const placeholder = type === 'any' ? 'undefined' : `undefined as unknown as ${type}`
    return { name: d.name.text, type, init: movable ? stripAnyAssertionText(d.initializer, sf).replace(/\s*\n\s*/g, ' ') : placeholder, movable }
  })

  // 精确类型用到的宿主 import：按「相对上下文模块」的路径补 `import type`。
  const ctxDir = path.dirname(path.resolve(emitCtxPath))
  const srcDir = path.dirname(path.resolve(file))
  const relSpec = (spec) => {
    if (!spec.startsWith('.')) return spec
    const abs = path.resolve(srcDir, spec)
    const rel = path.relative(ctxDir, abs).replace(/\\/g, '/')
    return rel.startsWith('.') ? rel : `./${rel}`
  }
  const byModule = new Map()
  for (const [name, imp] of usedImports) {
    const spec = relSpec(imp.spec)
    const bucket = byModule.get(spec) ?? { named: [], default: [], namespace: [] }
    bucket[imp.form].push(imp.form === 'named' && imp.exported !== name ? `${imp.exported} as ${name}` : name)
    byModule.set(spec, bucket)
  }
  const importLines = []
  for (const [spec, b] of [...byModule].sort((a, c) => a[0].localeCompare(c[0]))) {
    for (const n of b.default.sort()) importLines.push(`import type ${n} from "${spec}";`)
    for (const n of b.namespace.sort()) importLines.push(`import type * as ${n} from "${spec}";`)
    if (b.named.length) importLines.push(`import type { ${b.named.sort().join(', ')} } from "${spec}";`)
  }

  const anyFields = fields.filter((f) => f.type === 'any')
  const lines = []
  lines.push('/**')
  lines.push(` * ${ctxTypeName} —— \`${file.split('/').slice(-1)[0]}\` 的 \`${hostLabel}\` 宿主闭包里可变状态的显式上下文。`)
  lines.push(' *')
  lines.push(' * 由 `ops/studio/studio_state_context.mjs --emit-ctx` 依据宿主 `let` 声明生成（可手工润色）：')
  lines.push(' * 字段顺序 / 类型 / 初值一一对应。**纯字面量初值**已搬进工厂；**初值依赖宿主作用域**的字段')
  lines.push(' * 只放占位值（`undefined` / `false` / `0` / `""`），由宿主在**原 `let` 位置**写回真值，')
  lines.push(' * 因此不会出现「先读到占位值」的窗口。')
  lines.push(' *')
  lines.push(' * 显式字段类型（禁止 `{[key:string]: any}` 开放袋子）。类型按「能精确就精确」推导：')
  lines.push(` * ${fields.length - anyFields.length}/${fields.length} 个字段是精确类型（原注解 / \`ReturnType<typeof f>\` / \`InstanceType<typeof X>\` / 字面量）；`)
  lines.push(` * 其余 ${anyFields.length} 个退 \`any\`：宿主里本就不自足（原文件自己的 \`: any\` 注解，或本地私有类型）。`)
  lines.push(' * **不要**把退化成 `any` 的 receiver 当小事 —— 宿主里 `ctx.x.items.map(cb)` 一旦 receiver 是 `any`，')
  lines.push(' * `cb` 就退化成隐式 `any`（`TS7006`），精确类型的价值正是在这里。')
  lines.push(' */')
  for (const l of importLines) lines.push(l)
  if (importLines.length) lines.push('')
  lines.push(`export interface ${ctxTypeName} {`)
  for (const f of fields) lines.push(`  ${f.name}: ${f.type};`)
  lines.push('}')
  lines.push('')
  lines.push(`export function ${ctxFactoryName}(): ${ctxTypeName} {`)
  lines.push('  return {')
  for (const f of fields) lines.push(`    ${f.name}: ${f.init},`)
  lines.push('  };')
  lines.push('}')
  lines.push('')
  const out = lines.join('\n')
  const ctxCheck = ts.createSourceFile(emitCtxPath, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const ctxDiags = (ctxCheck.parseDiagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error)
  if (ctxDiags.length) {
    console.error(`✗ 生成的上下文模块有语法错误（未写盘）：${ctxDiags.map((d) => d.messageText).join('; ')}`)
    process.exit(1)
  }
  if (dryRun) console.log(out)
  else {
    fs.mkdirSync(dirnameOf(emitCtxPath), { recursive: true })
    fs.writeFileSync(emitCtxPath, out, 'utf8')
  }
  console.log(
    JSON.stringify(
      {
        emitCtx: emitCtxPath,
        ctxType: ctxTypeName,
        host: hostLabel,
        fields: fields.length,
        exactTypes: fields.length - anyFields.length,
        anyTypes: anyFields.map((f) => f.name),
        typeImports: importLines.length,
        literalMoved: fields.filter((f) => f.movable).length,
        needsKeepInit: fields.filter((f) => !f.movable).map((f) => f.name).sort(),
        dryRun: !!dryRun,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

if (listOnly) {
  console.log(JSON.stringify({ file, fn: hostLabel, foundBindings: [...targetSymbols.values()].sort(), refs: refHits.length, shorthand: shorthandHits.length, missing, unhandled: unhandled() }, null, 2))
  process.exit(missing.length || unhandled().length ? 1 : 0)
}
if (missing.length) {
  console.error(`✗ 既找不到 \`let\` 声明、也没有任何引用：${missing.join(', ')}（名字不对？）`)
  process.exit(1)
}

// —— 引用改写 ——
const edits = [
  ...refHits.map((h) => ({ start: h.node.getStart(sf), end: h.node.getEnd(), text: `${ctxName}.${h.name}`, kind: 'ref' })),
  ...shorthandHits.map((h) => ({ start: h.node.getStart(sf), end: h.node.getEnd(), text: `${h.name}: ${ctxName}.${h.name}`, kind: 'shorthand' })),
]
let out = src
for (const e of [...edits].sort((a, b) => b.start - a.start)) {
  out = out.slice(0, e.start) + e.text + out.slice(e.end)
}

// —— 可选：删掉这些绑定的 `let` 声明（`--drop-let`）——
// 注意：必须在**改写后的文本**上重新解析——引用改写会改变字符偏移（`x` → `ctx.x`），
// 拿旧 AST 的位置去切新文本必然错位。
const dropped = []
const kept = []
if (dropLet) {
  const sf2 = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const host2 = findHostIn(sf2)
  if (!host2) {
    console.error('✗ --drop-let：改写后找不到宿主（--at 行号是否随改动漂移？）')
    process.exit(1)
  }
  const lineStartOf = (pos) => out.lastIndexOf('\n', pos - 1) + 1
  const lineEndOf = (pos) => {
    const i = out.indexOf('\n', pos)
    return i === -1 ? out.length : i + 1
  }
  const needKeep = []
  const drops = []
  for (const st of collectLetStatements(host2)) {
    const indentText = out.slice(lineStartOf(st.getStart(sf2)), st.getStart(sf2))
    const lines = []
    for (const d of st.declarationList.declarations) {
      const name = d.name.text
      const movable = !!d.initializer && isPureLiteral(d.initializer)
      if (!movable && !keepAll && !keepInit.has(name)) needKeep.push(name)
      if (!movable) {
        if (!d.initializer) {
          dropped.push(name)
          continue // 无初值：工厂给 undefined，宿主不写回
        }
        lines.push(`${indentText}${ctxName}.${name} = ${d.initializer.getText(sf2).replace(/\s*\n\s*/g, ' ')};`)
        kept.push(name)
      }
      dropped.push(name)
    }
    drops.push({ start: lineStartOf(st.getStart(sf2)), end: lineEndOf(st.getEnd()), text: lines.length ? lines.join('\n') + '\n' : '' })
    if (flag('verbose'))
      console.error(`   drop @${sf2.getLineAndCharacterOfPosition(st.getStart(sf2)).line + 1}-${sf2.getLineAndCharacterOfPosition(st.getEnd()).line + 1}  kept=${lines.length}  (start=${st.getStart(sf2)}, end=${st.getEnd()}, outLen=${out.length})`)
  }
  if (needKeep.length) {
    console.error(`✗ 初值依赖宿主作用域、必须显式保持（\`--keep-init=<名>\` 或 \`--keep-init=*\`）：${[...new Set(needKeep)].join(', ')}`)
    process.exit(2)
  }
  const notDropped = [...declaredNames].filter((n) => !dropped.includes(n))
  if (notDropped.length) {
    console.error(`✗ 这些绑定的 \`let\` 声明没被识别为「整条语句都在本批名单里」（未删）：${notDropped.join(', ')}`)
    process.exit(1)
  }
  if (flag('verbose')) console.error(`   sf2.text===out? ${sf2.text === out}  (${sf2.text.length} vs ${out.length})`)
  for (const d of drops.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, d.start) + d.text + out.slice(d.end)
  }
}

const check = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
if (arg('dump')) fs.writeFileSync(arg('dump'), out, 'utf8')
const diags = check.parseDiagnostics ?? []
if (diags.length) {
  const at = check.getLineAndCharacterOfPosition(diags[0].start)
  const all = out.split('\n')
  for (let i = Math.max(0, at.line - 3); i < Math.min(all.length, at.line + 2); i++) console.error(`${i + 1}: ${all[i]}`)
  console.error(`✗ 改写后语法错误（第 ${at.line + 1} 行第 ${at.character + 1} 列）：${ts.flattenDiagnosticMessageText(diags[0].messageText, ' ')}`)
  process.exit(1)
}

const byKind = edits.reduce((m, e) => ((m[e.kind] = (m[e.kind] ?? 0) + 1), m), {})
console.log(
  JSON.stringify(
    { file, fn: hostLabel, ctx: ctxName, bindings: [...targetSymbols.values()].sort(), edits: edits.length, byKind, dropLet, dropped: dropLet ? dropped.length : undefined, keptInPlace: dropLet ? kept.sort() : undefined, dryRun: !!dryRun },
    null,
    2,
  ),
)
for (const e of edits.slice(0, 40)) console.log(`   @${lineOf(sf, e.start)}  ${e.kind}  →  ${e.text}`)
if (edits.length > 40) console.log(`   … 其余 ${edits.length - 40} 条`)

if (!dryRun) {
  fs.writeFileSync(file, out, 'utf8')
  console.log(`✓ 已写盘：${file}`)
} else {
  console.log('（--dry-run：未写盘）')
}
