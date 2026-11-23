/**
 * 3D / 画布不变量批量入口：八条纯逻辑断言收成一个门禁步骤。
 *
 * 这八条都是 `bun` 直接 import 前端 TS 后跑断言（几何内核、放置吸附、视口手势、窗型撤销、
 * 场景归一化、状态游标、画布基准、分辨率审计）。合并后门禁清单只留一条，失败面收敛为一个
 * 步骤；每条仍是独立进程，因为它们的顶层就是断言脚本（`process.exit`），改成可 import 的
 * 函数收益小于「搬错一句就静默少跑一段」的风险。
 *
 * 与前端的区别：前端那批共享 `walkFiles` / `text` / `SourceFile` 缓存（同一批文件被 10 条
 * 检查反复扫）；这八条各扫自己的输入（几何模块 / 草稿语料 / 布局函数），没有可共享的遍历。
 *
 * 用法：
 * ```bash
 * bun run check:studio-invariants
 * node ops/checks/run_studio_invariants.mjs --module geometry
 * node ops/checks/run_studio_invariants.mjs --list
 * ```
 */
import process from 'node:process'

import { runBatch } from '../lib/batch.mjs'

const MODULES = [
  {
    name: 'plan-geometry',
    cmd: ['node', 'ops/checks/studio/plan-geometry-invariants.mjs'],
    covers: ['check:plan-geometry'],
  },
  {
    name: 'studio-placement',
    cmd: ['node', 'ops/checks/studio/studio-placement-invariants.mjs'],
    covers: ['check:studio-placement'],
  },
  {
    name: 'studio-gesture',
    cmd: ['node', 'ops/checks/studio/studio-editor-gesture-invariants.mjs'],
    covers: ['check:studio-gesture'],
  },
  {
    name: 'studio-window-undo',
    cmd: ['node', 'ops/checks/studio/studio-window-undo.mjs'],
    covers: ['check:studio-window-undo'],
  },
  {
    name: 'scene-payload',
    cmd: ['node', 'ops/checks/studio/scene-payload-invariants.mjs'],
    covers: ['check:scene-payload'],
  },
  // 以下两条要 import 前端 TS，必须走 bun 的转译能力。
  {
    name: 'state-revision',
    cmd: ['bun', 'ops/checks/studio/state_revision_selftest.mjs'],
    covers: ['check:state-revision'],
  },
  // 画布：档位选择 + 5×15 分辨率矩阵，两个旧脚本合并成一条（同一份 canvas-layout.util.ts
  // 只转译一次）。covers 保留两个旧名，`--step canvas-layout` / `--step scaling` 都能命中。
  {
    name: 'canvas-layout',
    cmd: ['bun', 'ops/checks/frontend/check_canvas_layout.mjs'],
    covers: ['check:canvas-layout', 'audit:scaling'],
  },
]

process.exit(await runBatch({ modules: MODULES, label: '3D / 画布不变量' }))
