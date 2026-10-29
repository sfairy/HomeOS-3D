/**
 * 户型图里方向键微调的「屏幕方向」契约。
 *
 * 平面图可以被整块旋转（`#rotate-plan-view` 把角度存进草稿的 `planViewRotation`），
 * 渲染时是 `screenDelta = R(rotation) · planDelta`。方向键想表达的是屏幕上的上下左右，
 * 所以平面增量必须是 `R(-rotation) · arrow`；旧实现直接把方向键当平面增量，转 180°
 * 后上下左右全反、转 90° 后上下变左右 —— 用户看到的就是「方向是反的」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const METRICS = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-edit-metrics.ts',
    import.meta.url),
)

const { planDirectionForScreenArrow } = await import(METRICS)

const ARROWS = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}
const ROTATIONS = [0, 90, 180, 270]

/** 平面图渲染时的旋转变换（与 `refreshStudioView` 的 `canvas.rotate` 同口径）。 */
function renderToScreen(planDirection, rotationDegrees) {
  const radians = (rotationDegrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: planDirection.x * cos - planDirection.y * sin,
    y: planDirection.x * sin + planDirection.y * cos,
  }
}

test('任意画布旋转下，按键方向都等于模型在屏幕上的移动方向', () => {
  for (const rotation of ROTATIONS) {
    for (const [keyName, arrow] of Object.entries(ARROWS)) {
      const planDirection = planDirectionForScreenArrow(arrow, rotation)
      const screenDirection = renderToScreen(planDirection, rotation)
      assert.ok(
        Math.abs(screenDirection.x - arrow.x) < 1e-6,
        `${rotation}° 下按 ${keyName}：水平移动 ${screenDirection.x.toFixed(3)}，应为 ${arrow.x}`,
      )
      assert.ok(
        Math.abs(screenDirection.y - arrow.y) < 1e-6,
        `${rotation}° 下按 ${keyName}：垂直移动 ${screenDirection.y.toFixed(3)}，应为 ${arrow.y}`,
      )
    }
  }
})

test('转 180° 时平面增量正好反向（旧实现「方向反了」的那个分支）', () => {
  assert.deepEqual(planDirectionForScreenArrow(ARROWS.ArrowLeft, 180), { x: 1, y: 0 })
  assert.deepEqual(planDirectionForScreenArrow(ARROWS.ArrowRight, 180), { x: -1, y: 0 })
  assert.deepEqual(planDirectionForScreenArrow(ARROWS.ArrowUp, 180), { x: 0, y: 1 })
  assert.deepEqual(planDirectionForScreenArrow(ARROWS.ArrowDown, 180), { x: 0, y: -1 })
})

test('未旋转时就是原始方向，且不带浮点尾巴', () => {
  for (const arrow of Object.values(ARROWS)) {
    assert.deepEqual(planDirectionForScreenArrow(arrow, 0), arrow)
  }
  const quarterTurn = planDirectionForScreenArrow(ARROWS.ArrowRight, 90)
  assert.deepEqual(quarterTurn, { x: 0, y: -1 })
  assert.equal(Object.is(quarterTurn.x, -0), false, '不要把 -0 写进物件坐标')
})

test('旋转角缺失或非法时按 0° 处理（旧草稿没有这个字段）', () => {
  for (const invalidRotation of [undefined, null, Number.NaN, 0])
    assert.deepEqual(planDirectionForScreenArrow(ARROWS.ArrowDown, invalidRotation), { x: 0, y: 1 })
})
