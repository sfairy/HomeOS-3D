/**
 * 自定义窗型「落盘前几何校验」的契约（`windowSceneError`）。
 *
 * 这条守卫是这个功能里唯一「合法窗型 + 非法尺寸」的拦截点。它失效的信号是**静默**的：
 * - 拦得太松 → 窗框穿墙；
 * - 拦得太严 / 文案不给数字 → 用户点「应用窗型」什么也没发生（0.8.4 的真实报告：
 *   窗宽 7000 mm、墙长 6997 mm，差 3 mm，旧文案只说「超出墙体」，看上去就是按钮坏了）。
 *
 * 所以这里同时钉两件事：
 * 1. 判据本身（窗宽 / 窗台 / 窗顶三条独立分支，普通窗不参与）；
 * 2. 出错后**必须走绘制器自己的提示条**，不能走 `showToast` —— 绘制器是模态 `<dialog>`
 *    （top layer），外壳通知层在 backdrop 后面，用户一个字都看不见。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LAYOUT = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/3d-studio/plan/window/layout.ts', import.meta.url),
)
const SCENE_GUARD = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/plan/window/window-scene-guard.ts',
    import.meta.url,
  ),
)
const WIRING = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/ui/window-designer-wiring.ts',
    import.meta.url,
  ),
)
const DESIGNER = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/3d-studio/plan/window/designer.ts', import.meta.url),
)
/** 场景入库净化：`normalizeScenePayload` 会按固定字段重建每个 window。 */
const SCENE_PAYLOAD = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/scene/studio-scene-payload.ts',
    import.meta.url,
  ),
)

const { windowSceneError, windowTopologyError } = await import(SCENE_GUARD)
const { leaf } = await import(LAYOUT)
const wiringSource = readFileSync(WIRING, 'utf8')
const designerSource = readFileSync(DESIGNER, 'utf8')
const scenePayloadSource = readFileSync(SCENE_PAYLOAD, 'utf8')

const PPM = 100

/** 一面水平的墙 + 一扇自定义窗；几何全部以米为单位，按 ppm 换成平面像素。 */
function scene({
  wallLength = 3,
  wallHeight = 2.9,
  width = 1.5,
  height = 1.9,
  sill = 0.4,
  mode = 'custom',
  withWall = true,
} = {}) {
  const wall = {
    id: 'wall-1',
    start: { x: 0, y: 0 },
    end: { x: wallLength * PPM, y: 0 },
    height: wallHeight,
  }
  return {
    walls: withWall ? [wall] : [],
    windows: [
      {
        id: 'window-1',
        wallId: 'wall-1',
        t: 0.5,
        width,
        height,
        sill,
        windowDesign: { version: 1, mode, interiorSide: 1, layout: leaf('fixed') },
      },
    ],
  }
}

/** 实测墙长（与实现同一算法），用于构造「刚好超 1e-6」的边界。 */
const measuredLength = (wallLength) => Math.hypot(wallLength * PPM, 0) / PPM

test('windowSceneError：尺寸合法的自定义窗放行', () => {
  assert.equal(windowSceneError(scene(), PPM), '')
})

test('windowSceneError：窗宽超出墙长时报错并给出两侧毫米数', () => {
  const message = windowSceneError(scene({ wallLength: 6.997, width: 7 }), PPM)
  assert.match(message, /超出墙体/)
  assert.match(message, /窗宽 7000 mm/, '必须告诉用户窗有多宽')
  assert.match(message, /墙长只有 6997 mm/, '必须告诉用户墙有多长，否则用户量不出差 3 mm')
  assert.doesNotMatch(message, /窗台/, '窗宽分支不该甩出窗台/窗高这些无关建议')
})

test('windowSceneError：指名是第几扇窗，十几扇窗时才找得到', () => {
  const multi = scene({ wallLength: 6.997, width: 7 })
  multi.windows.unshift(
    { id: 'window-0', wallId: 'wall-1', t: 0.2, width: 1, height: 1, sill: 0.4 },
  )
  assert.match(windowSceneError(multi, PPM), /第 2 扇窗户/, '越界的是第 2 扇，不能只说「自定义窗户」')
  const named = scene({ wallLength: 6.997, width: 7 })
  named.windows[0].remark = '主卧飘窗'
  assert.match(windowSceneError(named, PPM), /窗户「主卧飘窗」/, '有备注时用备注当标签')
})

