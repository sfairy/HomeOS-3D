/**
 * @file WaterDispenserPopup.vue
 * @module components/entities/popups
 * @brief 管线饮水机控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染饮水机控制面板
 * - 出水温度调节、出水量档位选择、模式切换、童锁控制、开关机
 * - 通过 useApplianceSiblings 关联同设备兄弟实体
 *
 * 依赖：
 * - vue（computed）、@lucide/vue（Power/Lock/Droplets）
 * - ./EntityPopupShell、./PopupHead、./ApplianceValueStepper
 * - @/composables/entity/useEntityPopupBase、useApplianceSiblings、useSliderCommit
 * - @/utils/ui/progress-bar.util、@/utils/entity/derived.util、@homeos/shared
 */
<template>
  <!-- WaterDispenserPopup 饮水机弹窗：控制饮水机 -->
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="400"
    accent="#22d3ee"
    accent-rgb="34, 211, 238"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="Droplets">
      <template #status>
        <span :class="isOn ? 'wdp-state-on' : 'wdp-state-off'">{{
          isOn ? '运行中' : '已关闭'
        }}</span>
        <span
          v-if="isOn"
          class="popup-status-dot popup-status-dot--pulse wdp-state-dot wdp-state-dot--on"
        />
      </template>
    </PopupHead>

    <div class="flex flex-col items-center gap-5 mb-5" v-if="tempNumber">
      <ApplianceValueStepper
        :value="tempLocal"
        label="出水温度 °C"
        label-class="wdp-lbl"
        decrease-label="降低出水温度"
        increase-label="提高出水温度"
        @decrease="adjustTemp(-1)"
        @increase="adjustTemp(1)"
      />

      <div class="w-full px-3">
        <input
          type="range"
          :min="tempNumMin"
          :max="tempNumMax"
          step="1"
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
    </div>

    <div v-if="amountNumber" class="mb-4 px-1">
      <span class="text-xs font-bold text-white/40 tracking-widest uppercase block mb-2">{{
        '出水量'
      }}</span>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="a in amountPresets"
          :key="a.value"
          :class="['wh-pill', amountNumber.state === a.value ? 'wh-pill--active' : '']"
          @click.stop="setAmount(a.value)"
        >
          {{ a.label }}
        </button>
      </div>
    </div>

    <div v-if="childSelects.length > 0" class="border-t border-white/[0.05] pt-4 mb-3">
      <div v-for="sel in childSelects" :key="sel.entity_id" class="mb-2 px-1">
        <span class="text-xs font-bold text-white/40 tracking-widest uppercase block mb-1.5">{{
          sel.name
        }}</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="opt in sel.options"
            :key="opt"
            :class="['wh-pill', sel.current === opt ? 'wh-pill--active' : '']"
            @click.stop="setSelectOption(sel, opt)"
          >
            {{ opt }}
          </button>
        </div>
      </div>
    </div>

    <div class="flex items-center justify-between px-1">
      <button
        v-if="childLockSwitch"
        :class="[
          'popup-off-btn shrink-0',
          childLockSwitch.isOn ? 'wdp-lock-btn--on' : 'wdp-lock-btn--off',
        ]"
        @click.stop="toggleSwitch(childLockSwitch)"
      >
        <Lock class="w-3.5 h-3.5" />
        <span>{{ childLockSwitch.isOn ? '童锁开' : '童锁关' }}</span>
      </button>
      <div v-else />
      <button
        :class="['popup-off-btn shrink-0', !isOn ? 'wdp-off-btn--active' : 'wdp-off-btn--idle']"
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
 * 职责：实现 WaterDispenserPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * WaterDispenserPopup - 饮水机弹窗组件
 * 功能特性：
 * - 控制饮水机开关
 * - 温度设置
 * - 显示状态
 * - 弹出式面板
 */
