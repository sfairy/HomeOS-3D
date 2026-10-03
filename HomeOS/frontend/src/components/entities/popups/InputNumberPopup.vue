/**
 * @file InputNumberPopup.vue
 * @module components/entities/popups
 * @brief 数字输入弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 input_number 域控制面板
 * - 支持数值输入、步进调节与范围限制（min/max/step）
 * - 滑动条防抖提交，展示当前值
 *
 * 依赖：
 * - vue（ref/computed/onMounted/watch）、@lucide/vue（Hash）
 * - ./EntityPopupShell、./PopupHead
 * - @/composables/entity/useEntityPopupBase、useSliderCommit、entities.store
 * - @/utils/ui/progress-bar.util（clampInRange）、@/services/notify、@/utils/entity/derived.util
 */
<template>
  <!-- InputNumberPopup 数字输入弹窗：设置 input_number 实体的数值 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="220"
    :height="200"
    accent="#67e8f9"
    accent-rgb="103, 232, 249"
    shell-class="popup-shell--compact"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="Hash">
      <template #actions>
        <span class="text-lg font-bold font-mono" style="color: var(--accent)">
          {{ displayValue }}<span v-if="unit" class="text-xs text-white/40 ml-0.5">{{ unit }}</span>
        </span>
      </template>
    </PopupHead>

    <div class="flex items-center gap-3 mb-3">
      <button class="num-btn num-btn--decr" @click="adjust(-step)">−</button>
      <input
        ref="inputRef"
        v-model.number="localValue"
        type="text"
        inputmode="decimal"
        class="num-input"
        @blur="commitValue"
        @keydown.enter="$event.target.blur()"
      />
      <button class="num-btn num-btn--incr" @click="adjust(step)">+</button>
    </div>

    <div v-if="min !== null && max !== null" class="flex items-center gap-2">
      <span class="text-xs text-white/25">{{ min }}</span>
      <input
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="numberRange"
        class="num-slider slider-range"
        data-no-swipe-close
        :style="numberTrackStyle"
        @input="onSliderInput"
        @change="onNumberChange"
        @mouseup="commitNumber"
        @touchend="commitNumber"
      />
      <span class="text-xs text-white/25">{{ max }}</span>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 InputNumberPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * InputNumberPopup - 数字输入弹窗组件
 * 功能特性：
 * - 设置 input_number 实体的数值
 * - 支持步进调节
 * - 显示当前值和范围
 * - 弹出式面板
 */
import { getEntityDomain } from '@homeos/shared'
import { ref, computed, onMounted, watch } from 'vue'
import { Hash } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { clampNum } from '@/utils/core/misc.util'
import { useEntitiesStore } from '@/stores/entities.store'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import { clampInRange } from '@/utils/ui/progress-bar.util'
import { notifyError } from '@/services/notify'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])
const es = useEntitiesStore()

const { liveEntity } = useEntityPopupBase(props)

const inputRef = ref(null)
const localValue = ref('')

onMounted(() => {
  localValue.value = String(liveEntity.value?.state || '')
})

watch(
  () => liveEntity.value?.state,
  (state) => {
    if (state != null && state !== '') {
      localValue.value = String(state)
    }
  },
)

const entityName = computed(() =>
  getEntityDisplayName(liveEntity.value?.entity_id ?? '', liveEntity.value),
)
const currentValue = computed(() => Number(liveEntity.value?.state) || 0)
const min = computed(() =>
  liveEntity.value?.attributes?.min !== undefined ? Number(liveEntity.value.attributes.min) : 0,
)
const max = computed(() =>
  liveEntity.value?.attributes?.max !== undefined ? Number(liveEntity.value.attributes.max) : 100,
)
const step = computed(() =>
  liveEntity.value?.attributes?.step !== undefined ? Number(liveEntity.value.attributes.step) : 1,
)
const unit = computed(() => liveEntity.value?.attributes?.unit_of_measurement || '')
const displayValue = computed(() => {
  const v = Number(localValue.value)
  if (!isNaN(v)) return step.value < 1 ? v.toFixed(1) : String(v)
  const s = Number(liveEntity.value?.state)
  return isNaN(s) ? '--' : step.value < 1 ? s.toFixed(1) : String(s)
})

const sliderSource = computed(() =>
  clampInRange(currentValue.value, min.value, max.value, min.value),
)

const {
  localValue: numberLocal,
  rangeValue: numberRange,
  trackStyle: numberTrackStyle,
  onInput: onNumberInput,
  onChange: onNumberChange,
  commit: commitNumber,
} = useSliderCommit(sliderSource, {
  onCommit: (val) => {
    localValue.value = step.value < 1 ? val.toFixed(1) : String(val)
    commitValue()
  },
  track: () => ({ min: min.value, max: max.value, step: step.value, variant: 'accent' }),
})

function onSliderInput(e) {
  onNumberInput(e)
  const v = numberLocal.value
  localValue.value = step.value < 1 ? v.toFixed(1) : String(v)
}

function adjust(amount) {
  const parsed = Number(String(localValue.value).trim())
  const base = Number.isFinite(parsed) ? parsed : currentValue.value
  const clamped = clampNum(base + amount, min.value, max.value)
  localValue.value = step.value < 1 ? clamped.toFixed(1) : String(clamped)
  commitValue()
}

async function commitValue() {
  const v = Number(localValue.value)
  if (isNaN(v)) return
  const domain = getEntityDomain(liveEntity.value.entity_id)
  try {
    await es.callService(domain, 'set_value', liveEntity.value.entity_id, { value: v })
  } catch (e) {
    notifyError(e, '数值设置')
  }
}
</script>

<style scoped src="./styles/InputNumberPopup.css"></style>
