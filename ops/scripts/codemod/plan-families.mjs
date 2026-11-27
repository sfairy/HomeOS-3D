#!/usr/bin/env node
/**
 * 按「前缀功能族」生成合并计划。
 *
 * 判据：同一目录下，文件名共享同一个前缀（第一个 `-` 之前、或第一个 `.` 之前的片段）
 * 且成员 ≥2 的，都属于一个功能族 —— 它们通常是被「一函数一文件」拆出来的同族实现。
 *
 * 例：`alert-rules-context.internals.ts` / `alert-rules-dnd.internals.ts` /
 *     `alert-rules-editor.internals.ts` / `alert-rules.internals.ts`
 *     → 全部并入 `alert-rules.ts`（该族唯一实现）。
 *
 * 用法：
 *   node ops/scripts/codemod/plan-families.mjs <dir> [<dir>...]           # 打印计划
 *   node ops/scripts/codemod/plan-families.mjs --write <dir>...           # 写计划文件
 *   node ops/scripts/codemod/plan-families.mjs --apply <dir>...           # 生成并立即执行
 *
 * 保护：
 * - `index.ts` 永不参与（它是公开面）。
 * - `.d.ts` 永不参与。
 * - 合并后单文件超过 `--max-lines`（默认 900）的族会被跳过并报告，避免造出新巨型文件。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')

/** 清理文件名：去掉扩展名与「非族名」后缀。 */
function cleanStem(name) {
  const stem = name.replace(/\.(ts|tsx|vue|css)$/, '')
  return stem.replace(/\.(internals|util|composable|constants|types|state|store|context)$/, '')
}

/** 按 `-` 切段（`use-` 前缀不算族名的一部分）。 */
function segmentsOf(name) {
  const cleaned = cleanStem(name)
  const body = cleaned.startsWith('use-') ? cleaned.slice(4) : cleaned
  return body.split('-').filter(Boolean)
}

/**
 * 一组文件的族名 = 「作为 ≥2 个成员前缀的最长 `-` 段前缀」。
 *
 * 取「第一段」会把 `alert-rules-*` 并成 `alert`；取「固定两段」又会把
 * `voice-alerts` 与 `voice` 拆成两族。正确做法是对每个成员找它与同组其它成员
 * 共享的最长前缀，这样 `voice` / `voice-alerts` / `voice-config` 都归到 `voice`。
 * @param {string[]} names
 * @returns {Map<string, string[]>} 族名 → 成员
 */
function clusterByFamily(names) {
  const segs = new Map(names.map((name) => [name, segmentsOf(name)]))
  /** 该前缀被多少个成员共享 */
  const share = new Map()
  for (const parts of segs.values()) {
    for (let i = 1; i <= parts.length; i += 1) {
      const prefix = parts.slice(0, i).join('-')
      share.set(prefix, (share.get(prefix) ?? 0) + 1)
    }
  }

  const clusters = new Map()
  for (const [name, parts] of segs) {
    let family = parts[0]
    for (let i = 1; i <= parts.length; i += 1) {
      const prefix = parts.slice(0, i).join('-')
      if ((share.get(prefix) ?? 0) >= 2) family = prefix
      else break
    }
    if (!clusters.has(family)) clusters.set(family, [])
    clusters.get(family).push(name)
  }
  return clusters
}

/**
 * 抽取一个顶层声明的完整文本（用于比较两个同名声明是否逐字等价）。
 * @param {string} text
 * @param {number} startIndex 声明起始字符偏移
 * @returns {string}
 */
function declarationText(text, startIndex) {
  const rest = text.slice(startIndex)
  const firstLineEnd = rest.indexOf('\n')
  const firstLine = firstLineEnd === -1 ? rest : rest.slice(0, firstLineEnd)

  // 单行声明：以 `;` 结尾或整行即结束。
  if (firstLine.trim().endsWith(';') || firstLine.trim().endsWith('}')) return firstLine

  // 花括号块：数大括号直到归零。
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

  // 其余（type X = ... 多行）：取到第一个空行为止。
  const blank = rest.search(/\n\s*\n/)
  return blank === -1 ? rest : rest.slice(0, blank)
}

/**
 * 族级风险检测：出现下列情况的族**不合并**。
 *
 * 1. 成员之间存在 `export ... from '<同族成员>'`（re-export 链）——
 *    合并后这些导出要么指向自身、要么丢失，无法机械判定「符号是否真的定义在本族内」。
 * 2. 两个以上成员各自声明了**内容不同**的同名顶层符号——
 *    合并后 TS 报重复声明；内容是否等价需要人工判断。
 *    内容逐字相同的同名声明不阻止合并（合并器的去重步骤会处理）。
 *
 * @param {string[]} paths 成员绝对路径
 * @returns {string | null} 风险说明；无风险返回 null
 */
