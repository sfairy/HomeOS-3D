/**
 * @file alert-rules-context.internals.ts
 * @module frontend/src/views
 */
/** 告警规则面板上下文 */
import { useSettingsHubPending } from '@/composables/settings-kernel/pending.internals'
import { useAuthStore } from '@/stores/auth.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import type { VoiceAlertsSnapshot } from '@/shared/types/alert-rules'
import { ALERT_RULE_PRESETS, ALERT_TEMPLATE_VARIABLES } from '@/shared/constants/alert-rule-presets'
import { sliderTrackStyle } from '@/shared/utils/ui/progress-bar.util'
import { useSettingsHubRouteSection } from '@/features/settings/shared/composables/hub-ui.internals'
import { useVoiceAlertsEditor } from '@/features/settings/interact/composables/voice.internals'
import { useAlertRulesPanelDnd } from '@/features/settings/interact/composables/alert-rules-dnd.internals'
import { useAlertRulesEarthquake } from '@/features/settings/interact/composables/alert-rules-earthquake.internals'
import { useAlertRulesCrud } from '@/features/settings/interact/composables/alert-rules-crud.internals'
import { useAlertRulesPanelRuleEditor } from '@/features/settings/interact/composables/alert-rules-editor.internals'

import { getAlertHubSections, getCustomAlertSpeechModes, getEntityStateOptions } from '@/shared/voice/utils/speech.util'
import type { Ref } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'
import { useRoute } from 'vue-router'
// ── useAlertRulesPanelContext ──
const SECTION_LABELS: Record<string, string> = {
  dnd: '免打扰',
  inbox: '应用内规则',
  voice: '语音播报',
  earthquake: '地震预警',
}

