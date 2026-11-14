#!/usr/bin/env node
/**
 * codemod：把「外壳三角形遮罩」里重复的纯数字数组提成命名常量。
 *
 * 为什么这样做是等价的
 * --------------------
 * `REVIEWED_SHELL_MASKS` 是纯数据；下游只做 `new Set(mask)` 与长度判断，从不写入。
 * 把重复出现的同一个数字序列换成同一个数组引用，读到的值、顺序、长度都不变。
 *
 * 为什么值得做
 * ------------
 * `airer` 一段里同一个 48 元素掩码被逐字抄了十几遍，占掉近百行，而它在语义上就是**同一份**
 * 掩码。提成 `SHELL_MASK_n` 后，数据表回到「每个机型一行一项」，读的人不用再逐行比对数字。
 *
 * 用法
 * ----
 *     node ops/scripts/codemod-shell-mask-constants.mjs --dry-run
 *     node ops/scripts/codemod-shell-mask-constants.mjs --write
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const TARGET = path.join(
  REPO_ROOT,
  'homeos/frontend/src/studio/app/3d-studio/authoring/scene/shells/studio-reviewed-shell-data.ts',
)
const MIN_NUMBERS = 8

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const DRY_RUN = args.includes('--dry-run') || !WRITE

const source = fs.readFileSync(TARGET, 'utf8')

/**
 * 幂等守卫：文件里已有 `SHELL_MASK_n` 常量就说明提取过了。
 *
 * 不加这道守卫的后果很具体：常量声明本身就是「纯数字数组」，第二次运行会把它们当成
 * 重复项再提取一层（`SHELL_MASK_1 = SHELL_MASK_2` 之类的自引用），文件反而变长且语义坏掉。
 */
if (/\bSHELL_MASK_\d+\b/.test(source)) {
  console.log('已提取过（存在 SHELL_MASK_n 常量），跳过。')
  process.exit(0)
}

const occurrences = []
for (let index = 0; index < source.length; index += 1) {
  if (source[index] !== '[') continue
  let depth = 0
  let end = -1
  for (let cursor = index; cursor < source.length; cursor += 1) {
    if (source[cursor] === '[') depth += 1
    else if (source[cursor] === ']') {
      depth -= 1
      if (depth === 0) {
        end = cursor
        break
      }
    }
  }
  if (end < 0) continue
  const text = source.slice(index, end + 1)
  const numbers = text.match(/\d+/g) || []
  // 纯数字数组：去掉数字后不剩任何标识符、引号或符号（`[` `]` `,` 空白除外）。
  if (numbers.length >= MIN_NUMBERS && !/[A-Za-z_$'"]/.test(text.replace(/\d+/g, ''))) {
    occurrences.push({ start: index, end: end + 1, key: numbers.join(','), text })
  }
}

const groups = new Map()
for (const occurrence of occurrences) {
  const list = groups.get(occurrence.key) ?? []
  list.push(occurrence)
  groups.set(occurrence.key, list)
}

const duplicates = [...groups.values()].filter((list) => list.length > 1)
if (duplicates.length === 0) {
  console.log('没有重复的掩码数组。')
  process.exit(0)
}

// 命名顺序按「首次出现位置」，保证多次运行的命名稳定。
duplicates.sort((left, right) => left[0].start - right[0].start)
const constants = duplicates.map((list, index) => ({ name: `SHELL_MASK_${index + 1}`, text: list[0].text }))

const replacements = []
for (const [groupIndex, list] of duplicates.entries()) {
  for (const occurrence of list.slice(1)) {
    replacements.push({ start: occurrence.start, end: occurrence.end, name: constants[groupIndex].name })
  }
}
replacements.sort((left, right) => right.start - left.start)

let next = source
for (const replacement of replacements) {
  next = `${next.slice(0, replacement.start)}${replacement.name}${next.slice(replacement.end)}`
}

const anchor = 'export const REVIEWED_SHELL_MASKS'
const anchorIndex = next.indexOf(anchor)
if (anchorIndex < 0) throw new Error('找不到 REVIEWED_SHELL_MASKS 定义位置')

const declarations = constants
  .map(
    (constant) =>
      `/** 多机型共用的同一份三角形遮罩下标（原表逐字重复，提成常量后只保留一份）。 */\nconst ${constant.name}: number[] = ${constant.text}\n`,
  )
  .join('\n')

const beforeLines = source.split('\n').length
next = `${next.slice(0, anchorIndex)}${declarations}\n${next.slice(anchorIndex)}`
console.log(
  `${DRY_RUN ? '[dry-run] ' : ''}提取 ${constants.length} 个常量，替换 ${replacements.length} 处重复，` +
    `行数 ${beforeLines} → ${next.split('\n').length}`,
)
if (WRITE) fs.writeFileSync(TARGET, next)
