<!--
组件：SettingsVoicePanel.vue
所属模块：frontend / src / views / settings / interact
职责：语音面板入口。通过子导航切换 overview（概览）、output（播报输出+每日问候）、
      input（语音交互+唤醒词+识别引擎）、commands（命令映射+导入模板）四个区段。
      页头提供保存/取消；支持 TTS/顾问问候试听与全屋模板导入。
关键依赖：
  - SettingsPageShell / SettingsHubSubnav / SettingsPendingSaveAction / ApiQueryState：页面骨架/子导航/保存条/加载态
  - SettingsVoiceOverviewSection / SettingsVoiceTtsSection / SettingsVoiceSttSection / SettingsVoiceCommandsSection：四个子区段
  - useVoiceConfig / useVoiceCommandEditor / useVoiceDailyAdvisorPanel：配置/命令编辑/每日问候
  - useTtsSpeak：TTS 试听
  - useSettingsPendingChanges / useRegisterSettingsTabPending：待保存快照与离开拦截
  - useSettingsHubRouteSection / useSettingsSidebarReentryReset：子导航路由同步与重入重置
数据来源：useVoiceConfig() 返回的 voice / voiceCommands / 各类试听状态
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="voice"
    icon-key="mic"
    accent="var(--module-accent-voice)"
    layout="single"
    page-class="voice-hub"
    body-class="voice-hub__body"
  >
    <template #actions>
      <SettingsPendingSaveAction
        :pending="pendingChanges"
        :saving="saving"
        save-text="保存语音配置"
        @save="onSave"
        @cancel="cancelVoiceChanges"
      />
    </template>

    <template #mobile-save>
      <SettingsPendingSaveAction
        :pending="pendingChanges"
        :saving="saving"
        save-text="保存语音配置"
        @save="onSave"
        @cancel="cancelVoiceChanges"
      />
    </template>

    <template #subnav>
      <SettingsHubSubnav v-model="voiceSection" :sections="voiceSubnavSections" />
    </template>

    <ApiQueryState
      :loading="loading"
      :error="loadError"
      error-title="语音配置加载失败"
      tone="indigo"
      @retry="load"
    >
      <p
        v-if="saveTip"
        :class="[
          'text-xs px-1',
          saveTipOk ? 'voice-panel__save-tip--ok' : 'voice-panel__save-tip--err',
        ]"
      >
        {{ saveTip }}
      </p>

      <SettingsVoiceOverviewSection
        v-show="voiceSection === 'overview'"
        :stt-mode-label="sttModeLabel"
        :intent-label="intentLabel"
        :tts-speaker-label="ttsSpeakerLabel"
        :voice-commands-count="voiceCommands.length"
        :entity-stats="entityStats"
        :voice="voice"
        :voice-rooms="voiceRooms"
      />

      <SettingsVoiceTtsSection
        v-show="voiceSection === 'output'"
        v-model:voice="voice"
        v-model:voice-output-tab="voiceOutputTab"
        v-model:tts-media-player-ids="ttsMediaPlayerIds"
        v-model:speak-cooldown-min="speakCooldownMin"
        v-model:tip-cooldown-hours="tipCooldownHours"
        v-model:test-tts-text="testTtsText"
        :voice-output-tabs="voiceOutputTabs"
        :daily-advisor-day-presets="dailyAdvisorDayPresets"
        :daily-advisor-evening-presets="dailyAdvisorEveningPresets"
        :daily-day-preset="dailyDayPreset"
        :daily-day-custom="dailyDayCustom"
        :daily-day-template="dailyDayTemplate"
        :daily-evening-preset="dailyEveningPreset"
        :daily-evening-custom="dailyEveningCustom"
        :daily-evening-template="dailyEveningTemplate"
        :testing-tts="testingTts"
        :test-tts-ok="testTtsOk"
        :test-tts-tip="testTtsTip"
        :testing-advisor="testingAdvisor"
        @test-tts="onTestTts"
        @test-daily-advisor="onTestDailyAdvisor"
        @daily-day-preset="onDailyDayPreset"
        @daily-day-custom="
          (value) => {
            dailyDayCustom = value
            syncDailyDay()
          }
        "
        @daily-evening-preset="onDailyEveningPreset"
        @daily-evening-custom="
          (value) => {
            dailyEveningCustom = value
            syncDailyEvening()
          }
        "
      />

      <SettingsVoiceSttSection
        v-show="voiceSection === 'input'"
        v-model:voice="voice"
        v-model:voice-input-tab="voiceInputTab"
        v-model:wake-words-text="wakeWordsText"
        :voice-input-tabs="voiceInputTabs"
      />

      <SettingsVoiceCommandsSection
        v-show="voiceSection === 'commands'"
        v-model:voice-commands="voiceCommands"
        :domain-options-list="domainOptionsList"
        :phrases-text="phrasesText"
        :set-phrases-text="setPhrasesText"
        :services-for-cmd="servicesForCmd"
        :entity-scope="entityScope"
        :entity-input-value="entityInputValue"
        :needs-climate-mode="needsClimateMode"
        @import-presets="onImportPresets"
        @import-presets-replace="onImportPresetsReplace"
        @add-command="addCommand"
        @remove-command="removeCommand"
        @domain-change="onDomainChange"
        @service-change="onServiceChange"
        @entity-scope-change="onEntityScopeChange"
        @entity-input="onEntityInput"
        @climate-mode="setClimateMode"
      />
    </ApiQueryState>
  </SettingsPageShell>
