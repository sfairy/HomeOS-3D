/**
 * @file home-mode-panel.internals.ts
 * @module frontend/src/views
 */
/** composables：自 home-mode.internals.ts 拆出 — 合并自 home-mode-panel.context / useHomeModePanel / useHomeModeRecommend */
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'
import { useHomeModes } from '@/composables/home/useHomeModes'
import { useChromeStore } from '@/stores/chrome.store'
import { duplicateHomeMode, fetchHomeModeContext, fetchHomeModeExecutionHistory, fetchHomeModePresets, fetchHomeModeTemplates, installHomeModePreset, reorderHomeModes } from '@/services/api/home-modes'
import { collectHaSceneScriptRecords } from '@/utils/ha/scene-script.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { fetchPresenceHome } from '@/services/api/security'
import { useAuthStore } from '@/stores/auth.store'
import { downloadBlob } from '@/utils/core/misc.util'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import { formatPresenceBadgeSummary } from '@/utils/presence/display.util'
import { buildHomeModeRecommendations } from '@/utils/recommend/home-mode-recommend.util'
import { useSettingsSave } from '@/composables/settings/hub-ui.internals'
import { CalendarDays, Link2, Radio, Users, Zap } from '@lucide/vue'
import type { ComputedRef, Ref } from 'vue'
import { computed, onActivated, onMounted, ref } from 'vue'
import type { ActionTemplate, ModeActionDraft } from '@/composables/home-mode/draft.internals'
import { useHomeModeEditor } from '@/composables/home-mode/editor.internals'

// ── useHomeModePanelContext ──
type HomeModesApi = Pick<ReturnType<typeof useHomeModes>, 'modes' | 'fetchModes' | 'createMode'>

