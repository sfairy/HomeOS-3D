<!--
组件：SettingsRangeField.vue
所属模块：frontend / src / views / settings / shared / layout
职责：设置页范围滑杆字段。双滑杆选取 [min, max] 区间，支持步进吸附、数值输入、单位显示、
      隐藏极端值。用于免打扰时段、阈值区间等场景。
Props：
  - modelValue：数值（单值或区间）
  - label / min / max / step / unit / unitSuffix：标签与范围配置
Emits：
  - update:modelValue：值变更
关键依赖：
  - sliderTrackStyle：滑杆轨道样式
  - parseOptionalNumber / formatRangeDisplayValue / snapToRangeStep：数值解析/格式/吸附
数据来源：父级透传的 modelValue
-->
<template>
  <div :class="rootClass">
    <div v-if="showHead" class="settings-range-field__head">
      <span :class="labelClass">{{ label }}</span>

      <span :class="['settings-range-field__value', valueAccentClass]">{{ displayValue }}</span>
    </div>

    <div class="settings-range-field__row">
      <span v-if="leading" class="settings-range-field__leading">{{ leading }}</span>

      <input
        :value="rangeValue"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :aria-label="label"
        :class="[rangeClass, 'settings-range-field__range']"
        :style="trackStyle"
        @input="onRangeInput"
      />

      <div
        :class="[
          'settings-range-field__stepper',
          inputWide && 'settings-range-field__stepper--wide',
        ]"
      >
        <button
          type="button"
          class="settings-range-field__spin-btn settings-range-field__spin-btn--dec"
          :disabled="!canStepDown"
          :aria-label="`${label} 减少`"
          @click="stepBy(-1)"
        >
          <ChevronDown class="settings-range-field__spin-icon" aria-hidden="true" />
        </button>

        <input
          :value="inputText"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          spellcheck="false"
          class="settings-range-field__input"
          :aria-label="`${label} 数值`"
          @focus="onInputFocus"
          @input="onTextInput"
          @blur="onInputBlur"
          @keydown="onNumberKeydown"
          @keydown.enter="onEnter"
        />

        <button
          type="button"
          class="settings-range-field__spin-btn settings-range-field__spin-btn--inc"
          :disabled="!canStepUp"
          :aria-label="`${label} 增加`"
          @click="stepBy(1)"
        >
          <ChevronUp class="settings-range-field__spin-icon" aria-hidden="true" />
        </button>
      </div>

      <span v-if="trailingUnit" class="settings-range-field__trailing">{{ trailingUnit }}</span>
    </div>

    <p v-if="hint" class="settings-range-field__hint">{{ hint }}</p>

    <slot />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

import { ChevronUp, ChevronDown } from '@lucide/vue'

import { sliderTrackStyle } from '@/utils/ui/progress-bar.util'
import { parseOptionalNumber } from '@/utils/core/misc.util'

import {
  formatRangeDisplayValue,
  snapToRangeStep,
} from '@/utils/settings/range-steps.util'

const props = defineProps({
  modelValue: { type: Number, default: 0 },

  label: { type: String, required: true },

  min: { type: Number, default: 0 },

  max: { type: Number, default: 100 },

  step: { type: Number, default: 1 },

  /** 显示在右上角与输入框旁的单位，如 px / % / s */

  unit: { type: String, default: '' },

  /** 行尾单位（不与 header 重复时使用，如仅显示 px 后缀） */

  trailingUnit: { type: String, default: '' },

  hint: { type: String, default: '' },

  rangeClass: { type: String, default: 'hos-range' },

  /** block = 深色卡片；plain = 与布局页一致的扁平样式 */

  variant: { type: String, default: 'block' },

  valueAccent: { type: String, default: 'purple' },

  leading: { type: String, default: '' },

  inputWide: { type: Boolean, default: false },

  formatDisplay: { type: Function, default: null },
})

const emit = defineEmits(['update:modelValue', 'enter'])

const inputFocused = ref(false)

const inputDraft = ref('')

const rootClass = computed(() => [
  'settings-range-field',

  props.variant === 'block' && 'settings-range-field--block',

  props.variant === 'plain' && 'settings-range-field--plain',

  props.variant === 'inline' && 'settings-range-field--inline',
])

const showHead = computed(() => props.variant !== 'inline')

const labelClass = computed(() =>
  props.variant === 'plain'
    ? 'settings-form-label settings-range-field__label-plain'
    : 'settings-slider-block__label',
)

const valueAccentClass = computed(() =>
  props.valueAccent === 'sky' ? 'settings-range-field__value--sky' : '',
)

function snapToStep(raw) {
  return snapToRangeStep(Number(raw), props.min, props.max, props.step)
}

/** 与 range step 对齐，保证滑块拇指与轨道填充一致 */

const rangeValue = computed(() => snapToStep(props.modelValue))

const trackStyle = computed(() =>
  sliderTrackStyle({
    value: rangeValue.value,

    min: props.min,

    max: props.max,

    step: props.step,

    variant: 'accent',

    trackColor: 'rgba(255, 255, 255, 0.1)',
  }),
)

function formatValue(value) {
  return formatRangeDisplayValue(value, props.min, props.max, props.step)
}

const displayValue = computed(() => {
  if (props.formatDisplay) return props.formatDisplay(props.modelValue)

  const text = formatValue(props.modelValue)

  if (!props.unit) return text

  return `${text}${props.unit.toUpperCase()}`
})

const inputText = computed(() => {
  if (inputFocused.value) return inputDraft.value

  return formatValue(props.modelValue)
})

function emitValue(raw, syncDraft = true) {
  const next = snapToStep(raw)

  emit('update:modelValue', next)

  if (inputFocused.value && syncDraft) {
    inputDraft.value = formatValue(next)
  }
}

const canStepUp = computed(
  () => snapToStep(props.modelValue + props.step) > snapToStep(props.modelValue),
)

const canStepDown = computed(
  () => snapToStep(props.modelValue - props.step) < snapToStep(props.modelValue),
)

function stepBy(direction) {
  emitValue(Number(props.modelValue) + props.step * direction)
}

function onRangeInput(e) {
  emitValue(Number(e.target.value))
}

function onInputFocus(e) {
  inputFocused.value = true

  inputDraft.value = formatValue(props.modelValue)

  requestAnimationFrame(() => e.target.select())
}

function onTextInput(e) {
  inputDraft.value = e.target.value
  const parsed = parseOptionalNumber(e.target.value)
  // 清空时不写入：Number('') === 0 会被误判为有效值并钳到 min
  if (parsed != null) emitValue(parsed, false)
}

function commitDraftOrRestore() {
  const parsed = parseOptionalNumber(inputDraft.value)
  if (parsed != null) emitValue(parsed)
  else inputDraft.value = formatValue(props.modelValue)
  inputFocused.value = false
}

function onInputBlur() {
  commitDraftOrRestore()
}

function onEnter(e) {
  commitDraftOrRestore()
  e.target.blur()
  emit('enter')
}

function onNumberKeydown(e) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()

    if (canStepUp.value) stepBy(1)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()

    if (canStepDown.value) stepBy(-1)
  }
}
</script>
