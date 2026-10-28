/**
 * 半圆柱截面矫正：把「半椭圆」拉回「真半圆」。
 *
 * 背景：`半圆柱.glb` 自 0.5.2.1 入库起，截面就是**半椭圆**——宽 0.45、深 0.45，
 * 即 `(x/0.225)² + ((z+0.225)/0.45)² = 1`，深度等于直径而不是半径。于是它看起来像
 * 一根被压扁的桶，而不是贴着墙的半圆柱。根因是这份资产当初按 `buildPillarOutline()`
 * 在 `width = depth = 0.45` 的方形占位框里烘焙（圆弧半径取了 `depth`），而真半圆的
 * 深度只能是半宽。
 *
 * 做法：不做拓扑重建，只沿 Z 做 0.5 的缩放（法线按逆转置 ×2 后归一）。半椭圆
 * `(x/r)² + ((z+r)/2r)² = 1` 在 `z' = z/2` 之后正好变成半径 r 的正圆
 * `(x/r)² + ((z'+r/2)/(r/2))² = 1`（r = 0.225），平背面从 z=-0.225 落到 z=-0.1125。
 * 好处：顶点/索引/UV/节点名/材质名/面数全部不动，只有 POSITION 与 NORMAL 变，
 * 槽位契约与三角面基线都不需要重编。
 *
 * lite 由新完整件按仓库既有流程重出（`writeLiteFrom`，Draco + 包围盒漂移断言）。
 *
 * 2026-10-28 之后这份资产已经**跑过本脚本、又做过原点归心**
 * （`recenter-pillar-arc.mjs`：原点从包围盒中心挪到圆弧圆心）。所以：
 * - 再跑本脚本会直接在「已经是真半圆」处退出（截面判定只看深度/半宽之比，与原点无关）；
 * - 万一以后又要走下面这条 squash 路径，它是绕 z=0 缩放的、只在归心**之前**的原点成立，
 *   跑完必须接着跑 `recenter-pillar-arc.mjs --write` 把圆心送回原点。
 *
 * 用法（仓库根目录）：
 *   bun homeos/frontend/scripts/models/reshape-pillar-semicircle.mjs           # dry-run
 *   bun homeos/frontend/scripts/models/reshape-pillar-semicircle.mjs --write    # 落盘
 */
import path from 'node:path'
import { collectModelVariants, listModelFiles, modelsDir, round } from './lib/glb-io.mjs'
import { loadDocument, worldBounds, writeDocument } from './lib/model-document.mjs'
import { writeLiteFrom } from './lib/model-builder.mjs'

const MODEL_ID = 'pillar-semicircle'
/**
 * 目标：半径 0.225（宽 0.45），与 x 轴同尺度，深度 = 半径。
 * 现有半椭圆的 Z 半轴 = 2 × 半径，缩到半径就是 0.5，所以只留缩放比、不留半径常量。
 */
const DEPTH_SCALE = 0.5
const TOLERANCE = 1e-3
const write = process.argv.slice(2).includes('--write')

/**
 * 逐 primitive 的截面判定：现有截面是半椭圆 / 真半圆 / 都不是。
 *
 * 半宽按该 primitive 自己的 X 极值取——底座与压顶比柱身各内缩 2mm（`0.223` 对 `0.225`），
 * 是刻意留的工艺缝，不是退化；判定只看「形状是不是同一族」。
 *
 * 判定只看**深度与半宽之比**（平背面永远在 minZ、圆弧朝 +Z，与原点落在哪里无关）：
 * 真半圆的深度 = 半宽，半椭圆的深度 = 2 × 半宽。以前这里按「以 z=0 为中心的椭圆方程」
 * 逐点算残差，2026-10-28 原点归心（`recenter-pillar-arc.mjs`）之后那套方程就不再成立了。
 */
