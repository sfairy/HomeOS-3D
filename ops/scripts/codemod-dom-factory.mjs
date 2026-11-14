#!/usr/bin/env node
/**
 * codemod：把「建元素 + 设类名 + 设文本」的相邻语句收成既有的 `domElement`。
 *
 * 改写规则（只有三种形态，全部可证等价）
 * --------------------------------------
 *
 *     const el = doc.createElement('p')       const el = domElement(doc, 'p', cls, text)
 *     el.className = cls                 →
 *     el.textContent = text
 *
 *     const el = doc.createElement('p')       const el = domElement(doc, 'p', cls)
 *     el.className = cls                 →
 *
 *     const el = doc.createElement('p')       const el = domElement(doc, 'p', null, text)
 *     el.textContent = text              →
 *
 * 为什么等价：`domElement(doc, tag, className, text)` 的实现就是
 * `doc.createElement(tag)` → `element.className = className ?? ''` → `text != null && (element.textContent = String(text))`
 * （见 `app/shared/util/dom-factory.ts`）。三行写法里 `className` 一定被赋过值；`textContent`
 * 只在前两种形态里出现，因此 `null` 分支不改变任何已观察状态。可执行证明见
 * `ops/checks/dom-factory-equivalence.mjs`（假 document 逐字段比对）。
 *
 * 六道安全边界（每一条都来自一次真实的改写事故）
 * ----------------------------------------------
 * 1. **只碰相邻语句**：声明后立刻设类名/文本。中间夹了别的语句就不动 —— 顺序可能有意义。
 * 2. **只碰单行闭合的表达式**：`cls` / `text` 必须在本行括号配平。跨行的三元或字符串拼接被
 *    并进调用会截断后续行（第一次试跑就把 `x ? a : b` 折成了语法错误）。
 * 3. **下一行不能是续行**：以 `?` `:` `.` `+` `&&` `||` `??` 等开头说明上一条语句还没写完。
 * 4. **显示宽度不超过 120 列**：biome 按显示列折行，CJK 占两列；按码点数判断会让长中文行
 *    在格式化时被重新拆开，收益当场归零。
 * 5. **表达式不得引用元素本身**：`el.textContent = el.className` 这类写法在合并后会在 `el`
 *    初始化前读取它（TDZ）。虽然类型检查能拦，脚本自己就该跳过。
 * 6. **不改 DOM 顺序**：不合并父节点、不碰已有子节点、不重排任何 append。
 *
 * 用法
 * ----
 *     node ops/scripts/codemod-dom-factory.mjs --dry-run
 *     node ops/scripts/codemod-dom-factory.mjs --write
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { walkFiles } from '../lib/walk.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const SCAN_ROOT = path.join(REPO_ROOT, 'homeos/frontend/src/studio')
const FACTORY_FILE = path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/shared/util/dom-factory.ts')
const IMPORT_SPECIFIER = '@app/shared/util/dom-factory'
const MAX_DISPLAY_WIDTH = 120

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const DRY_RUN = args.includes('--dry-run') || !WRITE

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 表达式是否在**同一行**内闭合：引号与括号都配平。 */
function isBalancedOnOneLine(text) {
  let depth = 0
  let quote = null
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (char === '\\') index += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    else if ('([{'.includes(char)) depth += 1
    else if (')]}'.includes(char)) depth -= 1
    if (depth < 0) return false
  }
  return depth === 0 && quote === null
}

/** 下一行是否续接上一条语句。 */
function isContinuation(nextLine) {
  return /^\s*(\?|:|\+|\.|\*|\/|\|\||&&|\?\?|,|\)|\]|\})/.test(nextLine)
}

/** 显示宽度：CJK / 全角字符按 2 列计（biome 的 120 列是显示列）。 */
function displayWidth(text) {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0)
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f64f)
    width += wide ? 2 : 1
  }
  return width
}

/** 表达式是否引用了元素自己（合并后会在初始化前读取 → TDZ）。 */
function referencesSelf(expression, name) {
  return new RegExp(`(^|[^\\w$.])${escapeRegExp(name)}([^\\w$]|$)`).test(expression)
}

