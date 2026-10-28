/**
 * 摄像头请求预算（0.8.1 `withCameraHttpSlot`）的契约测试。
 *
 * 这套预算的失败模式很隐蔽：并发没限住时表现为「摄像头偶尔转圈」，
 * 限得太死或 slot 泄漏时表现为「所有摄像头一起卡死且再也不恢复」。
 * 所以这里锁四条：并发上限、FIFO 顺序、排队期间 abort 必须让位、异常也要归还 slot。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/camera/camera-budget.ts', import.meta.url),
)

const { createCameraRequestBudget } = await import(MODULE)

function deferred() {
  let resolve, reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('并发不超过上限，按 FIFO 推进', async () => {
  const budget = createCameraRequestBudget(2)
  let activeCount = 0
  let peakCount = 0
  const started = []
  const gates = [deferred(), deferred(), deferred()]

  const tasks = gates.map((gate, index) =>
    budget(async () => {
      started.push(index)
      activeCount += 1
      peakCount = Math.max(peakCount, activeCount)
      await gate.promise
      activeCount -= 1
      return index
    }),
  )

  // 前两路立刻起跑，第三路排队
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(started, [0, 1])

  gates[0].resolve()
  assert.equal(await tasks[0], 0)
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(started, [0, 1, 2])

  gates[1].resolve()
  gates[2].resolve()
  assert.deepEqual(await Promise.all(tasks.slice(1)), [1, 2])
  assert.equal(peakCount, 2)
})

test('排队期间 abort：从队列摘掉并拒绝，不占 slot', async () => {
  const budget = createCameraRequestBudget(1)
  const runningGate = deferred()
  let runningStarted = false
  const runningTask = budget(async () => {
    runningStarted = true
    await runningGate.promise
    return 'running'
  })
  await Promise.resolve()
  assert.equal(runningStarted, true)

  const queuedController = new AbortController()
  let queuedStarted = false
  const queuedTask = budget(async () => {
    queuedStarted = true
    return 'queued'
  }, queuedController.signal)

  // 让出两拍让 queuedTask 真正进队列
  await Promise.resolve()
  await Promise.resolve()
  queuedController.abort(new Error('cancelled-while-queued'))
  await assert.rejects(queuedTask)
  assert.equal(queuedStarted, false)

  runningGate.resolve()
  assert.equal(await runningTask, 'running')

  // slot 已归还：下一路能立刻起跑
  assert.equal(await budget(async () => 'after'), 'after')
})

test('任务抛异常也会归还 slot', async () => {
  const budget = createCameraRequestBudget(1)
  await assert.rejects(
    budget(async () => {
      throw new Error('boom')
    }),
    /boom/,
  )
  assert.equal(await budget(async () => 'next'), 'next')
})

test('已 abort 的信号不会起跑', async () => {
  const budget = createCameraRequestBudget(1)
  const abortedController = new AbortController()
  abortedController.abort(new Error('already-aborted'))
  let started = false
  await assert.rejects(
    budget(async () => {
      started = true
      return 'never'
    }, abortedController.signal),
  )
  assert.equal(started, false)
})
