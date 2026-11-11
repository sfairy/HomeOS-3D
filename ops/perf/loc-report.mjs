#!/usr/bin/env node
/**
 * 按模块统计 git 跟踪的手写源码行数（优化前后对比口径）。
 *
 * 范围与排除项与优化报告第一节一致：vendor、生成文件、二进制资产不计。
 * 用法：node ops/perf/loc-report.mjs [--rev <commit>] [--json out.json]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

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
const EXCLUDE = /\.generated\.|\/vendor\/|-baseline\.json$/

const revIndex = process.argv.indexOf('--rev')
const rev = revIndex >= 0 ? process.argv[revIndex + 1] : null
const git = (gitArgs) => execFileSync('git', gitArgs, { maxBuffer: 1 << 28 }).toString()
const files = (rev ? git(['ls-tree', '-r', '--name-only', rev]) : git(['ls-files']))
  .split('\n')
  .filter((file) => file && !EXCLUDE.test(file))
const read = (file) => (rev ? git(['show', `${rev}:${file}`]) : readFileSync(file, 'utf8'))
const totals = Object.fromEntries(MODULES.map(([name]) => [name, { files: 0, lines: 0 }]))
for (const file of files) {
  const module = MODULES.find(([, pattern]) => pattern.test(file))
  if (!module) continue
  let lines = 0
  try {
    lines = read(file).split('\n').length
  } catch {
    continue
  }
  totals[module[0]].files += 1
  totals[module[0]].lines += lines
}
const total = Object.values(totals).reduce((sum, entry) => sum + entry.lines, 0)
const report = {
  generatedAt: new Date().toISOString(),
  commit: git(['rev-parse', '--short', rev || 'HEAD']).trim(),
  total,
  modules: totals,
}
const jsonIndex = process.argv.indexOf('--json')
if (jsonIndex >= 0 && process.argv[jsonIndex + 1])
  writeFileSync(process.argv[jsonIndex + 1], `${JSON.stringify(report, null, 2)}\n`)
for (const [name, entry] of Object.entries(totals))
  console.log(`${name.padEnd(18)} ${String(entry.files).padStart(5)} files ${String(entry.lines).padStart(8)} lines`)
console.log(`${'total'.padEnd(18)} ${String(total).padStart(21)} lines (${report.commit})`)
