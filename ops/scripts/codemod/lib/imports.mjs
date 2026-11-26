/**
 * 重构 codemod 的共享实现：路径解析 + import 说明符重写。
 *
 * 为什么单独成库
 * --------------
 * `merge-symbols` / `rename-module` / `extract-module` 三个工具都要做同一件事：
 * 把「某个文件从 A 移到 B」翻译成「全仓所有 import 说明符的新写法」。这份逻辑一旦有
 * 两份副本，就会出现「一个工具改了静态 import、另一个漏了动态 import」这类静默错误 ——
 * 症状不是报错，而是运行时 `Failed to fetch dynamically imported module`。
 *
 * 支持的说明符形态（本仓库实际存在的全部）：
 * - `import x from '@/kernel/ui'`           静态 import / export from
 * - `import('@/features/device')`            动态 import（studio bridge 大量使用）
 * - `import('/api/v1/modules/...')`          公网 URL（不解析、不改写）
 * - CSS `@import "./x.css"` 与 Vue `<style src="./x.css">`
 *
 * 解析口径：能解析到真实文件的才重写；解析不到（外部包、公网 URL、别名白名单外）
 * 一律原样保留 —— 猜错比不改更糟。
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 前端源码根（后缀候选的锚点）。 */
export const FRONTEND_SRC = 'homeos/frontend/src'

/**
 * 仓库根（绝对路径）。
 *
 * 为什么需要它：`node:path` 的 `resolve()` **总是返回绝对路径**，而本模块的映射表
 * 一律以「仓库相对路径」为键。早期版本直接用 `resolve()` 拼相对说明符，得到的是
 * 绝对路径，`moveMap.get()` 永远 undefined —— 结果是**所有相对 import 静默不重写**，
 * 只有别名（`@/...`）说明符被改。这个 bug 不会报错，只会让构建在别处炸掉。
 */
const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../../..')

/** 归一成仓库相对 POSIX 路径；越出仓库时返回 null。 */
function asRepoRel(path) {
  const normalized = path.split(sep).join('/')
  if (!normalized.startsWith('/')) return normalized
  const prefix = `${REPO_ROOT.split(sep).join('/')}/`
  if (!normalized.startsWith(prefix)) return null
  return normalized.slice(prefix.length)
}

/** 解析后缀：按顺序尝试，先命中即用。顺序与 Vite/TS 默认一致。 */
const EXTENSIONS = ['.ts', '.tsx', '.vue', '.mts', '.js', '.mjs', '.json']

/**
 * 路径别名表（唯一真源，与 `tsconfig.json` 的 paths 同步）。
 * 左侧为说明符前缀，右侧为相对 `src` 的目录前缀（空串 = src 根）。
 */
export const ALIASES = [
  ['@app/', 'studio/app/'],
  ['@runtime/', 'studio/runtime/'],
  ['@/', ''],
]

/** 长前缀优先，避免 `@/` 抢走 `@app/`。 */
const ALIAS_ENTRIES = [...ALIASES].sort((a, b) => b[0].length - a[0].length)

/** 可被重写的源码扩展名（其它文件原样跳过）。 */
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.mts', '.vue', '.css', '.js', '.mjs', '.py'])

/**
 * 判断一个仓库相对路径是否是可分析的源码文件。
 * @param {string} path
 * @returns {boolean}
 */
export function isSourceFile(path) {
  for (const ext of SOURCE_EXTS) if (path.endsWith(ext)) return true
  return false
}

/**
 * 把说明符解析成仓库相对路径（不带扩展名归一，命中真实文件后带真实扩展名）。
 *
 * @param {string} spec 说明符原文，如 `@/kernel/ui` 或 `./foo`
 * @param {string} importerRepoRel 发起 import 的文件（仓库相对路径）
 * @param {{srcRoot?: string}} [options]
 * @returns {string | null} 无法解析时返回 null（调用方应原样保留）
 */