</template>

<script setup>
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsHubSubnav from '@/views/settings/shared/layout/SettingsHubSubnav.vue'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import SettingsVoiceOverviewSection from '@/views/settings/interact/voice/SettingsVoiceOverviewSection.vue'
import SettingsVoiceTtsSection from '@/views/settings/interact/voice/SettingsVoiceTtsSection.vue'
import SettingsVoiceSttSection from '@/views/settings/interact/voice/SettingsVoiceSttSection.vue'
import SettingsVoiceCommandsSection from '@/views/settings/interact/voice/SettingsVoiceCommandsSection.vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName, domainIndexToArray } from '@/utils/entity/derived.util'
import { useChromeStore } from '@/stores/chrome.store'
import { fetchVoiceMeta } from '@/services/api/system'
import { VOICE_ROOM_LABELS } from '@/constants/voice-command-presets'
import { parseWakeWordsText } from '@/constants/voice-alert-catalog'
import { DOMAIN_SERVICES } from '@/utils/registry/widget-catalog'
import { useVoiceConfig } from '@/composables/settings/interact/voice.internals'
import { useVoiceCommandEditor } from '@/composables/settings/interact/voice.internals'
import { useVoiceDailyAdvisorPanel } from '@/composables/settings/interact/voice.internals'
import { useTtsSpeak } from '@/composables/voice/useTtsSpeak'
import { previewDailyAdvisor } from '@/utils/voice/speech.util'
import { logger } from '@/utils/core/logger'
import { useSettingsPendingChanges } from '@/composables/settings/pending.internals'
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'
const props = defineProps({ activeTab: { type: String, default: 'voice' } })

const entitiesStore = useEntitiesStore()
const chrome = useChromeStore()
const { speak } = useTtsSpeak()
const {
  loading,
  loadError,
  saving,
  voice,
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
} = useVoiceConfig()

const voiceSection = ref('overview')
const voiceInputTab = ref('mode')
const voiceOutputTab = ref('speaker')

const voiceOutputTabs = [
  { id: 'speaker', label: '音箱与冷却', emoji: '🔊', accent: 'var(--module-accent-voice)' },
  { id: 'daily', label: '每日问候', emoji: '👋', accent: 'var(--set-warn)' },
]

const voiceInputTabs = computed(() => {
  const tabs = [
    { id: 'mode', label: '交互方式', emoji: '🎙️', accent: 'var(--module-accent-voice-sub)' },
  ]
  if (voice.value.interactionMode === 'wake') {
    tabs.push({ id: 'wake', label: '唤醒词', emoji: '📻', accent: 'var(--module-accent-voice)' })
  }
  tabs.push({ id: 'stt', label: '识别引擎', emoji: '🧠', accent: 'var(--set-info)' })
  return tabs
})

watch(
  () => voice.value.interactionMode,
  (mode) => {
    if (mode !== 'wake' && voiceInputTab.value === 'wake') voiceInputTab.value = 'mode'
  },
)

watch(voiceSection, () => {
  voiceInputTab.value = 'mode'
  voiceOutputTab.value = 'speaker'
})

