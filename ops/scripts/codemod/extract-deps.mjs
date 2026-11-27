#!/usr/bin/env node
/**
 * 把「装配根」里的 deps 提供器拆成独立文件。
 *
 * 背景：`studio/app/editor/home/lifecycle/boot.ts` 4893 行，其中 4600 行是 19 个
 * `xxxDeps()` 闭包 —— 每个函数返回一个依赖对象，把上百个 `*Impl` 函数塞进对应模块。
 * 这类文件是组合根（composition root），本身没有业务逻辑，但一个文件塞 19 份装配
 * 无法按关注点定位：改贴纸面板要翻到 2400 行，改导航预览要翻到 3000 行。
 *
 * 拆分原则：
 * - `boot.ts` 只保留 `bootEditor()` / `teardownEditor()` 与模块级状态 → 真正的组装根；
 * - 每个 `xxxDeps()` 单独成文件，只带它真正用到的 import（按标识符扫描）；
 * - 入参类型（`ShellControlsDeps` 等）随函数一起搬走，boot.ts 不再需要那 60 条导入别名。
 *
 * 用法：
 *   node ops/scripts/codemod/extract-deps.mjs --file <boot.ts> [--write]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const WRITE = process.argv.includes('--write')
const fileIndex = process.argv.indexOf('--file')
const target = process.argv[fileIndex + 1]

if (!target) {
  console.error('用法: extract-deps.mjs --file <path> [--write]')
  process.exit(2)
}

const absPath = resolve(REPO_ROOT, target)
const source = readFileSync(absPath, 'utf8')
const lines = source.split('\n')

/**
 * 在字符级扫描一整个文件，返回每个位置是否处于「代码」状态。
 *
 * 必须跳过字符串 / 模板串 / 注释：它们内部的 `{` `}` 会让花括号计数失真
 * （实测：`navigationPreviewDeps` 里含 CSS 模板串，朴素计数把 1462 行算成 30 行）。
 * @param {string} text
 * @returns {Uint8Array} 1 = 代码，0 = 字符串/注释
 */
function codeMask(text) {
  const mask = new Uint8Array(text.length).fill(1)
  let index = 0
  while (index < text.length) {
    const char = text[index]
    const next = text[index + 1]
    if (char === '/' && next === '/') {
      while (index < text.length && text[index] !== '\n') mask[index++] = 0
      continue
    }
    if (char === '/' && next === '*') {
      mask[index++] = 0
      mask[index++] = 0
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) mask[index++] = 0
      if (index < text.length) {
        mask[index++] = 0
        mask[index++] = 0
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      const quote = char
      mask[index++] = 0
      while (index < text.length && text[index] !== quote) {
        if (text[index] === '\\') mask[index++] = 0
        if (index < text.length) mask[index++] = 0
      }
      if (index < text.length) mask[index++] = 0
      continue
    }
    index += 1
  }
  return mask
}

