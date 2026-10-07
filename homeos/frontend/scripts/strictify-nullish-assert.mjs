/**
 * 迁移工具（阶段 3.2 第三梯队）：用**类型检查器**精确定位空值断言点。
 *
 * 背景：并入的 3D 遗留代码（原 `tsconfig.studio.json` strict:false）在严格档下大量
 * 报「可能是 null/undefined」：TS2322 / TS2345 / TS2349 / TS2722 / TS2531 / TS2532 /
 * TS2538 / TS18047 / TS18048。按诊断文本列号插 `!` 会插错节点——TS 报的是「实参表达式」
 * 的起点，而该起点同时可能是外层属性访问、嵌套调用的起点。
 *
 * 本脚本按诊断种类**各用一套精确定位**，再用 checker 的类型文本做校验：
 *   - TS2345 / TS2769（实参类型不符）→ 诊断起点就是实参起点：在包含该位置的调用里找
 *     `getStart() === 位置` 的那个实参；
 *   - TS2722 / TS2721 / TS2349（被调对象可能为空 / 不可调用）→ 找 `callee.getStart()`
 *     等于诊断位置的被调表达式；
 *   - TS2322（赋值类型不符）→ 诊断位置在**赋值目标**侧：先换算成值表达式（属性初始化
 *     器 / 变量初始化器 / 赋值右侧），再在值表达式内部找类型吻合的最内层节点；
 *   - TS2531 / TS2532 / TS18047 / TS18048 / TS2538 → 在诊断位置由内向外找第一个类型
 *     含 nullish 的值表达式。
 *
 * `!` 是纯类型层语法，编译产物与原文逐字节一致（真为 null 时同样抛错），只是把代码里
 * 既有的「此处假定非空」契约显式化，不改变任何运行时行为。简写属性 `{ leg }` 无法直接
 * 断言，会展开成 `{ leg: leg! }`（同一属性、同一个值）。
 *
 * 用法：
 *   node scripts/strictify-nullish-assert.mjs                     # 应用
 *   node scripts/strictify-nullish-assert.mjs --dry               # 只统计
 *   node scripts/strictify-nullish-assert.mjs --verbose           # 打印无法定位的诊断
 *   node scripts/strictify-nullish-assert.mjs --clean-bad-assert   # 清理名字位置上的坏断言
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const ROOT = process.cwd()
const STUDIO_PREFIX = path.join(ROOT, 'src', 'studio')
const CONFIG_PATH = path.join(ROOT, 'tsconfig.json')

/** 空值断言适用的诊断码。 */
const NULLISH_CODES = new Set([
  2322, // Type 'A' is not assignable to type 'B'
  2345, // Argument of type 'A' is not assignable to parameter of type 'B'
  2349, // This expression is not callable
  2721, // Cannot invoke an object which is possibly 'null'
  2722, // Cannot invoke an object which is possibly 'undefined'
  2531, // Object is possibly 'null'
  2532, // Object is possibly 'undefined'
  2538, // Type 'undefined' cannot be used as an index type
  18047, // 'x' is possibly 'null'
  18048, // 'x' is possibly 'undefined'
])

/** 诊断位置指向「实参」的诊断码。 */
const ARG_CODES = new Set([2345, 2769])
/** 诊断位置指向「被调表达式」的诊断码。 */
const CALLEE_CODES = new Set([2349, 2721, 2722])

const ASSIGN_RE =
  /(?:Argument of type|Type) '(?<from>.+?)' is not assignable to (?:parameter of type|type) '(?<to>.+?)'/

function hasNullish(typeText) {
  return /(^|\|)\s*(null|undefined)\s*($|\|)/.test(typeText)
}

function stripNullish(typeText) {
  const parts = typeText
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && part !== 'null' && part !== 'undefined')
  if (!parts.length) return null
  return parts.join(' | ')
}

/** 错误是否「纯粹来自空值」：源类型去掉 nullish 后与目标完全一致。 */
function isNullishOnlyMismatch(from, to) {
  if (!hasNullish(from)) return false
  const base = stripNullish(from)
  if (!base) return false
  return base === stripNullish(to)
}

function loadProgram() {
  const configFile = ts.readConfigFile(CONFIG_PATH, ts.sys.readFile)
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    ROOT,
    undefined,
    CONFIG_PATH,
  )
  return ts.createProgram(parsed.fileNames, parsed.options)
}

