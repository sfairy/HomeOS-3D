#!/usr/bin/env node
/**
 * 3D 视口编辑 / 毫米标尺的**语义**不变量（只读）。
 *
 * 为什么需要它
 * ------------
 * 这两项功能的偏差都不「报错」，而是**手感与读数**不对：
 * - 离地吸附把「目标优先」写成「步长优先」→ 拖到桌面上方 10cm 吸不住；
 * - 量化以当前位置为基准 → 一次性拖 40cm 会累积出上百个 1cm 跳变；
 * - 离地容差用相机右向而不是竖直方向 → 俯视时吸附半径差好几倍；
 * - 标尺指纹只挑几个字段 → 改完备注按旧读数移动；
 * - 标尺忘了叠加平面视图旋转 → 视图转 180° 后读数正确、位置却镜像到画布另一侧；
 * - 视图切换用「适应画布」→ 每次切主视图都把缩放与平移重置。
 * 这些都是「页面看上去正常、数字不对」，只能靠纯函数断言锁住。
 *
 * 用法
 * ----
 *     node ops/checks/studio-editor-gesture-invariants.mjs
 *     node ops/checks/studio-editor-gesture-invariants.mjs --json
 */
import path from 'node:path'
import process from 'node:process'

import { createAssertions } from './lib/assertions.mjs'
import { loadTsModules } from './lib/load-ts-modules.mjs'

const AS_JSON = process.argv.includes('--json')
const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const AUTHORING = path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app')
const PLAN = path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/3d-studio/plan')

const assertions = createAssertions()
const { check } = assertions
/** 几何断言用绝对容差（读数差 0.1mm 就该失败）。 */
const near = (left, right, epsilon = 1e-9) => Math.abs(left - right) <= epsilon

const modules = await loadTsModules(
  [
    path.join(AUTHORING, 'interaction/editor-3d-gesture.ts'),
    path.join(AUTHORING, 'interaction/placement-snap-apply.ts'),
    path.join(PLAN, 'studio-placement-geometry.ts'),
    path.join(PLAN, 'studio-distance-rulers.ts'),
    path.join(PLAN, 'studio-plan-view-center.ts'),
    path.join(PLAN, 'studio-plan-item-ghosting.ts'),
    // 标尺的视图旋转必须与这里互为逆变换；直接加载真实实现断言，不复制公式。
    path.join(AUTHORING, 'plan/plan-coords.ts'),
    // 灯带 gizmo 的屏幕几何：**不得把投影坐标取整**（否则相机连续旋转时整层灯位一跳一跳）。
    path.join(AUTHORING, 'interaction/editor-light-gizmo-paths.ts'),
  ],
  { prefix: 'studio-gesture' },
)
const {
  snapEditorElevation,
  projectedPixelsPerMeter,
  quantizePlanDelta,
  placementTolerance,
  targetStampOf,
  planCenterOffsets,
  planCentreAtViewCenter,
  shouldRestorePlanCenter,
  applySuspendedItemStyle,
  SUSPENDED_ALPHA,
  rotateScreenForView,
  createViewRotation,
  bestLabelPlacement,
  planToScreen,
  screenToPlanPoint,
  screenToPlan,
  planeCenterHandle,
  lightGizmoHandles,
} = modules

