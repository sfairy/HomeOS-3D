/**
 * 鼠标拖动落点的契约测试（`planDragDelta` + `handlePointerUp` 的 move-items 分支）。
 *
 * 0.7.8 的拖动把位移量化到 5cm（按 Alt 1cm）网格，于是物件永远落在网格上：想把它贴到
 * 墙线、贴着另一件家具的边、或者只挪 8mm，拖动做不到 —— 鼠标明明指着那里，松手物件却
 * 跳到旁边一格。拖动是「跟手」手势，应该落在指针下的任意位置；按步长走的是键盘方向键。
 *
 * 这里钉死两件事：
 * 1. `planDragDelta` 原样返回指针位移（不做任何取整），Shift 只锁轴；
 * 2. move-items 分支不再把位移交给步进取整函数 —— 否则上面那条语义会被悄悄改回去。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const GEOMETRY = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/3d-studio/plan/geometry.ts', import.meta.url),
)
const POINTER_UP = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/functions/handlePointerUp.ts',
    import.meta.url,
  ),
)
const { planDragDelta } = await import(GEOMETRY)

test('planDragDelta：原样返回指针位移，不量化到网格', () => {
  const start = { x: 400, y: 300 }
  // 像素级零头（屏幕上 1px = 1cm 时就是 7mm 这种位置）必须保留。
  for (const [currentX, currentY, expectedX, expectedY] of [
    [400, 300, 0, 0],
    [407, 300, 7, 0],
    [413.37, 318.62, 13.37, 18.62],
    [431, 437, 31, 137],
    [-12.5, 0.25, -412.5, -299.75],
  ]) {
    const delta = planDragDelta(start, { x: currentX, y: currentY })
    assert.equal(delta.x, expectedX, `x 位移被改动：${delta.x} != ${expectedX}`)
    assert.equal(delta.y, expectedY, `y 位移被改动：${delta.y} != ${expectedY}`)
  }
})

test('planDragDelta：Shift 只锁轴，不改变被保留轴上的位移', () => {
  const start = { x: 400, y: 300 }

  assert.deepEqual(planDragDelta(start, { x: 418.62, y: 313.37 }, true), { x: 18.62, y: 0 })
  assert.deepEqual(planDragDelta(start, { x: 405, y: 361.25 }, true), { x: 0, y: 61.25 })
  // 两轴等长时锁在 x 轴（与旧实现同口径，避免「抖一下方向就翻」）。
  assert.deepEqual(planDragDelta(start, { x: 420, y: 280 }, true), { x: 20, y: 0 })
  assert.deepEqual(planDragDelta(start, { x: 420, y: 280 }, false), { x: 20, y: -20 })
})

test('move-items 分支不再按步进量化位移', () => {
  const source = readFileSync(POINTER_UP, 'utf8'),
    branchStart = source.indexOf('marqueeBox.type === "move-items"'),
    branchEnd = source.indexOf('marqueeBox.type === "resize-item"')

  assert.ok(branchStart > 0 && branchEnd > branchStart, '找不到 move-items 分支')
  const moveBranch = source.slice(branchStart, branchEnd)
  for (const forbidden of ['snapEditDelta', 'moveStepMeters', 'widthStep', 'depthStep', 'Math.round'])
    assert.ok(
      !moveBranch.includes(forbidden),
      `move-items 分支又出现了 ${forbidden}：鼠标拖动会退回固定网格`,
    )
  assert.ok(
    moveBranch.includes('planDragDelta'),
    'move-items 分支必须走 planDragDelta（唯一的位移口径）',
  )
})
