<!--
组件：SettingsVoiceTtsSection.vue
所属模块：frontend / src / views / settings / interact / voice
职责：语音输出配置区段。通过 OrchTabs 切换播报音箱（TTS 总开关/输出方式/多音箱/冷却）、
      每日问候（日间/夜间话术预设与自定义模板）。支持 TTS 试听与每日顾问试听。
defineModel：
  - voice：语音配置对象
  - voiceOutputTab：当前输出子页签
  - ttsMediaPlayerIds：播报音箱实体列表
  - speakCooldownMin / tipCooldownHours：播报/提示冷却
  - testTtsText：TTS 试听文本
Props：
  - voiceOutputTabs：子页签配置
  - dailyAdvisorDayPresets / dailyAdvisorEveningPresets：日间/夜间问候预设
  - dailyDayPreset / dailyDayCustom / dailyDayTemplate：日间问候预设/自定义/模板
  - dailyEveningPreset / dailyEveningCustom / dailyEveningTemplate：夜间问候预设/自定义/模板
  - testingTts / testTtsOk / testTtsTip：TTS 试听状态
  - testingAdvisor：每日顾问试听状态
Emits：
  - test-tts / test-daily-advisor：试听
  - daily-day-preset / daily-day-custom / daily-evening-preset / daily-evening-custom：问候配置变更
关键依赖：
  - SettingsCard / SettingsOrchTabs / SettingsFlowBand / SettingsFlowStat / SettingsFeatureMaster / SettingsSectionHead：卡片与流程
  - HosSelect / EntityMultiSelect：输出方式与音箱多选
  - VoiceSpeechComposer：每日问候话术编辑
  - useAudioDevices：本机音频设备枚举
  - previewDailyAdvisor：每日顾问模板预览
