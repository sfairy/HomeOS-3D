/**
 * @file voice.internals.ts
 * @module frontend/src/views
 */
/** composables：语音配置 / 每日顾问 / 指令编辑 / 告警编辑 */
import { DEFAULT_VOICE_ALERT_RULES, getVoiceAlertCatalog, getVoiceAlertGroups, mergeVoiceAlertRules, newCustomTtsAlert, newEntityTtsAlert, normalizeCustomTtsAlerts, normalizeEntityTtsAlerts, normalizeWakeWords } from '@/constants/voice-alert-catalog'
import { fetchVoiceMeta, fetchVoicePresets } from '@/services/api/system'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { reloadFrontendConfig } from '@/utils/config/frontend-config'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import { useSettingsSave } from '@/features/settings/composables/hub-ui.internals'
import { isSystemConfigConflictError, useSystemConfig } from '@/composables/config/system-config-core.internals'
import { builtinStyleTemplate, composeCustomAlertTemplate, dailyPresetTemplate, detectBuiltinStyle, detectCustomSpeechMode, detectDailyPreset, getAlertPreviewSamples, getBuiltinDefaultSpeech, getDailyAdvisorDayPresets, getDailyAdvisorEveningPresets, getEntityTtsVarChips, previewVarsForEntity, stylesForAlertKey } from '@/utils/voice/speech.util'
import { servicesForDomainBuilder } from '@/utils/registry/widget-catalog'
import type { Ref } from 'vue'
import { computed, reactive, ref } from 'vue'

interface VoiceCommand {
  phrases: string[]
  domain: string
  service: string
  entityMatch: string
  serviceData?: Record<string, unknown>
}

interface VoiceConfigState {
  ttsEnabled: boolean
  /** local=本机；ha=HA 音箱；auto=本机优先回退 HA */
  ttsOutputMode: 'local' | 'ha' | 'auto'
  sttMode: string
  language: string
  sttEntityId: string
  useHaConversation: boolean
  dailyAdvisorSpeak: boolean
  dailyAdvisorSpeakHour: number
  dailyAdvisorTtsDaytime: string
  dailyAdvisorTtsEvening: string
  interactionMode: string
  wakeWordEnabled: boolean
  /** 连续对话（免重复唤醒）开关 */
  continuousConversation: boolean
  wakeWords: string[]
  ttsAlerts: typeof DEFAULT_VOICE_ALERT_RULES
  ttsAlertTemplates: Record<string, string>
  customTtsAlerts: Array<ReturnType<typeof newCustomTtsAlert> & { speechMode?: string; speechText?: string }>
  entityTtsAlerts: Array<ReturnType<typeof newEntityTtsAlert> & { speechMode?: string; speechText?: string }>
}

interface BuiltinStyleState {
  style: string
  customText: string
}

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

// ── useVoiceConfig ──
function normalizeTtsOutputMode(raw: unknown): 'local' | 'ha' | 'auto' {
  if (raw === 'local' || raw === 'auto') return raw
  return 'ha'
}

const DEFAULT_VOICE: VoiceConfigState = {
  ttsEnabled: true,
  ttsOutputMode: 'ha',
  sttMode: 'browser',
  language: 'zh-CN',
  sttEntityId: '',
  useHaConversation: false,
  dailyAdvisorSpeak: false,
  dailyAdvisorSpeakHour: 20,
  dailyAdvisorTtsDaytime: '',
  dailyAdvisorTtsEvening: '',
  interactionMode: 'push',
  wakeWordEnabled: false,
  continuousConversation: false,
  wakeWords: ['小智'],
  ttsAlerts: { ...DEFAULT_VOICE_ALERT_RULES },
  ttsAlertTemplates: {},
  customTtsAlerts: [],
  entityTtsAlerts: [],
}

function domainEntityPrefix(domain: unknown) {
  return `${String(domain || 'light').trim()}.`
}

function normalizeEntityMatch(domain: unknown, entityMatch: unknown) {
  const prefix = domainEntityPrefix(domain)
  const m = String(entityMatch || '').trim()
  if (!m || m === prefix) return prefix
  if (!m.startsWith(prefix)) return prefix
  return m
}

