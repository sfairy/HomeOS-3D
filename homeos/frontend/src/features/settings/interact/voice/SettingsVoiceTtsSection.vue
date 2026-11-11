<!--
  语音输出配置区段。OrchTabs 切换「音箱与冷却」/「每日问候」。

  ── 版式：现代科技面板 ──
  旧版是一列纯表单（label + 控件 + 说明），信息密度低、主次不分。这一版把字段
  收进编号面板，用「状态头 + 双栏面板」替代平铺：

    · 状态头 vox-status：开关 + 运行状态胶囊 + 一句话说明，一眼看出开没开
    · 01 输出路由：三张可选卡片替代 HosSelect，选中的方式才展开对应字段
    · 02 播报节流：数值输入 + 比例条，冷却窗口大小可视化
    · 03 链路试听：声波装饰 + 输入框 + 主按钮
    · 04 合成与音色（子组件）：引擎/音色左列，语速/音调右列

  宽度仍然交给 SettingsCard：不加 max-width、不居中，和页签左边缘对齐。
  所有颜色用令牌或 rgba()，动画时长用 --hos-dur-*，避免硬编码样式棘轮上涨。
-->
<template>
  <div class="settings-hub-section vox-hub">
    <SettingsCard static class="vox-shell">
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
            :label="'开关'"
            :value="voice.ttsEnabled ? '开' : '关'"
            :tone="voice.ttsEnabled ? 'emerald' : 'rose'"
            :val-tone="voice.ttsEnabled ? 'emerald' : 'rose'"
          />
          <SettingsFlowStat label="输出" :value="ttsOutputModeLabel" tone="sky" val-tone="sky" />
          <SettingsFlowStat label="音箱" :value="speakerCountLabel" tone="accent" val-tone="accent" />
        </template>
      </SettingsFlowBand>

      <div class="bind-energy-dock vox-dock">
        <SettingsOrchTabs v-model="voiceOutputTab" :tabs="voiceOutputTabs" plain />
      </div>

      <!-- ══ 音箱与冷却 ══ -->
      <div v-show="voiceOutputTab === 'speaker'" class="vox-body">
        <header class="vox-status" :class="{ 'vox-status--off': !voice.ttsEnabled }">
          <span class="vox-status__orb" aria-hidden="true">
            <Volume2 />
            <span class="vox-status__ring" />
          </span>
          <div class="vox-status__text">
            <span class="vox-status__eyebrow">TEXT · TO · SPEECH</span>
            <span class="vox-status__title">语音播报</span>
            <span class="vox-status__desc">
              关闭后语音命令反馈、屏保提示与部分告警不再播报；配置会保留，试听仍可用
            </span>
          </div>
          <div class="vox-status__side">
            <span
              class="vox-pill"
              :class="voice.ttsEnabled ? 'vox-pill--on' : 'vox-pill--off'"
            >
              <span class="vox-pill__dot" aria-hidden="true" />
              {{ voice.ttsEnabled ? '已启用' : '已关闭' }}
            </span>
            <label class="vox-switch">
              <input
                v-model="voice.ttsEnabled"
                type="checkbox"
                class="vox-switch__input"
                :aria-label="voice.ttsEnabled ? '关闭语音播报（TTS）' : '启用语音播报（TTS）'"
              />
              <span class="vox-switch__track" aria-hidden="true">
                <span class="vox-switch__thumb" />
              </span>
            </label>
          </div>
        </header>

        <div class="vox-columns">
          <!-- 01 输出路由 -->
          <section class="vox-panel vox-panel--route">
            <div class="vox-panel__head">
              <span class="vox-panel__idx">01</span>
              <div class="vox-panel__titles">
                <span class="vox-panel__title">输出路由</span>
                <span class="vox-panel__sub">语音最终从哪台设备发声</span>
              </div>
              <span class="vox-panel__chip">{{ outputModeChip }}</span>
            </div>

            <div class="vox-route" role="radiogroup" aria-label="播报输出方式">
              <button
                v-for="opt in outputModeOptions"
                :key="opt.id"
                type="button"
                role="radio"
                :aria-checked="outputMode === opt.id"
                class="vox-route__opt"
                :class="{ 'is-active': outputMode === opt.id }"
                @click="voice.ttsOutputMode = opt.id"
              >
                <span class="vox-route__icon">
                  <component :is="opt.icon" />
                </span>
                <span class="vox-route__name">{{ opt.label }}</span>
                <span class="vox-route__desc">{{ opt.desc }}</span>
                <span class="vox-route__tag">{{ opt.tag }}</span>
                <Check v-if="outputMode === opt.id" class="vox-route__check" aria-hidden="true" />
              </button>
            </div>

            <div v-if="showSpeakerPicker" class="vox-field">
              <label class="vox-field__label">{{ '播报音箱 · 可多选' }}</label>
              <EntityMultiSelect
                v-model="ttsMediaPlayerIds"
                :allowed-domains="['media_player']"
                :placeholder="'选择 media_player 实体（可多选）'"
              />
              <p class="voice-field-hint" :class="{ 'voice-field-hint--warn': speakerMissing }">
                {{
                  speakerMissing
                    ? '该方式必须至少选择一个音箱，否则自动播报会失败'
                    : `已选 ${ttsMediaPlayerIds.length} 台：${speakerPreviewLabel}`
                }}
              </p>
            </div>

            <div v-if="showDevicePicker" class="vox-field">
              <label class="vox-field__label">{{ '本机扬声器' }}</label>
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
              <p
                class="voice-field-hint"
                :class="{ 'voice-field-hint--warn': !supportsSetSinkId || !secureContext }"
              >
                {{
                  !secureContext
                    ? '需通过 HTTPS 访问才能枚举本机音频设备'
                    : supportsSetSinkId
                      ? '用于服务端合成音频与本机媒体播放；浏览器朗读仍走系统默认输出'
                      : '当前浏览器不支持指定输出设备，本机播报使用系统默认扬声器'
                }}
              </p>
            </div>

            <div class="vox-panel__foot">
              <Speaker aria-hidden="true" />
              <span>{{ routeSummary }}</span>
            </div>
          </section>

          <div class="vox-stack">
            <!-- 02 播报节流 -->
            <section class="vox-panel">
              <div class="vox-panel__head">
                <span class="vox-panel__idx">02</span>
                <div class="vox-panel__titles">
                  <span class="vox-panel__title">播报节流</span>
                  <span class="vox-panel__sub">避免同一件事反复念</span>
                </div>
                <Timer class="vox-panel__glyph" aria-hidden="true" />
              </div>

              <label class="vox-throttle">
                <span class="vox-throttle__row">
                  <span class="vox-throttle__label">{{ '播报冷却' }}</span>
                  <span class="vox-throttle__value">
                    <input
                      v-model.number="speakCooldownMin"
                      type="number"
                      min="0"
                      max="1440"
                      class="vox-throttle__input"
                      aria-label="播报冷却（分钟）"
                    />
                    <em>{{ '分钟' }}</em>
                  </span>
                </span>
                <span class="vox-throttle__meter" aria-hidden="true">
                  <span :style="{ width: speakMeter }" />
                </span>
                <span class="vox-throttle__hint">{{ '自动播报的去重窗口，0 为不限制' }}</span>
              </label>

              <label class="vox-throttle">
                <span class="vox-throttle__row">
                  <span class="vox-throttle__label">{{ '建议提示冷却' }}</span>
                  <span class="vox-throttle__value">
                    <input
                      v-model.number="tipCooldownHours"
                      type="number"
                      min="0"
                      max="72"
                      class="vox-throttle__input"
                      aria-label="建议提示冷却（小时）"
                    />
                    <em>{{ '小时' }}</em>
                  </span>
                </span>
                <span class="vox-throttle__meter" aria-hidden="true">
                  <span :style="{ width: tipMeter }" />
                </span>
                <span class="vox-throttle__hint">{{ '同类顾问提示的推送间隔' }}</span>
              </label>
            </section>

            <!-- 03 链路试听 -->
            <section class="vox-panel">
              <div class="vox-panel__head">
                <span class="vox-panel__idx">03</span>
                <div class="vox-panel__titles">
                  <span class="vox-panel__title">链路试听</span>
                  <span class="vox-panel__sub">与对话同一条合成链路</span>
                </div>
                <span class="vox-panel__chip">{{ ttsVoiceLabel }}</span>
              </div>

              <div class="vox-wave" :class="{ 'is-live': testingTts }" aria-hidden="true">
                <span v-for="(bar, i) in waveBars" :key="i" :style="{ height: `${bar}%` }" />
              </div>

              <div class="vox-test">
                <input
                  v-model="testTtsText"
                  type="text"
                  class="settings-field vox-test__input"
                  :placeholder="'输入试听文字'"
                  aria-label="试听文字"
                  @keyup.enter="onPreview"
                />
                <button
                  type="button"
                  class="vox-test__btn"
                  :disabled="testingTts || !testTtsText.trim()"
                  @click="onPreview"
                >
                  <Loader2 v-if="testingTts" class="vox-test__icon animate-spin" />
                  <Volume2 v-else class="vox-test__icon" />
                  {{ '试听' }}
                </button>
              </div>
              <p
                class="voice-field-hint"
                :class="{
                  'voice-field-hint--ok': testTtsOk,
                  'voice-field-hint--warn': testTtsTip && !testTtsOk,
                }"
                role="status"
              >
                {{
                  testTtsTip ||
                  '先试服务端合成音（与对话同一条链路），失败自动回落上面的输出方式'
                }}
              </p>
            </section>
          </div>
        </div>

        <SettingsVoiceAgentSpeechSection v-model:voice="voice" />
      </div>

      <!-- ══ 每日问候 ══ -->
      <div v-show="voiceOutputTab === 'daily'" class="vox-body">
        <header class="vox-status" :class="{ 'vox-status--off': !voice.dailyAdvisorSpeak }">
          <span class="vox-status__orb" aria-hidden="true">
            <Sparkles />
            <span class="vox-status__ring" />
          </span>
          <div class="vox-status__text">
            <span class="vox-status__eyebrow">DAILY · GREETING</span>
            <span class="vox-status__title">每日顾问语音问候</span>
            <span class="vox-status__desc">{{ greetingStatus }}</span>
          </div>
          <div class="vox-status__side">
            <span
              class="vox-pill"
              :class="voice.dailyAdvisorSpeak ? 'vox-pill--on' : 'vox-pill--off'"
            >
              <span class="vox-pill__dot" aria-hidden="true" />
              {{ voice.dailyAdvisorSpeak ? '已启用' : '未启用' }}
            </span>
            <label class="vox-switch">
              <input
                v-model="voice.dailyAdvisorSpeak"
                type="checkbox"
                class="vox-switch__input"
                :aria-label="
                  voice.dailyAdvisorSpeak ? '关闭每日顾问语音问候' : '启用每日顾问语音问候'
                "
              />
              <span class="vox-switch__track" aria-hidden="true">
                <span class="vox-switch__thumb" />
              </span>
            </label>
          </div>
        </header>

        <template v-if="voice.dailyAdvisorSpeak">
          <section class="vox-panel">
            <div class="vox-panel__head">
              <span class="vox-panel__idx">01</span>
              <div class="vox-panel__titles">
                <span class="vox-panel__title">问候时刻</span>
                <span class="vox-panel__sub">到达起始时刻后，当天首次打开主界面时问候</span>
              </div>
              <span class="vox-panel__chip">{{ speakingHourLabel }}</span>
            </div>

            <div class="vox-field">
              <label class="vox-field__label">{{ '起始时刻' }}</label>
              <HosSelect variant="settings" block v-model="speakingHour">
                <option v-for="h in hourOptions" :key="h" :value="h">
                  {{ `${String(h).padStart(2, '0')}:00` }}
                </option>
              </HosSelect>
              <p class="voice-field-hint">
                {{
                  currentPeriod === 'evening'
                    ? '当前时段使用「晚间问候」（20 点及以后）'
                    : '当前时段使用「白天问候」（20 点前）'
                }}
              </p>
            </div>
          </section>

          <section class="vox-panel">
            <div class="vox-panel__head">
              <span class="vox-panel__idx">02</span>
              <div class="vox-panel__titles">
                <span class="vox-panel__title">问候文案</span>
                <span class="vox-panel__sub">分时段模板，可用变量占位</span>
              </div>
            </div>

            <div class="vox-field">
              <label class="vox-field__label">{{ '白天问候（20 点前）' }}</label>
              <VoiceSpeechComposer
                :presets="dailyAdvisorDayPresets"
                :active-preset="dailyDayPreset"
                :custom-text="dailyDayCustom"
                :preview-template="dailyDayTemplate"
                :default-preview="previewDailyAdvisor('day', '')"
                :custom-label="'白天问候文案'"
                :custom-placeholder="'例如：欢迎回家，祝您有美好的一天'"
                @update:active-preset="$emit('daily-day-preset', $event)"
                @update:custom-text="$emit('daily-day-custom', $event)"
              />
            </div>

            <div class="vox-field">
              <label class="vox-field__label">{{ '晚间问候（20 点及以后）' }}</label>
              <VoiceSpeechComposer
                :presets="dailyAdvisorEveningPresets"
                :active-preset="dailyEveningPreset"
                :custom-text="dailyEveningCustom"
                :preview-template="dailyEveningTemplate"
                :preview-vars="{ hour: new Date().getHours() }"
                :default-preview="previewDailyAdvisor('evening', '')"
                :custom-label="'晚间问候文案'"
                :custom-placeholder="'例如：晚上好，请检查门窗是否关好'"
                @update:active-preset="$emit('daily-evening-preset', $event)"
                @update:custom-text="$emit('daily-evening-custom', $event)"
              />
            </div>

            <button
              type="button"
              class="settings-btn-ghost voice-daily-test"
              :disabled="testingAdvisor"
              @click="$emit('test-daily-advisor')"
            >
              <Loader2 v-if="testingAdvisor" class="w-3.5 h-3.5 animate-spin" />
              <Volume2 v-else class="w-3.5 h-3.5" />
              {{ '试听当前问候' }}
            </button>
          </section>
        </template>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Volume2, Loader2, Speaker, Timer, Monitor, Sparkles, Check } from '@lucide/vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsOrchTabs from '@/components/common/SettingsOrchTabs.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import EntityMultiSelect from '@/components/common/entity-multi-select/EntityMultiSelect.vue'
