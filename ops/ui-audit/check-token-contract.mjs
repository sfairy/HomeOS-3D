#!/usr/bin/env node
/**
 * 令牌契约门禁：校验每个 `var(--x)` 都能解析到定义。
 *
 * 未解析且无回退值的 `var(--x)` 会让整条声明变成 invalid at computed-value time ——
 * 属性静默失效（常见症状：背景透明、间距塌成 0）。这类问题构建期不报错、类型检查也查不到，
 * 只能靠静态解析发现。
 *
 * 判定复用 token-orphans 的口径：`--x` 只要在样式里作为声明出现、或在任一脚本/模板/后端
 * 文件里以字面量出现（`setProperty('--x')`、`:style`、对象键），就视为「有定义」。
 *
 * 用法：`node ops/ui-audit/check-token-contract.mjs [--json]`
 * 产出：reports/token-contract.json；存在未解析且无回退的引用时退出码 1。
 */
import fs from 'node:fs'
import path from 'node:path'
import { walk, rel, writeJson, isVendored, blankComments, extractStyleText } from './lib/scan.mjs'
import { REPO_ROOT, OUT_DIR, scanDirs, TARGETS } from './targets.mjs'

const asJson = process.argv.includes('--json')
const NAME_RE = /--[a-zA-Z0-9-]+(?![a-zA-Z0-9-])/g

/** 声明起始处：上一个非空白字符须为 `{` / `;` / 文件开头。 */
function startsDecl(text, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (/\s/.test(text[i])) continue
    return text[i] === '{' || text[i] === ';'
  }
  return true
}

const defNames = new Set()
const knownNames = new Set()
const refs = []
let styleFiles = 0

const isCss = (ext) => ext === '.css'
const hasStyle = (ext) => ext === '.css' || ext === '.vue' || ext === '.html'

for (const target of TARGETS) {
  for (const dir of scanDirs(target)) {
    for (const file of walk(dir, new Set(['.css', '.vue', '.html', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py']))) {
      const r = `${target.project}:${rel(target.root, file)}`
      const repoRel = rel(REPO_ROOT, file)
      if (isVendored(repoRel) || !fs.existsSync(file)) continue
      if (fs.statSync(file).size > 4_000_000) continue
      const ext = path.extname(file)
      const raw = fs.readFileSync(file, 'utf8')

      if (hasStyle(ext)) {
        styleFiles += 1
        const style = blankComments(extractStyleText(file, raw))
        for (const m of style.matchAll(NAME_RE)) {
          if (/^\s*:/.test(style.slice(m.index + m[0].length)) && startsDecl(style, m.index)) defNames.add(m[0])
        }
        // 引用：`var(--x)` / `var(--x, fallback)`（fallback 可为空 → 仍算无回退）
        for (const m of style.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*(,?)/g)) {
          const line = style.slice(0, m.index).split('\n').length
          refs.push({ name: m[1], file: r, line, hasFallback: m[2] === ',' })
        }
      }

      // .vue/.html 既有样式区也有脚本区：脚本里的字面量视为「已知名字」，
      // 覆盖 setProperty('--x')、:style 对象键、模板里的内联样式，避免误报为未解析。
      if (!isCss(ext)) {
        const script = raw.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        for (const m of script.matchAll(NAME_RE)) knownNames.add(m[0])
      }
    }
  }
}

const defined = (name) => defNames.has(name) || knownNames.has(name)

const unresolved = []
const unresolvedWithFallback = []
const seen = new Set()
for (const ref of refs) {
  if (defined(ref.name)) continue
  const key = `${ref.file}|${ref.name}`
  if (seen.has(key)) continue
  seen.add(key)
  ;(ref.hasFallback ? unresolvedWithFallback : unresolved).push(ref)
}

unresolved.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file))
unresolvedWithFallback.sort((a, b) => a.name.localeCompare(b.name))

const result = {
  generatedAt: new Date().toISOString(),
  styleFilesScanned: styleFiles,
  definedNames: defNames.size,
  knownNamesViaScripts: knownNames.size,
  totalRefs: refs.length,
  unresolvedCount: unresolved.length,
  unresolvedWithFallbackCount: unresolvedWithFallback.length,
  unresolved,
  unresolvedWithFallback,
}
writeJson(`${OUT_DIR}/token-contract.json`, result)

if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  console.log(`令牌契约：扫描 ${styleFiles} 个样式文件，引用 ${refs.length} 次`)
  console.log(`  有定义的名字：${defNames.size}（另有 ${knownNames.size} 个仅脚本/模板出现）`)
  console.log(`  未解析且**无回退**（真风险）：${unresolved.length}`)
  for (const u of unresolved.slice(0, 40)) console.log(`      ${u.name}  ${u.file}:${u.line}`)
  console.log(`  未解析但有回退（可接受）：${unresolvedWithFallback.length}`)
  for (const u of unresolvedWithFallback.slice(0, 20)) console.log(`      ${u.name}  ${u.file}:${u.line}`)
  if (!unresolved.length) console.log('\n✓ 所有 var() 引用均可解析。')
}

process.exit(unresolved.length ? 1 : 0)
