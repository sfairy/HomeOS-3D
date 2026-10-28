/**
 * 柱体原点归心：把「半圆柱 / 四分之一圆柱」的原点从包围盒中心挪到圆弧圆心。
 *
 * ## 为什么要改
 *
 * 这两款都是**弧面贴靠件**，运行期 `preserveOrigin: true`（`_shared.ts` 的
 * `createPillarAssetDescriptor`），原点就是摆放锚点、也是绕 Y 旋转的轴：
 *
 * - 半圆柱贴墙放，平背面（直径面）就是墙线。原模型原点在包围盒中心，即墙线**前**
 *   112.5mm；绕原点旋转时平背面一会儿扎进墙里、一会儿离开墙，越转越歪。
 * - 四分之一圆柱是转角件，两块平背面在包围盒的 -X / -Z 面上，圆弧圆心在
 *   `(-0.225, -0.225)` 那个角上。原点却是包围盒中心，离真正的转角点 318mm。
 *
 * 圆心放到 (0, 0) 之后：贴墙件绕墙线转、转角件绕墙角转，锚点与几何终于重合。
 *
 * ## 口径
 *
 * - 只平移 POSITION 的 X/Z，**法线不动**（纯平移不改变法线），Y 不动，底面仍落在 y=0。
 * - 平移量取 `body` 槽位的圆心：柱础 / 柱帽按设计各内缩 2mm（基准 0.223 对 0.225），
 *   它们的圆心本来就偏 2mm，整件按同一位移搬，工艺缝保持不变。
 * - 纯平移不改变包围盒尺寸，`model-specs.json` 的 `size`、运行期 `scaleBasis`
 *   与 `geometry-baseline.json` 都不需要改。
 * - 半径用最小二乘之外的**外接圆判定**：候选圆心取包围盒的 3×3 网格点，取「最外圈顶点
 *   到圆心距离的极差最小」的那个。真圆心下圆弧顶点全部落在同一半径上（极差 ≈ 0），
 *   包围盒中心这类错解会让圆弧上只有一两个点碰到外接圆，极差明显 > 0。
 *
 * ## 用法（仓库根目录）
 *
 *   bun homeos/frontend/scripts/models/recenter-pillar-arc.mjs           # dry-run
 *   bun homeos/frontend/scripts/models/recenter-pillar-arc.mjs --write    # 落盘（并重出 lite）
 */
import path from 'node:path'
import { collectModelVariants, listModelFiles, modelsDir, round } from './lib/glb-io.mjs'
import { loadDocument, writeDocument, worldBounds } from './lib/model-document.mjs'
import { writeLiteFrom } from './lib/model-builder.mjs'

/** 待归心的柱形；`pillar_round` 的包围盒中心本来就是圆心，方柱没有圆心。 */
const MODELS = [
  { id: 'pillar-semicircle', label: '半圆柱' },
  { id: 'pillar-quarter', label: '四分之一圆柱' },
]
/** 判定「顶点落在外接圆上」的距离容差（米）。顶点是毫米级烘焙的，0.2mm 足够严。 */
const RING_TOLERANCE = 2e-4
/** 圆弧至少要有这么多条竖棱落在同一半径上，才算认出了圆心。 */
const MIN_RING_VERTICES = 5
/** 柱础 / 柱帽相对柱身的内缩上限（米）；超过就说明不是「同一根柱子」的同心件。 */
const INSET_LIMIT = 0.01
/** 判定「已经归心」的位移阈值（米）。 */
const CENTERED_EPSILON = 1e-6
const write = process.argv.slice(2).includes('--write')

/** primitive 的截面点（只取 X/Z）。 */
function sectionPoints(primitive) {
  const position = primitive.getAttribute('POSITION')
  const array = position.getArray()
  const size = position.getElementSize()
  const points = []
  for (let index = 0; index < array.length; index += size) {
    points.push({ x: array[index], z: array[index + 2] })
  }
  return points
}

