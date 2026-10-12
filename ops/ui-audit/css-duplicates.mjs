#!/usr/bin/env node
/**
 * CSS 重复定义审计：找出跨文件/跨选择器重复的规则体、同名重复的 @keyframes / @font-face、
 * 重复或冲突的自定义属性定义、块内重复声明与空规则。
 *
 * 用法：`node ops/ui-audit/css-duplicates.mjs [--json] [--min-decls N]`
 * 产出：reports/css-duplicates.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { blankComments, walk, STYLE_EXTS, rel, writeJson, isVendored, extractStyleText } from './lib/scan.mjs'
import { TARGETS, scanDirs, OUT_DIR, isMirror, REPO_ROOT } from './targets.mjs'

const asJson = process.argv.includes('--json')
const minIdx = process.argv.indexOf('--min-decls')
const MIN_DECLS = minIdx === -1 ? 3 : Number(process.argv[minIdx + 1]) || 3

/** 解析出叶子规则：{ selector, body, context:[atRules], line }。 */
export function parseRules(css) {
  const text = blankComments(css)
  const rules = []
  const stack = []
  let bufStart = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '{') {
      const prelude = text.slice(bufStart, i).trim().replace(/\s+/g, ' ')
      stack.push({ prelude, start: i + 1 })
      bufStart = i + 1
    } else if (c === '}') {
      const frame = stack.pop()
      if (frame) {
        const body = text.slice(frame.start, i)
        const line = text.slice(0, frame.start).split('\n').length
        const context = stack.filter((f) => f.prelude.startsWith('@')).map((f) => f.prelude)
        const inKeyframes = stack.some((f) => /^@(-webkit-)?keyframes/.test(f.prelude))
        if (!inKeyframes) {
          ruleSink(rules, frame.prelude, body, context, line)
        }
      }
      bufStart = i + 1
    } else if (c === ';' && stack.length === 0) {
      bufStart = i + 1
    }
  }
  return rules
}

function ruleSink(rules, selector, body, context, line) {
  const trimmed = selector.trim()
  if (!trimmed) return
  // @keyframes / @font-face 单独统计
  const km = trimmed.match(/^@(-webkit-)?keyframes\s+(.+)$/)
  if (km) {
    rules.push({ kind: 'keyframes', name: km[2].trim(), selector: trimmed, body, context, line })
    return
  }
  if (/^@font-face$/.test(trimmed)) {
    rules.push({ kind: 'font-face', name: trimmed, selector: trimmed, body, context, line })
    return
  }
  // 其他 at-rule（@media/@supports/@layer/@property/@import 等）
  if (trimmed.startsWith('@')) {
    rules.push({ kind: 'at-rule', name: trimmed, selector: trimmed, body, context, line })
    return
  }
  rules.push({ kind: 'rule', selector: trimmed, body, context, line })
}

/** 归一化声明体：去空白/注释，**保持声明顺序**。
 *
 * 顺序不能丢：`height: 100vh; height: 100dvh` 与 `background: <字面量>; background: <var()>`
 * 是刻意的渐进增强回退，反转或去重都会改变生效值。
 */
