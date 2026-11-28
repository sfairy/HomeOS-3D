#!/usr/bin/env bun
/**
 * GLB 结构清理（默认 dry-run）：删不可达节点 + 去掉归一化伪 UV。
 *
 * 两件事都是体检里实测出来的**结构性**缺陷，不是画质偏好：
 *
 * 1. **不可达节点**：`越野车.glb` 的 `scenes[0].nodes` 只引用 20 个无变换节点，而
 *    `Assembly-3 → Component1_场景根 → Component_Mesh → 20× Geom3D` 这 24 个节点
 *    不在任何 scene 里 —— 渲染器永远不会创建它们（three 的 GLTFLoader 按场景图建对象），
 *    但它们在 JSON 里留着一条 0.001 × 19.47 的缩放链，还制造 40 个幽灵节点名
 *    （20 个 `Geom3D` 重名 + 20 个空名），误导任何按节点名做的排查。
 *
 * 2. **归一化伪 UV**：见 `stale-uv-models.mjs`。摘掉后运行期按米补盒式 UV，
 *    细节图密度回到全库一致。
 *
 * ## 为什么是「JSON 手术」而不是 glTF-Transform
 *
 * 先试过 glTF-Transform（解压 → 改 → 重压 Draco）：`圆柱-lite` 从 4.6KB 涨到 5.9KB
 * （127%），直接顶穿 1.2× 体积预算 —— 只为去掉几百字节的 UV，不值。改成只动 JSON chunk、
 * BIN 逐字节保留：几何不可能变，体积只减不增，Draco 流原封不动。
 *
 * ## 安全线（写盘前的硬断言）
 *
 * - 三角面数与包围盒外接尺寸必须与改前一致（删节点 / 摘 UV 都不该动几何）；
 * - `primitive → 材质名` 的序列完全不变；
 * - **可达**节点名集合不变（删掉的正是不可达节点）；
 * - lite 仍然带 Draco、且 Draco 流的字节与改前逐字节相同；
 * - 体积不超过改前的 1.2×（实际上应当变小）。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/repair_glb_structure.mjs                 # dry-run，列计划
 * bun ops/checks/studio/repair_glb_structure.mjs --write         # 落盘
 * bun ops/checks/studio/repair_glb_structure.mjs --model suv     # 单款
 * bun ops/checks/studio/repair_glb_structure.mjs --check         # 门禁：还有待清理项则退出码 1
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  listModelFiles,
  modelsDir,
  parseGlb,
  parseModelPath,
  repoRoot,
} from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'
import { repackGlb } from '../../../homeos/frontend/scripts/models/lib/glb-bin-io.mjs'
import {
  declaresAttribute,
  detachAttribute,
  dropAccessors,
  dropNodes,
  unreachableNodeIndices,
} from '../../../homeos/frontend/scripts/models/lib/glb-json-surgery.mjs'
import { STALE_UV_ITEM_TYPES } from '../../../homeos/frontend/scripts/models/lib/stale-uv-models.mjs'

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
const write = hasFlag('write')
const check = hasFlag('check')
const asJson = hasFlag('json')
const only = valueOf('model')

/** 三角面数与材质绑定序列（判「几何 / 绑定有没有被动过」）。 */
function geometrySignature(json) {
  const accessors = json.accessors ?? []
  let triangles = 0
  const materials = []
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const indices = accessors[primitive.indices]
      const position = accessors[primitive.attributes?.POSITION]
      triangles += (indices?.count ?? position?.count ?? 0) / 3
      materials.push(json.materials?.[primitive.material]?.name ?? '(无材质)')
    }
  }
  return { triangles: Math.round(triangles), materials }
}

/** POSITION accessor 的 min/max 合并：不依赖 Draco 解码就能拿到外接尺寸。 */
function positionBounds(json) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION]
      if (!accessor?.min || !accessor?.max) continue
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], accessor.min[axis])
        max[axis] = Math.max(max[axis], accessor.max[axis])
      }
    }
  }
  return { min, max }
}

/** Draco 流字节（删 UV 前后必须逐字节相同）。 */
function dracoBytes(json, bin) {
  const chunks = []
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const index = primitive.extensions?.KHR_draco_mesh_compression?.bufferView
      if (index === undefined) continue
      const view = json.bufferViews?.[index]
      const start = view.byteOffset ?? 0
      chunks.push(bin.subarray(start, start + view.byteLength))
    }
  }
  return chunks
}

function scan() {
  const plan = []
  for (const relativePath of listModelFiles()) {
    const parsed = parseModelPath(relativePath)
    if (only && parsed.id !== only && !parsed.id.startsWith(`${only}-`)) continue
    const absolute = path.join(modelsDir, relativePath)
    const buffer = fs.readFileSync(absolute)
    const { json } = parseGlb(buffer)
    const unreachable = unreachableNodeIndices(json)
    const staleUv = Boolean(STALE_UV_ITEM_TYPES[parsed.id]) && declaresAttribute(json, 'TEXCOORD_0')
    if (!unreachable.length && !staleUv) continue
    plan.push({
      id: parsed.id,
      variant: parsed.variant,
      file: relativePath,
      absolute,
      bytes: buffer.length,
      unreachable,
      staleUv,
      nodeCount: (json.nodes ?? []).length,
      names: unreachable.slice(0, 3).map((index) => json.nodes[index]?.name ?? '(空)'),
    })
  }
  return plan
}

