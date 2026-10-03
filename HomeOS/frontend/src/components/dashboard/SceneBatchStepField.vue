<!--
  组件文件：SceneBatchStepField.vue
  所属模块：frontend/src/components/dashboard
  组件职责：场景批量添加对话框的步进式数值字段。顶部标签行 + 默认按钮（可重置到 defaultValue），
    中间 −/+ 按钮、文本输入、可选单位后缀。输入支持聚焦时编辑草稿、失焦/Enter 回写，
    上下方向键调整；所有回写前 snap 到 min/max/step 合法范围，通过 update:modelValue 向父级 emit。
  主要 props / emits：
    - props.modelValue：数值或 null（v-model 绑定）；props.label 字段标签；
      props.min / max / step：范围与步长；props.defaultValue：默认值；props.suffix：单位后缀（%/K/°C）。
    - emit update:modelValue：值经 snap 处理后回传给父级，payload 为 number。
  依赖关系：vue computed/ref；@lucide/vue Minus/Plus；utils/core/misc.util parseOptionalNumber。
-->
<template>
  <label class="scene-batch-field">
    <div class="scene-batch-field__label-row">
      <span class="hos-modal-label">{{ label }}</span>
      <button
        v-if="hasDefault"
        type="button"
        class="scene-batch-default-btn"
        :title="defaultHint"
        @click.prevent="resetDefault"
      >
        {{ '默认' }}
      </button>
    </div>
    <div class="scene-batch-stepper">
      <button
        type="button"
        class="scene-batch-stepper__btn"
        :disabled="atMin"
        :aria-label="`${label} 减少`"
        @click="adjustStep(-1)"
      >
        <Minus class="w-3.5 h-3.5" />
      </button>
      <input
        :value="inputText"
        type="text"
        inputmode="decimal"
        class="scene-batch-stepper__input"
        :aria-label="label"
        @focus="onFocus"
        @input="onInput"
        @blur="onBlur"
        @keydown="onKeydown"
      />
      <span v-if="suffix" class="scene-batch-stepper__suffix">{{ suffix }}</span>
      <button
        type="button"
        class="scene-batch-stepper__btn"
        :disabled="atMax"
        :aria-label="`${label} 增加`"
        @click="adjustStep(1)"
      >
        <Plus class="w-3.5 h-3.5" />
      </button>
    </div>
  </label>
</template>

<script setup lang="ts">
/**
 * SceneBatchStepField.vue
 *
 * 所属模块：dashboard（场景批量添加 - 步进字段）
 * 职责：场景批量预设栏的步进数值字段。提供 −/+ 按钮、文本输入、单位后缀、
 *      「默认」按钮。值经 snap（限制 + 步进对齐）后通过 update:modelValue emit。
 *      支持聚焦时编辑草稿、失焦/Enter 时回写、上下方向键调整。
 * 依赖：vue、@lucide/vue（Minus/Plus）、parseOptionalNumber。
 */
import { computed, ref } from 'vue'
import { Minus, Plus } from '@lucide/vue'
import { clampNum, parseOptionalNumber } from '@/utils/core/misc.util'

/**
 * 组件 Props
 * @property {number|null} modelValue   - 当前值（v-model 双向绑定）
 * @property {string}      label        - 字段标签
 * @property {number}      min          - 最小值
 * @property {number}      max          - 最大值
 * @property {number}      step         - 步长
 * @property {number}      defaultValue - 默认值（提供「默认」按钮）
 * @property {string}      suffix       - 单位后缀（如 '%'/'K'/'°C'）
 */
const props = defineProps<{
  modelValue: number | null
  label: string
  min: number
  max: number
  step: number
  defaultValue: number
  suffix?: string
}>()

/** 事件：update:modelValue - 值变化时触发（已 snap 到合法范围与步长） */
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

// 聚焦状态与草稿（聚焦时显示原始输入，失焦后回写为格式化值）
const focused = ref(false)
const draft = ref('')

/** 是否存在有效默认值 */
const hasDefault = computed(() => props.defaultValue != null && !Number.isNaN(props.defaultValue))

/** 「默认」按钮提示文案：值 + 后缀 */
const defaultHint = computed(() => `${props.defaultValue}${props.suffix || ''}`)

/**
 * 当前生效值：优先 modelValue，回退 defaultValue，均经 snap 处理
 * @returns {number}
 */
const effective = computed(() => {
  const v = props.modelValue
  if (v != null && !Number.isNaN(v)) return snap(v)
  return snap(props.defaultValue)
})

/** 是否已到达最小值（用于禁用 − 按钮） */
const atMin = computed(() => effective.value <= snap(props.min))
/** 是否已到达最大值（用于禁用 + 按钮） */
const atMax = computed(() => effective.value >= snap(props.max))

/** 输入框显示文案：聚焦时显示草稿，否则显示格式化后的生效值 */
const inputText = computed(() => (focused.value ? draft.value : format(effective.value)))

/**
 * 根据 step 推断小数位数
 * step >= 1 → 0 位；否则取 step 字符串小数部分长度，最少 1 位
 * @returns {number}
 */
function decimalsForStep() {
  if (props.step >= 1) return 0
  const s = String(props.step)
  const i = s.indexOf('.')
  return i >= 0 ? s.length - i - 1 : 1
}

/**
 * 将原始数值 snap 到 [min, max] 区间并对齐到 step
 * @param {number} raw - 原始数值
 * @returns {number}
 */
function snap(raw: number) {
  const clamped = clampNum(raw, props.min, props.max)
  const stepped = Math.round(clamped / props.step) * props.step
  return Number(stepped.toFixed(decimalsForStep()))
}

/** 格式化数值为字符串（snap 后 String 化） */
function format(v: number) {
  return String(snap(v))
}

/**
 * 解析并 emit 数值
 * 字符串先经 parseOptionalNumber 解析；解析失败则不 emit
 * @param {number|string} raw - 原始输入
 */
function emitValue(raw: number | string) {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : parseOptionalNumber(raw)
  if (n == null) return
  emit('update:modelValue', snap(n))
}

/**
 * 步进调整：按 dir 方向加减 step
 * @param {number} dir - 1 增加 / -1 减少
 */
function adjustStep(dir: number) {
  emitValue(effective.value + props.step * dir)
}

/** 点击「默认」按钮：emit snap 后的 defaultValue */
function resetDefault() {
  emit('update:modelValue', snap(props.defaultValue))
}

/**
 * 聚焦事件：进入编辑态，草稿同步为当前格式化值，下一帧全选
 */
function onFocus(e: FocusEvent) {
  focused.value = true
  draft.value = format(effective.value)
  requestAnimationFrame(() => (e.target as HTMLInputElement).select())
}

/**
 * 输入事件：实时同步草稿；解析成功则 emit
 */
function onInput(e: Event) {
  draft.value = (e.target as HTMLInputElement).value
  const parsed = parseOptionalNumber(draft.value)
  if (parsed != null) emitValue(parsed)
}

/**
 * 失焦事件：草稿可解析则 emit，否则回退为格式化生效值；退出聚焦态
 */
function onBlur() {
  const parsed = parseOptionalNumber(draft.value)
  if (parsed != null) emitValue(parsed)
  else draft.value = format(effective.value)
  focused.value = false
}

/**
 * 键盘事件：ArrowUp/Down 步进；Enter 失焦提交
 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!atMax.value) adjustStep(1)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!atMin.value) adjustStep(-1)
  } else if (e.key === 'Enter') {
    ;(e.target as HTMLInputElement).blur()
  }
}
</script>

<style scoped src="./styles/SceneBatchStepField.css"></style>
