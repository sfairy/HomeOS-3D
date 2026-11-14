#!/usr/bin/env node
/**
 * 证明「多边形不变量检查」不是空壳（突变测试）。
 *
 * 为什么需要这一步
 * ----------------
 * 一个从未失败过的检查，和一个永远返回 0 的脚本，在 CI 里长得一模一样。本脚本对内核做几次
 * **语义突变**（每次只改一处、且都是「看起来仍然合理」的改动），要求不变量检查每次都报错。
 * 只要有一次漏检，说明那组断言对该类错误是盲的，需要补断言而不是庆祝绿灯。
 *
 * 三个突变各自代表一类真实事故：
 * 1. 差集吞掉 `holeLoops` —— 「挖了洞但面积没减」，庭院挖水池位置错；
 * 2. 并集丢弃额外环 —— 「两个房间合并后少了一间」，连通性判断错；
 * 3. `polygonArea` 符号取反 —— 外环被当成洞，整块地板的净面积为 0。
 *
 * 注意：突变体必须写在内核**同目录**（`geometry.ts` 用的是无扩展名相对导入，放到别处打包会
 * 解析失败），因此脚本会在源树里短暂创建一个 `_mutant-geometry.ts`，并在 `finally` 里删除。
 * 它不进 `gate:static`（会临时改动源树），由人显式运行。
 *
 * 用法
 * ----
 *     node ops/checks/plan-geometry-mutation-check.mjs
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const PLAN_DIR = path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/3d-studio/plan')
const SOURCE = path.join(PLAN_DIR, 'geometry.ts')
const MUTANT = path.join(PLAN_DIR, '_mutant-geometry.ts')
const CHECKER = path.join(REPO_ROOT, 'ops/checks/plan-geometry-invariants.mjs')

const MUTATIONS = [
  {
    label: '差集忽略洞（subtract 吞掉 holeLoops）',
    find: '  return unionPolygonLoops(targetLoops, loopTolerance, holeLoops)',
    replace: '  return unionPolygonLoops(targetLoops, loopTolerance)',
  },
  {
    label: '并集丢弃额外环（additionalLoops 不参与）',
    find: 'for (const sourceLoop of [...primaryLoops, ...variantLoops])',
    replace: 'for (const sourceLoop of [...primaryLoops])',
  },
  {
    label: 'polygonArea 符号取反（外环被当成洞）',
    find: 'export function polygonArea(polygonPoints: any) {',
    replace:
      'export function polygonArea(polygonPoints: any) {\n  return -polygonAreaRaw(polygonPoints)\n}\nfunction polygonAreaRaw(polygonPoints: any) {',
  },
]

const pristine = fs.readFileSync(SOURCE, 'utf8')
let caught = 0
const rows = []

try {
  for (const mutation of MUTATIONS) {
    if (!pristine.includes(mutation.find)) {
      rows.push({ label: mutation.label, status: 'SKIP', detail: '锚点已不存在，需要更新本脚本' })
      continue
    }
    fs.writeFileSync(MUTANT, pristine.replace(mutation.find, mutation.replace))
    let detected = false
    let detail = ''
    try {
      execFileSync('node', [CHECKER, '--entry', path.relative(REPO_ROOT, MUTANT)], {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      })
    } catch (error) {
      detected = true
      const output = String(error.stdout || '')
      detail =
        output
          .split('\n')
          .find((line) => line.trim().startsWith('-'))
          ?.trim() ?? ''
    }
    if (detected) caught += 1
    rows.push({ label: mutation.label, status: detected ? 'CAUGHT' : 'MISSED', detail })
  }
} finally {
  fs.rmSync(MUTANT, { force: true })
}

for (const row of rows) {
  console.log(`${row.status.padEnd(7)} ${row.label}${row.detail ? `\n        ${row.detail}` : ''}`)
}
console.log(`\n突变检出：${caught} / ${MUTATIONS.length}`)
if (caught !== MUTATIONS.length) {
  console.error('有不变量盲区：上面没被检出的突变说明对应断言缺失，请补断言而不是放宽检查。')
}
process.exit(caught === MUTATIONS.length ? 0 : 1)