function familyHazard(paths, allowReexport = false) {
  const stems = new Set(paths.map((p) => p.replace(/\.(ts|tsx|css)$/, '')))
  /** @type {Map<string, Array<{path: string, body: string}>>} */
  const declarations = new Map()

  for (const path of paths) {
    let text
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    for (const match of text.matchAll(/^\s*export\s+(?:type\s+)?(?:\{[\s\S]*?\}|\*)\s+from\s+['"]([^'"]+)['"]/gm)) {
      const spec = match[1]
      if (!spec.startsWith('.')) continue
      const target = resolve(dirname(path), spec).replace(/\.(ts|tsx|css)$/, '')
      if (stems.has(target) && !allowReexport) return `族内 re-export（${spec}），合并后导出语义会丢`
    }
    for (const match of text.matchAll(/^(?:export\s+)?(?:type|interface|const|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      const name = match[1]
      const body = declarationText(text, match.index).replace(/\s+/g, ' ').trim()
      if (!declarations.has(name)) declarations.set(name, [])
      declarations.get(name).push({ path, body })
    }
  }

  for (const [name, owners] of declarations) {
    if (owners.length < 2) continue
    const bodies = new Set(owners.map((owner) => owner.body))
    if (bodies.size > 1) return `同名顶层声明 "${name}" 内容不同（${owners.length} 处）`
  }
  return null
}

function lineCount(path) {
  try {
    return readFileSync(path, 'utf8').split('\n').length
  } catch {
    return 0
  }
}

function buildPlan(dirs, maxLines) {
  const merges = []
  const skipped = []
  for (const dir of dirs) {
    const abs = resolve(REPO_ROOT, dir)
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      skipped.push(`${dir}: 目录不存在`)
      continue
    }
    // 先按「第一段」粗分组，再在组内用最长公共前缀细化族名。
    const coarse = new Map()
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!/\.(ts|tsx|css)$/.test(entry.name)) continue
      if (entry.name.endsWith('.d.ts') || entry.name === 'index.ts') continue
      const segs = segmentsOf(entry.name)
      if (!segs.length) continue
      if (!coarse.has(segs[0])) coarse.set(segs[0], [])
      coarse.get(segs[0]).push(entry.name)
    }

    /** @type {Map<string, string[]>} 族名 → 成员 */
    const groups = new Map()
    for (const members of coarse.values()) {
      if (members.length < 2) continue
      for (const [family, group] of clusterByFamily(members)) {
        if (group.length < 2) continue
        if (!groups.has(family)) groups.set(family, [])
        groups.get(family).push(...group)
      }
    }
    for (const [family, members] of groups) {
      if (members.length < 2) continue
      // 目标名：优先沿用已存在的同族文件；否则新建 `<family>.ts`。
      const ext = members.every((name) => name.endsWith('.css')) ? '.css' : '.ts'
      const existing = members.find((name) => name.replace(/\.(ts|tsx|css)$/, '') === family)
      const into = existing ?? `${family}${ext}`
      if (skipFamilies.has(family)) {
        skipped.push(`${dir} · ${family}: --skip 排除（跨族 re-export 链，需人工合并）`)
        continue
      }
      const paths = members.map((name) => join(abs, name))
      const hazard = family.endsWith('.css') ? null : familyHazard(paths, allowReexport)
      if (hazard) {
        skipped.push(`${dir} · ${family}: ${hazard}`)
        continue
      }
      const total = paths.reduce((sum, path) => sum + lineCount(path), 0)
      if (total > maxLines) {
        skipped.push(`${dir} · ${family}: 合并后 ${total} 行 > ${maxLines}，跳过（需按职责拆，不按前缀合）`)
        continue
      }
      merges.push({
        into: `${dir}/${into}`,
        from: members.map((name) => `${dir}/${name}`),
        family,
        lines: total,
      })
    }
  }
  return { merges, skipped }
}

const args = process.argv.slice(2)
const maxIndex = args.indexOf('--max-lines')
const maxLines = maxIndex > -1 ? Number(args[maxIndex + 1]) : 900
/** `--skip a,b` 或重复 `--skip a --skip b`：排除指定功能族（它们有跨族 re-export 链）。 */
const skipFamilies = new Set()
for (let i = 0; i < args.length; i += 1) {
  if (args[i] !== '--skip') continue
  for (const name of (args[i + 1] ?? '').split(',')) if (name.trim()) skipFamilies.add(name.trim())
}
/**
 * `--allow-reexport`：允许合并含族内 re-export 的族。
 * 只对**叶子资源层**（domain/api、kernel/types 这类只被上层单向引用的目录）安全：
 * 合并器的 `dropRedundantExportLists` 会清掉与本地声明重复的导出清单。
 */
const allowReexport = args.includes('--allow-reexport')
const valueArgs = new Set([String(maxLines), ...[...skipFamilies].join(',')])
const dirs = args.filter((arg) => !arg.startsWith('--') && !valueArgs.has(arg) && arg !== String(maxLines))

if (!dirs.length) {
  console.error('用法: node ops/scripts/codemod/plan-families.mjs [--write|--apply] [--max-lines N] <dir>...')
  process.exit(2)
}

const { merges, skipped } = buildPlan(dirs, maxLines)
const removed = merges.reduce((sum, m) => sum + m.from.length - 1, 0)

console.log(`合并计划：${merges.length} 个功能族，预计减少 ${removed} 个文件\n`)
for (const merge of merges) {
  console.log(`  ${merge.family}  (${merge.from.length} → 1, ${merge.lines} 行)`)
  console.log(`    → ${merge.into.replace('homeos/frontend/src/', '')}`)
  for (const from of merge.from) {
    if (from !== merge.into) console.log(`      - ${from.replace('homeos/frontend/src/', '')}`)
  }
}
if (skipped.length) {
  console.log('\n跳过：')
  for (const note of skipped) console.log(`  ! ${note}`)
}

if (args.includes('--write') || args.includes('--apply')) {
  const planPath = 'ops/scripts/codemod/plans/families.mjs'
  const body = merges
    .map(
      (m) =>
        `    {\n      into: '${m.into}',\n      from: [\n${m.from.map((f) => `        '${f}',`).join('\n')}\n      ],\n    },`,
    )
    .join('\n')
  writeFileSync(
    resolve(REPO_ROOT, planPath),
    `/** 按前缀功能族合并（由 plan-families.mjs 生成）。 */\nexport default {\n  merges: [\n${body}\n  ],\n}\n`,
    'utf8',
  )
  console.log(`\n已写入 ${planPath}`)
  if (args.includes('--apply')) {
    execFileSync('node', ['ops/scripts/codemod/restructure.mjs', planPath, '--write'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    })
  }
}
