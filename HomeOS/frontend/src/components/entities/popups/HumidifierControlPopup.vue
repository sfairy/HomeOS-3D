/**
 * @file HumidifierControlPopup.vue
 * @module components/entities/popups
 * @brief 加湿器控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 humidifier 域控制面板
 * - 提供开/关按钮与目标湿度调节（滑动条 + 防抖提交）
 * - 展示当前湿度与可用范围（min/max_humidity）
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（Power/Droplets）
 * - ./EntityPopupShell、./PopupHead、./ApplianceValueStepper
 * - @/composables/entity/useEntityPopupBase、useSliderCommit
 * - @/utils/ui/progress-bar.util（clampInRange）
 */
<template>
  <!-- HumidifierControlPopup 加湿器控制弹窗：控制加湿器实体 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="380"
    accent="#38bdf8"
    accent-rgb="56,189,248"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="Droplets">
      <template #status>
        <span :class="isOn ? 'hcp-state-on' : 'hcp-state-off'">{{
          isOn ? '运行中' : '已关闭'
        }}</span>
        <span
          v-if="isOn"
          class="popup-status-dot popup-status-dot--pulse hcp-state-dot hcp-state-dot--on"
        />
      </template>
    </PopupHead>

    <div class="flex flex-col items-center gap-5 mb-5" v-if="hasHumidity">
      <ApplianceValueStepper
        :value="humidityLocal"
        label="目标湿度 %"
        label-class="hcp-lbl"
        decrease-label="降低目标湿度"
        increase-label="提高目标湿度"
        @decrease="adjustHumidity(-5)"
        @increase="adjustHumidity(5)"
      />
      <div class="w-full px-3">
        <input
          type="range"
          :min="hMin"
          :max="hMax"
          step="5"
          :value="humidityRange"
          class="temp-slider"
          data-no-swipe-close
          :style="humidityTrackStyle"
          @input="onHumidityInput"
          @change="onHumidityChange"
          @mouseup="commitHumidity"
          @touchend="commitHumidity"
        />
      </div>
    </div>

    <div class="flex items-center justify-between px-1">
      <div
        v-if="liveEntity?.attributes?.current_humidity != null"
        class="flex items-center gap-2 bg-white/[0.04] px-3 py-1.5 rounded-full border border-white/[0.06]"
      >
        <Droplets class="w-3 h-3 hcp-ic-on" />
        <span class="text-xs font-bold hcp-info-text tabular-nums">{{
          `当前 ${liveEntity.attributes.current_humidity}%`
        }}</span>
      </div>
      <div v-else />
      <button
        :class="['popup-off-btn shrink-0', !isOn ? 'hcp-off-btn--active' : 'hcp-off-btn--idle']"
        @click.stop="togglePower"
      >
        <Power class="w-3.5 h-3.5" />
        <span>{{ isOn ? '关闭' : '开机' }}</span>
      </button>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 HumidifierControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * HumidifierControlPopup - 加湿器控制弹窗组件
 * 功能特性：
 * - 控制加湿器开关
 * - 调节目标湿度
 * - 显示当前湿度
 * - 可能支持模式切换
 * - 弹出式面板
 */
import { computed } from 'vue'
import { Power, Droplets } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import ApplianceValueStepper from '@/components/entities/popups/ApplianceValueStepper.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import { clampInRange } from '@/utils/ui/progress-bar.util'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])

const { liveEntity, entityName, callService } = useEntityPopupBase(props)

const s = computed(() => liveEntity.value?.state)
const isOn = computed(() => s.value !== 'off' && s.value !== 'unavailable' && s.value != null)
const hasHumidity = computed(() => liveEntity.value?.attributes?.humidity != null)
const hMin = computed(() => liveEntity.value?.attributes?.min_humidity ?? 30)
const hMax = computed(() => liveEntity.value?.attributes?.max_humidity ?? 90)
const humiditySource = computed(() =>
  clampInRange(liveEntity.value?.attributes?.humidity ?? 50, hMin.value, hMax.value, 50),
)

const {
  localValue: humidityLocal,
  rangeValue: humidityRange,
  trackStyle: humidityTrackStyle,
  onInput: onHumidityInput,
  onChange: onHumidityChange,
  commit: commitHumidity,
} = useSliderCommit(humiditySource, {
  onCommit: (val) => setHumidity(val),
  track: () => ({ min: hMin.value, max: hMax.value, step: 1, color: '#38bdf8' }),
})

async function setHumidity(val) {
  await callService(
    'humidifier',
    'set_humidity',
    liveEntity.value.entity_id,
    { humidity: val },
    '设置湿度失败',
  )
}

async function adjustHumidity(delta) {
  const val = humidityLocal.value + delta
  if (val >= hMin.value && val <= hMax.value) await setHumidity(val)
}

async function togglePower() {
  const svc = isOn.value ? 'turn_off' : 'turn_on'
  await callService('humidifier', svc, liveEntity.value.entity_id, undefined, '加湿器开关失败')
}
</script>

<style src="./styles/PopupAccents.css"></style>