/** 在最后一条 import 后插入命名导入（已存在则不插）。 */
function ensureImport(source) {
  if (new RegExp(`from ['"]${escapeRegExp(IMPORT_SPECIFIER)}['"]`).test(source)) return source
  const importPattern = /^import\s+[^\n]*from\s+['"][^'"]+['"]\s*$/gm
  let match
  let lastEnd = 0
  while ((match = importPattern.exec(source)) !== null) lastEnd = match.index + match[0].length
  const line = `import { domElement } from '${IMPORT_SPECIFIER}'`
  if (lastEnd === 0) {
    const headerEnd = source.startsWith('/**') ? source.indexOf('*/') + 2 : 0
    const head = source.slice(0, headerEnd)
    const rest = source.slice(headerEnd).replace(/^\n+/, '')
    return head ? `${head}\n${line}\n${rest}` : `${line}\n${rest}`
  }
  return `${source.slice(0, lastEnd)}\n${line}${source.slice(lastEnd)}`
}

let rewritten = 0
const perFile = []
const files = walkFiles(SCAN_ROOT, { extensions: new Set(['.ts']) }).sort()

for (const file of files) {
  if (file === FACTORY_FILE) continue
  const original = fs.readFileSync(file, 'utf8')
  const lines = original.split('\n')
  let changedInFile = 0
  const output = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const declaration = line.match(/^(\s*)const (\w+) = ([\w$]+)\.createElement\(\s*'([a-zA-Z0-9-]+)'\s*\)\s*$/)
    if (!declaration) {
      output.push(line)
      continue
    }
    const [, indent, name, documentRef, tag] = declaration
    const nextLine = lines[index + 1] ?? ''
    const thirdLine = lines[index + 2] ?? ''
    const afterThird = lines[index + 3] ?? ''
    const classMatch = nextLine.match(new RegExp(`^${indent}${escapeRegExp(name)}\\.className = (.+)$`))
    const textMatch = nextLine.match(new RegExp(`^${indent}${escapeRegExp(name)}\\.textContent = (.+)$`))
    const thirdTextMatch = thirdLine.match(new RegExp(`^${indent}${escapeRegExp(name)}\\.textContent = (.+)$`))

    /** 形态 1：类名 + 文本。 */
    if (classMatch && thirdTextMatch) {
      const classValue = classMatch[1].trim()
      const textValue = thirdTextMatch[1].trim()
      const combined = `${indent}const ${name} = domElement(${documentRef}, '${tag}', ${classValue}, ${textValue})`
      const usable =
        isBalancedOnOneLine(classValue) &&
        isBalancedOnOneLine(textValue) &&
        !referencesSelf(classValue, name) &&
        !referencesSelf(textValue, name) &&
        !isContinuation(afterThird) &&
        displayWidth(combined) <= MAX_DISPLAY_WIDTH
      if (!usable) {
        output.push(line)
        continue
      }
      output.push(combined)
      index += 2
      changedInFile += 1
      continue
    }

    /** 形态 2：只有类名。 */
    if (classMatch) {
      const classValue = classMatch[1].trim()
      const combined = `${indent}const ${name} = domElement(${documentRef}, '${tag}', ${classValue})`
      const usable =
        isBalancedOnOneLine(classValue) &&
        !referencesSelf(classValue, name) &&
        !isContinuation(nextLine.replace(/^[^\n]*= /, '')) &&
        !isContinuation(thirdLine) &&
        displayWidth(combined) <= MAX_DISPLAY_WIDTH
      if (!usable) {
        output.push(line)
        continue
      }
      output.push(combined)
      index += 1
      changedInFile += 1
      continue
    }

    /** 形态 3：只有文本。 */
    if (textMatch) {
      const textValue = textMatch[1].trim()
      const combined = `${indent}const ${name} = domElement(${documentRef}, '${tag}', null, ${textValue})`
      const usable =
        isBalancedOnOneLine(textValue) &&
        !referencesSelf(textValue, name) &&
        !isContinuation(thirdLine) &&
        displayWidth(combined) <= MAX_DISPLAY_WIDTH
      if (!usable) {
        output.push(line)
        continue
      }
      output.push(combined)
      index += 1
      changedInFile += 1
      continue
    }

    output.push(line)
  }

  if (changedInFile === 0) continue
  const nextSource = ensureImport(output.join('\n'))
  rewritten += changedInFile
  perFile.push({
    file: path.relative(REPO_ROOT, file),
    sites: changedInFile,
    lineDelta: nextSource.split('\n').length - original.split('\n').length,
  })
  if (WRITE) fs.writeFileSync(file, nextSource)
}

console.log(`${DRY_RUN ? '[dry-run] ' : ''}改写 ${rewritten} 处 / ${perFile.length} 个文件`)
for (const row of perFile.sort((left, right) => right.sites - left.sites).slice(0, 20)) {
  console.log(`  ${String(row.sites).padStart(3)} 处  ${row.lineDelta >= 0 ? '+' : ''}${row.lineDelta} 行  ${row.file}`)
}
