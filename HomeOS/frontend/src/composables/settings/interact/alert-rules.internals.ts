/**
 * @file alert-rules.internals.ts
 * @module frontend/src/views
 */
/** composables：合并自告警规则面板上下文 / 面板 / DND / 规则编辑 / 推荐 */
import { afterLayoutCancelSync, syncGlobalLayoutPendingSnapshot, useSettingsHubPending } from '@/composables/settings/pending.internals'
import { useEventLogStats } from '@/composables/recommend/useEventLogStats'
import { createNotificationRule, deleteNotificationRule, fetchNotificationRules, fetchNotificationSettings, testNotificationRule, updateNotificationRule, updateNotificationSettings } from '@/services/api/notifications'
import { useAuthStore } from '@/stores/auth.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import type { AlertLevel, AlertRuleEditForm, ConditionClause, ConditionMode, DndPreset, InboxAlertRule, NotificationSettingsParsed, VoiceAlertsSnapshot } from '@/types/alert-rules'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import { formatLocaleTime } from '@/utils/format/locale-format.util'
import { DEFAULT_DND_END, DEFAULT_DND_START, DND_PRESETS, dndDurationHours, dndRangeLabel, dndRangeStyle, formatHour, isHourInDnd, parseNotificationSettings } from '@/utils/notification/dnd.util'
import { buildAlertRulesRecommendations } from '@/utils/recommend/alert-rules-recommend.util'
import type { RecommendChip } from '@/utils/recommend/types'
import {
  ALERT_RULE_PRESETS,
  ALERT_TEMPLATE_VARIABLES,
  type AlertRulePreset,
} from '@/constants/alert-rule-presets'
import { sliderTrackStyle } from '@/utils/ui/progress-bar.util'
import { clonePlain } from '@/utils/core/clone-plain.util'
import { applyEarthquakeLayoutSlice, type pickEarthquakeLayoutSlice } from '../display/layout-dashboard.internals'
import { createDefaultEarthquakeConfig } from '@/types/earthquake'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'
import { useVoiceAlertsEditor } from './voice.internals'
import { getAlertHubSections, getCustomAlertSpeechModes, getEntityStateOptions } from '@/utils/voice/speech.util'
import { ChevronDown, Inbox, Loader2, Moon, Plus, Save, Sun, Trash2, Volume2 } from '@lucide/vue'
import type { Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'
import { useRoute } from 'vue-router'

// ── useAlertRulesPanelContext ──
const SECTION_LABELS: Record<string, string> = {
  dnd: '免打扰',
  inbox: '应用内规则',
  voice: '语音播报',
  earthquake: '地震预警',
}

/** 设置 → 告警规则面板内部逻辑 */
function useAlertRulesPanelContext(activeTabSource: Ref<string | undefined> | string) {
  const route = useRoute()
  const entitiesStore = useEntitiesStore()
  const chrome = useChromeStore()
  const layoutStore = useLayoutStore()
  const authStore = useAuthStore()

  const isAdmin = computed(() => authStore.role === 'admin')
  const alertSection = ref('inbox')

  const {
    voice,
    voiceLoading,
    voiceLoadError,
    voiceSaving,
    voiceSaveTip,
    ttsMediaPlayerId,
    speakCooldownMin,
    expandedAlert,
    builtinStyleState,
    alertRuleGroups,
    enabledVoiceAlertCount,
    addCustomAlert,
    removeCustomAlert,
    addEntityTtsAlert,
    removeEntityTtsAlert,
    entityTtsVarChips,
    entityPreviewVars,
    insertEntityTtsVar,
    initVoiceAlerts,
    persistVoiceAlerts,
    setBuiltinStyle,
    setBuiltinCustom,
    insertBuiltinVar,
    builtinPreviewTemplate,
    varChipsForKey,
    toggleAlertExpand,
    stylesForAlertKey,
    composeCustomAlertTemplate,
    builtinDefaultSpeech,
    alertPreviewSamples,
  } = useVoiceAlertsEditor()

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
  } = useSettingsHubPending({
    snapshot: initialVoiceAlertsSnapshot,
    current: voiceAlertsCurrent,
  })

  const initialEarthquakeSnapshot = ref<string | null>(null)
  const earthquakeSaving = ref(false)

  function earthquakeLayoutCurrent() {
    // 返回 store 活引用，便于 pending deep-watch；勿 clone（否则改开关不会触发未保存）
    return {
      earthquakeConfig:
        layoutStore.layoutConfig.earthquakeConfig || createDefaultEarthquakeConfig(),
    }
  }

  function snapshotEarthquakeFromStore() {
    snapshotEarthquake(earthquakeLayoutCurrent())
  }

  const {
    pendingCount: earthquakePending,
    pendingLabel: earthquakePendingLabel,
    takeSnapshot: snapshotEarthquake,
    confirmAndRevert: confirmEarthquakeRevert,
  } = useSettingsHubPending({
    snapshot: initialEarthquakeSnapshot,
    current: earthquakeLayoutCurrent,
    ready: () => layoutStore.isConfigLoaded,
  })

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

  const rules = ref<InboxAlertRule[]>([])
  const loading = ref(false)
  const rulesLoadError = ref<string>('')

  const ruleEditor = useAlertRulesPanelRuleEditor({
    isAdmin,
    notify: (msg, type) => chrome.notify(msg, type as 'success' | 'error' | 'info'),
    confirm: (message, title, opts) => chrome.confirm(message, title, opts),
  })

  const dndPanel = useAlertRulesPanelDnd({ alertSection })

  const hasPendingChanges = computed(
    () =>
      dndPanel.dndDirty.value ||
      ruleEditor.editingDirty.value ||
      voiceAlertsPending.value > 0 ||
      earthquakePending.value > 0,
  )

  let rulesLoaded = false

  async function loadRules(options: { silent?: boolean } = {}) {
    const showLoading = !options.silent && !rulesLoaded
    if (showLoading) {
      loading.value = true
      rulesLoadError.value = ''
    }
    try {
      const rulesRes = await fetchNotificationRules()
      rules.value = (rulesRes.data as InboxAlertRule[] | undefined) || []
      await dndPanel.loadDndSettings(true)
      rulesLoaded = true
    } catch (e) {
      logger.warn('加载规则失败', e)
      if (showLoading || !rulesLoaded) {
        rules.value = []
        rulesLoadError.value = getApiErrorMessage(e, '加载规则失败')
      }
    } finally {
      if (showLoading) loading.value = false
    }
  }

  async function saveRule() {
    const form = ruleEditor.editing.value
    if (!form) return
    if (!form.name?.trim()) {
      chrome.notify('请填写规则名称', 'error')
      return
    }
    if (form.conditionMode !== 'raw') ruleEditor.syncConditionFromVisual()
    const condition = form.condition?.trim()
    if (!condition) {
      chrome.notify('请填写触发条件', 'error')
      return
    }
    // 冷却 0 = 不抑制（事件型规则，如门铃）；NaN/空值回退默认 60 分钟
    const payload = {
      name: form.name.trim(),
      entityId: form.entityId || undefined,
      messageTemplate: form.messageTemplate?.trim() || undefined,
      // 外部推送标题（Email/WebPush/企微）；留空时由各通道内置标题兜底
      title: form.title?.trim() || undefined,
      condition,
      level: form.level,
      channels: normalizeAlertRuleChannels(form.channels),
      cooldownMinutes: normalizeCooldownMinutes(form.cooldownMinutes),
      enabled: form.enabled !== false,
    }
    try {
      if (form.id) await updateNotificationRule(form.id, payload)
      else await createNotificationRule(payload)
      ruleEditor.closeEditing()
      await loadRules({ silent: true })
      chrome.notify('规则已保存', 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '保存失败（需 admin 权限）'), 'error')
      logger.warn('保存规则失败', e)
    }
  }

  async function testRule(rule: Pick<InboxAlertRule, 'entityId' | 'condition'>) {
    const entity = rule.entityId ? entitiesStore.entities[rule.entityId] : null
    if (rule.entityId && !entity) {
      chrome.notify(`实体 ${rule.entityId} 当前不可用`, 'info')
      return
    }
    try {
      const res = await testNotificationRule({
        condition: rule.condition,
        entityId: rule.entityId,
        state: entity?.state ?? '',
        attributes: entity?.attributes ?? {},
      })
      const { matched, state } = res.data || {}
      const stateLabel = state || '(空)'
      chrome.notify(
        matched ? `条件匹配，当前状态: ${stateLabel}` : `条件不匹配，当前状态: ${stateLabel}`,
        matched ? 'success' : 'info',
      )
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '测试失败'), 'error')
    }
  }

  /**
   * 一键启闭规则（不进入编辑弹窗）。
   *
   * 先本地乐观更新行内开关，接口失败时回滚，保证窄屏/移动端也能快速控制推送。
   */
  async function toggleRuleEnabled(rule: InboxAlertRule, enabled: boolean) {
    if (!rule.id) return
    if (!isAdmin.value) {
      chrome.notify('切换启用状态需要 admin 权限', 'info')
      return
    }
    const prev = rule.enabled
    rule.enabled = enabled
    try {
      await updateNotificationRule(rule.id, { enabled })
      chrome.notify(enabled ? '规则已启用' : '规则已停用', 'success')
    } catch (e) {
      rule.enabled = prev
      chrome.notify(getApiErrorMessage(e, '操作失败（需 admin 权限）'), 'error')
    }
  }

  async function removeRule(id: string) {
    const ok = await chrome.confirm('确定删除此规则？', '删除规则', {
      confirmText: '删除',
      type: 'danger',
    })
    if (!ok) return
    try {
      await deleteNotificationRule(id)
      await loadRules({ silent: true })
      chrome.notify('规则已删除', 'success')
    } catch {
      chrome.notify('删除失败', 'error')
    }
  }

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

  async function cancelEarthquakeChanges() {
    await confirmEarthquakeRevert(
      chrome,
      (baseline) => {
        applyEarthquakeLayoutSlice(
          layoutStore.layoutConfig,
          baseline as ReturnType<typeof pickEarthquakeLayoutSlice>,
        )
      },
      { onReverted: () => afterLayoutCancelSync(layoutStore.layoutConfig) },
    )
  }

  async function saveEarthquake() {
    earthquakeSaving.value = true
    try {
      const ok = await layoutStore.saveLayout(true)
      if (ok) {
        snapshotEarthquakeFromStore()
        syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
        chrome.notify('地震预警配置已保存', 'success')
      } else {
        chrome.notify('保存失败', 'error')
      }
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '保存失败'), 'error')
    } finally {
      earthquakeSaving.value = false
    }
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

  onBeforeUnmount(() => {
    if (voiceSaveTipTimer) clearTimeout(voiceSaveTipTimer)
  })

  return {
    route,
    entitiesStore,
    layoutStore,
    authStore,
    isAdmin,
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
    voice,
    voiceLoading,
    voiceLoadError,
    voiceSaving,
    voiceSaveTip,
    ttsMediaPlayerId,
    speakCooldownMin,
    expandedAlert,
    builtinStyleState,
    alertRuleGroups,
    enabledVoiceAlertCount,
    addCustomAlert,
    removeCustomAlert,
    addEntityTtsAlert,
    removeEntityTtsAlert,
    entityTtsVarChips,
    entityPreviewVars,
    insertEntityTtsVar,
    initVoiceAlerts,
    persistVoiceAlerts,
    setBuiltinStyle,
    setBuiltinCustom,
    insertBuiltinVar,
    builtinPreviewTemplate,
    varChipsForKey,
    toggleAlertExpand,
    stylesForAlertKey,
    composeCustomAlertTemplate,
    builtinDefaultSpeech,
    alertPreviewSamples,
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

// ── useAlertRulesPanel ──
/** 设置 → 告警规则面板逻辑 */
export function useAlertRulesPanel(activeTabSource: Ref<string | undefined> | string) {
  const ctx = useAlertRulesPanelContext(activeTabSource)
  return {
    ...ctx,
    Save,
    Loader2,
    Plus,
    Trash2,
    ChevronDown,
    Inbox,
    Volume2,
    Moon,
    Sun,
  }
}

// ── useAlertRulesPanelDnd ──
/** 告警规则面板：免打扰时段编辑 */
function useAlertRulesPanelDnd(options: { alertSection: Ref<string> }) {
  const chrome = useChromeStore()
  const dndSettings = ref<NotificationSettingsParsed | null>(null)
  const dndForm = ref({ dndStart: DEFAULT_DND_START, dndEnd: DEFAULT_DND_END })
  const dndLoading = ref(false)
  const dndLoadError = ref('')
  const dndSaving = ref(false)

  const dndPresets = computed(() => DND_PRESETS)
  const currentHour = computed(() => new Date().getHours())
  const currentTimeLabel = computed(() => {
    const now = new Date()
    return formatLocaleTime(now, { hour: '2-digit', minute: '2-digit', hour12: false })
  })
  const dndPreviewActive = computed(() =>
    isHourInDnd(currentHour.value, dndForm.value.dndStart, dndForm.value.dndEnd),
  )
  const dndDurationHoursComputed = computed(() =>
    dndDurationHours(dndForm.value.dndStart, dndForm.value.dndEnd),
  )
  const dndDirty = computed(() => {
    if (!dndSettings.value) return false
    return (
      dndForm.value.dndStart !== dndSettings.value.dndStart ||
      dndForm.value.dndEnd !== dndSettings.value.dndEnd
    )
  })

  async function loadDndSettings(silent = false) {
    if (!silent) {
      dndLoading.value = true
      dndLoadError.value = ''
    }
    try {
      const res = await fetchNotificationSettings()
      const parsed = parseNotificationSettings(res.data)
      dndSettings.value = parsed
      dndForm.value = { dndStart: parsed.dndStart, dndEnd: parsed.dndEnd }
    } catch (e) {
      dndSettings.value = null
      if (!silent) {
        dndLoadError.value = getApiErrorMessage(e, '免打扰配置加载失败')
      }
    } finally {
      if (!silent) dndLoading.value = false
    }
  }

  function isDndPresetActive(preset: DndPreset) {
    return dndForm.value.dndStart === preset.start && dndForm.value.dndEnd === preset.end
  }

  function applyDndPreset(preset: DndPreset) {
    dndForm.value = { dndStart: preset.start, dndEnd: preset.end }
  }

  async function saveDnd() {
    dndSaving.value = true
    try {
      const payload = {
        dndStart: Math.max(0, Math.min(23, Math.floor(dndForm.value.dndStart))),
        dndEnd: Math.max(0, Math.min(23, Math.floor(dndForm.value.dndEnd))),
      }
      const res = await updateNotificationSettings(payload)
      const parsed = parseNotificationSettings(res.data)
      dndSettings.value = parsed
      dndForm.value = { dndStart: parsed.dndStart, dndEnd: parsed.dndEnd }
      chrome.notify('免打扰设置已保存', 'success')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '保存失败（需 admin）'), 'error')
    } finally {
      dndSaving.value = false
    }
  }

  function cancelDndChanges() {
    if (!dndDirty.value || !dndSettings.value) return
    dndForm.value = {
      dndStart: dndSettings.value.dndStart,
      dndEnd: dndSettings.value.dndEnd,
    }
    chrome.notify('已取消修改', 'info')
  }

  function dndHourTitle(hour: number) {
    let title = formatHour(hour)
    if (isHourInDnd(hour, dndForm.value.dndStart, dndForm.value.dndEnd)) title += ' · 静默'
    if (hour === currentHour.value) title += ' · 当前'
    return title
  }

  function dndTimelineAria() {
    return `静默时段 ${dndRangeLabel(dndForm.value.dndStart, dndForm.value.dndEnd)}`
  }

  watch(options.alertSection, (sec) => {
    if (sec === 'dnd' && !dndSettings.value && !dndLoading.value) loadDndSettings()
  })

  return {
    dndSettings,
    dndForm,
    dndLoading,
    dndLoadError,
    dndSaving,
    dndPresets,
    currentHour,
    currentTimeLabel,
    dndPreviewActive,
    dndDurationHours: dndDurationHoursComputed,
    dndDirty,
    formatHour,
    dndRangeLabel,
    isHourInDnd,
    dndRangeStyle,
    isDndPresetActive,
    applyDndPreset,
    loadDndSettings,
    saveDnd,
    cancelDndChanges,
    dndHourTitle,
    dndTimelineAria,
  }
}