export function resolveSpecifier(spec, importerRepoRel, { srcRoot = FRONTEND_SRC } = {}) {
  // 公网 URL / 协议 / 裸包名：不解析。
  if (/^[a-z]+:/i.test(spec)) return null
  if (spec.startsWith('//')) return null

  let base = null
  if (spec.startsWith('.')) {
    // 注意：用「目录 + 说明符」手工拼接并归一到仓库相对路径，不能用 `resolve()`
    // （它会返回绝对路径，与本模块的相对路径键不匹配，导致重写全部失效）。
    base = asRepoRel(join(dirname(importerRepoRel), spec))
  } else {
    for (const [prefix, to] of ALIAS_ENTRIES) {
      if (spec === prefix.slice(0, -1) || spec.startsWith(prefix)) {
        const rest = spec === prefix.slice(0, -1) ? '' : spec.slice(prefix.length)
        base = asRepoRel(join(srcRoot, to, rest))
        break
      }
    }
  }
  if (base === null) return null
  // 越出仓库的说明符不处理。
  if (base.startsWith('..')) return null

  return probe(base)
}

/**
 * 尝试补全：先按原样（可能已带扩展名），再追加扩展名，最后试目录下的 index。
 * @param {string} base 不带扩展名嫌疑的绝对/相对路径
 * @returns {string | null}
 */
