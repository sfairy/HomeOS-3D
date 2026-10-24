#!/usr/bin/env bun
/**
 * 补齐 / 同步模型变体（完整件 ↔ lite）。
 *
 * 补变体已经做完（`floor-lamp` / `floating-stairs` 补出了 lite，`scooter` / `suv` 补出了
 * 完整件），现在这一层维持的是**一致性**：任何一份只有单档、或 lite 与完整件的材质集
 * 不一致的模型，都按同一份几何重出另一档，并保证三角面数 / 材质名 / 包围盒一致。
 *
 * 注意：补出文件 ≠ 运行时会加载它。注册表必须同时登记 `url`（lite）与 `fallbackUrl`
 * （完整件），否则另一档就是死文件；`audit_glb_assets.mjs` 的 S8 规则专门查这条。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/ensure_variants.mjs            # dry-run
 * bun ops/checks/studio/ensure_variants.mjs --write    # 落盘
 * bun ops/checks/studio/ensure_variants.mjs --sync-materials --write
 *   # 额外把「lite 与完整件材质集 / 参数不一致」的件从完整件重出 lite
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { collectModelVariants, listModelFiles, modelsDir, readGlbFile, relativeDeviation, round } from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'
import { writeLiteFrom } from '../../../homeos/frontend/scripts/models/lib/model-builder.mjs'
import { loadDocument, modelStatistics, worldBounds, writeDocument } from '../../../homeos/frontend/scripts/models/lib/model-document.mjs'

const write = process.argv.includes('--write')
const syncMaterials = process.argv.includes('--sync-materials')

/**
 * lite 与完整件的材质集 / 参数差异（审计 C4 的同一口径）。
 *
 * 运行时优先加载 lite，lite 缺的槽位在场景里**直接不存在**：调色板给了颜色也没处落。
 * 只能由完整件重出 lite（`writeLiteFrom` 断言材质名 / 节点 / 面数不变、包围盒误差 ≤1%），
 * 不能靠改名字或补参数糊过去。
 */
function materialDrift(fullPath, litePath) {
  const signature = (filePath) => {
    const { json } = readGlbFile(filePath)
    return new Map(
      (json.materials ?? []).map((material, index) => {
        const pbr = material.pbrMetallicRoughness ?? {}
        return [
          material.name ?? `material-${index}`,
          // glTF 缺省值归一：导出器删掉默认值不等于参数漂移。
          JSON.stringify([
            pbr.baseColorFactor ?? [1, 1, 1, 1],
            pbr.metallicFactor ?? 1,
            pbr.roughnessFactor ?? 1,
            material.alphaMode ?? 'OPAQUE',
            material.doubleSided === true,
            material.emissiveFactor ?? [0, 0, 0],
          ]),
        ]
      }),
    )
  }
  const full = signature(fullPath)
  const lite = signature(litePath)
  const missingInLite = [...full.keys()].filter((name) => !lite.has(name))
  const missingInFull = [...lite.keys()].filter((name) => !full.has(name))
  const valueDiff = [...full.keys()].filter((name) => lite.has(name) && lite.get(name) !== full.get(name))
  return { missingInLite, missingInFull, valueDiff }
}

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

/**
 * 第二趟：材质集 / 参数漂移的件，由完整件重出 lite。
 *
 * 只在显式 `--sync-materials` 时动作（默认 dry-run 只报告），因为它会重编码几何 ——
 * 虽然 `writeLiteFrom` 有保真断言，批量重编码仍需人工确认一次。
 */
for (const [id, entry] of variants) {
  if (!entry.full || !entry.lite) continue
  const fullPath = path.join(modelsDir, entry.full)
  const litePath = path.join(modelsDir, entry.lite)
  let drift
  try {
    drift = materialDrift(fullPath, litePath)
  } catch (error) {
    results.push({ id, full: entry.full, lite: entry.lite, actions: [], error: error.message })
    continue
  }
  if (!drift.missingInLite.length && !drift.missingInFull.length && !drift.valueDiff.length) continue
  const result = {
    id,
    full: entry.full,
    lite: entry.lite,
    actions: [syncMaterials ? 'write-lite-from-full' : 'write-lite-from-full (需 --sync-materials)'],
    drift,
  }
  try {
    if (write && syncMaterials) {
      const before = fs.statSync(litePath).size
      await writeLiteFrom(fullPath, litePath)
      const after = fs.statSync(litePath).size
      result.liteBytes = [before, after]
      const parity = materialDrift(fullPath, litePath)
      result.parity = {
        materials: !parity.missingInLite.length && !parity.missingInFull.length,
        values: parity.valueDiff.length === 0,
      }
      if (!result.parity.materials || !result.parity.values) result.error = '重出后材质仍不一致'
    }
  } catch (error) {
    result.error = error.message
  }
  results.push(result)
}

console.log(JSON.stringify({ mode: write ? 'write' : 'dry-run', results }, null, 2))
if (results.some((entry) => entry.error)) process.exitCode = 1
