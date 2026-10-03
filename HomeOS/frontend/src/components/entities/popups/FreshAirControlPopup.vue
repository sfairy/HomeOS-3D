/**
 * @file FreshAirControlPopup.vue
 * @module components/entities/popups
 *
 * 全热交换器 / 新风控制弹窗
 * 功能：开关、风速（± / 滑杆 / 七档）、运行模式
 * 宽度与空调/加湿器弹窗对齐（320）
 */
<template>
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="492"
    shell-class="fap-shell"
    accent="#22d3ee"
    accent-rgb="34, 211, 238"
    @close="$emit('close')"
  >
    <div class="fap" :class="isOn ? 'fap--on' : 'fap--off'">
      <PopupHead :title="entityName" :icon="Wind" subtitle="全热交换器">
        <template #actions>
          <span :class="isOn ? 'fap-state--on' : 'fap-state--off'">
            {{ isOn ? '运行中' : '已关闭' }}
          </span>
        </template>
      </PopupHead>

      <!-- 风速：当前档 + 微调 + 滑杆 + 七档 -->
      <section v-if="hasPercentage" class="fap-block">
        <ApplianceValueStepper
          :value="isOn ? displayGearName : '待机'"
          :label="isOn ? speedPercentLabel : ''"
          label-class="fap-lbl"
          decrease-label="降低风速"
          increase-label="提高风速"
          @decrease="nudgeSpeed(-1)"
          @increase="nudgeSpeed(1)"
        />
        <div class="fap-meter" aria-hidden="true">
          <span
            v-for="n in 6"
            :key="n"
            :class="['fap-meter__bar', meterLit(n) ? 'fap-meter__bar--on' : '']"
          />
        </div>
        <div class="fap-slider-wrap">
          <input
            type="range"
            min="0"
            max="100"
            :step="speedStep"
            :value="speedRange"
            class="temp-slider"
            data-no-swipe-close
            :style="speedTrackStyle"
            @input="onSpeedInput"
            @change="onSpeedChange"
            @mouseup="commitSpeed"
            @touchend="commitSpeed"
          />
        </div>
        <div
          v-if="speedLevels.length > 1"
          class="fap-gears"
          role="listbox"
          aria-label="风速档位"
        >
          <button
            v-for="level in speedLevels"
            :key="level.index"
            type="button"
            role="option"
            :aria-selected="isOn && activeGearIndex === level.index"
            :class="[
              'fap-gear',
              isOn && activeGearIndex === level.index ? 'fap-gear--on' : '',
            ]"
            @click.stop="setSpeedGear(level.pct)"
          >
            {{ level.label }}
          </button>
        </div>
      </section>

      <section v-else class="fap-empty">
        <Fan :class="['fap-empty__icon', { 'fap-empty__icon--spin': isOn }]" />
        <span>{{ isOn ? '换气中' : '待机' }}</span>
      </section>

      <!-- 运行模式 -->
      <section v-if="presetMode && !presetModes.length" class="fap-mode-line">
        <span>运行模式</span>
        <strong>{{ presetMode }}</strong>
      </section>

      <section v-if="presetModes.length" class="fap-block">
        <div class="fap-block__head">
          <span>运行模式</span>
          <strong v-if="presetMode">{{ presetMode }}</strong>
        </div>
        <div class="fap-modes">
          <button
            v-for="mode in presetModes"
            :key="mode"
            type="button"
            :class="['fap-mode', presetMode === mode ? 'fap-mode--on' : '']"
            @click.stop="setPreset(mode)"
          >
            {{ mode }}
          </button>
        </div>
      </section>

      <div class="fap-toolbar">
        <button
          type="button"
          :class="['popup-off-btn', isOn ? 'fap-off--idle' : 'fap-off--active']"
          @click.stop="togglePower"
        >
          <Power class="w-3.5 h-3.5" />
          <span>{{ isOn ? '关闭' : '开机' }}</span>
        </button>
      </div>
    </div>
  </EntityPopupShell>
</template>

<script setup lang="ts">
/**
 * 所属模块：frontend/components
 * 职责：实现 FreshAirControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { Fan, Power, Wind } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import ApplianceValueStepper from '@/components/entities/popups/ApplianceValueStepper.vue'
import { defineEntityPopupProps } from '@/composables/entity/useEntityPopupBase'
import { useFreshAirControlPopup } from '@/composables/entity/useFreshAirControlPopup'

const props = defineProps(defineEntityPopupProps())
defineEmits(['close'])

const {
  liveEntity,
  entityName,
  isOn,
  speedLevels,
  speedStep,
  activeGearIndex,
  displayGearName,
  speedPercentLabel,
  speedRange,
  speedTrackStyle,
  onSpeedInput,
  onSpeedChange,
  commitSpeed,
  hasPercentage,
  presetMode,
  presetModes,
  togglePower,
  setSpeedGear,
  nudgeSpeed,
  setPreset,
} = useFreshAirControlPopup(props)

/** 强度条：自动不亮；微风起逐级点亮 1–6 */
function meterLit(n: number): boolean {
  if (!isOn.value) return false
  const idx = activeGearIndex.value
  if (idx <= 0) return false
  return n <= idx
}
</script>

<style scoped src="./styles/FreshAirControlPopup.css"></style>
