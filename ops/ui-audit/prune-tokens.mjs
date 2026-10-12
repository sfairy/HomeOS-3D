#!/usr/bin/env node
/**
 * 删除「全仓无引用」的 CSS 自定义属性声明。
 *
 * 只处理满足全部条件的行，保证零视觉回归：
 *   - 令牌名在 reports/token-orphans.json 的 `dead` 名单（无 `var()` 引用、也无脚本/模板出现）；
 *   - 该行是**整行单条声明** `  --name: value;`（多声明同行、跨行值一律跳过并报告）；
 *   - 文件是 `.css`（`.vue`/`<style>`、`--tw-*` Tailwind 内部变量一律跳过）；
 *   - 不是同源镜像 / vendor / `.min.css`。
 *
 * 用法：
 *   node ops/ui-audit/prune-tokens.mjs           # dry-run
 *   node ops/ui-audit/prune-tokens.mjs --write
 *
 * 产出：reports/token-prune.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { rel, writeJson, isVendored } from './lib/scan.mjs'
import { REPO_ROOT, OUT_DIR, isMirror, isCuratedTokenFile } from './targets.mjs'

const WRITE = process.argv.includes('--write')

const orphansPath = `${OUT_DIR}/token-orphans.json`
if (!fs.existsSync(orphansPath)) {
  console.error('缺少 reports/token-orphans.json，请先运行 token-orphans.mjs')
  process.exit(1)
}
const orphans = JSON.parse(fs.readFileSync(orphansPath, 'utf8'))

/** 不自动删除：Tailwind 运行时内部变量。 */
const SKIP_NAME = /^--tw-/

/**
 * 不自动删除的文件：核心令牌目录（逐条都有注释、且含**刻意保留**的令牌，
 * 例如 main.css 的 `--z-modal 保留为 shell 底部档位，当前无消费者`）。
 * 这些文件的死令牌只报告、不改动。
 */
/** 不自动删除的文件：策展令牌字典（逐条都有注释、且含刻意保留的令牌）。 */
const skipFile = (relPath) => isCuratedTokenFile(relPath)

/** 邻近注释里出现「刻意保留 / 待决策」措辞时，不删。 */
const RETENTION_HINT = /保留|预留|暂无|无消费者|未接|待用|占位待|没有取用点|无取用点|取用点|待决策|reserved|keep\b/i

const deadByName = new Map()
for (const d of orphans.dead) {
  if (SKIP_NAME.test(d.name)) continue
  for (const site of d.defs) {
    if (skipFile(site.file)) continue
    const list = deadByName.get(site.file) || new Set()
    list.add(d.name)
    deadByName.set(site.file, list)
  }
}

const { blankComments } = await import('./lib/scan.mjs')

/** 声明匹配：`--name: value;`（值内不含 `;{}`；多行值会在下面被跳过）。 */
const DECL_RE = /--[a-zA-Z0-9-]+\s*:\s*[^;{}]*;/g

/**
 * 声明是否可安全删除：
 *  - 值的引号/括号必须闭合（否则 `url("data:...;base64,...")` 里的 `;` 会被误当声明结尾）；
 *  - 声明之后只能是行尾、`}` 或下一条声明（避免截断复合值）。
 */
function isSafeDecl(line, declText, index) {
  const value = declText.slice(declText.indexOf(':') + 1, -1)
  let quote = null
  let depth = 0
  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
  }
  if (quote || depth !== 0) return false
  const rest = line.slice(index + declText.length)
  return rest.trim() === '' || /^\s*}/.test(rest) || /^\s*--/.test(rest)
}

/** 从一行里剔除指定令牌的声明，返回新行、删掉的令牌名与跳过的名称；整行清空则返回 null。
 *
 * 行尾（LF / CRLF）原样保留 —— 仓库里有历史遗留的 CRLF 混合文件，改写单行时不能顺手改行尾。 */