function useHomeModePanelContext(options: {
  isAdmin: ComputedRef<boolean>
  modes: HomeModesApi['modes']
  fetchModes: HomeModesApi['fetchModes']
  createMode: HomeModesApi['createMode']
  activeTab: Ref<string>
  chrome: ReturnType<typeof useChromeStore>
  touchOrchCounts: () => void
}) {
  const { isAdmin, modes, fetchModes, createMode, activeTab, chrome, touchOrchCounts } = options

  const entitiesStore = useEntitiesStore()

  const modeContext = ref<Record<string, unknown>>({
    calendarAway: false,
    triggerBindingsCount: 0,
    triggerLogs: [],
  })
  const presenceLabel = ref('--')
  const actionTemplates = ref<ActionTemplate[]>([])
  const modePresets = ref<Record<string, unknown>[]>([])
  const presetInstalling = ref<string | null>(null)
  const savedScenes = ref<Record<string, unknown>[]>([])
  const savedScripts = ref<Record<string, unknown>[]>([])
  const execHistory = ref<Record<string, unknown>[]>([])
  const contextLoadWarnings = ref<string[]>([])
  const triggerLogs = computed(() => {
    const logs = modeContext.value.triggerLogs
    return Array.isArray(logs) ? logs : []
  })
  const showPresetSidebar = computed(() => isAdmin.value && modePresets.value.length > 0)

  let contextLoaded = false

  async function fetchContextBatch(
    keys: Array<
      'context' | 'presence' | 'history' | 'templates' | 'presets' | 'scenes' | 'scripts'
    >,
    resetWarnings: boolean,
  ) {
    if (resetWarnings) contextLoadWarnings.value = []
    const warnings: string[] = resetWarnings ? [] : [...contextLoadWarnings.value]
    const labels: Record<string, string> = {
      context: '运行上下文',
      presence: '人员状态',
      history: '执行历史',
      templates: '动作模板',
      presets: '预设包',
      scenes: '场景列表',
      scripts: '脚本列表',
    }
    const endpoints: Record<string, () => Promise<{ data: unknown }>> = {
      context: () => fetchHomeModeContext(),
      presence: () => fetchPresenceHome(),
      history: () => fetchHomeModeExecutionHistory(),
      templates: () => fetchHomeModeTemplates(),
      presets: () => fetchHomeModePresets(),
      scenes: () =>
        Promise.resolve({ data: collectHaSceneScriptRecords(entitiesStore.entities, 'scene') }),
      scripts: () =>
        Promise.resolve({
          data: collectHaSceneScriptRecords(entitiesStore.entities, 'script'),
        }),
    }
    const results = await Promise.all(
      keys.map(async (key) => {
        try {
          return { key, data: (await endpoints[key]()).data }
        } catch {
          if (!warnings.includes(labels[key] || key)) warnings.push(labels[key] || key)
          return { key, data: null }
        }
      }),
    )
    const byKey = Object.fromEntries(results.map((r) => [r.key, r.data]))
    if ('context' in byKey) modeContext.value = (byKey.context as Record<string, unknown>) || {}
    if ('history' in byKey) {
      const hist = byKey.history
      const fallback = modeContext.value.recentExecutions
      execHistory.value = (Array.isArray(hist)
        ? hist
        : Array.isArray(fallback)
          ? fallback
          : []) as Record<string, unknown>[]
    }
    if ('templates' in byKey)
      actionTemplates.value = (Array.isArray(byKey.templates) ? byKey.templates : []) as ActionTemplate[]
    if ('presets' in byKey)
      modePresets.value = (Array.isArray(byKey.presets) ? byKey.presets : []) as Record<
        string,
        unknown
      >[]
    if ('scenes' in byKey)
      savedScenes.value = (Array.isArray(byKey.scenes) ? byKey.scenes : []) as Record<
        string,
        unknown
      >[]
    if ('scripts' in byKey)
      savedScripts.value = (Array.isArray(byKey.scripts) ? byKey.scripts : []) as Record<
        string,
        unknown
      >[]
    if ('presence' in byKey) {
      presenceLabel.value =
        formatPresenceBadgeSummary(
          byKey.presence as { members?: unknown[] } | null | undefined,
        ) || '--'
    }
    contextLoadWarnings.value = warnings
  }

  async function loadContext(options: { scope?: 'full' | 'runtime' } = {}) {
    const scope = options.scope ?? (contextLoaded ? 'runtime' : 'full')
    try {
      if (scope === 'runtime') {
        await fetchContextBatch(['context', 'presence', 'history'], false)
      } else {
        await fetchContextBatch(
          ['context', 'presence', 'history', 'templates', 'presets', 'scenes', 'scripts'],
          true,
        )
        contextLoaded = true
      }
    } catch (e) {
      logger.debug('加载家庭模式上下文失败', e)
      if (scope === 'full') contextLoadWarnings.value = ['运行上下文']
    }
  }

  async function installPreset({
    presetId,
    entityOverrides,
    merge,
  }: {
    presetId: string
    entityOverrides?: Record<string, string>
    merge?: boolean
  }) {
    presetInstalling.value = presetId
    try {
      const { data } = await installHomeModePreset(presetId, {
        entityOverrides: entityOverrides || {},
        merge: merge ?? false,
      })
      await fetchModes({ silent: true })
      await loadContext({ scope: 'full' })
      touchOrchCounts()
      if (data?.id) activeTab.value = data.id
      const unresolved = data?.unresolvedActions?.length || 0
      const mergeHint = merge ? '（已覆盖更新）' : ''
      if (unresolved > 0) {
        chrome.notify(
          `预设已安装${mergeHint}，仍有 ${unresolved} 个实体未解析：${(data.unresolvedActions || []).join('、')}`,
          'warning',
        )
      } else {
        chrome.notify(`已安装预设「${data?.name || presetId}」${mergeHint}`, 'success')
      }
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '安装预设失败'), 'error')
    } finally {
      presetInstalling.value = null
    }
  }

  function exportModesJson() {
    const payload = modes.value.map((m) => ({
      name: m.name,
      icon: m.icon,
      config: m.config,
      triggers: m.triggers,
      sortOrder: m.sortOrder,
      exclusiveGroup: m.exclusiveGroup,
      priority: m.priority,
    }))
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `home-modes-${new Date().toISOString().slice(0, 10)}.json`)
  }

  async function onImportFile(ev: Event) {
    const input = ev.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const list = JSON.parse(text)
      if (!Array.isArray(list)) throw new Error('格式错误')
      let success = 0
      let failed = 0
      let skipped = 0
      const failReasons: string[] = []
      const existingNames = new Set(modes.value.map((m) => m.name?.trim()).filter(Boolean))
      for (const item of list) {
        const name = (item.name || '导入模式').trim()
        if (existingNames.has(name)) {
          skipped++
          continue
        }
        try {
          await createMode({
            name,
            icon: item.icon || '🏠',
            config:
              typeof item.config === 'string'
                ? JSON.parse(item.config)
                : Array.isArray(item.config)
                  ? item.config
                  : [],
            triggers:
              typeof item.triggers === 'string'
                ? JSON.parse(item.triggers)
                : Array.isArray(item.triggers)
                  ? item.triggers
                  : undefined,
            sortOrder: item.sortOrder ?? 0,
            exclusiveGroup: item.exclusiveGroup || 'default',
            priority: item.priority ?? 50,
          })
          existingNames.add(name)
          success++
        } catch (err) {
          failed++
          if (failReasons.length < 3) {
            failReasons.push(`${name}: ${getApiErrorMessage(err, '未知错误')}`)
          }
        }
      }
      await fetchModes({ silent: true })
      await loadContext({ scope: 'full' })
      touchOrchCounts()
      const parts: string[] = []
      if (success > 0) parts.push(`成功 ${success} 个`)
      if (skipped > 0) parts.push(`跳过重名 ${skipped} 个`)
      if (failed > 0) parts.push(`失败 ${failed} 个`)
      let message = parts.length ? `导入完成：${parts.join('，')}` : '没有可导入的模式'
      if (failReasons.length) {
        message += `（${failReasons.join('；')}）`
      }
      chrome.notify(message, failed > 0 ? 'warning' : 'success')
    } catch (e) {
      chrome.notify((e as { message?: string })?.message || '导入失败', 'error')
    }
  }

  return {
    modeContext,
    presenceLabel,
    actionTemplates,
    modePresets,
    presetInstalling,
    savedScenes,
    savedScripts,
    execHistory,
    contextLoadWarnings,
    triggerLogs,
    showPresetSidebar,
    loadContext,
    installPreset,
    exportModesJson,
    onImportFile,
  }
}

