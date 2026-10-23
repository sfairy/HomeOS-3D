#!/usr/bin/env bun
/**
 * 离屏三视图渲染（正交投影 + Z 缓冲 + 朗伯着色），用于 before/after 与槽位调试对比。
 *
 * 不依赖浏览器 / WebGL：直接读 GLB 的 POSITION + 节点世界矩阵，把三角形光栅化到
 * 512×512 的 PNG。目的是**看轮廓与体量是否可信**，不是照片级预览：
 * - `--mode solid`：按材质自身 baseColor 着色（正式配色对比）；
 * - `--mode slots`：每个槽位一种高对比色，证明「槽位 ↔ 构件」对得上；
 * - `--baseline`：同一模型渲染 `git show HEAD:` 的版本，输出到 `before/`。
 *
 * 用法：
 * ```bash
 * bun ops/checks/studio/render_glb.mjs --all-flagships --views front,iso,side
 * bun ops/checks/studio/render_glb.mjs --model sofa --mode slots
 * bun ops/checks/studio/render_glb.mjs --all-flagships --baseline
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { collectModelVariants, listModelFiles, modelsDir } from '../../../homeos/frontend/scripts/models/lib/glb-io.mjs'
import { loadDocument } from '../../../homeos/frontend/scripts/models/lib/model-document.mjs'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(hereDir, '../../..')
const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)
const valueOf = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

const SIZE = Number(valueOf('size') ?? 512)
const mode = valueOf('mode') ?? 'solid'
const views = (valueOf('views') ?? 'front,iso,side').split(',').map((view) => view.trim()).filter(Boolean)
const baseline = hasFlag('baseline')
// 三视图与槽位调试配色分开落盘：前者是「像不像」，后者是「槽位 ↔ 构件对不对」的证据。
const defaultOut = mode === 'slots'
  ? 'docs/architecture/2026-10-22/glb-slot-debug-renders'
  : 'docs/architecture/2026-10-22/glb-geometry-renders'
const outRoot = path.resolve(repoRoot, valueOf('out') ?? defaultOut)

const FLAGSHIPS = [
  'sofa', 'sofa-single', 'coffeetable', 'tvstand', 'bed', 'round-double-bed', 'wardrobe', 'cabinet',
  'nightstand', 'table', 'chair', 'tv_standard',
  'kitchen-island', 'fridge', 'washer', 'dryer', 'rangehood', 'microwave', 'dishwasher', 'exhaust-fan',
  'basin', 'toilet', 'bathtub', 'floor-lamp', 'airpurifier', 'car', 'stairs', 'steel-stairs',
  'plant-monstera', 'plant-palm',
]

const only = (valueOf('model')?.split(',') ?? []).map((id) => id.trim()).filter(Boolean)
const ids = hasFlag('all-flagships')
  ? FLAGSHIPS
  : hasFlag('all') || hasFlag('all-models')
    ? [...collectModelVariants(listModelFiles()).keys()].sort()
    : only
if (!ids.length) {
  console.log('用法：render_glb.mjs --all-models | --all-flagships | --model a,b [--mode solid|slots] [--views front,iso,side] [--baseline]')
  process.exit(0)
}

/** 槽位调试配色：色相环上均匀取样，保证相邻槽位不撞色。 */
function slotColor(index, total) {
  const hue = (index / Math.max(1, total)) * 360
  return hslToRgb(hue, 0.75, 0.55)
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const sector = Math.floor(h / 60) % 6
  const table = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector]
  return table.map((value) => Math.round((value + m) * 255))
}

function viewMatrix(view) {
  if (view === 'front') return (p) => [p[0], p[1], p[2]]
  if (view === 'side') return (p) => [p[2], p[1], p[0]]
  if (view === 'iso') {
    const yaw = -Math.PI / 4
    const pitch = -0.42
    return (p) => {
      const x = p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw)
      const z = -p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw)
      const y = p[1] * Math.cos(pitch) - z * Math.sin(pitch)
      const depth = p[1] * Math.sin(pitch) + z * Math.cos(pitch)
      return [x, y, depth]
    }
  }
  throw new Error(`未知视图 ${view}`)
}

/** 从 GLB 提取世界空间三角形 + 材质索引。 */
async function collectTriangles(filePath) {
  const doc = await loadDocument(filePath, { draco: true })
  const root = doc.getRoot()
  const materialNames = root.listMaterials().map((material) => material.getName())
  const colors = root.listMaterials().map((material) => material.getBaseColorFactor?.() ?? [1, 1, 1, 1])
  const triangles = []
  for (const node of root.listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    const matrix = Array.from(m)
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION')
      const index = primitive.getIndices()
      if (!position) continue
      const positions = position.getArray()
      const indices = index ? index.getArray() : null
      const material = primitive.getMaterial()
      const slot = material ? root.listMaterials().indexOf(material) : -1
      const count = indices ? indices.length : positions.length / 3
      const point = (vertex) => {
        const x = positions[vertex * 3]
        const y = positions[vertex * 3 + 1]
        const z = positions[vertex * 3 + 2]
        return [
          matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
          matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
          matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
        ]
      }
      for (let i = 0; i < count; i += 3) {
        const a = indices ? indices[i] : i
        const b = indices ? indices[i + 1] : i + 1
        const c = indices ? indices[i + 2] : i + 2
        triangles.push({ points: [point(a), point(b), point(c)], slot })
      }
    }
  }
  return { triangles, materialCount: materialNames.length, colors, materialNames }
}

