/**
 * 声明式重构工具：执行「移动 / 合并 / 删除」并重写全仓 import。
 *
 * 为什么是声明式的
 * ----------------
 * 本仓库的重构规模是「千级文件搬移」。逐个 `git mv` + 手工改 import 必然漏改，
 * 而漏改的症状是运行时动态 import 404（不是编译错误）。把整个重构写成一份可 review
 * 的声明（`plans/<step>.mjs`），再由本工具机械执行，才能保证「声明即事实」。
 *
 * 支持四种动作：
 * - `dirMoves` : 目录整棵搬迁（展开为逐文件 moves）
 * - `moves`    : 单文件搬家（等价 git mv）
 * - `merges`   : 多个文件并入一个目标文件（去重 import、检测名字冲突）
 * - `deletes`  : 删除纯转发壳
 *
 * 执行顺序（关键）
 * ----------------
 * 1. 先在**旧路径**上读取并重写全部源码（此时解析基准仍是旧的，才能找到真实目标）；
 * 2. 再把结果写到**新路径**、删掉旧文件。
 *
 * 反过来做（先移动再重写）会让解析基准失效：移走之后 `@/shared/utils/x` 已经不存在，
 * 解析返回 null，工具就会「成功地什么都不改」——静默漏改。本工具早期版本正是这个 bug。
 *
 * 用法：
 * ```bash
 * node ops/scripts/codemod/restructure.mjs ops/scripts/codemod/plans/s1-kernel.mjs --dry-run
 * node ops/scripts/codemod/restructure.mjs ops/scripts/codemod/plans/s1-kernel.mjs --write
 * ```
 *
 * 默认 `--dry-run`：只打印将要发生的动作与统计，不写盘。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { isSourceFile, rewriteImports, rewritePythonImports } from './lib/imports.mjs'
import { walkFiles } from '../../lib/walk.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SRC_ROOTS = [
  'homeos/frontend/src',
  'homeos-store/frontend/src',
  'packages/shared/src',
  'homeos/backend/src',
  'homeos-store/backend/src',
  'ops',
]

const WRITE = process.argv.includes('--write')

/** 统一成仓库相对 POSIX 路径，拒绝绝对路径与 `..`（防止越界写）。 */
function toRepoRel(input) {
  const abs = resolve(REPO_ROOT, input)
  const rel = abs.slice(REPO_ROOT.length + 1).split('\\').join('/')
  if (!rel || rel.startsWith('..')) throw new Error(`restructure: 路径越界或为空：${input}`)
  return rel
}

/** 解析一条 import 语句里声明的本地名字（用于合并时的冲突检测）。 */
function importedLocals(statement) {
  const out = []
  const named = statement.match(/\{([\s\S]*?)\}/)
  if (named) {
    for (const part of named[1].split(',')) {
      // 去掉内联类型修饰符与多余空白：`import { type Foo, Bar }` → Foo / Bar
      const piece = part.trim().replace(/^type\s+/, '')
      if (!piece) continue
      const alias = piece.match(/\bas\s+([A-Za-z_$][\w$]*)/)
      out.push(alias ? alias[1] : piece.split(/\s+/)[0])
    }
  }
  const namespace = statement.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)
  if (namespace) out.push(namespace[1])
  // `import type Foo from '...'` 不引入值绑定，跳过（避免把 "type" 当成本地名）。
  const defaultImport = statement.match(/^\s*import\s+(?!type\b)([A-Za-z_$][\w$]*)\s*(?:,|from)/)
  if (defaultImport) out.push(defaultImport[1])
  return out.filter(Boolean)
}

/** 说明符（来源模块），用于判断同名是否来自同一模块。 */
function importSource(statement) {
  const match = statement.match(/from\s+['"]([^'"]+)['"]/)
  return match ? match[1] : ''
}

/** 去掉已知扩展名（与 imports.mjs 的口径一致）。 */
function stripExt(path) {
  return path.replace(/\.(ts|tsx|mts|vue|css|json|js|mjs)$/, '')
}

/**
 * 纯文本解析说明符（不看磁盘）。
 *
 * 合并目标是**尚未写盘**的新文件，用带 existsSync 的解析器会得到 null，从而漏掉
 * 「合并后指向自己的 import」——那份自引用 import 会让文件 import 自己，TS 直接报错。
 */
