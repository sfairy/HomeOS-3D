#!/usr/bin/env bun
/**
 * GLB 水密修复 CLI：把开口的薄壳真正加厚闭合（默认 dry-run，`--write` 才落盘）。
 *
 * 实现见 `lib/watertight.mjs`；判绿口径与 `audit_glb_geometry.mjs` 完全一致
 * （`modelStatistics`：世界坐标、位置焊接 1e-5）。修完仍有边界边或非流形边的件
 * **整体作废**：不写盘、不登记例外，只进 `failed` 清单。
 *
 * 用法（仓库根目录）：
 * ```bash
 * bun homeos/frontend/scripts/models/repair-watertight.mjs                  # dry-run 全量
 * bun homeos/frontend/scripts/models/repair-watertight.mjs --model router,laptop
 * bun homeos/frontend/scripts/models/repair-watertight.mjs --write          # 落盘（含 lite 重出）
 * bun homeos/frontend/scripts/models/repair-watertight.mjs --json
 * ```
 *
 * 退出码：仍有未闭合的件时返回 1（清单打到 stderr）。这是**硬信号**，不是可跳过的开关。
 */
import path from 'node:path'

import { collectModelVariants, listModelFiles, modelsDir } from './lib/glb-io.mjs'
import { sealModelFile } from './lib/watertight.mjs'

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

async function main() {
  const write = hasFlag('write')
  const json = hasFlag('json')
  const only = valueOf('model')
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  const variants = collectModelVariants(listModelFiles())
  const rows = []
  const failed = []

  for (const [id, variantMap] of [...variants].sort(([left], [right]) => left.localeCompare(right))) {
    if (only && !only.includes(id)) continue
    const fullPath = variantMap.full ? path.join(modelsDir, variantMap.full) : null
    const litePath = variantMap.lite ? path.join(modelsDir, variantMap.lite) : null
    // 只有 lite 的件没法就地修（lite 是压缩产物，重出没有完整件做参照）。
    if (!fullPath) {
      rows.push({ id, action: 'skip', reason: '缺完整件，只有 lite' })
      continue
    }
    try {
      const result = await sealModelFile({ fullPath, litePath, write })
      if (!result.wrote && result.closed) {
        rows.push({ id, action: 'skip', reason: '本来就闭合', before: result.before })
        continue
      }
      const row = {
        id,
        action: result.closed ? 'repair' : 'failed',
        before: result.before,
        after: result.after,
        geometry: result.geometry,
        wrote: result.wrote && write,
        liteRegenerated: result.liteRegenerated && write,
      }
      if (!result.closed) {
        row.reason =
          `修完仍有 边界边 ${result.after.boundaryEdges} / 非流形边 ${result.after.nonManifoldEdges}，` +
          '本件改动整体作废（不写盘、不登记例外）'
        failed.push(id)
      }
      rows.push(row)
    } catch (error) {
      rows.push({ id, action: 'error', reason: error.message })
      failed.push(id)
    }
  }

  // 统计只算**真正参与过修复**的行：本来就闭合的件没有 `after`，混进来会让面数对比失真。
  const touched = rows.filter((row) => row.action !== 'skip')
  const summary = {
    models: rows.length,
    repaired: rows.filter((row) => row.action === 'repair').length,
    failed: failed.length,
    skipped: rows.filter((row) => row.action === 'skip').length,
    errors: rows.filter((row) => row.action === 'error').length,
    thickenedPatches: touched.reduce((sum, row) => sum + (row.geometry?.thickenedPatches ?? 0), 0),
    rejectedPatches: touched.reduce((sum, row) => sum + (row.geometry?.rejectedPatches ?? 0), 0),
    addedTriangles: touched.reduce((sum, row) => sum + (row.geometry?.addedTriangles ?? 0), 0),
    trianglesBefore: touched.reduce((sum, row) => sum + (row.before?.triangles ?? 0), 0),
    trianglesAfter: touched.reduce((sum, row) => sum + (row.after?.triangles ?? 0), 0),
    boundaryBefore: touched.reduce((sum, row) => sum + (row.before?.boundaryEdges ?? 0), 0),
    boundaryAfter: touched.reduce((sum, row) => sum + (row.after?.boundaryEdges ?? 0), 0),
    nonManifoldBefore: touched.reduce((sum, row) => sum + (row.before?.nonManifoldEdges ?? 0), 0),
    nonManifoldAfter: touched.reduce((sum, row) => sum + (row.after?.nonManifoldEdges ?? 0), 0),
    failedIds: failed,
  }

  if (json) {
    process.stdout.write(JSON.stringify({ mode: write ? 'write' : 'dry-run', summary, models: rows }, null, 2) + '\n')
  } else {
    for (const row of rows) {
      if (row.action === 'skip') continue
      if (row.action === 'error') {
        console.log(`${row.id.padEnd(28)} 失败  ${row.reason}`)
        continue
      }
      const flag = row.action === 'repair' ? (write ? (row.wrote ? '已写' : '未写') : '可修') : '未闭合'
      console.log(
        `${row.id.padEnd(28)} ${flag}  边界 ${String(row.before.boundaryEdges).padStart(4)}→${String(row.after.boundaryEdges).padStart(4)}` +
          `  非流形 ${String(row.before.nonManifoldEdges).padStart(4)}→${String(row.after.nonManifoldEdges).padStart(4)}` +
          `  面 ${String(row.before.triangles).padStart(6)}→${String(row.after.triangles).padStart(6)}` +
          `  加厚片 ${String(row.geometry?.thickenedPatches ?? 0).padStart(3)} 拒绝 ${String(row.geometry?.rejectedPatches ?? 0).padStart(3)}`,
      )
      if (row.reason) console.log(`${''.padEnd(29)}${row.reason}`)
    }
    console.log('')
    console.log(JSON.stringify(summary, null, 2))
    if (!write) console.log('（dry-run：加 --write 才落盘）')
  }

  if (failed.length) {
    if (!json) {
      console.log('')
      console.log(`仍未闭合 ${failed.length} 款（本次未写盘，也未登记例外）：`)
      console.log(failed.join(', '))
    }
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