// ---- snapEditorElevation：目标 > 步长 > 原值 ----
{
  const base = { original: 0.37, minimum: 0, maximum: 6, step: 0.05, tolerance: 0 }
  const free = snapEditorElevation({ ...base, raw: 0.39, targets: [] })
  check('步长以 original 为基准（0.37 + 0.05 档 → 0.37）', near(free.value, 0.37), `got ${free.value}`)

  const target = snapEditorElevation({
    ...base,
    raw: 0.78,
    targets: [{ value: 0.75, label: '落台 桌面' }],
    tolerance: 0.05,
  })
  check('容差内的目标优先于步长', near(target.value, 0.75), `got ${target.value}`)
  check('命中目标时带出中文标签', target.label === '落台 桌面', `got ${target.label}`)

  const outside = snapEditorElevation({
    ...base,
    raw: 1.2,
    targets: [{ value: 0.75, label: '落台 桌面' }],
    tolerance: 0.05,
  })
  check('容差外的目标不吸附', !near(outside.value, 0.75), `got ${outside.value}`)
  check('容差外不写标签', outside.label === '', `got ${outside.label}`)

  const noStep = snapEditorElevation({ ...base, raw: 0.391, step: 0, targets: [] })
  check('step=0 时不量化', near(noStep.value, 0.391), `got ${noStep.value}`)

  const clamped = snapEditorElevation({ ...base, raw: -3, targets: [] })
  check('夹在最小高度以上', clamped.value >= 0, `got ${clamped.value}`)
  const capped = snapEditorElevation({ ...base, raw: 99, targets: [] })
  check('夹在 6m 以内', capped.value <= 6, `got ${capped.value}`)
}

// ---- projectedPixelsPerMeter：竖直 / 水平尺度不同，退化返回 0 ----
{
  // 一个 3/4 视角的仿射投影：右向 100px/m、竖直 40px/m、深度 60px/m。
  const project = (point) => ({ x: point.x * 100 + point.z * 60, y: -point.z * 60 - point.y * 40 })
  const origin = { x: 0, y: 0, z: 0 }
  const vertical = projectedPixelsPerMeter(project, origin, { x: 0, y: 1, z: 0 })
  const horizontal = projectedPixelsPerMeter(project, origin, { x: 1, y: 0, z: 0 })
  check('竖直方向 1m = 40px', near(vertical, 40), `got ${vertical}`)
  check('水平方向 1m = 100px', near(horizontal, 100), `got ${horizontal}`)
  check('两个方向的尺度不同（容差不能用错方向）', !near(vertical, horizontal), `${vertical} vs ${horizontal}`)

  const behind = projectedPixelsPerMeter(() => null, origin, { x: 0, y: 1, z: 0 })
  check('投影失败时返回 0（按不可用处理）', behind === 0, `got ${behind}`)
}

// ---- quantizePlanDelta：5cm / Alt 1cm，关网格时原样返回 ----
{
  const pixelsPerMeter = 100
  const appCtxOn = { studioState: { settings: { snapEnabled: true, snapGrid: true } }, planView: { zoom: 1 } }
  const coarse = quantizePlanDelta(appCtxOn, { x: 12.4, y: -37.8 }, pixelsPerMeter, false)
  check('5cm 量化：12.4px → 10px', near(coarse.x, 10), `got ${coarse.x}`)
  check('5cm 量化：-37.8px → -40px', near(coarse.y, -40), `got ${coarse.y}`)

  const fine = quantizePlanDelta(appCtxOn, { x: 12.4, y: 3.4 }, pixelsPerMeter, true)
  check('Alt 1cm 量化：12.4px → 12px', near(fine.x, 12), `got ${fine.x}`)

  const offGrid = {
    studioState: { settings: { snapEnabled: true, snapGrid: false } },
    planView: { zoom: 1 },
  }
  const raw = quantizePlanDelta(offGrid, { x: 12.4, y: 3.4 }, pixelsPerMeter, false)
  check('snapGrid=false 时不量化', near(raw.x, 12.4) && near(raw.y, 3.4), `got ${raw.x},${raw.y}`)

  const snapOff = { studioState: { settings: { snapEnabled: false } }, planView: { zoom: 1 } }
  const untouched = quantizePlanDelta(snapOff, { x: 12.4, y: 0 }, pixelsPerMeter, false)
  check('吸附总开关关闭时不量化', near(untouched.x, 12.4), `got ${untouched.x}`)

  const holdS = {
    studioState: { settings: { snapEnabled: true, snapGrid: true } },
    planView: { zoom: 1 },
    isSnapTemporarilyOff: true,
  }
  const paused = quantizePlanDelta(holdS, { x: 12.4, y: 0 }, pixelsPerMeter, false)
  check('按住 S 暂停吸附时也不量化', near(paused.x, 12.4), `got ${paused.x}`)
}