function textualTarget(spec, fromPath) {
  if (spec.startsWith('.')) return stripExt(join(dirname(fromPath), spec).split('\\').join('/'))
  for (const [prefix, to] of [
    ['@app/', 'studio/app/'],
    ['@runtime/', 'studio/runtime/'],
    ['@/', ''],
  ]) {
    if (spec.startsWith(prefix)) {
      return stripExt(join('homeos/frontend/src', to, spec.slice(prefix.length)).split('\\').join('/'))
    }
  }
  return null
}

/** import 语句是否已写完：引号成对且出现了来源说明符或副作用 import 的收尾。 */
function isImportComplete(statement) {
  const quotes = (statement.match(/['"]/g) ?? []).length
  if (quotes === 0 || quotes % 2 !== 0) return false
  if (/\bfrom\s+['"][^'"]+['"]\s*;?\s*$/.test(statement)) return true
  if (/^\s*import\s+['"][^'"]+['"]\s*;?\s*$/.test(statement.trim())) return true
  return false
}

/** 拆分 import 段与其余内容（逐行扫描 + 引号跟踪，支持跨行 import）。 */
function splitImports(text) {
  const imports = []
  const body = []
  let buffer = null

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (buffer === null && /^import\s/.test(trimmed) && !trimmed.startsWith('import(')) {
      buffer = [line]
      if (isImportComplete(line)) {
        imports.push(line)
        buffer = null
      }
      continue
    }
    if (buffer !== null) {
      buffer.push(line)
      if (isImportComplete(buffer.join('\n'))) {
        imports.push(buffer.join('\n'))
        buffer = null
      }
      continue
    }
    body.push(line)
  }
  if (buffer !== null) body.push(...buffer)
  return { imports, body: body.join('\n') }
}

/**
 * 把一批 import 语句归一成「按来源分组的绑定表」，再重建语句。
 *
 * @param {Array<{statement: string, path: string}>} statements
 * @param {(local: string, canonical: string, source: string) => boolean} [accept]
 *   逐绑定判定是否保留；省略时全部保留。
 * @returns {string[]}
 */
function normalizeImports(statements, accept) {
  /** @type {Map<string, {source: string, sideEffect: boolean, defaults: Set<string>, namespaces: Set<string>, named: Map<string,{imported:string,isType:boolean}>}>} */
  const bySource = new Map()
  const order = []

  const bucket = (canonical, source) => {
    if (!bySource.has(canonical)) {
      bySource.set(canonical, {
        source,
        sideEffect: false,
        defaults: new Set(),
        namespaces: new Set(),
        named: new Map(),
      })
      order.push(canonical)
    }
    return bySource.get(canonical)
  }

  const allowed = (local, canonical, source) => (accept ? accept(local, canonical, source) : true)

  for (const { statement, path } of statements) {
    const source = importSource(statement)
    if (!source) continue
    const canonical = resolveCanonical(path, source) || source
    const entry = bucket(canonical, source)
    const trimmed = statement.trim()

    // 纯副作用 import：`import './x.css'`
    if (/^import\s+['"]/.test(trimmed)) {
      entry.sideEffect = true
      continue
    }

    const isTypeOnly = /^import\s+type\s/.test(trimmed)

    // 默认导入（可带 type-only）
    const defaultMatch = trimmed.match(/^import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,|from)/)
    if (defaultMatch && allowed(defaultMatch[1], canonical, source)) entry.defaults.add(defaultMatch[1])

    // 命名空间导入
    const namespaceMatch = trimmed.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)
    if (namespaceMatch && allowed(namespaceMatch[1], canonical, source)) entry.namespaces.add(namespaceMatch[1])

    // 具名导入（含内联 type 修饰）
    const namedMatch = trimmed.match(/\{([^{}]*)\}/)
    if (namedMatch) {
      for (const part of namedMatch[1].split(',')) {
        const piece = part.trim()
        if (!piece) continue
        const inlineType = /^type\s+/.test(piece)
        const body = piece.replace(/^type\s+/, '')
        const [imported, local = imported] = body.split(/\s+as\s+/).map((s) => s.trim())
        if (!imported) continue
        if (!allowed(local, canonical, source)) continue
        const key = local
        const isType = isTypeOnly || inlineType
        const previous = entry.named.get(key)
        if (!previous || (previous.isType && !isType)) {
          entry.named.set(key, { imported, isType })
        }
      }
    }
  }

  const out = []
  for (const canonical of order) {
    const entry = bySource.get(canonical)
    const source = entry.source
    // 命名空间导入不能与其它绑定合并成一条语句（ES 语法禁止），每个单独成行。
    for (const name of entry.namespaces) out.push(`import * as ${name} from '${source}'`)

    const parts = []
    for (const name of entry.defaults) parts.push(name)
    if (entry.named.size) {
      const named = [...entry.named.entries()].map(([local, { imported, isType }]) => {
        const alias = imported === local ? local : `${imported} as ${local}`
        return isType ? `type ${alias}` : alias
      })
      parts.push(`{ ${named.join(', ')} }`)
    }
    if (parts.length) out.push(`import ${parts.join(', ')} from '${source}'`)
    if (entry.sideEffect) out.push(`import '${source}'`)
  }
  return out
}

/**
 * 合并多个「已重写进口」的文件文本：按绑定归一 import、检测本地名冲突、保留各文件头注释。
 * @param {Array<{path: string, text: string}>} sources
 * @param {{header?: string, into?: string}} [options]
 * @returns {string}
 */
/**
 * 把说明符解析成真实模块路径（用于合并时的同名判定）。
 * 解析不到时退回原始说明符，保证「无法解析 = 不同来源」的保守语义。
 * @param {string} fromPath 发起文件（旧位置）
 * @param {string} spec
 * @returns {string}
 */
function resolveCanonical(fromPath, spec) {
  if (!spec) return ''
  const absent = `unresolved:${spec}`
  if (spec.startsWith('.')) {
    const base = join(dirname(fromPath), spec).split('\\').join('/')
    for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}.vue`, `${base}.css`, base]) {
      if (existsSync(cand)) return stripExt(cand)
    }
    return stripExt(base)
  }
  for (const [prefix, to] of [
    ['@app/', 'studio/app/'],
    ['@runtime/', 'studio/runtime/'],
    ['@/', ''],
  ]) {
    if (!spec.startsWith(prefix)) continue
    const base = join('homeos/frontend/src', to, spec.slice(prefix.length)).split('\\').join('/')
    for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}.vue`, `${base}.css`, base]) {
      if (existsSync(cand)) return stripExt(cand)
    }
    return stripExt(base)
  }
  return absent
}

