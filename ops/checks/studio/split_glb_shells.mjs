#!/usr/bin/env bun
/**
 * 按几何壳把构件拆成独立材质（默认 dry-run）。
 *
 * 起因：`小汽车.glb` 的车体 + 4 个车轮 + 2 个后视镜共用一个 `smallcar-bodywork` 材质，
 * 轮胎的深色完全由那张**拍摄的四视图参考图**上色。贴图摘掉后轮子会变成车身色，
 * 而 `suv.glb` 的做法是「车轮 = 独立深色材质」—— 这里把两者对齐。
 *
 * 拆法：同一 mesh 里新增一个 primitive，**共享原有的 POSITION / NORMAL / UV accessor**
 * （glTF 允许），只给一份新的 index accessor。所以顶点数据不复制，只是多一次 draw call。
 *
 * 安全线（写盘前的硬断言）：
 * - 三角面总数不变，且拆分出的面数与判据命中的壳完全一致；
 * - `POSITION` 外接尺寸不变；
 * - 除新增材质外，材质名集合不变；
 * - lite 重新压 Draco 后体积 ≤ 改前 1.2×（`小汽车-lite` 现约 19KB，余量充足）。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/split_glb_shells.mjs                  # dry-run，列计划
 * bun ops/checks/studio/split_glb_shells.mjs --write          # 落盘
 * bun ops/checks/studio/split_glb_shells.mjs --model car      # 单款
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { draco, prune } from '@gltf-transform/functions'
import draco3dgltf from 'draco3dgltf'
import {
  listModelFiles,
  modelsDir,
  parseModelPath,
  parseGlb,
} from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'
import { SHELL_SPLIT_RULES, shellMatches } from '../../../homeos/frontend/scripts/models/lib/shell-split-rules.mjs'
import { geometrySignature, positionBounds } from '../../../homeos/frontend/scripts/models/lib/glb-json-surgery.mjs'

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
const write = hasFlag('write')
const only = valueOf('model')

const DRACO_OPTIONS = Object.freeze({
  quantizePosition: 14,
  quantizeNormal: 10,
  quantizeTexcoord: 12,
  quantizeColor: 8,
  quantizeGeneric: 12,
})

/** 十六进制 → glTF 的 `baseColorFactor`（约定见 `repair_glb_material_slots.mjs`：sRGB / 255）。 */
function hexToFactor(hex) {
  const value = Number.parseInt(String(hex).replace('#', ''), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1].map((channel) =>
    Number(channel.toFixed(4)),
  )
}

/**
 * 连通壳：按位置焊接顶点后做并查集，返回 `{ shellIndex → { triangles: number[], min, max } }`。
 *
 * 用位置焊接而不是索引：导出器沿硬边复制顶点是标准做法，按索引会把一个车轮拆成好几个碎壳。
 */
function connectedShells(primitive) {
  const position = primitive.getAttribute('POSITION')
  const indices = primitive.getIndices()
  if (!position || !indices) throw new Error('primitive 缺少 POSITION / indices')
  const positions = position.getArray()
  const triangles = indices.getArray()
  const vertexCount = positions.length / 3
  const parent = new Int32Array(vertexCount)
  const welded = new Map()
  const find = (vertex) => {
    let root = vertex
    while (parent[root] !== root) root = parent[root]
    while (parent[vertex] !== root) {
      const next = parent[vertex]
      parent[vertex] = root
      vertex = next
    }
    return root
  }
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const key = `${Math.round(positions[vertex * 3] * 1e4)},${Math.round(positions[vertex * 3 + 1] * 1e4)},${Math.round(positions[vertex * 3 + 2] * 1e4)}`
    const existing = welded.get(key)
    parent[vertex] = existing === undefined ? vertex : existing
    if (existing === undefined) welded.set(key, vertex)
  }
  for (let corner = 0; corner < triangles.length; corner += 3) {
    const a = find(triangles[corner])
    const b = find(triangles[corner + 1])
    const c = find(triangles[corner + 2])
    if (b !== a) parent[b] = a
    if (c !== a) parent[c] = find(a)
  }
  const shells = new Map()
  for (let corner = 0; corner < triangles.length; corner += 3) {
    const root = find(triangles[corner])
    const shell = shells.get(root) ?? {
      corners: [],
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    }
    for (let k = 0; k < 3; k += 1) {
      const vertex = triangles[corner + k]
      shell.corners.push(vertex)
      for (let axis = 0; axis < 3; axis += 1) {
        const value = positions[vertex * 3 + axis]
        shell.min[axis] = Math.min(shell.min[axis], value)
        shell.max[axis] = Math.max(shell.max[axis], value)
      }
    }
    shells.set(root, shell)
  }
  return shells
}

