#!/usr/bin/env node
/**
 * 把「巨型逗号表达式」拆成独立语句。
 *
 * 现状：`bootEditor` 里有 21 处形如
 *
 * ```ts
 * (window.addEventListener("pagehide", flush),
 *   projectNewElement.addEventListener("click", () => { … }),
 *   … // 共 200 多个成员、1000 多行
 * );
 * ```
 *
 * 逗号表达式与「一串语句」在该位置**语义完全等价**（结果值被丢弃），但它让
 * git blame、断点、单条注释全部失效：任何一行改动都显示为「同一个表达式变了」。
 *
 * 本脚本做纯语法变换：
 * - 找到每个在**列 0** 开始的 `(` 表达式（本文件里这些全是逗号表达式）；
 * - 用字符级扫描找它的匹配 `)`，并在**深度 1 的逗号**处切分；
 * - 每个成员输出成独立语句，去掉外层括号。
 *
 * 不动任何标识符、不动缩进内部的代码。
 *
 * 用法：
 *   node ops/scripts/codemod/split-comma-expressions.mjs <file> [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const WRITE = process.argv.includes('--write')
const target = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!target) {
  console.error('用法: split-comma-expressions.mjs <file> [--write]')
  process.exit(2)
}

const absPath = resolve(REPO_ROOT, target)
const source = readFileSync(absPath, 'utf8')

/** 标注每个位置是否处于代码（非字符串 / 注释）。 */
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

const mask = codeMask(source)

/** 找 `start` 处的 `(` 对应的 `)`。 */
function matchParen(start) {
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    if (!mask[index]) continue
    if (source[index] === '(') depth += 1
    else if (source[index] === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** 找所有「行首列 0 的 `(`」并把表达式切成成员。 */
const expressions = []
const LINE_START = /^\(/gm
for (const match of source.matchAll(LINE_START)) {
  const open = match.index
  const close = matchParen(open)
  if (close < 0) continue
  // 只处理真正的逗号表达式：深度 1 至少出现一个逗号
  const members = []
  let depth = 0
  let memberStart = open + 1
  let hasTopComma = false
  for (let index = open; index <= close; index += 1) {
    if (!mask[index]) continue
    const char = source[index]
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') depth -= 1
    else if (char === ',' && depth === 1) {
      hasTopComma = true
      members.push(source.slice(memberStart, index))
      memberStart = index + 1
    }
  }
  members.push(source.slice(memberStart, close))
  if (!hasTopComma || members.length < 2) {
    // 单成员：只去掉多余括号
    expressions.push({ open, close, members: [source.slice(open + 1, close)], single: true })
    continue
  }
  expressions.push({ open, close, members, single: false })
}

console.log(
  `找到 ${expressions.length} 处列 0 的括号表达式，其中 ${expressions.filter((e) => !e.single).length} 处是逗号表达式`,
)
console.log(`成员总数：${expressions.reduce((sum, e) => sum + e.members.length, 0)}`)

if (!WRITE) {
  const sample = expressions.find((e) => !e.single)
  if (sample) {
    console.log(`\n示例（第 ${source.slice(0, sample.open).split('\n').length} 行）：`)
    for (const member of sample.members.slice(0, 3)) {
      console.log(`  ${member.trim().split('\n')[0].slice(0, 90)} …;`)
    }
  }
  console.log('\nDRY RUN：加 --write 落盘。')
  process.exit(0)
}

// 从后往前替换，避免偏移失效
let output = source
for (const expression of [...expressions].reverse()) {
  const indent = '  '
  const statements = expression.members.map((member) => {
    const trimmed = member.trim()
    if (!trimmed) return ''
    // 成员自身的多行代码保留内部缩进，只重写首行缩进
    const lines = trimmed.split('\n')
    const head = `${indent}${lines[0]}`
    const rest = lines.slice(1).map((line) => (line.trim() ? line : ''))
    return [head, ...rest].join('\n')
  })
  const replacement = statements
    .filter(Boolean)
    .map((s) => `${s};`)
    .join('\n')
  output = output.slice(0, expression.open) + replacement + output.slice(expression.close + 1)
}

writeFileSync(absPath, output, 'utf8')
console.log(`已改写：${source.split('\n').length} 行 → ${output.split('\n').length} 行`)