function normalizeCommand(cmd: Partial<VoiceCommand> & Record<string, unknown>) {
  const domain = cmd?.domain || 'light'
  return {
    phrases: Array.isArray(cmd?.phrases) ? [...cmd.phrases] : [],
    domain,
    service: cmd?.service || 'turn_on',
    entityMatch: normalizeEntityMatch(domain, cmd?.entityMatch),
    serviceData:
      cmd?.serviceData && typeof cmd.serviceData === 'object' ? { ...cmd.serviceData } : undefined,
  }
}

export function useVoiceConfig() {
  const chrome = useChromeStore()
  const { load: loadSystemConfig, save: saveSystemConfig } = useSystemConfig()
  const loading = ref(false)
  const loadError = ref('')
  const { saving, runSave } = useSettingsSave()
  const voice = ref({ ...DEFAULT_VOICE })
  const ttsMediaPlayerId = ref<string>('')
  const ttsMediaPlayerIds = ref<string[]>([])
  const speakCooldownMin = ref(10)
  const tipCooldownHours = ref(2)
  const voiceCommands = ref<VoiceCommand[]>([])

  function enrichCustomAlert<T extends { messageTemplate?: string }>(rule: T) {
    const { mode, fixedText } = detectCustomSpeechMode(rule.messageTemplate)
    return { ...rule, speechMode: mode, speechText: fixedText }
  }

  function enrichEntityTtsAlert<T extends { messageTemplate?: string }>(rule: T) {
    const { mode, fixedText } = detectCustomSpeechMode(rule.messageTemplate)
    return { ...rule, speechMode: mode, speechText: fixedText }
  }

  let voiceLoaded = false

  async function load(options: { silent?: boolean } = {}) {
    const showLoading = !options.silent && !voiceLoaded
    if (showLoading) {
      loading.value = true
      loadError.value = ''
    }
    try {
      const data = await loadSystemConfig()
      const v = data?.voice || {}
      const rawCustom = normalizeCustomTtsAlerts(v.customTtsAlerts).map(enrichCustomAlert)
      const rawEntity = normalizeEntityTtsAlerts(v.entityTtsAlerts).map(enrichEntityTtsAlert)
      voice.value = {
        ttsEnabled: v.ttsEnabled !== false,
        ttsOutputMode: normalizeTtsOutputMode(v.ttsOutputMode),
        sttMode: v.sttMode === 'ha' ? 'ha' : v.sttMode === 'auto' ? 'auto' : 'browser',
        language: v.language || 'zh-CN',
        sttEntityId: v.sttEntityId || '',
        useHaConversation: !!v.useHaConversation,
        dailyAdvisorSpeak: !!v.dailyAdvisorSpeak,
        dailyAdvisorSpeakHour: Number(v.dailyAdvisorSpeakHour ?? 20),
        dailyAdvisorTtsDaytime: String(v.dailyAdvisorTtsDaytime || '').trim(),
        dailyAdvisorTtsEvening: String(v.dailyAdvisorTtsEvening || '').trim(),
        interactionMode: v.interactionMode === 'wake' ? 'wake' : 'push',
        wakeWordEnabled: !!v.wakeWordEnabled,
        continuousConversation: !!v.continuousConversation,
        wakeWords: normalizeWakeWords(v),
        ttsAlerts: mergeVoiceAlertRules(v.ttsAlerts),
        ttsAlertTemplates: { ...(v.ttsAlertTemplates || {}) } as Record<string, string>,
        customTtsAlerts: rawCustom as VoiceConfigState['customTtsAlerts'],
        entityTtsAlerts: rawEntity as VoiceConfigState['entityTtsAlerts'],
      }
      ttsMediaPlayerId.value = data?.external?.ttsMediaPlayerId || ''
      const rawIds = data?.external?.ttsMediaPlayerIds
      if (Array.isArray(rawIds) && rawIds.length > 0) {
        ttsMediaPlayerIds.value = rawIds.map((id: string) => String(id).trim()).filter(Boolean)
      } else {
        ttsMediaPlayerIds.value = []
      }
      speakCooldownMin.value = Number(data?.other?.speakCooldownMin ?? 10)
      tipCooldownHours.value = Number(data?.other?.tipCooldownHours ?? 2)
      voiceCommands.value = (data?.voiceCommands || []).map(normalizeCommand)
      voiceLoaded = true
      return true
    } catch (e) {
      logger.error('加载语音配置失败', e)
      if (!options.silent) {
        loadError.value = getApiErrorMessage(e, '加载语音配置失败')
        chrome.notify(loadError.value, 'error')
      }
      return false
    } finally {
      if (showLoading) loading.value = false
    }
  }

  async function save() {
    return runSave(
      async () => {
        const cleanedCommands = voiceCommands.value
          .map((cmd) => {
            const phrases = (cmd.phrases || []).map((p) => String(p).trim()).filter(Boolean)
            if (!phrases.length) return null
            const out: Record<string, unknown> = {
              phrases,
              domain: String(cmd.domain || '').trim(),
              service: String(cmd.service || '').trim(),
            }
            if (cmd.entityMatch?.trim()) out.entityMatch = cmd.entityMatch.trim()
            if (cmd.serviceData && Object.keys(cmd.serviceData).length)
              out.serviceData = cmd.serviceData
            return out
          })
          .filter((cmd): cmd is Record<string, unknown> => Boolean(cmd))

        const templates = Object.fromEntries(
          Object.entries(voice.value.ttsAlertTemplates || {})
            .map(([k, val]) => [k, String(val || '').trim()])
            .filter(([, val]) => val),
        )
        const customAlerts = normalizeCustomTtsAlerts(
          voice.value.customTtsAlerts.map((r) => ({
            ...r,
            messageTemplate: composeCustomAlertTemplate(r.speechMode || 'trigger', r.speechText),
          })),
        )
        const entityAlerts = normalizeEntityTtsAlerts(
          voice.value.entityTtsAlerts.map((r) => ({
            ...r,
            messageTemplate: composeCustomAlertTemplate(r.speechMode || 'trigger', r.speechText),
          })),
        )
        const wakeWords = normalizeWakeWords(voice.value)

        const cleanedPlayerIds = ttsMediaPlayerIds.value
          .map((id) => String(id).trim())
          .filter(Boolean)
        const primaryPlayerId = cleanedPlayerIds[0] || ''

        await saveSystemConfig({
          voice: {
            ...voice.value,
            wakeWords,
            ttsAlertTemplates: templates,
            customTtsAlerts: customAlerts,
            entityTtsAlerts: entityAlerts,
          },
          external: {
            ttsMediaPlayerId: primaryPlayerId,
            ttsMediaPlayerIds: cleanedPlayerIds,
          },
          other: {
            speakCooldownMin: Number(speakCooldownMin.value) || 10,
            tipCooldownHours: Number(tipCooldownHours.value) || 2,
          },
          voiceCommands: cleanedCommands,
        })
        await reloadFrontendConfig()
        return true
      },
      {
        onError: async (e: unknown) => {
          if (isSystemConfigConflictError(e)) {
            await load({ silent: true })
            return
          }
          logger.error('保存语音配置失败', e)
          chrome.notify(getApiErrorMessage(e, '保存语音配置失败'), 'error')
        },
      },
    )
  }

  function addCommand() {
    voiceCommands.value.push({
      phrases: [''],
      domain: 'light',
      service: 'turn_on',
      entityMatch: 'light.',
      serviceData: undefined,
    })
  }

  function removeCommand(index: number) {
    voiceCommands.value.splice(index, 1)
  }

  function phrasesText(cmd: VoiceCommand) {
    return (cmd.phrases || []).join('，')
  }

  function setPhrasesText(cmd: VoiceCommand, text: string) {
    cmd.phrases = String(text || '')
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  async function fetchCommandPresets() {
    const { data } = await fetchVoicePresets()
    return (data?.presets || []).map((c: unknown) => normalizeCommand(c as Partial<VoiceCommand> & Record<string, unknown>))
  }

  async function importWholeHomePresets(replace = false) {
    const presets = await fetchCommandPresets()
    if (replace) {
      voiceCommands.value = presets
      return presets.length
    }
    const existing = new Set(
      voiceCommands.value.map((c) => `${c.domain}.${c.service}:${(c.phrases || []).join('|')}`),
    )
    let added = 0
    for (const p of presets) {
      const key = `${p.domain}.${p.service}:${(p.phrases || []).join('|')}`
      if (existing.has(key)) continue
      voiceCommands.value.push(p)
      existing.add(key)
      added++
    }
    return added
  }

  function addEntityTtsAlert(entityId = '') {
    const id = String(entityId || '').trim()
    if (id) {
      const dup = voice.value.entityTtsAlerts.some((r) => r.entityId === id)
      if (dup) {
        chrome.notify(`实体 ${id} 已在播报列表中`, 'info')
        return false
      }
    }
    voice.value.entityTtsAlerts.push(enrichEntityTtsAlert(newEntityTtsAlert(id)))
    return true
  }

  async function removeEntityTtsAlert(index: number) {
    const item = voice.value.entityTtsAlerts[index]
    const label = item?.entityId || `#${index + 1}`
    const ok = await chrome.confirm(`确定移除实体播报「${label}」？`, '删除', {
      type: 'danger',
      confirmText: '删除',
    })
    if (!ok) return
    voice.value.entityTtsAlerts.splice(index, 1)
  }

  function addCustomAlert() {
    voice.value.customTtsAlerts.push(enrichCustomAlert(newCustomTtsAlert()))
  }

  async function removeCustomAlert(index: number) {
    const item = voice.value.customTtsAlerts[index]
    const label = item?.label || `#${index + 1}`
    const ok = await chrome.confirm(`确定删除自定义语音提醒「${label}」？`, '删除', {
      type: 'danger',
      confirmText: '删除',
    })
    if (!ok) return
    voice.value.customTtsAlerts.splice(index, 1)
  }

  function ensureAlertTemplate(key: string) {
    if (!voice.value.ttsAlertTemplates) voice.value.ttsAlertTemplates = {}
    if (voice.value.ttsAlertTemplates[key] === undefined) {
      voice.value.ttsAlertTemplates[key] = ''
    }
  }

  return {
    loading,
    loadError,
    saving,
    voice,
    ttsMediaPlayerId,
    ttsMediaPlayerIds,
    speakCooldownMin,
    tipCooldownHours,
    voiceCommands,
    load,
    save,
    addCommand,
    removeCommand,
    phrasesText,
    setPhrasesText,
    importWholeHomePresets,
    addCustomAlert,
    removeCustomAlert,
    addEntityTtsAlert,
    removeEntityTtsAlert,
    ensureAlertTemplate,
  }
}

// ── useVoiceDailyAdvisorPanel ──
interface VoiceDailyFields {
  dailyAdvisorTtsDaytime?: string
  dailyAdvisorTtsEvening?: string
}

export function useVoiceDailyAdvisorPanel(voice: Ref<VoiceDailyFields>) {
  const dailyDayPreset = ref('default')
  const dailyDayCustom = ref('')
  const dailyEveningPreset = ref('default')
  const dailyEveningCustom = ref('')

  const dailyAdvisorDayPresets = computed(() => getDailyAdvisorDayPresets())
  const dailyAdvisorEveningPresets = computed(() => getDailyAdvisorEveningPresets())

  const dailyDayTemplate = computed(() =>
    dailyPresetTemplate(dailyDayPreset.value, 'day', dailyDayCustom.value),
  )
  const dailyEveningTemplate = computed(() =>
    dailyPresetTemplate(dailyEveningPreset.value, 'evening', dailyEveningCustom.value),
  )

  function syncDailyFromVoice() {
    dailyDayPreset.value = detectDailyPreset('day', voice.value.dailyAdvisorTtsDaytime)
    dailyDayCustom.value =
      dailyDayPreset.value === 'custom' ? voice.value.dailyAdvisorTtsDaytime || '' : ''
    dailyEveningPreset.value = detectDailyPreset('evening', voice.value.dailyAdvisorTtsEvening)
    dailyEveningCustom.value =
      dailyEveningPreset.value === 'custom' ? voice.value.dailyAdvisorTtsEvening || '' : ''
  }

  function syncDailyDay() {
    voice.value.dailyAdvisorTtsDaytime = dailyPresetTemplate(
      dailyDayPreset.value,
      'day',
      dailyDayCustom.value,
    )
  }

  function syncDailyEvening() {
    voice.value.dailyAdvisorTtsEvening = dailyPresetTemplate(
      dailyEveningPreset.value,
      'evening',
      dailyEveningCustom.value,
    )
  }

  function onDailyDayPreset(id: string) {
    dailyDayPreset.value = id
    syncDailyDay()
  }

  function onDailyEveningPreset(id: string) {
    dailyEveningPreset.value = id
    syncDailyEvening()
  }

  return {
    dailyDayPreset,
    dailyDayCustom,
    dailyEveningPreset,
    dailyEveningCustom,
    dailyAdvisorDayPresets,
    dailyAdvisorEveningPresets,
    dailyDayTemplate,
    dailyEveningTemplate,
    syncDailyFromVoice,
    syncDailyDay,
    syncDailyEvening,
    onDailyDayPreset,
    onDailyEveningPreset,
  }
}

// ── useVoiceCommandEditor ──
function domainPrefix(domain: string | undefined) {
  return `${String(domain || '').trim()}.`
}

export function useVoiceCommandEditor() {
  /** 记录用户显式选择「指定实体」但尚未填值的命令，避免 entityMatch 为空时被推回 all */
  const specificScopeCmds = reactive(new Set<object>())

  function servicesForCmd(cmd: { domain?: string } | null | undefined) {
    return servicesForDomainBuilder(cmd?.domain || 'light')
  }

  function entityScope(cmd: { domain?: string; entityMatch?: string }) {
    if (specificScopeCmds.has(cmd)) return 'specific'
    const prefix = domainPrefix(cmd.domain || 'light')
    const m = String(cmd.entityMatch || '').trim()
    return !m || m === prefix ? 'all' : 'specific'
  }

  function entityInputValue(cmd: { domain?: string; entityMatch?: string }) {
    const prefix = domainPrefix(cmd.domain || 'light')
    const m = String(cmd.entityMatch || '').trim()
    return m === prefix ? '' : m
  }

  function onEntityScopeChange(cmd: { domain?: string; entityMatch?: string }, scope: string) {
    if (scope === 'specific') {
      specificScopeCmds.add(cmd)
      cmd.entityMatch = ''
    } else {
      specificScopeCmds.delete(cmd)
      cmd.entityMatch = domainPrefix(cmd.domain)
    }
  }

  function onEntityInput(cmd: { domain?: string; entityMatch?: string }, val: unknown) {
    const v = String(val || '').trim()
    cmd.entityMatch = v || domainPrefix(cmd.domain)
    if (v) specificScopeCmds.delete(cmd)
  }

  function onDomainChange(
    cmd: {
      domain?: string
      service?: string
      entityMatch?: string
      serviceData?: unknown
    },
    domain: string,
  ) {
    cmd.domain = domain
    const services = servicesForDomainBuilder(domain)
    if (!services.includes(cmd.service || '')) cmd.service = services[0] || 'turn_on'
    cmd.entityMatch = domainPrefix(domain)
    cmd.serviceData = undefined
    specificScopeCmds.delete(cmd)
  }

  function needsClimateMode(cmd: { domain?: string; service?: string }) {
    return cmd.domain === 'climate' && cmd.service === 'set_hvac_mode'
  }

  function setClimateMode(cmd: { serviceData?: Record<string, unknown> }, mode: string) {
    cmd.serviceData = { ...(cmd.serviceData || {}), hvac_mode: mode }
  }

  function onServiceChange(cmd: {
    domain?: string
    service?: string
    serviceData?: Record<string, unknown>
  }) {
    if (needsClimateMode(cmd) && !cmd.serviceData?.hvac_mode) setClimateMode(cmd, 'cool')
  }

  return {
    servicesForCmd,
    entityScope,
    entityInputValue,
    onEntityScopeChange,
    onEntityInput,
    onDomainChange,
    needsClimateMode,
    setClimateMode,
    onServiceChange,
  }
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
