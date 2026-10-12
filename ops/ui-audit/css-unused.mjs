#!/usr/bin/env node
/**
 * CSS 无用定义审计：
 *  1) 死样式表：全仓（含 JSON 种子 / 后端配置 / 文档）都不引用其文件名的 .css；
 *  2) 无用类名：在使用侧代码（模板/脚本，去 <style>）里「整词」从不出现；
 *     进一步区分「严格无引用」与「疑似动态拼接」（存在 `--` 前缀词干，如 `foo--${x}`）；
 *  3) 无用 id 选择器（同上）。
 *
 * 口径保守：任一使用侧文件出现整词即判为使用；动态拼接词干另列，不算死。
 *
 * 用法：`node ops/ui-audit/css-unused.mjs [--json]`
 * 产出：reports/css-unused.json
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  blankComments,
  walk,
  STYLE_EXTS,
  USAGE_EXTS,
  rel,
  writeJson,
  stripStyleBlocks,
  tokenize,
  isVendored,
  extractStyleText,
} from './lib/scan.mjs'
import { REPO_ROOT, TARGETS, scanDirs, OUT_DIR } from './targets.mjs'

const asJson = process.argv.includes('--json')

// ── 1. 样式表清单 ───────────────────────────────────────────────────────────
const styleFiles = []
for (const target of TARGETS) {
  for (const dir of scanDirs(target)) {
    for (const f of walk(dir, STYLE_EXTS)) {
      styleFiles.push({ file: f, rel: rel(REPO_ROOT, f), project: target.project })
    }
  }
}

// ── 2. 使用侧语料（模板/脚本，去 <style>） ─────────────────────────────────
const usageFiles = []
for (const target of TARGETS) {
  for (const dir of scanDirs(target)) {
    for (const f of walk(dir, USAGE_EXTS)) usageFiles.push(f)
  }
}
for (const extra of ['design', 'packages/shared']) {
  for (const f of walk(path.join(REPO_ROOT, extra), USAGE_EXTS)) usageFiles.push(f)
}

const usageTexts = usageFiles.map((f) => {
  try {
    return { file: f, text: fs.readFileSync(f, 'utf8') }
  } catch {
    return { file: f, text: '' }
  }
})
const usageWords = new Set()
for (const u of usageTexts) for (const w of tokenize(stripStyleBlocks(u.text))) usageWords.add(w)

// ── 3. 引用语料（全仓，判死样式表用） ───────────────────────────────────────
const REF_EXTS = new Set([
  '.html', '.json', '.py', '.ts', '.tsx', '.vue', '.js', '.mjs', '.cjs', '.css',
  '.md', '.toml', '.yml', '.yaml', '.txt', '.sh', '.cfg', '.ini',
])
const SKIP_REF = /(?:^|\/)(node_modules|dist|\.git|__pycache__|\.venv-store|backups|ui-audit\/reports)\//
const refTexts = []
function collectRefs(dir, depth = 0) {
  if (depth > 12 || !fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const relPosix = `${rel(REPO_ROOT, full)}`
    if (SKIP_REF.test(`/${relPosix}/`) || SKIP_REF.test(`${relPosix}/`)) continue
    if (entry.isDirectory()) collectRefs(full, depth + 1)
    else if (entry.isFile() && REF_EXTS.has(path.extname(entry.name)) && entry.name !== 'bun.lock') {
      try {
        const st = fs.statSync(full)
        if (st.size < 4_000_000) refTexts.push({ file: full, text: fs.readFileSync(full, 'utf8') })
      } catch {
        /* ignore */
      }
    }
  }
}
collectRefs(REPO_ROOT)

const deadStylesheets = []
for (const s of styleFiles) {
  const base = path.basename(s.file)
  const referenced = refTexts.some((c) => c.file !== s.file && c.text.includes(base))
  if (!referenced) deadStylesheets.push({ file: s.rel, project: s.project })
}

