#!/usr/bin/env node
/**
 * 平面多边形布尔内核的不变量检查（只读）。
 *
 * 为什么需要它
 * ------------
 * `plan/geometry.ts` 里的并集 / 差集 / 墙合并是 3D 户型绘制的地基：地板轮廓、庭院挖洞、
 * 房间连通性都建立在它的输出上。它**完全没有可执行的验证** —— 仓库在 894792037 用静态检查
 * 替代了测试，而静态检查看不见「两个矩形相减之后面积算错」这类错误。于是任何一次改动
 * （包括想把它换成成熟库）都只能靠目测，这正是不敢替换它的原因。
 *
 * 本脚本给这块地基补一张安全网，并且刻意**不**走「录制当前输出当基线」的路线：
 * 那种基线只会锁住现状（连 bug 一起锁）。这里断言的是**任何正确的布尔内核都必须满足的
 * 数学性质**，因此它既能拦住回归，也能用来评判一个候选实现是否可替换。
 *
 * 断言的性质
 * ----------
 * - 空集恒等：`union([])` 为空；`subtract(A, [])` 与 A 等价；
 * - 幂等：`union(A, A)` 与 A 等价（面积与环数都不变）；
 * - 面积守恒：不相交并集 = 各面积之和；相交并集 = 容斥公式；
 * - 洞语义：`subtract(A, 内洞)` 的外环面积 = A，净面积 = A − 洞，且恰有一个负环；
 * - 湮灭：`subtract(A, A)` 为空；`subtract(A, 外部)` 与 A 等价；
 * - 交换性：`union(A, B)` 与 `union(B, A)` 净面积相同；
 * - 单调与次可加：max ≤ 并集 ≤ 求和；
 * - 点归属：A 内部点必在并集内部；洞内部点不在差集内部。
 *
 * 环的符号约定（由 `polygonArea` 的符号给出）：外环为正、洞为负，所以「净面积」是
 * 各环有符号面积之和 —— 这条约定本身也在断言里（洞若被当成外环，净面积会偏大）。
 *
 * 怎么加载内核：`geometry.ts` 用的是无扩展名相对导入，原生 Node ESM 解析不了；用仓库
 * 已有的 `esbuild`（devDependency，不新增依赖）打成一个临时 ESM 再 import。
 *
 * 用法
 * ----
 *     node ops/checks/plan-geometry-invariants.mjs            # 校验当前实现（CI / 门禁）
 *     node ops/checks/plan-geometry-invariants.mjs --json     # 机器可读
 *     node ops/checks/plan-geometry-invariants.mjs --keep     # 保留打包产物，便于调试
 *     node ops/checks/plan-geometry-invariants.mjs --entry <file>
 *
 * `--entry` 让同一组不变量去评判**候选实现**：替换内核前先把它按同样的导出形状写好，
 * 用这条命令跑一遍，全绿才有资格进入对比。这是「不敢替换」到「敢替换」之间缺的那一步。
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const args = process.argv.slice(2)
const AS_JSON = args.includes('--json')
const KEEP = args.includes('--keep')
const entryIndex = args.indexOf('--entry')
const ENTRY_OVERRIDE = entryIndex >= 0 ? args[entryIndex + 1] : null

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const ENTRY = ENTRY_OVERRIDE
  ? path.resolve(REPO_ROOT, ENTRY_OVERRIDE)
  : path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/3d-studio/plan/geometry.ts')
/** 面积比较的容差：内核自己的默认 tolerance 是 1e-6，判定放宽到 1e-6 的相对量级。 */
const AREA_EPSILON = 1e-6

const failures = []
let assertions = 0

function check(label, condition, detail = '') {
  assertions += 1
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
}

function nearlyEqual(left, right, epsilon = AREA_EPSILON) {
  return Math.abs(left - right) <= epsilon * Math.max(1, Math.abs(left), Math.abs(right))
}

/** 净面积：外环为正、洞为负，直接求和。 */
function netArea(geometry, loops) {
  return loops.reduce((total, loop) => total + geometry.polygonArea(loop), 0)
}

/** 点是否在「实体区域」内：落在任一正环内，且不落在任何负环内。 */
function containsPoint(geometry, loops, point) {
  const insidePositive = loops
    .filter((loop) => geometry.polygonArea(loop) > 0)
    .some((loop) => geometry.pointInPolygon(point, loop))
  if (!insidePositive) return false
  const insideHole = loops
    .filter((loop) => geometry.polygonArea(loop) < 0)
    .some((loop) => geometry.pointInPolygon(point, loop))
  return !insideHole
}

/** 轴对齐正方形（逆时针，正面积）。 */
function square(x, y, size) {
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ]
}

async function loadKernel() {
  const outfile = path.join(os.tmpdir(), `homeos-plan-geometry-${process.pid}.mjs`)
  await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile,
    logLevel: 'silent',
  })
  const module = await import(`${outfile}?v=${Date.now()}`)
  if (!KEEP) fs.rmSync(outfile, { force: true })
  return module
}

