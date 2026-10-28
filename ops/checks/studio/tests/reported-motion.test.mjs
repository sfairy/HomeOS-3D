/**
 * 上报跟随曲线（0.8.1 `reported-motion`）的契约测试。
 *
 * 这套曲线是「设备每秒上报 1–3 次位置」与「3D 60fps」之间的桥：曲线错了不会报错，
 * 只会表现成晾衣架/窗帘一顿一顿或冲过头。所以这里锁三条最小契约：
 *
 * 1. 曲线端点必须精确落在 from / to（否则每次运动都留下 0.x 的残差）；
 * 2. 单调、不越界（tangent 再大也不能回退或冲出目标）；
 * 3. 速度估算只在同向、合理的间隔内生效；方向翻转必须丢弃旧样本。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/core/reported-motion.ts', import.meta.url),
)

const { motionPosition, reportedMotion, reportInterval } = await import(MODULE)

test('motionPosition：缺省 tangent 走线性，端点精确', () => {
  const motion = { from: 10, to: 90, start: 1000, duration: 400 }
  assert.equal(motionPosition(motion, 1000), 10)
  assert.equal(motionPosition(motion, 1200), 50)
  assert.equal(motionPosition(motion, 1400), 90)
  // 超出时长后夹在终点，不继续外推
  assert.equal(motionPosition(motion, 9000), 90)
})

test('motionPosition：tangent 0–2 全程单调且不越界', () => {
  for (const tangent of [0, 0.25, 0.5, 1, 1.5, 2]) {
    const motion = { from: 0, to: 100, start: 0, duration: 1000, tangent }
    let previous = -Infinity
    for (let timestamp = 0; timestamp <= 1000; timestamp += 10) {
      const value = motionPosition(motion, timestamp)
      assert.ok(Number.isFinite(value), `tangent=${tangent} t=${timestamp} 非有限值`)
      assert.ok(value >= 0 && value <= 100, `tangent=${tangent} t=${timestamp} 越界 ${value}`)
      assert.ok(value >= previous - 1e-9, `tangent=${tangent} t=${timestamp} 回退`)
      previous = value
    }
    assert.equal(motionPosition(motion, 1000), 100)
  }
})

test('reportedMotion：位置没变时返回 null', () => {
  assert.equal(reportedMotion(42, 42, 0, 500, null, null), null)
})

test('reportedMotion：首帧返回带 tangent 的曲线', () => {
  const reports = { samples: [], speed: 0 }
  const motion = reportedMotion(0, 40, 1000, 500, null, reports)
  assert.ok(motion)
  assert.equal(motion.from, 0)
  assert.equal(motion.to, 40)
  assert.equal(motion.start, 1000)
  assert.ok(motion.duration >= 120 && motion.duration <= 5500)
  assert.ok(Number.isFinite(motion.tangent))
  assert.ok(motion.tangent >= 0 && motion.tangent <= 2)
})

test('reportedMotion：同向连续上报会把时长收到「剩余距离 / 速度」附近', () => {
  const reports = { samples: [], speed: 0 }
  // 100ms 内走 20%，即 0.2 %/ms；剩余 60% 时理想时长约 300ms。
  let motion = reportedMotion(0, 20, 1000, 500, null, reports)
  assert.ok(motion)
  motion = reportedMotion(20, 40, 1100, motion.duration, motion, reports)
  assert.ok(motion)
  motion = reportedMotion(40, 60, 1200, motion.duration, motion, reports)
  assert.ok(motion)
  assert.ok(
    motion.duration >= 120 && motion.duration <= 5500,
    `时长未被夹住：${motion.duration}`,
  )
  assert.ok(motion.duration < 500, `同向快速上报后时长应变短，实际 ${motion.duration}`)
})

test('reportedMotion：间隔过长（掉线重连）会丢弃旧样本与速度', () => {
  const reports = { samples: [], speed: 0 }
  let motion = reportedMotion(0, 30, 1000, 500, null, reports)
  motion = reportedMotion(30, 60, 1100, motion.duration, motion, reports)
  assert.ok(reports.speed > 0)
  // 6.8s 没上报：设备掉线过一次，旧速度是错的，必须重新估。
  motion = reportedMotion(60, 20, 7900, motion.duration, motion, reports)
  assert.ok(motion)
  assert.equal(reports.samples.length, 1)
  assert.ok(motion.duration >= 120)
})

test('reportedMotion：样本窗口最多保留 3 条', () => {
  const reports = { samples: [], speed: 0 }
  let motion = reportedMotion(0, 10, 1000, 500, null, reports)
  for (let step = 1; step <= 8; step += 1) {
    const from = step * 10
    motion = reportedMotion(from, from + 10, 1000 + step * 100, motion.duration, motion, reports)
    assert.ok(motion)
    assert.ok(reports.samples.length <= 3, `窗口膨胀到 ${reports.samples.length}`)
  }
})

test('reportInterval：非法间隔退回 fallback，合法间隔做平滑', () => {
  assert.equal(reportInterval(0, 500), 500)
  assert.equal(reportInterval(-10, 500), 500)
  assert.equal(reportInterval(6000, 500), 500)
  // 低于 80ms 的间隔被抬到 80ms，再与旧值按 0.7 / 0.3 混合
  assert.equal(reportInterval(10, 500), Math.max(80, 500 * 0.7 + 80 * 0.3))
  // 正常间隔不会低于本次实测值
  assert.ok(reportInterval(900, 500) >= 900)
})
