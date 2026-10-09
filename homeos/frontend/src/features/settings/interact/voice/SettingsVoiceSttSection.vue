<!--
组件：SettingsVoiceSttSection.vue
所属模块：frontend / src / views / settings / interact / voice
职责：语音输入配置区段。通过 OrchTabs 切换交互模式（长按/唤醒词）、唤醒词配置、识别引擎与对话调试。
      支持麦克风权限申请、输入设备选择、STT 状态查询与对话处理测试。
defineModel：
  - voice：语音配置对象
  - voiceInputTab：当前输入子页签
  - wakeWordsText：唤醒词文本
Props：
  - voiceInputTabs：子页签配置
关键依赖：
  - SettingsCard / SettingsOrchTabs / SettingsFlowBand / SettingsFlowStat：卡片与流程
  - HosSelect / EntityInput：引擎与实体选择
  - fetchVoiceSttStatus / processVoiceConversation：STT 状态与对话 API
  - useAudioDevices：音频设备枚举与麦克风权限
  - useChromeStore：notify
数据来源：父级 SettingsVoicePanel 透传的 defineModel 与 props
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard static>
      <SettingsFlowBand
        :steps="sttFlowSteps"
        class="voice-stt-flow-band"
        band-class="voice-stt-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="sttFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'交互'"
            :value="voice.interactionMode === 'wake' ? '唤醒词' : '长按'"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'引擎'"
            :value="sttModeLabel"
            tone="sky"
            val-tone="sky"
          />
        </template>
      </SettingsFlowBand>
      <div class="bind-energy-dock mt-2.5">
        <SettingsOrchTabs v-model="voiceInputTab" :tabs="voiceInputTabs" plain />
      </div>
      <div v-show="voiceInputTab === 'mode'" class="mt-2.5 voice-mode-cards">
        <button
          type="button"
          class="voice-mode-card"
          :class="{ 'voice-mode-card--active': voice.interactionMode === 'push' }"
          @click="voice.interactionMode = 'push'"
        >
          <Mic class="w-5 h-5" />
          <span class="voice-mode-card__title">{{ '长按说话' }}</span>
          <span class="voice-mode-card__desc">{{ '按住按钮说话，松手识别' }}</span>
        </button>
        <button
          type="button"
          class="voice-mode-card"
          :class="{ 'voice-mode-card--active': voice.interactionMode === 'wake' }"
          @click="voice.interactionMode = 'wake'"
        >
          <Radio class="w-5 h-5" />
          <span class="voice-mode-card__title">{{ '唤醒词待命' }}</span>
          <span class="voice-mode-card__desc">{{ '连续聆听，说出唤醒词后下指令' }}</span>
        </button>
      </div>

      <div v-show="voiceInputTab === 'wake'" class="mt-2.5 space-y-3">
        <label
          class="voice-toggle-card"
          :class="{ 'voice-toggle-card--on': voice.wakeWordEnabled }"
        >
          <input v-model="voice.wakeWordEnabled" type="checkbox" class="settings-checkbox" />
          <div>
            <span class="voice-toggle-card__title">{{ '启用唤醒词连续聆听' }}</span>
            <span class="voice-toggle-card__desc">{{ '仅浏览器 STT 模式支持' }}</span>
          </div>
        </label>
        <label
          class="voice-toggle-card"
          :class="{ 'voice-toggle-card--on': voice.continuousConversation }"
        >
          <input
            v-model="voice.continuousConversation"
            type="checkbox"
            class="settings-checkbox"
          />
          <div>
            <span class="voice-toggle-card__title">{{ '连续对话（免重复唤醒）' }}</span>
            <span class="voice-toggle-card__desc">{{
              '唤醒后一段时间内无需再次唤醒，后续指令由管家基于上文补全（如「开灯」后「再调暗一点」）'
            }}</span>
          </div>
        </label>
        <div>
          <label class="settings-form-label mb-1.5">{{ '唤醒词（逗号分隔多个）' }}</label>
          <input
            v-model="wakeWordsText"
            type="text"
            class="settings-field"
            :placeholder="'小智，你好家居'"
          />
          <div v-if="voice.wakeWords.length" class="voice-wake-chips mt-2">
            <span v-for="w in voice.wakeWords" :key="w" class="voice-wake-chip">{{ w }}</span>
          </div>
        </div>
      </div>

      <div v-show="voiceInputTab === 'stt'" class="mt-2.5 space-y-4">
        <div>
          <label class="settings-form-label mb-1.5">{{ '识别引擎' }}</label>
          <HosSelect variant="settings" block v-model="voice.sttMode">
            <option value="auto">{{ '自动（HA STT → 浏览器）' }}</option>
            <option value="browser">{{ '浏览器 Web Speech（免 HA STT）' }}</option>
            <option value="ha">{{ 'Home Assistant STT（不回退）' }}</option>
          </HosSelect>
        </div>
        <div class="space-y-2">
          <label class="settings-form-label mb-1.5">{{ '本机麦克风' }}</label>
          <div class="voice-mic-row">
            <HosSelect
              variant="settings"
              block
              class="flex-1"
              :model-value="inputDeviceId"
              @update:model-value="setInputDeviceId"
            >
              <option value="">{{ '系统默认' }}</option>
              <option v-for="opt in inputOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </HosSelect>
            <button
              type="button"
              class="settings-btn-ghost shrink-0"
              :disabled="micBusy"
              @click="onRequestMic"
            >
              {{ micBusy ? '请求中…' : '请求麦克风权限' }}
            </button>
          </div>
          <p class="voice-field-hint">
            {{
              'HA STT 录音将使用所选麦克风；浏览器 Web Speech 识别使用系统默认麦克风'
            }}
          </p>
          <p v-if="permission === 'denied' || errorTip" class="voice-field-hint voice-field-hint--warn">
            {{ errorTip || '麦克风权限被拒绝' }}
          </p>
          <p v-else-if="!secureContext" class="voice-field-hint voice-field-hint--warn">
            {{ '需通过 HTTPS 访问才能使用本机麦克风' }}
          </p>
          <p v-else-if="permission === 'granted'" class="voice-field-hint voice-field-hint--ok">
            {{ `权限已授予 · 当前：${selectedInputLabel}` }}
          </p>
        </div>
        <div class="settings-form-grid">
          <div>
            <label class="settings-form-label mb-1.5">{{ '识别语言' }}</label>
            <input
              v-model="voice.language"
              type="text"
              class="settings-field"
              :placeholder="'zh-CN'"
            />
          </div>
          <div>
            <label class="settings-form-label mb-1.5">{{ 'HA STT 实体' }}</label>
            <EntityInput
              v-model="voice.sttEntityId"
              :placeholder="'留空自动探测'"
              domain-filter="stt"
            />
          </div>
        </div>
        <label
          class="voice-toggle-card"
          :class="{ 'voice-toggle-card--on': voice.useHaConversation }"
        >
          <input v-model="voice.useHaConversation" type="checkbox" class="settings-checkbox" />
          <div>
            <span class="voice-toggle-card__title">{{ '优先 HA Assistant 理解意图' }}</span>
            <span class="voice-toggle-card__desc">{{
              '识别后交给 conversation.process 解析'
            }}</span>
          </div>
        </label>

        <label
          class="voice-toggle-card"
          :class="{ 'voice-toggle-card--on': voice.agentFallback }"
        >
          <input v-model="voice.agentFallback" type="checkbox" class="settings-checkbox" />
          <div>
            <span class="voice-toggle-card__title">{{ '未命中时回落智能管家' }}</span>
            <span class="voice-toggle-card__desc">{{
              '短语命令未匹配且无 HA Assistant 时，交由智能管家（LLM）理解并执行，需已配置 LLM 密钥'
            }}</span>
          </div>
        </label>

        <div class="voice-stt-status">
          <div class="voice-stt-status__head">
            <span class="settings-form-label">{{ 'STT 健康' }}</span>
            <button
              type="button"
              class="settings-btn-ghost"
              :disabled="sttStatusLoading"
              @click="refreshSttStatus"
            >
              {{ sttStatusLoading ? '刷新中…' : '刷新状态' }}
            </button>
          </div>
          <p class="voice-stt-status__line">{{ sttStatusSummary }}</p>
          <p v-if="sttDetectedHint" class="voice-stt-status__hint">{{ sttDetectedHint }}</p>
        </div>

        <div class="voice-conv-test">
          <label class="settings-form-label mb-1.5">{{ 'Assistant 对话测试' }}</label>
          <div class="voice-conv-test__row">
            <input
              v-model="convTestText"
              type="text"
              class="settings-field flex-1"
              :placeholder="'例如：打开客厅灯'"
              @keyup.enter="runConversationTest"
            />
            <button
              type="button"
              class="settings-btn-accent shrink-0"
              :disabled="convTestBusy || !convTestText.trim()"
              @click="runConversationTest"
            >
              {{ convTestBusy ? '请求中…' : '测试对话' }}
            </button>
          </div>
          <pre v-if="convTestResult" class="voice-conv-test__result">{{ convTestResult }}</pre>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import HosSelect from '@/components/common/base/HosSelect.vue'

