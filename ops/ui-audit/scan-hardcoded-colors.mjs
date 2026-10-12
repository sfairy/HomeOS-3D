#!/usr/bin/env node
/**
 * 硬编码颜色审计：扫描 CSS/Vue/TS 中的 hex 与 rgb()/rgba()/hsl() 字面量，
 * 按归一化色值聚类，输出热点排行与「同值多写法」漂移。
 *
 * 用法：`node ops/ui-audit/scan-hardcoded-colors.mjs [--json] [--top N]`
 * 产出：reports/hardcoded-colors.json
 */
import fs from 'node:fs'
import {
  walk,
  CODE_EXTS,
  blankComments,
  collectHex,
  collectFunctionalColors,
  normalizeHex,
  writeJson,
} from './lib/scan.mjs'
import { TARGETS, scanDirs, OUT_DIR } from './targets.mjs'

const asJson = process.argv.includes('--json')
const topIdx = process.argv.indexOf('--top')
const TOP = topIdx === -1 ? 60 : Number(process.argv[topIdx + 1]) || 60

// hex 字面量
const hexIndex = new Map() // normalized -> { count, spellings:Set, files:Set, labels:Set }
const funcIndex = new Map() // raw -> { count, files:Set }
let totalHex = 0
let totalFunc = 0

for (const target of TARGETS) {
  for (const dir of scanDirs(target)) {
    for (const file of walk(dir, CODE_EXTS)) {
      const src = blankComments(fs.readFileSync(file, 'utf8'))
      const relFile = `${target.project}:${file.split(`/frontend/`)[1] || file.split('/').slice(-2).join('/')}`
      for (const [key, entry] of collectHex(src)) {
        totalHex += entry.count
        const cur = hexIndex.get(key) || { hex: normalizeHex(entry.rgba), count: 0, spellings: new Set(), files: new Set() }
        cur.count += entry.count
        cur.spellings.add(entry.hex)
        cur.files.add(relFile)
        hexIndex.set(key, cur)
      }
      for (const [raw, entry] of collectFunctionalColors(src)) {
        totalFunc += entry.count
        const cur = funcIndex.get(raw) || { raw, count: 0, files: new Set() }
        cur.count += entry.count
        cur.files.add(relFile)
        funcIndex.set(raw, cur)
      }
    }
  }
}

const hexList = [...hexIndex.values()]
  .map((e) => ({ hex: e.hex, count: e.count, spellings: [...e.spellings], fileCount: e.files.size }))
  .sort((a, b) => b.count - a.count)

const funcList = [...funcIndex.values()]
  .map((e) => ({ raw: e.raw, count: e.count, fileCount: e.files.size }))
  .sort((a, b) => b.count - a.count)

// rgba() 中其实是某个 hex 的等价写法（同色不同写法 → 收敛候选）
const rgbaHexLike = funcList.filter((f) => /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*1)?\s*\)/i.test(f.raw))

const result = {
  generatedAt: new Date().toISOString(),
  totalHexLiterals: totalHex,
  totalFunctionalLiterals: totalFunc,
  distinctHex: hexList.length,
  distinctFunctional: funcList.length,
  topHex: hexList.slice(0, TOP),
  topFunctional: funcList.slice(0, TOP),
  functionalOpaqueCount: rgbaHexLike.length,
}

writeJson(`${OUT_DIR}/hardcoded-colors.json`, result)
if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  console.log(`hex 字面量 ${totalHex} 处 / 去重后 ${hexList.length} 色；rgb()/hsl() ${totalFunc} 处 / 去重后 ${funcList.length} 种`)
  console.log('\nTop 硬编码 hex：')
  for (const h of hexList.slice(0, TOP)) {
    console.log(`  ${h.hex}  ×${String(h.count).padStart(4)}  文件 ${String(h.fileCount).padStart(3)}  写法 ${h.spellings.join(' ')}`)
  }
}