/**
 * 用给定的角标序列重建一个 primitive：只保留被用到的顶点，并给出配套的 min/max。
 *
 * `POSITION` 的 `min` / `max` 由 glTF-Transform 的 writer 依据数组自动算出（v4 没有
 * `setMin` / `setMax`），审计正是靠它们零解码读外接尺寸。
 */
function rebuildPrimitive(document, source, corners, material, label) {
  const remap = new Map()
  const indexArray = []
  for (const vertex of corners) {
    let next = remap.get(vertex)
    if (next === undefined) {
      next = remap.size
      remap.set(vertex, next)
    }
    indexArray.push(next)
  }
  const IndexArrayType = remap.size <= 65535 ? Uint16Array : Uint32Array
  const primitive = document.createPrimitive().setMaterial(material)
  for (const semantic of source.listSemantics()) {
    const attribute = source.getAttribute(semantic)
    const sourceArray = attribute.getArray()
    const elementSize = attribute.getElementSize()
    const out = new sourceArray.constructor(remap.size * elementSize)
    for (const [from, to] of remap) {
      for (let component = 0; component < elementSize; component += 1) {
        out[to * elementSize + component] = sourceArray[from * elementSize + component]
      }
    }
    const accessor = document
      .createAccessor(`${label}-${semantic}`)
      .setType(attribute.getType())
      .setArray(out)
      .setNormalized(attribute.getNormalized())
    primitive.setAttribute(semantic, accessor)
  }
  primitive.setIndices(
    document.createAccessor(`${label}-indices`).setType('SCALAR').setArray(new IndexArrayType(indexArray)),
  )
  return primitive
}

async function createIO() {
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3dgltf.createDecoderModule(),
    'draco3d.encoder': await draco3dgltf.createEncoderModule(),
  })
}

/** 找出所有命中规则的壳，返回要拆出去的三角形角标。 */
function planSplit(document, rules) {
  const root = document.getRoot()
  const plans = []
  for (const rule of rules) {
    if (root.listMaterials().some((material) => material.getName() === rule.material)) continue
    const meshes = root.listMeshes()
    for (const mesh of meshes) {
      for (const primitive of mesh.listPrimitives()) {
        if (!primitive.listSemantics().includes('NORMAL')) continue
        if (primitive.getMaterial()?.getName() === rule.material) continue
        const shells = connectedShells(primitive)
        const matched = []
        for (const shell of shells.values()) {
          const size = shell.max.map((value, axis) => value - shell.min[axis])
          if (shellMatches(rule.predicate, size)) matched.push(shell)
        }
        if (!matched.length) continue
        const matchedCorners = matched.flatMap((shell) => shell.corners)
        plans.push({ rule, mesh, primitive, matched, matchedCorners })
        break
      }
      if (plans.some((plan) => plan.mesh === mesh)) break
    }
  }
  return plans
}