import { Mic, Radio, Ear, Cpu, PanelLeft } from '@lucide/vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsOrchTabs from '@/features/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import EntityInput from '@/components/common/EntityInput.vue'
import { fetchVoiceSttStatus, processVoiceConversation } from '@/services/api/system'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { useChromeStore } from '@/stores/chrome.store'
import { useAudioDevices } from '@/composables/voice/useAudioDevices'

defineProps({
  voiceInputTabs: { type: Array, default: () => [] },
})

const voice = defineModel('voice', { type: Object, required: true })
const voiceInputTab = defineModel('voiceInputTab', { type: String, default: 'mode' })
const wakeWordsText = defineModel('wakeWordsText', { type: String, default: '' })

const chrome = useChromeStore()
const sttStatusLoading = ref(false)
const sttStatus = ref(null)
const convTestText = ref('')
const convTestBusy = ref(false)
const convTestResult = ref('')
const micBusy = ref(false)

const {
  inputOptions,
  inputDeviceId,
  setInputDeviceId,
  selectedInputLabel,
  permission,
  errorTip,
  secureContext,
  ensureMicPermission,
} = useAudioDevices()

async function onRequestMic() {
  micBusy.value = true
  try {
    const ok = await ensureMicPermission()
    chrome.notify(ok ? '麦克风权限已授予' : errorTip.value || '无法访问麦克风', ok ? 'success' : 'error')
  } finally {
    micBusy.value = false
  }
}

