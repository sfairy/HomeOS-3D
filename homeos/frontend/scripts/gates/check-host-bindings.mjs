#!/usr/bin/env node
/**
 * 宿主薄绑定的裸值传递门禁：拦住「函数被当裸值交出」+「该函数多一个 deps 首参」的叠加。
 *
 * deps 袋 core 若以原名被宿主裸值传递（简写属性 / 属性值 / 实参），deps 形参会顶掉调用方的第一个实参。
 * 判据跨文件：相对 import 进来的绑定 X 在导入处有裸值引用，且 X 定义模块首参是 deps/ctx/context → 报错。
 * 正解：保留原签名的宿主薄绑定，或该调用点显式传 deps。
 *
 * 扫到 0 个文件 / 解析不到定义文件视为门禁失效（退出码 2）；豁免须写 why 且必须真被命中。
 * 用法：``node scripts/check-host-bindings.mjs``
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const STUDIO_ROOT = path.join(FRONTEND_ROOT, 'src/studio')

/** 依赖袋形参名（仓库约定：切片 core 的第一参数就是它）。 */
export const DEPS_PARAM = /^(deps|ctx|context)$/i

/**
 * 路径别名从 `tsconfig.json` 读（`@/*` / `@app/*` / `@runtime/*`）—— 硬编码会随 tsconfig 漂移，
 * 而 `export * from "@/studio/..."` 这类转发正是「只跟相对路径就解不出形态」的原因之一。
 */
const TSCONFIG = path.join(FRONTEND_ROOT, 'tsconfig.json')
const tsconfigRead = ts.readConfigFile(TSCONFIG, ts.sys.readFile)
if (tsconfigRead.error) {
  throw new Error(`读不到 ${TSCONFIG}：${ts.flattenDiagnosticMessageText(tsconfigRead.error.messageText, ' ')}`)
}
export const ALIAS_PATHS = ts.parseJsonConfigFileContent(tsconfigRead.config, ts.sys, FRONTEND_ROOT).options.paths ?? {}

/**
 * 豁免表：`"<相对 root 的导入文件>:<绑定名>" -> why`。
 * 每条都必须在本轮被命中，否则报「过期豁免」。
 */
export const ALLOWED = new Map([])

/** 门禁自身失效时抛这个（退出码 2，与「有违规」区分开）。 */
export class HostBindingGateError extends Error {}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile() && entry.name.endsWith('.ts')) yield full
  }
}

const parseCache = new Map()
export function parse(file) {
  if (!parseCache.has(file)) {
    parseCache.set(file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS))
  }
  return parseCache.get(file)
}

/** specifier → 磁盘文件：先相对路径，再 tsconfig 别名；候选带 `.ts` / `.tsx` / `/index.ts`。 */
export function resolveSpecifier(fromFile, specifier) {
  const bases = []
  if (specifier.startsWith('.')) {
    bases.push(path.resolve(path.dirname(fromFile), specifier))
  } else {
    for (const [pattern, targets] of Object.entries(ALIAS_PATHS)) {
      const star = pattern.indexOf('*')
      if (star < 0) {
        if (pattern === specifier) for (const t of targets) bases.push(path.resolve(FRONTEND_ROOT, t))
        continue
      }
      const prefix = pattern.slice(0, star)
      const suffix = pattern.slice(star + 1)
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue
      const middle = specifier.slice(prefix.length, specifier.length - suffix.length)
      for (const t of targets) bases.push(path.resolve(FRONTEND_ROOT, t.replace('*', middle)))
    }
  }
  for (const base of bases) {
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
    }
  }
  return null
}

function paramKindOf(params) {
  const first = params && params[0]
  if (!first) return 'other'
  const name = first.name && ts.isIdentifier(first.name) ? first.name.text : null
  return name && DEPS_PARAM.test(name) ? 'deps' : 'other'
}