function normalizeBody(body) {
  return body
    .split(';')
    .map((d) => d.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
}

function canonicalBody(body) {
  return normalizeBody(body).map((d) => d.toLowerCase()).join(';')
}

/**
 * 同属性重复声明分类：
 *  - `fallback`：后者含 `var()` 而前者是字面量（渐进增强回退，保留）；
 *  - `override`：值为简单常量且不同（作者有意覆盖，保留但审计提示）；
 *  - `identical`：完全同值（可安全去重）。
 */
function intraBlockDupes(body) {
  const decls = normalizeBody(body)
  const byProp = new Map()
  for (const d of decls) {
    const m = d.match(/^([a-z-]+)\s*:\s*(.+)$/i)
    if (!m) continue
    const prop = m[1].toLowerCase()
    const list = byProp.get(prop) || []
    list.push(m[2].trim())
    byProp.set(prop, list)
  }
  const out = []
  for (const [prop, values] of byProp) {
    if (values.length < 2) continue
    const uniq = new Set(values.map((v) => v.toLowerCase()))
    let kind = 'override'
    if (uniq.size === 1) kind = 'identical'
    else {
      const last = values[values.length - 1]
      const prev = values[values.length - 2]
      if (/var\(/.test(last) && !/var\(/.test(prev)) kind = 'fallback'
    }
    out.push({ prop, count: values.length, kind })
  }
  return out
}

// ── 样式上下文：scoped / 全局 / 独立投放 ────────────────────────────────────
//
// 跨文件「同选择器 + 同声明体」并不等于冗余：
//   - `<style scoped src>` 里的规则会被编译成 `.x[data-v-xxx]`，两个组件各留一份是封装，不是重复；
//   - `public/static/**` 的样式由后端按 URL 独立投放（例如 runtime.css 被单独注入弹窗文档），
//     即使与 stage.css 有重叠，也必须各自自足。
// 只有「同项目 + 同投放路径 + 全为全局」的跨文件重复才是真冗余。
const OWNER_EXTS = new Set(['.vue', '.html'])
const SCRIPT_EXTS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.cjs'])

const styleContexts = new Map() // `${project}:${rel}` -> Set<'scoped'|'global'>
/** 运行时按 URL 独立投放的样式（`.css` 出现在脚本字符串里，如 `/api/v1/modules/…/runtime.css`）。 */
const runtimeUrlRefs = new Set()
function addContext(key, form) {
  const set = styleContexts.get(key) || new Set()
  set.add(form)
  styleContexts.set(key, set)
}
const keyOf = (target, abs) => `${target.project}:${rel(target.root, abs)}`

/** 解析 `@/x.css`（src 别名）与相对路径，得到与 occurrences.file 同构的键。 */
function resolveSpec(target, fromFile, spec) {
  if (/^(https?:)?\/\//.test(spec) || spec.startsWith('/')) return null
  const base = spec.startsWith('@/')
    ? path.resolve(target.root, 'src', spec.slice(2))
    : path.resolve(path.dirname(fromFile), spec)
  return keyOf(target, base)
}

for (const target of TARGETS) {
  for (const dir of scanDirs(target)) {
    for (const file of walk(dir, new Set([...OWNER_EXTS, ...SCRIPT_EXTS]))) {
      const text = fs.readFileSync(file, 'utf8')
      if (OWNER_EXTS.has(path.extname(file))) {
        for (const m of text.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)) {
          const form = /\bscoped\b/.test(m[1]) ? 'scoped' : 'global'
          const src = /src\s*=\s*["']([^"']+)["']/.exec(m[1])?.[1]
          if (src) {
            const k = resolveSpec(target, file, src)
            if (k) addContext(k, form)
          } else {
            // 无 src 的内联 <style>：上下文归属该 .vue/.html 自身
            addContext(keyOf(target, file), form)
          }
          // <style> 内的 @import 继承该块的 scoped 语义
          for (const im of m[2].matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/g)) {
            const k = resolveSpec(target, file, im[1])
            if (k) addContext(k, form)
          }
        }
      }
      for (const im of text.matchAll(/\bimport\s+["']([^"']+\.css)["']/g)) {
        const k = resolveSpec(target, file, im[1])
        if (k) addContext(k, 'global')
      }
      // 脚本里按 URL 引用的 .css（后端按 URL 投放，未必 import）：记 basename
      for (const m of text.matchAll(/["'`]([^"'`\n]*\.css)["'`]/g)) {
        if (/\/(?:static|api)\//.test(m[1])) runtimeUrlRefs.add(path.posix.basename(m[1]))
      }
    }
  }
}

/** `public/static/**` 由后端按 URL 独立投放 → 需要自足。 */
const deliveryOf = (key) =>
  key.includes(':public/static/') || runtimeUrlRefs.has(path.posix.basename(key)) ? 'runtime' : 'bundled'
const projectOf = (key) => key.split(':')[0]

function classifyGroup(files) {
  if (new Set(files.map(projectOf)).size > 1) return 'cross-project'
  // URL 投放的样式无法保证「同一文档必然共载」（弹窗/编辑器只注入自己需要的那份）→ 必须各自自足
  if (files.some((f) => deliveryOf(f) === 'runtime')) return 'cross-bundle'
  const forms = files.map((f) => styleContexts.get(f))
  if (forms.some((s) => s?.has('scoped'))) return 'scoped-distinct'
  if (forms.some((s) => !s)) return 'unattributed'
  return 'redundant'
}

// ── 收集 ────────────────────────────────────────────────────────────────────
const ruleGroups = new Map() // selector||body -> [{file,line,context}]
const bodyGroups = new Map() // body -> [{file,line,selector}]
const keyframeGroups = new Map() // name -> [{file,line,body}]
const tokenDefs = new Map() // --name -> [{file,line,value,selector}]
const intra = []
const emptyRules = []
const important = []
let vendoredSkipped = 0

for (const target of TARGETS) {
  for (const dir of scanDirs(target)) {
    for (const file of walk(dir, STYLE_EXTS)) {
      const r = `${target.project}:${rel(target.root, file)}`
      const repoRel = rel(REPO_ROOT, file)
      const mirror = isMirror(repoRel)
      if (isVendored(r)) {
        vendoredSkipped += 1
        continue
      }
      const rules = parseRules(extractStyleText(file, fs.readFileSync(file, 'utf8')))
      for (const rule of rules) {
        if (rule.kind === 'keyframes') {
          const list = keyframeGroups.get(rule.name) || []
          list.push({ file: r, line: rule.line, canonical: canonicalBody(rule.body), mirror })
          keyframeGroups.set(rule.name, list)
          continue
        }
        if (rule.kind !== 'rule') continue
        const decls = normalizeBody(rule.body)
        if (decls.length === 0) {
          emptyRules.push({ file: r, line: rule.line, selector: rule.selector })
          continue
        }
        const canon = canonicalBody(rule.body)
        const ctx = rule.context.join(' && ')
        const key = `${rule.selector}|||${ctx}|||${canon}`
        const g = ruleGroups.get(key) || { selector: rule.selector, context: ctx, canon, occurrences: [] }
        g.occurrences.push({ file: r, line: rule.line, mirror })
        ruleGroups.set(key, g)

        if (decls.length >= MIN_DECLS) {
          const bg = bodyGroups.get(canon) || { decls: decls.length, occurrences: [] }
          bg.occurrences.push({ file: r, line: rule.line, selector: rule.selector })
          bodyGroups.set(canon, bg)
        }

        const dup = intraBlockDupes(rule.body)
        if (dup.length) {
          intra.push({
            file: r,
            line: rule.line,
            selector: rule.selector,
            dup,
            isFallbackOnly: dup.every((d) => d.kind === 'fallback' || d.kind === 'override'),
          })
        }
        if (/!important/.test(rule.body)) {
          important.push({ file: r, line: rule.line, selector: rule.selector, count: (rule.body.match(/!important/g) || []).length })
        }
        // 块内自定义属性定义
        for (const m of rule.body.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)) {
          const list = tokenDefs.get(m[1]) || []
          list.push({ file: r, line: rule.line, value: m[2].trim().replace(/\s+/g, ' '), selector: rule.selector })
          tokenDefs.set(m[1], list)
        }
      }
    }
  }
}

// ── 归组 ────────────────────────────────────────────────────────────────────
const duplicateRules = [...ruleGroups.values()]
  .filter((g) => g.occurrences.length > 1)
  .map((g) => {
    const files = [...new Set(g.occurrences.map((o) => o.file))]
    return {
      selector: g.selector,
      context: g.context,
      declCount: g.canon.split(';').filter(Boolean).length,
      count: g.occurrences.length,
      // 全部出现在同源镜像文件之间 → 设计内的镜像，不算可清理重复
      mirrorOnly: g.occurrences.every((o) => o.mirror),
      classification: g.occurrences.every((o) => o.mirror) ? 'mirror' : classifyGroup(files),
      files,
      occurrences: g.occurrences,
    }
  })
  .sort(
    (a, b) =>
      Number(a.mirrorOnly) - Number(b.mirrorOnly) ||
      Number(b.classification === 'redundant') - Number(a.classification === 'redundant') ||
      b.count * b.declCount - a.count * a.declCount,
  )

// 同一规则体被多个不同选择器复用（复制粘贴候选）
const reusedBodies = [...bodyGroups.values()]
  .filter((g) => new Set(g.occurrences.map((o) => o.selector)).size > 1)
  .map((g) => ({
    declCount: g.decls,
    selectorCount: new Set(g.occurrences.map((o) => o.selector)).size,
    occurrences: g.occurrences.length,
    sample: g.occurrences.slice(0, 12),
  }))
  .sort((a, b) => b.declCount * b.occurrences - a.declCount * a.occurrences)

const duplicateKeyframes = [...keyframeGroups.entries()]
  .filter(([, v]) => v.length > 1)
  .map(([name, v]) => ({
    name,
    count: v.length,
    identical: new Set(v.map((x) => x.canonical)).size === 1,
    mirrorOnly: v.every((x) => x.mirror),
    occurrences: v,
  }))
  .sort((a, b) => Number(a.mirrorOnly) - Number(b.mirrorOnly) || b.count - a.count)

const duplicateTokens = [...tokenDefs.entries()]
  .filter(([, v]) => v.length > 1)
  .map(([name, v]) => {
    const values = [...new Set(v.map((x) => x.value))]
    return {
      name,
      count: v.length,
      distinctValues: values.length,
      conflict: values.length > 1,
      values: values.slice(0, 6),
      occurrences: v.slice(0, 12),
    }
  })
  .sort((a, b) => (b.conflict ? 1 : 0) - (a.conflict ? 1 : 0) || b.count - a.count)

const result = {
  generatedAt: new Date().toISOString(),
  minDecls: MIN_DECLS,
  vendoredSkipped,
  totals: {
    duplicateRuleGroups: duplicateRules.length,
    // 真冗余（同项目 + 同投放路径 + 全全局）→ 可安全去重
    duplicateRuleGroupsCleanable: duplicateRules.filter((g) => g.classification === 'redundant').length,
    // 刻意重复：scoped 封装 / 跨 bundle 自足 / 跨项目
    duplicateRuleGroupsIntentional: duplicateRules.filter((g) =>
      ['scoped-distinct', 'cross-bundle', 'cross-project'].includes(g.classification),
    ).length,
    duplicateRuleGroupsUnattributed: duplicateRules.filter((g) => g.classification === 'unattributed').length,
    byClassification: duplicateRules.reduce((acc, g) => {
      acc[g.classification] = (acc[g.classification] || 0) + 1
      return acc
    }, {}),
    mirrorOnlyRuleGroups: duplicateRules.filter((g) => g.mirrorOnly).length,
    duplicateRuleInstances: duplicateRules.reduce((n, g) => n + (g.count - 1), 0),
    reusedBodyGroups: reusedBodies.length,
    duplicateKeyframeNames: duplicateKeyframes.length,
    duplicateKeyframeNamesCleanable: duplicateKeyframes.filter((k) => !k.mirrorOnly).length,
    duplicateTokenNames: duplicateTokens.length,
    conflictingTokenNames: duplicateTokens.filter((t) => t.conflict).length,
    intraBlockDupes: intra.length,
    intraBlockIdentical: intra.filter((i) => i.dup.some((d) => d.kind === 'identical')).length,
    intraBlockFallbackOnly: intra.filter((i) => i.isFallbackOnly).length,
    emptyRules: emptyRules.length,
    importantBlocks: important.length,
    importantTotal: important.reduce((n, i) => n + i.count, 0),
  },
  duplicateRules: duplicateRules.filter((g) => !g.mirrorOnly).slice(0, 300),
  mirrorOnlyRules: duplicateRules.filter((g) => g.mirrorOnly).slice(0, 100),
  reusedBodies: reusedBodies.slice(0, 200),
  duplicateKeyframes: duplicateKeyframes.filter((k) => !k.mirrorOnly),
  mirrorOnlyKeyframes: duplicateKeyframes.filter((k) => k.mirrorOnly),
  duplicateTokens: duplicateTokens.slice(0, 400),
  intraBlockDupes: intra.slice(0, 200),
  emptyRules: emptyRules.slice(0, 200),
  importantTop: important.sort((a, b) => b.count - a.count).slice(0, 60),
}

writeJson(`${OUT_DIR}/css-duplicates.json`, result)
if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  console.log('CSS 重复定义审计：')
  console.log(
    `  跨文件完全重复规则组：真冗余 ${result.totals.duplicateRuleGroupsCleanable}，` +
      `刻意重复 ${result.totals.duplicateRuleGroupsIntentional}，未归属 ${result.totals.duplicateRuleGroupsUnattributed}，` +
      `同源镜像 ${result.totals.mirrorOnlyRuleGroups}`,
  )
  console.log(`  分类明细：${JSON.stringify(result.totals.byClassification)}`)
  console.log(`  复制粘贴规则体（多选择器同体）：${result.totals.reusedBodyGroups}`)
  console.log(`  重复 @keyframes 名：可清理 ${result.totals.duplicateKeyframeNamesCleanable} / 镜像 ${result.mirrorOnlyKeyframes.length}`)
  console.log(`  重复自定义属性名：${result.totals.duplicateTokenNames}（其中值冲突 ${result.totals.conflictingTokenNames}）`)
  console.log(`  块内重复声明：${result.totals.intraBlockDupes}`)
  console.log(`  空规则：${result.totals.emptyRules}`)
  console.log(`  !important 规则块：${result.totals.importantBlocks}（共 ${result.totals.importantTotal} 处）`)
  console.log('\nTop 重复令牌（值冲突优先）：')
  for (const t of duplicateTokens.slice(0, 15)) {
    console.log(`  ${t.name}  定义 ${t.count} 次  ${t.conflict ? `值冲突(${t.distinctValues})` : '同值'}  ${t.values.slice(0, 3).join(' | ')}`)
  }
}
