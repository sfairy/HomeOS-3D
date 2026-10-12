#!/usr/bin/env node
/**
 * 令牌清单审计：枚举所有 CSS 自定义属性（`--*`）的定义点与引用点，
 * 报出「孤儿令牌」（有定义无引用）与「悬空引用」（var() 指向未定义）。
 *
 * 用法：`node ops/ui-audit/collect-tokens.mjs [--json]`
 * 产出：reports/tokens.json（--json 时同时打印到 stdout）
 */
import fs from 'node:fs'
import {
  walk,
  CODE_EXTS,
  collectCustomPropDefs,
  collectCustomPropRefs,
  rel,
  writeJson,
  isVendored,
} from './lib/scan.mjs'
import { TARGETS, scanDirs, OUT_DIR } from './targets.mjs'

const asJson = process.argv.includes('--json')

function collectTarget(target) {
  const defs = new Map()
  const refs = new Map()
  let fileCount = 0
  for (const dir of scanDirs(target)) {
    for (const file of walk(dir, CODE_EXTS)) {
      const relative = rel(target.root, file)
      if (isVendored(relative)) continue
      fileCount += 1
      const src = fs.readFileSync(file, 'utf8')
      for (const d of collectCustomPropDefs(src)) {
        const list = defs.get(d.name) || []
        list.push({ file: relative, line: d.line, value: d.value, selector: d.selector })
        defs.set(d.name, list)
      }
      for (const r of collectCustomPropRefs(src)) {
        const list = refs.get(r.name) || []
        list.push({ file: relative, line: r.line })
        refs.set(r.name, list)
      }
    }
  }
  return { defs, refs, fileCount }
}

const result = { generatedAt: new Date().toISOString(), targets: {} }
const globalDefs = new Map()
const globalRefs = new Map()

for (const target of TARGETS) {
  const { defs, refs, fileCount } = collectTarget(target)
  const names = new Set([...defs.keys(), ...refs.keys()])
  const orphan = []
  const dangling = []

  for (const name of names) {
    const hasDef = defs.has(name)
    const hasRef = refs.has(name)
    if (hasDef && !hasRef) orphan.push({ name, defCount: defs.get(name).length, first: defs.get(name)[0] })
    if (!hasDef && hasRef) dangling.push({ name, refCount: refs.get(name).length, first: refs.get(name)[0] })
    globalDefs.set(name, (globalDefs.get(name) || []).concat(defs.get(name) || []))
    globalRefs.set(name, (globalRefs.get(name) || []).concat(refs.get(name) || []))
  }

  result.targets[target.id] = {
    label: target.label,
    project: target.project,
    fileCount,
    definedCount: defs.size,
    referencedCount: refs.size,
    orphanCount: orphan.length,
    danglingCount: dangling.length,
    orphan: orphan.sort((a, b) => a.name.localeCompare(b.name)),
    dangling: dangling.sort((a, b) => a.name.localeCompare(b.name)),
  }
}

// 跨项目视角：同一令牌在 ≥2 个项目各自定义（漂移风险点）
const cross = []
for (const [name, defs] of globalDefs) {
  const projects = [...new Set(defs.map((d) => d.file.split('/')[0]))]
  if (projects.length >= 2) cross.push({ name, defFiles: defs.length, projects })
}
result.crossProjectDefs = cross.length
result.crossProjectSample = cross.slice(0, 60)
result.totalDefined = globalDefs.size
result.totalReferenced = globalRefs.size

writeJson(`${OUT_DIR}/tokens.json`, result)
if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  for (const [id, t] of Object.entries(result.targets)) {
    console.log(
      `${id.padEnd(8)} files=${String(t.fileCount).padStart(4)} defined=${String(t.definedCount).padStart(4)} ` +
        `orphan=${String(t.orphanCount).padStart(3)} dangling=${String(t.danglingCount).padStart(3)}`,
    )
  }
  console.log(`跨项目同名定义：${result.crossProjectDefs} 个令牌在 ≥2 个项目各自定义`)
}