// ---- placementTolerance：随 zoom 单调、夹在 0.3%–15% 物件尺度 ----
{
  const ppm = 100
  const loose = placementTolerance(ppm, 1)
  const tight = placementTolerance(ppm, 8)
  check('放大后容差变小', tight < loose, `${tight} vs ${loose}`)
  check('容差不超过 15% 比例尺', loose <= 0.15 * ppm + 1e-9, `got ${loose}`)
  check('容差不少于 0.3% 比例尺', tight >= 0.003 * ppm - 1e-9, `got ${tight}`)
  check('13px / zoom 的上游公式', near(placementTolerance(ppm, 1, 13), 13, 1e-9))
}

// ---- targetStampOf：整条记录，含备注 ----
{
  const target = { id: 'sofa-1', x: 10, y: 20, width: 2.2, depth: 0.9, rotation: 0, remark: '客厅主沙发' }
  const withRemark = targetStampOf(target)
  check('指纹包含备注（改备注必须让旧读数失效）', withRemark.includes('客厅主沙发'), withRemark)
  const changed = targetStampOf({ ...target, remark: '换成书房' })
  check('备注变化即指纹变化', changed !== withRemark)
  check('空参照物指纹为空串', targetStampOf(null) === '')
  check('同内容指纹稳定', targetStampOf({ ...target }) === withRemark)
}

// ---- rotateScreenForView：标尺跟着平面视图一起转 ----
{
  const viewport = { width: 554, height: 738 }
  const point = { x: 100, y: 50 }

  const same = rotateScreenForView(point, 0, viewport)
  check('0° 时标尺坐标与 planToScreen 完全一致', same === point, JSON.stringify(same))

  const flipped = rotateScreenForView(point, 180, viewport)
  check(
    '180° 关于视口中心对称（否则标尺会镜像到画布另一侧）',
    near(flipped.x, 554 - 100) && near(flipped.y, 738 - 50),
    JSON.stringify(flipped),
  )

  const quarter = rotateScreenForView(point, 90, viewport)
  // 屏幕 y 向下，`+90°` 与 canvas `rotate()` 同向：(dx, dy) → (-dy, dx)。
  const halfWidth = viewport.width / 2
  const halfHeight = viewport.height / 2
  check(
    '90° 与画布 rotate() 同向（y 向下）',
    near(quarter.x, halfWidth - (point.y - halfHeight)) && near(quarter.y, halfHeight + (point.x - halfWidth)),
    JSON.stringify(quarter),
  )

  // 四分之一转走整数交换/取反，不该出现任何浮点尾巴（否则会写进 style.left 的小数）。
  check(
    '90° 是整数坐标，没有三角函数尾巴',
    Number.isInteger(quarter.x) && Number.isInteger(quarter.y),
    JSON.stringify(quarter),
  )
  const threeQuarter = rotateScreenForView(point, 270, viewport)
  check(
    '270° 是 90° 的反向（(dx,dy) → (dy,-dx)）',
    near(threeQuarter.x, halfWidth + (point.y - halfHeight)) &&
      near(threeQuarter.y, halfHeight - (point.x - halfWidth)),
    JSON.stringify(threeQuarter),
  )

  // 等价角度必须归一化：360° / -90° / 450° 各自对齐 0° / 270° / 90°。
  for (const [angle, expected] of [
    [360, 0],
    [-90, 270],
    [450, 90],
    [-360, 0],
  ]) {
    const normalized = rotateScreenForView(point, angle, viewport)
    const reference = rotateScreenForView(point, expected, viewport)
    check(
      `${angle}° 归一化为 ${expected}°`,
      near(normalized.x, reference.x, 1e-9) && near(normalized.y, reference.y, 1e-9),
      `${JSON.stringify(normalized)} vs ${JSON.stringify(reference)}`,
    )
  }

  // 同一帧里重复投影必须给出完全相同的坐标：标签与虚线共用一个投影器，不能各算各的。
  const project = createViewRotation(180, viewport)
  const once = project(point)
  const twice = project(point)
  check('投影器可复用且结果稳定', once.x === twice.x && once.y === twice.y, JSON.stringify([once, twice]))

  // 端到端：平面点 → planToScreen → 视图旋转 → screenToPlanPoint → screenToPlan 必须回到原点。
  // 这是「鼠标点哪、标签落在哪」的硬约束：两边任一符号写反，输入间距就会落到别的物件上。
  const makeRuntime = (rotation) => {
    const runtime = {
      appCtx: {
        planViewWidth: viewport.width,
        planViewHeight: viewport.height,
        planView: { zoom: 1.8, offsetX: 37, offsetY: -12, rotation },
      },
      screenToPlanPoint: (screenPoint) => screenToPlanPoint(runtime, screenPoint),
    }
    return runtime
  }
  const planPoint = { x: 812.5, y: 431.25 }
  for (const rotation of [0, 90, 180, 270]) {
    const runtime = makeRuntime(rotation)
    const projected = rotateScreenForView(planToScreen(runtime, planPoint), rotation, viewport)
    const back = screenToPlan(runtime, projected)
    check(
      `视图 ${rotation}° 时标尺投影与 screenToPlan 互逆`,
      near(back.x, planPoint.x, 1e-6) && near(back.y, planPoint.y, 1e-6),
      `${JSON.stringify(back)} vs ${JSON.stringify(planPoint)}`,
    )
  }
}

