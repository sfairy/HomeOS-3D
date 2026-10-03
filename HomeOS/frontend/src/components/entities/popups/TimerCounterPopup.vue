/**
 * @file TimerCounterPopup.vue
 * @module components/entities/popups
 * @brief 计时器/计数器弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 timer/counter 域控制面板
 * - 提供启动/暂停/重置与数值/时间设定
 * - 计时器支持时长输入与倒计时展示
 *
 * 依赖：
 * - vue（ref/computed/watch）、@lucide/vue（Play/Pause/Square/Plus/Minus/RotateCcw/Check/Timer/Hash/Type）
 * - ./EntityPopupShell、./PopupHead
 * - @homeos/shared（getEntityDomain）、@/composables/entity/useEntityPopupBase
 */
<template>
  <!-- TimerCounterPopup 计时器/计数器弹窗：控制和查看计时器、计数器 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="220"
    :height="240"
    shell-class="popup-shell--compact"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="headIcon" :eyebrow="headEyebrow" />

    <div class="flex flex-col items-center gap-3 py-1">
      <div v-if="isTimer" class="text-center">
        <span class="text-3xl font-bold text-white font-mono">{{ remaining }}</span>
        <span class="text-xs text-white/30 block mt-1">{{
          liveEntity?.state === 'active' ? '剩余时间' : '已暂停'
        }}</span>
      </div>

      <div v-if="isCounter" class="text-center">
        <span class="text-3xl font-bold font-mono" style="color: var(--accent)">{{
          liveEntity?.state
        }}</span>
        <span class="text-xs text-white/30 block mt-1">{{ '当前计数' }}</span>
      </div>

      <div class="flex gap-2.5 flex-wrap justify-center">
        <button v-if="isTimer" class="ctrl-btn ctrl-btn--start" @click="callService('start')">
          <Play class="w-3.5 h-3.5" /><span>{{ '启动' }}</span>
        </button>
        <button v-if="isTimer" class="ctrl-btn ctrl-btn--pause" @click="callService('pause')">
          <Pause class="w-3.5 h-3.5" /><span>{{ '暂停' }}</span>
        </button>
        <button v-if="isTimer" class="ctrl-btn ctrl-btn--cancel" @click="callService('cancel')">
          <Square class="w-3.5 h-3.5" /><span>{{ '取消' }}</span>
        </button>
        <button v-if="isCounter" class="ctrl-btn ctrl-btn--start" @click="callService('increment')">
          <Plus class="w-3.5 h-3.5" /><span>+1</span>
        </button>
        <button
          v-if="isCounter"
          class="ctrl-btn ctrl-btn--cancel"
          @click="callService('decrement')"
        >
          <Minus class="w-3.5 h-3.5" /><span>-1</span>
        </button>
        <button v-if="isCounter" class="ctrl-btn ctrl-btn--cancel" @click="callService('reset')">
          <RotateCcw class="w-3.5 h-3.5" /><span>{{ '清零' }}</span>
        </button>
      </div>

      <div v-if="isInputText" class="flex gap-2 w-full">
        <input v-model="textVal" class="it-input" :placeholder="entityName" />
        <button
          type="button"
          class="ctrl-btn ctrl-btn--start shrink-0"
          :aria-label="'确认'"
          @click="setText(textVal)"
        >
          <Check class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 TimerCounterPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * TimerCounterPopup - 计时器/计数器弹窗组件
 * 功能特性：
 * - 显示计时器/计数器状态
 * - 启动/暂停/重置操作
 * - 设置时间或数值
 * - 弹出式面板
 */
import { getEntityDomain } from '@homeos/shared'
import { ref, computed, watch } from 'vue'
import {
  Play,
  Pause,
  Square,
  Plus,
  Minus,
  RotateCcw,
  Check,
  Timer,
  Hash,
  Type,
} from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { useEntitiesStore } from '@/stores/entities.store'
import { notifyError } from '@/services/notify'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])
const es = useEntitiesStore()

const { liveEntity } = useEntityPopupBase(props)

const textVal = ref('')
const domain = computed(() => getEntityDomain(liveEntity.value?.entity_id) || '')
const isTimer = computed(() => domain.value === 'timer')
const isCounter = computed(() => domain.value === 'counter')
const isInputText = computed(() => domain.value === 'input_text')
watch(
  () => liveEntity.value?.state,
  (state) => {
    if (isInputText.value && state != null) textVal.value = String(state)
  },
  { immediate: true },
)
const entityName = computed(() =>
  getEntityDisplayName(liveEntity.value?.entity_id ?? '', liveEntity.value),
)

const headIcon = computed(() => {
  if (isTimer.value) return Timer
  if (isCounter.value) return Hash
  return Type
})

const headEyebrow = computed(() => {
  if (isTimer.value) return '计时器'
  if (isCounter.value) return '计数器'
  if (isInputText.value) return '文本输入'
  return ''
})

const remaining = computed(() => {
  if (!isTimer.value) return ''
  const a = liveEntity.value?.attributes || {}
  if (a.remaining) return a.remaining
  const dur = a.duration || ''
  return dur
})

async function callService(svc) {
  try {
    await es.callService(domain.value, svc, liveEntity.value.entity_id)
  } catch (e) {
    notifyError(e, '操作')
  }
}

async function setText(val) {
  try {
    await es.callService('input_text', 'set_value', liveEntity.value.entity_id, { value: val })
  } catch (e) {
    notifyError(e, '设置文本')
  }
}
</script>

<style scoped src="./styles/TimerCounterPopup.css"></style>
