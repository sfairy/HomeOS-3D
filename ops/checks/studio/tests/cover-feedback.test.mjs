/**
 * 窗帘/电机反馈握手的契约（0.8.1 B5）。
 *
 * - `report` 是拖动上报的节流入口：高频指针事件不能每次都改 draft；
 * - 松手（null）必须立刻生效，否则轨道会停在最后一帧；
 * - 切线曲线两端速度为 0，窗帘和电机共用同一条。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/cover/cover-feedback.ts', import.meta.url),
)
const { createCoverFeedback, coverEaseTangent } = await import(moduleUrl)

const railState = (position = 50) => ({
  available: true,
  position,
  axis: 'rail',
  state: 'open',
})

test('切线曲线：0/1 端点固定，中点 0.5，且单调', () => {
  assert.equal(coverEaseTangent(0), 0)
  assert.equal(coverEaseTangent(1), 1)
  assert.equal(coverEaseTangent(0.5), 0.5)
  let previous = 0
  for (let step = 1; step <= 20; step += 1) {
    const next = coverEaseTangent(step / 20)
    assert.ok(next >= previous)
    previous = next
  }
  // 越界值夹紧
  assert.equal(coverEaseTangent(-1), 0)
  assert.equal(coverEaseTangent(2), 1)
})

test('report 按 reportInterval 节流，null 立即生效', () => {
  let timeMs = 0
  const feedback = createCoverFeedback({
    now: () => timeMs,
    commandPreview: true,
    reportInterval: 100,
  })
  feedback.sync('cover:1', railState())
  assert.equal(feedback.report('cover:1', 10, timeMs), true)
  timeMs = 50
  assert.equal(feedback.report('cover:1', 20, timeMs), false)
  assert.equal(feedback.read('cover:1', railState()).position, 10)
  timeMs = 100
  assert.equal(feedback.report('cover:1', 30, timeMs), true)
  assert.equal(feedback.read('cover:1', railState()).position, 30)
  // 清空不受节流影响
  timeMs = 101
  assert.equal(feedback.report('cover:1', null, timeMs), true)
  assert.equal(feedback.read('cover:1', railState()).position, 50)
})

test('probe：未同步时回退初始状态，同步后读缓存', () => {
  const feedback = createCoverFeedback({ commandPreview: true })
  const fallback = railState(42)
  assert.equal(feedback.probe('cover:2', fallback), fallback)
  feedback.sync('cover:2', railState(66))
  assert.equal(feedback.probe('cover:2', fallback).position, 66)
})