// ---- bestLabelPlacement：标尺标签不互相挤掉，但躲开手柄框 ----
{
  const viewport = { width: 554, height: 738 }
  // 真实量级：10px 等宽字体下标签约 85×20，参照物名 12px，贴边留白后半宽约 46。
  const metrics = { halfWidth: 46, halfHeight: 13, fullHeight: 28 }
  // 选中件的手柄框（外扩 10px 后约 65×65），居中。
  const handleBox = { left: 246, right: 311, top: 336, bottom: 401 }

  // 四条标尺的首选点分别在上/下/左/右 18px 外。
  const preferredPoints = [
    { x: 278, y: 300 },
    { x: 278, y: 437 },
    { x: 210, y: 368 },
    { x: 347, y: 368 },
  ]

  // 顺序排版：已放下的标签成为软障碍，但不应把后来的整条挤到「必须隐藏」。
  const soft = []
  let allClear = true
  let maxDrift = 0
  for (const preferred of preferredPoints) {
    const placement = bestLabelPlacement(preferred, metrics, viewport, { hard: [handleBox], soft })
    allClear = allClear && placement.hardCovered === 0
    maxDrift = Math.max(maxDrift, Math.hypot(placement.point.x - preferred.x, placement.point.y - preferred.y))
    soft.push(placement.rect)
  }
  check('四条标尺都躲开手柄框（不会因互相挤而消失）', allClear)
  check(
    '避让不把标签甩远（四个方向都在两格以内）',
    maxDrift < (metrics.halfWidth * 2 + 6) * 2,
    `maxDrift ${maxDrift.toFixed(1)}`,
  )

  // 首选点相同时第二条要错开：软障碍（已放下的标签）必须真的参与候选评分。
  const first = bestLabelPlacement({ x: 278, y: 300 }, metrics, viewport, { hard: [handleBox], soft: [] })
  const second = bestLabelPlacement({ x: 278, y: 300 }, metrics, viewport, { hard: [handleBox], soft: [first.rect] })
  check(
    '首选点重合时第二条错开一格',
    Math.hypot(second.point.x - first.point.x, second.point.y - first.point.y) > metrics.halfWidth,
    JSON.stringify([first.point, second.point]),
  )
  check('错开之后仍不压手柄框', second.hardCovered === 0)

  // 只压住另一条标尺时不得报硬遮挡：调用方据此隐藏，就会白丢一条读数。
  const overlapping = bestLabelPlacement({ x: 278, y: 300 }, metrics, viewport, {
    hard: [handleBox],
    soft: [{ ...handleBox, top: 280, bottom: 320, left: 246, right: 311 }],
  })
  check('压住另一条标尺不算硬遮挡', overlapping.hardCovered === 0, `${overlapping.hardCovered}`)

  // 手柄框占满整个视口时确实躲不开：这时才该隐藏。
  const trapped = bestLabelPlacement({ x: 278, y: 368 }, metrics, viewport, {
    hard: [{ left: -100, right: 800, top: -100, bottom: 900 }],
    soft: [],
  })
  check('手柄框占满视口时报硬遮挡（交给 UI 隐藏）', trapped.hardCovered > 0)

  // 负方向越界与画布角落：标签必须整体留在视口内（含上方参照物名）。
  const corner = bestLabelPlacement({ x: -40, y: -40 }, metrics, viewport, { hard: [], soft: [] })
  check(
    '角落首选点被夹进视口（含上方名称）',
    corner.rect.left >= 0 && corner.rect.top >= 0,
    JSON.stringify(corner.rect),
  )
}

