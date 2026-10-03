/**
 * @file HvacControlPopup.vue
 * @module components/entities/popups
 * @brief 暖通设备控制弹窗（地暖/新风/暖气等）
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染通用 HVAC 温控面板（区别于 climate 域的 ClimateControlPopup）
 * - 自动识别设备类型（地暖/新风系统/暖气/温控设备）并展示对应标签
 * - 目标温度调节（± 按钮 + 滑动条）、风速档位切换、电源开关
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（Power/Minus/Plus/Fan/Wind）
 * - ./EntityPopupShell、./PopupHead
 * - @/composables/entity/useEntityPopupBase、useSliderCommit、useClimateControlActions
 * - @/utils/ui/progress-bar.util（clampInRange）、@/utils/entity/derived.util（getEntityDisplayName）
 */
<template>
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="340"
    :height="420"
    accent="#fb923c"
    accent-rgb="251, 146, 60"
    @close="$emit('close')"
  >
    <!-- 标题 -->
    <PopupHead
      :title="getEntityDisplayName(liveEntity?.entity_id ?? '', liveEntity)"
      :subtitle="deviceTypeLabel"
    >
      <template #actions>
        <div
          :class="[
            'popup-status-badge',
            liveEntity?.state === 'off' ? 'popup-status-badge--off' : 'popup-status-badge--on',
          ]"
        >
          {{ liveEntity?.state === 'off' ? '关闭' : '运行中' }}
        </div>
      </template>
    </PopupHead>

    <!-- 当前温度 -->
    <div v-if="liveEntity?.attributes?.current_temperature" class="flex flex-col items-center mb-5">
      <span class="text-[44px] font-bold text-white tabular-nums tracking-tighter">
        {{ liveEntity.attributes.current_temperature }}
      </span>
      <span class="text-xs hvc-temp-label font-bold leading-normal pb-px">{{ '当前 °C' }}</span>
    </div>

    <!-- 目标温度调节 -->
    <div v-if="hasTargetTemp" class="flex flex-col items-center gap-5 mb-5">
      <div class="flex items-center justify-between w-full px-1">
        <button
          type="button"
          class="temp-adjust-btn"
          :aria-label="'降低设定温度'"
          @click.stop="adjustTemp(-0.5)"
        >
          <Minus class="w-5 h-5" />
        </button>
        <div class="flex flex-col items-center">
          <span class="text-[44px] font-bold text-white tabular-nums tracking-tighter">
            {{ tempLocal.toFixed(1) }}
          </span>
          <span class="text-xs font-bold hvc-temp-label leading-normal pb-px">{{
            '设定温度 °C'
          }}</span>
        </div>
        <button
          type="button"
          class="temp-adjust-btn"
          :aria-label="'提高设定温度'"
          @click.stop="adjustTemp(0.5)"
        >
          <Plus class="w-5 h-5" />
        </button>
      </div>
      <div class="w-full px-3">
        <input
          type="range"
          :min="minTemp"
          :max="maxTemp"
          :step="0.5"
          :value="tempRange"
          class="temp-slider"
          data-no-swipe-close
          :style="tempTrackStyle"
          @input="onTempInput"
          @change="onTempChange"
          @mouseup="commitTemp"
          @touchend="commitTemp"
        />
      </div>
      <div class="flex items-center justify-between w-full px-1">
        <span class="text-xs hvc-temp-range">{{ minTemp }}°C</span>
        <button
          :class="[
            'popup-off-btn shrink-0',
            liveEntity?.state === 'off'
              ? 'hvc-off-btn--active'
              : 'bg-white/5 hvc-off-btn hover:bg-white/10',
          ]"
          @click.stop="turnOff"
        >
          <Power class="w-3.5 h-3.5" />
          <span>{{ '关闭' }}</span>
        </button>
        <span class="text-xs hvc-temp-range">{{ maxTemp }}°C</span>
      </div>
    </div>

    <!-- 新风风量控制 -->
    <div
      v-if="hasFanControl && fanLevels.length > 0"
      class="border-t border-white/[0.05] pt-5 mb-4"
    >
      <div class="flex items-center justify-between mb-3 px-1">
        <span class="text-xs font-bold text-white/40 tracking-widest uppercase">{{
          '风量'
        }}</span>
        <span class="text-xs font-semibold hvc-fan-speed">{{ fanSpeedLabel }}</span>
      </div>
      <div class="flex gap-2">
        <button
          v-for="level in fanLevels"
          :key="level.value"
          :class="['fan-btn', currentFanSpeed === level.value ? 'fan-btn--active' : '']"
          @click.stop="setFanSpeed(level.value)"
        >
          <component :is="level.icon" class="w-4 h-4" />
          <span class="text-xs font-bold">{{ level.label }}</span>
        </button>
      </div>
    </div>

    <!-- 开关 -->
    <div v-if="!hasTargetTemp" class="flex justify-center gap-4 pt-2">
      <button
        :class="liveEntity?.state === 'on' ? 'action-btn--on' : 'action-btn--off'"
        class="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
        @click.stop="togglePower"
      >
        <Power class="w-4 h-4" />
        <span>{{ liveEntity?.state === 'on' ? '关闭' : '开启' }}</span>
      </button>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 HvacControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
