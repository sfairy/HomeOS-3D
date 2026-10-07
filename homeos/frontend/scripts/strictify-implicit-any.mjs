/**
 * 迁移工具：把并入的 3D Studio 遗留代码（原 `tsconfig.studio.json`，strict:false）
 * 提升到严格档。阶段 3.2 合并 tsconfig 后，遗留代码里约 1.2 万处「隐式 any」
 * （TS7006/7005/7034/7031/7019/7022/7023/7010/7011）会阻塞整仓类型检查。
 *
 * 本脚本读取 `vue-tsc --noEmit` 的**文本诊断**（因此 .vue 也天然支持），再用
 * TypeScript 编译器 API 解析对应 `.ts` 文件，按 AST 定位真正该标注的节点，插入
 * 显式类型标注：
 *
 * | 诊断 | 语义 | 处理 |
 * | --- | --- | --- |
 * | TS7006 | 参数隐式 any | 参数名/解构模式后补 `: any`（单参箭头函数先补括号） |
 * | TS7019 | rest 参数隐式 any[] | 补 `: any[]` |
 * | TS7031 | 解构绑定元素隐式 any | 在外层参数/声明符的模式后补 `: any` |
 * | TS7005 / TS7034 / TS7022 | 变量隐式 any | 变量名（或解构模式）后补 `: any`，仅限 var/let/const 声明与 catch |
 * | TS7023 / TS7010 / TS7011 | 函数隐式返回 any | 参数列表 `)` 后补 `: any` |
 *
 * 为什么是「补显式 any」而不是逐个人工定型：这批代码是整体并入的命令式 3D 运行时，
 * 上万处人工定型不现实；先让严格档全绿（可编译、可增量收紧），再按需把这些显式
 * `any` 收窄为真实类型。脚本只插入类型标注，不改任何运行时语句。
 *
 * 安全性：每改一个文件都会用 TS 重新解析，**只要出现任何语法诊断就整文件回滚**，
 * 因此不会把代码改成编译不过的状态。无法安全自动修的位置一律跳过并计入统计。
 *
 * 用法：
 *   node scripts/run-vue-tsc.mjs -p tsconfig.json --noEmit > /tmp/errors.txt
 *   node scripts/strictify-implicit-any.mjs /tmp/errors.txt [--dry]
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

/** 由本脚本处理（= 可通过插入类型标注修掉）的诊断码。 */
const FIXABLE_CODES = new Set([
  7006, // Parameter 'x' implicitly has an 'any' type.
  7005, // Variable 'x' implicitly has an 'any' type in some locations.
  7034, // Variable 'x' implicitly has type 'any' in some locations.
  7031, // Binding element 'x' implicitly has an 'any' type.
  7019, // Rest parameter 'x' implicitly has an 'any[]' type.
  7022, // 'x' implicitly has type 'any' because it is referenced in its own initializer.
  7023, // 'x' implicitly has return type 'any'.
  7010, // 'x', which lacks return-type annotation, implicitly has an 'any[]' return type.
  7011, // 'x', which lacks return-type annotation, implicitly has an 'any' type.
])

const DIAG_RE = /^(?<file>.+?)\((?<line>\d+),(?<col>\d+)\): error TS(?<code>\d+):/

/** 从诊断文本里抽出被标注的名字（`Parameter 'x'` / `Binding element 'x'` / `'x' implicitly ...`）。 */
function nameFromMessage(message) {
  const quoted = /'([^']+)'/.exec(message)
  return quoted ? quoted[1] : null
}

function parseDiagnostics(text) {
  const byFile = new Map()
  for (const rawLine of text.split('\n')) {
    const match = DIAG_RE.exec(rawLine.trim())
    if (!match) continue
    const code = Number(match.groups.code)
    if (!FIXABLE_CODES.has(code)) continue
    const file = match.groups.file
    if (!file.endsWith('.ts')) continue
    const entry = {
      line: Number(match.groups.line),
      col: Number(match.groups.col),
      code,
      name: nameFromMessage(rawLine),
    }
    const list = byFile.get(file)
    if (list) list.push(entry)
    else byFile.set(file, [entry])
  }
  return byFile
}

function lineStartsOf(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1)
  }
  return starts
}

/** 找到「起点等于 offset」或「包含 offset」的最深节点。 */
function nodeAt(sf, offset) {
  let found = null
  const consider = (node) => {
    if (found && node.getWidth(sf) > found.getWidth(sf)) return
    found = node
  }
  const visit = (node) => {
    const start = node.getStart(sf)
    if (start === offset) {
      consider(node)
      ts.forEachChild(node, visit)
      return
    }
    if (start < offset && offset < node.getEnd()) {
      consider(node)
      ts.forEachChild(node, visit)
    }
  }
  ts.forEachChild(sf, visit)
  return found
}