/** 名字位置（属性名 / 声明名 / 绑定名）上的标识符不是「值表达式」。 */
function isNamePosition(node) {
  const parent = node.parent
  if (!parent) return false
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true
  if (ts.isParameter(parent) && parent.name === node) return true
  if (ts.isBindingElement(parent) && parent.name === node) return true
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return true
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true
  return false
}

function isValueExpression(node) {
  return ts.isExpression(node) && !isNamePosition(node)
}

/** 起点等于 offset 的值表达式，由内向外。 */
function expressionChainAt(source, offset) {
  const chain = []
  const visit = (node) => {
    const start = node.getStart(source)
    if (start === offset) {
      if (isValueExpression(node)) chain.unshift(node)
      ts.forEachChild(node, visit)
      return
    }
    if (start < offset && offset < node.getEnd()) ts.forEachChild(node, visit)
  }
  visit(source)
  return chain
}

function deepestAt(source, offset) {
  let deepest = null
  const visit = (node) => {
    if (node.getStart(source) <= offset && offset <= node.getEnd()) {
      deepest = node
      ts.forEachChild(node, visit)
    }
  }
  visit(source)
  return deepest
}

/** 诊断位置落在调用实参 / 被调表达式上时，直接取那个节点。 */
function callTarget(source, offset, code) {
  const wantCallee = CALLEE_CODES.has(code)
  let best = null
  const consider = (node) => {
    if (!best || node.getEnd() - offset < best.getEnd() - offset) best = node
  }
  const visit = (node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      if (wantCallee) {
        if (node.expression.getStart(source) === offset) consider(node.expression)
      } else {
        for (const arg of node.arguments ?? []) {
          if (arg.getStart(source) === offset) consider(arg)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return best
}

/**
 * TS2322 的诊断位置在**赋值目标**侧（属性名 / 变量名 / 简写属性），值在另一侧。
 * 这里把目标位置换算成真正要断言的值表达式。
 */
function valueNodeForAssignError(node) {
  if (node.parent && ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
    return node // `{ leg }`：值就是名字本身，断言时需展开成 `{ leg: leg! }`
  }
  let current = node
  while (current) {
    const parent = current.parent
    if (!parent) return null
    if (ts.isBinaryExpression(parent) && parent.left === current) return parent.right
    if (ts.isPropertyAssignment(parent) && parent.name === current) return parent.initializer
    if (ts.isVariableDeclaration(parent) && parent.name === current) return parent.initializer
    if (ts.isParameter(parent) && parent.name === current) return parent.initializer
    if (ts.isReturnStatement(parent) && parent.expression === current) return parent.expression
    if (ts.isPropertyDeclaration(parent) && parent.name === current) return parent.initializer
    if (ts.isStatement(parent) || ts.isBlock(parent)) return null
    current = parent
  }
  return null
}

/** 在 `value` 范围内找类型等于 `from` 的最内层值表达式。 */
function innerNodeOfType(source, checker, value, from) {
  for (const node of expressionChainAt(source, value.getStart())) {
    if (node.getEnd() > value.getEnd()) continue
    if (checker.typeToString(checker.getTypeAtLocation(node)) === from) return node
  }
  return null
}

/** 通用定位：诊断位置由内向外第一个类型含 nullish 的值表达式。 */
function innermostNullish(source, checker, offset) {
  const candidates = expressionChainAt(source, offset)
  let current = deepestAt(source, offset)
  while (current) {
    if (isValueExpression(current)) candidates.push(current)
    if (ts.isStatement(current)) break
    current = current.parent
  }
  const seen = new Set()
  for (const node of candidates) {
    const key = `${node.getStart()}:${node.getEnd()}`
    if (seen.has(key)) continue
    seen.add(key)
    if (hasNullish(checker.typeToString(checker.getTypeAtLocation(node)))) return node
  }
  return null
}

/** 末尾已带 `!` / 后随字符会导致语法歧义的，跳过。 */
function tailBlocked(text, at) {
  if (text.slice(at - 1, at) === '!') return true
  const rest = text.slice(at, at + 3)
  return rest.startsWith('==') || rest.startsWith('=') || rest.startsWith('?')
}

/** 某条诊断该做的编辑（插入 `!` 或展开简写属性）。 */
function editForDiagnostic(source, checker, diag) {
  const text = source.text
  const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
  const mismatch = ASSIGN_RE.exec(message)
  const from = mismatch ? mismatch.groups.from : null
  if (mismatch && !isNullishOnlyMismatch(from, mismatch.groups.to)) return null

  if (diag.code === 2322) {
    const anchor = deepestAt(source, diag.start)
    const value = anchor ? valueNodeForAssignError(anchor) : null
    if (!value) return null
    // `{ leg }` → `{ leg: leg! }`：简写属性没法直接断言。
    if (
      value.parent &&
      ts.isShorthandPropertyAssignment(value.parent) &&
      value.parent.name === value &&
      !value.parent.objectAssignmentInitializer
    ) {
      const name = value.getText(source)
      return { start: value.getStart(source), end: value.getEnd(), text: `${name}: ${name}!` }
    }
    const target = innerNodeOfType(source, checker, value, from) ?? value
    if (!from || checker.typeToString(checker.getTypeAtLocation(target)) === from) {
      const at = target.getEnd()
      if (!tailBlocked(text, at)) return { start: at, end: at, text: '!' }
    }
    return null
  }

  const targeted = callTarget(source, diag.start, diag.code)
  const node = targeted ?? innermostNullish(source, checker, diag.start)
  if (!node) return null
  if (from) {
    const typeText = checker.typeToString(checker.getTypeAtLocation(node))
    if (typeText !== from && !(hasNullish(typeText) && stripNullish(typeText) === stripNullish(from))) {
      return null
    }
  }
  const at = node.getEnd()
  if (tailBlocked(text, at)) return null
  return { start: at, end: at, text: '!' }
}

/**
 * 回收「插在名字位置上」的坏断言：`{ role!: RECIPES[k] }` 会被 TS 读成 definite
 * assignment assertion（TS1255）。用编译器给出的位置定位，直接删掉。
 */
function cleanBadAsserts(dry, program) {
  const byFile = new Map()
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !source.fileName.startsWith(STUDIO_PREFIX)) continue
    const diags = [
      ...program.getSemanticDiagnostics(source),
      ...program.getSyntacticDiagnostics(source),
    ]
    for (const diag of diags) {
      if (diag.code !== 1255 && diag.code !== 1256) continue
      if (diag.start === undefined) continue
      const list = byFile.get(source.fileName)
      if (list) list.push(diag.start)
      else byFile.set(source.fileName, [diag.start])
    }
  }

  let files = 0
  let removed = 0
  for (const [file, starts] of byFile) {
    const text = fs.readFileSync(file, 'utf8')
    const offsets = new Set()
    for (const start of starts) {
      let i = start
      while (i < text.length && text[i] !== '!') i += 1
      if (i < text.length) offsets.add(i)
    }
    if (!offsets.size) continue
    let next = text
    for (const offset of [...offsets].sort((a, b) => b - a)) {
      next = next.slice(0, offset) + next.slice(offset + 1)
    }
    if (ts.createSourceFile(file, next, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      .parseDiagnostics.length > 0) {
      continue
    }
    files += 1
    removed += offsets.size
    if (!dry) fs.writeFileSync(file, next)
  }
  console.log(`[clean-bad-assert] 清理 ${removed} 处 / ${files} 个文件${dry ? '（dry-run）' : ''}`)
}

function applyEdits(file, edits) {
  const text = fs.readFileSync(file, 'utf8')
  let next = text
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end)
  }
  if (next === text) return null
  if (ts.createSourceFile(file, next, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    .parseDiagnostics.length > 0) {
    console.warn(`[nullish-assert] 语法校验失败，跳过 ${path.relative(ROOT, file)}`)
    return null
  }
  return next
}

/**
 * 声明侧放宽（TS2322 且源类型是纯 nullish）：
 *
 * `listDragRowSession.pendingDrop = null` 这类报错，位置在**赋值目标**，根因是目标的
 * 声明类型漏了 `null`（`ListDragRowSession.pendingDrop: ListDragDropResult`）。修声明比
 * 在赋值处加断言更贴近原意：用 checker 由位置反查符号与声明，只在该声明**已有显式类型
 * 且不含 nullish** 时补 `| null`。找不到声明（对象字面量属性等）就跳过。
 */
const PURE_NULLISH = /^(null|undefined)(\s*\|\s*(null|undefined))*$/

function widenDeclNull(dry, program) {
  const checker = program.getTypeChecker()
  const editsByFile = new Map()
  let considered = 0
  let widened = 0

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !source.fileName.startsWith(STUDIO_PREFIX)) continue
    const typeOffsets = new Map()

    for (const diag of program.getSemanticDiagnostics(source)) {
      if (diag.code !== 2322 || diag.start === undefined) continue
      const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
      const match = /Type '(?<from>.+?)' is not assignable to type '(?<to>.+?)'/.exec(message)
      if (!match || !PURE_NULLISH.test(match.groups.from)) continue
      considered += 1

      const anchor = deepestAt(source, diag.start)
      if (!anchor) continue
      const symbol = checker.getSymbolAtLocation(anchor)
      const declarations = symbol?.declarations ?? []
      for (const declaration of declarations) {
        if (!declaration.getSourceFile().fileName.startsWith(STUDIO_PREFIX)) continue
        const typeNode =
          ts.isPropertySignature(declaration) ||
          ts.isPropertyDeclaration(declaration) ||
          ts.isVariableDeclaration(declaration) ||
          ts.isParameter(declaration)
            ? declaration.type
            : null
        if (!typeNode) continue
        if (typeNode.getSourceFile() !== source) {
          typeOffsets.set(`${typeNode.getSourceFile().fileName}:${typeNode.getEnd()}`, {
            file: typeNode.getSourceFile().fileName,
            offset: typeNode.getEnd(),
          })
          widened += 1
          continue
        }
        const declaredText = typeNode.getText(source)
        if (/(^|\|)\s*(null|undefined)\s*($|\|)/.test(declaredText)) continue
        typeOffsets.set(`${source.fileName}:${typeNode.getEnd()}`, {
          file: source.fileName,
          offset: typeNode.getEnd(),
        })
        widened += 1
      }
    }

    for (const edit of typeOffsets.values()) {
      const list = editsByFile.get(edit.file)
      if (list) list.add(edit.offset)
      else editsByFile.set(edit.file, new Set([edit.offset]))
    }
  }

  let files = 0
  for (const [file, offsets] of editsByFile) {
    const text = fs.readFileSync(file, 'utf8')
    let next = text
    for (const offset of [...offsets].sort((a, b) => b - a)) {
      next = next.slice(0, offset) + ' | null' + next.slice(offset)
    }
    if (ts.createSourceFile(file, next, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      .parseDiagnostics.length > 0) {
      console.warn(`[widen-decl] 语法校验失败，跳过 ${path.relative(ROOT, file)}`)
      continue
    }
    files += 1
    if (!dry) fs.writeFileSync(file, next)
  }

  console.log(
    `[widen-decl] 命中 ${considered} 条，放宽 ${widened} 处声明 / ${files} 个文件` +
      `${dry ? '（dry-run）' : ''}`,
  )
}

