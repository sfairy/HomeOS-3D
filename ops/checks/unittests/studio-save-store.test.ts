/**
 * 户型草稿保存状态机：**保存期间继续编辑**不能丢。
 *
 * 这是 `StudioSaveStore.flushNow()` 最容易漏的一条业务边界：
 * PUT 发出去的是发起时的一份快照，保存期间用户还能继续拖拽 / 改属性。
 * 旧实现收到成功响应就 `applySaved()` 清脏并把 revision 推进——
 * 那些没进 PUT 的改动于是再也不会被自动保存，界面看着是新内容，刷新后回退。
 */
import { describe, expect, test } from 'bun:test'

import { StudioDocumentStore } from '../../../homeos/frontend/src/studio/authoring/store/document-store'
import {
  facadeDirtyForSaveState,
  type SaveTransportPutRequest,
  type SaveTransportResult,
  StudioSaveStore,
} from '../../../homeos/frontend/src/studio/authoring/store/save-store'

type TestScene = { name: string; floors: unknown[] }
type DeferredPut = {
  request: SaveTransportPutRequest
  resolve: (result: SaveTransportResult) => void
}

function createHarness() {
  let liveScene: TestScene = { name: 'A', floors: [] }
  const documentStore = new StudioDocumentStore()
  documentStore.applyLoaded({ revision: 1, scene: liveScene })

  const puts: DeferredPut[] = []
  const timers: Array<{ handle: number; handler: () => void; delay: number }> = []
  let timerSeed = 0

  const store = new StudioSaveStore({
    documentStore,
    transport: {
      load: async () => ({ ok: true, payload: { revision: 1, scene: liveScene } }),
      put: (request) =>
        new Promise<SaveTransportResult>((resolve) => {
          puts.push({ request, resolve })
        }),
    },
    getScene: () => liveScene,
    timers: {
      setTimeout: (handler, delay) => {
        timers.push({ handle: ++timerSeed, handler, delay })
        return timerSeed
      },
      clearTimeout: (handle) => {
        const index = timers.findIndex((timer) => timer.handle === handle)
        if (index >= 0) timers.splice(index, 1)
      },
    },
    isOnline: () => true,
  })

  /** 本地一次改动：文档 store 与状态机都要收到（生产里由 markDocumentDirty 统一调用）。 */
  function edit(nextScene: TestScene) {
    liveScene = nextScene
    documentStore.markWholeDocumentDirty()
    store.markDirty()
  }

  return { store, documentStore, puts, timers, edit }
}

describe('保存期间继续编辑', () => {
  test('成功后保持脏，并用新 revision 自动再存一次', async () => {
    const { store, documentStore, puts, edit } = createHarness()
    edit({ name: 'B', floors: [] })

    const firstFlush = store.flushNow()
    expect(puts).toHaveLength(1)
    expect(puts[0]!.request.revision).toBe(1)
    expect(puts[0]!.request.scene.name).toBe('B')

    // PUT 在途：用户又改了一笔（这份内容不在第一个请求体里）。
    edit({ name: 'C', floors: [] })
    expect(documentStore.isDirty()).toBe(true)

    puts[0]!.resolve({ ok: true, payload: { revision: 2, scene: puts[0]!.request.scene } })
    const firstResult = await firstFlush

    expect(firstResult.ok).toBe(true)
    // 关键断言：不能因为服务器回了成功就清掉「保存期间的新改动」。
    expect(documentStore.isDirty()).toBe(true)
    expect(documentStore.getLoadedRevision()).toBe(2)
    expect(store.getState().status).toBe('dirty')

    const secondFlush = store.flushNow()
    expect(puts).toHaveLength(2)
    expect(puts[1]!.request.revision).toBe(2)
    expect(puts[1]!.request.scene.name).toBe('C')

    puts[1]!.resolve({ ok: true, payload: { revision: 3, scene: puts[1]!.request.scene } })
    const secondResult = await secondFlush
    expect(secondResult.ok).toBe(true)
    expect(documentStore.isDirty()).toBe(false)
    expect(documentStore.getLoadedRevision()).toBe(3)
    expect(store.getState().status).toBe('saved')
  })

  test('退出保存也要把保存期间的新改动一起落盘（不能只发一次 PUT 就退出）', async () => {
    const { store, documentStore, puts, edit } = createHarness()
    edit({ name: 'B', floors: [] })

    const exiting = store.requestExit()
    expect(puts).toHaveLength(1)

    edit({ name: 'C', floors: [] })
    puts[0]!.resolve({ ok: true, payload: { revision: 2, scene: puts[0]!.request.scene } })

    // requestExit 不应在第一次 PUT 成功后直接返回：本地仍是脏的。
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(puts).toHaveLength(2)
    expect(puts[1]!.request.revision).toBe(2)
    expect(puts[1]!.request.scene.name).toBe('C')

    puts[1]!.resolve({ ok: true, payload: { revision: 3, scene: puts[1]!.request.scene } })
    const result = await exiting
    expect(result.ok).toBe(true)
    expect(documentStore.isDirty()).toBe(false)
  })

  test('保存失败 / 冲突时顶栏与离开守卫仍视为「未保存」', () => {
    // 有未保存改动：任何文案（包括 error）都必须是脏。
    for (const kind of ['dirty', 'saving', 'error', 'saved', 'idle']) {
      expect(facadeDirtyForSaveState(true, kind)).toBe(true)
    }
    // 已保存 / 加载中 / 只读：干净状态不能误报。
    expect(facadeDirtyForSaveState(false, 'saved')).toBe(false)
    expect(facadeDirtyForSaveState(false, 'idle')).toBe(false)
    // 保存进行中仍算脏：spinner 期间圆点不应先消失。
    expect(facadeDirtyForSaveState(false, 'saving')).toBe(true)
  })

  test('没有并发改动时正常清脏并推进 revision', async () => {
    const { store, documentStore, puts, edit } = createHarness()
    edit({ name: 'B', floors: [] })

    const flush = store.flushNow()
    puts[0]!.resolve({ ok: true, payload: { revision: 2, scene: puts[0]!.request.scene } })
    const result = await flush

    expect(result.ok).toBe(true)
    expect(documentStore.isDirty()).toBe(false)
    expect(documentStore.getLoadedRevision()).toBe(2)
    expect(store.getState().status).toBe('saved')
  })
})