const geometry = await loadKernel()
const { validatedUnionPolygonLoops: union, subtractPolygonLoops: subtract, polygonArea } = geometry

// ── 空集恒等 ─────────────────────────────────────────────────────────────
const A = square(0, 0, 2)
const areaA = polygonArea(A)
check('正方形面积为 4', nearlyEqual(areaA, 4), `得到 ${areaA}`)
check('union([]) 为空', union([]).length === 0, `得到 ${union([]).length} 个环`)

const singleUnion = union([A])
check('union([A]) 只有一个环', singleUnion.length === 1, `得到 ${singleUnion.length}`)
check('union([A]) 净面积不变', nearlyEqual(netArea(geometry, singleUnion), areaA))

const emptySubtract = subtract([A], [])
check('subtract(A, []) 与 A 等价（环数）', emptySubtract.length === 1, `得到 ${emptySubtract.length}`)
check('subtract(A, []) 净面积不变', nearlyEqual(netArea(geometry, emptySubtract), areaA))

// ── 幂等 ─────────────────────────────────────────────────────────────────
const duplicated = union([A, A])
check('union(A, A) 只有一个环', duplicated.length === 1, `得到 ${duplicated.length}`)
check('union(A, A) 净面积不变（幂等）', nearlyEqual(netArea(geometry, duplicated), areaA))

// ── 面积守恒：不相交 / 相交 ───────────────────────────────────────────────
const disjointA = square(0, 0, 2)
const disjointB = square(5, 5, 1)
const disjointUnion = union([disjointA, disjointB])
check('不相交并集有 2 个环', disjointUnion.length === 2, `得到 ${disjointUnion.length}`)
check(
  '不相交并集净面积 = 和',
  nearlyEqual(netArea(geometry, disjointUnion), 5),
  `得到 ${netArea(geometry, disjointUnion)}`,
)

const overlapA = square(0, 0, 2)
const overlapB = square(1, 1, 2)
const overlapUnion = union([overlapA, overlapB])
check('相交并集有 1 个外环', overlapUnion.length === 1, `得到 ${overlapUnion.length}`)
check(
  '相交并集净面积 = 容斥公式',
  nearlyEqual(netArea(geometry, overlapUnion), 7),
  `得到 ${netArea(geometry, overlapUnion)}`,
)

// ── 交换性 / 单调 / 次可加 ───────────────────────────────────────────────
const reversedUnion = union([overlapB, overlapA])
check('并集净面积与参数顺序无关', nearlyEqual(netArea(geometry, overlapUnion), netArea(geometry, reversedUnion)))
check(
  '并集净面积不小于任一输入',
  netArea(geometry, overlapUnion) >= areaA - AREA_EPSILON,
  `得到 ${netArea(geometry, overlapUnion)}`,
)
check(
  '并集净面积不超过输入之和（次可加）',
  netArea(geometry, overlapUnion) <= 8 + AREA_EPSILON,
  `得到 ${netArea(geometry, overlapUnion)}`,
)

// ── 洞语义 ───────────────────────────────────────────────────────────────
const holeSquare = square(0.5, 0.5, 1)
const holed = subtract([A], [holeSquare])
check('挖洞后有两个环（外环 + 洞）', holed.length === 2, `得到 ${holed.length}`)
const positiveLoops = holed.filter((loop) => polygonArea(loop) > 0)
const negativeLoops = holed.filter((loop) => polygonArea(loop) < 0)
check('挖洞后恰有一个正环', positiveLoops.length === 1, `得到 ${positiveLoops.length}`)
check('挖洞后恰有一个负环（洞必须是负面积）', negativeLoops.length === 1, `得到 ${negativeLoops.length}`)
check('外环面积等于原面积', positiveLoops.length === 1 && nearlyEqual(polygonArea(positiveLoops[0]), areaA))
check('挖洞后净面积 = 原面积 - 洞面积', nearlyEqual(netArea(geometry, holed), 3), `得到 ${netArea(geometry, holed)}`)

// ── 湮灭与无操作 ─────────────────────────────────────────────────────────
const annihilated = subtract([A], [A])
check('subtract(A, A) 为空', annihilated.length === 0, `得到 ${annihilated.length} 个环`)

const outsideCut = subtract([A], [square(5, 5, 1)])
check('subtract(A, 外部) 与 A 等价（净面积）', nearlyEqual(netArea(geometry, outsideCut), areaA))
check(
  'subtract(A, 外部) 不产生洞',
  outsideCut.every((loop) => polygonArea(loop) > 0),
)

const partialCut = subtract([A], [overlapB])
check('减去相交块净面积 = 差', nearlyEqual(netArea(geometry, partialCut), 3), `得到 ${netArea(geometry, partialCut)}`)

