#!/usr/bin/env node
/**
 * 一键跑全部 UI 审计脚本并汇总为 summary.json。
 *
 * 用法：`node ops/ui-audit/run-all.mjs`
 * 产出：reports/{tokens,hardcoded-colors,contrast,breakpoints,surfaces,summary}.json
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeJson } from './lib/scan.mjs'
import { OUT_DIR } from './targets.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const STEPS = [
  ['collect-tokens.mjs', 'tokens'],
  ['scan-hardcoded-colors.mjs', 'hardcoded-colors'],
  ['contrast-audit.mjs', 'contrast'],
  ['breakpoint-audit.mjs', 'breakpoints'],
  ['surface-inventory.mjs', 'surfaces'],
  ['css-duplicates.mjs', 'css-duplicates'],
  ['css-unused.mjs', 'css-unused'],
  ['token-orphans.mjs', 'token-orphans'],
  ['check-token-contract.mjs', 'token-contract'],
  ['dedupe-css.mjs', 'css-cleanup'],
  ['prune-tokens.mjs', 'token-prune'],
  ['collect-token-map.mjs', 'token-map'],
  ['check-token-map.mjs', 'token-map-gate'],
]

const outputs = {}
for (const [script, key] of STEPS) {
  const res = spawnSync(process.execPath, [path.join(HERE, script)], { stdio: 'inherit' })
  if (res.status !== 0) {
    console.error(`审计脚本失败：${script}（exit ${res.status}）`)
    process.exit(res.status ?? 1)
  }
  outputs[key] = script
}

// 汇总摘要（只挑关键数字，供报告与门禁消费）
import fs from 'node:fs'
const read = (n) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${n}.json`), 'utf8'))
const tokens = read('tokens')
const colors = read('hardcoded-colors')
const contrast = read('contrast')
const breakpoints = read('breakpoints')
const surfaces = read('surfaces')
const cssDuplicates = read('css-duplicates')
const cssUnused = read('css-unused')
const tokenOrphans = read('token-orphans')
const tokenContract = read('token-contract')

const summary = {
  generatedAt: new Date().toISOString(),
  tokens: {
    totalDefined: tokens.totalDefined,
    totalReferenced: tokens.totalReferenced,
    crossProjectDefs: tokens.crossProjectDefs,
    byTarget: Object.fromEntries(
      Object.entries(tokens.targets).map(([id, t]) => [
        id,
        { defined: t.definedCount, orphan: t.orphanCount, dangling: t.danglingCount },
      ]),
    ),
  },
  colors: {
    totalHexLiterals: colors.totalHexLiterals,
    distinctHex: colors.distinctHex,
    totalFunctionalLiterals: colors.totalFunctionalLiterals,
    distinctFunctional: colors.distinctFunctional,
    topHex: colors.topHex.slice(0, 20).map((h) => ({ hex: h.hex, count: h.count, fileCount: h.fileCount })),
  },
  contrast: contrast.files.map((f) => ({
    label: f.label,
    file: f.file,
    scopes: Object.fromEntries(
      Object.entries(f.scopes).map(([s, v]) => [s, { pairs: v.pairs, failBody: v.failBody, failLarge: v.failLarge }]),
    ),
  })),
  breakpoints: {
    mediaTotal: breakpoints.mediaTotal,
    distinctWidths: breakpoints.distinctWidths,
    offCanonicalCount: breakpoints.offCanonical.length,
    offCanonical: breakpoints.offCanonical,
  },
  surfaces: { total: surfaces.total, byKind: surfaces.byKind, byProject: surfaces.byProject },
  cssDuplicates: cssDuplicates.totals,
  cssUnused: {
    styleFileCount: cssUnused.styleFileCount,
    deadStylesheets: cssUnused.deadStylesheets.length,
    classCount: cssUnused.classCount,
    unusedClassCount: cssUnused.unusedStrictCount,
    unusedConventionCount: cssUnused.unusedConventionCount,
    unusedDynamicCount: cssUnused.unusedDynamicCount,
  },
  tokenCensus: {
    defined: tokens.totalDefined,
    referenced: tokens.totalReferenced,
    crossProjectSameName: tokens.crossProjectDefs,
  },
  tokenReferences: {
    totalNames: tokenOrphans.totalNames,
    referenced: tokenOrphans.referencedCount,
    scriptOnly: tokenOrphans.jsInjectedCount,
    reserved: tokenOrphans.reservedCount,
    dead: tokenOrphans.deadCount,
  },
  tokenContract: {
    styleFiles: tokenContract.styleFilesScanned,
    refs: tokenContract.totalRefs,
    unresolved: tokenContract.unresolvedCount,
    unresolvedWithFallback: tokenContract.unresolvedWithFallbackCount,
  },
}

writeJson(path.join(OUT_DIR, 'summary.json'), summary)
console.log('\n=== 审计汇总 ===')
console.log(`令牌：定义 ${summary.tokenCensus.defined}，跨项目同名定义 ${summary.tokenCensus.crossProjectSameName}`)
console.log(
  `令牌引用：有名 ${summary.tokenReferences.totalNames}，有使用 ${summary.tokenReferences.referenced}，` +
    `仅脚本出现 ${summary.tokenReferences.scriptOnly}，字典预留 ${summary.tokenReferences.reserved}，` +
    `无使用 ${summary.tokenReferences.dead}`,
)
console.log(
  `令牌契约：${summary.tokenContract.styleFiles} 个样式源 / ${summary.tokenContract.refs} 次引用，` +
    `未解析（无回退）${summary.tokenContract.unresolved}，未解析（有回退）${summary.tokenContract.unresolvedWithFallback}`,
)
console.log(
  `硬编码色：hex ${summary.colors.totalHexLiterals} 处（去重 ${summary.colors.distinctHex}），` +
    `rgb/hsl ${summary.colors.totalFunctionalLiterals} 处（去重 ${summary.colors.distinctFunctional}）`,
)
console.log(`非标准断点：${summary.breakpoints.offCanonicalCount} 个`)
console.log(`Surface：${summary.surfaces.total} 个`)
for (const c of summary.contrast) {
  for (const [s, v] of Object.entries(c.scopes)) {
    console.log(`对比度 [${c.label} ${s}] 配对 ${v.pairs}，正文不达 AA ${v.failBody}，图形不达 3:1 ${v.failLarge}`)
  }
}
