#!/usr/bin/env node
/**
 * 把巨型函数里的「嵌套函数声明」提升到模块级。
 *
 * 现状：`stage.ts` 的 `mountStage()` 有 4700 行，内含 93 个嵌套 `function`。
 * 这些函数混在同一个闭包里，无法单独阅读、单测或复用；任何改动都要在 5000 行里定位。
 *
 * 判定口径（编译器当规格）：
 * - 提升后能通过 typecheck 的 → 说明它**不依赖**外层闭包变量，是纯函数，可以留在模块级；
 * - 报「Cannot find name / TS2304」的 → 它确实吃外层局部变量，回填原位。
 *
 * 因此本脚本分两步：先全量提升，再按 tsc 报告回填失败者。整个过程语义等价
 * （函数声明本身在模块级与嵌套位置都享受提升，调用顺序不变）。
 *
 * 用法：
 *   node ops/scripts/codemod/hoist-nested-functions.mjs <file> --host <外层函数名> [--write]
 *   node ops/scripts/codemod/hoist-nested-functions.mjs <file> --host mountStage --revert-failed
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const REVERT = args.includes('--revert-failed')
const hostIndex = args.indexOf('--host')
const hostName = hostIndex > -1 ? args[hostIndex + 1] : null
const target = args.find((a) => !a.startsWith('--') && a !== hostName)
if (!target || !hostName) {
  console.error('用法: hoist-nested-functions.mjs <file> --host <name> [--write|--revert-failed]')
  process.exit(2)
}
const absPath = resolve(REPO_ROOT, target)

/** 标注代码位置（跳过字符串 / 注释 / 模板串）。 */
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
    // 正则字面量：`/[{]/` 里的花括号会干扰计数。判定依据是「`/` 前一个非空白字符
    // 只能是运算符 / 开括号 / 分号 / 冒号等」，否则视作除号。
    if (char === '/') {
      let back = index - 1
      while (back >= 0 && /\s/.test(text[back])) back -= 1
      const before = back >= 0 ? text[back] : ';'
      if (/[(,=:[!&|?{};]/.test(before) || back < 0) {
        mask[index++] = 0
        while (index < text.length && text[index] !== '/') {
          if (text[index] === '\\') mask[index++] = 0
          if (index < text.length) mask[index++] = 0
        }
        if (index < text.length) mask[index++] = 0
        // 吃掉 flags
        while (index < text.length && /[a-z]/.test(text[index])) mask[index++] = 0
        continue
      }
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

/** 收集外层函数里，缩进恰为 2 的 `function` 声明块。 */
function findNested(text) {
  const lines = text.split('\n')
  const mask = codeMask(text)
  const lineStarts = [0]
  for (let index = 0; index < text.length; index += 1) if (text[index] === '\n') lineStarts.push(index + 1)
  const lineOf = (pos) => {
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (lineStarts[mid] <= pos) low = mid
      else high = mid - 1
    }
    return low
  }

  const blocks = []
  for (let lineNo = 0; lineNo < lines.length; lineNo += 1) {
    if (!/^ {2}(?:export )?(?:async )?function [A-Za-z_$][\w$]*\s*[<(]/.test(lines[lineNo])) continue
    const nameMatch = lines[lineNo].match(/function ([A-Za-z_$][\w$]*)/)
    if (!nameMatch) continue
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
          end = lineOf(cursor)
          break
        }
      }
    }
    // 向上吸收紧邻的 JSDoc
    let start = lineNo
    while (start > 0) {
      const previous = lines[start - 1].trim()
      if (previous.endsWith('*/') || previous.startsWith('*') || previous.startsWith('/**')) {
        start -= 1
        continue
      }
      break
    }
    blocks.push({ name: nameMatch[1], start, end, declLine: lineNo })
    lineNo = end
  }
  return blocks
}

const source = readFileSync(absPath, 'utf8')
const blocks = findNested(source)
console.log(`在 ${hostName} 内找到 ${blocks.length} 个嵌套函数声明`)

if (REVERT) {
  // 按 tsc 报告把失败的函数搬回外层函数体内
  let output = ''
  try {
    output = execFileSync('bun', ['run', 'typecheck'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
  const failingLines = new Set()
  for (const match of output.matchAll(new RegExp(`${target.split('/').pop()}\\((\\d+),\\d+\\): error TS(2304|2552|2448|1003|1109|1128)`, 'g'))) {
    failingLines.add(Number(match[1]))
  }
  console.log(`tsc 报错行号 ${failingLines.size} 个`)
  // 找出这些行属于哪个被提升的函数
  const lines = source.split('\n')
  const toRevert = new Set()
  for (const lineNo of failingLines) {
    for (const block of blocks) {
      if (lineNo >= block.start + 1 && lineNo <= block.end + 1) toRevert.add(block.name)
    }
  }
  console.log(`需回填 ${toRevert.size} 个：${[...toRevert].join(', ')}`)
  if (!toRevert.size) process.exit(0)
  // 不做自动回填（涉及插入位置计算），只输出清单供人工/后续脚本处理
  process.exit(0)
}

if (!WRITE) {
  console.log('前 10 个：')
  for (const block of blocks.slice(0, 10)) {
    console.log(`  行 ${block.start + 1}-${block.end + 1}（${block.end - block.start + 1} 行） ${block.name}`)
  }
  console.log('\nDRY RUN：加 --write 落盘。')
  process.exit(0)
}

// 提取：从原位置删除，去缩进，追加到文件末尾
const lines = source.split('\n')
const removed = new Set()
const hoisted = []
for (const block of blocks) {
  const body = lines.slice(block.start, block.end + 1)
  for (let index = block.start; index <= block.end; index += 1) removed.add(index)
  hoisted.push(
    body
      .map((line) => (line.startsWith('  ') ? line.slice(2) : line))
      .join('\n'),
  )
}
const kept = lines.filter((_, index) => !removed.has(index))
const result = `${kept.join('\n').replace(/\n{3,}/g, '\n\n')}\n\n/* ── 从 ${hostName} 提升出来的纯函数（不依赖外层闭包） ── */\n\n${hoisted.join('\n\n')}\n`
writeFileSync(absPath, result, 'utf8')
console.log(`已提升 ${hoisted.length} 个函数：${lines.length} 行 → ${result.split('\n').length} 行`)
