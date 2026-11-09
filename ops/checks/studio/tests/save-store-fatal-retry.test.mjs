/**
 * 保存状态机的「致命失败后能否靠继续编辑救回来」契约。
 *
 * 现场：后端对整份草稿做窗型几何校验（`domains/studio3d/windows.py`）。只要场景里
 * **任何一扇**自定义窗超出所在墙体，PUT 就 422。这在编辑途中是常态 —— 用户先把墙
 * 改短，再回去改窗。
 *
 * 旧行为（本用例锁的反面）：
 * - 422 被归为 `invalid` → `status = "failed"`；
 * - `markDirty()` 用 `computeDirtyStatus()` 算下一状态，它看到 `failed` 就原样返回，
 *   于是**不排自动保存**；`flushNow()` 也直接 `return fatal`，连 PUT 都不发；
 * - header 上写着「保存失败，修改后重试」，但用户改多少都不会再重试一次 ——
 *   只有刷新页面才恢复。用户看到的就是「保存机制坏了」。
 *
 * 这里钉两件事：
 * 1. 422 之后继续编辑，状态机必须回到可保存并真的再发一次 PUT；
 * 2. 成功后回到 `saved`，且不会因为重试把 revision 打乱。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const SAVE_STORE = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/app/3d-studio/authoring/store/save-store.ts', import.meta.url),
)
const { StudioSaveStore } = await import(SAVE_STORE)

/** 只实现 save-store 真正调用的那几个方法；内容是什么不重要，脏标记靠外部控制。 */
function fakeDocumentStore(initialScene = { walls: [], windows: [] }) {
  let dirty = true
  let revision = 7
  let scene = initialScene
  return {
    isDirty: () => dirty,
    setDirty: (value) => (dirty = value),
    getLoadedRevision: () => revision,
    getDocument: () => scene,
    getRuntimeSceneRevision: () => 0,
    applySaved: (payload) => {
      revision = payload.revision
      scene = payload.scene ?? scene
      dirty = false
    },
    applyLoaded: (payload) => {
      revision = payload.revision
      scene = payload.scene ?? scene
      dirty = false
    },
  }
}

/** 手动推进定时器：save-store 的自动保存全部走注入的 timers。 */
function fakeTimers() {
  const pending = new Map()
  let nextId = 1
  return {
    setTimeout(handler) {
      const id = nextId++
      pending.set(id, handler)
      return id
    },
    clearTimeout(id) {
      pending.delete(id)
    },
    async flushAll() {
      const handlers = [...pending.values()]
      pending.clear()
      for (const handler of handlers) handler()
      await new Promise((resolve) => setImmediate(resolve))
    },
    get size() {
      return pending.size
    },
  }
}

const INVALID_422 = {
  status: 422,
  detail: '自定义窗户超出墙体，请先调整窗宽、窗高或窗台。',
  message: '自定义窗户超出墙体，请先调整窗宽、窗高或窗台。',
}

function makeStore(docStore, timers, responses) {
  let putCount = 0
  const store = new StudioSaveStore({
    documentStore: docStore,
    timers,
    transport: {
      load: async () => ({ ok: true, payload: { revision: 1, scene: docStore.getDocument() } }),
      put: async (request) => {
        putCount += 1
        const next = responses.shift()
        if (!next) return { ok: false, error: INVALID_422 }
        if (next === 'invalid') return { ok: false, error: INVALID_422 }
        if (typeof next === 'object') return { ok: false, error: next }
        return { ok: true, payload: { revision: request.revision + 1, scene: request.scene } }
      },
    },
    now: () => 1_000,
  })
  return { store, counts: () => putCount }
}

test('422 致命失败后继续编辑：状态回到 dirty，不必刷新页面', async () => {
  const docStore = fakeDocumentStore()
  const timers = fakeTimers()
  const { store } = makeStore(docStore, timers, ['invalid'])

  store.markDirty()
  await timers.flushAll()
  assert.equal(store.getState().status, 'failed', '第一次 PUT 422 应进入 failed')

  // 用户改了一处（例如把窗宽缩窄）：内容变了，脏标记仍在。
  store.markDirty()
  assert.notEqual(store.getState().status, 'failed', '继续编辑后不得仍停在 failed')
  assert.equal(store.getState().status, 'dirty')
  assert.ok(timers.size > 0, '必须重新排一次自动保存，否则「修改后重试」是空话')
})

