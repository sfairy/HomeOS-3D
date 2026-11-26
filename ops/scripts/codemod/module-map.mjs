#!/usr/bin/env node
/**
 * 结构快照：把当前目录的「文件数 / 代码行数 / 顶层分层」打成一份可重跑的清单。
 *
 * 为什么需要它
 * ------------
 * 模块化重构的每一步都要回答「这个目录现在有多少文件、拆分后应当剩多少」。
 * 手工 `find | wc -l` 的统计口径（哪些扩展名算、跳过哪些目录）每次都会漂：
 * 一次漏算 `.vue`、一次把 `dist/` 算进去，就会得出「重构让文件变多了」的错误结论。
 * 本脚本是口径的唯一真源，输出可直接对照计划里的数量账。
 *
 * 用法：
 *   node ops/scripts/codemod/module-map.mjs                 # 打印到 stdout
 *   node ops/scripts/codemod/module-map.mjs --write         # 写入 docs/analysis/module-map.md
 *   node ops/scripts/codemod/module-map.mjs --markdown      # 输出 markdown（默认纯文本）
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { walkFiles } from '../../lib/walk.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const CODE_EXTS = new Set(['.ts', '.tsx', '.mts', '.vue', '.css', '.py', '.mjs'])
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '__pycache__',
  '.venv-store',
  '.venv',
  '.graphflow',
  '.ruff_cache',
  '源代码',
  'data',
  'backups',
])

/** 统计一棵子树：文件数 + 总行数（只算代码扩展名）。
 *  `topLevelOnly` 为 true 时只统计该目录下**直属**文件（用于 `(root)` 行）。
 */
function measure(dir, { topLevelOnly = false } = {}) {
  const abs = join(REPO_ROOT, dir)
  if (!existsSync(abs)) return { files: 0, lines: 0 }
  let files = 0
  let lines = 0
  for (const file of walkFiles(abs, { extensions: CODE_EXTS, skipDirs: SKIP_DIRS })) {
    if (topLevelOnly && relative(abs, file).includes('/')) continue
    files += 1
    try {
      lines += countLines(file)
    } catch {
      /* 读不到就跳过，不污染统计 */
    }
  }
  return { files, lines }
}

import { readFileSync } from 'node:fs'
function countLines(file) {
  const text = readFileSync(file, 'utf8')
  let count = 1
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) count += 1
  return count
}

/** 顶层子目录统计（只列真实目录）。 */
function children(dir) {
  const abs = join(REPO_ROOT, dir)
  if (!existsSync(abs)) return []
  const entries = new Set()
  for (const file of walkFiles(abs, { extensions: CODE_EXTS, skipDirs: SKIP_DIRS })) {
    const rel = relative(abs, file).split('\\').join('/')
    const head = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '(root)'
    entries.add(head)
  }
  return [...entries].sort()
}

const TARGETS = [
  'homeos/frontend/src',
  'homeos/backend/src',
  'homeos-store/frontend/src',
  'homeos-store/backend/src',
  'packages/shared/src',
  'packages/shared-py',
  'ops',
]

function main() {
  const markdown = process.argv.includes('--markdown') || process.argv.includes('--write')
  const rows = []
  const blocks = []

  for (const target of TARGETS) {
    const total = measure(target)
    if (!total.files) continue
    rows.push({ target, ...total })
    const subs = children(target).map((child) => {
      if (child === '(root)') return { child, path: target, ...measure(target, { topLevelOnly: true }) }
      const path = `${target}/${child}`
      return { child, path, ...measure(path) }
    })
    blocks.push({ target, total, subs })
  }

  const grandFiles = rows.reduce((sum, row) => sum + row.files, 0)
  const grandLines = rows.reduce((sum, row) => sum + row.lines, 0)

  const lines = []
  if (markdown) {
    lines.push('# HomeOS 结构快照', '')
    lines.push(`生成时间：${new Date().toISOString()}`, '')
    lines.push('| 根 | 文件 | 代码行 |', '| --- | ---: | ---: |')
    for (const row of rows) lines.push(`| \`${row.target}\` | ${row.files} | ${row.lines} |`)
    lines.push(`| **合计** | **${grandFiles}** | **${grandLines}** |`, '')
    for (const block of blocks) {
      lines.push(`## \`${block.target}\``, '')
      lines.push('| 子目录 | 文件 | 代码行 |', '| --- | ---: | ---: |')
      for (const sub of block.subs) {
        if (!sub.files) continue
        lines.push(`| \`${sub.child}\` | ${sub.files} | ${sub.lines} |`)
      }
      lines.push('')
    }
  } else {
    for (const row of rows) console.log(`${String(row.files).padStart(5)} files ${String(row.lines).padStart(7)} lines  ${row.target}`)
    console.log(`${String(grandFiles).padStart(5)} files ${String(grandLines).padStart(7)} lines  TOTAL`)
  }

  if (process.argv.includes('--write')) {
    const out = join(REPO_ROOT, 'docs/analysis/module-map.md')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, `${lines.join('\n')}\n`, 'utf8')
    console.log(`\n已写入 ${relative(REPO_ROOT, out)}`)
  } else if (markdown) {
    console.log(lines.join('\n'))
  }
}

main()
