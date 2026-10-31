/**
 * @file home-mode-panel.internals.ts
 * @module frontend/src/views
 */
/** composables：useHomeModePanel / useHomeModeRecommend */
import { useHomeModes } from './useHomeModes'
import { useChromeStore } from '@/stores/chrome.store'
import { buildHomeModeRecommendations } from '@/shared/recommend/utils/home-mode-recommend.util'
import { useSettingsSave } from '@/composables/settings-kernel/save.internals'
import { useRegisterSettingsTabPending } from '@/composables/settings-kernel/pending.internals'
import { computed } from 'vue'
import { useHomeModeEditor } from './editor.internals'
import { useHomeModePanelContext } from './home-mode-panel-context.internals'
import {
  createHomeModePanelDerived,
  createHomeModePanelHandlers,
} from './home-mode-panel-actions.internals'

function buildHomeModePanelApi(parts: {
  loading: unknown
  modesLoadError: unknown
  editor: ReturnType<typeof useHomeModeEditor>
  derived: ReturnType<typeof createHomeModePanelDerived>
  context: ReturnType<typeof useHomeModePanelContext>
  handlers: ReturnType<typeof createHomeModePanelHandlers>
  activeMode: unknown
  saving: unknown
  acting: unknown
}) {
  const { loading, modesLoadError, editor, derived, context, handlers, activeMode, saving, acting } =
    parts
  return {
    loading,
    modesLoadError,
    modeTabs: editor.modeTabs,
    displayModeTabs: derived.displayModeTabs,
    activeTab: editor.activeTab,
    activeMode,
    activeDraft: editor.activeDraft,
    activeDraftDirty: editor.activeDraftDirty,
    anyModeDraftDirty: derived.anyModeDraftDirty,
    pendingModeChanges: derived.pendingModeChanges,
    activeSection: derived.activeSection,
    sectionTabs: derived.sectionTabs,
    contextLoadWarnings: context.contextLoadWarnings,
    contextPills: derived.contextPills,
    showPresetSidebar: context.showPresetSidebar,
    modePresets: context.modePresets,
    presetInstalling: context.presetInstalling,
    actionTemplates: context.actionTemplates,
    exclusiveGroupOptions: editor.exclusiveGroupOptions,
    homeModeIconOptions: editor.homeModeIconOptions,
    allDomains: editor.allDomains,
    showBatch: editor.showBatch,
    batchDomain: editor.batchDomain,
    batchService: editor.batchService,
    batchChecked: editor.batchChecked,
    servicesForDomain: editor.servicesForDomain,
    batchEntities: editor.batchEntities,
    triggerTypeOptions: editor.triggerTypeOptions,
    actionKindOptions: editor.actionKindOptions,
    savedScenes: context.savedScenes,
    savedScripts: context.savedScripts,
    triggerLogs: context.triggerLogs,
    execHistory: context.execHistory,
    saving,
    acting,
    onModeReorder: handlers.onModeReorder,
    handleSeed: handlers.handleSeed,
    handleCreate: handlers.handleCreate,
    exportModesJson: context.exportModesJson,
    onImportFile: context.onImportFile,
    installPreset: context.installPreset,
    onKindChange: derived.onKindChange,
    handleDuplicate: handlers.handleDuplicate,
    handleAddAction: derived.handleAddAction,
    handleAddTrigger: derived.handleAddTrigger,
    handleApplyTemplate: derived.handleApplyTemplate,
    addAction: editor.addAction,
    addTrigger: editor.addTrigger,
    toggleBatchCheck: editor.toggleBatchCheck,
    onBatchDomainChange: editor.onBatchDomainChange,
    applyBatch: editor.applyBatch,
    cancelBatch: editor.cancelBatch,
    applyTemplate: editor.applyTemplate,
    actionFocusEpoch: editor.actionFocusEpoch,
    actionFocusIndex: editor.actionFocusIndex,
    triggerFocusEpoch: editor.triggerFocusEpoch,
    triggerFocusIndex: editor.triggerFocusIndex,
    handleSave: handlers.handleSave,
    handleCancelDraft: handlers.handleCancelDraft,
    handleActivate: handlers.handleActivate,
    handleDeactivate: handlers.handleDeactivate,
    handleDelete: handlers.handleDelete,
    switchTab: handlers.switchTab,
    focusSection: derived.focusSection,
  }
}

// ── useHomeModePanel ──
export function useHomeModePanel() {
  const chrome = useChromeStore()
  const refreshOrchOverview = null as (() => void) | null
  function touchOrchCounts() {
    refreshOrchOverview?.()
  }

  const { saving, runSave } = useSettingsSave()
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

  const editor = useHomeModeEditor(modes)
  const context = useHomeModePanelContext({
    modes,
    fetchModes,
    createMode,
    activeTab: editor.activeTab,
    chrome,
    touchOrchCounts,
  })

  const loading = computed(() => loadingModes.value && modes.value.length === 0)

  const derived = createHomeModePanelDerived({
    modeTabs: editor.modeTabs,
    activeMode,
    isTabDirty: editor.isTabDirty,
    activeDraft: editor.activeDraft,
    triggerLogs: context.triggerLogs,
    execHistory: context.execHistory,
    exclusiveGroupOptions: editor.exclusiveGroupOptions,
    presenceLabel: context.presenceLabel,
    modeContext: context.modeContext,
    addAction: editor.addAction,
    addTrigger: editor.addTrigger,
    applyTemplate: editor.applyTemplate,
  })

  /** 离开设置页时丢弃家庭模式草稿：新建的整块删掉，已有的重读覆盖。 */
  function discardPendingHomeModeDrafts(): void {
    const drafts = editor.drafts.value
    const tabs = [...editor.modeTabs.value]
    const isNewDraft = (tab: (typeof tabs)[number]): boolean => drafts[tab.id]?.isNew === true
    tabs
      .filter(isNewDraft)
      .forEach((tab) => editor.removeDraft(tab.id, editor.resolveTabAfterRemove(tab.id)))
    tabs.filter((tab) => !isNewDraft(tab)).forEach((tab) => editor.refreshDraftFromMode(tab.id))
  }

  // 第三参数：确认离开设置页后真正丢弃家庭模式草稿（自定义模式整块删掉，已有模式重读）
  useRegisterSettingsTabPending(
    'home-mode',
    () => derived.anyModeDraftDirty.value,
    discardPendingHomeModeDrafts,
  )

  const handlers = createHomeModePanelHandlers({
    chrome,
    activeDraft: editor.activeDraft,
    anyModeDraftDirty: derived.anyModeDraftDirty,
    resolveTabAfterRemove: editor.resolveTabAfterRemove,
    removeDraft: editor.removeDraft,
    activeTab: editor.activeTab,
    refreshDraftFromMode: editor.refreshDraftFromMode,
    activeDraftDirty: editor.activeDraftDirty,
    activeSection: derived.activeSection,
    cancelBatch: editor.cancelBatch,
    modeTabs: editor.modeTabs,
    activeMode,
    activate,
    deactivate,
    loadContext: context.loadContext,
    modes,
    fetchModes,
    touchOrchCounts,
    seedDefaults,
    createDraft: editor.createDraft,
    validateModeDraft: editor.validateModeDraft,
    buildSaveBody: editor.buildSaveBody,
    runSave,
    createMode,
    updateMode,
    deleteMode,
  })

  return buildHomeModePanelApi({
    loading,
    modesLoadError,
    editor,
    derived,
    context,
    handlers,
    activeMode,
    saving,
    acting,
  })
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
