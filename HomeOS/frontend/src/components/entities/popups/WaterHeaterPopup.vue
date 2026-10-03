/**
 * @file WaterHeaterPopup.vue
 * @module components/entities/popups
 * @brief 燃气热水器控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染热水器控制面板（适配海尔燃气热水器）
 * - 模式切换（运行/关闭）、目标温度调节（滑块/±按钮，动态范围）
 * - 温度场景一键切换（节能/温水/沐浴/高温）、实时出水温度与运行状态展示
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（Flame/Power）
 * - ./EntityPopupShell、./PopupHead、./ApplianceValueStepper
 * - @/composables/entity/useEntityPopupBase、useSliderCommit、entities.store
 * - @homeos/shared（getEntityDomain）、@/utils/ui/progress-bar.util、@/utils/entity/derived.util
 */
<template>
  <!-- WaterHeaterPopup 热水器弹窗：控制热水器 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="436"
    accent="#fb923c"
    accent-rgb="251, 146, 60"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="Flame">
      <template #status>
        <span :class="isRunning ? 'whp-state-on' : 'whp-state-off'">{{
          isRunning ? '运行中' : '已关闭'
        }}</span>
        <span
          v-if="isRunning"
          class="popup-status-dot popup-status-dot--pulse whp-state-dot whp-state-dot--on"
        />
      </template>
    </PopupHead>

    <div class="flex flex-col items-center gap-5 mb-5">
      <ApplianceValueStepper
        :value="tempLocal"
        label="目标温度 °C"
        label-class="whp-lbl"
        decrease-label="降低目标温度"
        increase-label="提高目标温度"
        @decrease="adjustTemp(-tempStep)"
        @increase="adjustTemp(tempStep)"
      />

      <div class="w-full px-3">
        <input
          type="range"
          :min="tempMin"
          :max="tempMax"
          :step="tempStep"
          :value="tempRange"
          :style="tempTrackStyle"
          class="temp-slider"
          data-no-swipe-close
          @input="onTempInput"
          @change="onTempChange"
          @mouseup="commitTemp"
          @touchend="commitTemp"
        />
      </div>

      <div class="flex items-center justify-between w-full px-1">
        <div
          v-if="liveEntity?.attributes?.current_temperature != null"
          class="flex items-center gap-2 bg-white/[0.04] px-3 py-1.5 rounded-full border border-white/[0.06]"
        >
          <Flame class="w-3 h-3 whp-ic-on" />
          <span class="text-xs font-bold whp-info-text tabular-nums">{{
            `当前 ${liveEntity.attributes.current_temperature}°C`
          }}</span>
        </div>
        <div v-else />
        <div class="flex items-center gap-1.5">
          <span class="text-xs font-semibold whp-lbl">{{ tempMin }}°</span>
          <span class="text-xs whp-lbl-faint">~</span>
          <span class="text-xs font-semibold whp-lbl">{{ tempMax }}°</span>
        </div>
      </div>
    </div>

    <div class="flex justify-center gap-2.5 mb-4">
      <button
        v-for="mode in operationModes"
        :key="mode.key"
        :class="['mode-card', currentOperation === mode.key ? mode.activeClass : '']"
        @click.stop="setOperationMode(mode.key)"
      >
        <component
          :is="mode.icon"
          :class="[
            'w-5 h-5 mb-1 transition-all duration-300',
            currentOperation === mode.key
              ? mode.iconColor + ' drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]'
              : 'whp-ic-default',
          ]"
        />
        <span class="text-xs font-bold tracking-wider">{{ mode.label }}</span>
      </button>
    </div>

    <div class="whp-presets">
      <span class="whp-presets__title">{{ '温度场景' }}</span>
      <div class="whp-presets__grid">
        <button
          v-for="preset in validPresets"
          :key="preset.value"
          type="button"
          :class="['whp-preset', tempLocal === preset.value ? 'whp-preset--active' : '']"
          @click.stop="presetTemp(preset.value)"
        >
          <span class="whp-preset__icon" aria-hidden="true">{{ preset.icon }}</span>
          <span class="whp-preset__value">{{ preset.value }}°</span>
          <span class="whp-preset__label">{{ preset.label }}</span>
        </button>
      </div>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 WaterHeaterPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * WaterHeaterPopup - 热水器弹窗组件
 * 功能特性：
 * - 控制热水器开关
 * - 温度调节
 * - 模式切换
 * - 显示当前温度
 * - 弹出式面板
 */
