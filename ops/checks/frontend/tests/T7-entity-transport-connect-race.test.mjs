/**
 * T7 回归：实体 WS 传输层 connect() 的并发/断开竞态。
 *
 * 真实缺陷（HEAD e2c0c567 的 entity-store-transport.ts connect）：
 * - 入口去重只看 socket?.connected || socket?.active，而首次连接在
 *   await deps.hydrateFromEntityCache() 之后才给 socket 赋值。hydrate 是异步
 *   IndexedDB 读，期间再调一次 connect()（App.vue 的 ensureWsConnected 与
 *   main.ts 的 reconnectForAuthChange 在启动/登录瞬间就会各来一次）会同时穿过
 *   去重检查，各自 io() 建连：第二个覆盖模块级 socket 变量，第一个连同其事件
 *   处理器成为泄漏的活连接 —— 每条 WS 事件被两个 socket 各投递一次（重复 toast /
 *   重复批量应用），登出时 disconnect() 也只断开最后一个，旧 socket 继续收数据。
 * - 另一个方向：connect() 在 hydrate 等待期间被 disconnect()（登出 / bfcache
 *   冻结）后不会再检查，仍会建出一个已登出却仍在连的 socket。
 *
 * 断言的是修复后的契约（修复前本文件应失败）：
 * 1. 同一时刻只允许一次在途连接，并发 connect() 复用同一个 Promise；
 * 2. hydrate 只是首连一次性开销，并发下不得执行两次；
 * 3. hydrate 期间发生 disconnect()，本次 connect 必须放弃建连。
 *
 * 为什么要 resolveHook：传输层依赖 '@/...' 别名与 socket.io-client 真实现。
 * 这里把 4 个运行时依赖替换成 data: URL 桩，只让被测文件本身跑真代码；
 * 不加载 Pinia / ws-bind 等下游模块，避免把测试变成集成环境。
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const stub = (globalThis.__T7_TRANSPORT_STUB = {
  ioCalls: 0,
  hydrateCalls: 0,
  bindCalls: 0,
  readyCalls: 0,
  sockets: [],
})

/** 收集被测代码创建的定时器，测试结束统一清掉，避免 12s 兜底定时器拖住进程 */
const pendingTimers = new Set()
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (...args) => {
  const handle = realSetTimeout(...args)
  pendingTimers.add(handle)
  return handle
}
after(() => {
  for (const handle of pendingTimers) clearTimeout(handle)
  pendingTimers.clear()
  globalThis.setTimeout = realSetTimeout
})

const FAKE_MODULES = {
  'socket.io-client': `
    const stub = globalThis.__T7_TRANSPORT_STUB
    export function io(url, opts) {
      stub.ioCalls += 1
      const socket = {
        connected: false,
        active: true,
        removedListeners: 0,
        disconnectCalls: 0,
        io: {},
        removeAllListeners() { this.removedListeners += 1 },
        disconnect() { this.disconnectCalls += 1; this.connected = false; this.active = false },
        on() {},
      }
      stub.sockets.push(socket)
      return socket
    }
  `,
  '@/composables/entity/ws/socket.util': `
    export function buildEntitySocketUrl() { return 'http://stub.invalid' }
    export function buildEntitySocketAuth() { return {} }
    export function buildEntitySocketOptions() { return {} }
  `,
  '@/composables/entity/ws/ws-bind': `
    export function bindEntitySocketHandlers() {
      globalThis.__T7_TRANSPORT_STUB.bindCalls += 1
    }
  `,
  '@/shared/entity/utils/ws-sync': `
    export function createEntitySocketSyncState() { return {} }
  `,
  '@/shared/entity/utils/sync-failure.util': `
    export function handleEntityFallbackFailure() {}
  `,
}

