#!/usr/bin/env node
/**
 * 全仓「无引用令牌」核验。
 *
 * 判定不依赖 `var()` 正则（它会被 `var(--a, var(--b))` 这类嵌套骗过），而是把样式文本里
 * 每个 `--name` 出现点分成两类：
 *   - **定义**：紧接 `:`（`--x: <value>`）；
 *   - **使用**：其他任何位置（`var(--x)`、`var(--a, var(--x))`、`@property --x`、`animation` …）。
 * 再把 JS/模板/后端里的字面出现（`:style`、`setProperty`、字符串常量）也算作使用。
 *
 * 结果分四档：
 *   - `dead`       ：有定义、样式内无使用、脚本里也从不出现 —— 删除候选；
 *   - `js-injected`：样式内无 `var()` 使用，但脚本/模板里出现 —— 保留；
 *   - `reserved`   ：定义全部落在策展令牌字典（main.css / hos-design-system.css）—— 刻意预留；
 *   - `referenced` ：样式内有使用 —— 保留。
 *
 * 用法：`node ops/ui-audit/token-orphans.mjs [--json]`
 * 产出：reports/token-orphans.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { walk, rel, writeJson, isVendored, blankComments, extractStyleText } from './lib/scan.mjs'
import { REPO_ROOT, OUT_DIR, isMirror, isCuratedTokenFile } from './targets.mjs'

const asJson = process.argv.includes('--json')

const NAME_RE = /--[a-zA-Z0-9-]+(?![a-zA-Z0-9-])/g

/** 声明起始处的上一个非空白字符必须是 `{` / `;` / 文件开头，否则不是定义。 */
function startsDecl(text, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (/\s/.test(text[i])) continue
    return text[i] === '{' || text[i] === ';'
  }
  return true
}

/** 出现点是否处于 `var(...)` / `env(...)` 的括号内（含嵌套第二参数）。 */
function inVarContext(before) {
  let depth = 0
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const ch = before[i]
    if (ch === ')') depth += 1
    else if (ch === '(') {
      if (depth === 0) return /(?:var|env)\s*$/.test(before.slice(0, i))
      depth -= 1
    }
  }
  return false
}

const SCAN_EXTS = new Set(['.css', '.vue', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.html', '.json', '.py'])
const SKIP = /(?:^|\/)(node_modules|dist|\.git|__pycache__|\.venv-store|backups|ui-audit\/reports)\//

const files = []
function collect(dir, depth = 0) {
  if (depth > 12 || !fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    const r = rel(REPO_ROOT, full)
    if (SKIP.test(`/${r}/`) || SKIP.test(`${r}/`)) continue
    if (e.isDirectory()) collect(full, depth + 1)
    else if (e.isFile() && SCAN_EXTS.has(path.extname(e.name)) && !isVendored(r)) {
      try {
        if (fs.statSync(full).size < 4_000_000) files.push(full)
      } catch {
        /* ignore */
      }
    }
  }
}
collect(REPO_ROOT)

const defSites = new Map()
const useSites = new Map()
const scriptSites = new Map()

const lineOf = (text, i) => text.slice(0, i).split('\n').length

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8')
  const r = rel(REPO_ROOT, file)
  const isCss = file.endsWith('.css')
  const isVue = file.endsWith('.vue') || file.endsWith('.html')

  if (isCss || isVue) {
    const style = blankComments(extractStyleText(file, raw))
    for (const m of style.matchAll(NAME_RE)) {
      const name = m[0]
      const before = style.slice(0, m.index)
      const after = style.slice(m.index + name.length)
      // 定义：处于声明起始处且紧接 `:`；否则只在 `var()/env()/@property` 语境里算使用，
      // 这样 `.card--high::before`（BEM 修饰符）不会被误判成令牌。
      if (/^\s*:/.test(after) && startsDecl(style, m.index)) {
        const list = defSites.get(name) || []
        list.push({ file: r, line: lineOf(style, m.index) })
        defSites.set(name, list)
      } else if (inVarContext(before) || /@property\s*$/.test(before)) {
        const list = useSites.get(name) || []
        list.push({ file: r, line: lineOf(style, m.index) })
        useSites.set(name, list)
      }
    }
  }

  // 脚本/模板/后端里的字面出现（.css 无脚本区）
  if (!isCss) {
    const nonStyle = isVue ? raw.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ') : raw
    for (const m of nonStyle.matchAll(NAME_RE)) {
      const list = scriptSites.get(m[0]) || []
      list.push({ file: r, line: lineOf(nonStyle, m.index) })
      scriptSites.set(m[0], list)
    }
  }
}

const allNames = new Set([...defSites.keys(), ...useSites.keys(), ...scriptSites.keys()])
const dead = []
const referenced = []
const jsInjected = []
const reserved = []

for (const name of allNames) {
  const defs = defSites.get(name) || []
  const uses = useSites.get(name) || []
  const scripts = scriptSites.get(name) || []
  if (uses.length) {
    referenced.push({ name, defCount: defs.length, useCount: uses.length })
    continue
  }
  if (scripts.length) {
    jsInjected.push({ name, defCount: defs.length, sample: scripts.slice(0, 4) })
    continue
  }
  if (defs.length) {
    const mirrorOnly = defs.every((d) => isMirror(d.file))
    if (mirrorOnly) continue
    // 定义全部落在策展令牌字典（main.css / hos-design-system.css）→ 刻意预留，不算无用
    if (defs.every((d) => isCuratedTokenFile(d.file))) {
      reserved.push({ name, defCount: defs.length, defs: defs.slice(0, 8) })
      continue
    }
    dead.push({ name, defCount: defs.length, defs: defs.slice(0, 8) })
  }
}

dead.sort((a, b) => a.name.localeCompare(b.name))
jsInjected.sort((a, b) => a.name.localeCompare(b.name))
reserved.sort((a, b) => a.name.localeCompare(b.name))

const result = {
  generatedAt: new Date().toISOString(),
  filesScanned: files.length,
  totalNames: allNames.size,
  referencedCount: referenced.length,
  deadCount: dead.length,
  jsInjectedCount: jsInjected.length,
  reservedCount: reserved.length,
  dead,
  jsInjected,
  reserved,
}
writeJson(`${OUT_DIR}/token-orphans.json`, result)

if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  console.log(`令牌名 ${allNames.size} 个（扫描 ${files.length} 个文件）`)
  console.log(`  样式内有使用：${referenced.length}`)
  console.log(`  仅脚本/模板出现（保留）：${jsInjected.length}`)
  console.log(`  策展字典内刻意预留：${reserved.length}`)
  console.log(`  无任何使用（删除候选）：${dead.length}`)
  for (const d of dead.slice(0, 40)) console.log(`  ${d.name}  ×${d.defCount}  ${d.defs[0]?.file}:${d.defs[0]?.line}`)
}