/** 设置 → 告警规则面板内部逻辑 */
export function useAlertRulesPanelContext(activeTabSource: Ref<string | undefined> | string) {
  const route = useRoute()
  const entitiesStore = useEntitiesStore()
  const chrome = useChromeStore()
  const layoutStore = useLayoutStore()
  const authStore = useAuthStore()

  const alertSection = ref('inbox')

  // 这个 wrapper 只**用** 7 个字段，其余 23 个纯粹是转发（原先解构一遍、return 里再列一遍，
  // 同一串名字写两次）。现在整袋透传：展开是安全的，因为 useVoiceAlertsEditor 返回的是
  // ref / computed **对象**本身，不是求值结果，浅拷贝不改变任何响应性。
  //
  // `voiceMeta` 是 useVoiceAlertsEditor 的内部状态（告警目录缓存），本 wrapper 一直没暴露它。
  // 显式剔除，保证对外键集与改动前逐字一致 —— 「顺手多暴露一个」也是行为变更。
  const { voiceMeta: _voiceMetaNotExposed, ...voiceAlertsEditor } = useVoiceAlertsEditor()
  const {
    voice,
    voiceSaveTip,
    ttsMediaPlayerId,
    speakCooldownMin,
    builtinStyleState,
    initVoiceAlerts,
    persistVoiceAlerts,
  } = voiceAlertsEditor

  const initialVoiceAlertsSnapshot = ref<VoiceAlertsSnapshot | null>(null)

  function voiceAlertsCurrent() {
    return {
      voice: voice.value,
      ttsMediaPlayerId: ttsMediaPlayerId.value,
      speakCooldownMin: speakCooldownMin.value,
      builtinStyleState: { ...builtinStyleState },
    }
  }

  const {
    pendingCount: voiceAlertsPending,
    takeSnapshot: snapshotVoiceAlerts,
    confirmAndRevert: confirmVoiceAlertsRevert,
    revertSilently: revertVoiceAlertsSilently,
  } = useSettingsHubPending({
    snapshot: initialVoiceAlertsSnapshot,
    current: voiceAlertsCurrent,
    applyBaseline: (baseline) => {
      const b = (baseline as VoiceAlertsSnapshot) || ({} as VoiceAlertsSnapshot)
      Object.assign(voice.value, b.voice)
      ttsMediaPlayerId.value = b.ttsMediaPlayerId
      speakCooldownMin.value = b.speakCooldownMin
      Object.assign(builtinStyleState, b.builtinStyleState)
      voiceSaveTip.value = ''
    },
  })

  const {
    earthquakePending,
    earthquakePendingLabel,
    earthquakeSaving,
    snapshotEarthquakeFromStore,
    saveEarthquake,
    cancelEarthquakeChanges,
    revertEarthquakeDraft,
  } = useAlertRulesEarthquake()

  const customAlertSpeechModes = computed(() => getCustomAlertSpeechModes())
  const entityStateOptions = computed(() => getEntityStateOptions())

  function sectionEmoji(id: string) {
    const map: Record<string, string> = { inbox: '📥', voice: '🔊', earthquake: '⚠️', dnd: '🌙' }
    return map[id] || '📌'
  }

  const alertSubnavSections = computed(() =>
    getAlertHubSections().map((sec) => ({
      ...sec,
      label: SECTION_LABELS[sec.id] ?? sec.label ?? sec.id,
      emoji: sectionEmoji(sec.id),
    })),
  )

  useSettingsHubRouteSection(alertSection, alertSubnavSections, {
    tabId: 'alerts',
    activeTab: activeTabSource,
  })

  const ruleEditor = useAlertRulesPanelRuleEditor({
    notify: (msg, type) => chrome.notify(msg, type as 'success' | 'error' | 'info'),
    confirm: (message, title, opts) => chrome.confirm(message, title, opts),
  })

  const dndPanel = useAlertRulesPanelDnd({ alertSection })

  const { rules, loading, rulesLoadError, loadRules, saveRule, testRule, toggleRuleEnabled, removeRule } =
    useAlertRulesCrud({ chrome, dndPanel, ruleEditor })

  const hasPendingChanges = computed(
    () =>
      dndPanel.dndDirty.value ||
      ruleEditor.editingDirty.value ||
      voiceAlertsPending.value > 0 ||
      earthquakePending.value > 0,
  )

  let voiceSaveTipTimer: ReturnType<typeof setTimeout> | null = null

  async function onSaveVoiceAlerts() {
    const ok = await persistVoiceAlerts()
    chrome.notify(ok ? '语音告警已保存' : '保存失败', ok ? 'success' : 'error')
    if (ok) {
      snapshotVoiceAlerts(voiceAlertsCurrent())
      if (voiceSaveTipTimer) clearTimeout(voiceSaveTipTimer)
      voiceSaveTipTimer = setTimeout(() => {
        voiceSaveTip.value = ''
        voiceSaveTipTimer = null
      }, 3000)
    }
  }

  async function cancelVoiceAlerts() {
    await confirmVoiceAlertsRevert(chrome, (baseline) => {
      const b = baseline as VoiceAlertsSnapshot
      Object.assign(voice.value, b.voice)
      ttsMediaPlayerId.value = b.ttsMediaPlayerId
      speakCooldownMin.value = b.speakCooldownMin
      Object.assign(builtinStyleState, b.builtinStyleState)
      voiceSaveTip.value = ''
    })
  }

  async function initPanel() {
    await Promise.all([loadRules(), initVoiceAlerts()])
    snapshotVoiceAlerts(voiceAlertsCurrent())
    if (layoutStore.isConfigLoaded) {
      snapshotEarthquakeFromStore()
    }
  }

  watch(
    () => unref(activeTabSource),
    (tab) => {
      if (tab === 'alerts') initPanel()
    },
  )
  watch(
    () => layoutStore.isConfigLoaded,
    (loaded) => {
      if (loaded && unref(activeTabSource) === 'alerts') {
        snapshotEarthquakeFromStore()
      }
    },
  )
  onMounted(() => {
    if (unref(activeTabSource) === 'alerts') initPanel()
  })

  /**
   * 静默丢弃本页全部草稿（离开设置页 / 切 Tab 确认后调用）。
   * 四个独立草稿源（免打扰 / 规则编辑浮层 / 语音告警 / 地震预警）各回各的基线。
   */
  function revertAllAlertDrafts() {
    revertVoiceAlertsSilently()
    revertEarthquakeDraft()
    dndPanel.revertDndDraft()
    ruleEditor.revertEditingDraft()
  }

  onBeforeUnmount(() => {
    if (voiceSaveTipTimer) clearTimeout(voiceSaveTipTimer)
  })

  return {
    route,
    revertAllAlertDrafts,
    entitiesStore,
    layoutStore,
    authStore,
    alertSection,
    alertSubnavSections,
    rules,
    loading,
    rulesLoadError,
    editing: ruleEditor.editing,
    editingDirty: ruleEditor.editingDirty,
    ...dndPanel,
    hasPendingChanges,
    earthquakePending,
    earthquakePendingLabel,
    earthquakeSaving,
    saveEarthquake,
    cancelEarthquakeChanges,
    voiceAlertsPending,
    // 23 个纯转发字段（voice / voiceLoading / … / alertPreviewSamples）：见上方解构处的注释。
    ...voiceAlertsEditor,
    sectionEmoji,
    levelClass: ruleEditor.levelClass,
    alertRulePresets: ALERT_RULE_PRESETS,
    alertTemplateVariables: ALERT_TEMPLATE_VARIABLES,
    cooldownUnit: ruleEditor.cooldownUnit,
    cooldownDisplay: ruleEditor.cooldownDisplay,
    setCooldownUnit: ruleEditor.setCooldownUnit,
    applyQuickTemplate: ruleEditor.applyQuickTemplate,
    insertTemplateVar: ruleEditor.insertTemplateVar,
    loadRules,
    openCreate: ruleEditor.openCreate,
    openEdit: ruleEditor.openEdit,
    closeEditing: ruleEditor.closeEditing,
    cancelEditingChanges: ruleEditor.cancelEditingChanges,
    saveRule,
    testRule,
    removeRule,
    toggleRuleEnabled,
    syncConditionFromVisual: ruleEditor.syncConditionFromVisual,
    syncClause: ruleEditor.syncClause,
    setConditionMode: ruleEditor.setConditionMode,
    addClause: ruleEditor.addClause,
    removeClause: ruleEditor.removeClause,
    onSaveVoiceAlerts,
    cancelVoiceAlerts,
    initPanel,
    sliderTrackStyle,
    customAlertSpeechModes,
    entityStateOptions,
  }
}
