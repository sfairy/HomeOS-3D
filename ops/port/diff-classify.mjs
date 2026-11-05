#!/usr/bin/env node
/**
 * 判定「真语义改动」还是「Pyarmor 重加密噪声」。
 *
 * 背景：0.8.2→0.8.4 的后端 83 个文件里有 77 个字节不同，但其中 62 个只是重新
 * 加密（字符串数组顺序、局部变量名、常量池排布变化），逻辑一字未改。用文本相似度
 * 判定会把它们全算成「有改动」，用 pycdc 输出判定又会漏掉
 * `studio_cleanup.py`（202 行 decompile incomplete）这种大改。
 *
 * 三通道判定（任一命中即视为语义改动）：
 *   - opcodeDelta：指令直方图 L1 距离（重加密不动指令，阈值 0 即严格）
 *   - constDelta：字符串 + 数字常量集合的对称差
 *   - objectDelta：模块内函数/类名集合的对称差
 *
 * 用法：
 *   node ops/port/diff-classify.mjs --old <dir> --new <dir> [--json out.json]
 * 其中 <dir> 下是 `*.py.1shot.das` 与 `*.1shot.das` 两种命名的合集。
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDas } from './lib/py-das.mjs'

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.1shot.das')) out.push(full)
  }
  return out
}

const stripDas = (file) => file.replace(/\.1shot\.das$/, '')

function l1(a, b) {
  let sum = 0
  for (const key of new Set([...a.keys(), ...b.keys()])) sum += Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0))
  return sum
}

function symmetricDiff(a, b) {
  const onlyB = [...b].filter((x) => !a.has(x))
  const onlyA = [...a].filter((x) => !b.has(x))
  return { added: onlyB, removed: onlyA, count: onlyA.length + onlyB.length }
}

export function classify(oldDir, newDir) {
  const oldRoot = resolve(oldDir)
  const newRoot = resolve(newDir)
  const oldFiles = new Map(walk(oldRoot).map((f) => [stripDas(relative(oldRoot, f)), f]))
  const newFiles = new Map(walk(newRoot).map((f) => [stripDas(relative(newRoot, f)), f]))

  const added = [...newFiles.keys()].filter((k) => !oldFiles.has(k)).sort()
  const removed = [...oldFiles.keys()].filter((k) => !newFiles.has(k)).sort()

  const changed = []
  const identical = []

  for (const key of [...newFiles.keys()].filter((k) => oldFiles.has(k)).sort()) {
    const before = parseDas(readFileSync(oldFiles.get(key), 'utf8'))
    const after = parseDas(readFileSync(newFiles.get(key), 'utf8'))
    const opcodeDelta = l1(before.opcodes, after.opcodes)
    const strings = symmetricDiff(before.strings, after.strings)
    const numbers = symmetricDiff(before.numbers, after.numbers)
    const objects = symmetricDiff(new Set(before.objects), new Set(after.objects))
    const constDelta = strings.count + numbers.count
    const semantic = opcodeDelta > 0 || constDelta > 0 || objects.count > 0
    const record = { file: key, opcodeDelta, constDelta, objectDelta: objects.count, strings, numbers, objects }
    if (semantic) changed.push(record)
    else identical.push(key)
  }

  changed.sort((a, b) => b.opcodeDelta + b.constDelta * 10 - (a.opcodeDelta + a.constDelta * 10))
  return { added, removed, changed, identical }
}

function main() {
  const argv = process.argv.slice(2)
  const arg = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const oldDir = arg('--old')
  const newDir = arg('--new')
  if (!oldDir || !newDir) {
    console.error('usage: node ops/port/diff-classify.mjs --old <dir> --new <dir> [--json out.json]')
    process.exit(2)
  }
  const result = classify(oldDir, newDir)
  const jsonPath = arg('--json')
  if (jsonPath) {
    mkdirSync(dirname(resolve(jsonPath)), { recursive: true })
    writeFileSync(resolve(jsonPath), `${JSON.stringify(result, null, 2)}\n`)
  }
  console.log(
    `added=${result.added.length} removed=${result.removed.length} semantic=${result.changed.length} noise=${result.identical.length}`,
  )
  for (const f of result.added) console.log(`  NEW      ${f}`)
  for (const f of result.removed) console.log(`  REMOVED  ${f}`)
  for (const c of result.changed) {
    console.log(
      `  CHANGED  op=${String(c.opcodeDelta).padStart(5)} const=${String(c.constDelta).padStart(4)} obj=${String(c.objectDelta).padStart(3)}  ${c.file}`,
    )
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
