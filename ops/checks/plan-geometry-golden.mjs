#!/usr/bin/env node
/**
 * 平面多边形布尔内核的黄金对比（只读，手动运行）。
 *
 * 为什么单独有这一份
 * -----------------
 * `check:plan-geometry` 断言的是**数学性质**（空集恒等 / 幂等 / 面积守恒…），它能拦住
 * 明显算错，但拦不住「结果仍然正确、但拓扑或顶点排布变了」。而 `courtyard-drawing.ts`
 * 把内核输出直接交给 `ShapeUtils.triangulateShape` 三角化，拓扑一变，地板的三角剖分
 * 与共享顶点就会变——这类差异只能靠「同一批输入，两套实现逐项对齐」发现。
 *
 * 本脚本因此不录制基线，而是**同时跑两套实现**：左边是仓库当前内核，右边是 `--entry`
 * 指向的候选实现。判定只看可观察结果，不看内部算法：
 *
 * - 净面积相对误差 ≤ 1e-6；
 * - 环数、外环数、洞数一致；
 * - 栅格点内外判定一致（跳过边界带，避免浮点噪点）；
 * - 下游三角化面积一致（真的调用 `ShapeUtils.triangulateShape`，与消费方同一条路径）。
 *
 * 输入来源
 * --------
 * - `ops/checks/fixtures/plan-geometry-corpus.json`：从真实草稿
 *   （`homeos/data/studio3d/draft.json`，未入库）抽取的 45 段墙 + 154 件家具几何快照。
 * - 一段固定种子的合成用例：贴边、共线重叠、角接触、挖洞、环中环、斜置矩形等
 *   —— 这些是两套实现最容易分歧的形状。
 *
 * 用法
 * ----
 *     node ops/checks/plan-geometry-golden.mjs --entry ops/checks/candidates/geometry-martinez.ts
 *     node ops/checks/plan-geometry-golden.mjs --entry <candidate> --verbose
 *
 * 退出码 0 表示候选与当前内核在上述四项上完全一致；否则逐条列出差异。
 * 注意：这是**候选评估工具**，不是回归门禁；当前内核的回归由 `check:plan-geometry` 负责。
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { ShapeUtils, Vector2 } from 'three'

const args = process.argv.slice(2)
const VERBOSE = args.includes('--verbose')
const seedIndex = args.indexOf('--seed')
const SEED = seedIndex >= 0 ? Number(args[seedIndex + 1]) || 1 : 20261114
const entryIndex = args.indexOf('--entry')
const ENTRY_OVERRIDE = entryIndex >= 0 ? args[entryIndex + 1] : null
const dumpIndex = args.indexOf('--dump')
const DUMP_MATCH = dumpIndex >= 0 ? args[dumpIndex + 1] : null

if (!ENTRY_OVERRIDE) {
  console.error('用法: node ops/checks/plan-geometry-golden.mjs --entry <候选实现.ts> [--verbose] [--seed N]')
  process.exit(2)
}

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const REFERENCE_ENTRY = path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/3d-studio/plan/geometry.ts')
const CANDIDATE_ENTRY = path.resolve(REPO_ROOT, ENTRY_OVERRIDE)
const FIXTURE = path.join(REPO_ROOT, 'ops/checks/fixtures/plan-geometry-corpus.json')

/** 面积 / 三角化面积的相对容差，与方案 §3 S7 的验收条件一致。 */
const AREA_EPSILON = 1e-6
/** 栅格采样：每轴格数（64×64 ≈ 4k 点/用例，足够发现拓扑差异且跑得动）。 */
const GRID_STEPS = 64

const failures = []
let comparisons = 0

function nearlyEqual(left, right, epsilon = AREA_EPSILON) {
  return Math.abs(left - right) <= epsilon * Math.max(1, Math.abs(left), Math.abs(right))
}

async function loadKernel(entry) {
  const outfile = path.join(os.tmpdir(), `homeos-golden-${process.pid}-${Math.random().toString(36).slice(2)}.mjs`)
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile,
    logLevel: 'silent',
  })
  const module = await import(`${outfile}?v=${Date.now()}`)
  fs.rmSync(outfile, { force: true })
  return module
}

// ── 几何构造 ─────────────────────────────────────────────────────────────
const RADIANS_PER_DEGREE = Math.PI / 180

function rotatedRectangle(centerX, centerY, width, depth, rotationDegrees) {
  const cos = Math.cos(rotationDegrees * RADIANS_PER_DEGREE)
  const sin = Math.sin(rotationDegrees * RADIANS_PER_DEGREE)
  const halfWidth = width / 2
  const halfDepth = depth / 2
  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([localX, localY]) => ({
    x: centerX + localX * cos - localY * sin,
    y: centerY + localX * sin + localY * cos,
  }))
}