// ── useHomeModePanel ──
export function useHomeModePanel() {
  const auth = useAuthStore()
  const chrome = useChromeStore()
  const refreshOrchOverview = null as (() => void) | null

  function touchOrchCounts() {
    refreshOrchOverview?.()
  }

  const { saving, runSave } = useSettingsSave()
  const isAdmin = computed(() => auth.role === 'admin')

  const {
    modes,
    activeMode,
    loading: loadingModes,
    loadError: modesLoadError,
    acting,
    fetchModes,
    activate,
    deactivate,
    seedDefaults,
    createMode,
    updateMode,
    deleteMode,
  } = useHomeModes({ autoSeed: false })

  const {
    activeTab,
    modeTabs,
    activeDraft,
    activeDraftDirty,
    refreshDraftFromMode,
    isTabDirty,
    allDomains,
    showBatch,
    batchDomain,
    batchService,
    batchChecked,
    servicesForDomain,
    createDraft,
    removeDraft,
    resolveTabAfterRemove,
    addAction,
    addTrigger,
    batchEntities,
    toggleBatchCheck,
    onBatchDomainChange,
    applyBatch,
    cancelBatch,
    applyTemplate,
    buildSaveBody,
    validateModeDraft,
    actionFocusEpoch,
    actionFocusIndex,
    triggerFocusEpoch,
    triggerFocusIndex,
    triggerTypeOptions,
    actionKindOptions,
    homeModeIconOptions,
    exclusiveGroupOptions,
  } = useHomeModeEditor(modes)

  const {
    modeContext,
    presenceLabel,
    actionTemplates,
    modePresets,
    presetInstalling,
    savedScenes,
    savedScripts,
    execHistory,
    contextLoadWarnings,
    triggerLogs,
    showPresetSidebar,
    loadContext,
    installPreset,
    exportModesJson,
    onImportFile,
  } = useHomeModePanelContext({
    isAdmin,
    modes,
    fetchModes,
    createMode,
    activeTab,
    chrome,
    touchOrchCounts,
  })

  const loading = computed(() => loadingModes.value && modes.value.length === 0)

  const activeSection = ref('basic')

  const anyModeDraftDirty = computed(() => modeTabs.value.some((tab) => isTabDirty(tab.id)))

  const pendingModeChanges = computed(
    () => modeTabs.value.filter((tab) => isTabDirty(tab.id)).length,
  )

  useRegisterSettingsTabPending('home-mode', () => anyModeDraftDirty.value)

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
    const emptyActions = (draft.actions || []).filter((a) => !a.entity_id?.trim()).length
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
    isAdmin,
    loading,
    modesLoadError,
    modeTabs,
    displayModeTabs,
    activeTab,
    activeMode,
    activeDraft,
    activeDraftDirty,
    anyModeDraftDirty,
    pendingModeChanges,
    activeSection,
    sectionTabs,
    contextLoadWarnings,
    contextPills,
    showPresetSidebar,
    modePresets,
    presetInstalling,
    actionTemplates,
    exclusiveGroupOptions,
    homeModeIconOptions,
    allDomains,
    showBatch,
    batchDomain,
    batchService,
    batchChecked,
    servicesForDomain,
    batchEntities,
    triggerTypeOptions,
    actionKindOptions,
    savedScenes,
    savedScripts,
    triggerLogs,
    execHistory,
    saving,
    acting,
    onModeReorder,
    handleSeed,
    handleCreate,
    exportModesJson,
    onImportFile,
    installPreset,
    onKindChange,
    handleDuplicate,
    handleAddAction,
    handleAddTrigger,
    handleApplyTemplate,
    addAction,
    addTrigger,
    toggleBatchCheck,
    onBatchDomainChange,
    applyBatch,
    cancelBatch,
    applyTemplate,
    actionFocusEpoch,
    actionFocusIndex,
    triggerFocusEpoch,
    triggerFocusIndex,
    handleSave,
    handleCancelDraft,
    handleActivate,
    handleDeactivate,
    handleDelete,
    switchTab,
    focusSection,
  }
}

// ── useHomeModeRecommend ──
export function useHomeModeRecommend(
  modes: () => Array<{ id: string; name: string; triggers?: unknown[] | string | null }>,
  triggerLogs: () => Array<{ source?: string; reason?: string }>,
) {
  const recommendations = computed(() =>
    buildHomeModeRecommendations({
      modes: modes(),
      triggerLogs: triggerLogs(),
    }),
  )

  return { recommendations }
}