const fakeUrls = Object.fromEntries(
  Object.entries(FAKE_MODULES).map(([specifier, source]) => [
    specifier,
    'data:text/javascript,' + encodeURIComponent(source),
  ]),
)

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (fakeUrls[specifier]) return { url: fakeUrls[specifier], shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const MODULE = new URL(
  '../../../../homeos/frontend/src/stores/entities/entity-store-transport.ts',
  import.meta.url,
).href
const { createEntityTransport } = await import(MODULE)

/** 造一个能跑通 connect() 各分支的最小依赖集合；hydrate 由用例手动控制 */
function makeDeps({ hydrate } = {}) {
  return {
    logger: { debug() {}, info() {}, warn() {} },
    loading: { value: true },
    totalCount: { value: 0 },
    entities: {},
    track: { lastSocketEventAt: 0, lastEventId: 0, stateVersion: 0 },
    getInitialStatesWaitMs: () => 8000,
    hydrateFromEntityCache:
      hydrate ??
      (() => {
        stub.hydrateCalls += 1
        return new Promise(() => {})
      }),
    fetchEntitiesFallback: () => Promise.resolve(true),
    isAuthenticated: () => true,
    persistCacheDirty: () => false,
    persistEntityCacheNow: () => Promise.resolve(),
    cancelPersistCacheTimer: () => {},
    clearHaDisconnectDebounce: () => {},
    clearHaStatusProbe: () => {},
    setConnected: () => {},
    refs: { entitiesStale: { value: false } },
    actions: {},
    listeners: [],
    onTransportReady: () => {
      stub.readyCalls += 1
    },
  }
}

function resetStub() {
  stub.ioCalls = 0
  stub.hydrateCalls = 0
  stub.bindCalls = 0
  stub.readyCalls = 0
  stub.sockets.length = 0
}

test('并发 connect() 复用同一在途连接：只 hydrate 一次、只建一个 socket', async () => {
  resetStub()
  const resolvers = []
  const deps = makeDeps({
    hydrate: () =>
      new Promise((resolve) => {
        stub.hydrateCalls += 1
        resolvers.push(resolve)
      }),
  })
  const transport = createEntityTransport(deps)

  const first = transport.connect()
  assert.equal(stub.hydrateCalls, 1, '首次 connect 应开始 hydrate')
  // 模拟 App.vue 的 ensureWsConnected 与 main.ts 的 reconnectForAuthChange 在
  // hydrate 未完成时先后到达（此时 socket 变量仍为 null，入口守卫穿不过去）。
  const second = transport.connect()

  assert.equal(stub.hydrateCalls, 1, '并发 connect 不得重复 hydrate（修复前为 2）')
  assert.equal(stub.ioCalls, 0, 'hydrate 未完成前不应建 socket')

  for (const resolve of resolvers) resolve(true)
  await Promise.all([first, second])

  assert.equal(stub.ioCalls, 1, '并发 connect 只应创建一个 socket（修复前为 2）')
  assert.equal(stub.bindCalls, 1, '只应绑定一次事件处理器（修复前为 2）')
  assert.equal(stub.readyCalls, 1, '只应通知一次 transport ready（修复前为 2）')
  assert.equal(transport.getSocket(), stub.sockets[0], '返回的 socket 应是被绑定的那个')

  transport.disconnect()
})

test('hydrate 期间 disconnect()（登出/bfcache 冻结）必须放弃本次建连', async () => {
  resetStub()
  let resolveHydrate
  const deps = makeDeps({
    hydrate: () =>
      new Promise((resolve) => {
        stub.hydrateCalls += 1
        resolveHydrate = resolve
      }),
  })
  const transport = createEntityTransport(deps)

  const connecting = transport.connect()
  assert.equal(stub.hydrateCalls, 1)

  // 登出 / 页面冻结发生在 hydrate 完成之前
  transport.disconnect()
  resolveHydrate(true)
  await connecting

  assert.equal(stub.ioCalls, 0, 'disconnect 之后不得再建 socket（修复前为 1）')
  assert.equal(transport.getSocket(), null)

  transport.disconnect()
})