function wallRectangle(wall) {
  const deltaX = wall.end.x - wall.start.x
  const deltaY = wall.end.y - wall.start.y
  const length = Math.hypot(deltaX, deltaY)
  if (!(length > 0)) return null
  return rotatedRectangle(
    (wall.start.x + wall.end.x) / 2,
    (wall.start.y + wall.end.y) / 2,
    length,
    Math.max(wall.thickness || 0.2, 1e-3),
    (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
  )
}

function itemRectangle(item) {
  if (!(item.width > 0) || !(item.depth > 0)) return null
  return rotatedRectangle(item.x, item.y, item.width, item.depth, item.rotation || 0)
}

function boundingLoop(loops) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const loop of loops)
    for (const point of loop) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  if (!Number.isFinite(minX)) return []
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
}

/** 轴对齐正方形（左下角 + 边长）：复用旋转矩形，避免两处脚本各写一份顶点顺序。 */
function square(x, y, size) {
  return rotatedRectangle(x + size / 2, y + size / 2, size, size, 0)
}

/** 固定种子的线性同余，保证同一 `--seed` 下用例完全可复现。 */
function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const random = createRandom(SEED)
const randomInteger = (min, max) => min + Math.floor(random() * (max - min + 1))
const pick = (items, count) => {
  const pool = [...items]
  const picked = []
  while (picked.length < count && pool.length > 0) picked.push(pool.splice(randomInteger(0, pool.length - 1), 1)[0])
  return picked
}

// ── 用例集 ───────────────────────────────────────────────────────────────
const cases = []

function addUnionCase(name, loops) {
  cases.push({ name, kind: 'union', loops })
}

function addSubtractCase(name, targets, holes) {
  cases.push({ name, kind: 'subtract', targets, holes })
}

// 合成用例：贴边 / 共线 / 角接触 / 斜置 / 挖洞 / 环中环。
addUnionCase('合成：两个不相交正方形', [square(0, 0, 2), square(5, 5, 1)])
addUnionCase('合成：两个重叠正方形', [square(0, 0, 2), square(1, 1, 2)])
addUnionCase('合成：共享整条边（应合并为一个环）', [square(0, 0, 2), square(2, 0, 2)])
addUnionCase('合成：只共享一个角', [square(0, 0, 2), square(2, 2, 2)])
addUnionCase('合成：完全重复的环（幂等）', [square(0, 0, 2), square(0, 0, 2)])
addUnionCase('合成：环套环（内环被吞掉）', [square(0, 0, 4), square(1, 1, 2)])
addUnionCase('合成：三个矩形拼成 L 形', [square(0, 0, 3), square(0, 3, 1.5), square(3, 0, 1.5)])
addUnionCase('合成：斜置矩形相交', [rotatedRectangle(0, 0, 4, 2, 0), rotatedRectangle(0.5, 0.5, 3, 2, 37)])
addUnionCase('合成：共线重叠的细长条', [rotatedRectangle(0, 0, 4, 0.2, 0), rotatedRectangle(1, 0, 4, 0.2, 0)])
addUnionCase('合成：退化的两点环与零面积环', [
  [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ],
  [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ],
  square(0, 0, 1),
])

addSubtractCase('合成：挖一个洞', [square(0, 0, 4)], [square(1, 1, 2)])
addSubtractCase('合成：挖两个不相交的洞', [square(0, 0, 6)], [square(1, 1, 1), square(4, 4, 1)])
addSubtractCase('合成：洞与外环贴边', [square(0, 0, 4)], [square(0, 1, 2)])
addSubtractCase('合成：洞与外环共用一角', [square(0, 0, 4)], [square(0, 0, 1)])
addSubtractCase('合成：洞完全覆盖外环（湮灭）', [square(0, 0, 2)], [square(-1, -1, 4)])
addSubtractCase('合成：减去一个完全在外部的环', [square(0, 0, 2)], [square(10, 10, 1)])
addSubtractCase('合成：环中环（差集再挖洞）', [square(0, 0, 6)], [square(1, 1, 4), square(2, 2, 2)])
addSubtractCase('合成：差集后再取并集', [square(0, 0, 4)], [])
addSubtractCase(
  '合成：斜置矩形减去斜置矩形',
  [rotatedRectangle(0, 0, 5, 3, 15)],
  [rotatedRectangle(0.4, 0.2, 2, 2, 15)],
)