function probe(base) {
  const normalized = base.split(sep).join('/')
  if (existsSync(normalized)) {
    try {
      if (statSync(normalized).isFile()) return normalized
    } catch {
      /* 视为不可读 */
    }
  }
  for (const ext of EXTENSIONS) {
    const candidate = `${normalized}${ext}`
    if (existsSync(candidate)) return candidate
  }
  for (const ext of EXTENSIONS) {
    const candidate = `${normalized}/index${ext}`
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** 去掉已知扩展名（说明符里通常不写扩展名，但 Vue/CSS 会写）。 */
function stripKnownExt(path) {
  for (const ext of EXTENSIONS) if (path.endsWith(ext)) return path.slice(0, -ext.length)
  return path
}

/**
 * 反解成说明符：优先沿用原说明符的风格（别名 / 相对）。
 *
 * @param {string} targetRepoRel 目标文件的仓库相对路径（真实存在的新位置）
 * @param {string} importerRepoRel 发起方的新位置
 * @param {'alias' | 'relative'} style 原说明符风格
 * @param {{srcRoot?: string, keepExtension?: boolean}} [options]
 *   `keepExtension`：原说明符带了扩展名就必须保留（`.mjs` / `.js` 在 TS 里也常见，
 *   剥掉会让 Node ESM 直接 `ERR_MODULE_NOT_FOUND`）。
 * @returns {string}
 */
export function toSpecifier(targetRepoRel, importerRepoRel, style, { srcRoot = FRONTEND_SRC, keepExtension = false } = {}) {
  const keepExt = keepExtension || /\.(vue|css|json)$/.test(targetRepoRel)
  const target = keepExt ? targetRepoRel : stripKnownExt(targetRepoRel)

  if (style === 'alias') {
    // 能在 src 下就还原成 `@/...`；studio 内部优先 `@app` / `@runtime` 保持原习惯。
    if (target.startsWith(`${srcRoot}/`)) {
      const rel = target.slice(srcRoot.length + 1)
      if (rel.startsWith('studio/app/')) return `@app/${rel.slice('studio/app/'.length)}`
      if (rel.startsWith('studio/runtime/')) return `@runtime/${rel.slice('studio/runtime/'.length)}`
      return `@/${rel}`
    }
    // 落到 src 外（如 packages）：退回相对路径。
  }

  let rel = relative(dirname(importerRepoRel), target)
  rel = rel.split(sep).join('/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel
}

/** 期望扩展名是否与「保留扩展名」规则一致：`.vue`/`.css` 说明符必须带扩展名。 */
export function specifierHasExtension(spec) {
  return /\.(vue|css|json|mjs|js|ts|tsx)$/.test(spec)
}

/**
 * 从一段源码里提取所有「可重写的说明符位置」。
 * 返回 `{ start, end, spec, style }`，`start/end` 是说明符内容（不含引号）在原串中的偏移。
 *
 * @param {string} text
 * @returns {Array<{start:number,end:number,spec:string,style:'alias'|'relative'}>}
 */
export function findSpecifiers(text) {
  const out = []
  const push = (spec, start, end) => {
    if (!spec) return
    const style = spec.startsWith('.') ? 'relative' : 'alias'
    out.push({ start, end, spec, style })
  }

  // 静态：import ... from 'x' / export ... from 'x' / import 'x'
  const staticRe = /(?:^|[\s;}])(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g
  for (const match of text.matchAll(staticRe)) {
    const spec = match[1]
    const offset = match.index + match[0].lastIndexOf(spec)
    push(spec, offset, offset + spec.length)
  }

  // 动态：import('x')
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const match of text.matchAll(dynamicRe)) {
    const spec = match[1]
    const offset = match.index + match[0].indexOf(spec)
    push(spec, offset, offset + spec.length)
  }

  // CSS：@import "./x.css"
  const cssRe = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g
  for (const match of text.matchAll(cssRe)) {
    const spec = match[1]
    const offset = match.index + match[0].indexOf(spec)
    push(spec, offset, offset + spec.length)
  }

  // Vue：<style src="./x.css">
  const vueSrcRe = /<style\b[^>]*\bsrc=["']([^"']+)["']/g
  for (const match of text.matchAll(vueSrcRe)) {
    const spec = match[1]
    const offset = match.index + match[0].indexOf(spec)
    push(spec, offset, offset + spec.length)
  }

  // 去重（同偏移只保留一条）+ 按位置升序。
  const seen = new Set()
  return out
    .filter((item) => {
      const key = `${item.start}:${item.end}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.start - b.start)
}

/**
 * 按「文件搬家映射」重写一段源码里的全部说明符。
 *
 * 为什么要把「解析基准」与「输出基准」分开
 * ----------------------------------------
 * 合并（A、B → T）时，A 里的 `./foo` 是相对 A 所在目录写的，但合并后要相对 T 所在目录
 * 才成立。因此必须用 A 的**旧**位置解析出真实目标，再用 T 的位置重新生成说明符。
 * 只用一个位置参数会让合并后的相对 import 全部指向错误目录 —— 这是静默错误。
 *
 * @param {string} text 源码
 * @param {string} resolveFrom 解析说明符时的基准文件（旧位置）
 * @param {string} emitFrom 生成新说明符时的基准文件（新位置）
 * @param {Map<string,string>} moveMap 旧仓库相对路径 → 新仓库相对路径
 * @param {{srcRoot?: string}} [options]
 * @returns {string}
 */
export function rewriteImports(text, resolveFrom, emitFrom, moveMap, options = {}) {
  const found = findSpecifiers(text)
  if (!found.length) return text

  let result = ''
  let cursor = 0
  for (const item of found) {
    const target = resolveSpecifier(item.spec, resolveFrom, options)
    if (target === null) continue
    const moved = moveMap.get(target) ?? target
    // 原说明符带扩展名（.mjs/.js/.vue/.css）就必须原样保留扩展名。
    const next = toSpecifier(moved, emitFrom, item.style, {
      ...options,
      keepExtension: specifierHasExtension(item.spec),
    })
    if (next === item.spec) continue
    result += text.slice(cursor, item.start) + next
    cursor = item.end
  }
  if (!cursor) return text
  return result + text.slice(cursor)
}

/**
 * 读取一个文件并按映射改写，返回新内容（不写盘）。
 * @param {string} repoRel 旧位置
 * @param {string} newRepoRel 新位置
 * @param {Map<string,string>} moveMap
 * @param {{srcRoot?: string}} [options]
 * @returns {string}
 */
export function rewriteFile(repoRel, newRepoRel, moveMap, options = {}) {
  const text = readFileSync(repoRel, 'utf8')
  return rewriteImports(text, repoRel, newRepoRel, moveMap, options)
}

// =============================================================================
// Python 导入重写
// =============================================================================

/** 后端源码根：Python 模块以它为锚点。 */
export const BACKEND_SRC = 'homeos/backend/src'

/** 后端顶层包（与 check_backend_deps.py 的 BACKEND_TOP 同源）。 */
const BACKEND_TOP = ['api', 'domains', 'platform', 'modules', 'bootstrap', 'realtime', 'panel', 'ops']

/**
 * 文件 → 模块路径（点分）。`__init__.py` 对应包本身。
 * @param {string} repoRelFile
 * @param {string} [srcRoot]
 * @returns {string[] | null}
 */
export function pythonModuleParts(repoRelFile, srcRoot = BACKEND_SRC) {
  if (!repoRelFile.startsWith(`${srcRoot}/`) || !repoRelFile.endsWith('.py')) return null
  const rel = repoRelFile.slice(srcRoot.length + 1).replace(/\.py$/, '')
  const parts = rel.split('/')
  if (parts[parts.length - 1] === '__init__') parts.pop()
  return parts
}

/**
 * 相对导入的解析基准「包」。
 *
 * 关键区别：`a/b/__init__.py` 的模块就是包 `a.b`，它的 `from .x` 指向 `a.b.x`；
 * 而普通模块 `a/b/c.py` 的包是 `a.b`。混为一谈会让 `__init__.py` 里的每个相对导入
 * 都少算一层（`from ..schema` 被解析成 `a.schema` 而不是顶层 `schema`）。
 */
function pythonPackageParts(repoRelFile, srcRoot = BACKEND_SRC) {
  const parts = pythonModuleParts(repoRelFile, srcRoot)
  if (!parts) return null
  return repoRelFile.endsWith('__init__.py') ? parts : parts.slice(0, -1)
}

/** 从包 `pkgParts` 导入 `targetParts` 的相对前缀（点号个数 + 模块名）。 */
function relativeModulePrefix(pkgParts, targetParts) {
  let common = 0
  while (common < pkgParts.length && common < targetParts.length && pkgParts[common] === targetParts[common]) common += 1
  const up = pkgParts.length - common
  const rest = targetParts.slice(common)
  return `${'.'.repeat(up + 1)}${rest.join('.')}`
}

/**
 * 重写一个 Python 文件里的导入语句。
 *
 * 只要**相对深度**或目标模块发生了变化就重写；解析失败的一律原样保留。
 *
 * @param {string} text
 * @param {string} resolveFrom 旧路径（仓库相对）
 * @param {string} emitFrom 新路径（仓库相对）
 * @param {Map<string,string>} moveMap 文件级映射
 * @param {{srcRoot?: string}} [options]
 * @returns {{ text: string, changed: number }}
 */
export function rewritePythonImports(text, resolveFrom, emitFrom, moveMap, { srcRoot = BACKEND_SRC } = {}) {
  const oldPkg = pythonPackageParts(resolveFrom, srcRoot)
  const newPkg = pythonPackageParts(emitFrom, srcRoot)
  if (!oldPkg || !newPkg) return { text, changed: 0 }

  const moduleMap = new Map()
  for (const [fromFile, toFile] of moveMap) {
    const fromParts = pythonModuleParts(fromFile, srcRoot)
    const toParts = pythonModuleParts(toFile, srcRoot)
    if (!fromParts || !toParts) continue
    moduleMap.set(fromParts.join('.'), toParts)
  }

  let changed = 0
  const out = text.split('\n').map((line) => {
    const relative = line.match(/^(\s*)from (\.+)([\w.]*) import (.*)$/)
    if (relative) {
      const [, indent, dots, mod, tail] = relative
      const climb = dots.length - 1
      if (climb > oldPkg.length) return line
      const anchor = oldPkg.slice(0, oldPkg.length - climb)
      const resolved = mod ? [...anchor, ...mod.split('.')] : anchor
      const mapped = moduleMap.get(resolved.join('.')) ?? resolved
      if (!mapped.length) return line
      const prefix = relativeModulePrefix(newPkg, mapped)
      if (prefix === `${dots}${mod}`) return line
      changed += 1
      return `${indent}from ${prefix} import ${tail}`
    }

    const absolute = line.match(/^(\s*)from ([\w.]+) import (.*)$/)
    if (absolute) {
      const [, indent, mod, tail] = absolute
      if (!BACKEND_TOP.includes(mod.split('.')[0])) return line
      const mapped = moduleMap.get(mod) ?? mod.split('.')
      const prefix = relativeModulePrefix(newPkg, mapped)
      changed += 1
      return `${indent}from ${prefix} import ${tail}`
    }

    return line
  })

  return { text: out.join('\n'), changed }
}
