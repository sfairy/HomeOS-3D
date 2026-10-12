/**
 * 生成 UI 令牌映射契约：ops/contracts/ui-token-map.json + docs/ui-audit/09-token-contract.md
 *
 * 做四件事：解析别名链到语义原语、检出同名分歧定义、判定区域越界、列出权威命名空间里只靠回退兜底的引用。
 *
 * 用法：`node ops/ui-audit/collect-token-map.mjs`
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, TARGETS, scanDirs, OUT_DIR } from './targets.mjs'
import { walk, rel, STYLE_EXTS, extractStyleText, writeJson, parseCssColor, blankComments } from './lib/scan.mjs'

const TARGET_ID_BY_ROOT = new Map()
for (const t of TARGETS) {
  TARGET_ID_BY_ROOT.set(t.root, t.id)
  for (const r of t.scan) TARGET_ID_BY_ROOT.set(path.join(t.root, r), t.id)
}

/** 权威语义层的所有者：`--hos-*` 归主应用设计系统，`--hb-*` 归商店，`--set-*`/`--premium-*` 归 premium 层。 */
const PREFIX_OWNER = {
  '--hos-': ['homeos/frontend/src/assets/styles/hos-design-system.css'],
  '--hb-': ['homeos-store/frontend/public/static/theme.css'],
  '--set-': ['homeos/frontend/src/assets/styles/app-premium-tokens.css'],
  '--premium-': ['homeos/frontend/src/assets/styles/app-premium-tokens.css'],
  '--module-accent-': ['homeos/frontend/src/assets/styles/app-premium-tokens.css'],
}

/** 声明式例外：镜像副本与「暖金区借道 --hos-* 命名空间」的既有事实，先记录再逐步收敛。 */
const PREFIX_EXCEPTIONS = {
  '--hos-': [
    'homeos/frontend/public/static/appearance.css',
    'homeos/frontend/public/static/auth/scene/panel.css',
    'homeos/frontend/public/static/auth/scene/page.css',
    'homeos/frontend/public/static/auth/scene/scene.css',
    'homeos-store/frontend/public/static/scene/panel.css',
    'homeos-store/frontend/public/static/scene/page.css',
    'homeos-store/frontend/public/static/scene/scene.css',
    'design/scene/panel.css',
    'design/scene/page.css',
    'design/scene/scene.css',
  ],
}

/** 主应用 CSS 加载顺序（取自 src/main.ts 的 import 次序）——决定同名定义谁生效。 */
function cssEntryOrder() {
  const entry = path.join(REPO_ROOT, 'homeos/frontend/src/main.ts')
  if (!fs.existsSync(entry)) return []
  const order = []
  for (const m of fs.readFileSync(entry, 'utf8').matchAll(/import\s+'\.\/(assets\/styles\/[^']+\.css)'/g)) {
    order.push(`homeos/frontend/src/${m[1]}`)
  }
  return order
}