/**
 * 兜底定位：在 `offset` 之后（同/邻近行内）找第一个文本等于 `name` 的标识符。
 *
 * 用于个别诊断的列号指向括号/逗号等符号、直接按起点取节点取不到目标的情况。
 */
function identifierNear(sf, offset, name) {
  if (!name) return null
  let found = null
  const visit = (node) => {
    if (found) return
    const start = node.getStart(sf)
    if (start > offset + 200) return
    if (
      ts.isIdentifier(node) &&
      node.text === name &&
      start >= offset - 2 &&
      start <= offset + 200
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
  return found
}

function findAncestor(node, predicate) {
  let current = node
  while (current) {
    if (predicate(current)) return current
    current = current.parent
  }
  return null
}

const isPattern = (node) =>
  Boolean(node) && (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node))

/** 该节点是否是「单参且没写括号」的箭头函数参数（补类型标注前必须补括号）。 */
function isBareArrowParam(param, text) {
  const fn = param.parent
  if (!fn || !ts.isArrowFunction(fn)) return false
  if (fn.parameters.length !== 1) return false
  // 参数前一个非空白字符不是 '(' → 无括号形式
  let i = param.getStart() - 1
  while (i >= 0 && /\s/.test(text[i])) i -= 1
  return text[i] !== '('
}

/**
 * 给「参数 / 变量声明 / catch 变量」这类具名目标补类型标注。
 *
 * @param target 需要标注的 name/pattern 节点
 * @param owner 承载它的 Parameter / VariableDeclaration
 * @param typeText 要补的标注文本（如 `: any`）
 * @returns {Array<{offset:number,text:string}>}
 */
function annotateNamed(target, owner, typeText) {
  const edits = [{ offset: target.getEnd(), text: typeText }]
  if (ts.isParameter(owner) && isBareArrowParam(owner, owner.getSourceFile().text)) {
    edits.push({ offset: owner.getEnd(), text: ')' })
    edits.push({ offset: owner.getStart(), text: '(' })
  }
  return edits
}

/** 计算某个诊断该插入的编辑；返回 null 表示「不在本脚本能安全处理的范围内」。 */
function editsFor(sf, node, code) {
  if (!node) return null
  const text = sf.text

  if (code === 7019) {
    const param = ts.isParameter(node) ? node : findAncestor(node, ts.isParameter)
    if (!param || param.type) return null
    const target = param.name
    if (ts.isIdentifier(target)) return annotateNamed(target, param, ': any[]')
    if (isPattern(target)) return annotateNamed(target, param, ': any[]')
    return null
  }

  if (code === 7006) {
    const param = ts.isParameter(node) ? node : findAncestor(node, ts.isParameter)
    if (!param || param.type) return null
    if (ts.isIdentifier(param.name) || isPattern(param.name)) {
      return annotateNamed(param.name, param, ': any')
    }
    return null
  }

  if (code === 7031) {
    const element = findAncestor(node, ts.isBindingElement) ?? node
    // 嵌套解构（如 `{ a: { b } }`）要一路走到最外层模式再标注。
    let pattern = findAncestor(element, isPattern)
    while (pattern && pattern.parent && ts.isBindingElement(pattern.parent)) {
      pattern = findAncestor(pattern.parent, isPattern)
    }
    if (!pattern) return null
    const owner = pattern.parent
    if (ts.isParameter(owner)) {
      if (owner.type) return null
      return annotateNamed(pattern, owner, ': any')
    }
    if (ts.isVariableDeclaration(owner)) {
      if (owner.type) return null
      return annotateNamed(pattern, owner, ': any')
    }
    return null
  }

  if (code === 7005 || code === 7034 || code === 7022) {
    const ident = ts.isIdentifier(node) ? node : findAncestor(node, ts.isIdentifier)
    if (!ident) return null
    const decl = findAncestor(ident, ts.isVariableDeclaration)
    if (decl && (decl.name === ident || isPattern(decl.name))) {
      if (decl.type) return null
      // 解构声明的隐式 any 由 TS7031 负责，避免双重标注。
      if (isPattern(decl.name) && !ts.isIdentifier(decl.name)) {
        return annotateNamed(decl.name, decl, ': any')
      }
      if (ts.isIdentifier(decl.name)) return annotateNamed(decl.name, decl, ': any')
      return null
    }
    const catchClause = findAncestor(ident, ts.isCatchClause)
    if (catchClause?.variableDeclaration && !catchClause.variableDeclaration.type) {
      const variable = catchClause.variableDeclaration
      const target = variable.name
      if (ts.isIdentifier(target) || isPattern(target)) {
        return [{ offset: target.getEnd(), text: ': any' }]
      }
    }
    return null
  }

  if (code === 7023 || code === 7010 || code === 7011) {
    const fn = findAncestor(
      node,
      (n) => ts.isFunctionLike(n) || ts.isMethodDeclaration(n) || ts.isGetAccessor(n),
    )
    if (!fn || fn.type) return null
    const modifiers = fn.modifiers ?? []
    const isAsync = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
    const returnType = isAsync ? ': Promise<any>' : ': any'
    if (fn.asteriskToken) {
      // 生成器需要 Generator<T>，不在本脚本自动处理范围。
      return null
    }
    const params = fn.parameters ?? []
    const arrowToken = ts.isArrowFunction(fn) ? fn.equalsGreaterThanToken : null
    if (arrowToken && params.length === 1 && isBareArrowParam(params[0], text)) {
      // `x => ...`：必须补括号才能写返回类型标注，标注插在 `=>` 之前。
      const param = params[0]
      return [
        { offset: arrowToken.getStart(), text: `${returnType} ` },
        { offset: param.getEnd(), text: ')' },
        { offset: param.getStart(), text: '(' },
      ]
    }
    let i = params.length ? params[params.length - 1].getEnd() : fn.getStart()
    while (i < text.length && text[i] !== ')') i += 1
    if (i >= text.length) return null
    return [{ offset: i + 1, text: returnType }]
  }

  return null
}

function main() {
  const [, , diagPath, ...flags] = process.argv
  if (!diagPath) {
    console.error('用法: node scripts/strictify-implicit-any.mjs <diagnostics.txt> [--dry]')
    process.exit(1)
  }
  const dry = flags.includes('--dry')
  const byFile = parseDiagnostics(fs.readFileSync(diagPath, 'utf8'))

  let touched = 0
  let inserted = 0
  let skipped = 0
  let reverted = 0
  const perCode = new Map()

  for (const [file, diags] of byFile) {
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const starts = lineStartsOf(text)

    /** key = `offset:text`，天然去重。 */
    const edits = new Map()
    for (const diag of diags) {
      const lineStart = starts[diag.line - 1]
      if (lineStart === undefined) {
        skipped += 1
        continue
      }
      const offset = lineStart + (diag.col - 1)
      let node = nodeAt(sf, offset)
      if (!node || (!ts.isParameter(node) && !ts.isIdentifier(node) && !ts.isBindingElement(node))) {
        const fallback = identifierNear(sf, offset, diag.name)
        if (fallback) node = fallback
      }
      const list = editsFor(sf, node, diag.code)
      if (!list) {
        skipped += 1
        continue
      }
      let added = false
      for (const edit of list) {
        const key = `${edit.offset}:${edit.text}`
        if (!edits.has(key)) {
          edits.set(key, edit)
          added = true
        }
      }
      if (added) perCode.set(diag.code, (perCode.get(diag.code) ?? 0) + 1)
    }
    if (!edits.size) continue

    // 从后往前插入，保证偏移不失效。
    const ordered = [...edits.values()].sort((a, b) => b.offset - a.offset)
    let next = text
    let applied = 0
    for (const edit of ordered) {
      const tail = next.slice(edit.offset, edit.offset + 2)
      if (tail === ': ' || tail === '?:') continue
      next = next.slice(0, edit.offset) + edit.text + next.slice(edit.offset)
      applied += 1
    }
    if (!applied || next === text) continue

    // 自校验：改完必须仍能被 TS 无语法错误地解析，否则整文件回滚。
    const check = ts.createSourceFile(file, next, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    if (check.parseDiagnostics.length > 0) {
      reverted += 1
      skipped += applied
      console.warn(
        `[strictify] 语法校验失败，回滚：${path.relative(process.cwd(), file)} ` +
          `(${check.parseDiagnostics[0].messageText})`,
      )
      continue
    }

    touched += 1
    inserted += applied
    if (!dry) fs.writeFileSync(file, next)
  }

  const codeSummary = [...perCode.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `TS${code}=${n}`)
    .join(' ')
  console.log(
    `[strictify] 文件 ${touched} 个，插入标注 ${inserted} 处，跳过 ${skipped} 处，` +
      `语法回滚 ${reverted} 个文件${dry ? '（dry-run）' : ''}`,
  )
  if (codeSummary) console.log(`[strictify] 按诊断码：${codeSummary}`)
}

main()
