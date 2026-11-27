#!/usr/bin/env node
/**
 * 删除未被使用的具名导入。
 *
 * 为什么需要：`extract-deps.mjs` 把装配函数搬走后，`boot.ts` 顶部那 60 条
 * 「一次导入 20-60 个符号」的别名导入全部变成未使用（TS6133 铺满 983 行）。
 * 手删既慢又容易误删 —— 必须按「标识符是否在 import 段之外出现」精确判定。
 *
 * 判定口径：
 * - 只处理**具名导入**（`{ a, b as c }`）与默认导入；
 * - `import type` 与内联 `type` 修饰符同样处理；
 * - 名字在 import 段之外出现即保留（含注释里的提及 —— 宁可少删，不可误删）；
 * - 一条 import 若全部绑定都被删掉，整条删除（`import 'x'` 副作用导入除外）。
 *
 * 用法：
 *   node ops/scripts/codemod/prune-unused-imports.mjs <file>... [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const WRITE = process.argv.includes('--write')
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))

if (!files.length) {
  console.error('用法: prune-unused-imports.mjs <file>... [--write]')
  process.exit(2)
}

/** 判断一条 import 语句是否完整（引号成对且含 from 或副作用形态）。 */
function isComplete(statement) {
  const quotes = (statement.match(/['"]/g) ?? []).length
  if (quotes === 0 || quotes % 2 !== 0) return false
  return /\bfrom\s+['"][^'"]+['"]\s*;?\s*$/.test(statement) || /^\s*import\s+['"][^'"]+['"]\s*;?\s*$/.test(statement)
}

/** 拆分 import 段与正文。 */
function split(text) {
  const imports = []
  const body = []
  let buffer = null
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (buffer === null && /^import\s/.test(trimmed) && !trimmed.startsWith('import(')) {
      buffer = [line]
      if (isComplete(line)) {
        imports.push(line)
        buffer = null
      }
      continue
    }
    if (buffer !== null) {
      buffer.push(line)
      if (isComplete(buffer.join('\n'))) {
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

let totalRemoved = 0
for (const file of files) {
  const abs = resolve(REPO_ROOT, file)
  const text = readFileSync(abs, 'utf8')
  const { imports, body } = split(text)

  const kept = []
  const removedNames = []
  for (const statement of imports) {
    // 副作用导入原样保留
    if (/^import\s+['"]/.test(statement.trim())) {
      kept.push(statement)
      continue
    }
    const namedMatch = statement.match(/\{([^{}]*)\}/)
    const defaultMatch = statement.match(/^import\s+(?:type\s+)?(?!\s*\{)([A-Za-z_$][\w$]*)\s*(?:,|from)/)
    const used = (name) => new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(body)

    const survivors = []
    if (namedMatch) {
      for (const part of namedMatch[1].split(',')) {
        const piece = part.trim()
        if (!piece) continue
        const body2 = piece.replace(/^type\s+/, '')
        const [imported, local = imported] = body2.split(/\s+as\s+/).map((s) => s.trim())
        if (used(local)) survivors.push(piece)
        else removedNames.push(local)
      }
    }
    const keepDefault = defaultMatch && used(defaultMatch[1])
    if (defaultMatch && !keepDefault) removedNames.push(defaultMatch[1])

    if (!namedMatch && !defaultMatch) {
      kept.push(statement)
      continue
    }
    const parts = []
    if (keepDefault) parts.push(defaultMatch[1])
    if (namedMatch && survivors.length) parts.push(`{ ${survivors.join(', ')} }`)
    if (!parts.length) continue // 全部未使用 → 整条删除
    const source = statement.match(/from\s+['"]([^'"]+)['"]/)[1]
    const typePrefix = /^import\s+type\s/.test(statement.trim()) ? 'type ' : ''
    kept.push(`import ${typePrefix}${parts.join(', ')} from '${source}'`)
  }

  if (!removedNames.length) continue
  totalRemoved += removedNames.length
  console.log(`  ${file}: 删除 ${removedNames.length} 个未使用绑定`)
  const next = `${[...kept, '', body].join('\n').replace(/\n{3,}/g, '\n\n')}`
  if (WRITE) writeFileSync(abs, next, 'utf8')
}

console.log(`${WRITE ? '已改写' : '待改写'}：共 ${totalRemoved} 个未使用绑定`)
