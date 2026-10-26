/**
 * 轮询调度器的行为回归（`shared/utils/core/poll-scheduler.ts`）。
 *
 * 守的是四条容易被「顺手重构」改坏的语义：
 * 1. 注册即错峰首跑一次，`runImmediately:false` 时**不**双发；
 * 2. 页面隐藏只暂停 `visibilityAware` 任务，后台常驻任务继续跑；
 * 3. 取消订阅必须真的停表（否则切页后定时器仍在后台唤醒主线程）；
 * 4. 同 key 在错峰窗口内重新注册，旧回调不能再跑一次，首跑后也不能被首次刻度立刻重跑
 *    （2026-10-26 修的两个真实缺陷：旧回调双发 + 启动 1 秒内重复请求）。
 *
 * 页面可见性在模块求值时读取 `document`，所以先装一个假 document 再动态 import；
 * 时间用 `node:test` 的 mock timers 推进，避免真等 1~2 秒。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

globalThis.document = { hidden: false, addEventListener() {} }

const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/shared/utils/core/poll-scheduler.ts', import.meta.url),
)
const { schedulePoll, getPollSchedulerStats, setPollTickMs } = await import(MODULE)

/**
 * 每个用例独占一个假时钟。
 *
 * 必须在用例内取消全部任务：模块里的 `tickTimer` 是单例，若带着上一轮的 mock 定时器句柄
 * 结束，下一轮 `ensureTick()` 会以为「表还在走」而拒绝新建 —— 表现为后续用例一次都不触发。
 */
function sandbox(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] })
  const cancels = []
  return {
    register(key, fn, intervalMs, opts) {
      const cancel = schedulePoll(key, fn, intervalMs, opts)
      cancels.push(cancel)
      return cancel
    },
    dispose() {
      for (const cancel of cancels) cancel()
      cancels.length = 0
    },
  }
}

test('注册后错峰首跑一次（runImmediately 默认 true）', (t) => {
  const box = sandbox(t)
  try {
    let calls = 0
    box.register('immediate', () => { calls += 1 }, 60_000)

    // 最大错峰 7×350ms，推进到窗口之外（含一次刻度）。
    t.mock.timers.tick(2500)

    assert.equal(calls, 1, '首跑不能被紧随其后的刻度再触发一次')
  } finally {
    box.dispose()
  }
})

test('runImmediately:false 时跳过首跑，避免与调用方的显式刷新双发', (t) => {
  const box = sandbox(t)
  try {
    let calls = 0
    box.register('skip-first', () => { calls += 1 }, 60_000, { runImmediately: false })

    t.mock.timers.tick(2500)

    assert.equal(calls, 0)
  } finally {
    box.dispose()
  }
})

test('页面隐藏：感知可见性的任务暂停，后台常驻任务继续', (t) => {
  const box = sandbox(t)
  globalThis.document.hidden = true
  try {
    let uiCalls = 0
    let backgroundCalls = 0
    box.register('ui-clock', () => { uiCalls += 1 }, 60_000, { visibilityAware: true })
    box.register('session-refresh', () => { backgroundCalls += 1 }, 60_000, { visibilityAware: false })

    t.mock.timers.tick(2500)

    assert.equal(uiCalls, 0)
    assert.equal(backgroundCalls, 1)
  } finally {
    globalThis.document.hidden = false
    box.dispose()
  }
})

test('取消订阅后任务被移除，空闲时连刻度定时器一起停', (t) => {
  const box = sandbox(t)
  try {
    const cancel = box.register('temp', () => {}, 60_000)
    assert.equal(getPollSchedulerStats().activeJobs, 1)
    assert.equal(getPollSchedulerStats().ticking, true)

    cancel()
    box.dispose()

    const stats = getPollSchedulerStats()
    assert.equal(stats.activeJobs, 0)
    assert.equal(stats.ticking, false)
  } finally {
    box.dispose()
  }
})

test('同 key 重复注册覆盖旧任务：旧回调不会在错峰窗口内双跑', (t) => {
  const box = sandbox(t)
  try {
    let first = 0
    let second = 0
    box.register('dedupe', () => { first += 1 }, 60_000)
    box.register('dedupe', () => { second += 1 }, 60_000)

    t.mock.timers.tick(2500)

    assert.equal(first, 0, '被覆盖的旧回调不能再执行')
    assert.equal(second, 1)
  } finally {
    box.dispose()
  }
})

test('刻度间隔下限 1000ms（避免误传 0 打满主线程）', () => {
  setPollTickMs(10)
  assert.equal(getPollSchedulerStats().tickMs, 1000)
  setPollTickMs(2000)
  assert.equal(getPollSchedulerStats().tickMs, 2000)
  setPollTickMs(1000)
})

test('按间隔周期执行（1s 最小间隔）', (t) => {
  const box = sandbox(t)
  try {
    let calls = 0
    box.register('periodic', () => { calls += 1 }, 1000, { runImmediately: false })

    t.mock.timers.tick(1000)
    t.mock.timers.tick(1000)

    assert.ok(calls >= 2, `期望至少执行 2 次，实际 ${calls}`)
  } finally {
    box.dispose()
  }
})