数据来源：父级 SettingsVoicePanel 透传的 defineModel 与 props
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard static>
      <SettingsFlowBand
        :steps="ttsFlowSteps"
        class="voice-tts-flow-band"
        band-class="voice-tts-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="ttsFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'音箱'"
            :value="ttsMediaPlayerIds.length"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'冷却'"
            :value="`${speakCooldownMin}m`"
            tone="sky"
            val-tone="sky"
          />
        </template>
      </SettingsFlowBand>
      <div class="bind-energy-dock mt-2.5">
        <SettingsOrchTabs v-model="voiceOutputTab" :tabs="voiceOutputTabs" plain />
      </div>
      <div v-show="voiceOutputTab === 'speaker'" class="mt-2.5 space-y-4">
        <SettingsFeatureMaster
          :icon="Volume2"
          tone="accent"
          :active="voice.ttsEnabled"
          :title="'启用语音播报（TTS）'"
          :hint="'关闭后语音命令反馈、屏保提示与部分告警不再播报（告警规则内 TTS 仍受各自开关控制）'"
        >
          <template #actions>
            <label class="alert-switch arv-master-switch voice-tts-master-switch">
              <input v-model="voice.ttsEnabled" type="checkbox" class="settings-checkbox" />
              <span>{{ voice.ttsEnabled ? '已启用' : '已关闭' }}</span>
            </label>
          </template>
        </SettingsFeatureMaster>
        <div>
          <label class="settings-form-label mb-1.5">{{ '播报输出' }}</label>
          <HosSelect variant="settings" block v-model="voice.ttsOutputMode">
            <option value="ha">{{ 'HA 音箱' }}</option>
            <option value="local">{{ '本机浏览器' }}</option>
            <option value="auto">{{ '自动（本机 → HA）' }}</option>
          </HosSelect>
          <p class="voice-field-hint mt-1.5">
            {{
              voice.ttsOutputMode === 'local'
                ? '使用本机 SpeechSynthesis，经系统默认扬声器播放（需 HTTPS）'
                : voice.ttsOutputMode === 'auto'
                  ? '优先本机播报，失败时回退到下方 HA 音箱'
                  : '经 Home Assistant media_player 播报'
            }}
          </p>
        </div>
        <div v-if="voice.ttsOutputMode === 'local' || voice.ttsOutputMode === 'auto'">
          <label class="settings-form-label mb-1.5">{{ '本机扬声器' }}</label>
          <HosSelect
            variant="settings"
            block
            :model-value="outputDeviceId"
            @update:model-value="setOutputDeviceId"
          >
            <option value="">{{ '系统默认' }}</option>
            <option v-for="opt in outputOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </HosSelect>
          <p class="voice-field-hint mt-1.5">
            {{
              supportsSetSinkId
                ? 'SpeechSynthesis 仍走系统默认输出；所选设备用于支持 setSinkId 的媒体元素'
                : '当前浏览器不支持指定输出设备，本机 TTS 使用系统默认扬声器'
            }}
          </p>
          <p v-if="!secureContext" class="voice-field-hint voice-field-hint--warn mt-1">
            {{ '需通过 HTTPS 访问才能枚举本机音频设备' }}
          </p>
        </div>
        <div v-if="voice.ttsOutputMode === 'ha' || voice.ttsOutputMode === 'auto'">
          <label class="settings-form-label mb-1.5">{{ '播报音箱（支持多选）' }}</label>
          <EntityMultiSelect
            v-model="ttsMediaPlayerIds"
            :allowed-domains="['media_player']"
            :placeholder="'选择 media_player 实体（可多选）'"
          />
        </div>
        <div class="settings-form-grid">
          <div>
            <label class="settings-form-label mb-1.5">{{ '播报冷却（分钟）' }}</label>
            <input
              v-model.number="speakCooldownMin"
              type="number"
              min="1"
              max="120"
              class="settings-field"
            />
          </div>
          <div>
            <label class="settings-form-label mb-1.5">{{ '建议提示冷却（小时）' }}</label>
            <input
              v-model.number="tipCooldownHours"
              type="number"
              min="1"
              max="72"
              class="settings-field"
            />
          </div>
        </div>
        <div class="voice-test-bar">
          <input
            v-model="testTtsText"
            type="text"
            class="settings-field flex-1"
            :placeholder="'输入测试文字'"
          />
          <button
            type="button"
            class="settings-btn-accent"
            :disabled="testingTts || !testTtsText.trim()"
            @click="$emit('test-tts')"
          >
            <Loader2 v-if="testingTts" class="w-3.5 h-3.5 animate-spin" />
            <Volume2 v-else class="w-3.5 h-3.5" />
            {{ '试听' }}
          </button>
        </div>
        <p
          v-if="testTtsTip"
          :class="['text-[12px]', testTtsOk ? 'voice-test-tip--ok' : 'voice-test-tip--err']"
        >
          {{ testTtsTip }}
        </p>
      </div>

      <div v-show="voiceOutputTab === 'daily'" class="mt-2.5">
        <SettingsSectionHead
          :title="'每日顾问问候'"
          :eyebrow="'问候'"
          :description="'当日首次进入主界面时，通过音箱播报一句智能问候'"
          bordered
        />
        <div class="mt-4 space-y-4">
          <label
            class="voice-toggle-card"
            :class="{ 'voice-toggle-card--on': voice.dailyAdvisorSpeak }"
          >
            <input v-model="voice.dailyAdvisorSpeak" type="checkbox" class="settings-checkbox" />
            <div>
              <span class="voice-toggle-card__title">{{ '启用每日顾问语音问候' }}</span>
              <span class="voice-toggle-card__desc">{{
                '到达起始时刻后，当天首次打开主界面触发'
              }}</span>
            </div>
          </label>
          <template v-if="voice.dailyAdvisorSpeak">
            <div class="max-w-[10rem]">
              <label class="settings-form-label mb-1.5">{{ '起始时刻（0–23 时）' }}</label>
              <input
                v-model.number="voice.dailyAdvisorSpeakHour"
                type="number"
                min="0"
                max="23"
                class="settings-field"
              />
            </div>
            <div class="voice-daily-block">
              <h4 class="voice-daily-block__title">{{ '白天问候（20 点前）' }}</h4>
              <VoiceSpeechComposer
                :presets="dailyAdvisorDayPresets"
                :active-preset="dailyDayPreset"
                :custom-text="dailyDayCustom"
                :preview-template="dailyDayTemplate"
                :default-preview="previewDailyAdvisor('day', '')"
                :custom-label="'白天问候文案'"
                :custom-placeholder="'例如：欢迎回家，祝您有美好的一天'"
                compact
                @update:active-preset="$emit('daily-day-preset', $event)"
                @update:custom-text="$emit('daily-day-custom', $event)"
              />
            </div>
            <div class="voice-daily-block">
              <h4 class="voice-daily-block__title">{{ '晚间问候（20 点及以后）' }}</h4>
              <VoiceSpeechComposer
                :presets="dailyAdvisorEveningPresets"
                :active-preset="dailyEveningPreset"
                :custom-text="dailyEveningCustom"
                :preview-template="dailyEveningTemplate"
                :preview-vars="{ hour: new Date().getHours() }"
                :default-preview="previewDailyAdvisor('evening', '')"
                :custom-label="'晚间问候文案'"
                :custom-placeholder="'例如：晚上好，请检查门窗是否关好'"
                compact
                @update:active-preset="$emit('daily-evening-preset', $event)"
                @update:custom-text="$emit('daily-evening-custom', $event)"
              />
            </div>
            <button
              type="button"
              class="settings-btn-ghost text-xs"
              :disabled="testingAdvisor"
              @click="$emit('test-daily-advisor')"
            >
              <Loader2 v-if="testingAdvisor" class="w-3.5 h-3.5 animate-spin" />
              <Volume2 v-else class="w-3.5 h-3.5" />
              {{ '试听当前问候' }}
            </button>
          </template>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Volume2, Loader2, Speaker, Timer, MessageSquare } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import SettingsOrchTabs from '@/features/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import SettingsFeatureMaster from '@/features/settings/shared/layout/SettingsFeatureMaster.vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import VoiceSpeechComposer from '@/features/settings/interact/voice/SpeechComposer.vue'