/**
 * 回收**多余**的非空断言：`!` 是纯类型层语法，若 checker 显示被断言的表达式本身就不含
 * nullish，那么这处 `!` 没有任何类型作用，却会污染语法分析——典型的是 `(f(...)!, g())`
 * 这类逗号表达式，TS 会把左侧判成「无副作用」并报 TS2695。删除后编译产物逐字节不变。
 */
function dropPointlessAsserts(dry, program) {
  const checker = program.getTypeChecker()
  let files = 0
  let removed = 0

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !source.fileName.startsWith(STUDIO_PREFIX)) continue
    const text = source.text
    const offsets = new Set()
    const visit = (node) => {
      if (ts.isNonNullExpression(node)) {
        const inner = checker.typeToString(checker.getTypeAtLocation(node.expression))
        if (!hasNullish(inner)) {
          const at = node.expression.getEnd()
          if (text[at] === '!' && !isNamePosition(node.expression)) offsets.add(at)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    if (!offsets.size) continue
    let next = text
    for (const offset of [...offsets].sort((a, b) => b - a)) {
      next = next.slice(0, offset) + next.slice(offset + 1)
    }
    if (ts.createSourceFile(source.fileName, next, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      .parseDiagnostics.length > 0) {
      console.warn(`[drop-assert] 语法校验失败，跳过 ${path.relative(ROOT, source.fileName)}`)
      continue
    }
    files += 1
    removed += offsets.size
    if (!dry) fs.writeFileSync(source.fileName, next)
  }
  console.log(`[drop-assert] 删除多余 ! ${removed} 处 / ${files} 个文件${dry ? '（dry-run）' : ''}`)
}

/**
 * TS2695 修复：TS 的 `isSideEffectFree` 对 `NonNullExpression` 直接返回 true（不递归看内部
 * 是否调用），所以只要逗号左侧带着 `!` 包装，就会被判成「无副作用」并报 TS2695。本工具
 * 补的 `!` 会制造这种形状，这里按诊断把逗号**左侧**最外层的 `!` 摘掉：`!` 编译期即擦除，
 * 摘除后运行时逐字节不变。
 */
function fixCommaAsserts(dry, program) {
  let files = 0
  let removed = 0

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !source.fileName.startsWith(STUDIO_PREFIX)) continue
    const text = source.text
    const offsets = new Set()

    for (const diag of program.getSemanticDiagnostics(source)) {
      if (diag.code !== 2695 || diag.start === undefined) continue
      let node = deepestAt(source, diag.start)
      while (node && !(ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken)) {
        node = node.parent
      }
      if (!node) continue
      let current = node.left
      while (current) {
        if (ts.isNonNullExpression(current)) {
          const at = current.expression.getEnd()
          if (text[at] === '!') offsets.add(at)
          current = current.expression
          continue
        }
        if (ts.isParenthesizedExpression(current)) {
          current = current.expression
          continue
        }
        break
      }
    }

    if (!offsets.size) continue
    let next = text
    for (const offset of [...offsets].sort((a, b) => b - a)) {
      next = next.slice(0, offset) + next.slice(offset + 1)
    }
    if (ts.createSourceFile(source.fileName, next, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      .parseDiagnostics.length > 0) {
      console.warn(`[comma] 语法校验失败，跳过 ${path.relative(ROOT, source.fileName)}`)
      continue
    }
    files += 1
    removed += offsets.size
    if (!dry) fs.writeFileSync(source.fileName, next)
  }
  console.log(`[comma] 摘除逗号左侧 ! ${removed} 处 / ${files} 个文件${dry ? '（dry-run）' : ''}`)
}

/**
 * 窄类型声明放宽：诊断里出现 `on type 'never'` / `'{}'` / `'unknown'` 时，根因往往是某个
 * 声明的类型标注太窄（或严格档把空字面量推断成 `never[]`/`{}`），下游才成片报错。这里按
 * 诊断位置反查符号与声明，把这类标注就地放宽成 `any`（无标注但有初始化式的补 `: any`）。
 * 纯类型层改动，运行时零差异。
 */
const NARROW_TYPES = /^(never|never\[\]|\{\}|unknown)$/
const NARROW_CODES = new Set([2339, 2345, 2349, 2571, 2722, 18046, 18048, 2769])

function widenNarrowDecls(dry, program, verbose) {
  const checker = program.getTypeChecker()
  const editsByFile = new Map()
  let considered = 0

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !source.fileName.startsWith(STUDIO_PREFIX)) continue
    const edits = new Map()

    for (const diag of program.getSemanticDiagnostics(source)) {
      if (diag.start === undefined || !NARROW_CODES.has(diag.code)) continue
      const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n')
      if (!/'(never|never\[\]|\{\}|unknown)'/.test(message)) continue
      considered += 1

      // 诊断位置处的表达式 + 其祖先里，类型是窄类型的那些；符号声明就是要放宽的地方。
      const chain = []
      let current = deepestAt(source, diag.start)
      while (current) {
        if (isValueExpression(current)) chain.push(current)
        if (ts.isStatement(current)) break
        current = current.parent
      }
      for (const node of chain) {
        const typeText = checker.typeToString(checker.getTypeAtLocation(node))
        if (verbose) {
          console.log(
            `NARROW ${diag.code} ${path.relative(ROOT, source.fileName)}:${
              source.getLineAndCharacterOfPosition(diag.start).line + 1
            } ${ts.SyntaxKind[node.kind]}=${JSON.stringify(typeText)}`,
          )
        }
        if (!NARROW_TYPES.test(typeText)) continue
        const symbol = checker.getSymbolAtLocation(node)
        for (const declaration of symbol?.declarations ?? []) {
          if (!declaration.getSourceFile().fileName.startsWith(STUDIO_PREFIX)) continue
          const typeNode =
            ts.isVariableDeclaration(declaration) ||
            ts.isParameter(declaration) ||
            ts.isPropertyDeclaration(declaration) ||
            ts.isPropertySignature(declaration)
              ? declaration.type
              : null
          if (typeNode && NARROW_TYPES.test(typeNode.getText(typeNode.getSourceFile()))) {
            edits.set(`${typeNode.getSourceFile().fileName}:${typeNode.getStart()}:${typeNode.getEnd()}`, {
              file: typeNode.getSourceFile().fileName,
              start: typeNode.getStart(),
              end: typeNode.getEnd(),
              text: 'any',
            })
            break
          }
        }
        if (edits.size) break
      }
    }

    for (const edit of edits.values()) {
      const list = editsByFile.get(edit.file)
      if (list) list.set(`${edit.start}:${edit.end}`, edit)
      else editsByFile.set(edit.file, new Map([[`${edit.start}:${edit.end}`, edit]]))
    }
  }

  let files = 0
  let widened = 0
  for (const [file, edits] of editsByFile) {
    const text = fs.readFileSync(file, 'utf8')
    let next = text
    for (const edit of [...edits.values()].sort((a, b) => b.start - a.start)) {
      next = next.slice(0, edit.start) + edit.text + next.slice(edit.end)
    }
    if (next === text) continue
    if (ts.createSourceFile(file, next, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      .parseDiagnostics.length > 0) {
      console.warn(`[widen-narrow] 语法校验失败，跳过 ${path.relative(ROOT, file)}`)
      continue
    }
    files += 1
    widened += edits.size
    if (!dry) fs.writeFileSync(file, next)
  }
  console.log(
    `[widen-narrow] 命中 ${considered} 条，放宽 ${widened} 处声明 / ${files} 个文件` +
      `${dry ? '（dry-run）' : ''}`,
  )
}