function sectionOf(primitive) {
  const position = primitive.getAttribute('POSITION')
  const array = position.getArray()
  const size = position.getElementSize()
  const points = []
  for (let index = 0; index < array.length; index += size) {
    points.push([array[index], array[index + 2]])
  }
  const halfWidth = Math.max(...points.map(([x]) => Math.abs(x)))
  const minZ = Math.min(...points.map(([, z]) => z))
  const maxZ = Math.max(...points.map(([, z]) => z))
  const depth = maxZ - minZ
  return {
    halfWidth,
    minZ,
    maxZ,
    depth,
    // 深度 = 半宽 → 真半圆；深度 = 2 × 半宽 → 半椭圆。
    worstCircle: Math.abs(depth - halfWidth),
    worstEllipse: Math.abs(depth - 2 * halfWidth),
  }
}

/** 沿 Z 缩 0.5；法线用逆转置 diag(1,1,2) 后归一。 */
function squashDepth(primitive) {
  const position = primitive.getAttribute('POSITION')
  const array = Float32Array.from(position.getArray())
  for (let index = 0; index < array.length; index += 3) array[index + 2] *= DEPTH_SCALE
  position.setArray(array)

  const normal = primitive.getAttribute('NORMAL')
  if (!normal) return
  const normals = Float32Array.from(normal.getArray())
  for (let index = 0; index < normals.length; index += 3) {
    const x = normals[index]
    const y = normals[index + 1]
    const z = normals[index + 2] * (1 / DEPTH_SCALE)
    const length = Math.hypot(x, y, z) || 1
    normals[index] = x / length
    normals[index + 1] = y / length
    normals[index + 2] = z / length
  }
  normal.setArray(normals)
}

const variants = collectModelVariants(listModelFiles()).get(MODEL_ID)
if (!variants?.full) throw new Error(`没找到 ${MODEL_ID} 的完整件`)
const fullPath = path.join(modelsDir, variants.full)
const litePath = variants.lite ? path.join(modelsDir, variants.lite) : null

const document = await loadDocument(fullPath)
const before = worldBounds(document)
const identityNodes = document
  .getRoot()
  .listNodes()
  .filter((node) => node.getMesh() && node.getMatrix().some((value, index) => value !== [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1][index]))
if (identityNodes.length) {
  throw new Error(`节点 ${identityNodes.map((node) => node.getName()).join(',')} 带变换，脚本按局部坐标改写会错位`)
}

const primitives = document
  .getRoot()
  .listNodes()
  .flatMap((node) => (node.getMesh() ? node.getMesh().listPrimitives() : []))
const sections = primitives.map((primitive) => sectionOf(primitive))
const worstEllipse = Math.max(...sections.map((section) => section.worstEllipse))
const worstCircle = Math.max(...sections.map((section) => section.worstCircle))
const alreadyCircle = worstCircle <= TOLERANCE
const isEllipse = worstEllipse <= TOLERANCE

console.log(`[半圆柱] ${variants.full}`)
console.log(`  包围盒 ${before.size.map((value) => round(value, 4)).join(' × ')}`)
for (const section of sections) {
  console.log(
    `  截面 halfWidth=${round(section.halfWidth, 4)} z=[${round(section.minZ, 4)}, ${round(section.maxZ, 4)}]` +
      ` 残差 半椭圆 ${section.worstEllipse.toExponential(2)} / 真半圆 ${section.worstCircle.toExponential(2)}`,
  )
}
if (alreadyCircle) {
  console.log('  已经是真半圆，跳过')
  process.exit(0)
}
if (!isEllipse) throw new Error('现有截面既不是半椭圆也不是真半圆，拒绝按定量口径改写')

if (!write) {
  console.log(`  dry-run：将把 Z 缩到 ${DEPTH_SCALE}×，预期包围盒 0.45 × 2.8 × 0.225`)
  process.exit(0)
}

for (const primitive of primitives) squashDepth(primitive)
await writeDocument(document, fullPath)
const after = worldBounds(document)
console.log(`  写完整件：包围盒 ${after.size.map((value) => round(value, 4)).join(' × ')}`)
document.getRoot().dispose?.()

if (litePath) {
  await writeLiteFrom(fullPath, litePath)
  console.log(`  重出 lite：${variants.lite}`)
}
