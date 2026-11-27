#!/usr/bin/env node
/**
 * 按 tsc 的 TS6133 报告，删除「解构出来但从未被读取」的名字。
 *
 * 为什么不用启发式：解构名会同时出现在 `bindDeps(…)({ name: nameImpl })` 的**对象键**里，
 * 也会出现在多行 impl 表的续行里 —— 任何「文本里出现过就算用到」的判定都会假阳性。
 * 编译器自己的判定是权威的，直接消费它。
 *
 * 用法：
 *   node ops/scripts/codemod/prune-destructure-by-tsc.mjs <file> [--rounds 5]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const args = process.argv.slice(2)
const roundsIndex = args.indexOf('--rounds')
const rounds = roundsIndex > -1 ? Number(args[roundsIndex + 1]) : 5
const target = args.find((a) => !a.startsWith('--') && a !== String(rounds))
if (!target) {
  console.error('用法: prune-destructure-by-tsc.mjs <file> [--rounds N]')
  process.exit(2)
}
const absPath = resolve(REPO_ROOT, target)

/** 跑一次 typecheck，取该文件的 TS6133 列表： [{line, name}] */
function collectUnused() {
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
  const hits = []
  for (const match of output.matchAll(/([^\s()]+\.ts)\((\d+),\d+\): error TS6133: '([^']+)'/g)) {
    const [, file, line, name] = match
    if (!absPath.endsWith(file) && !file.endsWith(target.split('/').pop())) continue
    hits.push({ line: Number(line), name })
  }
  return hits
}

for (let round = 1; round <= rounds; round += 1) {
  const hits = collectUnused()
  if (!hits.length) {
    console.log(`第 ${round} 轮：无未使用解构，完成。`)
    break
  }
  const lines = readFileSync(absPath, 'utf8').split('\n')
  const byLine = new Map()
  for (const hit of hits) {
    if (!byLine.has(hit.line)) byLine.set(hit.line, new Set())
    byLine.get(hit.line).add(hit.name)
  }
  let changed = 0
  // 未使用名可能出现在同一语句的多行里：整段 destructure 一起处理。
  for (const [lineNo, names] of byLine) {
    const index = lineNo - 1
    const line = lines[index]
    const match = line.match(/^(\s*)const \{ ([^}]*) \} = ([A-Za-z_$][\w$]*);$/)
    if (!match) continue
    const [, indent, inner, source] = match
    const kept = inner
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n && !names.has(n))
    lines[index] = kept.length
      ? `${indent}const { ${kept.join(', ')} } = ${source};`
      : `${indent}// ${source} 的全部绑定由 \`fn\` 提供。`
    changed += names.size
  }
  writeFileSync(absPath, lines.join('\n'), 'utf8')
  console.log(`第 ${round} 轮：删除 ${changed} 个未使用解构名`)
  if (!changed) break
}
