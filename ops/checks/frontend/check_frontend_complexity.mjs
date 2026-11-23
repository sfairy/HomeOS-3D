#!/usr/bin/env node
/**
 * 前端复杂度棘轮（函数圈复杂度 / 函数长度）。
 *
 * 为什么不是直接把 linter 的复杂度规则设为 error：studio 里已有 1,200+ 个
 * 圈复杂度 > 10 的函数（大量是 three.js 边界与历史面板装配代码），一次性清零不现实；
 * 但“不再变多”可以从今天开始守。（Biome 也没有 complexity 规则，这条只能是脚本。）
 * 做法与 check_complexity.py / check_any_baseline.mjs 一致：
 *
 * - 基线 ops/checks/baselines/frontend/frontend-complexity-baseline.json 记录**逐文件**的
 *   gt10 / gt15 / gt80 / max 计数；
 * - 任一文件比基线多，或新文件出现 gt10/gt80/max > 阈值 → 失败；
 * - 清理后跑 --update 压低基线，基线只降不升。
 *
 * 口径：TypeScript AST。函数节点 = 函数声明 / 方法 / 函数表达式 / 箭头函数 /
 * get/set / constructor；复杂度基数 1，每个 if/for/for-in/for-of/while/do/case/catch/
 * 三元 +1，每个 && / || / ?? +1。Vue SFC 只分析 script 块，行号按块偏移。
 *
 * 用法（单跑；批量入口 `bun run check:frontend` 也会带上它）：
 *   node ops/checks/check_frontend_complexity.mjs            # 校验
 *   node ops/checks/check_frontend_complexity.mjs --update   # 重写基线（只能变小才该跑）
 *   node ops/checks/check_frontend_complexity.mjs --json     # 机器可读输出
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { isMain } from '../../lib/cli.mjs'
import { createCli, defineRatchet } from '../../lib/ratchet.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const BASELINE_REL = 'ops/checks/baselines/frontend/frontend-complexity-baseline.json'
const ROOTS = ['homeos/frontend/src', 'homeos-store/frontend/src']
const EXTENSIONS = new Set(['.ts', '.vue'])
const METRICS = ['gt10', 'gt15', 'gt80', 'max']

const DEC = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
])
const LOG = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
])

/** 是否函数节点（复杂度只算最内层，不把内层函数的负担记到外层）。 */
function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  )
}

/**
 * 从一个已解析的 SourceFile 里抽取函数度量。
 *
 * @param {import('typescript').SourceFile} source
 */
function measureSource(source) {
  const functions = []
  const visit = (node) => {
    if (isFunctionLike(node)) {
      let complexity = 1
      const walkIn = (inner) => {
        if (inner !== node && isFunctionLike(inner)) return
        if (DEC.has(inner.kind)) complexity += 1
        if (inner.kind === ts.SyntaxKind.BinaryExpression && LOG.has(inner.operatorToken.kind)) {
          complexity += 1
        }
        ts.forEachChild(inner, walkIn)
      }
      walkIn(node)
      const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1
      functions.push({ line: start, length: end - start + 1, complexity })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return functions
}

/** 解析任意片段（Vue `<script>` 块走这条：每块的文本不同，不能按文件缓存）。 */
export function measureText(text, file, scriptKind = ts.ScriptKind.TS) {
  return measureSource(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind))
}

/**
 * 一个文件的函数度量（.vue 逐 `<script>` 块拼接）。
 *
 * @param {ReturnType<typeof createContext>} ctx
 * @param {string} file
 */
export function measureFile(ctx, file) {
  if (file.endsWith('.vue')) {
    const functions = []
    const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g
    let match
    while ((match = re.exec(ctx.text(file)))) {
      functions.push(...measureText(match[1], file, ts.ScriptKind.TS))
    }
    return functions
  }
  return measureSource(ctx.sourceFile(file, file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS))
}

/**
 * @param {ReturnType<typeof createContext>} ctx
 */
export function scan(ctx) {
  const counts = {}
  const totals = { functions: 0, gt10: 0, gt15: 0, gt80: 0 }
  for (const file of ctx.walkMany(ROOTS, EXTENSIONS)) {
    const functions = measureFile(ctx, file)
    if (functions.length === 0) continue
    const gt10 = functions.filter((fn) => fn.complexity > 10).length
    const gt15 = functions.filter((fn) => fn.complexity > 15).length
    const gt80 = functions.filter((fn) => fn.length > 80).length
    const max = functions.reduce((value, fn) => Math.max(value, fn.complexity), 0)
    totals.functions += functions.length
    totals.gt10 += gt10
    totals.gt15 += gt15
    totals.gt80 += gt80
    if (gt10 > 0 || gt80 > 0) {
      counts[ctx.rel(file)] = { functions: functions.length, gt10, gt15, gt80, max }
    }
  }
  return { counts, totals }
}

export const { audit } = defineRatchet({
  name: '前端复杂度棘轮',
  baselineRel: BASELINE_REL,
  scan,
  metrics: METRICS,
  summary: (counts, totals) =>
    `${Object.keys(counts).length} 个文件 / gt10=${totals.gt10} gt15=${totals.gt15} gt80=${totals.gt80}`,
  formatProblem: (file, metric, before, after) => `${file}: ${metric} ${before} -> ${after}`,
  hints: ({ baselineRel }) => [
    '说明：这是“不许变多”的门禁。确实需要更复杂的函数时，先在评审里说明理由，',
    `再改 ${baselineRel}（基线只该被 --update 压低）。`,
  ],
})

/** 单跑入口（`--root` 支持夹具目录）。 */
export const cli = createCli(audit, { repoRoot: join(import.meta.dirname, '../../..') })

if (isMain(import.meta.url)) process.exit(cli())