import VoiceSpeechComposer from '@/features/settings/interact/voice/SpeechComposer.vue'
import SettingsVoiceAgentSpeechSection from '@/features/settings/interact/voice/SettingsVoiceAgentSpeechSection.vue'
import { previewDailyAdvisor } from '@/shared/voice/utils/speech.util'
import { greetedToday } from '@/composables/voice/useDailyAdvisorGreeting'
import { useAudioDevices } from '@/composables/voice/useAudioDevices'

const props = defineProps({
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

const emit = defineEmits([
  'test-tts',
  'test-daily-advisor',
  'daily-day-preset',
  'daily-day-custom',
  'daily-evening-preset',
  'daily-evening-custom',
])

const { outputOptions, outputDeviceId, setOutputDeviceId, supportsSetSinkId, secureContext } = useAudioDevices()

const ttsOutputModeLabel = computed(() => {
  const m = voice.value.ttsOutputMode
  if (m === 'local') return '本机'
  if (m === 'auto') return '自动'
  return 'HA'
})

const outputModeDescription = computed(() => {
  const m = voice.value.ttsOutputMode
  if (m === 'local') return '使用本机浏览器朗读，经系统默认扬声器播放（需 HTTPS）'
  if (m === 'auto') return '优先本机播报，失败时回退到下方 HA 音箱'
  return '经 Home Assistant media_player 播报'
})

/** 配置里可能缺省：统一落回 HA（与后端默认一致） */
const outputMode = computed(() => {
  const m = voice.value.ttsOutputMode
  return m === 'local' || m === 'auto' ? m : 'ha'
})

const showSpeakerPicker = computed(() => outputMode.value !== 'local')
const showDevicePicker = computed(() => outputMode.value !== 'ha')

const outputModeOptions = [
  { id: 'ha', label: 'HA 音箱', desc: '经 media_player 播报', tag: '多房间', icon: Speaker },
  { id: 'local', label: '本机浏览器', desc: '系统默认扬声器', tag: '低延迟', icon: Monitor },
  { id: 'auto', label: '自动回退', desc: '本机优先，失败走 HA', tag: '推荐', icon: Sparkles },
]

const outputModeChip = computed(() => {
  const found = outputModeOptions.find((o) => o.id === outputMode.value)
  return found ? `${found.label} · ${found.tag}` : '未选择'
})

/** HA 方式下未选任何音箱：必须明确警告，否则用户只会遇到「没声音」 */
const speakerMissing = computed(
  () => showSpeakerPicker.value && ttsMediaPlayerIds.value.filter((id) => String(id || '').trim()).length === 0,
)

const speakerCountLabel = computed(() => {
  if (outputMode.value === 'local') return '本机'
  const n = ttsMediaPlayerIds.value.filter((id) => String(id || '').trim()).length
  return n ? `${n} 台` : '未配置'
})

const speakerPreviewLabel = computed(() =>
  ttsMediaPlayerIds.value
    .filter((id) => String(id || '').trim())
    .slice(0, 2)
    .map((id) => String(id).replace(/^media_player\./, ''))
    .join('、'),
)

const routeSummary = computed(() => {
  const base = `${outputModeDescription.value}`
  const n = ttsMediaPlayerIds.value.filter((id) => String(id || '').trim()).length
  if (outputMode.value === 'local') return base
  return n ? `${base} · 已选 ${n} 台音箱` : `${base} · 尚未选择音箱`
})

/** 节流比例条：以「1 小时冷却 / 24 小时间隔」为满格参考 */
function meterOf(value, full) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '0%'
  return `${Math.min(100, (n / full) * 100)}%`
}

const speakMeter = computed(() => meterOf(speakCooldownMin.value, 60))
const tipMeter = computed(() => meterOf(tipCooldownHours.value, 24))

const ttsVoiceLabel = computed(() => {
  const raw = String(voice.value.ttsVoice || '').trim()
  if (!raw) return '默认'
  return voice.value.ttsEngine === 'openai' ? raw : raw.replace(/^zh-CN-/, '').replace(/Neural$/, '')
})

const ttsFlowSummary = computed(() => {
  const on = voice.value.ttsEnabled ? '已启用' : '已关闭'
  return `${on} · ${ttsOutputModeLabel.value} · ${speakerCountLabel.value} · 冷却 ${speakCooldownMin.value}m`
})

const ttsFlowSteps = computed(() => [
  {
    label: '启用 TTS',
    meta: voice.value.ttsEnabled ? '已开启' : '已关闭',
    icon: Volume2,
    tone: 'in',
  },
  { label: '输出方式', meta: ttsOutputModeLabel.value, icon: Speaker, tone: 'sky' },
  {
    label: '播报音箱',
    meta: outputMode.value === 'local' ? '本机扬声器' : speakerCountLabel.value,
    icon: Speaker,
    tone: 'mid',
  },
  {
    label: '冷却策略',
    meta: speakCooldownMin.value > 0 ? `${speakCooldownMin.value} 分钟` : '不限制',
    icon: Timer,
    tone: 'out',
  },
  { label: '合成音色', meta: ttsVoiceLabel.value, icon: Volume2, tone: 'out' },
])

/** 试听面板的装饰声波：固定一组高度，播放时整组做呼吸动画 */
const waveBars = [
  34, 58, 28, 72, 42, 86, 32, 54, 92, 40, 66, 30, 60, 82, 36, 74, 48, 90, 34, 62, 44, 78, 38, 68, 30, 56, 88, 42, 70,
  36, 64, 80,
]

/** 0–23 的整点选项（起始时刻用下拉，避免裸数字输入框输错） */
const hourOptions = Array.from({ length: 24 }, (_, i) => i)

const speakingHour = computed({
  get: () => {
    const raw = Number(voice.value.dailyAdvisorSpeakHour ?? 20)
    return Number.isFinite(raw) ? Math.min(23, Math.max(0, Math.round(raw))) : 20
  },
  set: (value) => {
    const n = Number(value)
    voice.value.dailyAdvisorSpeakHour = Number.isFinite(n) ? Math.min(23, Math.max(0, Math.round(n))) : 20
  },
})

const speakingHourLabel = computed(() => `${String(speakingHour.value).padStart(2, '0')}:00`)

const currentPeriod = computed(() => (new Date().getHours() >= 20 ? 'evening' : 'day'))

/** 今日问候状态：说清楚「已问候」还是「等哪个时刻」 */
const greetingStatus = computed(() => {
  if (!voice.value.dailyAdvisorSpeak) return '未启用；开启后当天首次打开主界面时问候'
  if (greetedToday()) return '今日已问候'
  const hour = speakingHour.value
  if (new Date().getHours() < hour) return `${String(hour).padStart(2, '0')}:00 后首次打开时问候`
  return '下次打开主界面即问候'
})

function onPreview() {
  if (props.testingTts) return
  emit('test-tts')
}
</script>

<style src="./styles/voice-form.css"></style>
<style scoped src="./styles/settings-voice-tts-section.css"></style>
