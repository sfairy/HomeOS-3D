#!/usr/bin/env node
/**
 * 证明「场景归一化不变量检查」能抓住真实事故（突变测试）。
 *
 * 前两个突变**逐字复现了 `studio-scene-payload.ts` 注释里记录过的真实事故**：
 * 1. 删掉 `windowDesign` 的搬运 —— 保存一次，自定义窗型全部退回普通窗；
 * 2. 删掉 `remark` 的搬运 —— 3D 里窗扇的显示名丢失。
 * 后三个覆盖引用完整性、取值夹取与退化剪除。
 *
 * 运行机制见 `ops/lib/mutation-check.mjs`（共享，避免每个检查各抄一份运行器）。
 * 它不进 `gate:static`（会临时改动源树），由人显式运行。
 *
 * 用法：`node ops/checks/scene-payload-mutation-check.mjs`
 */
import path from 'node:path'
import process from 'node:process'

import { reportMutationCheck, runMutationCheck } from '../lib/mutation-check.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')

const result = runMutationCheck({
  repoRoot: REPO_ROOT,
  source: path.join(
    REPO_ROOT,
    'homeos/frontend/src/studio/app/3d-studio/authoring/scene/payload/studio-scene-payload.ts',
  ),
  checker: path.join(REPO_ROOT, 'ops/checks/scene-payload-invariants.mjs'),
  mutations: [
    {
      label: '删掉 windowDesign 搬运（真实事故：窗型全退回普通窗）',
      find: '...(rawWindow?.windowDesign ? { windowDesign: structuredClone(rawWindow.windowDesign) } : {}),',
      replace: '',
    },
    {
      label: '删掉 remark 搬运（真实事故：窗扇显示名丢失）',
      find: "...(typeof rawWindow?.remark === 'string' && rawWindow.remark ? { remark: rawWindow.remark } : {}),",
      replace: '',
    },
    {
      label: '窗不再校验宿主墙（产生孤儿窗）',
      find: '.filter((windowCandidate: any) => wallIdSet.has(windowCandidate.wallId))',
      replace: '.filter(() => true)',
    },
    {
      label: '去掉数值夹取上限（越界值原样透传）',
      find: 'height: clamp2(finite2(rawWall?.height, rawScene.settings?.wallHeight || 2.8), 0.01, 6),',
      replace: 'height: finite2(rawWall?.height, rawScene.settings?.wallHeight || 2.8),',
    },
    {
      label: '去掉短墙剪除（零长度墙进入地板多边形）',
      find: '.filter((wallCandidate: any) => distance2(wallCandidate.start, wallCandidate.end) > 0.1)',
      replace: '.filter(() => true)',
    },
  ],
})

process.exit(reportMutationCheck(result))