function sectionBounds(points) {
  const xs = points.map((point) => point.x)
  const zs = points.map((point) => point.z)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

/**
 * 圆弧圆心判定：候选圆心取包围盒的 3×3 网格点（角点 / 边中点 / 中心），
 * 取「落在同一外接圆上的顶点最多」的那个。
 *
 * 为什么用计数而不是「最小残差」：四分之一圆柱在真圆心处还有一个顶点**就在圆心**
 * （两片平背面相交的竖棱），任何「最内圈离圆心越近越好」的度量都会反过来选错。
 * 真圆心下圆弧上十几条竖棱全落在同一半径上；包围盒中心之类的错解只有一两条对角的
 * 顶点够得到外接圆 —— 计数区分度足够，也顺手给出半径。
 */
function circleOf(points, bounds) {
  const xs = [bounds.minX, (bounds.minX + bounds.maxX) / 2, bounds.maxX]
  const zs = [bounds.minZ, (bounds.minZ + bounds.maxZ) / 2, bounds.maxZ]
  let best = null
  for (const x of xs) {
    for (const z of zs) {
      const distances = points.map((point) => Math.hypot(point.x - x, point.z - z))
      const radius = Math.max(...distances)
      const onRing = distances.filter((distance) => radius - distance <= RING_TOLERANCE).length
      // 同一半径上的顶点数相同时，取半径更小的解（避免用「对角两点」凑出的大圆）。
      if (!best || onRing > best.onRing || (onRing === best.onRing && radius < best.radius)) {
        best = { x, z, radius, onRing }
      }
    }
  }
  return best
}

/** 把 primitive 的顶点整体平移 (dx, dz)；法线不参与（纯平移）。 */
function translatePrimitive(primitive, dx, dz) {
  const position = primitive.getAttribute('POSITION')
  const array = Float32Array.from(position.getArray())
  for (let index = 0; index < array.length; index += 3) {
    array[index] += dx
    array[index + 2] += dz
  }
  position.setArray(array)
}

function assertIdentityNodes(document, label) {
  const transformed = document
    .getRoot()
    .listNodes()
    .filter(
      (node) =>
        node.getMesh() &&
        node.getMatrix().some((value, index) => value !== [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][index]),
    )
  if (transformed.length) {
    throw new Error(`${label} 的节点 ${transformed.map((node) => node.getName()).join(',')} 带变换，脚本按局部坐标改写会错位`)
  }
}

const variants = collectModelVariants(listModelFiles())

for (const model of MODELS) {
  const entry = variants.get(model.id)
  if (!entry?.full) throw new Error(`没找到 ${model.id} 的完整件`)
  const fullPath = path.join(modelsDir, entry.full)
  const litePath = entry.lite ? path.join(modelsDir, entry.lite) : null

  const document = await loadDocument(fullPath)
  assertIdentityNodes(document, model.label)
  const primitives = document
    .getRoot()
    .listNodes()
    .flatMap((node) => (node.getMesh() ? node.getMesh().listPrimitives() : []))
  const sections = primitives.map((primitive) => {
    const points = sectionPoints(primitive)
    const bounds = sectionBounds(points)
    return {
      primitive,
      points,
      bounds,
      circle: circleOf(points, bounds),
      name: primitive.getMaterial()?.getName() ?? '',
    }
  })
  const body = sections.find((section) => section.name.endsWith('-body')) ?? sections[0]
  const center = { x: body.circle.x, z: body.circle.z }
  const before = worldBounds(document)

  console.log(`\n[${model.label}] ${entry.full}`)
  console.log(
    `  包围盒 ${before.size.map((value) => round(value, 4)).join(' × ')}` +
      `  x=[${round(before.min[0], 4)}, ${round(before.max[0], 4)}]` +
      `  z=[${round(before.min[2], 4)}, ${round(before.max[2], 4)}]`,
  )
  for (const section of sections) {
    console.log(
      `  ${section.name}: 圆心 (${round(section.circle.x, 5)}, ${round(section.circle.z, 5)})` +
        ` 半径 ${round(section.circle.radius, 5)} 同圆顶点 ${section.circle.onRing}`,
    )
  }
  if (body.circle.onRing < MIN_RING_VERTICES) {
    throw new Error(
      `${body.name || 'body'} 的截面找不到圆弧（同圆顶点 ${body.circle.onRing} 个），拒绝按圆心归位`,
    )
  }
  for (const section of sections) {
    const offset = Math.hypot(section.circle.x - center.x, section.circle.z - center.z)
    if (offset > INSET_LIMIT) {
      throw new Error(`${section.name} 的圆心偏离柱身 ${round(offset, 4)}m（> ${INSET_LIMIT}），不是同心件`)
    }
    const radiusDelta = body.circle.radius - section.circle.radius
    if (radiusDelta < -1e-4 || radiusDelta > INSET_LIMIT) {
      throw new Error(`${section.name} 的半径 ${round(section.circle.radius, 4)} 与柱身不同族`)
    }
  }

  const dx = -center.x
  const dz = -center.z
  if (Math.abs(dx) <= CENTERED_EPSILON && Math.abs(dz) <= CENTERED_EPSILON) {
    console.log(`  已经是圆心原点，跳过`)
    document.getRoot().dispose?.()
    continue
  }
  console.log(`  平移 (${round(dx, 5)}, ${round(dz, 5)}) → 圆心落在 (0, 0)`)
  if (!write) {
    console.log(
      `  dry-run：预期包围盒 ${before.size.map((value) => round(value, 4)).join(' × ')}（不变）` +
        `，x=[${round(before.min[0] + dx, 4)}, ${round(before.max[0] + dx, 4)}]` +
        `，z=[${round(before.min[2] + dz, 4)}, ${round(before.max[2] + dz, 4)}]`,
    )
    document.getRoot().dispose?.()
    continue
  }

  for (const section of sections) translatePrimitive(section.primitive, dx, dz)
  await writeDocument(document, fullPath)
  document.getRoot().dispose?.()

  // 写回后重新量一遍：尺寸必须不变（纯平移），圆心必须回到 (0, 0)。
  const written = await loadDocument(fullPath)
  const after = worldBounds(written)
  const drift = after.size.map((value, axis) => Math.abs(value - before.size[axis]))
  if (Math.max(...drift) > 1e-5) {
    throw new Error(`${model.label} 写回后包围盒尺寸变了：${drift.map((value) => value.toExponential(2)).join('/')}`)
  }
  const writtenBodyCenter = circleOf(
    sectionPoints(
      written
        .getRoot()
        .listNodes()
        .filter((node) => node.getMesh())
        .flatMap((node) => node.getMesh().listPrimitives())
        .find((primitive) => (primitive.getMaterial()?.getName() ?? '').endsWith('-body')),
    ),
    {
      minX: after.min[0],
      maxX: after.max[0],
      minZ: after.min[2],
      maxZ: after.max[2],
    },
  )
  console.log(
    `  写完整件：包围盒 ${after.size.map((value) => round(value, 4)).join(' × ')}` +
      `  圆心 (${round(writtenBodyCenter.x, 5)}, ${round(writtenBodyCenter.z, 5)})`,
  )
  written.getRoot().dispose?.()

  if (litePath) {
    await writeLiteFrom(fullPath, litePath)
    console.log(`  重出 lite：${entry.lite}`)
  }
}