test('windowSceneError：窗顶超高与窗宽超墙分开报，不让用户猜是哪条', () => {
  const message = windowSceneError(scene({ height: 2.3, sill: 0.8 }), PPM) // 0.8 + 2.3 = 3.1 > 2.9
  assert.match(message, /窗顶 3100 mm/)
  assert.match(message, /墙高只有 2900 mm/)
  assert.doesNotMatch(message, /窗宽 \d/, '窗宽没超时不该出现窗宽数字')
})

test('windowSceneError：窗台为负单独报，不混进「超出墙体」', () => {
  const message = windowSceneError(scene({ sill: -0.1 }), PPM)
  assert.match(message, /窗台高度不能为负/)
  assert.doesNotMatch(message, /超出墙体/)
})

test('windowSceneError：窗宽与窗顶同时越界时先报窗宽（最常见的 3 mm 场景）', () => {
  const message = windowSceneError(scene({ wallLength: 1, width: 2, height: 5, sill: 0 }), PPM)
  assert.match(message, /窗宽 2000 mm/)
})

test('windowSceneError：1e-6 量级的浮点误差仍放行，1 mm 不让步', () => {
  const length = measuredLength(3)
  assert.equal(windowSceneError(scene({ wallLength: 3, width: length + 5e-7 }), PPM), '', '浮点尾巴不该拦住用户')
  assert.match(windowSceneError(scene({ wallLength: 3, width: length + 0.001 }), PPM), /窗宽/)
})

test('windowSceneError：普通窗 / 无 windowDesign 的窗不参与几何校验', () => {
  assert.equal(windowSceneError(scene({ wallLength: 0.5, width: 20, mode: 'ordinary' }), PPM), '')
  const noDesign = scene({ wallLength: 0.5, width: 20 })
  delete noDesign.windows[0].windowDesign
  assert.equal(windowSceneError(noDesign, PPM), '')
})

test('windowSceneError：缺墙体时报「缺少所在墙体」而不是静默通过', () => {
  assert.match(windowSceneError(scene({ withWall: false }), PPM), /缺少所在墙体/)
})

test('windowTopologyError：复用同一套几何判据（改墙前先拦一次）', () => {
  const before = scene()
  const after = scene({ wallLength: 1.2 }) // 窗 1.5 m 塞不进 1.2 m 的墙
  assert.match(windowTopologyError(before, after, PPM), /窗宽 1500 mm/)
})

test('windowTopologyError：改动前就存在的越界不拦别的编辑', () => {
  // 旧草稿里有一扇本来就越界的窗。用户改别的东西时不能被它一直回滚 ——
  // 否则整个编辑器卡死（既修不了它，也做不了任何事）。
  const design = { version: 1, mode: 'custom', interiorSide: 1, layout: leaf('fixed') }
  const broken = scene({ wallLength: 1, width: 1.5 })
  const stillBroken = scene({ wallLength: 1, width: 1.5 })
  stillBroken.windows.push({
    id: 'window-2',
    wallId: 'wall-1',
    t: 0.1,
    width: 0.4,
    height: 1,
    sill: 0.4,
    windowDesign: JSON.parse(JSON.stringify(design)),
  })
  assert.equal(windowTopologyError(broken, stillBroken, PPM), '', '既存越界不该阻断无关改动')
  // 但本次改动把另一扇窗弄越界，仍然要拦，并且指名是第 2 扇。
  const worse = scene({ wallLength: 1, width: 1.5 })
  worse.windows.push({
    id: 'window-2',
    wallId: 'wall-1',
    t: 0.1,
    width: 2,
    height: 1,
    sill: 0.4,
    windowDesign: JSON.parse(JSON.stringify(design)),
  })
  assert.match(windowTopologyError(broken, worse, PPM), /第 2 扇窗户/)
})