function resetVoiceHubTabs() {
  voiceSection.value = 'overview'
  voiceInputTab.value = 'mode'
  voiceOutputTab.value = 'speaker'
}

useSettingsSidebarReentryReset(() => props.activeTab, 'voice', resetVoiceHubTabs)

const {
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
} = useVoiceDailyAdvisorPanel(voice)

const {
  servicesForCmd,
  entityScope,
  entityInputValue,
  onEntityScopeChange,
  onEntityInput,
  onDomainChange,
  needsClimateMode,
  setClimateMode,
  onServiceChange,
} = useVoiceCommandEditor()

const initialVoiceConfig = ref(null)

function voiceConfigCurrent() {
  return {
    voice: voice.value,
    ttsMediaPlayerIds: [...ttsMediaPlayerIds.value],
    speakCooldownMin: speakCooldownMin.value,
    tipCooldownHours: tipCooldownHours.value,
    voiceCommands: voiceCommands.value,
  }
}

const {
  pendingCount: pendingChanges,
  takeSnapshot,
  confirmAndRevert,
} = useSettingsPendingChanges({
  snapshot: initialVoiceConfig,
  current: voiceConfigCurrent,
})

useRegisterSettingsTabPending('voice', () => pendingChanges.value > 0)

function snapshotVoiceConfig() {
  takeSnapshot(voiceConfigCurrent())
}

const wakeWordsText = computed({
  get: () => (voice.value.wakeWords || []).join('，'),
  set: (text) => {
    voice.value.wakeWords = parseWakeWordsText(text)
  },
})

const voiceRooms = computed(() =>
  voiceMeta.value.rooms?.length ? voiceMeta.value.rooms : VOICE_ROOM_LABELS,
)
const voiceMeta = ref({ rooms: [] })

const saveTip = ref('')
const saveTipOk = ref(true)
const testTtsText = ref('语音播报测试')
const testingTts = ref(false)
const testTtsTip = ref('')
const testTtsOk = ref(true)
const testingAdvisor = ref(false)
let saveTipTimer = null
let testTtsTipTimer = null

const entityStats = computed(() => {
  void entitiesStore.derivedEpoch
  const countDomain = (domain) =>
    domainIndexToArray(entitiesStore.domainEntityIndex.get(domain)).length
  return {
    tts: countDomain('tts'),
    stt: countDomain('stt'),
    media: countDomain('media_player'),
  }
})

const sttModeLabel = computed(() => {
  if (voice.value.sttMode === 'auto') return '自动 (HA→浏览器)'
  if (voice.value.sttMode === 'ha') return 'HA STT'
  return '浏览器'
})
const intentLabel = computed(() => (voice.value.useHaConversation ? 'HA Assistant' : '短语命令'))
const ttsSpeakerLabel = computed(() => {
  const mode = voice.value.ttsOutputMode || 'ha'
  if (mode === 'local') return '本机浏览器'
  const ids = ttsMediaPlayerIds.value.filter((id) => id.trim())
  if (mode === 'auto') {
    if (ids.length === 0) return '本机 → HA（未配音箱）'
    if (ids.length === 1) {
      return `本机 → ${getEntityDisplayName(ids[0], entitiesStore.getEntity(ids[0]))}`
    }
    return `本机 → ${ids.length} 个音箱`
  }
  if (ids.length === 0) return '未配置'
  if (ids.length === 1) return getEntityDisplayName(ids[0], entitiesStore.getEntity(ids[0]))
  return `${ids.length} 个音箱`
})

const domainOptionsList = computed(() => {
  const catalog = Object.keys(DOMAIN_SERVICES)
  const fromEntities = entitiesStore.domains || []
  return [...new Set([...catalog, ...fromEntities])].sort((a, b) => a.localeCompare(b))
})

const voiceSubnavSections = computed(() => [
  { id: 'overview', label: '概览', emoji: '📋' },
  { id: 'output', label: '播报输出', emoji: '🔊' },
  { id: 'input', label: '语音交互', emoji: '🎙️' },
  { id: 'commands', label: '命令映射', emoji: '⌨️' },
])

useSettingsHubRouteSection(voiceSection, voiceSubnavSections, {
  tabId: 'voice',
  activeTab: () => props.activeTab,
})