import { getEntityDomain } from '@homeos/shared'
/**
 * 热水器控制弹窗组件
 *
 * 提供燃气热水器的完整控制功能：
 * 1. **模式切换** — 运行/关闭（set_operation_mode: gas/off）
 * 2. **温度调节** — 滑块/±按钮调整目标温度（动态范围来自实体属性）
 * 3. **温度场景** — 一键切换预设温度（节能/温水/沐浴/高温）
 * 4. **实时状态** — 显示出水温度和运行状态
 *
 * 适配海尔燃气热水器（HA state: gas=运行, off=关闭）。
 */
import { computed } from 'vue'
import { Flame, Power } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import ApplianceValueStepper from '@/components/entities/popups/ApplianceValueStepper.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { useEntitiesStore } from '@/stores/entities.store'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import { clampInRange } from '@/utils/ui/progress-bar.util'

import { notifyError } from '@/services/notify'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps(defineEntityPopupProps())

defineEmits(['close'])

const { liveEntity } = useEntityPopupBase(props)
const entitiesStore = useEntitiesStore()

const tempMin = computed(() => liveEntity.value?.attributes?.min_temp ?? 32)
const tempMax = computed(() => liveEntity.value?.attributes?.max_temp ?? 60)
const tempStep = computed(() => liveEntity.value?.attributes?.target_temp_step ?? 1)

const tempSource = computed(() =>
  clampInRange(liveEntity.value?.attributes?.temperature ?? 42, tempMin.value, tempMax.value, 42),
)

const {
  localValue: tempLocal,
  rangeValue: tempRange,
  trackStyle: tempTrackStyle,
  onInput: onTempInput,
  onChange: onTempChange,
  commit: commitTemp,
} = useSliderCommit(tempSource, {
  parse: (v) => parseFloat(v),
  onCommit: (val) => setTempValue(val),
  track: () => ({ min: tempMin.value, max: tempMax.value, step: tempStep.value, variant: 'amber' }),
})
const isRunning = computed(() => liveEntity.value?.state === 'gas')

const entityName = computed(() =>
  getEntityDisplayName(liveEntity.value?.entity_id ?? '', liveEntity.value),
)

const currentOperation = computed(() => liveEntity.value?.state)

const opMeta = computed(() => ({
  gas: { icon: Flame, iconColor: 'whp-ic-gas', activeClass: 'whp-mode--gas', label: '运行' },
  off: { icon: Power, iconColor: 'whp-ic-off', activeClass: 'whp-mode--off', label: '关闭' },
}))

const operationModes = computed(() => {
  const list = liveEntity.value?.attributes?.operation_list
  if (list && Array.isArray(list) && list.length > 0) {
    return list.map((k) => ({
      key: k,
      ...(opMeta.value[k] || {
        icon: Flame,
        iconColor: 'whp-ic-default',
        activeClass: '',
        label: k,
      }),
    }))
  }
  return [
    { key: 'gas', ...opMeta.value.gas },
    { key: 'off', ...opMeta.value.off },
  ]
})

const presets = computed(() => [
  { value: 38, label: '节能', icon: '🌿' },
  { value: 42, label: '温水', icon: '💧' },
  { value: 46, label: '沐浴', icon: '🛁' },
  { value: 52, label: '高温', icon: '🔥' },
])

const validPresets = computed(() =>
  presets.value.filter((p) => p.value >= tempMin.value && p.value <= tempMax.value),
)

async function setTempValue(val) {
  const v = clampInRange(val, tempMin.value, tempMax.value, tempLocal.value)
  try {
    const domain = getEntityDomain(liveEntity.value.entity_id) || 'water_heater'
    await entitiesStore.callService(domain, 'set_temperature', liveEntity.value.entity_id, {
      temperature: v,
    })
  } catch (e) {
    notifyError(e, '设置热水器温度')
  }
}

async function adjustTemp(delta) {
  await setTempValue(tempLocal.value + delta)
}

async function presetTemp(val) {
  if (val >= tempMin.value && val <= tempMax.value) {
    await setTempValue(val)
  }
}

async function setOperationMode(mode) {
  const domain = getEntityDomain(liveEntity.value.entity_id) || 'water_heater'
  try {
    await entitiesStore.callService(domain, 'set_operation_mode', liveEntity.value.entity_id, {
      operation_mode: mode,
    })
  } catch (e) {
    notifyError(e, '设置热水器模式')
  }
}
</script>

<style scoped src="./styles/WaterHeaterPopup.css"></style>