import { previewDailyAdvisor } from '@/utils/voice/speech.util'
import { useAudioDevices } from '@/composables/voice/useAudioDevices'

defineProps({
  voiceOutputTabs: { type: Array, default: () => [] },
  dailyAdvisorDayPresets: { type: Array, default: () => [] },
  dailyAdvisorEveningPresets: { type: Array, default: () => [] },
  dailyDayPreset: { type: String, default: 'default' },
  dailyDayCustom: { type: String, default: '' },
  dailyDayTemplate: { type: String, default: '' },
  dailyEveningPreset: { type: String, default: 'default' },
  dailyEveningCustom: { type: String, default: '' },
  dailyEveningTemplate: { type: String, default: '' },
  testingTts: Boolean,
  testTtsOk: Boolean,
  testTtsTip: { type: String, default: '' },
  testingAdvisor: Boolean,
})

const voice = defineModel('voice', { type: Object, required: true })
const voiceOutputTab = defineModel('voiceOutputTab', { type: String, default: 'speaker' })
const ttsMediaPlayerIds = defineModel('ttsMediaPlayerIds', { type: Array, default: () => [] })
const speakCooldownMin = defineModel('speakCooldownMin', { type: Number, default: 10 })
const tipCooldownHours = defineModel('tipCooldownHours', { type: Number, default: 2 })
const testTtsText = defineModel('testTtsText', { type: String, default: '' })

defineEmits([
  'test-tts',
  'test-daily-advisor',
  'daily-day-preset',
  'daily-day-custom',
  'daily-evening-preset',
  'daily-evening-custom',
])

const {
  outputOptions,
  outputDeviceId,
  setOutputDeviceId,
  supportsSetSinkId,
  secureContext,
} = useAudioDevices()

const ttsOutputModeLabel = computed(() => {
  const m = voice.value.ttsOutputMode
  if (m === 'local') return '本机'
  if (m === 'auto') return '自动'
  return 'HA'
})

const ttsFlowSummary = computed(() => {
  const on = voice.value.ttsEnabled ? '已启用' : '已关闭'
  return `${on} · ${ttsMediaPlayerIds.value.length} 音箱 · 冷却 ${speakCooldownMin.value}m`
})

const ttsFlowSteps = computed(() => [
  {
    label: '启用 TTS',
    meta: voice.value.ttsEnabled ? '已开启' : '已关闭',
    icon: Volume2,
    tone: 'in',
  },
  {
    label: '输出方式',
    meta: ttsOutputModeLabel.value,
    icon: Speaker,
    tone: 'sky',
  },
  {
    label: '播报音箱',
    meta:
      voice.value.ttsOutputMode === 'local'
        ? '本机扬声器'
        : `${ttsMediaPlayerIds.value.length} 台`,
    icon: Volume2,
    tone: 'mid',
  },
  {
    label: '冷却策略',
    meta: `${speakCooldownMin.value} 分钟`,
    icon: Timer,
    tone: 'out',
  },
  {
    label: '试听/问候',
    meta: '顾问模板',
    icon: MessageSquare,
    tone: 'out',
  },
])
</script>

<style scoped src="./styles/SettingsVoiceTtsSection.css"></style>
