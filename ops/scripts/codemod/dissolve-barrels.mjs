#!/usr/bin/env node
/**
 * 解散「模块内部 barrel」：把 `export ... from './x'` 摊平成调用方直连。
 *
 * 判据：`index.ts` 只应出现在**模块边界**（`features/<cap>/`、`kernel/`、`domain/<mod>/`、
 * `studio/`）。模块内部的二级 barrel（如 `kernel/perf/index.ts`、`studio/authoring/ui/index.ts`）
 * 只是多一跳转发，让「这个符号到底定义在哪」变得不可见。
 *
 * 做法：
 * 1. 解析 barrel 的 `export * from './x'` 与 `export { a, b as c } from './y'`，建「符号 → 源文件」表；
 * 2. 找到所有 import 该 barrel 的文件，把具名导入按来源拆成多条（指向具体文件）；
 * 3. 无法解析的具名导入（找不到来源）→ 报错退出，不猜；
 * 4. 删除 barrel。
 *
 * 用法：
 *   node ops/scripts/codemod/dissolve-barrels.mjs <barrel.ts>... [--write]
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { walkFiles } from '../../lib/walk.mjs'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const WRITE = process.argv.includes('--write')
const barrels = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!barrels.length) {
  console.error('用法: dissolve-barrels.mjs <barrel.ts>... [--write]')
  process.exit(2)
}

const RESOLVE_EXTS = ['.ts', '.tsx', '.vue', '/index.ts']

/** 把说明符解析成真实文件（相对 barrel 所在目录）。 */
function resolveSpec(base, spec) {
  if (!spec.startsWith('.')) return null
  const abs = resolve(REPO_ROOT, base, spec)
  for (const ext of RESOLVE_EXTS) if (existsSync(abs + ext)) return abs + ext
  return null
}

/** 解析一个 barrel → Map<导出名, 绝对文件路径>。 */
function parseBarrel(barrelAbs) {
  const base = dirname(barrelAbs)
  const map = new Map()
  const starFiles = []
  const text = readFileSync(barrelAbs, 'utf8')

  for (const match of text.matchAll(/^[ \t]*export\s+\*\s+from\s+['"]([^'"]+)['"]/gm)) {
    const file = resolveSpec(base, match[1])
    if (file) starFiles.push(file)
  }
  for (const match of text.matchAll(/^[ \t]*export\s+(?:type\s+)?\{([^{}]*)\}\s+from\s+['"]([^'"]+)['"]/gm)) {
    const file = resolveSpec(base, match[2])
    if (!file) continue
    for (const part of match[1].split(',')) {
      const piece = part.trim().replace(/^type\s+/, '')
      if (!piece) continue
      const [orig, alias] = piece.split(/\s+as\s+/).map((s) => s.trim())
      map.set(alias ?? orig, file)
    }
  }
  // `export * from` 的目标：读取它自己的导出名
  for (const file of starFiles) {
    if (!existsSync(file)) continue
    const content = readFileSync(file, 'utf8')
    for (const m of content.matchAll(
      /^export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm,
    )) {
      if (!map.has(m[1])) map.set(m[1], file)
    }
    for (const m of content.matchAll(/^export\s+(?:type\s+)?\{([^{}]*)\}/gm)) {
      for (const part of m[1].split(',')) {
        const piece = part.trim().replace(/^type\s+/, '')
        if (!piece) continue
        const [orig, alias] = piece.split(/\s+as\s+/).map((s) => s.trim())
        if (!map.has(alias ?? orig)) map.set(alias ?? orig, file)
      }
    }
  }
  return map
}

