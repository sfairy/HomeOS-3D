#!/usr/bin/env node
/**
 * CSS 重复声明体归并（保守版）。
 *
 * 做什么
 * ------
 * 同一个文件、同一个容器（顶层或同一个 `@media` / `@supports` 块）里，若两条规则的声明体
 * **逐字段完全相同**，就把后一条的选择器并进前一条，删掉重复那一条。
 *
 * 为什么不会改变层叠结果（可证明条件）
 * ------------------------------------
 * 把声明从「后来的规则」挪到「前面的规则」会改变顺序，只有**中间存在声明同类属性的规则**时
 * 才可能改变结果。因此只在同时满足下面两条时合并：
 *   1. 同一容器（跨 `@media` 合并会改变生效的媒体条件）；
 *   2. 两条规则之间没有任何规则声明与目标声明体「同族属性」——族按 `-` 前第一段判定，
 *      `margin` 与 `margin-top`、`background` 与 `background-color` 都算同族（宁严不宽）。
 * 满足这两条时，这批属性的最终取值只由这批完全相同的声明决定，位置提前不改变结果。
 *
 * 选择器与特异性：只是把两个选择器并进**同一条规则**的选择器列表，没有改写任何选择器，
 * 特异性仍由各自的选择器决定；列表顺序保持「先出现者在前」，与两条独立规则的匹配顺序一致。
 *
 * 不做什么
 * --------
 * - 不引入工具类、不改选择器、不动 `!important`、不重排声明、不做跨文件合并；
 * - 不处理 `.vue` 的 `<style>` 块（与 SFC 解析耦合，收益小于风险）；
 * - 声明体不足 3 条、或属性同族规则夹在中间时，一律不合并。
 *
 * 用法
 * ----
 *     node ops/scripts/merge-css-duplicates.mjs --report   # 只列可合并项
 *     node ops/scripts/merge-css-duplicates.mjs --check    # 有可合并项即退出 1
 *     node ops/scripts/merge-css-duplicates.mjs --write
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { walkFiles } from '../lib/walk.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const SCAN_ROOT = path.join(REPO_ROOT, 'homeos/frontend/src')
const MIN_DECLARATIONS = 3

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const CHECK = args.includes('--check')
const REPORT = args.includes('--report') || (!WRITE && !CHECK)

/** 极简 CSS 结构扫描：切出「选择器 + 声明体」与 at-rule 容器，不建完整 AST。 */
function parseContainer(source, start, end) {
  const nodes = []
  let index = start
  while (index < end) {
    if (/\s/.test(source[index])) {
      index += 1
      continue
    }
    if (source[index] === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2)
      index = close < 0 ? end : close + 2
      continue
    }
    const braceIndex = findNextBrace(source, index, end)
    if (braceIndex < 0) break
    const prelude = source.slice(index, braceIndex)
    const bodyEnd = matchBrace(source, braceIndex)
    if (bodyEnd < 0) break
    if (prelude.trim().startsWith('@')) {
      nodes.push({ type: 'at', children: parseContainer(source, braceIndex + 1, bodyEnd) })
    } else {
      nodes.push({
        type: 'rule',
        start: index,
        end: bodyEnd + 1,
        selectors: prelude.trim().replace(/\s+/g, ' '),
        declarationStart: braceIndex + 1,
        declarationEnd: bodyEnd,
        declarations: source.slice(braceIndex + 1, bodyEnd),
      })
    }
    index = bodyEnd + 1
  }
  return nodes
}

function findNextBrace(source, from, end) {
  let depth = 0
  for (let index = from; index < end; index += 1) {
    const char = source[index]
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (char === '{' && depth === 0) return index
  }
  return -1
}

