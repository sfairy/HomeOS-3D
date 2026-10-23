#!/usr/bin/env bun
/**
 * 补齐 / 同步模型变体（完整件 ↔ lite）。
 *
 * 388 个模型里有一小批只有单变体：`floor-lamp`、`floating-stairs` 只有完整件，
 * `scooter`、`suv` 只有 lite。加载器按目录登记选文件，缺一个变体就会在那条路径上
 * 回落到另一档精度；计划 §5.7 要求「由修正后的完整件统一重出 lite」，
 * 所以这里按同一份几何把两档都补齐，并保证三角面数 / 材质名 / 包围盒一致。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/ensure_variants.mjs            # dry-run
 * bun ops/checks/studio/ensure_variants.mjs --write    # 落盘
 * ```
 */
import path from 'node:path'
import { collectModelVariants, listModelFiles, modelsDir, relativeDeviation, round } from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'
import { writeLiteFrom } from '../../../homeos/frontend/scripts/models/lib/model-builder.mjs'
import { loadDocument, modelStatistics, worldBounds, writeDocument } from '../../../homeos/frontend/scripts/models/lib/model-document.mjs'

const write = process.argv.includes('--write')

const variants = collectModelVariants(listModelFiles())
const results = []
for (const [id, entry] of variants) {
  if (entry.full && entry.lite) continue
  const result = { id, full: entry.full ?? null, lite: entry.lite ?? null, actions: [] }
  try {
    if (entry.full && !entry.lite) {
      const fullPath = path.join(modelsDir, entry.full)
      const litePath = fullPath.replace(/\.glb$/, '-lite.glb')
      result.lite = path.relative(modelsDir, litePath)
      result.actions.push('write-lite')
      if (write) await writeLiteFrom(fullPath, litePath)
    } else if (!entry.full && entry.lite) {
      const litePath = path.join(modelsDir, entry.lite)
      const fullPath = litePath.replace(/-lite\.glb$/, '.glb')
      result.full = path.relative(modelsDir, fullPath)
      result.actions.push('write-full-from-lite', 'write-lite')
      if (write) {
        // 由 lite 解出未压缩完整件（Draco 由 gltf-transform 解码），再按同源几何重出 lite，
        // 这样两档共用同一份量化结果，包围盒误差 ≤0.5%。
        const document = await loadDocument(litePath, { draco: true })
        await writeDocument(document, fullPath, { draco: false })
        await writeLiteFrom(fullPath, litePath)
      }
    }
    if (write) {
      const fullDoc = await loadDocument(path.join(modelsDir, result.full), { draco: true })
      const liteDoc = await loadDocument(path.join(modelsDir, result.lite), { draco: true })
      const fullStats = modelStatistics(fullDoc)
      const liteStats = modelStatistics(liteDoc)
      const fullSize = worldBounds(fullDoc).size
      const liteSize = worldBounds(liteDoc).size
      result.parity = {
        triangles: [fullStats.triangles, liteStats.triangles],
        size: [fullSize.map((value) => round(value, 4)), liteSize.map((value) => round(value, 4))],
        boundsDeviation: round(
          Math.max(...fullSize.map((value, axis) => relativeDeviation(value, liteSize[axis]) ?? 0)),
          4,
        ),
        materials: fullStats.materials === liteStats.materials,
      }
    }
  } catch (error) {
    result.error = error.message
  }
  results.push(result)
}

console.log(JSON.stringify({ mode: write ? 'write' : 'dry-run', results }, null, 2))
if (results.some((entry) => entry.error)) process.exitCode = 1