function stripDeadDeclsFromLine(line, names, prevContext = '') {
  const eol = /\r?\n$/.exec(line)?.[0] ?? ''
  const body = eol ? line.slice(0, -eol.length) : line
  const masked = blankComments(body) // 等长遮罩，注释里的内容是空格
  const spans = []
  const found = []
  const skips = []
  for (const m of masked.matchAll(DECL_RE)) {
    const name = m[0].match(/^--[a-zA-Z0-9-]+/)[0]
    if (!names.has(name)) continue
    // 邻近注释写了「保留/预留/无消费者」等意图时不动
    if (RETENTION_HINT.test(`${prevContext} ${body}`)) {
      skips.push({ reason: 'retention-hint', name, snippet: m[0].trim().slice(0, 80) })
      continue
    }
    if (!isSafeDecl(masked, m[0], m.index)) {
      skips.push({ reason: 'unsafe-decl', name, snippet: m[0].trim().slice(0, 80) })
      continue
    }
    spans.push([m.index, m.index + m[0].length])
    found.push(name)
  }
  if (!spans.length) return { line, removed: [], skips }
  let out = body
  for (const [s, e] of spans.reverse()) {
    // 连同声明后的空白/行尾注释一起删（blankComments 把注释抹成了空格，故按「到下一个非空白」截断）
    const tail = masked.slice(e).search(/\S/)
    const e2 = tail === -1 ? body.length : e + tail
    let start = s
    while (start > 0 && /\s/.test(out[start - 1])) start -= 1
    out = out.slice(0, start) + out.slice(Math.min(e2, out.length))
  }
  out = out.replace(/[ \t]+$/, '')
  if (out.trim() === '') return { line: null, removed: found, skips }
  return { line: out + eol, removed: found, skips }
}

const filesCleaned = []
const skipped = []
let totalRemoved = 0

for (const [fileRel, names] of deadByName) {
  if (!fileRel.endsWith('.css')) {
    skipped.push({ file: fileRel, reason: 'non-css', names: [...names] })
    continue
  }
  if (isVendored(fileRel) || isMirror(fileRel)) {
    skipped.push({ file: fileRel, reason: 'mirror-or-vendor', names: [...names] })
    continue
  }
  const abs = path.join(REPO_ROOT, fileRel)
  if (!fs.existsSync(abs)) continue
  const raw = fs.readFileSync(abs, 'utf8')
  const lines = raw.split('\n')
  const kept = []
  const removed = []
  for (let i = 0; i < lines.length; i += 1) {
    // 邻近上下文：本行 + 往前 3 行的注释块
    const prevContext = lines.slice(Math.max(0, i - 3), i).join(' ')
    const { line, removed: got, skips } = stripDeadDeclsFromLine(lines[i], names, prevContext)
    for (const s of skips) skipped.push({ file: fileRel, line: i + 1, ...s })
    if (got.length) {
      removed.push({ line: i + 1, name: got.join(','), text: lines[i].trim().slice(0, 100) })
      if (line !== null) kept.push(line)
      continue
    }
    kept.push(lines[i])
  }
  // 未被处理到的记录：区分「已不存在（孤儿报告过期）」与「跨行值 / 同行多声明」
  const handled = new Set(removed.flatMap((r) => r.name.split(',')))
  for (const s of skipped) {
    if (s.file === fileRel && s.name) handled.add(s.name)
  }
  const missed = [...names].filter((n) => !handled.has(n))
  for (const n of missed) {
    skipped.push({
      file: fileRel,
      reason: raw.includes(n) ? 'multiline-or-unmatched' : 'already-absent',
      name: n,
      line: null,
    })
  }
  if (!removed.length) continue
  const cleaned = kept.join('\n')
  if (WRITE) fs.writeFileSync(abs, cleaned)
  filesCleaned.push({
    file: fileRel,
    removed: removed.length,
    names: removed.map((r) => r.name),
    samples: removed.slice(0, 6),
  })
  totalRemoved += removed.length
}

// 逐文件删除后，若 `:root {}` 变空，留给人工确认（此处只报告）
filesCleaned.sort((a, b) => b.removed - a.removed)
const result = {
  generatedAt: new Date().toISOString(),
  mode: WRITE ? 'write' : 'dry-run',
  filesCleaned: filesCleaned.length,
  totalRemoved,
  files: filesCleaned,
  skipped,
}
writeJson(`${OUT_DIR}/token-prune.json`, result)

console.log(`令牌清理（${result.mode}）：${filesCleaned.length} 个文件，删除 ${totalRemoved} 条声明`)
for (const f of filesCleaned.slice(0, 25)) console.log(`  -${f.removed}  ${f.file}`)
if (skipped.length) console.log(`\n跳过（需人工复核）：${skipped.length} 处`)
if (!WRITE) console.log('\n（dry-run；加 --write 实际写入）')