// ── 4. 抽取类名/id 选择器 ───────────────────────────────────────────────────
function collectSelectors(text) {
  const cleaned = blankComments(text)
  const classes = new Map()
  const ids = new Map()
  for (const m of cleaned.matchAll(/([^{}]+)\{/g)) {
    const prelude = m[1].trim().replace(/\s+/g, ' ')
    if (!prelude || prelude.startsWith('@')) continue
    if (/^\d|^(from|to)\b/.test(prelude)) continue
    for (const cm of prelude.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) {
      classes.set(cm[1], (classes.get(cm[1]) || 0) + 1)
    }
    for (const im of prelude.matchAll(/#([A-Za-z_][A-Za-z0-9_-]*)/g)) {
      ids.set(im[1], (ids.get(im[1]) || 0) + 1)
    }
  }
  return { classes, ids }
}

const classIndex = new Map() // name -> [{file, occurrences}]
const idIndex = new Map() // name -> Set<file>
for (const s of styleFiles) {
  const { classes, ids } = collectSelectors(extractStyleText(s.file, fs.readFileSync(s.file, 'utf8')))
  for (const [name, occurrences] of classes) {
    const list = classIndex.get(name) || []
    list.push({ file: s.rel, occurrences })
    classIndex.set(name, list)
  }
  for (const [name] of ids) {
    const set = idIndex.get(name) || new Set()
    set.add(s.rel)
    idIndex.set(name, set)
  }
}

// ── 5. 动态拼接词干：`a--b` / `a-b-c` 的前缀词干若在使用侧出现，判为疑似动态 ──
function dynamicStem(name) {
  const stems = []
  const dbl = name.split('--')[0]
  if (dbl !== name && dbl.length >= 4) stems.push(dbl)
  let cur = name
  while (cur.includes('-')) {
    cur = cur.slice(0, cur.lastIndexOf('-'))
    if (cur.length >= 6) stems.push(cur)
    else break
  }
  return stems.find((s) => usageWords.has(s)) || null
}

/**
 * 约定类名：由框架/库在运行时添加，代码里不会出现字面量，**不属于死类**。
 *  Vue 过渡（`fade-enter-active` 等）、FontAwesome（`fa*`）、状态前缀、无障碍工具类。
 */
function isConventionClass(name) {
  if (/^(is|has|js|no|sr)-/.test(name)) return true
  if (/(^|-)(enter|leave|appear)(-|$)/.test(name) || /-move$/.test(name)) return true
  if (/^fa(-|$)/.test(name) || /^fa[a-z]?$/.test(name)) return true
  if (/^(perf|touch)-/.test(name)) return true
  if (/^(sr-only|visually-hidden|notranslate|clearfix|gpu-|no-scrollbar|custom-scrollbar)/.test(name)) return true
  return false
}

const unusedStrict = []
const unusedConvention = []
const unusedDynamic = []
let vendoredSkipped = 0
for (const [name, files] of classIndex) {
  const entry = {
    name,
    totalOccurrences: files.reduce((n, f) => n + f.occurrences, 0),
    definedIn: files.map((f) => f.file),
  }
  if (usageWords.has(name)) continue
  if (isVendored(entry.definedIn[0])) {
    vendoredSkipped += 1
    continue
  }
  if (isConventionClass(name)) {
    unusedConvention.push(entry)
    continue
  }
  const stem = dynamicStem(name)
  if (stem) unusedDynamic.push({ ...entry, stem })
  else unusedStrict.push(entry)
}
unusedStrict.sort((a, b) => b.totalOccurrences - a.totalOccurrences)
unusedConvention.sort((a, b) => b.totalOccurrences - a.totalOccurrences)
unusedDynamic.sort((a, b) => b.totalOccurrences - a.totalOccurrences)

const unusedIds = []
for (const [name, files] of idIndex) {
  if (usageWords.has(name)) continue
  if (dynamicStem(name)) continue
  unusedIds.push({ name, definedIn: [...files] })
}
unusedIds.sort((a, b) => b.definedIn.length - a.definedIn.length)

const result = {
  generatedAt: new Date().toISOString(),
  styleFileCount: styleFiles.length,
  deadStylesheetCount: deadStylesheets.length,
  deadStylesheets,
  classCount: classIndex.size,
  vendoredSkipped,
  unusedStrictCount: unusedStrict.length,
  unusedConventionCount: unusedConvention.length,
  unusedDynamicCount: unusedDynamic.length,
  unusedStrict: unusedStrict.slice(0, 500),
  unusedConvention: unusedConvention.slice(0, 300),
  unusedDynamic: unusedDynamic.slice(0, 300),
  unusedIdCount: unusedIds.length,
  unusedIds: unusedIds.slice(0, 200),
}

writeJson(`${OUT_DIR}/css-unused.json`, result)
if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  console.log(`样式表 ${styleFiles.length} 个；死样式表：${deadStylesheets.length}`)
  for (const d of deadStylesheets) console.log(`  ${d.file}`)
  console.log(`\n类选择器 ${classIndex.size} 个`)
  console.log(`  严格无引用（删除候选）：${unusedStrict.length}`)
  for (const u of unusedStrict.slice(0, 25)) console.log(`    .${u.name}  ×${u.totalOccurrences}  ${u.definedIn[0]}`)
  console.log(`  框架/状态约定（不算死）：${unusedConvention.length}`)
  console.log(`  疑似动态拼接（保留）：${unusedDynamic.length}`)
  console.log(`无用 id 候选：${unusedIds.length}`)
}