// ── useAlertRulesPanelRuleEditor ──
function defaultClause(): ConditionClause {
  return { join: '&&', condType: 'state', condAttr: 'brightness', condOp: '>', condValue: 'on' }
}

function clauseToExpr(clause: ConditionClause) {
  if (clause.condType === 'state') return (clause.condValue || 'on').trim()
  if (clause.condType === 'contains') return `contains ${clause.condValue ?? ''}`.trim()
  if (clause.condType === 'numeric')
    return `${clause.condOp || '>'} ${clause.condValue ?? ''}`.trim()
  if (clause.condType === 'attr' && clause.condOp === 'contains') {
    return `attr:${clause.condAttr || 'brightness'} contains ${clause.condValue ?? ''}`.trim()
  }
  return `attr:${clause.condAttr || 'brightness'} ${clause.condOp || '>'} ${clause.condValue ?? ''}`.trim()
}

function parseSingleClause(expr: string): ConditionClause {
  const trimmed = (expr || 'on').trim()
  const contains = trimmed.match(/^contains\s+(.+)$/i)
  if (contains) {
    return {
      join: '&&',
      condType: 'contains',
      condAttr: '',
      condOp: 'contains',
      condValue: contains[1].trim(),
    }
  }
  const attr = trimmed.match(/^attr:([a-zA-Z0-9_]+)\s*(.*)$/)
  if (attr) {
    const rest = attr[2].trim()
    const m = rest.match(/^(>=|<=|==|!=|>|<|=|contains)\s*(.+)$/i)
    return {
      join: '&&',
      condType: 'attr',
      condAttr: attr[1],
      // `=` 归一为 `==`（后端两者等价，编辑器统一落 `==`）
      condOp: m ? (m[1] === '=' ? '==' : m[1].toLowerCase()) : '>',
      condValue: m ? m[2] : '',
    }
  }
  const num = trimmed.match(/^(>=|<=|==|!=|>|<|=)\s*(.+)$/)
  if (num)
    return {
      join: '&&',
      condType: 'numeric',
      condAttr: '',
      condOp: num[1] === '=' ? '==' : num[1],
      condValue: num[2],
    }
  return { join: '&&', condType: 'state', condAttr: '', condOp: '==', condValue: trimmed }
}

