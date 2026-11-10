<!--
  管家语音播报（服务端 TTS）：决定「后端合成什么声音」。

  版式跟父级「播报输出」一致：编号面板 + 双栏。
    左列 = 合成引擎 / 音色（整行 HosSelect）
    右列 = 语速 / 音调（渐变滑杆 + 等宽数值读数）
  OpenAI 兼容参数收进虚线嵌套小面板，不启用该引擎时不占版面。
  试听只在父级一处，避免两个「试听」分不清测哪半条链。
-->
<template>
  <section class="vox-panel vox-panel--synth">
    <div class="vox-panel__head">
      <span class="vox-panel__idx">04</span>
      <div class="vox-panel__titles">
        <span class="vox-panel__title">合成与音色</span>
        <span class="vox-panel__sub">决定服务端合成的声音</span>
      </div>
      <span class="vox-panel__chip">{{ engineLabel }}</span>
    </div>

    <div class="vox-synth">
      <div class="vox-synth__col">
        <div class="vox-field">
          <label class="vox-field__label">{{ '合成引擎' }}</label>
          <HosSelect variant="settings" block :model-value="engine" @update:model-value="setEngine">
            <option value="edge">{{ '微软 edge-tts（免费 · 神经音色）' }}</option>
            <option value="openai">{{ 'OpenAI 兼容（需 API Key）' }}</option>
          </HosSelect>
          <p class="voice-field-hint">{{ engineHint }}</p>
        </div>

        <div class="vox-field">
          <label class="vox-field__label">{{ '音色' }}</label>
          <HosSelect variant="settings" block v-model="voice.ttsVoice">
            <option v-for="item in voiceOptions" :key="item.value" :value="item.value">
              {{ `${item.label} · ${item.hint}` }}
            </option>
          </HosSelect>
          <p class="voice-field-hint">{{ voiceHint }}</p>
        </div>
      </div>

      <div class="vox-synth__col vox-synth__col--sliders">
        <div class="vox-slider">
          <div class="vox-slider__top">
            <span class="vox-field__label">{{ '语速' }}</span>
            <span class="vox-slider__value">{{ formatSigned(rateValue, '%') }}</span>
          </div>
          <input
            v-model.number="rateValue"
            type="range"
            min="-50"
            max="100"
            step="5"
            class="vox-range"
            :style="{ '--vox-fill': rateFill }"
            aria-label="语速（%）"
          />
          <span class="vox-slider__scale">
            <span>-50%</span>
            <span>0</span>
            <span>+100%</span>
          </span>
        </div>

        <div class="vox-slider">
          <div class="vox-slider__top">
            <span class="vox-field__label">{{ '音调' }}</span>
            <span class="vox-slider__value">
              {{ engine === 'openai' ? '不支持' : formatSigned(pitchValue, 'Hz') }}
            </span>
          </div>
          <input
            v-model.number="pitchValue"
            type="range"
            min="-20"
            max="20"
            step="1"
            class="vox-range"
            :style="{ '--vox-fill': pitchFill }"
            :disabled="engine === 'openai'"
            aria-label="音调（Hz）"
          />
          <span class="vox-slider__scale">
            <span>-20Hz</span>
            <span>0</span>
            <span>+20Hz</span>
          </span>
        </div>
      </div>
    </div>

    <template v-if="engine === 'openai'">
      <div class="vox-subpanel">
        <div class="vox-field">
          <label class="vox-field__label">{{ 'API 地址' }}</label>
          <input
            v-model.trim="voice.ttsApiBase"
            type="text"
            class="settings-field"
            placeholder="https://api.openai.com/v1"
            aria-label="TTS API 地址"
          />
        </div>

        <div class="vox-synth vox-synth--pair">
          <div class="vox-field">
            <label class="vox-field__label">{{ 'API Key' }}</label>
            <input
              v-model.trim="voice.ttsApiKey"
              type="password"
              class="settings-field"
              autocomplete="new-password"
              placeholder="sk-…"
              aria-label="TTS API Key"
            />
            <p class="voice-field-hint">
              {{ keyIsMasked ? '当前为已保存的掩码，留空即不修改' : '保存后仅显示掩码' }}
            </p>
          </div>
          <div class="vox-field">
            <label class="vox-field__label">{{ '模型' }}</label>
            <input
              v-model.trim="voice.ttsModel"
              type="text"
              class="settings-field"
              placeholder="tts-1"
              aria-label="TTS 模型"
            />
            <p class="voice-field-hint">{{ '如 tts-1 / gpt-4o-mini-tts' }}</p>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import HosSelect from '@/components/common/base/HosSelect.vue'