function matchBrace(source, openIndex) {
  let depth = 0
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** 声明体规范化：去注释、按 `;` 切、去首尾空白、保留书写顺序。 */
function readDeclarations(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
}

/** 属性族：`margin-top` → `margin`；自定义属性取全名。 */
function familiesOf(declarations) {
  const families = new Set()
  for (const declaration of declarations) {
    const colon = declaration.indexOf(':')
    if (colon < 0) continue
    const name = declaration.slice(0, colon).trim().toLowerCase()
    families.add(name.startsWith('--') ? name : name.split('-')[0])
  }
  return families
}

/** 在一个容器的规则序列里找可合并对；返回 `[{ keepIndex, dropIndex }]`。 */
function findMerges(nodes) {
  const merges = []
  const firstIndexByBody = new Map()
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node.type !== 'rule') continue
    const declarations = readDeclarations(node.declarations)
    if (declarations.length < MIN_DECLARATIONS) continue
    const key = declarations.join(';')
    const firstIndex = firstIndexByBody.get(key)
    if (firstIndex === undefined) {
      firstIndexByBody.set(key, index)
      continue
    }
    const families = familiesOf(declarations)
    let safe = true
    for (let between = firstIndex + 1; between < index && safe; between += 1) {
      const betweenNode = nodes[between]
      if (betweenNode.type !== 'rule') continue
      for (const family of familiesOf(readDeclarations(betweenNode.declarations))) {
        if (families.has(family)) {
          safe = false
          break
        }
      }
    }
    if (safe) merges.push({ keepIndex: firstIndex, dropIndex: index })
  }
  return merges
}

/** 收集整份文件的编辑（基于原文偏移，互不重叠）。 */
function collectEdits(source) {
  const edits = []
  const visit = (nodes) => {
    for (const node of nodes) if (node.type === 'at' && node.children) visit(node.children)
    for (const { keepIndex, dropIndex } of findMerges(nodes)) {
      const keep = nodes[keepIndex]
      const drop = nodes[dropIndex]
      if (drop.selectors === keep.selectors) continue
      const braceOffset = keep.declarationStart - 1
      const prelude = source.slice(keep.start, braceOffset)
      const body = source.slice(braceOffset, keep.end)
      // 缩进取「规则起始行」的行首缩进：多行选择器的续行缩进比规则本身更深，拿它会让
      // 并进去的选择器缩进错位。
      const lineStart = source.lastIndexOf('\n', keep.start) + 1
      const lineIndent = source.slice(lineStart, keep.start)
      const indentMatch = /^[ \t]*$/.test(lineIndent) ? [null, lineIndent] : prelude.match(/\n([ \t]*)\S/)
      // 选择器列表的排版跟随声明体：多行体用多行选择器，单行体保持单行 —— 与 biome 的
      // 输出一致，避免脚本跑完后还要再格式化一遍（那会让「合并收益」被格式化噪声污染）。
      const multiline = body.includes('\n')
      const separator = multiline ? `,\n${indentMatch ? indentMatch[1] : ''}` : ', '
      edits.push({
        start: keep.start,
        end: keep.end,
        text: `${prelude.trimEnd()}${separator}${drop.selectors} ${body}`,
        dropStart: drop.start,
        dropEnd: drop.end,
        selectors: drop.selectors,
      })
    }
  }
  visit(parseContainer(source, 0, source.length))
  return edits
}

function applyEdits(source, edits) {
  const ordered = [...edits].sort((left, right) => right.dropStart - left.dropStart || right.start - left.start)
  let output = source
  for (const edit of ordered) {
    output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end, edit.dropStart)}${output.slice(edit.dropEnd)}`
  }
  return output
}

let totalMerged = 0
let totalDelta = 0
const perFile = []
const files = walkFiles(SCAN_ROOT, { extensions: new Set(['.css']) }).sort()

for (const file of files) {
  if (file.includes('/public/')) continue
  const original = fs.readFileSync(file, 'utf8')
  const edits = collectEdits(original)
  if (edits.length === 0) continue
  const next = applyEdits(original, edits)
  const lineDelta = next.split('\n').length - original.split('\n').length
  perFile.push({ file: path.relative(REPO_ROOT, file), merged: edits.length, lineDelta })
  totalMerged += edits.length
  totalDelta += lineDelta
  if (WRITE) fs.writeFileSync(file, next)
}

const mode = WRITE ? '[write] ' : CHECK ? '[check] ' : '[report] '
console.log(
  `${mode}合并 ${totalMerged} 条重复规则 / ${perFile.length} 个文件，预期行数变化 ${totalDelta >= 0 ? '+' : ''}${totalDelta}`,
)
for (const row of [...perFile].sort((left, right) => left.lineDelta - right.lineDelta).slice(0, 20)) {
  console.log(
    `  ${String(row.merged).padStart(3)} 条  ${row.lineDelta >= 0 ? '+' : ''}${row.lineDelta} 行  ${row.file}`,
  )
}
if (CHECK && totalMerged > 0) {
  console.error('仍有可合并的重复声明体；确认无误后运行 --write。')
  process.exit(1)
}
if (REPORT && totalMerged === 0) console.log('没有可合并项。')
