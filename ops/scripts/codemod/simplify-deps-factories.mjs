#!/usr/bin/env node
/**
 * 把 `bootEditor` 里的 deps 工厂从「数百个 getter」简化成 spread。
 *
 * 改造前：
 * ```ts
 * const { a, b, … } = bindDeps(shellControlsDeps)({ a: aImpl, … })
 * function shellControlsDeps() {
 *   return { ...homeElements, get a() { return a }, get runEntry() { return openColorPickerForInput }, … }
 * }
 * ```
 *
 * 这些 getter 的唯一作用是**延迟读取**闭包里的绑定。`bindDeps` 的返回值本身就是那批
 * 同名绑定的对象，所以 `...fn` 与之一一等价；只有「别名 getter」与「非绑定字段」
 * 需要原样保留。
 *
 * 三个机械动作：
 * 1. 每个 `const {…} = bindDeps(xxxDeps)({…})` → `const xxx = …` + 精简后的解构
 *    （只解构「在工厂之外仍被使用」的名字，其余由 `...fn` 提供）；
 * 2. 生成 `const fn = { ...xxx, … }`；
 * 3. 工厂体 → `{ ...homeElements, ...fn }` + 未被覆盖的 getter（**原文保留**，
 *    因为有些是别名：`get runEntry() { return openColorPickerForInput }`）。
 *
 * 用法：
 *   node ops/scripts/codemod/simplify-deps-factories.mjs <boot.ts> [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const WRITE = process.argv.includes('--write')
const target = process.argv.slice(2).find((a) => !a.startsWith('--'))
if (!target) {
  console.error('用法: simplify-deps-factories.mjs <boot.ts> [--write]')
  process.exit(2)
}

const absPath = resolve(REPO_ROOT, target)
const source = readFileSync(absPath, 'utf8')
const lines = source.split('\n')

const domainOf = (factory) => factory.replace(/Deps$/, '')

// ---------- 1) 定位 deps 工厂，记录其行范围 ----------
const factoryBlocks = []
for (let index = 0; index < lines.length; index += 1) {
  const match = lines[index].match(/^(\s*)function ([A-Za-z_$][\w$]*Deps)\(\)\s*:\s*[A-Za-z_$][\w$]*\s*\{/)
  if (!match) continue
  let depth = 0
  let opened = false
  let end = index
  for (let cursor = index; cursor < lines.length; cursor += 1) {
    for (const char of lines[cursor]) {
      if (char === '{') {
        depth += 1
        opened = true
      } else if (char === '}') depth -= 1
    }
    if (opened && depth === 0) {
      end = cursor
      break
    }
  }
  factoryBlocks.push({ index, end, factory: match[2], indent: match[1] })
  index = end
}
const inFactory = (lineNo) => factoryBlocks.some((b) => lineNo >= b.index && lineNo <= b.end)

/** 「工厂之外」的全部文本（用于判断某个解构名是否还需要）。 */
const outsideText = lines.filter((_, index) => !inFactory(index)).join('\n')

// ---------- 2) bindDeps 赋值 ----------
const bindings = []
lines.forEach((line, index) => {
  const match = line.match(/^(\s*)const \{([\s\S]*?)\} = bindDeps\(([A-Za-z_$][\w$]*)\)\(\{([\s\S]*)\}\)\s*;?\s*$/)
  if (!match) return
  const [, indent, destructured, factory, implTable] = match
  const names = destructured
    .split(',')
    .map((part) => part.trim().split(/[:=]/)[0].trim())
    .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n))
  const keys = [...implTable.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1])
  bindings.push({ index, indent, factory, name: domainOf(factory), names, keys })
})

if (!bindings.length) {
  console.error('没有找到 bindDeps 赋值')
  process.exit(1)
}
const allBoundKeys = new Set(bindings.flatMap((b) => b.keys))
console.log(`${bindings.length} 个 bindDeps，${allBoundKeys.size} 个绑定函数`)

// ---------- 3) 生成替换 ----------
const replacements = new Map()