// 真实草稿几何。
if (fs.existsSync(FIXTURE)) {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const wallLoops = fixture.walls.map(wallRectangle).filter(Boolean)
  const itemLoops = fixture.items.map(itemRectangle).filter(Boolean)
  addUnionCase('真实：45 段墙的合并轮廓', wallLoops)
  addUnionCase('真实：154 件家具占地合并', itemLoops)
  for (let round = 0; round < 8; round += 1) {
    const subset = pick(wallLoops, randomInteger(6, Math.min(18, wallLoops.length)))
    addUnionCase(`真实：随机 ${subset.length} 段墙合并 #${round + 1}`, subset)
  }
  for (let round = 0; round < 4; round += 1) {
    const subset = pick(itemLoops, randomInteger(4, 10))
    addUnionCase(`真实：随机 ${subset.length} 件家具合并 #${round + 1}`, subset)
  }
  for (let round = 0; round < 8; round += 1) {
    const walls = pick(wallLoops, randomInteger(4, 10))
    const target = boundingLoop(walls)
    if (!target.length) continue
    const holes = pick(itemLoops, randomInteger(0, 3))
    addSubtractCase(`真实：墙包围盒减去 ${holes.length} 件家具 #${round + 1}`, [target], holes)
  }
} else {
  console.warn(`跳过真实草稿用例：缺少 ${path.relative(REPO_ROOT, FIXTURE)}`)
}

// ── 度量 ─────────────────────────────────────────────────────────────────
function summarize(kernel, loops) {
  const areas = loops.map((loop) => kernel.polygonArea(loop))
  return {
    loops,
    area: areas.reduce((total, area) => total + area, 0),
    count: loops.length,
    positiveCount: areas.filter((area) => area > 0).length,
    negativeCount: areas.filter((area) => area < 0).length,
  }
}

function distanceToSegment(point, start, end) {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const lengthSquared = deltaX * deltaX + deltaY * deltaY
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared),
  )
  return Math.hypot(point.x - (start.x + projection * deltaX), point.y - (start.y + projection * deltaY))
}

/** 边界的带状区域不参与比较：内外判定在容差内本就是人为约定。 */
function isNearBoundary(point, loops, bandWidth) {
  for (const loop of loops)
    for (let index = 0; index < loop.length; index += 1)
      if (distanceToSegment(point, loop[index], loop[(index + 1) % loop.length]) <= bandWidth) return true
  return false
}

function insideSolid(kernel, loops, point) {
  const insidePositive = loops
    .filter((loop) => kernel.polygonArea(loop) > 0)
    .some((loop) => kernel.pointInPolygon(point, loop))
  if (!insidePositive) return false
  return !loops.filter((loop) => kernel.polygonArea(loop) < 0).some((loop) => kernel.pointInPolygon(point, loop))
}

function gridMembership(kernel, loops) {
  const bounds = boundingLoop(loops)
  if (!bounds.length) return { checks: 0, hash: '0' }
  const minX = bounds[0].x
  const minY = bounds[0].y
  const maxX = bounds[2].x
  const maxY = bounds[2].y
  const stepX = (maxX - minX) / GRID_STEPS || 1
  const stepY = (maxY - minY) / GRID_STEPS || 1
  const band = Math.min(stepX, stepY) * 0.02
  let checks = 0
  let signature = ''
  for (let row = 0; row <= GRID_STEPS; row += 1)
    for (let column = 0; column <= GRID_STEPS; column += 1) {
      const point = { x: minX + column * stepX, y: minY + row * stepY }
      if (isNearBoundary(point, loops, band)) continue
      checks += 1
      signature += insideSolid(kernel, loops, point) ? '1' : '0'
    }
  return { checks, hash: signature }
}

/** 下游实际消费方式：外环为轮廓，落在其中的负环为洞，交给 three 的三角化。 */
function triangulatedArea(kernel, loops) {
  const positiveLoops = loops.filter((loop) => kernel.polygonArea(loop) > 0)
  const negativeLoops = loops.filter((loop) => kernel.polygonArea(loop) < 0)
  let totalArea = 0
  let triangleCount = 0
  for (const contourLoop of positiveLoops) {
    const holes = negativeLoops.filter((holeLoop) => kernel.pointInPolygon(holeLoop[0], contourLoop))
    const contour = contourLoop.map((point) => new Vector2(point.x, point.y))
    const holeVectors = holes.map((holeLoop) => holeLoop.map((point) => new Vector2(point.x, point.y)))
    let triangles = []
    try {
      triangles = ShapeUtils.triangulateShape(contour, holeVectors)
    } catch {
      return { area: Number.NaN, triangleCount: -1 }
    }
    const allPoints = [...contour, ...holeVectors.flat()]
    for (const triangle of triangles) {
      const [first, second, third] = triangle.map((index) => allPoints[index])
      totalArea += Math.abs((second.x - first.x) * (third.y - first.y) - (third.x - first.x) * (second.y - first.y)) / 2
      triangleCount += 1
    }
  }
  return { area: totalArea, triangleCount }
}

function describe(label, reference, candidate, formatter) {
  return `${label}: 参考=${formatter(reference)} 候选=${formatter(candidate)}`
}