import { voicesForEngine, withCurrentVoice } from '@/shared/voice/utils/edge-voices'

const voice = defineModel('voice', { type: Object, required: true })

const engine = computed(() => (voice.value.ttsEngine === 'openai' ? 'openai' : 'edge'))

const engineLabel = computed(() => (engine.value === 'openai' ? 'OpenAI' : 'Edge TTS'))

/** 后端回传的是掩码占位符：此时改参数必须连同密钥一起保存 */
const keyIsMasked = computed(() => {
  const raw = String(voice.value.ttsApiKey || '').trim()
  return raw === '********' || raw === 'REDACTED_API_KEY'
})

const engineHint = computed(() =>
  engine.value === 'openai'
    ? '走 /audio/speech 接口；合成失败时回落到上面的输出去向'
    : '免费、免密钥的神经音色，中文建议选晓晓 / 云希',
)

const voiceOptions = computed(() => withCurrentVoice(voicesForEngine(engine.value), String(voice.value.ttsVoice || '')))

const voiceHint = computed(() =>
  engine.value === 'openai' ? '填模型支持的 voice 名称' : '对话回复带音频时直接播放这段声音',
)

/** 语速/音调在配置里是 `+10%` / `+2Hz` 字符串，滑杆用整数 */
function parseNumber(raw, fallback = 0) {
  const matched = String(raw ?? '').match(/^[+-]?\d+(?:\.\d+)?/)
  if (!matched) return fallback
  const value = Number(matched[0])
  return Number.isFinite(value) ? Math.round(value) : fallback
}

function formatSigned(value, unit) {
  const n = Math.round(Number(value) || 0)
  return `${n > 0 ? '+' : ''}${n}${unit}`
}

/** 把值映射成滑杆已填充比例，喂给 .vox-range 的 --vox-fill */
function fillPercent(value, min, max) {
  const clamped = Math.min(max, Math.max(min, Number(value) || 0))
  return `${((clamped - min) / (max - min)) * 100}%`
}

const rateValue = computed({
  get: () => parseNumber(voice.value.ttsRate, 0),
  set: (value) => {
    voice.value.ttsRate = formatSigned(value, '%')
  },
})

const pitchValue = computed({
  get: () => parseNumber(voice.value.ttsPitch, 0),
  set: (value) => {
    voice.value.ttsPitch = formatSigned(value, 'Hz')
  },
})

const rateFill = computed(() => fillPercent(rateValue.value, -50, 100))
const pitchFill = computed(() => fillPercent(pitchValue.value, -20, 20))

/** 切引擎时把音色换成该引擎的默认值，避免留下另一个引擎不认的音色名 */
function setEngine(next) {
  const target = next === 'openai' ? 'openai' : 'edge'
  if (target === engine.value) return
  voice.value.ttsEngine = target
  const list = voicesForEngine(target)
  if (!list.some((item) => item.value === voice.value.ttsVoice)) {
    voice.value.ttsVoice = list[0]?.value || ''
  }
}
</script>

<style src="./styles/voice-form.css"></style>
<style scoped src="./styles/settings-voice-agent-speech-section.css"></style>
