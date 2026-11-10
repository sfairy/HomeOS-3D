#!/usr/bin/env node
/**
 * 6 行窗口重复度（优化前后对比口径，模块划分与 loc-report.mjs 一致）。
 *
 * 每行去首尾空白后，丢弃空行、纯注释行和纯标点行（如 `}`、`});`）；
 * 对剩余行按连续 6 行滑窗取键。同一键在全仓出现 ≥2 次即视为重复，被任一重复窗口覆盖的行计为重复行。
 * 用法：node ops/perf/dup-report.mjs [--rev <commit>] [--json out.json] [--top N]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const WINDOW = 6
const MODULES = [
  ['studio-ts', /^homeos\/frontend\/src\/studio\/.*\.(ts|vue)$/],
  ['studio-css', /^homeos\/frontend\/src\/studio\/.*\.css$/],
  ['public-static', /^homeos\/frontend\/public\/static\/(?!vendor\/).*\.(css|js)$/],
  ['frontend-ts', /^homeos\/frontend\/src\/(?!studio\/).*\.(ts|vue|js)$/],
  ['frontend-css', /^homeos\/frontend\/src\/(?!studio\/).*\.css$/],
  ['store-frontend', /^homeos-store\/frontend\/src\/.*\.(ts|vue|js|css)$/],
  ['shared', /^packages\/shared\/(src|scene|scripts)\/.*\.(ts|vue|js|mjs|css)$/],
  ['backend-py', /^homeos\/backend\/src\/.*\.py$/],
  ['store-backend-py', /^homeos-store\/backend\/src\/.*\.py$/],
  ['shared-py', /^packages\/shared-py\/.*\.py$/],
  ['ops', /^ops\/.*\.(py|mjs|js|ts|sh)$/],
  ['frontend-scripts', /^homeos\/frontend\/scripts\/.*\.(mjs|js|ts)$/],
]
const EXCLUDE = /\.generated\.|\/vendor\/|-baseline\.json$|\.d\.ts$/
const SKIP_LINE = /^(\/\/|\/\*|\*|#|<!--)|^[\s{}()[\];,.:<>/'"`]*$/

const argValue = (flag) => {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : null
}
const rev = argValue('--rev')
const top = Number(argValue('--top') || 0)
const git = (gitArgs, input) => execFileSync('git', gitArgs, { maxBuffer: 1 << 30, input })

const files = (rev ? git(['ls-tree', '-r', '--name-only', rev]) : git(['ls-files']))
  .toString()
  .split('\n')
  .filter((file) => file && !EXCLUDE.test(file) && MODULES.some(([, pattern]) => pattern.test(file)))

function readAll() {
  if (!rev) return new Map(files.map((file) => [file, safeRead(file)]))
  const out = git(['cat-file', '--batch'], files.map((file) => `${rev}:${file}`).join('\n'))
  const map = new Map()
  let offset = 0
  for (const file of files) {
    const headerEnd = out.indexOf(10, offset)
    const header = out.subarray(offset, headerEnd).toString()
    const size = Number(header.split(' ')[2])
    map.set(file, out.subarray(headerEnd + 1, headerEnd + 1 + size).toString())
    offset = headerEnd + 1 + size + 1
  }
  return map
}
function safeRead(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

const sources = readAll()
const normalized = new Map()
const windowCount = new Map()
for (const [file, text] of sources) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !SKIP_LINE.test(line))
  normalized.set(file, lines)
  for (let i = 0; i + WINDOW <= lines.length; i++) {
    const key = lines.slice(i, i + WINDOW).join('\n')
    windowCount.set(key, (windowCount.get(key) || 0) + 1)
  }
}

const totals = Object.fromEntries(MODULES.map(([name]) => [name, { lines: 0, dupLines: 0 }]))
const perFile = []
for (const [file, lines] of normalized) {
  const covered = new Uint8Array(lines.length)
  for (let i = 0; i + WINDOW <= lines.length; i++) {
    if (windowCount.get(lines.slice(i, i + WINDOW).join('\n')) > 1) covered.fill(1, i, i + WINDOW)
  }
  const dup = covered.reduce((sum, bit) => sum + bit, 0)
  const module = MODULES.find(([, pattern]) => pattern.test(file))[0]
  totals[module].lines += lines.length
  totals[module].dupLines += dup
  if (dup) perFile.push([file, dup])
}
const lines = Object.values(totals).reduce((sum, entry) => sum + entry.lines, 0)
const dupLines = Object.values(totals).reduce((sum, entry) => sum + entry.dupLines, 0)
const report = {
  generatedAt: new Date().toISOString(),
  commit: git(['rev-parse', '--short', rev || 'HEAD'])
    .toString()
    .trim(),
  window: WINDOW,
  lines,
  dupLines,
  modules: totals,
}
const jsonOut = argValue('--json')
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`)
const pct = (part, whole) => `${((100 * part) / Math.max(whole, 1)).toFixed(1)}%`
for (const [name, entry] of Object.entries(totals))
  console.log(
    `${name.padEnd(18)} ${String(entry.dupLines).padStart(7)} / ${String(entry.lines).padStart(7)}  ${pct(entry.dupLines, entry.lines)}`,
  )
console.log(
  `${'total'.padEnd(18)} ${String(dupLines).padStart(7)} / ${String(lines).padStart(7)}  ${pct(dupLines, lines)} (${report.commit})`,
)
if (top)
  for (const [file, dup] of perFile.sort((a, b) => b[1] - a[1]).slice(0, top))
    console.log(`${String(dup).padStart(6)}  ${file}`)

const focus = argValue('--file')
if (focus) {
  const partners = new Map()
  const focusKeys = new Set()
  const lines = normalized.get(focus) || []
  for (let i = 0; i + WINDOW <= lines.length; i++) {
    const key = lines.slice(i, i + WINDOW).join('\n')
    if (windowCount.get(key) > 1) focusKeys.add(key)
  }
  for (const [file, other] of normalized) {
    for (let i = 0; i + WINDOW <= other.length; i++) {
      if (focusKeys.has(other.slice(i, i + WINDOW).join('\n'))) partners.set(file, (partners.get(file) || 0) + 1)
    }
  }
  for (const [file, count] of [...partners].sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.log(`  ${String(count).padStart(5)} windows  ${file}`)
}