function render(triangles, { view, materialCount, colors, slotMode }) {
  const project = viewMatrix(view)
  const projected = triangles.map((triangle) => ({
    slot: triangle.slot,
    points: triangle.points.map(project),
  }))
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const triangle of projected) {
    for (const point of triangle.points) {
      minX = Math.min(minX, point[0])
      maxX = Math.max(maxX, point[0])
      minY = Math.min(minY, point[1])
      maxY = Math.max(maxY, point[1])
    }
  }
  const spanX = Math.max(1e-6, maxX - minX)
  const spanY = Math.max(1e-6, maxY - minY)
  const scale = (SIZE * 0.9) / Math.max(spanX, spanY)
  const offsetX = SIZE / 2 - ((minX + maxX) / 2) * scale
  const offsetY = SIZE / 2 + ((minY + maxY) / 2) * scale

  const data = Buffer.alloc(SIZE * SIZE * 4)
  const depth = new Float32Array(SIZE * SIZE).fill(-Infinity)
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    data[i * 4] = 24
    data[i * 4 + 1] = 26
    data[i * 4 + 2] = 30
    data[i * 4 + 3] = 255
  }

  const light = [0.35, 0.82, 0.45]
  const lightLength = Math.hypot(...light)
  for (const triangle of projected) {
    const [p0, p1, p2] = triangle.points.map((point) => [
      point[0] * scale + offsetX,
      offsetY - point[1] * scale,
      point[2],
    ])
    const minPX = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])))
    const maxPX = Math.min(SIZE - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])))
    const minPY = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])))
    const maxPY = Math.min(SIZE - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])))
    if (minPX > maxPX || minPY > maxPY) continue
    // 面法线（世界空间）
    const ax = triangle.points[1][0] - triangle.points[0][0]
    const ay = triangle.points[1][1] - triangle.points[0][1]
    const az = triangle.points[1][2] - triangle.points[0][2]
    const bx = triangle.points[2][0] - triangle.points[0][0]
    const by = triangle.points[2][1] - triangle.points[0][1]
    const bz = triangle.points[2][2] - triangle.points[0][2]
    let nx = ay * bz - az * by
    let ny = az * bx - ax * bz
    let nz = ax * by - ay * bx
    const length = Math.hypot(nx, ny, nz) || 1
    nx /= length
    ny /= length
    nz /= length
    const lambert = Math.max(0, (nx * light[0] + ny * light[1] + nz * light[2]) / lightLength)
    const shade = 0.35 + 0.65 * lambert
    const base = slotMode
      ? slotColor(triangle.slot < 0 ? materialCount : triangle.slot, materialCount + 1)
      : (colors[triangle.slot] ?? [0.8, 0.8, 0.8]).slice(0, 3).map((value) => Math.round(Math.min(1, value) * 255))
    const color = base.map((value) => Math.min(255, Math.round(value * shade)))

    const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
    if (Math.abs(area) < 1e-9) continue
    for (let py = minPY; py <= maxPY; py += 1) {
      for (let px = minPX; px <= maxPX; px += 1) {
        const w0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area
        const w1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area
        const w2 = 1 - w0 - w1
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue
        const z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2]
        const index = py * SIZE + px
        if (z <= depth[index]) continue
        depth[index] = z
        data[index * 4] = color[0]
        data[index * 4 + 1] = color[1]
        data[index * 4 + 2] = color[2]
      }
    }
  }
  return data
}

function writePng(filePath, data) {
  const png = new PNG({ width: SIZE, height: SIZE })
  data.copy(png.data)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, PNG.sync.write(png))
}

/** HEAD 版本的临时文件：`git show` 出来的 GLB 直接落盘给 loadDocument 读。 */
function baselineFile(fullPath) {
  const relative = path.relative(modelsDir, fullPath).split(path.sep).join('/')
  try {
    const buffer = execFileSync('git', ['show', `HEAD:homeos/frontend/public/static/3d-studio/models/${relative}`], {
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const target = path.join('/tmp/glb-render-baseline', relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, buffer)
    return target
  } catch {
    return null
  }
}

const variants = collectModelVariants(listModelFiles())
const summary = []
for (const id of ids) {
  const entry = variants.get(id)
  if (!entry?.full) {
    summary.push({ id, skipped: '没有完整件' })
    continue
  }
  const fullPath = path.join(modelsDir, entry.full)
  const stages = []
  if (baseline) {
    const headPath = baselineFile(fullPath)
    if (headPath) stages.push({ stage: 'before', filePath: headPath })
  }
  stages.push({ stage: 'after', filePath: fullPath })
  for (const { stage, filePath } of stages) {
    const { triangles, materialCount, colors } = await collectTriangles(filePath)
    for (const view of views) {
      const data = render(triangles, { view, materialCount, colors, slotMode: mode === 'slots' })
      const target = path.join(
        outRoot,
        mode === 'slots' ? `${id}-${view}.png` : `${id}-${stage}-${view}.png`,
      )
      writePng(target, data)
    }
    summary.push({ id, stage, triangles: triangles.length, views })
  }
}

console.log(JSON.stringify({ out: path.relative(repoRoot, outRoot), mode, size: SIZE, models: summary }, null, 2))
