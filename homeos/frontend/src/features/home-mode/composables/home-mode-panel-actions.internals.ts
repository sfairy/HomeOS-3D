/**
 * @file home-mode-panel-actions.internals.ts
 * @module frontend/src/features/home-mode/composables
 */
import { computed, onActivated, onMounted, ref } from 'vue'
import {
  duplicateHomeMode,
  reorderHomeModes,
} from '@/services/api/home-modes'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'
import { CalendarDays, Link2, Radio, Users, Zap } from '@lucide/vue'
import { useRegisterSettingsTabPending } from '@/composables/settings-kernel/pending.internals'
import type { ActionTemplate, ModeActionDraft } from './draft.internals'
import type { useHomeModeEditor } from './editor.internals'
import type { useHomeModePanelContext } from './home-mode-panel-context.internals'
import type { useHomeModes } from './useHomeModes'
import type { useChromeStore } from '@/stores/chrome.store'
import type { useSettingsSave } from '@/composables/settings-kernel/save.internals'

/** 面板 tab 列表的真实类型：取自编辑器工厂的返回，不再用 `any` 让回调形参退化成隐式 any。 */
type HomeModeTabs = ReturnType<typeof useHomeModeEditor>['modeTabs']

// 依赖一律从其归属工厂的返回类型索引取值，避免手抄形状导致漂移
type HomeModeEditor = ReturnType<typeof useHomeModeEditor>
type HomeModeContextApi = ReturnType<typeof useHomeModePanelContext>
type HomeModesApi = ReturnType<typeof useHomeModes>
type ChromeStore = ReturnType<typeof useChromeStore>

/** Tab / section / context pill 派生 */
export function createHomeModePanelDerived(d: {
  modeTabs: HomeModeTabs
  activeMode: HomeModesApi['activeMode']
  isTabDirty: HomeModeEditor['isTabDirty']
  activeDraft: HomeModeEditor['activeDraft']
  triggerLogs: HomeModeContextApi['triggerLogs']
  execHistory: HomeModeContextApi['execHistory']
  exclusiveGroupOptions: HomeModeEditor['exclusiveGroupOptions']
  presenceLabel: HomeModeContextApi['presenceLabel']
  modeContext: HomeModeContextApi['modeContext']
  addAction: () => void
  addTrigger: () => void
  applyTemplate: (tpl: ActionTemplate) => void
}) {
  const {
    modeTabs,
    activeMode,
    isTabDirty,
    activeDraft,
    triggerLogs,
    execHistory,
    exclusiveGroupOptions,
    presenceLabel,
    modeContext,
    addAction,
    addTrigger,
    applyTemplate,
  } = d

const activeSection = ref('basic')

const anyModeDraftDirty = computed(() => modeTabs.value.some((tab) => isTabDirty(tab.id)))

const pendingModeChanges = computed(
  () => modeTabs.value.filter((tab) => isTabDirty(tab.id)).length,
)

useRegisterSettingsTabPending('home-mode', () => anyModeDraftDirty.value)

const displayModeTabs = computed(() =>
  modeTabs.value.map((tab) => {
    const isLive = activeMode.value?.id === tab.id
    const dirty = isTabDirty(tab.id)
    return {
      ...tab,
      label: dirty
        ? `${String(tab.label).replace(/ \*$/, '')} *`
        : String(tab.label).replace(/ \*$/, ''),
      countTitle: dirty ? '有未保存修改' : undefined,
      accent: isLive ? '#34d399' : tab.accent,
    }
  }),
)

const sectionTabs = computed(() => {
  const d = activeDraft.value
  const logCount = triggerLogs.value.length + execHistory.value.length
  return [
    { id: 'basic', label: '基本配置', emoji: '⚙️' },
    { id: 'actions', label: '全屋动作', emoji: '⚡', count: d?.actions?.length || 0 },
    { id: 'triggers', label: '自动触发', emoji: '⏰', count: d?.triggers?.length || 0 },
    { id: 'logs', label: '运行日志', emoji: '📋', count: logCount || undefined },
  ]
})

const contextPills = computed(() => {
  const group = activeDraft.value?.exclusiveGroup || 'default'
  const groupLabel = exclusiveGroupOptions.find((o) => o.value === group)?.label || group
  return [
    {
      id: 'presence',
      icon: Users,
      label: '在场',
      value: presenceLabel.value,
    },
    {
      id: 'calendar',
      icon: CalendarDays,
      label: '日历',
      value: modeContext.value.calendarAway ? '外出中' : '在家',
      tone: modeContext.value.calendarAway ? 'warn' : '',
    },
    {
      id: 'triggers',
      icon: Radio,
      label: '自动触发',
      value: '{n} 条'.replace('{n}', String(modeContext.value.triggerBindingsCount ?? 0)),
      section: 'triggers',
    },
    {
      id: 'actions',
      icon: Zap,
      label: '全屋动作',
      value: '{n} 条'.replace('{n}', String(activeDraft.value?.actions?.length ?? 0)),
      section: 'actions',
    },
    {
      id: 'linkage',
      icon: Link2,
      label: '联动',
      value: `快照恢复 · ${groupLabel} · 优先级 ${activeDraft.value?.priority ?? 50}`,
      section: 'basic',
    },
  ]
})

function focusSection(sectionId: string) {
  if (['basic', 'actions', 'triggers', 'logs'].includes(sectionId)) {
    activeSection.value = sectionId
  }
}

function handleAddAction() {
  activeSection.value = 'actions'
  addAction()
}

function handleAddTrigger() {
  activeSection.value = 'triggers'
  addTrigger()
}

function handleApplyTemplate(tpl: ActionTemplate) {
  activeSection.value = 'actions'
  applyTemplate(tpl)
}

function onKindChange(act: ModeActionDraft) {
  act.entity_id = ''
  if (act.kind === 'scene') {
    act.domain = 'scene'
    act.service = 'turn_on'
  } else if (act.kind === 'script') {
    act.domain = 'script'
    act.service = 'turn_on'
  } else if (act.kind === 'notify') {
    act.domain = 'notify'
    act.service = 'send_message'
  } else if (act.kind === 'security') {
    act.domain = 'security'
    act.service = 'arm'
  }
}

  return {
    activeSection,
    anyModeDraftDirty,
    pendingModeChanges,
    displayModeTabs,
    sectionTabs,
    contextPills,
    focusSection,
    handleAddAction,
    handleAddTrigger,
    handleApplyTemplate,
    onKindChange,
  }
}

/** 保存 / 激活 / 删除等面板操作 */
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
