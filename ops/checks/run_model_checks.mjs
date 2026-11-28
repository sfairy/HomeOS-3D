/**
 * 3D 模型库审计批量入口：六个只读审计收成一个门禁步骤。
 *
 * 为什么仍是子进程：这六个脚本是**审计报告生成器**（`audit_glb_materials.mjs` 单文件 3k 行），
 * 顶层直接跑报告、写基线、`process.exit`。把它们改造成可 import 的函数，风险远大于收益 ——
 * 任何一处顶层语句被搬错，门禁会静默少跑一段检查。
 *
 * 代价：GLB 文档缓存不跨模块共享（每个子进程各自解码）。实测六条合计约 1.4s，耗时主要在
 * Draco 解码本身，跨进程复用能省的只是重复读取小文件。
 *
 * 用法：
 * ```bash
 * bun run check:model-assets
 * node ops/checks/run_model_checks.mjs --module slots
 * node ops/checks/run_model_checks.mjs --list
 * ```
 */
import process from 'node:process'

import { runBatch } from '../lib/batch.mjs'

/** 顺序沿用原 `gate:model`：资产 → 几何 → 槽位 → 材质 → 目录 → 命名。 */
const MODULES = [
  { name: 'assets', cmd: ['bun', 'ops/checks/studio/audit_glb_assets.mjs', '--check'], covers: ['check:assets'] },
  { name: 'geometry', cmd: ['bun', 'ops/checks/studio/audit_glb_geometry.mjs', '--check'], covers: ['check:geometry'] },
  { name: 'slots', cmd: ['bun', 'ops/checks/studio/audit_glb_material_slots.mjs', '--check'], covers: ['check:slots'] },
  {
    name: 'materials',
    // `--strict`：单模型级问题（M4 透明通道 / A4 双面 / C7 内嵌值漂移…）也计入退出码。
    // 存量已在 2026-11 清零，再出现就是本轮引入的回归。
    cmd: ['bun', 'ops/checks/studio/audit_glb_materials.mjs', '--check', '--strict'],
    covers: ['check:materials'],
  },
  {
    name: 'textures',
    // 大体积内嵌贴图不许在多个变体里重复（同一张 1024² 图集曾在车身 + 开合件里存两份，
    // 一辆车的 lite 流量一半是重复字节）；`MASK` 材质的贴图没有 alpha 通道也直接判红。
    cmd: ['bun', 'ops/checks/studio/optimize_glb_textures.mjs', '--check'],
    covers: ['check:textures'],
  },
  {
    name: 'models-layout',
    cmd: ['bun', 'homeos/frontend/scripts/models/organize-models.mjs', '--check'],
    covers: ['check:models-layout'],
  },
  {
    name: 'model-names',
    cmd: ['bun', 'homeos/frontend/scripts/models/build-model-name-index.mjs', '--check'],
    covers: ['check:model-names'],
  },
]

process.exit(await runBatch({ modules: MODULES, label: '模型审计' }))
