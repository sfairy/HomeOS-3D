/**
 * 拓扑探针（本机可跑版）：逐个 GLB 重算非流形边 / 边界边 / 壳数 / 有向体积，落成
 * `geometry-probe.json`，schema 与 `glb_geometry_probe.py`（Blender 版）一致。
 *
 * 为什么有两份探针：
 * - 这份用 `geometry-ops.mjs` 的纯 JS 拓扑（按位置焊接后建边表）。统计口径与修复脚本
 *   完全一致，**同一套数字**才谈得上「修复前后对比」。
 * - `glb_geometry_probe.py` 用 Blender 的 BMesh 独立复算，作为第三方交叉校验；本机没装
 *   Blender 时它不参与流程，报告里 probe 字段为 null。
 *
 * 用法：
 *   bun ops/checks/studio/glb_geometry_probe.mjs            # 全量，写 geometry-probe.json
 *   bun ops/checks/studio/glb_geometry_probe.mjs --model sofa,cabinet
 *   bun ops/checks/studio/glb_geometry_probe.mjs --stdout   # 只打印
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectModelVariants, listModelFiles, modelsDir } from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'
import { loadDocument, modelStatistics } from '../../../homeos/frontend/scripts/models/lib/model-document.mjs'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

async function main() {
  const only = valueOf('model')?.split(',').map((id) => id.trim()).filter(Boolean)
  const variants = collectModelVariants(listModelFiles())
  const models = []
  for (const [id, variantMap] of [...variants].sort(([left], [right]) => left.localeCompare(right))) {
    if (only && !only.includes(id)) continue
    const relative = variantMap.full ?? variantMap.lite
    const absolute = path.join(modelsDir, relative)
    const doc = await loadDocument(absolute)
    try {
      const stats = modelStatistics(doc)
      models.push({
        id,
        file: relative,
        producer: 'geometry-ops.mjs',
        triangles: stats.triangles,
        vertices: stats.vertices,
        shells: stats.shells,
        nonManifoldEdges: stats.nonManifoldEdges,
        boundaryEdges: stats.boundaryEdges,
        signedVolume: Number(stats.signedVolume.toFixed(6)),
      })
    } finally {
      doc.getRoot().dispose?.()
    }
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    producer: 'geometry-ops.mjs',
    note: '按位置焊接后的边表统计，与 repair_glb_geometry.mjs 口径一致；Blender 版探针可作为第三方复核。',
    models,
  }
  if (args.includes('--stdout')) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n')
    return
  }
  const target = path.join(hereDir, 'geometry-probe.json')
  fs.writeFileSync(target, JSON.stringify(payload, null, 2) + '\n')
  console.log(`写入 ${path.relative(process.cwd(), target)}（${models.length} 个模型）`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