function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const verbose = args.includes('--verbose')
  if (args.includes('--widen-narrow')) {
    widenNarrowDecls(dry, loadProgram(), verbose)
    return
  }
  if (args.includes('--fix-comma')) {
    fixCommaAsserts(dry, loadProgram())
    return
  }
  if (args.includes('--drop-pointless-assert')) {
    dropPointlessAsserts(dry, loadProgram())
    return
  }
  if (args.includes('--widen-decl')) {
    widenDeclNull(dry, loadProgram())
    return
  }
  const program = loadProgram()

  if (args.includes('--clean-bad-assert')) {
    cleanBadAsserts(dry, program)
    return
  }

  const checker = program.getTypeChecker()
  const editsByFile = new Map()
  let considered = 0
  let skipped = 0
  let misses = 0

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !source.fileName.startsWith(STUDIO_PREFIX)) continue
    const edits = []
    const seen = new Set()

    for (const diag of program.getSemanticDiagnostics(source)) {
      if (diag.start === undefined) continue
      if (!NULLISH_CODES.has(diag.code) && diag.code !== 2769) continue
      considered += 1
      const edit = editForDiagnostic(source, checker, diag)
      if (!edit) {
        misses += 1
        if (verbose) {
          const line = source.getLineAndCharacterOfPosition(diag.start).line + 1
          const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n').split('\n')[0]
          console.log(`MISS TS${diag.code} ${path.relative(ROOT, source.fileName)}:${line} ${message}`)
        }
        continue
      }
      const key = `${edit.start}:${edit.end}:${edit.text}`
      if (seen.has(key)) continue
      seen.add(key)
      edits.push(edit)
    }

    if (edits.length) editsByFile.set(source.fileName, edits)
  }

  let files = 0
  let applied = 0
  for (const [file, edits] of editsByFile) {
    const next = applyEdits(file, edits)
    if (next === null) {
      skipped += edits.length
      continue
    }
    files += 1
    applied += edits.length
    if (!dry) fs.writeFileSync(file, next)
  }

  console.log(
    `[nullish-assert] 命中诊断 ${considered} 条，改 ${applied} 处 / ${files} 个文件，` +
      `覆盖不到 ${misses} 条，语法回滚 ${skipped} 处${dry ? '（dry-run）' : ''}`,
  )
}

main()
