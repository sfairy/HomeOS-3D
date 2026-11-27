#!/usr/bin/env node
/**
 * 生成「目录级合并」计划：把满足条件的目录并成一个同名单文件。
 *
 * 为什么需要这一层
 * ----------------
 * 本仓库有大量「同一模块被拆成 3-15 个几十行的文件」的目录（`kernel/types`、`kernel/utils/core`
 * 等）。它们的碎片度不是功能族的产物，而是历史上「一个类型/一个 hook 一个文件」的习惯。
 * 这些目录整体不大（多数 <2000 行），合成一个文件反而更易读。
 *
 * 三条硬性预检（不满足就跳过，交由人工）：
 * 1. **同名顶层声明内容不同** → 合并后 TS 报重复声明，语义是否等价需人判断；
 * 2. **目录内 re-export 环**（`export ... from './sibling'`）→ 合并后导出语义会丢；
 * 3. **含 `.vue`** → 组件目录保留「一组件一文件」，不参与合并。
 *
 * 另外排除 `studio/runtime/**`：那里每个 `.ts` 都是公网 URL 入口。
 *
 * 行数不作判据：合并后多少行都照合；行数只在计划里打印，供合并后判断是否需要分区。
 *
 * 用法：
 *   node ops/scripts/codemod/plan-collapse.mjs [--write <plan.mjs>] <dir>...
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const SRC = 'homeos/frontend/src'

/**
 * 持久黑名单：实测会导致编译错误 / 环 / 初始化顺序问题的目录。
 * 每行 `<相对路径>  # 原因`，`#` 后为注释。
 */
function loadDenyList() {
  const path = resolve(REPO_ROOT, 'ops/scripts/codemod/collapse-deny.txt')
  const deny = new Map()
  if (!existsSync(path)) return deny
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.split('#')[0].trim()
    if (!line) continue
    deny.set(line, raw.includes('#') ? raw.split('#').slice(1).join('#').trim() : '黑名单')
  }
  return deny
}

const DENY = loadDenyList()

const args = process.argv.slice(2)
const writeIndex = args.indexOf('--write')
const outFile = writeIndex > -1 ? args[writeIndex + 1] : null
const valueArgs = new Set([outFile].filter(Boolean))
const targets = args.filter((a) => !a.startsWith('--') && !valueArgs.has(a))

/** 抽取顶层声明的完整文本（用于判断同名是否等价）。 */
function declarationText(text, startIndex) {
  const rest = text.slice(startIndex)
  const firstLine = rest.split('\n')[0]
  if (firstLine.trim().endsWith(';') || firstLine.trim().endsWith('}')) return firstLine
  const openIndex = firstLine.indexOf('{')
  if (openIndex !== -1 && !firstLine.includes('}', openIndex)) {
    let depth = 0
    for (let i = openIndex; i < rest.length; i += 1) {
      if (rest[i] === '{') depth += 1
      else if (rest[i] === '}') {
        depth -= 1
        if (depth === 0) return rest.slice(0, i + 1)
      }
    }
  }
  const blank = rest.search(/\n\s*\n/)
  return blank === -1 ? rest : rest.slice(0, blank)
}