/* ---------------- 下面的两条是「接线」契约，不是几何 ----------------
 * 几何判对了但接线错了，用户看到的仍然是「点了没反应」，所以一起钉死。 */

/** 从源码里切出一个函数的函数体：到下一个顶层 `};` / 顶层 `}` 为止。 */
function functionBody(source, marker, endMarker) {
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `源码里找不到 ${marker}`)
  const end = source.indexOf(endMarker, start)
  assert.notEqual(end, -1, `${marker} 之后找不到结束标记 ${endMarker}`)
  return source.slice(start, end)
}

test('落盘被拒时必须 throw 给绘制器，不能 showToast（模态层会盖住 toast）', () => {
  const body = functionBody(wiringSource, 'const applyWindowDesign =', 'selectElement("#window-customize")')
  assert.match(body, /if \(sceneError\) throw Error\(sceneError\)/, 'sceneError 必须冒泡到绘制器的 try/catch')
  assert.doesNotMatch(body, /showToast\(/, 'showToast 在 <dialog> 顶层的 backdrop 后面，用户看不见')
})

test('绘制器把 apply 的异常写进自己的 #wd-notice 并保持打开', () => {
  const body = functionBody(designerSource, 'query("apply").onclick =', 'dialog.addEventListener("keydown"')
  assert.match(body, /catch \(error\)/, 'apply 必须自己兜住异常')
  assert.match(body, /notify\(\(error as Error\)\.message\)/, '异常要落到 #wd-notice 提示条')
  assert.match(body, /onApply\(applied\) !== false && close\(\)/, '返回 false 时保持打开，异常时也不关闭')
})

test('绘制器给数字输入接线 ± 步进（否则 mm 靠键盘敲）', () => {
  assert.match(designerSource, /initializeNumberInputs\(dialog\)/, '动态 append 的弹窗必须自己初始化一次步进器')
})

test('未应用的修改不能被一次 Esc / 误点 × 悄悄丢掉', () => {
  // 绘制器里的修改只有「应用窗型」才进文档，没有自动保存；原来 cancel / close-dialog /
  // 对话框 cancel 事件都直连 close()，误触一次就是整场设计归零。
  assert.match(designerSource, /function requestClose\(/, '关闭必须走带确认的入口')
  assert.match(designerSource, /if \(!isDirty\(\)\) return close\(\)/, '没有修改时不能多问一遍')
  assert.match(
    designerSource,
    /for \(const actionId of \["cancel", "close-dialog"\]\) query\(actionId\)\.onclick = requestClose/,
    '「取消」和 × 都要走确认',
  )
  const cancelEvent = functionBody(designerSource, 'dialog.addEventListener("cancel"', 'query("apply").onclick')
  assert.match(cancelEvent, /requestClose\(\)/, 'Esc 也要走确认')
})

/* ---------------- 保存链路：windowDesign 不能在归一化里被挑掉 ----------------
 * `normalizeScenePayload` 按固定字段重建 window（id / wallId / t / width / height / sill /
 * hasDivider）。载入时少带一个字段，等于**整份文档的窗型设计在内存里就已经没了**，
 * 下一次 PUT 只是把这件事实写回服务器 —— 用户看到的正是「改了窗型，保存一次就退回普通窗」。 */
test('入库净化必须原样保留 windowDesign', () => {
  const start = scenePayloadSource.indexOf('windowRecords = Array.isArray(rawScene.windows)')
  assert.notEqual(start, -1, '找不到 window 归一化段')
  const block = scenePayloadSource.slice(start, scenePayloadSource.indexOf('doorRecords', start))
  assert.match(
    block,
    /windowDesign:\s*structuredClone\(rawWindow\.windowDesign\)/,
    'windowDesign 必须带过归一化，否则任何一次保存都会把窗型设计冲掉',
  )
  // 同一个白名单还漏过 remark：`WindowRecord.remark` 是正式字段，3D 窗扇模型名用它，
  // 白名单少写一行 = 载入即丢失，再保存就写不回去。
  assert.match(block, /remark:\s*rawWindow\.remark/, '窗户备注也必须在白名单里')
})
