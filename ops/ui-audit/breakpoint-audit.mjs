#!/usr/bin/env node
/**
 * 断点审计：汇总全仓 @media 查询里的宽度断点，列出标准集合之外的断点与分布。
 *
 * 用法：`node ops/ui-audit/breakpoint-audit.mjs [--json]`
 * 产出：reports/breakpoints.json
 */
import fs from 'node:fs'
import {
  walk,
  STYLE_EXTS,
  blankComments,
  rel,
  writeJson,
  extractStyleText,
} from './lib/scan.mjs'
import { TARGETS, scanDirs, OUT_DIR } from './targets.mjs'

const asJson = process.argv.includes('--json')

/** 约定的标准断点集合（与主应用 README 断点策略一致）。 */
const CANON = new Set([380, 480, 639, 640, 768, 900, 1024, 1280, 1440, 1920])

const byWidth = new Map() // width -> { count, kinds:Set, files:Set }
const queries = new Map() // raw query -> count
let mediaTotal = 0

for (const target of TARGETS) {
  for (const dir of scanDirs(target)) {
    for (const file of walk(dir, STYLE_EXTS)) {
      const css = blankComments(extractStyleText(file, fs.readFileSync(file, 'utf8')))
      const relative = `${target.project}:${rel(target.root, file)}`
      for (const m of css.matchAll(/@media([^{]+)\{/g)) {
        mediaTotal += 1
        const query = m[1].replace(/\s+/g, ' ').trim()
        queries.set(query, (queries.get(query) || 0) + 1)
        for (const w of query.matchAll(/(min|max)-width:\s*(\d+)px/g)) {
          const width = Number(w[2])
          const cur = byWidth.get(width) || { width, count: 0, kinds: new Set(), files: new Set() }
          cur.count += 1
          cur.kinds.add(w[1])
          cur.files.add(relative)
          byWidth.set(width, cur)
        }
      }
    }
  }
}

const widths = [...byWidth.values()]
  .map((w) => ({ width: w.width, count: w.count, kinds: [...w.kinds], fileCount: w.files.size, canonical: CANON.has(w.width) }))
  .sort((a, b) => a.width - b.width)

const offCanon = widths.filter((w) => !w.canonical)

const result = {
  generatedAt: new Date().toISOString(),
  mediaTotal,
  distinctWidths: widths.length,
  canonicalSet: [...CANON].sort((a, b) => a - b),
  offCanonical: offCanon,
  widths,
  topQueries: [...queries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([q, c]) => ({ query: q, count: c })),
}

writeJson(`${OUT_DIR}/breakpoints.json`, result)
if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  console.log(`@media 共 ${mediaTotal} 条，出现 ${widths.length} 个不同宽度断点`)
  console.log(`非标准断点（不在 ${[...CANON].sort((a, b) => a - b).join('/')}）：`)
  for (const w of offCanon) console.log(`  ${w.width}px  ×${String(w.count).padStart(4)}  ${w.kinds.join('/')}  文件 ${w.fileCount}`)
}
