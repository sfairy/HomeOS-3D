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

const { createCameraRequestBudget, createCameraStreamBudget } = await import(MODULE)

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

test('流预算：2 路长连接，释放后推进队列', async () => {
  const budget = createCameraStreamBudget(2)
  const firstLease = await budget(1)
  const secondLease = await budget(1)
  let thirdAcquired = false
  const thirdPromise = budget(1).then((lease) => {
    thirdAcquired = true
    return lease
  })
  await Promise.resolve()
  assert.equal(thirdAcquired, false)
  firstLease.release()
  const thirdLease = await thirdPromise
  assert.equal(thirdAcquired, true)
  secondLease.release()
  thirdLease.release()
})

test('流预算：高优先级先拿 slot，释放后可重复挂号', async () => {
  const budget = createCameraStreamBudget(1)
  const blockingLease = await budget(0)
  let lowPriorityLease = null
  const lowPriorityPromise = budget(0).then((lease) => (lowPriorityLease = lease))
  let highPriorityLease = null
  const _highPriorityPromise = budget(10).then((lease) => (highPriorityLease = lease))
  await Promise.resolve()
  blockingLease.release()
  // 两路都在排队时，priority=10 的那路先拿到。
  await Promise.resolve()
  assert.equal(highPriorityLease !== null, true)
  assert.equal(lowPriorityLease, null)
  highPriorityLease.release()
  await lowPriorityPromise
  assert.equal(lowPriorityLease !== null, true)
  lowPriorityLease.release()
})

test('流预算：排队期间 abort 直接拒绝且不占 slot', async () => {
  const budget = createCameraStreamBudget(1)
  const blockingLease = await budget(0)
  const controller = new AbortController()
  const queuedPromise = budget(0, controller.signal)
  await Promise.resolve()
  controller.abort(new Error('cancelled-stream'))
  await assert.rejects(queuedPromise)
  blockingLease.release()
  const nextLease = await budget(0)
  nextLease.release()
})
