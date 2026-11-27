#!/usr/bin/env node
/**
 * 毫米标尺与拖动吸附的纯函数不变量（只读）。
 *
 * 为什么需要它
 * ------------
 * 这两块几何（OBB 四角、Minkowski 凸包、射线求交、吸附评分）都是**算出来看不见**的：
 * 错了的表现是「读数差 12cm」「贴墙差半个墙厚」，页面看上去仍然正常。
 * 这里断言的是任何正确实现都必须满足的性质，而不是录一份当前输出当基线。
 *
 * 断言的性质
 * ----------
 * - `itemPlanCorners`：旋转 90° 后宽深互换；四角质心 = 物件中心；旋转 0° 时是轴对齐矩形。
 * - `measureItemGaps`：贴墙时读数为 0（墙面按厚度取**表面**，不是中心线）；
 *   只有一面墙时只有一条标尺；超过 `maxMeters` 不产出；旋转件按真实外表面而不是包围盒。
 * - `positionForGap`：输入 N mm 后重新测量的间距就是 N（往返一致），且只改一个轴。
 * - `placementTolerance`：随 ppm / zoom 单调，且被夹在 0.3%–15% 的物件尺度之间。
 * - `snapPlacement`：贴墙时位移把物件推到墙上（间隙 0）；两轴同时吸附能同时命中；
 *   `freedom` 只允许单轴修正；`previous` 命中后阈值放宽。
 *
 * 用法
 * ----
 *     node ops/checks/studio-placement-invariants.mjs
 *     node ops/checks/studio-placement-invariants.mjs --json
 */
import path from 'node:path'
import process from 'node:process'

import { createAssertions } from '../lib/assertions.mjs'
import { loadTsModules } from '../lib/load-ts-modules.mjs'

const AS_JSON = process.argv.includes('--json')
const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')
const PLAN_DIR = path.join(REPO_ROOT, 'homeos/frontend/src/studio/authoring/plan')

const assertions = createAssertions()
const { check, near } = assertions

const modules = await loadTsModules(
  [
    // `studio-placement-geometry` / `studio-placement-snap` / `studio-distance-rulers`
    // 已并入 `studio-placement.ts` 与 `studio.ts`（纯函数族按能力归并）。
    path.join(PLAN_DIR, 'studio-placement.ts'),
    path.join(PLAN_DIR, 'studio.ts'),
  ],
  { prefix: 'studio-placement' },
)
const {
  itemPlanCorners,
  placementTolerance,
  measureItemGaps,
  positionForGap,
  snapPlacement,
  parseRulerMillimeters,
  metersToMillimeters,
} = modules

const PPM = 100 // 1 米 = 100 平面像素

/** 物件：4m × 2m 的矩形，可旋转。 */
function item(overrides = {}) {
  return { id: 'a', type: 'sofa', x: 500, y: 500, width: 4, depth: 2, rotation: 0, ...overrides }
}

/** 一面竖墙（x = 常数），厚度 0.2m。 */
function verticalWall(x, thickness = 0.2) {
  return { id: 'w1', start: { x, y: 0 }, end: { x, y: 2000 }, thickness }
}

/**
 * 竖墙：**朝向物件的近侧表面**落在 `surfaceX`。
 *
 * 墙按厚度向两侧各偏移半个厚度，所以中心要再往左挪半厚 —— 直接把中心当表面，
 * 会让「贴墙读数」多算 100mm（这正是被这条断言抓出来的那类错误）。
 */
function leftWallWithSurface(surfaceX, thickness = 0.2) {
  return verticalWall(surfaceX - (thickness * PPM) / 2, thickness)
}

// ---- itemPlanCorners ----
{
  const corners = itemPlanCorners(item(), PPM)
  const centroid = corners.reduce((sum, p) => ({ x: sum.x + p.x / 4, y: sum.y + p.y / 4 }), { x: 0, y: 0 })
  check('四角质心 = 物件中心', near(centroid.x, 500) && near(centroid.y, 500), `${centroid.x},${centroid.y}`)
  const width = Math.abs(corners[1].x - corners[0].x)
  const depth = Math.abs(corners[2].y - corners[1].y)
  check('0° 时角点跨度 = 宽/深（像素）', near(width, 400) && near(depth, 200), `${width}×${depth}`)

  const rotated = itemPlanCorners(item({ rotation: 90 }), PPM)
  // 90° 后「宽边」变成竖直方向：两条相邻边的长度集合仍应是 {宽, 深}，只是方位互换。
  const edge1 = Math.hypot(rotated[1].x - rotated[0].x, rotated[1].y - rotated[0].y)
  const edge2 = Math.hypot(rotated[2].x - rotated[1].x, rotated[2].y - rotated[1].y)
  const edgeSet = [edge1, edge2].sort((a, b) => a - b)
  check('90° 后相邻边长度 = {深, 宽}', near(edgeSet[0], 200) && near(edgeSet[1], 400), `${edge1}×${edge2}`)
}

