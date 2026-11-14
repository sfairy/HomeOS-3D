#!/usr/bin/env node
/**
 * 压缩成果与等价性证据总表（一条命令重跑全部断言）。
 *
 * 为什么需要它
 * ------------
 * 压缩类改动最容易出的问题是「当时量过、后来没人能复现」。分散在四个脚本里的断言
 * （代码量棘轮、几何参数黄金、domElement 等价、CSS 可合并项）单独跑都要记得参数，
 * 于是很容易退化成一次性证据。本脚本把它们串起来，输出一张「改前 → 改后 → 证据」的表，
 * 任何一次提交后都能重跑复核。
 *
 * 它只做两件事：调用既有脚本（不复制口径）、把结果汇总成表。任何一项失败即以非零退出，
 * 因此也能当门禁用。
 *
 * 用法
 * ----
 *     node ops/checks/compression-report.mjs            # 汇总表 + 判定
 *     node ops/checks/compression-report.mjs --json     # 机器可读
 *
 * 口径补充：`ops/` 是**工具链**，其增长不计入产品压缩收益。表里分开列，
 * 避免把「新增度量脚本」当成「代码变多」。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const CODE_SIZE_BASELINE = path.join(REPO_ROOT, 'ops/checks/code-size-baseline.json')

/** 首次压缩前的快照（由 docs/analysis 保留；不存在时只报当前值）。 */
const BEFORE_BASELINE = path.join(REPO_ROOT, 'docs/analysis/code-size/baseline.json')

const args = process.argv.slice(2)
const AS_JSON = args.includes('--json')

/** 一条断言：名字、命令、以及「通过」的判据说明。 */
const CHECKS = [
  {
    name: 'code-size 棘轮',
    command: ['node', 'ops/checks/code-size.mjs', '--check', 'ops/checks/code-size-baseline.json'],
    proves: '有效代码行 / 有效字符数只降不升',
  },
  {
    name: '几何参数黄金',
    command: ['node', 'ops/checks/geometry-call-golden.mjs', '--check'],
    proves: 'box/cyl 改写后每个调用点的参数表达式逐字段一致',
  },
  {
    name: 'domElement 等价',
    command: ['node', 'ops/checks/dom-factory-equivalence.mjs'],
    proves: 'domElement 与「建元素 + 设类名 + 设文本」三行写法输出一致',
  },
  {
    name: 'CSS 可合并项',
    command: ['node', 'ops/scripts/merge-css-duplicates.mjs', '--check'],
    proves: '同容器同声明体的规则已全部合并',
  },
]

function run(command) {
  const [bin, ...rest] = command
  const result = spawnSync(bin, rest, { cwd: REPO_ROOT, encoding: 'utf8' })
  return {
    ok: result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  }
}

/** 读一份快照；缺失时返回 null（首次压缩前的那份在 docs/，可能已被清理）。 */
function readSnapshot(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

const results = CHECKS.map((check) => ({ ...check, ...run(check.command) }))

const before = readSnapshot(BEFORE_BASELINE)
const after = readSnapshot(CODE_SIZE_BASELINE)
const rows = []
if (before && after) {
  for (const root of Object.keys(after.byRoot)) {
    const from = before.byRoot[root]
    const to = after.byRoot[root]
    if (!from) continue
    rows.push({
      root,
      codeBefore: from.code,
      codeAfter: to.code,
      codeDelta: to.code - from.code,
      charsBefore: from.chars,
      charsAfter: to.chars,
      charsDelta: to.chars - from.chars,
    })
  }
}

/** 产品代码 = 两个产品项目的源码树；工具链单列。 */
const PRODUCT_ROOTS = [
  'homeos/frontend/src',
  'homeos/backend/src',
  'homeos-store/frontend/src',
  'homeos-store/backend/src',
]
const sum = (list, field) => list.reduce((total, row) => total + row[field], 0)
const productRows = rows.filter((row) => PRODUCT_ROOTS.includes(row.root))
const toolRows = rows.filter((row) => row.root === 'ops')
const sharedRows = rows.filter((row) => !PRODUCT_ROOTS.includes(row.root) && row.root !== 'ops')

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        checks: results.map(({ name, ok, proves }) => ({ name, ok, proves })),
        rows,
        product: productRows.length
          ? { codeDelta: sum(productRows, 'codeDelta'), charsDelta: sum(productRows, 'charsDelta') }
          : null,
        tooling: toolRows.length
          ? { codeDelta: sum(toolRows, 'codeDelta'), charsDelta: sum(toolRows, 'charsDelta') }
          : null,
      },
      null,
      2,
    ),
  )
} else {
  console.log('== 等价性证据 ==')
  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name.padEnd(14)} ${result.proves}`)
    if (!result.ok) {
      const detail = result.stderr || result.stdout
      for (const line of detail.split('\n').slice(0, 6)) console.log(`      ${line}`)
    }
  }

  if (rows.length > 0) {
    console.log('\n== 代码量（有效行 / 有效字符）==')
    console.log('根目录'.padEnd(30) + '行'.padStart(10) + '变化'.padStart(9) + '字符变化'.padStart(12))
    for (const row of [...rows].sort((left, right) => left.codeDelta - right.codeDelta)) {
      const label = row.root.length > 28 ? `${row.root.slice(0, 27)}…` : row.root
      console.log(
        label.padEnd(30) +
          String(row.codeAfter).padStart(10) +
          `${row.codeDelta >= 0 ? '+' : ''}${row.codeDelta}`.padStart(9) +
          `${row.charsDelta >= 0 ? '+' : ''}${row.charsDelta}`.padStart(12),
      )
    }
    const product = { code: sum(productRows, 'codeDelta'), chars: sum(productRows, 'charsDelta') }
    const tooling = { code: sum(toolRows, 'codeDelta'), chars: sum(toolRows, 'charsDelta') }
    const shared = { code: sum(sharedRows, 'codeDelta'), chars: sum(sharedRows, 'charsDelta') }
    console.log(`\n产品代码净减：${-product.code} 行 / ${-product.chars} 字符`)
    console.log(`工具链新增：  ${tooling.code} 行 / ${tooling.chars} 字符（度量与 codemod，不计入产品收益）`)
    if (shared.code !== 0 || shared.chars !== 0) console.log(`共享包：      ${shared.code} 行 / ${shared.chars} 字符`)
  } else {
    console.log('\n（缺少压缩前快照 docs/analysis/code-size/baseline.json，只报当前判定）')
  }

  const failed = results.filter((result) => !result.ok)
  console.log(failed.length === 0 ? '\n结论：全部证据成立。' : `\n结论：${failed.length} 项证据不成立。`)
  process.exit(failed.length === 0 ? 0 : 1)
}
