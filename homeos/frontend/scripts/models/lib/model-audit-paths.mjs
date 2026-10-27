/**
 * 模型审计快照的**唯一落盘位置**（不是历史归档）。
 *
 * 这里放的都是**派生物**，不是源数据：都能由 `audit_glb_*` 从 GLB 本体重算。
 * 所以目录整体在 `.gitignore` 里（`docs/`），仓库只提交由它们生成的
 * `specs/*.json`；干净检出照常构建，只有**重建契约**时才需要先跑审计。
 *
 * 目录名刻意不带日期：带日期会让人误当「某一轮的快照」，进而按轮次复制新目录，
 * 消费方却仍指向旧的日期路径 —— 这才是之前 `glb-geometry-repair.json` 烂在
 * `2026-10-22/` 里的原因。需要历史对比就用 `--out` 显式指定，不要改默认值。
 *
 * 改路径只改这里，消费方一律 import 常量。
 */
import path from 'node:path'
import { repoRoot } from './glb-io.mjs'

/** 审计快照根目录（gitignored）。 */
export const modelAuditDir = path.join(repoRoot, 'docs/model-audit')

/** `audit_glb_materials.mjs` 输出；`build-slot-contracts.mjs` 的唯一外部输入。 */
export const materialAuditFile = path.join(modelAuditDir, 'glb-material-audit.json')

/** `audit_glb_geometry.mjs` 输出（只读报告，无下游消费）。 */
export const geometryAuditFile = path.join(modelAuditDir, 'glb-geometry-audit.json')

/** `audit_glb_material_slots.mjs` 输出（只读报告，无下游消费）。 */
export const materialSlotsAuditFile = path.join(modelAuditDir, 'glb-material-slots.json')

/** `compare_model_quality.mjs` 默认输出目录。 */
export const qualityDir = path.join(modelAuditDir, 'quality')

/** 仓库相对路径，用于写进生成物做溯源（始终用 `/` 分隔）。 */
export function repoRelative(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/')
}