/** 找所有 import 了这个 barrel 的文件（按仓库绝对路径匹配）。 */
function findImporters(barrelAbs) {
  const barrelNoExt = barrelAbs.replace(/\.tsx?$/, '').replace(/\/index$/, '')
  const roots = ['homeos/frontend/src', 'packages/shared/src', 'homeos-store/frontend/src']
  const hits = []
  for (const root of roots) {
    const rootAbs = resolve(REPO_ROOT, root)
    if (!existsSync(rootAbs)) continue
    for (const file of walkFiles(rootAbs)) {
      if (!/\.(ts|tsx|vue)$/.test(file) || file === barrelAbs) continue
      const text = readFileSync(file, 'utf8')
      if (!/from\s+['"]/.test(text) && !/<style/.test(text)) continue
      hits.push({ file, text })
    }
  }
  return { hits, barrelNoExt }
}

/** 说明符是否指向该 barrel（同时支持别名与前缀）。 */
function specTargetsBarrel(spec, importerAbs, barrelNoExt) {
  const FRONTEND = resolve(REPO_ROOT, 'homeos/frontend/src')
  let abs = null
  if (spec.startsWith('.')) abs = resolve(dirname(importerAbs), spec)
  else if (spec.startsWith('@app/')) abs = resolve(FRONTEND, 'studio/app', spec.slice(5))
  else if (spec.startsWith('@runtime/')) abs = resolve(FRONTEND, 'studio/runtime', spec.slice(9))
  else if (spec.startsWith('@/')) abs = resolve(FRONTEND, spec.slice(2))
  if (!abs) return false
  const noExt = abs.replace(/\.tsx?$/, '')
  return noExt === barrelNoExt || noExt === `${barrelNoExt}/index`
}

/** 生成「调用方 → 目标文件」的说明符：同名目录用别名，否则相对。 */
function specFor(importerAbs, targetAbs) {
  const FRONTEND = resolve(REPO_ROOT, 'homeos/frontend/src')
  const target = targetAbs.replace(/\.tsx?$/, '')
  if (target.startsWith(`${FRONTEND}/`)) {
    const rel = relative(FRONTEND, target).split(sep).join('/')
    if (rel.startsWith('studio/app/')) return `@app/${rel.slice('studio/app/'.length)}`
    if (rel.startsWith('studio/runtime/')) return `@runtime/${rel.slice('studio/runtime/'.length)}`
    return `@/${rel}`
  }
  const r = relative(dirname(importerAbs), target).split(sep).join('/')
  return r.startsWith('.') ? r : `./${r}`
}

let failures = 0

for (const barrelRel of barrels) {
  const barrelAbs = resolve(REPO_ROOT, barrelRel)
  if (!existsSync(barrelAbs)) {
    console.log(`  跳过（不存在）：${barrelRel}`)
    continue
  }
  const symbolMap = parseBarrel(barrelAbs)
  const { hits, barrelNoExt } = findImporters(barrelAbs)
  let touched = 0

  for (const { file, text } of hits) {
    let next = text
    let changed = false
    // 逐条 `import { ... } from '<barrel>'`
    next = next.replace(
      /^([ \t]*)import\s+(?:type\s+)?\{([^{}]*)\}\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm,
      (statement, indent, inner, spec) => {
        if (!specTargetsBarrel(spec, file, barrelNoExt)) return statement
        const groups = new Map()
        const unknown = []
        for (const part of inner.split(',')) {
          const piece = part.trim()
          if (!piece) continue
          const isType = /^type\s+/.test(piece)
          const body = piece.replace(/^type\s+/, '')
          const [orig, alias] = body.split(/\s+as\s+/).map((s) => s.trim())
          const file2 = symbolMap.get(orig)
          if (!file2) {
            unknown.push(piece)
            continue
          }
          const rel = specFor(file, file2)
          const rendered = alias ? `${orig} as ${alias}` : orig
          if (!groups.has(rel)) groups.set(rel, [])
          groups.get(rel).push(isType ? `type ${rendered}` : rendered)
        }
        if (unknown.length) {
          console.error(`  ✗ ${barrelRel}: ${file} 引用了无法解析的符号 ${unknown.join(', ')}`)
          failures += 1
          return statement
        }
        changed = true
        return [...groups.entries()]
          .map(([rel, names]) => `${indent}import { ${names.join(', ')} } from '${rel.replace(/\/index$/, '')}'`)
          .join('\n')
      },
    )
    if (!changed) continue
    touched += 1
    if (WRITE) writeFileSync(file, next, 'utf8')
  }

  console.log(`  ${barrelRel}: ${symbolMap.size} 个导出 → 改 ${touched} 个调用文件`)
  if (WRITE && !failures) rmSync(barrelAbs, { force: true })
}

console.log(WRITE ? '\n已应用。' : '\nDRY RUN：加 --write 落盘。')
if (failures) process.exit(1)