const sttModeLabel = computed(() => {
  const map = { auto: '自动', browser: '浏览器', ha: 'HA STT' }
  return map[voice.value.sttMode] || voice.value.sttMode || '自动'
})

const sttFlowSummary = computed(() => {
  const mode = voice.value.interactionMode === 'wake' ? '唤醒词' : '长按'
  return `${mode} · ${sttModeLabel.value}`
})

const sttStatusSummary = computed(() => {
  const st = sttStatus.value
  if (!st) return '尚未加载 STT 状态'
  const ready = st.available ?? st.ready ?? st.ok
  const engine = st.engine || st.provider || st.mode || '未知'
  const providers = Array.isArray(st.providers) ? st.providers.length : 0
  if (ready === false) {
    return `不可用 · ${engine}${st.error ? ` · ${st.error}` : ''}`
  }
  return `可用 · ${engine}${providers ? ` · ${providers} 个 provider` : ''}`
})

const sttDetectedHint = computed(() => {
  const id = sttStatus.value?.detectedEntityId
  return id ? `自动探测 STT 实体：${id}` : ''
})

async function refreshSttStatus() {
  sttStatusLoading.value = true
  try {
    const { data } = await fetchVoiceSttStatus()
    sttStatus.value = data || null
    if (!voice.value.sttEntityId && data?.detectedEntityId) {
      // 仅提示，不强制覆盖用户配置
    }
  } catch (e) {
    sttStatus.value = { available: false, error: getApiErrorMessage(e, 'STT 状态获取失败') }
  } finally {
    sttStatusLoading.value = false
  }
}

async function runConversationTest() {
  const text = convTestText.value.trim()
  if (!text || convTestBusy.value) return
  convTestBusy.value = true
  convTestResult.value = ''
  try {
    const { data } = await processVoiceConversation(text)
    convTestResult.value = JSON.stringify(data ?? {}, null, 2)
    chrome.notify('对话测试完成', 'success')
  } catch (e) {
    convTestResult.value = getApiErrorMessage(e, '对话测试失败')
    chrome.notify(convTestResult.value, 'error')
  } finally {
    convTestBusy.value = false
  }
}

watch(voiceInputTab, (tab) => {
  if (tab === 'stt' && !sttStatus.value) void refreshSttStatus()
})

onMounted(() => {
  if (voiceInputTab.value === 'stt') void refreshSttStatus()
})

const sttFlowSteps = computed(() => [
  {
    label: '交互模式',
    meta: voice.value.interactionMode === 'wake' ? '唤醒词待命' : '长按说话',
    icon: Mic,
    tone: 'in',
  },
  {
    label: '唤醒词',
    meta: voice.value.wakeWordEnabled
      ? `${voice.value.wakeWords?.length || 0} 词`
      : '未启用',
    icon: Ear,
    tone: 'sky',
  },
  {
    label: '识别引擎',
    meta: sttModeLabel.value,
    icon: Cpu,
    tone: 'mid',
  },
  {
    label: '侧栏组件',
    meta: '语音命令',
    icon: PanelLeft,
    tone: 'out',
  },
])
</script>

<style scoped src="./styles/SettingsVoiceSttSection.css"></style>