// ---- planCenterOffsets：切换主视图保持取景 ----
{
  const centre = { x: 1234.5, y: -678.25 }
  const zoom = 1.8
  const offsets = planCenterOffsets(centre, zoom, 554, 738)
  check('offsetX = W/2 - centre.x * zoom', near(offsets.offsetX, 277 - centre.x * zoom), `got ${offsets.offsetX}`)
  check('offsetY = H/2 - centre.y * zoom', near(offsets.offsetY, 369 - centre.y * zoom), `got ${offsets.offsetY}`)

  const back = planCentreAtViewCenter(offsets.offsetX, offsets.offsetY, zoom, 554, 738)
  check('中心反算往返一致 x', near(back.x, centre.x, 1e-9), `${back.x} vs ${centre.x}`)
  check('中心反算往返一致 y', near(back.y, centre.y, 1e-9), `${back.y} vs ${centre.y}`)

  // 换了画布尺寸后，同一个中心点仍落在新画布中心。
  const resized = planCenterOffsets(centre, zoom, 434, 444)
  const recentred = planCentreAtViewCenter(resized.offsetX, resized.offsetY, zoom, 434, 444)
  check('换画布后中心不变（主副视图切换）', near(recentred.x, centre.x, 1e-9) && near(recentred.y, centre.y, 1e-9))

  check(
    '尺寸变化 1.3 倍仍保持取景',
    shouldRestorePlanCenter({ width: 554, height: 738 }, { width: 434, height: 444 }) === true,
  )
  check(
    '尺寸剧变（>3 倍）放弃保持，退回适应画布',
    shouldRestorePlanCenter({ width: 554, height: 738 }, { width: 120, height: 160 }) === false,
  )
  check('尺寸非法时放弃保持', shouldRestorePlanCenter({ width: 0, height: 0 }, { width: 434, height: 444 }) === false)
}