// ---- placementTolerance ----
{
  const at100 = placementTolerance(PPM, 1)
  const at200 = placementTolerance(PPM, 2)
  check('容差随缩放变小', at200 < at100, `${at100} vs ${at200}`)
  check('容差不小于物件尺度 0.3%', at100 >= 0.3 - 1e-9, String(at100))
  check('容差不大于物件尺度 15%', at100 <= 15 + 1e-9, String(at100))
  const smallPpm = placementTolerance(10, 1)
  check('容差随 ppm 收缩', smallPpm < at100, `${smallPpm} vs ${at100}`)
}

// ---- measureItemGaps：贴墙读 ~0（按墙面**近侧表面**，不按中心线） ----
{
  const rect = item()
  // 近侧表面距左边缘 1px：属于「已经贴上」的状态。
  // 完全重合时射线求交退化成 0 长度，上游同样量不出「0mm」这一条（读数会略大于 0），
  // 所以这里断言「≤5mm」而不是严格的 0。
  const leftEdge = rect.x - (rect.width * PPM) / 2
  const wall = leftWallWithSurface(leftEdge - 1)
  const gaps = measureItemGaps({ item: rect, items: [], walls: [wall], pixelsPerMeter: PPM })
  const left = gaps.find((gap) => gap.key === 'width-')
  check('贴墙时左向标尺存在', Boolean(left), `gaps=${gaps.map((gap) => gap.key).join(',')}`)
  // 1px @ 100ppm = 10mm；容差取 ±2mm（浮点 + 求交精度）。
  check(
    '贴墙时读数 = 1px 的毫米数（10mm）',
    left ? Math.abs(metersToMillimeters(left.meters) - 10) <= 2 : false,
    String(left?.meters),
  )
  check('只有一面墙时只出一条标尺', gaps.length === 1, `got ${gaps.length}`)

  // 把物件挪开 300mm：读数应 = 1mm + 300mm（按近侧表面算，不是按墙中心）。
  const moved = item({ x: rect.x + 0.3 * PPM })
  const movedGaps = measureItemGaps({ item: moved, items: [], walls: [wall], pixelsPerMeter: PPM })
  const movedLeft = movedGaps.find((gap) => gap.key === 'width-')
  // 原间隙 1px + 挪开 30px = 31px @ 100ppm = 310mm。
  check(
    '挪开后读数按近侧表面算（310mm）',
    movedLeft ? Math.abs(metersToMillimeters(movedLeft.meters) - 310) <= 3 : false,
    String(movedLeft?.meters),
  )
}

// ---- measureItemGaps：maxMeters 上限 ----
{
  const rect = item({ x: 50000 })
  const wall = verticalWall(0)
  const gaps = measureItemGaps({ item: rect, items: [], walls: [wall], pixelsPerMeter: PPM, maxMeters: 100 })
  check('超过 100m 不产出标尺', gaps.length === 0, `got ${gaps.length}`)
}

// ---- measureItemGaps：旋转件按真实表面 ----
{
  const rotated = item({ rotation: 45 })
  const wall = verticalWall(rotated.x - 400)
  const gaps = measureItemGaps({ item: rotated, items: [], walls: [wall], pixelsPerMeter: PPM })
  const left = gaps.find((gap) => gap.key === 'width-')
  // 旋转 45° 后外接包络半宽 = (4 + 2) / 2 * cos45 * ppm ≈ 2.12m；读数应明显小于「包围盒贴墙」的 4m。
  check('旋转件读数不是包围盒量级', left ? left.meters < 3 : false, String(left?.meters))
  check('旋转件标尺沿本体方向（非世界轴）', left ? Math.abs(Math.abs(left.direction.x) - Math.SQRT1_2) < 1e-6 : false)
}

// ---- positionForGap 往返一致 ----
{
  const rect = item()
  // 墙面近侧表面在左边缘外 200mm。
  const wall = leftWallWithSurface(rect.x - (rect.width * PPM) / 2 - 20)
  const gaps = measureItemGaps({ item: rect, items: [], walls: [wall], pixelsPerMeter: PPM })
  const left = gaps.find((gap) => gap.key === 'width-')
  check('往返前有左向标尺', Boolean(left))
  if (left) {
    const next = positionForGap(rect, left, 0.5, PPM)
    const after = measureItemGaps({
      item: item({ x: next.x, y: next.y }),
      items: [],
      walls: [wall],
      pixelsPerMeter: PPM,
    }).find((gap) => gap.key === 'width-')
    check(
      '输入 500mm 后重新测量仍是 500mm',
      after ? Math.abs(metersToMillimeters(after.meters) - 500) <= 2 : false,
      String(after?.meters),
    )
    check('只改一个轴', near(next.y, rect.y), `${next.y} vs ${rect.y}`)
  }
}

