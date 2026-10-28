/**
 * 灯光流「两槽交接」（0.8.1 `light-stream.js`）的契约测试。
 *
 * 这套实现真正修的是**空窗**：0.8.0 一旦订阅变更 / 收到 `resync_required` / 连接抖动，
 * 就把状态清空再重连，舞台侧整片实体一起变 unavailable。所以这里锁死三条：
 *
 * 1. 订阅变更时旧值必须继续供数，直到新连接拿到 snapshot；
 * 2. 新连接拿到 snapshot 才晋升，旧 socket 随即关闭（不能泄漏）；
 * 3. 失效范围要对：鉴权关闭码整体失效且不重试，普通断连只失效该槽服务过的实体。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MODULE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/light/light-stream.ts', import.meta.url),
)

const { createLightStream } = await import(MODULE)

class FakeSocket {
  constructor(url) {
    this.url = url
    this.listeners = new Map()
    this.sent = []
    this.closed = false
  }
  addEventListener(name, handler) {
    const handlers = this.listeners.get(name)
    if (handlers) handlers.push(handler)
    else this.listeners.set(name, [handler])
  }
  removeEventListener(name, handler) {
    const handlers = this.listeners.get(name) || []
    const index = handlers.indexOf(handler)
    index >= 0 && handlers.splice(index, 1)
  }
  send(payload) {
    this.sent.push(JSON.parse(payload))
  }
  close() {
    this.closed = true
  }
  emit(name, event) {
    for (const handler of [...(this.listeners.get(name) || [])]) handler(event)
  }
  open() {
    this.emit('open', {})
  }
  deliver(payload) {
    this.emit('message', { data: JSON.stringify(payload) })
  }
}

function createClock() {
  let nextTimerId = 0
  const timers = new Map()
  return {
    setTimer(callback, delayMs) {
      const timerId = ++nextTimerId
      timers.set(timerId, { callback, delayMs })
      return timerId
    },
    clearTimer(timerId) {
      timers.delete(timerId)
    },
    delays() {
      return [...timers.values()].map((timer) => timer.delayMs)
    },
    runWithDelay(delayMs) {
      const dueTimers = [...timers.entries()].filter(([, timer]) => timer.delayMs === delayMs)
      for (const [timerId, timer] of dueTimers) (timers.delete(timerId), timer.callback())
      return dueTimers.length
    },
  }
}

function createHarness() {
  const sockets = []
  const clock = createClock()
  const emittedStates = []
  const invalidatedBatches = []
  const stream = createLightStream({
    socketURL: 'ws://test/runtime',
    createSocket: (url) => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onStates: (states) => emittedStates.push(states),
    onInvalidate: (entityIds) => invalidatedBatches.push(entityIds),
  })
  return {
    stream,
    sockets,
    clock,
    emittedStates,
    invalidatedBatches,
    lastStates: () => emittedStates[emittedStates.length - 1],
  }
}

test('订阅变更时旧值继续供数，不闪空', () => {
  const harness = createHarness()
  harness.stream.setActive(true)
  harness.stream.configure(['light.a'])

  assert.equal(harness.sockets.length, 1)
  harness.sockets[0].open()
  assert.deepEqual(harness.sockets[0].sent.at(-1), {
    type: 'subscribe',
    entityIds: ['light.a'],
  })
  harness.sockets[0].deliver({
    type: 'snapshot',
    states: [{ entityId: 'light.a', state: 'on' }],
  })
  assert.equal(harness.lastStates()['light.a'].state, 'on')

  harness.emittedStates.length = 0
  harness.stream.configure(['light.a', 'light.b'])

  // 关键断言：不是 `{}`，也不是把 light.a 降级成 unavailable。
  assert.equal(harness.emittedStates.length, 1)
  assert.equal(harness.lastStates()['light.a'].state, 'on')
  assert.equal(harness.lastStates()['light.b'].state, 'unavailable')
  // 旧连接仍在供数，新连接并行建起来 —— 这就是「双 socket」。
  assert.equal(harness.sockets.length, 2)
  assert.equal(harness.sockets[0].closed, false)
})

test('新连接拿到 snapshot 才晋升，旧 socket 随即关闭', () => {
  const harness = createHarness()
  harness.stream.setActive(true)
  harness.stream.configure(['light.a'])
  harness.sockets[0].open()
  harness.sockets[0].deliver({
    type: 'snapshot',
    states: [{ entityId: 'light.a', state: 'on' }],
  })

  harness.stream.configure(['light.a', 'light.b'])
  const handoverSocket = harness.sockets[1]
  handoverSocket.open()
  assert.deepEqual(handoverSocket.sent.at(-1), {
    type: 'subscribe',
    entityIds: ['light.a', 'light.b'],
  })

  // 还没收到 snapshot：旧值仍然有效。
  assert.equal(harness.lastStates()['light.a'].state, 'on')
  assert.equal(harness.sockets[0].closed, false)

  handoverSocket.deliver({
    type: 'snapshot',
    states: [
      { entityId: 'light.a', state: 'off' },
      { entityId: 'light.b', state: 'on' },
    ],
  })

  assert.equal(harness.lastStates()['light.a'].state, 'off')
  assert.equal(harness.lastStates()['light.b'].state, 'on')
  assert.equal(harness.sockets[0].closed, true, '晋升后旧连接必须被关掉，否则会累积 socket')
})

test('resync_required 立即重连，不等待退避', () => {
  const harness = createHarness()
  harness.stream.setActive(true)
  harness.stream.configure(['light.a'])
  harness.sockets[0].open()
  harness.sockets[0].deliver({
    type: 'snapshot',
    states: [{ entityId: 'light.a', state: 'on' }],
  })

  harness.sockets[0].deliver({ type: 'resync_required' })

  assert.equal(harness.sockets.length, 2, '重同步必须立刻建新连接')
  assert.deepEqual(harness.invalidatedBatches, [['light.a']], '重同步必须让历史失效')
  // 不能留下 500ms 的退避定时器：新连接已经建好了。
  assert.equal(harness.clock.delays().includes(500), false)
})

test('鉴权类关闭码整体失效且永不重连', () => {
  const harness = createHarness()
  harness.stream.setActive(true)
  harness.stream.configure(['light.a', 'light.b'])
  harness.sockets[0].open()
  harness.sockets[0].deliver({
    type: 'snapshot',
    states: [
      { entityId: 'light.a', state: 'on' },
      { entityId: 'light.b', state: 'off' },
    ],
  })

  harness.sockets[0].emit('close', { code: 4401 })

  assert.deepEqual(harness.invalidatedBatches, [['light.a', 'light.b']])
  assert.equal(harness.sockets.length, 1, '4401 不能重试')
  assert.equal(harness.clock.delays().length, 0, '4401 之后不能留任何定时器')
})

test('普通断连只失效该槽服务过的实体，并按退避重连', () => {
  const harness = createHarness()
  harness.stream.setActive(true)
  harness.stream.configure(['light.a'])
  harness.sockets[0].open()
  harness.sockets[0].deliver({
    type: 'snapshot',
    states: [{ entityId: 'light.a', state: 'on' }],
  })

  harness.sockets[0].emit('close', { code: 1006 })

  assert.deepEqual(harness.invalidatedBatches, [['light.a']])
  assert.equal(harness.clock.runWithDelay(500), 1, '第一次退避是 500ms')
  assert.equal(harness.sockets.length, 2)
})

test('bfcache 冻结保留旧值，恢复后先渲染旧值再被新快照覆盖', () => {
  const harness = createHarness()
  harness.stream.setActive(true)
  harness.stream.configure(['light.a'])
  harness.sockets[0].open()
  harness.sockets[0].deliver({
    type: 'snapshot',
    states: [{ entityId: 'light.a', state: 'on' }],
  })

  harness.stream.suspend()
  assert.equal(harness.sockets[0].closed, true)
  assert.equal(harness.invalidatedBatches.length, 0, '冻结不算失效：不能清历史')

  harness.stream.resume()
  assert.equal(harness.sockets.length, 2)
  // 新连接还没 snapshot：既不能推空对象，也不能把旧值降级 —— 舞台侧要能按旧值继续渲染。
  assert.equal(harness.lastStates()['light.a'].state, 'on')
  assert.equal(harness.emittedStates.at(-1)['light.a'].state, 'on')

  harness.sockets[1].open()
  harness.sockets[1].deliver({
    type: 'snapshot',
    states: [{ entityId: 'light.a', state: 'off' }],
  })
  assert.equal(harness.lastStates()['light.a'].state, 'off')
})

test('setActive(false) 关闭全部连接并让历史失效', () => {
  const harness = createHarness()
  harness.stream.setActive(true)
  harness.stream.configure(['light.a'])
  harness.sockets[0].open()
  harness.sockets[0].deliver({
    type: 'snapshot',
    states: [{ entityId: 'light.a', state: 'on' }],
  })

  harness.stream.setActive(false)

  assert.equal(harness.sockets[0].closed, true)
  assert.deepEqual(harness.invalidatedBatches, [['light.a']])
  assert.deepEqual(harness.lastStates(), {})
})

test('dispose 之后不再建连接，也不回调失效', () => {
  const harness = createHarness()
  harness.stream.setActive(true)
  harness.stream.configure(['light.a'])
  const socketsBeforeDispose = harness.sockets.length

  harness.stream.dispose()
  harness.stream.configure(['light.b'])

  assert.equal(harness.sockets.length, socketsBeforeDispose)
  assert.equal(harness.invalidatedBatches.length, 0)
})