const FAN_LABELS = {
  high: '高风',
  low: '低风',
  medium: '中风',
}

import { computed } from 'vue'
import { Power, Minus, Plus, Fan, Wind } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import { useClimateControlActions } from '@/composables/entity/useClimateControlActions'
import { clampInRange } from '@/utils/ui/progress-bar.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps({
  ...defineEntityPopupProps(),
  entityId: { type: String, default: '' },
  xPct: { type: Number, required: true },
  yPct: { type: Number, required: true },
})

defineEmits(['close'])

const { liveEntity } = useEntityPopupBase(props)

const deviceTypeLabel = computed(() => {
  const id = (liveEntity.value?.entity_id || '').toLowerCase()
  const name = getEntityDisplayName(
    liveEntity.value?.entity_id ?? '',
    liveEntity.value,
  ).toLowerCase()
  if (id.includes('floor_heating') || name.includes('地暖')) return '地暖'
  if (id.includes('fresh_air') || id.includes('ventilation') || name.includes('新风'))
    return '新风系统'
  if (id.includes('heating') || name.includes('暖气')) return '暖气'
  return '温控设备'
})

const hasTargetTemp = computed(() => {
  const a = liveEntity.value?.attributes || {}
  return (
    a.temperature !== undefined ||
    a.target_temp_low !== undefined ||
    a.target_temp_high !== undefined
  )
})

const minTemp = computed(() => {
  const a = liveEntity.value?.attributes
  return a?.min_temp ?? 16
})
const maxTemp = computed(() => {
  const a = liveEntity.value?.attributes
  return a?.max_temp ?? 30
})

const targetTempSource = computed(() => {
  const a = liveEntity.value?.attributes || {}
  let v
  if (a.temperature !== undefined) v = parseFloat(a.temperature)
  else if (a.target_temp_low !== undefined) v = parseFloat(a.target_temp_low)
  else v = 22
  return clampInRange(v, minTemp.value, maxTemp.value, 22)
})

const {
  localValue: tempLocal,
  rangeValue: tempRange,
  trackStyle: tempTrackStyle,
  onInput: onTempInput,
  onChange: onTempChange,
  commit: commitTemp,
} = useSliderCommit(targetTempSource, {
  parse: (v) => parseFloat(v),
  onCommit: (val) => setTargetTemp(val),
  track: () => ({ min: minTemp.value, max: maxTemp.value, step: 0.5, variant: 'amber' }),
})

const hasFanControl = computed(() => {
  const modes = liveEntity.value?.attributes?.fan_modes
  return Array.isArray(modes) && modes.length > 0
})

const fanLevels = computed(() => {
  const modes = liveEntity.value?.attributes?.fan_modes
  if (Array.isArray(modes) && modes.length > 0) {
    return modes.map((value) => ({
      value,
      label: FAN_LABELS[value] ?? value,
      icon: value === 'high' ? Wind : Fan,
    }))
  }
  return []
})

const currentFanSpeed = computed(() => liveEntity.value?.attributes?.fan_mode || 'medium')
const fanSpeedLabel = computed(() => {
  const mode = currentFanSpeed.value
  return FAN_LABELS[mode] ?? mode
})

const climate = useClimateControlActions(() => liveEntity.value, { label: '地暖/新风控制' })

function adjustTemp(delta) {
  const current = tempLocal.value
  const next = Math.round((current + delta) * 2) / 2
  setTargetTemp(next)
}

function setTargetTemp(val) {
  climate.setTargetTemp(val)
}

function turnOff() {
  return climate.turnOff()
}

function togglePower() {
  return climate.togglePower()
}

function setFanSpeed(level) {
  climate.setFanMode(level)
}
</script>

<style scoped src="./styles/HvacControlPopup.css"></style>