test('422 之后继续编辑会真的再发一次 PUT，成功后回到 saved', async () => {
  const docStore = fakeDocumentStore()
  const timers = fakeTimers()
  const { store, counts } = makeStore(docStore, timers, ['invalid', 'ok'])

  store.markDirty()
  await timers.flushAll()
  assert.equal(counts(), 1)

  store.markDirty()
  await timers.flushAll()
  assert.equal(counts(), 2, '第二次编辑必须触发新的保存请求')
  assert.equal(store.getState().status, 'saved')
  assert.equal(store.getState().lastError, null)
})

test('422 之后直接手动 flushNow 也仍然拒绝（没改就别拿同一份坏数据反复打后端）', async () => {
  const docStore = fakeDocumentStore()
  const timers = fakeTimers()
  const { store, counts } = makeStore(docStore, timers, ['invalid'])

  store.markDirty()
  await timers.flushAll()
  const result = await store.flushNow()
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'fatal')
  assert.equal(counts(), 1, '没有新改动时不该再发 PUT')
})

test('可重试失败（500）不受影响：仍走退避，不退回 dirty', async () => {
  const docStore = fakeDocumentStore()
  const timers = fakeTimers()
  const { store } = makeStore(docStore, timers, [{ status: 500 }])

  // 第一次 PUT 由 flushNow 直接触发，避开定时器。
  const first = await store.flushNow()
  assert.equal(first.ok, false)
  assert.equal(first.reason, 'retry-scheduled')
  assert.equal(store.getState().status, 'retrying')
  assert.equal(store.getState().attempt, 1)
})

const CONFIRMATION_428 = {
  status: 428,
  detail: {
    code: 'STUDIO3D_INTERACTION_CONFIRMATION',
    token: 'confirm-token-1',
    message: '删除将同步移除关联的 3D 交互配置。',
    impacts: [{ projectId: 'p1' }],
    projects: ['客厅'],
  },
  message: '删除将同步移除关联的 3D 交互配置。',
}

test('428 取消确认后保持 blocked：不自动再发无 token 的 PUT', async () => {
  const docStore = fakeDocumentStore()
  const timers = fakeTimers()
  const { store, counts } = makeStore(docStore, timers, [CONFIRMATION_428])

  const first = await store.flushNow()
  assert.equal(first.ok, false)
  assert.equal(first.reason, 'confirmation-required')
  assert.equal(store.getState().status, 'blocked')
  assert.equal(counts(), 1)

  store.cancelConfirmation()
  assert.equal(store.getState().status, 'blocked', '取消后仍 blocked，避免 autosave 立刻重撞 428')
  assert.equal(store.getState().pendingConfirmation, null)

  store.scheduleAutosave(0)
  await timers.flushAll()
  assert.equal(counts(), 1, 'blocked 期间不得再排自动保存')

  const blockedFlush = await store.flushNow()
  assert.equal(blockedFlush.ok, false)
  assert.equal(blockedFlush.reason, 'blocked')
  assert.equal(counts(), 1, '手动 flush 在取消后也不得无 token 重发')
})

test('428 确认后带 token 重试；用户再编辑可从 blocked 恢复', async () => {
  const docStore = fakeDocumentStore()
  const timers = fakeTimers()
  let sawToken = false
  const store = new StudioSaveStore({
    documentStore: docStore,
    timers,
    transport: {
      load: async () => ({ ok: true, payload: { revision: 1, scene: docStore.getDocument() } }),
      put: async (request) => {
        if (!request.interactionConfirmation) {
          return { ok: false, error: CONFIRMATION_428 }
        }
        sawToken = request.interactionConfirmation === 'confirm-token-1'
        return { ok: true, payload: { revision: request.revision + 1, scene: request.scene } }
      },
    },
    now: () => 1_000,
  })

  const first = await store.flushNow()
  assert.equal(first.reason, 'confirmation-required')

  const confirmed = await store.confirmInteraction('confirm-token-1')
  assert.equal(confirmed.ok, true)
  assert.equal(sawToken, true)
  assert.equal(store.getState().status, 'saved')

  // 再次制造 428 → 取消 → 继续编辑必须能重新排期。
  docStore.setDirty(true)
  const again = await store.flushNow()
  assert.equal(again.reason, 'confirmation-required')
  store.cancelConfirmation()
  store.markDirty()
  assert.equal(store.getState().status, 'dirty')
  assert.ok(timers.size > 0, '取消确认后再编辑应重新排自动保存')
})