function parseCompoundCondition(condition: string): ConditionClause[] {
  const tokens = (condition || 'on')
    .trim()
    .split(/(\|\||&&)/)
    .map((s) => s.trim())
    .filter(Boolean)
  const clauses: ConditionClause[] = []
  let pendingJoin: '&&' | '||' | null = null
  for (const token of tokens) {
    if (token === '||' || token === '&&') {
      pendingJoin = token
      continue
    }
    const clause = parseSingleClause(token)
    if (clauses.length > 0) clause.join = pendingJoin || '&&'
    clauses.push(clause)
    pendingJoin = null
  }
  return clauses.length ? clauses : [defaultClause()]
}

function parseConditionToVisual(condition: string) {
  const expr = (condition || 'on').trim()
  if (expr.includes('||') || expr.includes('&&')) {
    return {
      conditionMode: 'compound' as ConditionMode,
      clauses: parseCompoundCondition(expr),
      condition: expr,
    }
  }
  const single = parseSingleClause(expr)
  return { conditionMode: 'visual' as ConditionMode, ...single, condition: expr }
}

/** 冷却时长归一化：0 保留为"不抑制"，非法值回退默认 60 分钟 */
function normalizeCooldownMinutes(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 60
}

/** 默认推送渠道：仅站内 + 实时推送（面板承诺「默认写入通知中心，勾选后才额外推送」） */
const DEFAULT_ALERT_RULE_CHANNELS = ['in_app', 'socket']