/** 目录风险预检。返回说明字符串表示应跳过，null 表示安全。 */
function hazard(dirAbs, files) {
  /** @type {Map<string, Set<string>>} 名字 → 不同内容集合 */
  const decls = new Map()
  for (const file of files) {
    const path = join(dirAbs, file)
    const text = readFileSync(path, 'utf8')
    // 目录内 re-export（`export ... from './sibling'`）：合并后 sibling 的内容也在本文件，
    // `cleanupMergedReExports` 会删掉重复项、保留重命名导出，属于安全情形。
    // 但**指向外部模块**的 re-export 语义会变模糊（谁提供这个符号），仍然跳过。
    for (const match of text.matchAll(/^[ \t]*export\s+(?:type\s+)?(?:\{[^{}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/gm)) {
      const spec = match[1]
      if (!spec.startsWith('.')) return '目录内含指向外部模块的 re-export，合并需人工确认'
      const target = resolve(dirname(path), spec).replace(/\.ts$/, '')
      const inside = files.some((other) => resolve(dirAbs, other).replace(/\.ts$/, '') === target)
      if (!inside) return '目录内含指向目录外的相对 re-export，合并需人工确认'
    }
    for (const match of text.matchAll(
      /^(?:export\s+)?(?:type|interface|const|function|class)\s+([A-Za-z_$][\w$]*)/gm,
    )) {
      const body = declarationText(text, match.index).replace(/\s+/g, ' ').trim()
      if (!decls.has(match[1])) decls.set(match[1], new Set())
      decls.get(match[1]).add(body)
    }
    // 多声明符：`export const A = …, B = …, C = …` 的第二个及之后的名字也要登记，
    // 否则合并后 TS2451「Cannot redeclare block-scoped variable」会漏网。
    for (const match of text.matchAll(
      /^(?:export\s+)?(?:const|let|var)\s+[\s\S]*?(?=\n(?:export|const|let|var|function|class|type|interface|\/\*|\/\/|$))/gm,
    )) {
      for (const declarator of match[0].matchAll(/[,]\s*([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=/g)) {
        if (!decls.has(declarator[1])) decls.set(declarator[1], new Set())
        decls.get(declarator[1]).add(`multidecl:${declarator[1]}`)
      }
    }
  }
  for (const [name, bodies] of decls) {
    if (bodies.size > 1) return `同名声明 "${name}" 内容不同（${bodies.size} 种）`
  }
  return null
}

const picked = []
const skipped = []

for (const dir of targets) {
  const rel = dir.replace(/^\.\//, '')
  if (DENY.has(rel)) {
    skipped.push(`${rel}: 黑名单（${DENY.get(rel)}）`)
    continue
  }
  if (rel.startsWith('studio/runtime')) {
    skipped.push(`${rel}: runtime 每个 .ts 都是公网 URL 入口`)
    continue
  }
  const abs = resolve(REPO_ROOT, SRC, rel)
  let entries
  try {
    entries = readdirSync(abs, { withFileTypes: true })
  } catch {
    skipped.push(`${rel}: 目录不存在`)
    continue
  }
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts'))
    .map((e) => e.name)
  const hasSubdir = entries.some((e) => e.isDirectory())
  const hasVue = entries.some((e) => e.isFile() && e.name.endsWith('.vue'))
  if (files.length < 2) continue
  if (hasSubdir) {
    skipped.push(`${rel}: 含子目录（只压平叶目录）`)
    continue
  }
  if (hasVue) {
    skipped.push(`${rel}: 含 .vue（组件目录保持一组件一文件）`)
    continue
  }
  const total = files.reduce((sum, f) => sum + readFileSync(join(abs, f), 'utf8').split('\n').length, 0)
  // 目标文件已存在 = 目录与同名 .ts 并存（如 `component-templates.ts` + `component-templates/`）。
  // 合并会覆盖那个文件，必须跳过。
  const parent = dirname(rel) === '.' ? '' : `${dirname(rel)}/`
  const targetAbs = resolve(REPO_ROOT, SRC, `${parent}${basename(rel)}.ts`)
  if (existsSync(targetAbs)) {
    skipped.push(`${rel}: 同名 .ts 已存在（${parent}${basename(rel)}.ts），合并会覆盖`)
    continue
  }
  const risk = hazard(abs, files)
  if (risk) {
    skipped.push(`${rel}: ${risk}`)
    continue
  }
  picked.push({ rel, files, total })
}

picked.sort((a, b) => a.total - b.total)
const removed = picked.reduce((sum, p) => sum + p.files.length - 1, 0)
console.log(`目录级合并：${picked.length} 个目录，预计减少 ${removed} 个文件`)
for (const p of picked)
  console.log(`  ${String(p.files.length).padStart(2)} → 1  ${String(p.total).padStart(5)} 行  ${p.rel}`)
if (skipped.length) {
  console.log(`\n跳过 ${skipped.length} 个：`)
  for (const note of skipped) console.log(`  ! ${note}`)
}

if (outFile) {
  const body = picked
    .map((p) => {
      const parent = dirname(p.rel) === '.' ? '' : `${dirname(p.rel)}/`
      const name = basename(p.rel)
      return `    { from: '${SRC}/${p.rel}', to: '${SRC}/${parent}${name}.ts' },`
    })
    .join('\n')
  writeFileSync(
    resolve(REPO_ROOT, outFile),
    `/** 目录级合并（由 plan-collapse.mjs 生成）。 */\nexport default {\n  dirCollapse: [\n${body}\n  ],\n}\n`,
    'utf8',
  )
  console.log(`\n已写入 ${outFile}`)
}