// ── 点归属一致性 ─────────────────────────────────────────────────────────
check('A 的中心在 A 内', geometry.pointInPolygon({ x: 1, y: 1 }, A))
check('A 之外的点不在 A 内', !geometry.pointInPolygon({ x: 3, y: 3 }, A))
check('A 的中心在并集内', containsPoint(geometry, overlapUnion, { x: 1, y: 1 }))
check('洞里的点不在差集内', !containsPoint(geometry, holed, { x: 1, y: 1 }), '洞被当成实体了')
check('差集实体内的点仍在差集内', containsPoint(geometry, holed, { x: 0.25, y: 0.25 }))

// ── 墙段拆分与合并：总长守恒 ───────────────────────────────────────────────
/**
 * 这两支函数喂给地板轮廓：拆分的目的是让相交点成为共享顶点，合并的目的是把端点相接的共线
 * 墙缝成一条。它们的共同不变量是**总长守恒** —— 拆分不得凭空增长或丢失长度，合并不得把
 * 重叠部分重复计入。长度一旦漂移，地板多边形就会与墙体对不齐（表现为「地板边缘露出墙外」
 * 或「墙脚缺一条缝」），而且这类误差会随编辑次数累积。
 */
function segmentLength(segment) {
  return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y)
}
const segment = (x1, y1, x2, y2) => ({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 } })
const totalLength = (segments) => segments.reduce((total, item) => total + segmentLength(item), 0)

const crossingPair = [segment(0, 0, 4, 0), segment(2, -2, 2, 2)]
const splitPieces = geometry.splitWallSegments(crossingPair)
check('交叉墙段被拆成 4 段', splitPieces.length === 4, `得到 ${splitPieces.length}`)
check(
  '拆分不改变总长',
  nearlyEqual(totalLength(splitPieces), totalLength(crossingPair)),
  `${totalLength(splitPieces)} vs ${totalLength(crossingPair)}`,
)
check(
  '拆分后每段长度为正',
  splitPieces.every((piece) => segmentLength(piece) > 0),
)
check(
  '拆分后各段不跨越交点（t 区间落在 [0,1]）',
  splitPieces.every((piece) => piece.startT >= 0 && piece.endT <= 1 + 1e-9),
)

const collinearOverlap = [segment(0, 0, 2, 0), segment(1, 0, 3, 0), segment(3, 0, 5, 0)]
const mergedWalls = geometry.mergeCollinearWallSegments(collinearOverlap).walls
check(
  '合并不改变总长（重叠部分不得被重复计入）',
  nearlyEqual(totalLength(mergedWalls), totalLength(collinearOverlap)),
  `${totalLength(mergedWalls)} vs ${totalLength(collinearOverlap)}`,
)
check('合并后段数减少', mergedWalls.length < collinearOverlap.length, `得到 ${mergedWalls.length}`)
check(
  '合并幂等',
  JSON.stringify(geometry.mergeCollinearWallSegments(mergedWalls).walls) === JSON.stringify(mergedWalls),
)

const joinedPair = [segment(0, 0, 2, 0), segment(2, 0, 4, 0)]
const joined = geometry.mergeCollinearWallSegments(joinedPair).walls
check('端点相接的共线墙被缝成一条', joined.length === 1, `得到 ${joined.length}`)
check('缝成一条后总长不变', joined.length === 1 && nearlyEqual(segmentLength(joined[0]), 4))

const perpendicularPair = [segment(0, 0, 2, 0), segment(0, 0, 0, 2)]
check('非共线墙段不合并', geometry.mergeCollinearWallSegments(perpendicularPair).walls.length === 2)
check(
  '退化墙段（零长度）被丢弃',
  geometry.mergeCollinearWallSegments([segment(0, 0, 0, 0), segment(0, 0, 1, 0)]).walls.length === 1,
)

// ── 多边形规范化键 ───────────────────────────────────────────────────────
const triangle = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
]
const rotated = [triangle[1], triangle[2], triangle[0]]
const reversedTriangle = [...triangle].reverse()
check('规范化键与起点无关', geometry.canonicalPolygonKey(triangle) === geometry.canonicalPolygonKey(rotated))
check('规范化键与绕向无关', geometry.canonicalPolygonKey(triangle) === geometry.canonicalPolygonKey(reversedTriangle))

// ── 退化输入不得抛出 ─────────────────────────────────────────────────────
for (const [label, loops] of [
  [
    '少于三个顶点的环',
    [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    ],
  ],
  [
    '零面积环',
    [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
    ],
  ],
  ['null 元素', [null]],
]) {
  try {
    union(loops)
    check(`退化输入（${label}）被丢弃而不是抛出`, true)
  } catch (error) {
    check(`退化输入（${label}）被丢弃而不是抛出`, false, String(error))
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ assertions, failures }, null, 2))
} else if (failures.length > 0) {
  console.error(`多边形内核不变量失败：${failures.length} / ${assertions} 项不成立`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('  说明：这些是布尔运算的数学性质，任何正确实现都应满足；失败即表示内核行为已改变。')
} else {
  console.log(
    `多边形内核不变量通过：${assertions} 项断言（空集恒等 / 幂等 / 面积守恒 / 洞语义 / 交换性 / 点归属 / 墙段总长守恒）`,
  )
}

process.exit(failures.length > 0 ? 1 : 0)