/**
 * 去掉合并后正文里「同名且逐字相同」的顶层声明。
 *
 * 同一功能族的两个文件常各自写一份 `type Summary = ...` 或 `const LIMIT = 3`。
 * 合并后 TS 报 `Duplicate identifier`。只在**归一化后完全相同**时才删：
 * - `type` / `interface`：内容相同即等价；
 * - `const` / `let`：仅当右侧是纯字面量（数字 / 字符串 / 布尔 / null）才删 ——
 *   有函数调用或对象字面量时去掉第二份可能改变求值次数，属于真实冲突，保留给人判断。
 *
 * `seen` 必须由调用方在**整个合并范围内**共享 —— 每次调用新建会让跨源去重失效。
 * @param {string} body
 * @param {Set<string>} seen
 * @returns {string}
 */
function dedupeTypeAliases(body, seen) {
  const LITERAL_RHS = /^(?:-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"|true|false|null|undefined)$/
  return body
    .split('\n')
    .filter((line) => {
      const alias = line.match(/^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/)
      if (alias) {
        const key = `${alias[1]}|${line.replace(/\s+/g, ' ').trim()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }
      const constant = line.match(/^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(.+?);?\s*$/)
      if (constant && LITERAL_RHS.test(constant[2].trim())) {
        const key = `${constant[1]}|${line.replace(/\s+/g, ' ').trim()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }
      return true
    })
    .join('\n')
}

/**
 * 丢掉「重复的本地导出清单」。
 *
 * 合并后常出现：正文里有 `export function Foo`，末尾还有一条 `export { Foo }`
 * （原文件为了聚合出口写的）。两条同时存在 TS 报
 * `Export declaration conflicts with exported declaration`。
 * 只在清单里**每个名字都已有 `export` 声明**时才丢，否则保留（可能真的只是重命名导出）。
 * @param {string} text
 * @returns {string}
 */
function dropRedundantExportLists(text) {
  const declared = new Set()
  for (const match of text.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface)\s+([A-Za-z_$][\w$]*)/gm)) {
    declared.add(match[1])
  }
  return text
    .replace(/^[ \t]*export\s+(?:type\s+)?\{([^{}]*)\}[ \t]*;?[ \t]*\r?\n?/gm, (statement, inner) => {
      // 带 `from` 的重导出不属于本函数处理范围（正则已排除：要求 `}` 后紧跟换行/分号）。
      const names = inner
        .split(',')
        .map((part) => part.trim().replace(/^type\s+/, ''))
        .map((part) => part.split(/\s+as\s+/).pop().trim())
        .filter(Boolean)
      if (!names.length) return statement
      return names.every((name) => declared.has(name)) ? '' : statement
    })
}