for (const binding of bindings) {
  const line = lines[binding.index]
  const equalAt = line.indexOf(' = bindDeps')
  const rhs = line.slice(equalAt + 3).replace(/^=\s*/, '')
  // 只解构「工厂之外仍被引用」的名字；其余由 `...fn` 提供。
  const needed = binding.names.filter((name) => new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(outsideText))
  const destructure =
    needed.length === binding.names.length
      ? `${binding.indent}const { ${needed.join(', ')} } = ${binding.name};`
      : `${binding.indent}// 只解构「工厂之外仍在用」的 ${needed.length} 个；其余由下方 \`fn\` 提供。\n` +
        (needed.length ? `${binding.indent}const { ${needed.join(', ')} } = ${binding.name};` : '')
  replacements.set(binding.index, [`${binding.indent}const ${binding.name} = ${rhs}`, ...destructure.split('\n')])
}

for (const block of factoryBlocks) {
  const bodyLines = lines.slice(block.index, block.end + 1)
  const body = bodyLines.join('\n')
  // 抽出所有 getter 的「名字 + 完整原文」
  const getters = []
  for (let cursor = 0; cursor < bodyLines.length; cursor += 1) {
    const match = bodyLines[cursor].match(/^\s*get\s+([A-Za-z_$][\w$]*)\s*\(\s*\)\s*\{/)
    if (!match) continue
    // 收集到闭合的 `},`
    let depth = 0
    let end = cursor
    for (let scan = cursor; scan < bodyLines.length; scan += 1) {
      for (const char of bodyLines[scan]) {
        if (char === '{') depth += 1
        else if (char === '}') depth -= 1
      }
      // 单行 getter（`get X() { return X; },`）在同一行就归零，不能要求 scan > cursor，
      // 否则会一路吞掉后面所有 getter（实测导致 11 个常量「消失」）。
      if (depth === 0 && bodyLines[scan].includes('{') && bodyLines[scan].includes('}')) {
        end = scan
        break
      }
      if (depth === 0 && scan > cursor) {
        end = scan
        break
      }
    }
    getters.push({ name: match[1], text: bodyLines.slice(cursor, end + 1).join('\n') })
    cursor = end
  }
  const uncovered = getters.filter((g) => !allBoundKeys.has(g.name))
  const signature = lines[block.index]
  replacements.set(block.index, [
    signature,
    `${block.indent}  return {`,
    `${block.indent}    ...homeElements,`,
    `${block.indent}    ...fn,`,
    ...uncovered.map((g) => g.text),
    `${block.indent}  };`,
    `${block.indent}}`,
  ])
  for (let cursor = block.index + 1; cursor <= block.end; cursor += 1) {
    if (!replacements.has(cursor)) replacements.set(cursor, [])
  }
}

// ---------- 4) 输出 ----------
let output = []
const lastBindingLine = Math.max(...bindings.map((b) => b.index))
for (let index = 0; index < lines.length; index += 1) {
  if (replacements.has(index)) output.push(...replacements.get(index))
  else output.push(lines[index])
  if (index === lastBindingLine) {
    const indent = bindings[0].indent
    output.push(
      `${indent}// 全部绑定函数的合集：deps 工厂用 spread 一次性获得，`,
      `${indent}// 不再为每个函数写一个「延迟读取」的 getter。`,
      `${indent}const fn = {`,
      ...bindings.map((b) => `${indent}  ...${b.name},`),
      `${indent}};`,
    )
  }
}

// ---------- 5) 变换后自检：再过滤一次解构名 ----------
// 前面按「工厂块之外是否出现」判断，但若有工厂块没被识别（例如没写返回类型），
// 其 getter 会被算进「仍在使用」。这里以**最终文本**为准再算一遍：
// 把某条解构行从文本中移除后，仍出现在别处的名字才保留。
output = output.map((line, lineNo) => {
  const match = line.match(/^(\s*)const \{ ([^}]*) \} = ([A-Za-z_$][\w$]*);$/)
  if (!match) return line
  const [, indent, inner, source] = match
  const names = inner
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
  // 排除 `const xxx = bindDeps(…)({ name: nameImpl, … })`：那里的同名只是**对象键**，
  // 不构成「读取」。不排除会造成假阳性，TS6133 清不掉。
  const others = output.filter((text, index) => index !== lineNo && !text.includes('= bindDeps(')).join('\n')
  const keep = names.filter((name) => new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(others))
  if (keep.length === names.length) return line
  if (!keep.length) {
    return `${indent}// ${source} 的全部绑定由下方 \`fn\` 提供，无需逐个解构。`
  }
  return `${indent}const { ${keep.join(', ')} } = ${source};`
})

console.log(`${WRITE ? '已改写' : '待改写'}：${lines.length} 行 → ${output.length} 行`)
if (WRITE) writeFileSync(absPath, output.join('\n'), 'utf8')