/** 一条声明（已确认名字匹配）导出的是哪种东西。 */
function kindForDeclaration(stmt, name) {
  if (ts.isFunctionDeclaration(stmt)) return stmt.name?.text === name ? paramKindOf(stmt.parameters) : null
  if (ts.isClassDeclaration(stmt)) return stmt.name?.text === name ? 'other' : null
  if (ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt)) return stmt.name?.text === name ? 'type' : null
  if (ts.isEnumDeclaration(stmt) || ts.isModuleDeclaration(stmt)) return stmt.name?.text === name ? 'other' : null
  if (ts.isVariableStatement(stmt)) {
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isObjectBindingPattern(decl.name)) {
        // `export const { x } = await import(...)` —— 来自动态 import 的解构导出。
        // 形态静态不可知（可能真是依赖袋 core），所以单列 'dynamic' 并计数，不当作「解析失效」。
        for (const el of decl.name.elements) {
          if (el.name && ts.isIdentifier(el.name) && el.name.text === name) return 'dynamic'
        }
        continue
      }
      if (!ts.isIdentifier(decl.name) || decl.name.text !== name) continue
      const init = decl.initializer
      return init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? paramKindOf(init.parameters) : 'other'
    }
  }
  return null
}

/** 在文件的顶层语句里找 `name` 的声明形态（返回 null 表示本文件没有这个名字的声明）。 */
function findDeclarationKind(sf, name) {
  for (const stmt of sf.statements) {
    const kind = kindForDeclaration(stmt, name)
    if (kind) return kind
  }
  return null
}

/**
 * 顺着**本地声明 → import → export 转发 → `export *`** 找到 `exportedName` 的真实形态。
 * 返回 `'deps' | 'other' | 'type' | 'dynamic'`；解析不到返回 null（调用方按「门禁失效」处理）。
 *
 * 必须跟转发链：兼容 barrel（`export { x } from "./x"`、`export * from "@/studio/..."`）在 P4 里
 * 到处都是，只看本文件会把「导出的是依赖袋 core」这一事实漏掉 —— 那正是这条门禁唯一要抓的东西。
 */
export function resolveExportKind(file, exportedName, depth = 0, seen = new Set()) {
  const key = `${file}#${exportedName}`
  if (!file || seen.has(key) || depth > 8) return null
  seen.add(key)
  const sf = parse(file)
  const imports = new Map()
  const forwards = []
  const stars = []
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const bindings = stmt.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          imports.set(el.name.text, {
            module: stmt.moduleSpecifier.text,
            imported: el.propertyName ? el.propertyName.text : el.name.text,
          })
        }
      }
      continue
    }
    if (ts.isExportDeclaration(stmt)) {
      const from = stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : null
      if (!stmt.exportClause) {
        if (from && !stmt.isTypeOnly) stars.push(from)
        continue
      }
      if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          if (el.name.text !== exportedName) continue
          forwards.push({
            local: el.propertyName ? el.propertyName.text : el.name.text,
            module: from,
            typeOnly: stmt.isTypeOnly || el.isTypeOnly,
          })
        }
      }
    }
  }
  const direct = findDeclarationKind(sf, exportedName)
  if (direct) return direct
  for (const fwd of forwards) {
    if (fwd.typeOnly) return 'type'
    // `export { x }`（无 module）：x 可能是本地声明，也可能是本地 import（含 `await import()` 解构）
    if (!fwd.module) {
      const local = imports.get(fwd.local)
      if (local) {
        const found = resolveExportKind(resolveSpecifier(file, local.module), local.imported, depth + 1, seen)
        if (found) return found
      }
      const declared = findDeclarationKind(sf, fwd.local)
      if (declared) return declared
      continue
    }
    const found = resolveExportKind(resolveSpecifier(file, fwd.module), fwd.local, depth + 1, seen)
    if (found) return found
  }
  for (const star of stars) {
    const found = resolveExportKind(resolveSpecifier(file, star), exportedName, depth + 1, seen)
    if (found) return found
  }
  return null
}

/** 导入文件里该绑定名是否被当成裸值用过（返回位置列表）。 */
export function bareReferences(file, localName) {
  const sf = parse(file)
  const hits = []
  ;(function visit(node) {
    if (ts.isIdentifier(node) && node.text === localName) {
      const parent = node.parent
      const at = () => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1
      const isCallee = ts.isCallExpression(parent) && parent.expression === node
      const isNewCallee = ts.isNewExpression(parent) && parent.expression === node
      const isDeclName =
        (ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent)) && parent.name === node
      const isImportSpecifier = ts.isImportSpecifier(parent) || ts.isImportClause(parent)
      const isExportSpecifier = ts.isExportSpecifier(parent)
      const isTypeRef = ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent)
      const isTypeQuery = ts.isTypeQueryNode(parent)
      const isPropertyKey = ts.isPropertyAccessExpression(parent) && parent.name === node
      // 简写属性 `{ foo }`：name 同时充当值 → **算裸引用**；而 `{ foo: bar }` 的键不算。
      const isObjectKey =
        (ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
        parent.name === node
      if (
        !isCallee &&
        !isNewCallee &&
        !isDeclName &&
        !isImportSpecifier &&
        !isExportSpecifier &&
        !isTypeRef &&
        !isTypeQuery &&
        !isPropertyKey &&
        !isObjectKey
      ) {
        hits.push(at())
      }
    }
    ts.forEachChild(node, visit)
  })(sf)
  return hits
}