import { getEntityDomain } from '@homeos/shared'
/**
 * 管线机控制弹窗组件
 *
 * 提供管线饮水机的控制功能：
 * 1. **出水温度** — 调节出水目标温度
 * 2. **出水量** — 选择出水量档位
 * 3. **模式选择** — 设备模式切换
 * 4. **童锁** — 安全锁控制
 * 5. **开关机** — 一键开关
 */
import { computed } from 'vue'
import { Power, Lock, Droplets } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import ApplianceValueStepper from '@/components/entities/popups/ApplianceValueStepper.vue'
import { defineEntityPopupProps, useEntityPopupBase } from '@/composables/entity/useEntityPopupBase'
import { useApplianceSiblings } from '@/composables/entity/useApplianceSiblings'
import { useSliderCommit } from '@/composables/entity/useSliderCommit'
import { clampInRange } from '@/utils/ui/progress-bar.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

const props = defineProps(defineEntityPopupProps())

defineEmits(['close'])

const { liveEntity, entityRef, callService } = useEntityPopupBase(props)
const { findNumber, findSwitch, findSelects } = useApplianceSiblings(entityRef)

const entityName = computed(() =>
  getEntityDisplayName(liveEntity.value?.entity_id ?? '', liveEntity.value),
)

const isOn = computed(() => {
  const s = liveEntity.value?.state
  return s !== 'off' && s !== 'unavailable' && s != null
})

const tempNumber = computed(() => findNumber(['温度', 'temp', '水温']))

const tempNumMin = computed(() => tempNumber.value?.attributes?.min ?? 25)
const tempNumMax = computed(() => tempNumber.value?.attributes?.max ?? 100)

const tempSource = computed(() => {
  const n = parseFloat(tempNumber.value?.state)
  return clampInRange(Number.isNaN(n) ? 45 : n, tempNumMin.value, tempNumMax.value, 45)
})

const {
  localValue: tempLocal,
  rangeValue: tempRange,
  trackStyle: tempTrackStyle,
  onInput: onTempInput,
  onChange: onTempChange,
  commit: commitTemp,
} = useSliderCommit(tempSource, {
  parse: (v) => parseFloat(v),
  onCommit: (val) => setTemp(val),
  track: () => ({ min: tempNumMin.value, max: tempNumMax.value, step: 1, color: '#22d3ee' }),
})

const amountNumber = computed(() => {
  const sib = findNumber(['水量', '出水量', 'volume', 'amount'])
  return sib ? { entity_id: sib.entity_id, state: sib.state } : null
})

const amountPresets = [
  { value: 150, label: '150ml' },
  { value: 250, label: '250ml' },
  { value: 500, label: '500ml' },
  { value: 1000, label: '1000ml' },
]

const childLockSwitch = computed(() => findSwitch(['童锁', 'child', 'lock', '安全锁']))
const childSelects = computed(() => findSelects())

async function setTemp(val) {
  if (!tempNumber.value) return
  const v = clampInRange(val, tempNumMin.value, tempNumMax.value, tempLocal.value)
  await callService('number', 'set_value', tempNumber.value.entity_id, { value: v }, '设置温度失败')
}

async function adjustTemp(delta) {
  await setTemp(tempLocal.value + delta)
}

async function setAmount(val) {
  if (!amountNumber.value) return
  await callService(
    'number',
    'set_value',
    amountNumber.value.entity_id,
    { value: val },
    '设置出水量失败',
  )
}

async function setSelectOption(sel, option) {
  await callService('select', 'select_option', sel.entity_id, { option }, '切换选项失败')
}

async function toggleSwitch(sw) {
  const svc = sw.isOn ? 'turn_off' : 'turn_on'
  await callService('switch', svc, sw.entity_id, undefined, '开关失败')
}

async function togglePower() {
  const domain = getEntityDomain(liveEntity.value.entity_id) || 'switch'
  const svc = isOn.value ? 'turn_off' : 'turn_on'
  await callService(domain, svc, liveEntity.value.entity_id, undefined, '管线机开关切换失败')
}
</script>

<style scoped src="./styles/WaterDispenserPopup.css"></style>
