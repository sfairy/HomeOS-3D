#!/usr/bin/env node
/**
 * 合并正确性审计：核对「合并前后导出的符号集合」是否守恒。
 *
 * 为什么需要它
 * ------------
 * 机械合并最危险的失败模式不是编译错误，而是**静默丢代码**：正则跨语句匹配、
 * 自引用 import 被整条删除、转手导出的符号无人提供 —— 这些都可能让某个导出函数
 * 凭空消失，而 typecheck 只会在真正用到它的地方报错（可能根本没被引用）。
 *
 * 判据：对每个 merge，`源文件导出符号的并集` 必须 ⊆ `目标文件的导出符号集`。
 * 允许目标多出符号（合并过程中产生的辅助函数），不允许少。
 *
 * 用法：
 *   node ops/scripts/codemod/audit-merges.mjs <commit>...     # 审计指定提交
 *   node ops/scripts/codemod/audit-merges.mjs HEAD~3..HEAD   # 审计区间
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')

/** `export function/const/... Name` 与 `export { a, b as c } from '...'` 两种形态。 */
const DECL_RE = /^export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm
const LIST_RE = /^[ \t]*export\s+(?:type\s+)?\{([^{}]*)\}/gm

function exportedNames(text) {
  const out = new Set()
  for (const match of text.matchAll(DECL_RE)) out.add(match[1])
  for (const match of text.matchAll(LIST_RE)) {
    for (const part of match[1].split(',')) {
      const piece = part.trim().replace(/^type\s+/, '')
      if (!piece) continue
      out.add(piece.split(/\s+as\s+/).pop().trim())
    }
  }
  return out
}

const git = (args) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

/** 展开 `A..B` 形式为提交列表。 */
function expandSpecs(specs) {
  const commits = []
  for (const spec of specs) {
    if (!spec.includes('..')) {
      commits.push(spec)
      continue
    }
    const [from, to] = spec.split('..')
    const list = git(['rev-list', `${from}..${to || 'HEAD'}`]).trim().split('\n').filter(Boolean)
    commits.push(...list)
  }
  return commits
}

const targets = expandSpecs(process.argv.slice(2))
if (!targets.length) {
  console.error('用法: node ops/scripts/codemod/audit-merges.mjs <commit>... | <from>..<to>')
  process.exit(2)
}

let failures = 0
let checked = 0

for (const commit of targets) {
  let plan
  try {
    plan = git(['show', `${commit}:ops/scripts/codemod/plans/families.mjs`])
  } catch {
    continue // 该提交没有族合并计划
  }
  const merges = [...plan.matchAll(/into:\s*'([^']+)',\s*from:\s*\[([\s\S]*?)\]/g)]
  for (const [, into, fromRaw] of merges) {
    const from = [...fromRaw.matchAll(/'([^']+)'/g)].map((m) => m[1])
    const before = new Set()
    for (const file of from) {
      try {
        for (const name of exportedNames(git(['show', `${commit}~1:${file}`]))) before.add(name)
      } catch {
        /* 源文件在该提交前不存在：跳过 */
      }
    }
    let afterText
    try {
      afterText = git(['show', `${commit}:${into}`])
    } catch {
      continue
    }
    const after = exportedNames(afterText)
    const lost = [...before].filter((name) => !after.has(name))
    checked += 1
    if (lost.length) {
      failures += 1
      console.error(`✗ ${commit.slice(0, 9)} ${into}: 丢失 ${lost.length} 个导出 → ${lost.slice(0, 8).join(', ')}`)
    }
  }
}

if (!checked) {
  console.log('没有可审计的合并计划。')
  process.exit(0)
}

if (failures) {
  console.error(`\n合并审计：${failures}/${checked} 个目标丢失导出符号`)
  process.exit(1)
}
console.log(`合并审计：${checked} 个目标全部守恒 ✓`)
