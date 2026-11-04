/**
 * 「一帧重捕哪几条反射记录」的契约。
 *
 * 两种帧必须分开，混淆的后果都是肉眼可见的：
 * - 相机位姿变化时按记录轮转 → 部分楼层的倒影停在上一帧位姿，拖动就是甩尾 / 拖影；
 * - 相机没动时不做预算 → presented 相位一次撞满所有记录（长阻塞）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/reflection/studio-reflection-capture-budget.ts',
    import.meta.url,
  ),
)
const { selectFrameCaptures } = await import(moduleUrl)

const records = ['floor-1', 'floor-2', 'outside']

test('相机位姿变化：整批捕获，绝不让部分倒影停在上一帧位姿', () => {
  const selection = selectFrameCaptures(records, {
    budget: 1,
    rotation: 1,
    cameraChanged: true,
  })
  assert.deepEqual(selection.records, records)
  assert.equal(selection.deferred, 0)
  assert.equal(selection.rotation, 1, '整批捕获不改轮转起点')
})

test('相机没动：按预算轮转，被推迟的记录下一帧排到前面', () => {
  const first = selectFrameCaptures(records, { budget: 2, rotation: 0, cameraChanged: false })
  assert.deepEqual(first.records, ['floor-1', 'floor-2'])
  assert.equal(first.deferred, 1)

  const second = selectFrameCaptures(records, {
    budget: 2,
    rotation: first.rotation,
    cameraChanged: false,
  })
  assert.equal(second.records.includes('outside'), true, '被推迟的记录下一帧必须轮到')
})

test('轮转起点越界 / 取模后仍然稳定（不会饿死尾部记录）', () => {
  const seen = new Set()
  let rotation = 0
  for (let frame = 0; frame < 6; frame += 1) {
    const selection = selectFrameCaptures(records, {
      budget: 1,
      rotation,
      cameraChanged: false,
    })
    selection.records.forEach((record) => seen.add(record))
    rotation = selection.rotation
  }
  assert.deepEqual([...seen].sort(), [...records].sort())
})

test('预算不小于记录数时整批捕获', () => {
  const selection = selectFrameCaptures(records, { budget: 3, rotation: 0, cameraChanged: false })
  assert.deepEqual(selection.records, records)
  assert.equal(selection.deferred, 0)
})

test('非法预算按 1 条处理，空集合不抛错', () => {
  assert.equal(selectFrameCaptures(records, { budget: 0, rotation: 0, cameraChanged: false }).records.length, 1)
  assert.deepEqual(selectFrameCaptures([], { budget: 2, rotation: 0, cameraChanged: false }).records, [])
})

test('不修改传入数组（调用方还在用原记录表）', () => {
  const input = [...records]
  selectFrameCaptures(input, { budget: 1, rotation: 0, cameraChanged: false })
  assert.deepEqual(input, records)
})