async function main() {
  const plan = scan()
  if (asJson) {
    process.stdout.write(
      `${JSON.stringify({ files: plan.length, plan: plan.map(({ absolute, ...rest }) => rest) }, null, 2)}\n`,
    )
  } else {
    console.log(`待清理文件 ${plan.length} 个`)
    for (const entry of plan) {
      const parts = []
      if (entry.unreachable.length) {
        parts.push(`删不可达节点 ${entry.unreachable.length}/${entry.nodeCount}（${entry.names.join(',')}…）`)
      }
      if (entry.staleUv) parts.push('摘掉归一化 UV')
      console.log(`  ${entry.id}/${entry.variant}：${parts.join('；')}（${(entry.bytes / 1024).toFixed(1)}KB）`)
    }
  }

  if (check) {
    if (plan.length) {
      console.error(`✗ 结构清理门禁：${plan.length} 个文件仍有不可达节点 / 归一化伪 UV`)
      console.error('  修：bun ops/checks/studio/repair_glb_structure.mjs --write')
      process.exit(1)
    }
    console.log('✓ 结构清理门禁通过：无不可达节点、无归一化伪 UV')
    return
  }

  if (!write) {
    console.log('\n（dry-run：加 --write 才落盘）')
    return
  }

  let changed = 0
  for (const entry of plan) {
    const buffer = fs.readFileSync(entry.absolute)
    const before = parseGlb(buffer)
    const signatureBefore = geometrySignature(before.json)
    const boundsBefore = positionBounds(before.json)
    const dracoBefore = dracoBytes(before.json, before.bin)
    const reachableNamesBefore = (() => {
      const skipped = new Set(unreachableNodeIndices(before.json))
      return (before.json.nodes ?? [])
        .filter((_, index) => !skipped.has(index))
        .map((node) => node.name ?? '')
        .sort()
    })()

    // 计划先算（两步：摘属性 → 才知道哪些 accessor 成了孤儿），再一次性重建。
    const probe = JSON.parse(JSON.stringify(before.json))
    const droppedAccessors = []
    if (entry.staleUv) droppedAccessors.push(...detachAttribute(probe, 'TEXCOORD_0').accessors)
    const orphanViews = droppedAccessors.length ? dropAccessors(probe, droppedAccessors).freedBufferViews : []
    const dropViewSet = new Set(orphanViews)
    const deserialize = (json) => {
      if (entry.unreachable.length) dropNodes(json, entry.unreachable)
      if (entry.staleUv) {
        const detached = detachAttribute(json, 'TEXCOORD_0')
        if (detached.accessors.length) dropAccessors(json, detached.accessors)
      }
    }
    const next = dropViewSet.size
      ? repackGlb(buffer, { mutateJson: deserialize, drop: dropViewSet })
      : repackGlb(buffer, { mutateJson: deserialize })

    const after = parseGlb(next)
    const signatureAfter = geometrySignature(after.json)
    if (signatureAfter.triangles !== signatureBefore.triangles) {
      throw new Error(`${entry.file}：三角面 ${signatureBefore.triangles} → ${signatureAfter.triangles}，中止`)
    }
    if (JSON.stringify(signatureAfter.materials) !== JSON.stringify(signatureBefore.materials)) {
      throw new Error(`${entry.file}：primitive → 材质 绑定变了，中止`)
    }
    const boundsAfter = positionBounds(after.json)
    if (JSON.stringify(boundsBefore) !== JSON.stringify(boundsAfter)) {
      throw new Error(`${entry.file}：POSITION 外接尺寸变了，中止`)
    }
    const reachableNamesAfter = (() => {
      const skipped = new Set(unreachableNodeIndices(after.json))
      return (after.json.nodes ?? [])
        .filter((_, index) => !skipped.has(index))
        .map((node) => node.name ?? '')
        .sort()
    })()
    if (JSON.stringify(reachableNamesAfter) !== JSON.stringify(reachableNamesBefore)) {
      throw new Error(`${entry.file}：可达节点名集合变了，中止`)
    }
    if (entry.variant === 'lite') {
      if (!(after.json.extensionsUsed ?? []).includes('KHR_draco_mesh_compression')) {
        throw new Error(`${entry.file}：lite 丢失 Draco，中止`)
      }
      const dracoAfter = dracoBytes(after.json, after.bin)
      if (dracoAfter.length !== dracoBefore.length) throw new Error(`${entry.file}：Draco primitive 数量变了，中止`)
      for (let index = 0; index < dracoAfter.length; index += 1) {
        if (!dracoAfter[index].equals(dracoBefore[index])) {
          throw new Error(`${entry.file}：Draco 流第 ${index} 段的字节变了，中止`)
        }
      }
    }
    if (entry.staleUv && declaresAttribute(after.json, 'TEXCOORD_0'))
      throw new Error(`${entry.file}：TEXCOORD_0 仍存在，中止`)
    if (unreachableNodeIndices(after.json).length) throw new Error(`${entry.file}：仍有不可达节点，中止`)
    const ratio = next.length / entry.bytes
    if (ratio > 1.2) throw new Error(`${entry.file}：体积涨到 ${(ratio * 100).toFixed(0)}%，中止`)

    fs.writeFileSync(entry.absolute, next)
    changed += 1
    console.log(
      `\n${entry.file}\n  节点 ${entry.nodeCount} → ${(after.json.nodes ?? []).length}` +
        `${entry.staleUv ? '，已摘 UV' : ''}\n  三角面 ${signatureAfter.triangles} 不变\n  ` +
        `体积 ${(entry.bytes / 1024).toFixed(1)}KB → ${(next.length / 1024).toFixed(1)}KB（${(ratio * 100).toFixed(0)}%）`,
    )
  }

  console.log(`\n完成：改写 ${changed} 个文件。仓库根 ${path.relative(repoRoot, modelsDir)}`)
  console.log('改完必须跑 bun run check:model-assets（材质 / 槽位 / 几何 / 体积）')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