/**
 * 推送渠道归一化：未勾选任何外部渠道时落为「仅站内 + 实时」。
 *
 * 后端 `resolveLanChannels` 把空数组语义定义为「全选」（in_app/socket/tts/email/webpush/wecom），
 * 若原样提交空数组，会导致未勾选 Email/WebPush/企微/TTS 的规则也全量外发。
 * 故保存前显式收敛为站内渠道，保证前端文案与后端行为一致。
 *
 * @param value 编辑表单中的渠道数组
 * @returns 去重后的渠道列表；空/非法输入回退 DEFAULT_ALERT_RULE_CHANNELS
 */
function normalizeAlertRuleChannels(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value.filter((c): c is string => typeof c === 'string' && c.length > 0)
    : []
  return list.length ? [...new Set(list)] : [...DEFAULT_ALERT_RULE_CHANNELS]
}

function serializeEditingForm(form: AlertRuleEditForm | null) {
  if (!form) return null
  return JSON.stringify({
    id: form.id ?? null,
    name: String(form.name || '').trim(),
    entityId: String(form.entityId || '').trim(),
    messageTemplate: String(form.messageTemplate || '').trim(),
    title: String(form.title || '').trim(),
    condition: String(form.condition || '').trim(),
    level: form.level ?? 'warn',
    cooldownMinutes: normalizeCooldownMinutes(form.cooldownMinutes),
    enabled: form.enabled !== false,
    conditionMode: form.conditionMode ?? 'visual',
    condType: form.condType ?? 'state',
    condOp: form.condOp ?? '>',
    condValue: form.condValue ?? '',
    condAttr: form.condAttr ?? 'brightness',
    clauses: form.clauses ?? [],
  })
}

