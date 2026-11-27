/**
 * 布局保存：**保存期间继续编辑**不能丢。
 *
 * 设备端布局是整份 POST（`/config/project/{id}`），请求体在发起时快照。旧实现只要
 * 后端回 200 就 `layoutDirty = false`：保存期间用户继续改的设置既没进本次请求，
 * 也不会再被标记为待保存 —— 界面上是新值，刷新后回退，且没有任何提示。
 *
 * 用注入的 API 精确复现那条时间线：发出请求 → 改配置 → 回包落地。
 */
import { describe, expect, test } from 'bun:test'
import { ref, type Ref } from 'vue'

import { createLayoutPersistence } from '../../../homeos/frontend/src/domain/layout/store/create-layout-persistence'

type SaveCall = { projectId: string; layout: Record<string, unknown> }
type PendingSave = { call: SaveCall; resolve: () => void }

function createHarness() {
  const pendingSaves: PendingSave[] = []
  const layoutConfig: Record<string, unknown> = { externalUrl: '', haConfig: { fallbackUrl: '' } }
  const layoutDirty = ref(false)
  const activeProfileId = ref('default')
  const isConfigLoaded = ref(true)
  const isConfigLoading = ref(false)
  const persistence = createLayoutPersistence({
    layoutConfig,
    layoutDirty: layoutDirty as Ref<boolean>,
    activeProfileId: activeProfileId as Ref<string>,
    isConfigLoaded: isConfigLoaded as Ref<boolean>,
    isConfigLoading: isConfigLoading as Ref<boolean>,
    notify: () => {},
    setSuppressDirtyTracking: () => {},
    api: {
      fetchProject: async () => ({ data: { data: { layout: {}, updatedAt: 'v1' } } }),
      setActiveProject: async () => undefined,
      saveProject: (projectId, payload) =>
        new Promise((resolve) => {
          pendingSaves.push({
            call: { projectId, layout: (payload as { layout: Record<string, unknown> }).layout },
            resolve: () => resolve({ data: { data: { updatedAt: `v${pendingSaves.length + 1}` } } }),
          })
        }),
    },
  })
  return { layoutConfig, layoutDirty, persistence, pendingSaves }
}

/** 让出事件循环，等 saveProject 的 then 链推进到下一次 pending。 */
async function tick() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('布局保存期间继续编辑', () => {
  test('成功后仍保持脏，并用新内容再存一轮', async () => {
    const { layoutConfig, layoutDirty, persistence, pendingSaves } = createHarness()
    layoutDirty.value = true

    const saving = persistence.saveConfig(true)
    await tick()
    expect(pendingSaves).toHaveLength(1)
    expect((pendingSaves[0]!.call.layout as { mobileRoomStats?: unknown }).mobileRoomStats).toBeUndefined()

    // 保存期间用户改了配置（这份内容不在第一个请求体里）。
    layoutConfig.mobileRoomStats = { enabled: true }
    pendingSaves[0]!.resolve()
    await tick()

    // 关键断言：不能因为后端回了 200 就清脏；必须再存一轮。
    expect(pendingSaves.length).toBeGreaterThanOrEqual(2)
    expect((pendingSaves[1]!.call.layout as { mobileRoomStats?: unknown }).mobileRoomStats).toEqual({ enabled: true })

    pendingSaves[1]!.resolve()
    expect(await saving).toBe(true)
    expect(layoutDirty.value).toBe(false)
  })

  test('没有并发改动时只存一轮并清脏', async () => {
    const { layoutDirty, persistence, pendingSaves } = createHarness()
    layoutDirty.value = true
    const saving = persistence.saveConfig(true)
    await tick()
    pendingSaves[0]!.resolve()
    expect(await saving).toBe(true)
    expect(pendingSaves).toHaveLength(1)
    expect(layoutDirty.value).toBe(false)
  })
})