// ── 执行 ─────────────────────────────────────────────────────────────────
const reference = await loadKernel(REFERENCE_ENTRY)
const candidate = await loadKernel(CANDIDATE_ENTRY)

for (const goldenCase of cases) {
  // 调用点会用不同的容差（`courtyard-drawing.ts` 传 1e-7 与 1e-5，其余走默认 1e-6）。
  // 容差影响吸附栅格，因此三种口径都要与当前内核一致。
  const toleranceVariants = goldenCase.kind === 'union' ? [null, 1e-7, 1e-5] : [null]
  for (const tolerance of toleranceVariants) {
    comparisons += 1
    const label = tolerance === null ? goldenCase.name : `${goldenCase.name}（容差 ${tolerance}）`
    const runReference =
      goldenCase.kind === 'union'
        ? tolerance === null
          ? reference.validatedUnionPolygonLoops(goldenCase.loops)
          : reference.validatedUnionPolygonLoops(goldenCase.loops, tolerance)
        : reference.subtractPolygonLoops(goldenCase.targets, goldenCase.holes)
    const runCandidate =
      goldenCase.kind === 'union'
        ? tolerance === null
          ? candidate.validatedUnionPolygonLoops(goldenCase.loops)
          : candidate.validatedUnionPolygonLoops(goldenCase.loops, tolerance)
        : candidate.subtractPolygonLoops(goldenCase.targets, goldenCase.holes)

    const referenceSummary = summarize(reference, runReference)
    const candidateSummary = summarize(candidate, runCandidate)

    if (!nearlyEqual(referenceSummary.area, candidateSummary.area)) {
      failures.push(
        describe(`${label}｜净面积`, referenceSummary.area, candidateSummary.area, (value) => value.toFixed(6)),
      )
    }
    if (
      referenceSummary.count !== candidateSummary.count ||
      referenceSummary.positiveCount !== candidateSummary.positiveCount ||
      referenceSummary.negativeCount !== candidateSummary.negativeCount
    ) {
      failures.push(
        describe(
          `${label}｜环数/洞数`,
          `${referenceSummary.count}/${referenceSummary.negativeCount}`,
          `${candidateSummary.count}/${candidateSummary.negativeCount}`,
          (value) => String(value),
        ),
      )
    }

    const referenceGrid = gridMembership(reference, runReference)
    const candidateGrid = gridMembership(candidate, runCandidate)
    if (referenceGrid.checks !== candidateGrid.checks || referenceGrid.hash !== candidateGrid.hash) {
      const differing = [...referenceGrid.hash].filter((bit, index) => bit !== candidateGrid.hash[index]).length
      failures.push(
        `${label}｜栅格内外判定不一致：${differing}/${referenceGrid.checks} 个采样点不同（参考环 ${referenceSummary.count} / 候选环 ${candidateSummary.count}）`,
      )
    }

    const referenceTriangles = triangulatedArea(reference, runReference)
    const candidateTriangles = triangulatedArea(candidate, runCandidate)
    const bothFailed = Number.isNaN(referenceTriangles.area) && Number.isNaN(candidateTriangles.area)
    if (!bothFailed && !nearlyEqual(referenceTriangles.area, candidateTriangles.area)) {
      failures.push(
        describe(`${label}｜三角化面积`, referenceTriangles.area, candidateTriangles.area, (value) =>
          Number.isNaN(value) ? 'NaN' : value.toFixed(6),
        ),
      )
    }

    if (VERBOSE) {
      console.log(
        `${label}: 面积 ${referenceSummary.area.toFixed(4)} / 环 ${referenceSummary.count}` +
          `（外 ${referenceSummary.positiveCount} 洞 ${referenceSummary.negativeCount}）` +
          ` / 三角 ${referenceTriangles.triangleCount}`,
      )
    }

    if (DUMP_MATCH && label.includes(DUMP_MATCH)) {
      const dumpPath = path.join(os.tmpdir(), `homeos-golden-dump-${process.pid}-${comparisons}.json`)
      fs.writeFileSync(
        dumpPath,
        JSON.stringify(
          {
            case: goldenCase,
            tolerance,
            reference: { loops: runReference, triangles: referenceTriangles, grid: referenceGrid },
            candidate: { loops: runCandidate, triangles: candidateTriangles, grid: candidateGrid },
          },
          null,
          2,
        ),
      )
      console.log(`已导出用例「${label}」: ${dumpPath}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`黄金对比失败：${failures.length} 项差异 / ${comparisons} 个用例`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('  说明：候选实现与当前内核的输出不同；按方案 §3 S7 的保守规则，此时不合并。')
  process.exit(1)
}

console.log(`黄金对比通过：${comparisons} 个用例（净面积 / 环数洞数 / 栅格内外 / 三角化面积）与当前内核完全一致`)