/**
 * 从源码里抽出「转手导出」映射：`export { a as b } from 'src'` → b ⇢ {orig: a, src}。
 * 合并时若某符号只是被转手导出（本文件没实现），导入方需要改指向 src。
 * @param {Array<{path: string, text: string}>} sources
 * @returns {Map<string, {orig: string, src: string}>}
 */
function collectReExports(sources) {
  const map = new Map()
  for (const { text } of sources) {
    for (const match of text.matchAll(/^[ \t]*export\s+(?:type\s+)?\{([^{}]*)\}\s+from\s+['"]([^'"]+)['"]/gm)) {
      for (const part of match[1].split(',')) {
        const piece = part.trim().replace(/^type\s+/, '')
        if (!piece) continue
        const [orig, local = orig] = piece.split(/\s+as\s+/).map((s) => s.trim())
        if (local && orig) map.set(local, { orig, src: match[2] })
      }
    }
  }
  return map
}

/** 正文里声明的顶层名字（用于判断导入的绑定是否还需要）。 */
function declaredNames(body) {
  const names = new Set()
  for (const match of body.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)) {
    names.add(match[1])
  }
  return names
}

function mergeTexts(sources, { header, into } = {}) {
  // CSS 合并：纯拼接，`@import` 必须全部提到文件头（CSS 规定它只能在最前），并去重。
  if (into && into.endsWith('.css')) {
    const imports = []
    const seen = new Set()
    const bodies = []
    for (const { text } of sources) {
      const lines = []
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('@import')) {
          if (seen.has(trimmed)) continue
          seen.add(trimmed)
          imports.push(line)
          continue
        }
        lines.push(line)
      }
      bodies.push(lines.join('\n').trimEnd())
    }
    const sections = []
    if (header) sections.push(header.trimEnd())
    if (imports.length) sections.push(imports.join('\n'))
    for (const body of bodies) if (body) sections.push(body)
    return `${sections.join('\n\n')}\n`
  }

  // 被合并掉的模块集合：它们的 `export ... from` 在合并后都指向自身，
  // 必须丢弃 —— 符号已经在正文里定义，重复导出会报「Cannot redeclare exported variable」。
  const mergedInto = (() => {
    if (!into) return null
    const set = new Set([stripExt(into)])
    for (const { path } of sources) set.add(stripExt(path))
    return set
  })()
  // Python 不能用 JS 的 import 归一化：`from x import y` 不是 JS 语法，会被当成无来源丢掉。
  // 且 Python 允许重复 import，因此只做「整行去重」的朴素拼接。
  if (into && into.endsWith('.py')) {
    const seen = new Set()
    const body = []
    for (const { text } of sources) {
      for (const line of text.split('\n')) {
        const key = line.trim()
        if (/^(import|from)\s/.test(key)) {
          if (seen.has(key)) continue
          seen.add(key)
        }
        body.push(line)
      }
      body.push('')
    }
    const sections = []
    if (header) sections.push(header.trimEnd())
    sections.push(body.join('\n').trimEnd())
    return `${sections.join('\n\n')}\n`
  }

  const statements = []
  const seen = new Set()
  const typeSeen = new Set()
  const localOwner = new Map()
  const bodies = []

  for (const { path, text } of sources) {
    const { imports: fileImports, body } = splitImports(text)
    // 正文里若有 `export ... from '<被合并模块>'`，同样要删（符号已在本文件定义）。
    //
    // 正则必须严格限定在**一条语句内**：`\{[^{}]*\}` 不允许跨花括号，`[ \t]+from`
    // 不允许跨行。早期写成 `\{[\s\S]*?\}\s+from` 时，lazy 组会从 `export { clampPct }`
    // 一路吞到几百行后的 `} from '...'`，把整段实现删掉 —— 静默丢代码。
    const cleanedBody = mergedInto
      ? body.replace(
          /^[ \t]*export\s+(?:type\s+)?(?:\{[^{}]*\}|\*)\s+from\s+['"]([^'"]+)['"];?[ \t]*\r?\n?/gm,
          (statement, spec) => {
            const canonical = resolveCanonical(path, spec)
            return mergedInto.has(canonical) ? '' : statement
          },
        )
      : body
    for (const statement of fileImports) {
      const specifier = importSource(statement)
      const canonical = resolveCanonical(path, specifier)
      for (const local of importedLocals(statement)) {
        const previous = localOwner.get(local)
        if (previous !== undefined && previous !== canonical) {
          throw new Error(
            `merge: 本地名冲突 "${local}" —— ${path} 从 "${specifier}" 导入，但它已从 "${previous}" 导入。请先人工消歧。`,
          )
        }
        localOwner.set(local, canonical)
      }
      const key = statement.replace(/\s+/g, ' ').trim()
      if (seen.has(key)) continue
      seen.add(key)
      statements.push({ statement, path })
    }
    bodies.push(dedupeTypeAliases(cleanedBody, typeSeen).trimEnd())
  }

  const sections = []
  if (header) sections.push(header.trimEnd())
  const mergedBody = dropRedundantExportLists(bodies.join('\n\n'))
  // 合并后哪些名字有本地定义 —— 决定「从被合并模块导入的绑定」还剩哪些有意义。
  const localNames = declaredNames(mergedBody)
  const reExports = mergedInto ? collectReExports(sources) : new Map()
  /** 被合并模块转手导出、且正文确实在用的符号：需要改指向原始来源。 */
  const passthrough = new Map()

  // 按**绑定**过滤（不是按语句）：同一条 import 里可能既有本地已实现的符号
  // （来自被合并模块，应删）又有外部符号（应保留）。语句级过滤会连带保留冲突项。
  const imports = normalizeImports(statements, (local, canonical, source) => {
    const used = new RegExp(`\\b${local.replace(/\$/g, '\\$')}\\b`).test(mergedBody)
    if (!used) return false
    if (mergedInto && mergedInto.has(canonical)) {
      if (localNames.has(local)) return false
      const origin = reExports.get(local)
      if (origin) {
        if (!passthrough.has(origin.src)) passthrough.set(origin.src, [])
        const rendered = origin.orig === local ? local : `${origin.orig} as ${local}`
        if (!passthrough.get(origin.src).includes(rendered)) passthrough.get(origin.src).push(rendered)
        return false
      }
    }
    return true
  })
  for (const [src, names] of passthrough) imports.push(`import { ${names.join(', ')} } from '${src}'`)

  if (imports.length) sections.push(imports.join('\n'))
  if (mergedBody.trim()) sections.push(mergedBody.trimEnd())
  return `${sections.join('\n\n')}\n`
}