/** 找到所有顶层 `function xxxDeps(` 的起止行（0-based，含端点）。 */
function findDepsBlocks() {
  const text = lines.join('\n')
  const mask = codeMask(text)
  // 行首偏移表
  const lineStarts = [0]
  for (let index = 0; index < text.length; index += 1) if (text[index] === '\n') lineStarts.push(index + 1)

  const blocks = []
  for (let lineNo = 0; lineNo < lines.length; lineNo += 1) {
    const match = lines[lineNo].match(/^function ([A-Za-z_$][\w$]*Deps)\s*\(/)
    if (!match) continue
    // 向上吸收紧邻的 JSDoc / 行注释
    let start = lineNo
    while (start > 0) {
      const previous = lines[start - 1].trim()
      if (
        previous.endsWith('*/') ||
        previous.startsWith('*') ||
        previous.startsWith('/**') ||
        previous.startsWith('//')
      ) {
        start -= 1
        continue
      }
      break
    }
    // 字符级数花括号
    let depth = 0
    let opened = false
    let end = lineNo
    for (let cursor = lineStarts[lineNo]; cursor < text.length; cursor += 1) {
      if (!mask[cursor]) continue
      if (text[cursor] === '{') {
        depth += 1
        opened = true
      } else if (text[cursor] === '}') {
        depth -= 1
        if (opened && depth === 0) {
          // 换算回行号
          let low = 0
          let high = lineStarts.length - 1
          while (low < high) {
            const mid = Math.ceil((low + high) / 2)
            if (lineStarts[mid] <= cursor) low = mid
            else high = mid - 1
          }
          end = low
          break
        }
      }
    }
    blocks.push({ name: match[1], start, end, body: lines.slice(start, end + 1).join('\n') })
    lineNo = end
  }
  return blocks
}

/** 解析 import 语句 → { source, specifiers: [{ imported, local }], clause }。 */
function parseImports() {
  const out = []
  let buffer = null
  for (const line of lines) {
    if (buffer === null && !/^import\s/.test(line.trim())) {
      if (/^import\s/.test(line)) buffer = [line]
      continue
    }
    if (buffer === null && /^import\s/.test(line)) {
      buffer = [line]
    } else if (buffer !== null) {
      buffer.push(line)
    } else {
      continue
    }
    const joined = buffer.join('\n')
    const quotes = (joined.match(/['"]/g) ?? []).length
    if (quotes < 2 || quotes % 2 !== 0) continue
    if (!/\bfrom\s+['"][^'"]+['"]/.test(joined)) continue
    const sourceMatch = joined.match(/from\s+['"]([^'"]+)['"]/)
    const namedMatch = joined.match(/\{([^{}]*)\}/)
    const specifiers = []
    if (namedMatch) {
      for (const part of namedMatch[1].split(',')) {
        const piece = part.trim().replace(/^type\s+/, '')
        if (!piece) continue
        const [imported, local = imported] = piece.split(/\s+as\s+/).map((s) => s.trim())
        specifiers.push({ imported, local, isType: /^type\s/.test(part.trim()) })
      }
    }
    const defaultMatch = joined.match(/^import\s+(?!type\b)([A-Za-z_$][\w$]*)\s*(?:,|from)/)
    out.push({
      statement: joined,
      source: sourceMatch ? sourceMatch[1] : '',
      specifiers,
      defaultLocal: defaultMatch ? defaultMatch[1] : null,
    })
    buffer = null
  }
  return out
}

const blocks = findDepsBlocks()
const imports = parseImports()
console.log(`找到 ${blocks.length} 个 deps 提供器，${imports.length} 条 import`)

/** 某个标识符是否在该段文本里作为独立记号出现。 */
function uses(body, name) {
  return new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(body)
}

const depsDir = join(dirname(absPath), 'deps')
if (WRITE) mkdirSync(depsDir, { recursive: true })

const kebab = (name) =>
  name
    .replace(/Deps$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
const written = []

for (const block of blocks) {
  // 该函数用到的外部绑定
  const needed = []
  for (const item of imports) {
    const keep = item.specifiers.filter((spec) => uses(block.body, spec.local))
    const keepDefault = item.defaultLocal && uses(block.body, item.defaultLocal)
    if (!keep.length && !keepDefault) continue
    if (item.specifiers.length && !keep.length && !keepDefault) continue
    const parts = []
    if (keepDefault) parts.push(item.defaultLocal)
    if (keep.length) {
      parts.push(
        `{ ${keep.map((s) => (s.imported === s.local ? `${s.isType ? 'type ' : ''}${s.local}` : `${s.isType ? 'type ' : ''}${s.imported} as ${s.local}`)).join(', ')} }`,
      )
    }
    needed.push(`import ${parts.join(', ')} from '${item.source}'`)
  }

  const fileName = `${kebab(block.name)}.ts`
  const content = [
    `/**`,
    ` * \`${block.name}\`：从 \`${target.split('/').pop()}\` 抽出。`,
    ` *`,
    ` * 组合根的一环：只负责把实现函数装配成该模块需要的依赖对象，不含业务逻辑。`,
    ` * 抽出的理由是原文件把 ${blocks.length} 份装配塞在一起（约 ${lines.length} 行），`,
    ` * 改任一面板都要在大文件里按行号定位。`,
    ` */`,
    ...needed,
    '',
    block.body.replace(/^function /, 'export function '),
    '',
  ].join('\n')
  written.push({ name: block.name, fileName, content, characters: content.length })
  if (WRITE) writeFileSync(join(depsDir, fileName), content, 'utf8')
  console.log(`  ${block.name} → deps/${fileName}（${block.body.split('\n').length} 行，${needed.length} 条 import）`)
}

if (!WRITE) {
  console.log('\nDRY RUN：加 --write 落盘。')
  process.exit(0)
}

// 重建 boot.ts：删掉已抽出的块，加上新导入
const removeRanges = blocks.map((b) => [b.start, b.end])
const kept = []
for (let index = 0; index < lines.length; index += 1) {
  if (removeRanges.some(([start, end]) => index >= start && index <= end)) continue
  kept.push(lines[index])
}
const importLines = blocks.map((b) => `import { ${b.name} } from './deps/${kebab(b.name)}'`).join('\n')

// 在最后一条 import 之后插入新导入
let lastImport = -1
for (let index = 0; index < kept.length; index += 1) if (/^import\s/.test(kept[index])) lastImport = index
kept.splice(lastImport + 1, 0, importLines)
// 去掉被抽空后留下的连续空行
const cleaned = kept.join('\n').replace(/\n{3,}/g, '\n\n')
writeFileSync(absPath, cleaned, 'utf8')
console.log(`\nboot.ts：${lines.length} 行 → ${cleaned.split('\n').length} 行`)
