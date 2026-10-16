/**
 * @file voice-config.internals.ts
 * @module frontend/src/views
 */
/** 语音系统配置（TTS/STT/告警规则状态） */
import {
  DEFAULT_VOICE_ALERT_RULES,
  mergeVoiceAlertRules,
  newCustomTtsAlert,
  newEntityTtsAlert,
  normalizeCustomTtsAlerts,
  normalizeEntityTtsAlerts,
  normalizeWakeWords,
} from '@/shared/constants/voice-alert-catalog'
import { fetchVoicePresets } from '@/services/api/system'
import { useChromeStore } from '@/stores/chrome.store'
import { reloadFrontendConfig } from '@/shared/utils/config/frontend-config'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'
import { useSettingsSave } from '@/composables/settings-kernel/save.internals'
import { isSystemConfigConflictError, useSystemConfig } from '@/composables/config/system-config-core.internals'
import {
  composeCustomAlertTemplate,
  detectCustomSpeechMode,
} from '@/shared/voice/utils/speech.util'
import { ref } from 'vue'

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
