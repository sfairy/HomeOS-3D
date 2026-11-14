#!/usr/bin/env node
/**
 * 证明「多边形不变量检查」不是空壳（突变测试）。
 *
 * 四个突变各代表一类真实事故：
 * 1. 差集吞掉 `holeLoops` —— 「挖了洞但面积没减」，庭院挖水池位置错；
 * 2. 并集丢弃额外环 —— 「两个房间合并后少了一间」，连通性判断错；
 * 3. 拆分丢掉最后一段 —— 墙段总长变短，地板边缘露到墙外；
 * 4. `polygonArea` 符号取反 —— 外环被当成洞，整块地板净面积为 0。
 *
 * 运行机制见 `ops/lib/mutation-check.mjs`（共享，避免每个检查各抄一份运行器）。
 * 它不进 `gate:static`（会临时改动源树），由人显式运行。
 *
 * 用法：`node ops/checks/plan-geometry-mutation-check.mjs`
 */
import path from 'node:path'
import process from 'node:process'

import { reportMutationCheck, runMutationCheck } from '../lib/mutation-check.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')

const result = runMutationCheck({
  repoRoot: REPO_ROOT,
  source: path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/3d-studio/plan/geometry.ts'),
  checker: path.join(REPO_ROOT, 'ops/checks/plan-geometry-invariants.mjs'),
  mutations: [
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
      label: '拆分丢掉最后一段（墙段总长变短）',
      find: 'for (let splitIndex = 0; splitIndex < sortedSplitParams.length - 1; splitIndex += 1) {',
      replace: 'for (let splitIndex = 0; splitIndex < sortedSplitParams.length - 2; splitIndex += 1) {',
    },
    {
      label: 'polygonArea 符号取反（外环被当成洞）',
      find: 'export function polygonArea(polygonPoints: any) {',
      replace:
        'export function polygonArea(polygonPoints: any) {\n  return -polygonAreaRaw(polygonPoints)\n}\nfunction polygonAreaRaw(polygonPoints: any) {',
    },
  ],
})

process.exit(reportMutationCheck(result))