// ---- parseRulerMillimeters ----
{
  check('接受 0', parseRulerMillimeters('0') === 0)
  check('接受 100000', parseRulerMillimeters('100000') === 100000)
  check('拒绝越界', parseRulerMillimeters('100001') === null)
  check('拒绝非数字', parseRulerMillimeters('abc') === null)
  check('拒绝空串', parseRulerMillimeters('  ') === null)
}

// ---- snapPlacement：贴墙 ----
{
  const rect = item({ x: 500, y: 500 })
  // 墙面近侧表面距左边缘 20px。
  const wall = leftWallWithSurface(rect.x - (rect.width * PPM) / 2 - 20)
  const result = snapPlacement({
    moving: [rect],
    targets: [],
    walls: [wall],
    pixelsPerMeter: PPM,
    tolerance: 30,
  })
  check('贴墙吸附命中', result.guides.length > 0, `keys=${result.keys.join(',')}`)
  // 左边缘应被推到墙面表面：x = 墙表面 + 半宽。
  const wallSurface = wall.start.x + 0.1 * PPM
  const expectedX = wallSurface + rect.width * PPM * 0.5
  check('贴墙位移把左边缘推到表面', near(rect.x + result.x, expectedX, 1e-6), `${rect.x + result.x} vs ${expectedX}`)
  check(
    '引导线落在墙面上',
    result.guides[0] ? Math.abs(result.guides[0].start.x - wall.start.x) <= 0.1 * PPM + 1e-6 : false,
  )
}

// ---- snapPlacement：两轴同时吸附 ----
{
  const rect = item({ x: 520, y: 530 })
  // 两面墙的近侧表面分别距左 / 上边缘 18px 与 15px（都在默认容差 30 内）。
  const leftWall = leftWallWithSurface(rect.x - (rect.width * PPM) / 2 - 18)
  const topSurface = rect.y - (rect.depth * PPM) / 2 - 15
  const wallThicknessPx = 0.2 * PPM
  const topWall = {
    id: 'w2',
    start: { x: 0, y: topSurface - wallThicknessPx / 2 },
    end: { x: 2000, y: topSurface - wallThicknessPx / 2 },
    thickness: 0.2,
  }
  const result = snapPlacement({
    moving: [rect],
    targets: [],
    walls: [leftWall, topWall],
    pixelsPerMeter: PPM,
    tolerance: 30,
  })
  check('两轴同时吸附产出两条引导线', result.guides.length === 2, `got ${result.guides.length}`)
  check('两轴都有非零位移', Math.abs(result.x) > 1 && Math.abs(result.y) > 1, `${result.x},${result.y}`)
}

// ---- snapPlacement：freedom 单轴 ----
{
  const rect = item({ x: 520, y: 530 })
  const leftWall = leftWallWithSurface(rect.x - (rect.width * PPM) / 2 - 18)
  const result = snapPlacement({
    moving: [rect],
    targets: [],
    walls: [leftWall],
    pixelsPerMeter: PPM,
    tolerance: 30,
    freedom: { x: 0, y: 1 }, // 只允许竖向
  })
  check(
    'freedom 不允许横向吸附',
    result.guides.length === 0 && result.x === 0,
    `x=${result.x}, keys=${result.keys.join(',')}`,
  )
}

// ---- snapPlacement：previous 放宽阈值 ----
{
  const rect = item({ x: 500, y: 500 })
  // 近侧表面距左边缘 40px：超过默认容差 30（冷启动不吸），但在「命中过」的 1.4× 放宽内。
  const wall = leftWallWithSurface(rect.x - (rect.width * PPM) / 2 - 40)
  const cold = snapPlacement({ moving: [rect], walls: [wall], pixelsPerMeter: PPM, tolerance: 30 })
  check('超出容差不吸附', cold.guides.length === 0, `keys=${cold.keys.join(',')}`)
  const warm = snapPlacement({
    moving: [rect],
    walls: [wall],
    pixelsPerMeter: PPM,
    tolerance: 30,
    previous: cold.keys.length ? cold.keys : ['wall:w1:-1'],
  })
  check('命中过的候选阈值放宽后能吸上', warm.guides.length > 0, `keys=${warm.keys.join(',')}`)
}

const summary = { assertions: assertions.assertions, failures: assertions.failures }
if (AS_JSON) console.log(JSON.stringify(summary, null, 2))
else if (summary.failures.length === 0) console.log(`标尺 / 吸附几何不变量通过：${summary.assertions} 项断言`)
else {
  console.error(`标尺 / 吸附几何不变量失败：${summary.failures.length} / ${summary.assertions}`)
  for (const line of summary.failures) console.error(`  - ${line}`)
}
process.exit(summary.failures.length ? 1 : 0)