/** 纯函数：给一批 (导入文件, 目标文件, 绑定名) 供自检注入。 */
export function analyzePair(importingFile, definingFile, localName, importedName = localName) {
  const kind = resolveExportKind(definingFile, importedName)
  if (kind === null) {
    return {
      ok: false,
      failures: [
        `${path.relative(FRONTEND_ROOT, importingFile)} 从 ${path.relative(FRONTEND_ROOT, definingFile)} ` +
          `导入 ${localName}，但顺着声明/import/export 转发链都解不出它的形态 —— 门禁解析失效，先修解析。`,
      ],
    }
  }
  if (kind === 'dynamic') return { ok: true, failures: [], dynamic: true }
  if (kind !== 'deps') return { ok: true, failures: [] }
  const bare = bareReferences(importingFile, localName)
  if (!bare.length) return { ok: true, failures: [] }
  const rel = path.relative(FRONTEND_ROOT, importingFile)
  const key = `${rel}:${localName}`
  if (ALLOWED.has(key)) {
    if (!ALLOWED.get(key)) throw new HostBindingGateError(`豁免 ${key} 缺少 why`)
    ALLOWED.set(key, '') // 标记已命中
    return { ok: true, failures: [] }
  }
  return {
    ok: false,
    failures: [
      `${rel}:${bare.join(',')} 把 ${localName} 当裸值交出去，但 ${path.relative(FRONTEND_ROOT, definingFile)} ` +
        `里的 ${importedName} 首参是依赖袋（${DEPS_PARAM}）—— 那个形参会顶掉调用方的第一个实参。` +
        `改用「原签名薄绑定 + 内部 core(deps()) 转发」，或让调用点显式传 deps。`,
    ],
  }
}

export function checkTree(root = STUDIO_ROOT) {
  const files = [...walk(root)]
  if (files.length === 0) throw new HostBindingGateError('studio 下扫到 0 个 .ts —— 门禁自身失效')
  const failures = []
  let pairsChecked = 0
  let depsExports = 0
  let dynamicSkipped = 0
  for (const file of files) {
    const sf = parse(file)
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
      const target = resolveSpecifier(file, stmt.moduleSpecifier.text)
      if (!target) continue
      const bindings = stmt.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings)) continue
      for (const el of bindings.elements) {
        const importedName = el.propertyName ? el.propertyName.text : el.name.text
        const localName = el.name.text
        pairsChecked++
        if (resolveExportKind(target, importedName) === 'deps') depsExports++
        const { failures: f, dynamic } = analyzePair(file, target, localName, importedName)
        if (dynamic) dynamicSkipped++
        failures.push(...f)
      }
    }
  }
  if (pairsChecked === 0) throw new HostBindingGateError('没有解析到任何相对 import —— 门禁自身失效')
  for (const [key, why] of ALLOWED) {
    if (why !== '') failures.push(`过期豁免：${key} 本轮没有被命中，请删掉`)
  }
  return { failures, pairsChecked, depsExports, dynamicSkipped, files: files.length }
}

function main() {
  try {
    const { failures, pairsChecked, depsExports, dynamicSkipped, files } = checkTree()
    if (failures.length) {
      console.error(`✗ 宿主薄绑定裸值门禁：${failures.length} 处违规`)
      for (const f of failures) console.error(`  - ${f}`)
      process.exit(1)
    }
    console.log(
      `宿主薄绑定裸值门禁通过：${files} 个 studio 文件 / ${pairsChecked} 条相对 import` +
        `（其中 ${depsExports} 条指向依赖袋形参，${dynamicSkipped} 条形态动态不可知）`,
    )
  } catch (error) {
    if (error instanceof HostBindingGateError) {
      console.error(`✗ 门禁自身失效：${error.message}`)
      process.exit(2)
    }
    throw error
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