/** 每个 `@media` 块的字符区间 —— 用于区分「全局覆盖」与「响应式覆盖」。 */
function mediaRanges(cleaned) {
  const ranges = []
  for (const m of cleaned.matchAll(/@(media|supports)[^{]*\{/g)) {
    let depth = 0
    let i = m.index + m[0].length - 1
    for (; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++
      else if (cleaned[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    ranges.push([m.index, i])
  }
  return ranges
}

/** 向上找最近的块选择器（与 lib 同法，但保留偏移以便判断是否落在 @media 内）。 */
function selectorAt(cleaned, offset) {
  let depth = 0
  for (let i = offset; i >= 0; i--) {
    const c = cleaned[i]
    if (c === '}') depth++
    else if (c === '{') {
      if (depth === 0) return cleaned.slice(cleaned.lastIndexOf('}', i) + 1, i).trim().replace(/\s+/g, ' ')
      depth--
    }
  }
  return ''
}

/** 只认全局作用域（`:root` / `html`）的定义 —— 组件内的局部覆盖属正常 scoped 主题化，不进契约。 */
function collectDefs() {
  const byName = new Map()
  for (const target of TARGETS) {
    for (const dir of scanDirs(target)) {
      for (const file of walk(dir, STYLE_EXTS)) {
        const text = extractStyleText(file, fs.readFileSync(file, 'utf8'))
        if (!text.trim()) continue
        const relPath = rel(REPO_ROOT, file)
        const cleaned = blankComments(text)
        const media = mediaRanges(cleaned)
        for (const m of cleaned.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)) {
          const selector = selectorAt(cleaned, m.index)
          if (!/^(?::root|html)\b/.test(selector) && !/^(?::root|html)\s*,/.test(selector)) continue
          const inMedia = media.some(([a, b]) => m.index > a && m.index < b)
          if (!byName.has(m[1])) byName.set(m[1], [])
          byName.get(m[1]).push({
            file: relPath,
            value: m[2].trim(),
            line: cleaned.slice(0, m.index).split('\n').length,
            selector,
            inMedia,
          })
        }
      }
    }
  }
  return byName
}

const VAR_ONLY = /^var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([\s\S]*?))?\s*\)$/

/** 沿 var() 链解析到字面量；返回 { value, chain } 或 null。 */
function resolveLiteral(name, byName, seen = new Set()) {
  if (seen.has(name)) return null
  seen.add(name)
  const defs = byName.get(name)
  if (!defs || !defs.length) return null
  for (let i = defs.length - 1; i >= 0; i--) {
    const m = defs[i].value.match(VAR_ONLY)
    if (!m) return { value: defs[i].value, chain: [...seen] }
    const inner = resolveLiteral(m[1], byName, new Set(seen))
    if (inner) return { value: inner.value, chain: [...seen, ...inner.chain] }
    if (m[2]) return { value: m[2].trim(), chain: [...seen] }
  }
  return null
}

const VAR_ANY = /var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g

/** 递归把值里嵌套的 var() 替换成解析后的字面量（含渐变内部的引用）。 */
function substituteVars(value, byName, depth = 0) {
  if (depth > 8) return value
  return value.replace(VAR_ANY, (m, name, fb) => {
    const r = resolveLiteral(name, byName)
    if (r) return substituteVars(r.value, byName, depth + 1)
    return fb ? substituteVars(fb.trim(), byName, depth + 1) : m
  })
}

const COLOR_TOKEN = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\(\s*[\d.]+\s*[,\s]\s*[\d.]+\s*[,\s]\s*[\d.]+(?:\s*[,/]\s*[\d.]+%?)?\s*\)/gi

/** 比较键：解析嵌套 var() 后，把颜色字面量归一为数值元组，消除 hex/rgba 写法差异。 */
function valueKey(value, byName) {
  const substituted = substituteVars(value, byName)
  return substituted
    .replace(COLOR_TOKEN, (m) => {
      const c = parseCssColor(m)
      return c ? `C(${c.r},${c.g},${c.b},${Number(c.a ?? 1).toFixed(3)})` : m
    })
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const byName = collectDefs()
const order = cssEntryOrder()
const orderIndex = new Map(order.map((f, i) => [f, i]))

// ── 1. 别名表：所有「纯 var() 别名」→ 目标 ──────────────────────────────────
const aliases = []
for (const [name, defs] of byName) {
  const targets = new Set()
  let pure = true
  for (const d of defs) {
    const m = d.value.match(VAR_ONLY)
    if (!m || m[2]) pure = false
    else targets.add(m[1])
  }
  if (!pure || targets.size !== 1) continue
  const resolved = resolveLiteral(name, byName)
  aliases.push({
    name,
    target: [...targets][0],
    resolved: resolved?.value ?? null,
    chain: resolved?.chain ?? [],
    definedIn: defs.map((d) => d.file),
  })
}

// ── 2. 分歧定义：同名在不同文件解析出不同字面量 ────────────────────────────
const conflicts = []
for (const [name, defs] of byName) {
  if (defs.length < 2) continue
  const perFile = new Map()
  for (const d of defs) perFile.set(d.file, valueKey(d.value, byName))
  const keys = new Set(perFile.values())
  if (keys.size < 2) continue
  const files = [...perFile.keys()]
  const known = files.every((f) => orderIndex.has(f))
  let effective = null
  let effectiveFrom = null
  if (known) {
    const last = files.slice().sort((a, b) => orderIndex.get(a) - orderIndex.get(b)).pop()
    effective = perFile.get(last)
    effectiveFrom = last
  }
  conflicts.push({
    name,
    defs: [...perFile].map(([file, value]) => ({ file, value })),
    orderKnown: known,
    effective,
    effectiveFrom,
  })
}

// ── 2b. 值同构镜像：同名在多文件、且解析值完全一致（重复定义，改动易失同步） ──
const mirrors = []
for (const [name, defs] of byName) {
  if (defs.length < 2) continue
  const values = new Set(defs.map((d) => valueKey(d.value, byName)))
  if (values.size !== 1) continue
  mirrors.push({ name, value: defs[defs.length - 1].value, files: [...new Set(defs.map((d) => d.file))] })
}

// ── 3. 命名空间遮蔽（只算「所有者已定义、他处又全局重定义」的名字） ────────
// 组件私有子命名空间（如 --hos-dd-*）不在所有者内定义，不算遮蔽。
const bleeds = []
for (const [prefix, owners] of Object.entries(PREFIX_OWNER)) {
  const exceptions = new Set(PREFIX_EXCEPTIONS[prefix] ?? [])
  const ownerDefined = new Set()
  for (const owner of owners) {
    for (const [name, defs] of byName) {
      if (!name.startsWith(prefix)) continue
      if (defs.some((d) => d.file === owner)) ownerDefined.add(name)
    }
  }
  for (const name of ownerDefined) {
    for (const d of byName.get(name)) {
      if (d.inMedia || owners.includes(d.file) || exceptions.has(d.file)) continue
      bleeds.push({ prefix, name, file: d.file, line: d.line, value: d.value })
    }
  }
}

// ── 3b. 区域身份色越界：`--hos-*` 命名空间归主应用设计系统，暖金区不得借用 ──
const REGION_TOKENS = /^--(hos|hb)-(accent|lumen|aura|eco)\b/
const CANONICAL_FILE = 'homeos/frontend/src/assets/styles/hos-design-system.css'
const WARM_FILES = new Set([...PREFIX_OWNER['--hb-'], 'homeos/frontend/public/static/appearance.css'])
const regionViolations = []
for (const [name, defs] of byName) {
  if (!REGION_TOKENS.test(name)) continue
  for (const d of defs) {
    if (d.inMedia) continue
    // 暖金身份色借道 --hos-* 命名空间（主应用保留前缀）→ 跨区覆盖风险
    if (name.startsWith('--hos-') && d.file !== CANONICAL_FILE) {
      regionViolations.push({ kind: 'warm-token-in-hos-namespace', name, file: d.file, line: d.line, value: d.value })
    }
    // --hb-* 身份色出现在暖金区与商店之外
    if (name.startsWith('--hb-') && !WARM_FILES.has(d.file) && !d.file.startsWith('homeos-store/')) {
      regionViolations.push({ kind: 'hb-token-outside-warm-region', name, file: d.file, line: d.line, value: d.value })
    }
  }
}

// ── 4. 命名漂移：权威命名空间里只靠回退兜底的引用 ──────────────────────────
/**
 * 证据取自 check-token-contract.mjs 的实测引用（在流水线中先于本脚本运行），
 * 不再手工维护名单：带 `--hos-` 前缀却没有全局定义的名字，渲染结果完全由回退
 * 字面量决定，语义名是假的——写它和写死一个值是同一件事。
 */
const contractPath = path.join(OUT_DIR, 'token-contract.json')
if (!fs.existsSync(contractPath)) {
  throw new Error('缺少 reports/token-contract.json，请先运行 node ops/ui-audit/check-token-contract.mjs')
}
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))

const driftByName = new Map()
for (const ref of contract.unresolvedWithFallback ?? []) {
  if (!ref.name.startsWith('--hos-')) continue
  const hit = driftByName.get(ref.name)
  if (hit) hit.references.push(`${ref.file}:${ref.line}`)
  else driftByName.set(ref.name, { name: ref.name, references: [`${ref.file}:${ref.line}`] })
}

const drift = [...driftByName.values()]
  .map((d) => ({ ...d, referenceCount: d.references.length }))
  .sort((a, b) => a.name.localeCompare(b.name))

const map = {
  $comment:
    'UI 令牌映射契约。canonicalLayer 为语义原语权威源；aliases 为纯 var() 别名链；conflicts 为同名分歧（orderKnown 时 effective 为实测生效值）；namespaceBleed 为跨命名空间/跨区越界；namingDrift 为权威命名空间内从不解析、只能靠回退兜底的名字。由 collect-token-map.mjs 生成，勿手改。',
  generatedAt: new Date().toISOString(),
  canonicalLayer: {
    file: 'homeos/frontend/src/assets/styles/hos-design-system.css',
    prefixes: ['--hos-'],
    covers: ['surface', 'text', 'border', 'radius', 'space'],
  },
  regionContract: {
    warm: { label: '入户 / 认证 / 商店', token: '--hb-accent', value: '#ffc46a', owners: ['homeos/frontend/public/static/appearance.css', 'homeos-store/frontend/public/static/theme.css'] },
    cool: { label: '主应用内', token: '--page-accent', value: '#60a5fa', owners: ['homeos/frontend/src/assets/styles/hos-design-system.css'] },
    rule: '两区各自声明自己的强调色令牌；主应用不得定义 --hb-*，暖金区不得借道 --hos-* 命名空间。',
  },
  aliases,
  conflicts,
  valueIdenticalMirrors: mirrors,
  namespaceBleed: bleeds,
  regionViolations,
  namingDrift: drift,
}

writeJson(path.join(REPO_ROOT, 'ops/contracts/ui-token-map.json'), map)

// ── Markdown ──────────────────────────────────────────────────────────────
const md = []
md.push('# UI 令牌映射契约', '')
md.push('由 `ops/ui-audit/collect-token-map.mjs` 从真实定义生成，机器可读版本在 `ops/contracts/ui-token-map.json`。', '')
md.push('## 权威语义层', '')
md.push('| 层 | 文件 | 覆盖 |')
md.push('| --- | --- | --- |')
md.push('| 语义原语（canonical） | `homeos/frontend/src/assets/styles/hos-design-system.css` | surface / text / border / radius / space |')
md.push('| 主应用兼容别名 | `main.css`、`app-premium-tokens.css` | `--text-*` `--card-bg-*` `--radius-*` `--space-*` `--premium-*` `--set-*` |')
md.push('| 商店语义层 | `homeos-store/frontend/public/static/theme.css` | `--hb-*` |')
md.push('| 暖金品牌区 | `homeos/frontend/public/static/appearance.css` | `--hos-accent` `--hb-accent` `--hos-lumen` `--hos-aura` |')
md.push('')
md.push('## 区域色相契约', '')
md.push(`- 暖金区（${map.regionContract.warm.label}）：\`${map.regionContract.warm.token}\` = \`${map.regionContract.warm.value}\``)
md.push(`- 蓝功能区（${map.regionContract.cool.label}）：\`${map.regionContract.cool.token}\` = \`${map.regionContract.cool.value}\``)
md.push(`- 规则：${map.regionContract.rule}`)
md.push('')
md.push(`## 别名链（${aliases.length} 个）`, '')
md.push('| 别名 | → 目标 | 解析值 | 定义于 |')
md.push('| --- | --- | --- | --- |')
for (const a of aliases.slice().sort((x, y) => x.name.localeCompare(y.name))) {
  md.push(`| \`${a.name}\` | \`${a.target}\` | \`${a.resolved ?? "—"}\` | ${a.definedIn.map((f) => `\`${f}\``).join('<br>')} |`)
}
md.push('')
md.push(`## 同名分歧定义（${conflicts.length} 个）`, '')
md.push('同名自定义属性在多个文件里解析出不同字面量 —— 谁生效取决于加载顺序。', '')
md.push('| 名字 | 各文件取值 | 实测生效 |')
md.push('| --- | --- | --- |')
for (const c of conflicts.slice().sort((x, y) => x.name.localeCompare(y.name))) {
  const defs = c.defs.map((d) => `\`${d.value}\`<br>${d.file}`).join('<br>')
  const eff = c.orderKnown ? `\`${c.effective}\`<br>${c.effectiveFrom}` : '加载顺序未知'
  md.push(`| \`${c.name}\` | ${defs} | ${eff} |`)
}
md.push('')
md.push(`## 值同构镜像（${mirrors.length} 个）`, '')
md.push('同名在多处定义、且解析值完全一致 —— 不是错误，但改动任一处都会立刻产生分歧，需要同步机制或单一来源。', '')
md.push('| 名字 | 取值 | 定义于 |')
md.push('| --- | --- | --- |')
for (const m of mirrors.slice(0, 25).sort((x, y) => x.name.localeCompare(y.name))) md.push(`| \`${m.name}\` | \`${m.value}\` | ${m.files.map((f) => `\`${f}\``).join('<br>')} |`)
if (mirrors.length > 25) md.push(`| … | 另 ${mirrors.length - 25} 个 | |`)
md.push('')
md.push(`## 命名空间遮蔽（${bleeds.length} 处）`, '')
if (!bleeds.length) {
  md.push('无。', '')
} else {
  md.push('| 命名空间 | 名字 | 越界文件 |')
  md.push('| --- | --- | --- |')
  for (const b of bleeds.slice(0, 40)) md.push(`| \`${b.prefix}\` | \`${b.name}\` | \`${b.file}:${b.line}\` |`)
  if (bleeds.length > 40) md.push(`| … | 另 ${bleeds.length - 40} 处 | |`)
  md.push('')
  md.push('> 表中文件在 `PREFIX_EXCEPTIONS` 里声明的既有事实不计入；这里列出的是未登记项。', '')
}
md.push(`## 区域身份色越界（${regionViolations.length} 处）`, '')
if (!regionViolations.length) {
  md.push('无。', '')
} else {
  md.push('| 类型 | 名字 | 越界文件 | 取值 |')
  md.push('| --- | --- | --- | --- |')
  for (const v of regionViolations) md.push(`| ${v.kind} | \`${v.name}\` | \`${v.file}:${v.line}\` | \`${v.value}\` |`)
  md.push('')
}
md.push('## 命名漂移：权威命名空间内只靠回退兜底', '')
if (!drift.length) {
  md.push('无。`--hos-*` 引用全部能在权威层解析，不再有靠回退字面量撑着的假语义名。', '')
} else {
  md.push('| 名字 | 引用处 | 处数 |')
  md.push('| --- | --- | --- |')
  for (const d of drift) {
    md.push(`| \`${d.name}\` | ${d.references.slice(0, 6).map((r) => `\`${r}\``).join('<br>')} | ${d.referenceCount} |`)
  }
  md.push('')
}

const docPath = path.join(REPO_ROOT, 'docs/ui-audit/09-token-contract.md')
fs.mkdirSync(path.dirname(docPath), { recursive: true })
fs.writeFileSync(docPath, md.join('\n'))

console.log('令牌映射：别名 %d，同名分歧 %d，命名空间越界 %d，区域身份色越界 %d，命名漂移 %d', aliases.length, conflicts.length, bleeds.length, regionViolations.length, drift.length)
if (drift.length) console.log('未解析的 --hos-* 名字（漂移）：', drift.map((d) => d.name).join(' '))
console.log('写出：ops/contracts/ui-token-map.json + docs/ui-audit/09-token-contract.md')
console.log('report dir:', rel(REPO_ROOT, OUT_DIR))