function main() {
  const planPath = process.argv[2]
  if (!planPath) {
    console.error('用法: node ops/scripts/codemod/restructure.mjs <plan.mjs> [--write]')
    process.exit(2)
  }

  const planUrl = pathToFileURL(resolve(REPO_ROOT, planPath)).href
  return import(planUrl).then((module) => {
    const plan = module.default
    const moves = (plan.moves ?? []).map((m) => ({ from: toRepoRel(m.from), to: toRepoRel(m.to) }))
    const merges = (plan.merges ?? []).map((m) => ({
      into: toRepoRel(m.into),
      from: (m.from ?? []).map(toRepoRel),
      header: m.header,
    }))
    const deletes = (plan.deletes ?? []).map(toRepoRel)

    // 目录级搬迁：展开成逐文件 move（walk 复用 ops/lib/walk.mjs，保证与门禁同一口径）。
    for (const dirMove of plan.dirMoves ?? []) {
      const fromDir = toRepoRel(dirMove.from)
      const toDir = toRepoRel(dirMove.to)
      if (!existsSync(fromDir)) throw new Error(`dirMoves.from 不存在: ${fromDir}`)
      for (const file of walkFiles(fromDir, { extensions: null, skipDirs: new Set(['__pycache__']) })) {
        const repoRel = file.split('\\').join('/')
        moves.push({ from: repoRel, to: `${toDir}/${repoRel.slice(fromDir.length + 1)}` })
      }
    }

    // ---- 声明校验 ----
    const problems = []
    for (const { from } of moves) if (!existsSync(from)) problems.push(`moves.from 不存在: ${from}`)
    for (const { into, from } of merges) {
      for (const path of from) if (!existsSync(path)) problems.push(`merges.from 不存在: ${path}`)
      if (!from.length) problems.push(`merges 缺少 from: ${into}`)
      if (moves.some((m) => m.from === into)) problems.push(`merges.into 同时被 dirMoves/moves 移动: ${into}`)
    }
    for (const path of deletes) if (!existsSync(path)) problems.push(`deletes 不存在: ${path}`)
    const moveTargets = new Set(moves.map((m) => m.to))
    if (moveTargets.size !== moves.length) problems.push('moves 目标存在重复（两个来源指向同一目标）')
    for (const { from, to } of moves) {
      if (moveTargets.has(from)) problems.push(`移动目标与另一个移动来源重叠: ${from}`)
      // 目标已存在 = 要么名字撞车，要么声明写错。静默覆盖会丢文件，必须拦下。
      if (existsSync(to)) problems.push(`目标已存在（会覆盖）: ${to}`)
    }
    if (problems.length) {
      console.error('重构声明有问题：')
      for (const p of problems) console.error(`  - ${p}`)
      process.exit(1)
    }

    // ---- 1) 建立映射 ----
    const moveMap = new Map()
    for (const { from, to } of moves) moveMap.set(from, to)
    const mergeInto = new Map()
    for (const { into, from } of merges) {
      for (const path of from) {
        if (path === into) continue
        moveMap.set(path, into)
        mergeInto.set(path, into)
      }
    }

    // ---- 2) 在旧路径上读取 + 重写（解析基准 = 旧路径）----
    const rewritten = new Map() // oldPath -> 新文本
    let scanned = 0
    let changed = 0
    for (const root of SRC_ROOTS) {
      if (!existsSync(root)) continue
      for (const file of walkFiles(root)) {
        const oldPath = file.split('\\').join('/')
        if (!isSourceFile(oldPath)) continue
        // 重构工具自身不参与重写：它不是业务代码，且自我改写只会引入噪声。
        if (oldPath.startsWith('ops/scripts/codemod/')) continue
        scanned += 1
        const text = readFileSync(oldPath, 'utf8')
        // 合并来源：最终落到 into，因此输出基准用 into；其余用自身新位置。
        const emitFrom = mergeInto.get(oldPath) ?? moveMap.get(oldPath) ?? oldPath
        const next = oldPath.endsWith('.py')
          ? rewritePythonImports(text, oldPath, emitFrom, moveMap).text
          : rewriteImports(text, oldPath, emitFrom, moveMap)
        if (next !== text) changed += 1
        rewritten.set(oldPath, next)
      }
    }

    // ---- 3) 落盘 ----
    if (WRITE) {
      // 3a) 合并：用「已按 into 重写过」的文本拼装
      for (const { into, from, header } of merges) {
        const sources = from
          .filter((path) => rewritten.has(path))
          .map((path) => ({ path, text: rewritten.get(path) }))
        if (!sources.length) throw new Error(`merges 无可用来源: ${into}`)
        mkdirSync(dirname(into), { recursive: true })
        writeFileSync(into, mergeTexts(sources, { header, into }), 'utf8')
        // 合并后必须删掉被吸收的来源，否则会留下两份实现（其中一份 import 指向新文件，形成自环）。
        for (const path of from) if (path !== into) rmSync(path, { force: true })
      }
      // 3b) 移动
      for (const { from, to } of moves) {
        mkdirSync(dirname(to), { recursive: true })
        const text = rewritten.get(from)
        if (text === undefined) {
          renameSync(from, to)
          continue
        }
        writeFileSync(to, text, 'utf8')
        rmSync(from, { force: true })
      }
      // 3c) 原地文件写回重写结果
      const writtenTargets = new Set([...moves.map((m) => m.to), ...merges.map((m) => m.into)])
      for (const [oldPath, text] of rewritten) {
        if (writtenTargets.has(oldPath)) continue
        if (moveMap.has(oldPath)) continue
        if (deletes.includes(oldPath)) continue
        writeFileSync(oldPath, text, 'utf8')
      }
      // 3d) 删除
      for (const path of deletes) rmSync(path, { force: true })
    }

    // ---- 4) 报告 ----
    for (const { into, from } of merges) console.log(`  merge ${from.length} → ${into}`)
    for (const { from, to } of moves) console.log(`  move  ${from}\n     → ${to}`)
    for (const path of deletes) console.log(`  delete ${path}`)
    console.log(
      `\n${WRITE ? '已应用' : 'DRY RUN'}：moves ${moves.length} · merges ${merges.length} · deletes ${deletes.length} · 扫描 ${scanned} · 重写 ${changed}`,
    )
    if (!WRITE) console.log('加 --write 才会真正落盘。')
    return 0
  })
}

main().then(
  (code) => process.exit(code ?? 0),
  (error) => {
    console.error(error.message)
    process.exit(1)
  },
)
