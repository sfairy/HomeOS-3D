/**
 * @file voice-alerts.internals.ts
 * @module frontend/src/views
 */
/** 语音告警编辑器 */
import { computed, reactive, ref } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  getVoiceAlertCatalog,
  getVoiceAlertGroups,
} from '@/shared/constants/voice-alert-catalog'
import {
  builtinStyleTemplate,
  composeCustomAlertTemplate,
  detectBuiltinStyle,
  getAlertPreviewSamples,
  getBuiltinDefaultSpeech,
  getEntityTtsVarChips,
  previewVarsForEntity,
  stylesForAlertKey,
} from '@/shared/voice/utils/speech.util'
import { useVoiceConfig } from '@/features/settings/interact/composables/voice-config.internals'
import { fetchVoiceMeta } from '@/services/api/system'
import { logger } from '@/shared/utils/core/logger'

interface AlertCatalogEntry {
  key: string
  label?: string
  group?: string
  [key: string]: unknown
}

interface AlertCatalogGroup {
  id: string
  label?: string
  items: AlertCatalogEntry[]
}

interface BuiltinStyleState {
  style: string
  customText: string
}

// ── useVoiceAlertsEditor ──
export function useVoiceAlertsEditor() {
  const entitiesStore = useEntitiesStore()
  const {
    loading: voiceLoading,
    loadError: voiceLoadError,
    saving: voiceSaving,
    voice,
    ttsMediaPlayerId,
    speakCooldownMin,
    load: loadVoice,
    save: saveVoice,
    addCustomAlert,
    removeCustomAlert,
    addEntityTtsAlert,
    removeEntityTtsAlert,
  } = useVoiceConfig()

  const voiceMeta = ref<{ alertCatalog: AlertCatalogEntry[] }>({ alertCatalog: [] })
  const expandedAlert = ref<string | null>(null)
  const builtinStyleState = reactive<Record<string, BuiltinStyleState>>({})
  const voiceSaveTip = ref<string>('')

  const alertRuleGroups = computed(() => {
    const catalog = voiceMeta.value.alertCatalog?.length
      ? voiceMeta.value.alertCatalog
      : getVoiceAlertCatalog()
    const groupsMap = getVoiceAlertGroups()
    const groups: Record<string, AlertCatalogGroup> = {}
    for (const item of catalog) {
      const gid = item.group || 'notify'
      if (!groups[gid])
        groups[gid] = {
          id: gid,
          label: (groupsMap as Record<string, string>)[gid] || gid,
          items: [],
        }
      groups[gid].items.push(item)
    }
    return Object.values(groups)
  })

  const builtinDefaultSpeech = computed(() => getBuiltinDefaultSpeech())

  const alertPreviewSamples = computed(() => getAlertPreviewSamples())

  const enabledVoiceAlertCount = computed(() => {
    if (!voice.value.ttsAlerts?.enabled) return 0
    const alerts = voice.value.ttsAlerts as Record<string, unknown>
    const builtin = Object.keys(alerts).filter((k) => k !== 'enabled' && alerts[k]).length
    const custom = (voice.value.customTtsAlerts || []).filter((r) => r.enabled).length
    const entity = (voice.value.entityTtsAlerts || []).filter((r) => r.enabled).length
    return builtin + custom + entity
  })

  const entityTtsVarChips = getEntityTtsVarChips()

  function entityPreviewVars(entityId: string) {
    return previewVarsForEntity(entityId, entitiesStore)
  }

  function insertEntityTtsVar(
    rule: { speechText?: string; speechMode?: string },
    varKey: string,
  ) {
    const token = `{{${varKey}}}`
    const cur = rule.speechText || ''
    rule.speechText = cur ? `${cur} ${token}` : token
    rule.speechMode = 'fixed'
  }

  async function loadVoiceMeta() {
    try {
      const { data } = await fetchVoiceMeta()
      voiceMeta.value = data || {}
    } catch (e) {
      logger.debug('加载语音元数据失败', e)
    }
    if (!voiceMeta.value.alertCatalog?.length) {
      voiceMeta.value.alertCatalog = getVoiceAlertCatalog()
    }
  }

  function syncBuiltinStylesFromVoice() {
    const catalog = voiceMeta.value.alertCatalog || getVoiceAlertCatalog()
    for (const item of catalog) {
      const tpl = voice.value.ttsAlertTemplates?.[item.key] || ''
      const style = detectBuiltinStyle(item.key, tpl)
      builtinStyleState[item.key] = { style, customText: style === 'custom' ? tpl : '' }
    }
  }

  function applyBuiltinStylesToVoice() {
    if (!voice.value.ttsAlertTemplates) voice.value.ttsAlertTemplates = {}
    for (const key of Object.keys(builtinStyleState)) {
      const { style, customText } = builtinStyleState[key]
      const tpl = builtinStyleTemplate(style, customText)
      if (tpl) voice.value.ttsAlertTemplates[key] = tpl
      else delete voice.value.ttsAlertTemplates[key]
    }
  }

  function setBuiltinStyle(key: string, style: string) {
    if (!builtinStyleState[key]) builtinStyleState[key] = { style: 'default', customText: '' }
    builtinStyleState[key].style = style
    applyBuiltinStyle(key)
  }

  function setBuiltinCustom(key: string, text: string) {
    if (!builtinStyleState[key]) builtinStyleState[key] = { style: 'custom', customText: '' }
    builtinStyleState[key].customText = text
    applyBuiltinStyle(key)
  }

  function applyBuiltinStyle(key: string) {
    const { style, customText } = builtinStyleState[key]
    const tpl = builtinStyleTemplate(style, customText)
    if (!voice.value.ttsAlertTemplates) voice.value.ttsAlertTemplates = {}
    if (tpl) voice.value.ttsAlertTemplates[key] = tpl
    else delete voice.value.ttsAlertTemplates[key]
  }

  function insertBuiltinVar(key: string, varKey: string) {
    const token = `{{${varKey}}}`
    const cur = builtinStyleState[key]?.customText || ''
    setBuiltinCustom(key, cur ? `${cur} ${token}` : token)
    setBuiltinStyle(key, 'custom')
  }

  function builtinPreviewTemplate(key: string) {
    const s = builtinStyleState[key]
    if (!s || s.style === 'default') return ''
    return builtinStyleTemplate(s.style, s.customText)
  }

  function varChipsForKey(key: string) {
    const map: Record<string, Array<{ key: string; label: string }>> = {
      securityZone: [
        { key: 'name', label: '设备名' },
        { key: 'zones', label: '区域' },
      ],
      securityAnomaly: [{ key: 'message', label: '详情' }],
      notificationDanger: [{ key: 'message', label: '通知内容' }],
      notificationWarn: [{ key: 'message', label: '通知内容' }],
    }
    return map[key] || [{ key: 'name', label: '设备名' }]
  }

  function toggleAlertExpand(key: string) {
    expandedAlert.value = expandedAlert.value === key ? null : key
  }

  async function initVoiceAlerts() {
    await loadVoice()
    await loadVoiceMeta()
    syncBuiltinStylesFromVoice()
  }

  async function persistVoiceAlerts() {
    applyBuiltinStylesToVoice()
    voiceSaveTip.value = ''
    const ok = await saveVoice()
    voiceSaveTip.value = ok ? '语音告警已保存' : '保存失败'
    return ok
  }

  return {
    voice,
    voiceLoading,
    voiceLoadError,
    voiceSaving,
    voiceSaveTip,
    ttsMediaPlayerId,
    speakCooldownMin,
    voiceMeta,
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
  }
}