async function onImportPresetsReplace() {
  const ok = await chrome.confirm(
    '将清空现有语音命令并导入全屋模板，此操作不可撤销。',
    '覆盖导入全屋模板',
    { confirmText: '覆盖导入', type: 'danger' },
  )
  if (!ok) return
  try {
    const n = await importWholeHomePresets(true)
    chrome.notify(n ? `已覆盖导入 ${n} 条命令` : '模板中无命令可导入', n ? 'success' : 'info')
  } catch {
    chrome.notify('导入全屋模板失败', 'error')
  }
}

async function onTestDailyAdvisor() {
  const mode = voice.value.ttsOutputMode || 'ha'
  const ids = ttsMediaPlayerIds.value.filter((id) => id.trim())
  if (mode === 'ha' && ids.length === 0) {
    chrome.notify('请先配置播报音箱', 'info')
    return
  }
  if (mode === 'auto' && ids.length === 0) {
    // 仅本机试听
  }
  const hour = new Date().getHours()
  const text =
    hour >= 20
      ? previewDailyAdvisor('evening', dailyEveningTemplate.value)
      : previewDailyAdvisor('day', dailyDayTemplate.value)
  testingAdvisor.value = true
  try {
    const r = await speak(text, ids.length ? { mediaPlayers: ids } : {})
    chrome.notify(r.ok ? '顾问问候已播报' : r.message || '播报失败', r.ok ? 'success' : 'error')
  } finally {
    testingAdvisor.value = false
  }
}

async function cancelVoiceChanges() {
  await confirmAndRevert(chrome, (baseline) => {
    const b = baseline || {}
    voice.value = { ...b.voice }
    ttsMediaPlayerIds.value = [...(b.ttsMediaPlayerIds || [])]
    speakCooldownMin.value = b.speakCooldownMin
    tipCooldownHours.value = b.tipCooldownHours
    voiceCommands.value = [...(b.voiceCommands || [])]
    syncDailyFromVoice()
    saveTip.value = ''
  })
}

async function onSave() {
  syncDailyDay()
  syncDailyEvening()
  saveTip.value = ''
  const ok = await save()
  if (ok) {
    snapshotVoiceConfig()
  }
  saveTipOk.value = ok
  saveTip.value = ok ? '' : '保存失败'
  if (ok) chrome.notify('语音配置已保存', 'success')
  if (saveTipTimer) clearTimeout(saveTipTimer)
  saveTipTimer = setTimeout(() => {
    saveTip.value = ''
    saveTipTimer = null
  }, 3000)
}

async function onTestTts() {
  testTtsTip.value = ''
  const mode = voice.value.ttsOutputMode || 'ha'
  const ids = ttsMediaPlayerIds.value.filter((id) => id.trim())
  if (mode === 'ha' && ids.length === 0) {
    testTtsOk.value = false
    testTtsTip.value = '请先选择播报音箱'
    return
  }
  testingTts.value = true
  try {
    const r = await speak(testTtsText.value, ids.length ? { mediaPlayers: ids } : {})
    testTtsOk.value = r.ok
    testTtsTip.value = r.message
  } finally {
    testingTts.value = false
    if (testTtsTipTimer) clearTimeout(testTtsTipTimer)
    testTtsTipTimer = setTimeout(() => {
      testTtsTip.value = ''
      testTtsTipTimer = null
    }, 4000)
  }
}

async function loadMeta() {
  try {
    const { data } = await fetchVoiceMeta()
    voiceMeta.value = data || {}
  } catch (e) {
    logger.debug('加载语音面板元数据失败', e)
  }
}

async function onImportPresets(replace) {
  try {
    const n = await importWholeHomePresets(replace)
    chrome.notify(
      n ? (replace ? `已载入 ${n} 条全屋命令` : `已追加 ${n} 条命令`) : '模板中无命令可导入',
      n ? 'success' : 'info',
    )
  } catch {
    chrome.notify('导入全屋模板失败', 'error')
  }
}

onMounted(async () => {
  const ok = await load()
  if (!ok) chrome.notify('加载语音配置失败', 'error')
  await loadMeta()
  syncDailyFromVoice()
  snapshotVoiceConfig()
})

onBeforeUnmount(() => {
  if (saveTipTimer) clearTimeout(saveTipTimer)
  if (testTtsTipTimer) clearTimeout(testTtsTipTimer)
})
</script>
<style src="./voice/styles/voice-overview.css"></style>