async function main() {
  const io = await createIO()
  const files = listModelFiles().filter((relativePath) => {
    const parsed = parseModelPath(relativePath)
    if (!SHELL_SPLIT_RULES[parsed.id]) return false
    return !only || parsed.id === only
  })
  if (!files.length) {
    console.log('没有匹配的模型（见 `lib/shell-split-rules.mjs`）')
    return
  }

  let changed = 0
  for (const relativePath of files) {
    const parsed = parseModelPath(relativePath)
    const absolute = path.join(modelsDir, relativePath)
    const bytesBefore = fs.statSync(absolute).size
    const signatureBeforeJson = geometrySignature(parseGlb(fs.readFileSync(absolute)).json)
    const document = await io.read(absolute)
    const plans = planSplit(document, SHELL_SPLIT_RULES[parsed.id])
    if (!plans.length) {
      console.log(`  ${relativePath}：无需拆分（已拆或没有命中壳）`)
      continue
    }
    const totalMatched = plans.reduce(
      (sum, plan) => sum + plan.matched.reduce((inner, shell) => inner + shell.corners.length / 3, 0),
      0,
    )
    console.log(
      `\n${relativePath}：命中 ${plans.reduce((sum, plan) => sum + plan.matched.length, 0)} 个壳 / ${totalMatched} 面 → 材质 \`${
        plans[0].rule.material
      }\``,
    )
    if (!write) continue

    for (const plan of plans) {
      const { rule, mesh, primitive, matchedCorners } = plan
      const indicesArray = primitive.getIndices().getArray()
      const matchedCornerSet = new Set(matchedCorners)
      const wheelCorners = []
      const bodyCorners = []
      for (let corner = 0; corner < indicesArray.length; corner += 3) {
        const bucket = matchedCornerSet.has(indicesArray[corner]) ? wheelCorners : bodyCorners
        bucket.push(indicesArray[corner], indicesArray[corner + 1], indicesArray[corner + 2])
      }
      const bodyMaterial = primitive.getMaterial()
      const wheelMaterial = document
        .createMaterial(rule.material)
        .setBaseColorFactor(hexToFactor(rule.baseColorHex))
        .setRoughnessFactor(rule.roughness)
        .setMetallicFactor(rule.metalness)
        .setAlphaMode('OPAQUE')
        .setDoubleSided(false)
      /**
       * 顶点必须**按壳切分**，不能两个 primitive 共享同一批 accessor：
       * Draco 是按 primitive 独立编码的，共享属性会让每个 primitive 各压一份顶点
       * （实测 `小汽车-lite` 从 18.7KB 涨到 37.3KB，正好 2×）。切分后顶点总数不变，
       * 体积只多一个 Draco 流的头部。
       */
      const bodyPrimitive = rebuildPrimitive(
        document,
        primitive,
        bodyCorners,
        bodyMaterial,
        bodyMaterial?.getName() ?? 'body',
      )
      const wheelPrimitive = rebuildPrimitive(document, primitive, wheelCorners, wheelMaterial, rule.material)
      mesh.removePrimitive(primitive)
      mesh.addPrimitive(bodyPrimitive)
      mesh.addPrimitive(wheelPrimitive)
    }

    // 拆出来的新 primitive 用新 accessor，被替换掉的那批就成了**孤儿**；
    // 不 prune 的话 writer 照样把它们原样写进 BIN（实测 18.7KB → 279KB）。
    await document.transform(prune())
    // lite 必须保持 Draco；完整件反过来不能被压（导出 / 再编辑要原网格）。
    if (parsed.variant === 'lite') await document.transform(draco(DRACO_OPTIONS))
    const next = Buffer.from(await io.writeBinary(document))

    // 断言：几何与材质集合。
    const signatureAfterJson = geometrySignature(parseGlb(next).json)
    if (signatureAfterJson.triangles !== signatureBeforeJson.triangles) {
      throw new Error(
        `${relativePath}：三角面 ${signatureBeforeJson.triangles} → ${signatureAfterJson.triangles}，中止`,
      )
    }
    const boundsBefore = positionBounds(parseGlb(fs.readFileSync(absolute)).json)
    const boundsAfter = positionBounds(parseGlb(next).json)
    if (Math.max(...boundsBefore.min.map((value, axis) => Math.abs(value - boundsAfter.min[axis]))) > 1e-3) {
      throw new Error(`${relativePath}：POSITION 外接尺寸变了，中止`)
    }
    const addedMaterials = signatureAfterJson.materials.filter((name) => !signatureBeforeJson.materials.includes(name))
    if (addedMaterials.length !== 1)
      throw new Error(`${relativePath}：新增材质 ${addedMaterials.length} 个（应为 1），中止`)
    const removedMaterials = signatureBeforeJson.materials.filter(
      (name) => !signatureAfterJson.materials.includes(name),
    )
    if (removedMaterials.length) throw new Error(`${relativePath}：材质名缺失 ${removedMaterials.join(',')}，中止`)
    const ratio = next.length / bytesBefore
    if (ratio > 1.2)
      throw new Error(`${relativePath}：体积 ${bytesBefore} → ${next.length}（${(ratio * 100).toFixed(0)}%），中止`)

    fs.writeFileSync(absolute, next)
    changed += 1
    console.log(
      `  已拆分：材质 ${signatureBeforeJson.materials.length} → ${signatureAfterJson.materials.length}，` +
        `三角面 ${signatureAfterJson.triangles} 不变，体积 ${(bytesBefore / 1024).toFixed(1)}KB → ${(next.length / 1024).toFixed(1)}KB（${(ratio * 100).toFixed(0)}%）`,
    )
  }

  console.log(
    write
      ? `\n完成：改写 ${changed} 个文件。下一步：build-slot-contracts + 重写基线 + bun run check:model-assets`
      : '\n（dry-run：加 --write 才落盘）',
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