/** 告警规则面板：规则编辑与条件表达式 */
function useAlertRulesPanelRuleEditor(options: {
  isAdmin: Ref<boolean>
  notify: (msg: string, type?: string) => void
  confirm: (
    message: string,
    title?: string,
    opts?: { type?: string; confirmText?: string; cancelText?: string },
  ) => Promise<boolean>
}) {
  const editing = ref<AlertRuleEditForm | null>(null)
  const editingBaseline = ref<AlertRuleEditForm | null>(null)
  /** 冷却周期单位：分钟级 / 小时级（提交前统一换算为 cooldownMinutes） */
  const cooldownUnit = ref<'minute' | 'hour'>('minute')

  function captureEditingBaseline() {
    editingBaseline.value = editing.value
      ? (clonePlain(editing.value) as AlertRuleEditForm)
      : null
  }

  const editingDirty = computed(() => {
    if (!editing.value) return false
    if (editingBaseline.value == null) return false
    return serializeEditingForm(editing.value) !== serializeEditingForm(editingBaseline.value)
  })

  function syncConditionFromVisual() {
    if (!editing.value || editing.value.conditionMode === 'raw') return
    const e = editing.value
    if (e.conditionMode === 'compound') {
      e.condition = (e.clauses || [])
        .map((c, i) => {
          const part = clauseToExpr(c)
          return i === 0 ? part : `${c.join || '&&'} ${part}`
        })
        .join(' ')
        .trim()
      return
    }
    if (e.condType === 'state') e.condition = (e.condValue || 'on').trim()
    else if (e.condType === 'contains') e.condition = `contains ${e.condValue ?? ''}`.trim()
    else if (e.condType === 'numeric')
      e.condition = `${e.condOp || '>'} ${e.condValue ?? ''}`.trim()
    else if (e.condType === 'attr' && e.condOp === 'contains') {
      e.condition = `attr:${e.condAttr || 'brightness'} contains ${e.condValue ?? ''}`.trim()
    } else
      e.condition =
        `attr:${e.condAttr || 'brightness'} ${e.condOp || '>'} ${e.condValue ?? ''}`.trim()
  }

  function syncClause() {
    syncConditionFromVisual()
  }

  function setConditionMode(mode: ConditionMode) {
    if (!editing.value) return
    editing.value.conditionMode = mode
    if (mode === 'compound') {
      editing.value.clauses = parseCompoundCondition(editing.value.condition)
      syncConditionFromVisual()
    } else if (mode === 'visual') {
      Object.assign(editing.value, parseSingleClause(editing.value.condition))
      syncConditionFromVisual()
    }
  }

  function addClause() {
    const form = editing.value
    if (!form) return
    if (!form.clauses) form.clauses = [defaultClause()]
    form.clauses.push(defaultClause())
    syncConditionFromVisual()
  }

  function removeClause(idx: number) {
    editing.value?.clauses?.splice(idx, 1)
    syncConditionFromVisual()
  }

  function openCreate() {
    if (!options.isAdmin.value) {
      options.notify('新建规则需要 admin 权限', 'info')
      return
    }
    editing.value = {
      name: '',
      entityId: '',
      messageTemplate: '',
      title: '',
      condition: 'on',
      level: 'warn',
      cooldownMinutes: 60,
      enabled: true,
      channels: [...DEFAULT_ALERT_RULE_CHANNELS],
      conditionMode: 'visual',
      condType: 'state',
      condOp: '>',
      condValue: 'on',
      condAttr: 'brightness',
      clauses: [defaultClause()],
    }
    inferCooldownUnit(60)
    captureEditingBaseline()
  }

  function openEdit(rule: InboxAlertRule) {
    editing.value = {
      ...rule,
      channels: rule.channels ?? [],
      ...parseConditionToVisual(rule.condition),
      clauses: parseCompoundCondition(rule.condition),
    } as AlertRuleEditForm
    inferCooldownUnit(editing.value.cooldownMinutes)
    nextTick(() => {
      if (editing.value?.conditionMode !== 'raw') syncConditionFromVisual()
      captureEditingBaseline()
    })
  }

  function closeEditing() {
    editing.value = null
    editingBaseline.value = null
  }

  async function cancelEditingChanges() {
    if (!editingDirty.value || !editing.value || !editingBaseline.value) return
    const ok = await options.confirm('确定放弃未保存的更改？此操作不可撤销。', '放弃更改', {
      type: 'danger',
      confirmText: '放弃更改',
      cancelText: '继续编辑',
    })
    if (!ok) return
    editing.value = clonePlain(editingBaseline.value) as AlertRuleEditForm
    options.notify('已取消修改', 'info')
  }

  function levelClass(level: AlertLevel | string) {
    if (level === 'danger') return 'bg-red-500/20 text-red-400'
    if (level === 'warn') return 'bg-amber-500/20 text-amber-400'
    return 'bg-blue-500/20 text-blue-400'
  }

  /**
   * 冷却输入框展示值（受 cooldownUnit 影响）。
   *
   * 源数据始终是 `cooldownMinutes`（分钟），小时单位时读写按 60 换算，
   * 因此切换单位不会丢失精度、也不需要额外转换步骤。
   */
  const cooldownDisplay = computed<number>({
    get: () => {
      const minutes = normalizeCooldownMinutes(editing.value?.cooldownMinutes)
      return cooldownUnit.value === 'hour' ? Math.round((minutes / 60) * 100) / 100 : minutes
    },
    set: (next: number) => {
      if (!editing.value) return
      // 输入框清空时 next 为 ''（而 Number('') === 0）会被误判为「0 = 不抑制」，故先回退默认 60 分钟
      const raw: unknown = next
      if (raw === '' || raw == null) {
        editing.value.cooldownMinutes = 60
        return
      }
      const n = Number(raw)
      if (!Number.isFinite(n)) return
      const minutes = cooldownUnit.value === 'hour' ? n * 60 : n
      editing.value.cooldownMinutes = normalizeCooldownMinutes(minutes)
    },
  })

  /** 切换冷却单位（分钟 ⇄ 小时）；源数据不变，仅切换展示口径 */
  function setCooldownUnit(unit: 'minute' | 'hour') {
    cooldownUnit.value = unit
  }

  /** 依据当前冷却分钟数推断默认单位：整小时用小时级展示，否则分钟级 */
  function inferCooldownUnit(minutes: number) {
    const m = normalizeCooldownMinutes(minutes)
    cooldownUnit.value = m > 0 && m % 60 === 0 ? 'hour' : 'minute'
  }

  /**
   * 套用常用场景模板：一次性填充名称 / 实体 / 条件 / 冷却 / 模板与级别。
   *
   * 条件同时写回可视化编辑器（单条件与组合条件各解析一次），
   * 用户套用后仍可直接微调，无需从原始表达式手工改写。
   */
  function applyQuickTemplate(preset: AlertRulePreset) {
    const form = editing.value
    if (!form) return
    form.name = preset.name
    form.entityId = preset.entityId
    form.level = preset.level
    form.cooldownMinutes = preset.cooldownMinutes
    form.messageTemplate = preset.messageTemplate
    form.title = preset.title
    form.condition = preset.condition
    form.enabled = true
    inferCooldownUnit(preset.cooldownMinutes)
    Object.assign(form, parseConditionToVisual(preset.condition))
    form.clauses = parseCompoundCondition(preset.condition)
    form.condition = preset.condition
    if (form.conditionMode !== 'raw') syncConditionFromVisual()
  }

  /** 把模板变量追加到通知模板输入框（保留用户已有文案，便于连续插入多个变量） */
  function insertTemplateVar(variable: string) {
    const form = editing.value
    if (!form) return
    form.messageTemplate = `${String(form.messageTemplate || '')}${variable}`
  }

  return {
    editing,
    editingDirty,
    cooldownUnit,
    cooldownDisplay,
    setCooldownUnit,
    inferCooldownUnit,
    applyQuickTemplate,
    insertTemplateVar,
    syncConditionFromVisual,
    syncClause,
    setConditionMode,
    addClause,
    removeClause,
    openCreate,
    openEdit,
    closeEditing,
    cancelEditingChanges,
    levelClass,
  }
}

// ── useAlertRulesRecommend ──
/** useAlertRulesRecommend：函数，按签名入参返回处理结果。 */
export function useAlertRulesRecommend(
  existingEntityIds: () => Set<string>,
  addEntityTtsAlert: (entityId: string) => boolean,
) {
  const { statsLoading, eventStats, loadStats } = useEventLogStats()

  const recommendations = computed(() =>
    buildAlertRulesRecommendations({
      stats: eventStats.value,
      existingEntityIds: existingEntityIds(),
    }),
  )

  function applyChip(chip: RecommendChip) {
    const entityId = String(chip.payload?.entityId || '').trim()
    if (!entityId) return
    addEntityTtsAlert(entityId)
  }

  function applyAll() {
    const chips = (recommendations.value.groups || []).flatMap((g) => g.chips)
    for (const chip of chips) applyChip(chip)
  }

  onMounted(() => {
    void loadStats()
  })

  return {
    statsLoading,
    recommendations,
    applyChip,
    applyAll,
    refresh: loadStats,
  }
}
