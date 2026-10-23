/**
 * 精修件重建执行器：跑 `items/<id>.mjs` 的配方，校验尺寸后写完整件 + lite。
 *
 * 用法：
 *   bun homeos/frontend/scripts/models/rebuild-items.mjs tv_standard        # dry-run，打印尺寸
 *   bun homeos/frontend/scripts/models/rebuild-items.mjs tv_standard --write
 *   bun homeos/frontend/scripts/models/rebuild-items.mjs --all --write
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectModelVariants, listModelFiles, modelsDir, relativeDeviation, round } from './lib/glb-io.mjs'
import { assertPreserved } from './lib/asset-guard.mjs'
import { readSourceMaterials, writeFullModel, writeLiteFrom } from './lib/model-builder.mjs'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
const write = hasFlag('write')

/** 逐组几何的世界包围盒（配方里都是绝对坐标，没有节点变换）。 */
function boundsOf(groups) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  let triangles = 0
  let vertices = 0
  for (const group of groups) {
    const { positions, indices } = group.geometry
    vertices += positions.length / 3
    triangles += indices.length / 3
    for (let index = 0; index < positions.length; index += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = positions[index + axis]
        if (value < min[axis]) min[axis] = value
        if (value > max[axis]) max[axis] = value
      }
    }
  }
  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    triangles,
    vertices,
  }
}

/** 落到「底面 y=0、x/z 居中」的规范位置。 */
function align(groups) {
  const { min, max } = boundsOf(groups)
  const shift = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2]
  for (const group of groups) {
    const { positions } = group.geometry
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] += shift[0]
      positions[index + 1] += shift[1]
      positions[index + 2] += shift[2]
    }
  }
  return { shift, bounds: boundsOf(groups) }
}

async function rebuild(id) {
  const variants = collectModelVariants(listModelFiles())
  const variantMap = variants.get(id)
  if (!variantMap?.full) return { id, skipped: '没有完整件' }
  const itemModule = await import(`./items/${id}.mjs`)
  const fullPath = path.join(modelsDir, variantMap.full)
  const litePath = variantMap.lite ? path.join(modelsDir, variantMap.lite) : null
  const materials = readSourceMaterials(fullPath)
  const { groups } = itemModule.build()
  const { shift, bounds } = align(groups)
  const spec = itemModule.spec
  const deviation = bounds.size.map((value, axis) => round(relativeDeviation(value, spec.size[axis]) ?? 0, 4))
  const worst = Math.max(...deviation)
  const summary = {
    id,
    materials: materials.map((material) => material.name),
    groups: groups.map((group) => ({ name: group.name, material: materials[group.material]?.name })),
    size: bounds.size.map((value) => round(value, 4)),
    spec: spec.size,
    deviation,
    shift: shift.map((value) => round(value, 4)),
    triangles: bounds.triangles,
    vertices: bounds.vertices,
    wrote: false,
  }
  if (!write) return summary
  if (worst > 0.02) {
    return { ...summary, error: `配方尺寸与规格偏差 ${(worst * 100).toFixed(1)}% > 2%，拒绝落盘` }
  }
  /**
   * 源材质带贴图时默认拒绝：重建的 UV 是每个基元自己的 0..1，贴图会被拉伸。
   * 2026-10-23 追加：`--allow-textured` 只能和**显式模型 id** 一起用（禁止 `--all`），
   * 且落盘后仍要过 `assertPreserved` —— 上一轮就是用 `--all --allow-textured`
   * 把 `car` 的车漆图集和 `floor-lamp` 的拉丝贴图整片抹掉的。
   */
  const textured = materials.filter((material) => material.textured)
  if (textured.length && !hasFlag('allow-textured')) {
    return { ...summary, error: '源材质带贴图，重建会丢 UV 贴图，需先单独处理（或确认贴图可丢后加 --allow-textured）' }
  }
  if (textured.length && hasFlag('all')) {
    return { ...summary, error: '带贴图的件禁止随 --all 批量重建，请逐个指定 id 并显式确认' }
  }

  /**
   * 先写临时文件，过「不许变坏」闸门后再替换原件。
   *
   * 闸门会挡住历史上真实发生过的退化：面数掉 >10%（`sofa` 3804→180）、
   * 丢贴图（`car`）、材质/节点改名（249 个文件被打穿）。
   * 只有 `--allow-regression` + 显式 id 才放行，且结果会打在报告里。
   */
  const sourceBytes = fs.readFileSync(fullPath)
  const stagingPath = fullPath.replace(/\.glb$/i, '.rebuild.tmp.glb')
  await writeFullModel({
    filePath: stagingPath,
    materials,
    groups,
    rootName: path.basename(fullPath).replace(/\.glb$/i, ''),
    extras: { mount: spec.mount, dimensions: Object.fromEntries(['width', 'height', 'depth'].map((key, axis) => [key, spec.size[axis]])) },
  })
  let drift = []
  try {
    assertPreserved(`重建 ${id}`, sourceBytes, stagingPath, { minTriangleRatio: 0.9 })
  } catch (error) {
    drift = error.drift ?? [error.message]
    if (!hasFlag('allow-regression') || hasFlag('all')) {
      fs.rmSync(stagingPath, { force: true })
      return { ...summary, error: `重建会退化，已放弃：${drift.join('；')}` }
    }
  }
  fs.renameSync(stagingPath, fullPath)
  if (litePath) await writeLiteFrom(fullPath, litePath)
  return { ...summary, wrote: true, lite: Boolean(litePath), acceptedDrift: drift }
}

async function main() {
  // 位置参数即模型 id；也支持 --model a,b（便于和其它脚本统一）。
  const positional = args.filter((arg) => !arg.startsWith('--') && arg !== valueOf('model'))
  const only = [...(valueOf('model')?.split(',') ?? []), ...positional]
    .map((id) => id.trim())
    .filter(Boolean)
  const available = fs
    .readdirSync(path.join(hereDir, 'items'))
    .filter((file) => file.endsWith('.mjs'))
    .map((file) => file.replace(/\.mjs$/, ''))
  const ids = hasFlag('all') ? available : only ?? []
  if (!ids.length) {
    console.log('已提供配方的精修件：' + available.join(', '))
    console.log('用法：bun rebuild-items.mjs <id...> [--write] | --all [--write]')
    return
  }
  const results = []
  for (const id of ids) {
    try {
      results.push(await rebuild(id))
    } catch (error) {
      results.push({ id, error: error.message })
    }
  }
  console.log(JSON.stringify({ mode: write ? 'write' : 'dry-run', results }, null, 2))
  const failed = results.filter((result) => result.error)
  if (failed.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