// ---- applySuspendedItemStyle：悬空件虚化（0.8.7 `rc()`） ----
{
  const makeContext = () => ({
    globalAlpha: 1,
    dashed: null,
    setLineDash(segments) {
      this.dashed = segments
    },
  })
  const deps = (bounds) => ({ planCanvasRenderer: makeContext(), heightBoundsOf: () => bounds })

  const hanging = deps({ min: 1.2, max: 1.8, exact: true })
  applySuspendedItemStyle(hanging, { id: 'mural-1' }, false)
  check(
    '悬空件（min=1.2m）压到 42% 透明度',
    near(hanging.planCanvasRenderer.globalAlpha, SUSPENDED_ALPHA),
    `got ${hanging.planCanvasRenderer.globalAlpha}`,
  )
  check(
    '悬空件转虚线 [5,3]',
    JSON.stringify(hanging.planCanvasRenderer.dashed) === '[5,3]',
    `got ${JSON.stringify(hanging.planCanvasRenderer.dashed)}`,
  )

  const grounded = deps({ min: 0, max: 0.45, exact: true })
  applySuspendedItemStyle(grounded, { id: 'sofa-1' }, false)
  check('落地件（min=0）保持不透明', grounded.planCanvasRenderer.globalAlpha === 1)
  check('落地件不转虚线', grounded.planCanvasRenderer.dashed === null)

  const selected = deps({ min: 1.2, max: 1.8, exact: true })
  applySuspendedItemStyle(selected, { id: 'mural-1' }, true)
  check('选中件不虚化（否则看不清拖哪条边）', selected.planCanvasRenderer.globalAlpha === 1)

  const inexact = deps({ min: 1.2, max: 1.8, exact: false })
  applySuspendedItemStyle(inexact, { id: 'mural-1' }, false)
  check('拿不到精确包围盒时不虚化', inexact.planCanvasRenderer.globalAlpha === 1)

  const noBounds = { planCanvasRenderer: makeContext() }
  applySuspendedItemStyle(noBounds, { id: 'x' }, false)
  check('无 heightBoundsOf 时按落地处理', noBounds.planCanvasRenderer.globalAlpha === 1)

  const boundary = deps({ min: 0.08, max: 0.4, exact: true })
  applySuspendedItemStyle(boundary, { id: 'x' }, false)
  check('阈值是「严格大于 8cm」', boundary.planCanvasRenderer.globalAlpha === 1)
}

// ---- 灯带 gizmo：屏幕坐标不取整（否则旋转 / 缩放时灯位图一跳一跳） ----
{
  // 亚像素投影：取整会把 100.4 → 100、100.6 → 101，连续旋转时圆点只能按 1px 台阶跳。
  const project = (world) => ({ x: 100.4 + world.x * 10, y: 200.6 + world.y * 10 })

  const center = planeCenterHandle({ x: 0, y: 0, z: 0 }, project)
  check('平面移动十字带出浮点坐标（不取整）', Boolean(center?.path.includes('100.4')), center?.path)
  check('平面移动十字的纵向坐标同样是浮点', Boolean(center?.path.includes('200.6')), center?.path)

  const handles = lightGizmoHandles({
    center: { x: 0, y: 0, z: 0 },
    pose: { type: 'pendantlight', rotation: 0, elevation: 0 },
    radius: 0.32,
    project,
    mode: 'rotate',
    space: 'local',
    rotationLabel: '平面旋转',
  })
  const ring = handles.find((handle) => handle.key === 'rotate-rotation')
  check(
    '圆环标签点保留亚像素坐标',
    Boolean(ring && !Number.isInteger(ring.labelPoint.x)),
    JSON.stringify(ring?.labelPoint),
  )
  check(
    '圆环路径保留 0.1px 精度（与圆点同源，不会两个尺度互相错开）',
    Boolean(ring?.path.includes('.')),
    ring?.path?.slice(0, 40),
  )
}

const summary = { assertions: assertions.assertions, failures: assertions.failures }
if (AS_JSON) {
  console.log(JSON.stringify(summary, null, 2))
} else if (summary.failures.length > 0) {
  console.error(`3D 编辑 / 标尺语义不变量失败：${summary.failures.length} 项`)
  for (const line of summary.failures) console.error(`  - ${line}`)
} else {
  console.log(`3D 编辑 / 标尺语义不变量通过：${summary.assertions} 项断言`)
}

process.exit(summary.failures.length > 0 ? 1 : 0)
