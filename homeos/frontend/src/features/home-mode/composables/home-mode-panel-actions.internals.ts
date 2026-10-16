/**
 * @file home-mode-panel-actions.internals.ts
 * @module frontend/src/features/home-mode
 */
/** 家庭模式面板动作处理器 */
import { onActivated, onMounted } from 'vue'
import { duplicateHomeMode, reorderHomeModes } from '@/services/api/home-modes'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'
import type { useSettingsSave } from '@/composables/settings-kernel/save.internals'
import type { ModeActionDraft } from './draft.internals'
import type {
  ChromeStore,
  HomeModeContextApi,
  HomeModeEditor,
  HomeModesApi,
  HomeModeTabs,
} from './home-mode-panel-derived.internals'
import type { createHomeModePanelDerived } from './home-mode-panel-derived.internals'

export function createHomeModePanelHandlers(d: {
  chrome: ChromeStore
  activeDraft: HomeModeEditor['activeDraft']
  anyModeDraftDirty: ReturnType<typeof createHomeModePanelDerived>['anyModeDraftDirty']
  resolveTabAfterRemove: HomeModeEditor['resolveTabAfterRemove']
  removeDraft: HomeModeEditor['removeDraft']
  activeTab: HomeModeEditor['activeTab']
  refreshDraftFromMode: HomeModeEditor['refreshDraftFromMode']
  activeDraftDirty: HomeModeEditor['activeDraftDirty']
  activeSection: ReturnType<typeof createHomeModePanelDerived>['activeSection']
  cancelBatch: HomeModeEditor['cancelBatch']
  modeTabs: HomeModeTabs
  activeMode: HomeModesApi['activeMode']
  activate: HomeModesApi['activate']
  deactivate: HomeModesApi['deactivate']
  loadContext: HomeModeContextApi['loadContext']
  modes: HomeModesApi['modes']
  fetchModes: HomeModesApi['fetchModes']
  touchOrchCounts: () => void
  seedDefaults: HomeModesApi['seedDefaults']
  createDraft: HomeModeEditor['createDraft']
  validateModeDraft: HomeModeEditor['validateModeDraft']
  buildSaveBody: HomeModeEditor['buildSaveBody']
  runSave: ReturnType<typeof useSettingsSave>['runSave']
  createMode: HomeModesApi['createMode']
  updateMode: HomeModesApi['updateMode']
  deleteMode: HomeModesApi['deleteMode']
}) {
  const {
    chrome,
    activeDraft,
    anyModeDraftDirty,
    resolveTabAfterRemove,
    removeDraft,
    activeTab,
    refreshDraftFromMode,
    activeDraftDirty,
    activeSection,
    cancelBatch,
    modeTabs,
    activeMode,
    activate,
    deactivate,
    loadContext,
    modes,
    fetchModes,
    touchOrchCounts,
    seedDefaults,
    createDraft,
    validateModeDraft,
    buildSaveBody,
    runSave,
    createMode,
    updateMode,
    deleteMode,
  } = d

function handleCancelDraft() {
  const draft = activeDraft.value
  if (!draft || !anyModeDraftDirty.value) return
  if (draft.isNew) {
    const nextTab = resolveTabAfterRemove(activeTab.value)
    removeDraft(activeTab.value, nextTab)
    chrome.notify('已取消新建', 'info')
    return
  }
  refreshDraftFromMode(activeTab.value)
  chrome.notify('已放弃未保存修改', 'info')
}

async function switchTab(nextId: string) {
  if (!nextId || nextId === activeTab.value) return
  const prevId = activeTab.value
  if (prevId && activeDraftDirty.value) {
    const ok = await chrome.confirm(
      '当前模式有未保存的修改，切换将丢弃更改。是否继续？',
      '未保存的修改',
      { confirmText: '丢弃并切换', cancelText: '继续编辑', type: 'warning' },
    )
    if (!ok) return
    const prevDraft = activeDraft.value
    if (prevDraft?.isNew) {
      // 保留新建草稿 Tab，仅重置当前编辑态
    } else {
      refreshDraftFromMode(prevId)
    }
  }
  activeTab.value = nextId
  activeSection.value = 'basic'
  cancelBatch()
}

async function handleActivate() {
  if (activeDraft.value?.isNew) return
  if (activeDraftDirty.value) {
    const ok = await chrome.confirm(
      '当前模式有未保存的修改。激活将使用已保存的配置，是否先保存再激活？',
      '未保存的修改',
      { confirmText: '先保存', cancelText: '取消', type: 'warning' },
    )
    if (!ok) return
    await handleSave()
    if (activeDraftDirty.value) return
  }
  const modeName = activeDraft.value?.name || activeMode.value?.name || '当前模式'
  const ok = await chrome.confirm(
    `确定激活「${modeName}」？将按该模式动作联动设备，并保留激活前快照以便退出时还原。`,
    '激活家庭模式',
    { type: 'danger', confirmText: '确认激活' },
  )
  if (!ok) return
  const result = await activate(activeTab.value)
  if (result) {
    await loadContext({ scope: 'runtime' })
  }
}

async function handleDeactivate() {
  const modeName = activeMode.value?.name || '当前模式'
  const ok = await chrome.confirm(
    `确定退出「${modeName}」？将尝试按激活前快照还原设备状态。`,
    '退出家庭模式',
    { type: 'danger', confirmText: '确认退出' },
  )
  if (!ok) return
  const result = await deactivate()
  if (result) {
    await loadContext({ scope: 'runtime' })
  }
}

async function onModeReorder({ fromIndex, toIndex }: { fromIndex: number; toIndex: number }) {
  const fromTab = modeTabs.value[fromIndex]
  const toTab = modeTabs.value[toIndex]
  if (!fromTab || !toTab) return
  if (fromTab.id.startsWith('draft_') || toTab.id.startsWith('draft_')) return

  const list = [...modes.value]
  const fromModeIdx = list.findIndex((m) => m.id === fromTab.id)
  const toModeIdx = list.findIndex((m) => m.id === toTab.id)
  if (fromModeIdx < 0 || toModeIdx < 0) return

  const [item] = list.splice(fromModeIdx, 1)
  list.splice(toModeIdx, 0, item)
  try {
    await reorderHomeModes(list.map((m, i) => ({ id: m.id, sortOrder: i })))
    await fetchModes({ silent: true })
    touchOrchCounts()
    chrome.notify('排序已更新', 'success')
  } catch (e) {
    logger.warn('模式排序失败', e)
    chrome.notify('排序失败', 'error')
    await fetchModes({ silent: true })
  }
}

async function handleDuplicate() {
  if (activeDraft.value?.isNew) return
  try {
    const { data } = await duplicateHomeMode(activeTab.value)
    await fetchModes({ silent: true })
    touchOrchCounts()
    activeTab.value = data.id
    refreshDraftFromMode(data.id)
    await loadContext({ scope: 'runtime' })
    chrome.notify('已复制模式', 'success')
  } catch (e) {
    logger.warn('模式复制失败', e)
    chrome.notify('复制失败', 'error')
  }
}

async function handleSeed() {
  try {
    await seedDefaults()
    await loadContext({ scope: 'full' })
    touchOrchCounts()
    chrome.notify('已初始化默认家庭模式', 'success')
  } catch (e) {
    logger.warn('模式初始化失败', e)
    chrome.notify('初始化失败或已有模式', 'warning')
  }
}

async function handleCreate() {
  if (activeDraftDirty.value) {
    const ok = await chrome.confirm(
      '当前模式有未保存的修改，新建将切换至新草稿 Tab。是否继续？',
      '未保存的修改',
      { confirmText: '继续新建', cancelText: '返回编辑', type: 'warning' },
    )
    if (!ok) return
    if (!activeDraft.value?.isNew) {
      refreshDraftFromMode(activeTab.value)
    }
  }
  createDraft()
}

async function handleSave() {
  const draft = activeDraft.value
  if (!draft) return
  const validationError = validateModeDraft(draft)
  if (validationError) {
    chrome.notify(validationError, 'warning')
    return
  }
  const emptyActions = (draft.actions || []).filter((a: ModeActionDraft) => !a.entity_id?.trim()).length
  if (emptyActions > 0) {
    const ok = await chrome.confirm(
      `有 ${emptyActions} 条动作未填写目标，保存时将自动忽略。是否继续？`,
      '未完成的动作',
      { confirmText: '继续保存', cancelText: '返回编辑', type: 'warning' },
    )
    if (!ok) return
  }
  let body
  try {
    body = buildSaveBody(draft)
  } catch (e) {
    chrome.notify((e as { message?: string }).message || '配置格式无效', 'error')
    return
  }
  await runSave(
    async () => {
      if (draft.isNew) {
        const created = await createMode(body)
        removeDraft(activeTab.value, created.id)
        activeTab.value = created.id
        refreshDraftFromMode(created.id)
        chrome.notify('模式已创建', 'success')
      } else {
        await updateMode(activeTab.value, body)
        refreshDraftFromMode(activeTab.value)
        chrome.notify('模式已保存', 'success')
      }
      await loadContext({ scope: 'runtime' })
      touchOrchCounts()
    },
    {
      onError: (e: unknown) => {
        chrome.notify(getApiErrorMessage(e, '保存失败'), 'error')
      },
    },
  )
}

async function handleDelete() {
  const draft = activeDraft.value
  if (!draft) return
  const name = draft.name || '此模式'
  const ok = await chrome.confirm(`确定删除模式「${name}」？`, '删除模式', {
    confirmText: '删除',
    type: 'danger',
  })
  if (!ok) return
  if (draft.isNew) {
    const nextTab = resolveTabAfterRemove(activeTab.value)
    removeDraft(activeTab.value, nextTab)
    chrome.notify('已取消新建', 'info')
    return
  }
  const deletedId = activeTab.value
  const nextTabId = resolveTabAfterRemove(deletedId)
  try {
    if (!draft.isNew && activeMode.value?.id === deletedId) {
      await deactivate()
    }
    await deleteMode(deletedId)
    removeDraft(deletedId, nextTabId)
    await loadContext({ scope: 'runtime' })
    touchOrchCounts()
    chrome.notify('已删除', 'success')
  } catch (e) {
    logger.warn('模式删除失败', e)
    chrome.notify('删除失败', 'error')
  }
}

onMounted(() => {
  loadContext({ scope: 'full' })
})

onActivated(() => {
  loadContext({ scope: 'runtime' })
})

  return {
    handleCancelDraft,
    switchTab,
    handleActivate,
    handleDeactivate,
    onModeReorder,
    handleDuplicate,
    handleSeed,
    handleCreate,
    handleSave,
    handleDelete,
  }
}

export { createHomeModePanelDerived } from '@/features/home-mode/composables/home-mode-panel-derived.internals'
