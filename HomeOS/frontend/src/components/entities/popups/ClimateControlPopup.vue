/**
 * @file ClimateControlPopup.vue
 * @module components/entities/popups
 *
 * 恒温/空调控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染温控面板（climate 域，含 fan 子类型）
 * - 目标温度调节：± 按钮 + 滑动条（useSliderCommit 防抖提交）
 * - HVAC 模式切换、风速、摆风、预设、双温区设定
 * - 当前温度展示与配色随模式变化
 *
 * 依赖：
 * - @lucide/vue: Fan / Power / Minus / Plus / Thermometer
 * - ./EntityPopupShell / ./PopupHead
 * - @/composables/entity/useEntityPopupBase: defineEntityPopupProps
 * - @/composables/entity/useClimateControlPopup: 全部业务逻辑（温度/模式/风速/摆风/预设）
 *
 * 说明：本组件为纯展示层，所有状态与行为均由 useClimateControlPopup 提供
 */
<template>
  <EntityPopupShell
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="320"
    :height="380"
    accent="#38bdf8"
    accent-rgb="56, 189, 248"
    @close="$emit('close')"
  >
    <!-- 头部：标题 + HVAC 状态文案 + 模式脉冲点（cool/heat 配色） -->
    <PopupHead :title="entityName" :icon="Thermometer">
      <template #status>
        <span :class="stateColor">{{ getHvacStateLabel(liveEntity?.state) }}</span>
        <span
          v-if="liveEntity?.state !== 'off'"
          :class="[
            'popup-status-dot popup-status-dot--pulse',
            liveEntity?.state === 'cool'
              ? 'ccp-state-dot ccp-state-dot--cool'
              : 'ccp-state-dot ccp-state-dot--heat',
          ]"
        />
      </template>
    </PopupHead>

    <!-- 室内当前温度条：仅当存在当前温度且支持目标温度时显示 -->
    <div v-if="currentTemp != null && hasTargetTemp" class="climate-current-bar mb-4">
      <Thermometer class="w-3.5 h-3.5 shrink-0" :class="currentTempTone" />
      <span class="climate-current-bar-label">{{ '室内' }}</span>
      <span class="climate-current-bar-val" :class="currentTempTone">{{ currentTemp }}°C</span>
    </div>

    <!-- 无目标温度场景：仅展示当前温度大数字 -->
    <div v-if="!hasTargetTemp" class="flex flex-col items-center mb-5">
      <span class="text-[44px] font-bold text-white tabular-nums tracking-tighter">{{
        currentTempDisplay
      }}</span>
      <span class="text-xs ccp-lbl font-bold leading-normal pb-px">{{ '当前温度 °C' }}</span>
    </div>
    <!-- 有目标温度场景：± 调节 + 滑动条 + 关闭按钮 -->
    <div v-else class="flex flex-col items-center gap-4 mb-5">
      <div class="flex items-center justify-between w-full px-1">
        <!-- 降低设定温度 -->
        <button
          type="button"
          class="temp-adjust-btn"
          :aria-label="'降低设定温度'"
          @click.stop="adjustTemp(-1)"
        >
          <Minus class="w-5 h-5" />
        </button>
        <div class="flex flex-col items-center">
          <span
            class="text-[44px] font-bold text-white tabular-nums tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >{{ targetTemp }}</span
          >
          <span class="text-xs font-bold ccp-lbl leading-normal pb-px">{{ '设定温度 °C' }}</span>
        </div>
        <!-- 提高设定温度 -->
        <button
          type="button"
          class="temp-adjust-btn"
          :aria-label="'提高设定温度'"
          @click.stop="adjustTemp(1)"
        >
          <Plus class="w-5 h-5" />
        </button>
      </div>
      <!-- 温度滑动条：data-no-swipe-close 阻止滑动关闭冲突 -->
      <div class="w-full px-3">
        <input
          type="range"
          :min="minTemp"
          :max="maxTemp"
          :step="tempStep"
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
      <div class="flex items-center justify-end w-full px-1">
        <!-- 关闭 HVAC：state 切到 off -->
        <button
          type="button"
          :class="[
            'popup-off-btn shrink-0',
            liveEntity?.state === 'off' ? 'ccp-off-btn--active' : 'ccp-off-btn--idle',
          ]"
          @click.stop="setHvacMode('off')"
        >
          <Power class="w-3.5 h-3.5" />
          <span>{{ '关闭' }}</span>
        </button>
      </div>
    </div>
    <!-- HVAC 模式卡片：单行等比排布（制冷/除湿/送风/制热等） -->
    <div v-if="activeHvacModes.length > 0" class="ccp-hvac-modes mb-4">
      <button
        v-for="mode in activeHvacModes"
        :key="mode"
        :class="['mode-card', liveEntity?.state === mode ? modeInfo(mode).activeClass : '']"
        @click.stop="setHvacMode(mode)"
      >
        <component
          :is="modeInfo(mode).icon"
          :class="[
            'w-5 h-5 mb-1 transition-all duration-300',
            liveEntity?.state === mode
              ? modeInfo(mode).iconColor + ' drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]'
              : 'ccp-ic-default',
          ]"
        />
        <span class="text-xs font-bold tracking-wider">{{ modeInfo(mode).label }}</span>
      </button>
    </div>

    <!-- 风速选择：climate 实体支持 fan_modes 时展示 -->
    <div v-if="fanModes.length > 0" class="border-t border-white/[0.05] pt-5 mt-2">
      <div class="flex items-center justify-between mb-3 px-1">
        <span class="text-xs font-bold text-white/40 tracking-widest uppercase">{{
          '风速'
        }}</span>
        <span class="text-xs font-semibold ccp-info-text">{{
          getFanModeLabel(liveEntity?.attributes?.fan_mode)
        }}</span>
      </div>
      <div class="flex flex-wrap justify-center gap-2.5">
        <button
          v-for="mode in fanModes"
          :key="mode"
          :class="['fan-mode-btn', liveEntity?.attributes?.fan_mode === mode ? 'active' : '']"
          @click.stop="setFanMode(mode)"
        >
          {{ getFanModeLabel(mode) }}
        </button>
      </div>
    </div>

    <!-- fan 域（独立风扇）：无 fan_modes 时展示开关按钮，开启时图标旋转 -->
    <div v-else-if="isFan" class="flex justify-center">
      <button
        :class="[
          'flex flex-col items-center justify-center p-5 rounded-full transition-all duration-300 w-[76px] h-[76px]',
          liveEntity?.state === 'on' ? 'ccp-fan-btn--on' : 'ccp-fan-btn--off',
        ]"
        @click.stop="toggleFan"
      >
        <Fan
          :class="[
            'w-8 h-8 mb-1 transition-transform',
            { 'animate-spin': liveEntity?.state === 'on' },
          ]"
          style="animation-duration: 2s"
        />
        <span class="text-xs font-bold uppercase tracking-widest">{{
          liveEntity?.state === 'on' ? '开启' : '关闭'
        }}</span>
      </button>
    </div>
    <!-- 双温区设定：target_temp_low / target_temp_high 同时存在时展示 -->
    <div v-if="hasDualSetpoint" class="border-t border-white/[0.05] pt-4 mb-4">
      <div class="flex items-center justify-between mb-3 px-1">
        <span class="text-xs font-bold text-white/40 tracking-widest uppercase">{{
          '双温区'
        }}</span>
      </div>
      <div class="flex items-center justify-between gap-3 px-1">
        <!-- 低温区 -->
        <div class="flex flex-col items-center gap-1 flex-1">
          <span class="text-xs ccp-lbl uppercase">{{ '低温' }}</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="temp-adjust-btn temp-adjust-btn--sm"
              :aria-label="'降低低温'"
              @click.stop="adjustDualTemp('low', -tempStep)"
            >
              <Minus class="w-4 h-4" />
            </button>
            <span class="text-lg font-bold text-white tabular-nums">{{ dualTempLow }}°</span>
            <button
              type="button"
              class="temp-adjust-btn temp-adjust-btn--sm"
              :aria-label="'提高低温'"
              @click.stop="adjustDualTemp('low', tempStep)"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>
        <!-- 高温区 -->
        <div class="flex flex-col items-center gap-1 flex-1">
          <span class="text-xs ccp-lbl uppercase">{{ '高温' }}</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="temp-adjust-btn temp-adjust-btn--sm"
              :aria-label="'降低高温'"
              @click.stop="adjustDualTemp('high', -tempStep)"
            >
              <Minus class="w-4 h-4" />
            </button>
            <span class="text-lg font-bold text-white tabular-nums">{{ dualTempHigh }}°</span>
            <button
              type="button"
              class="temp-adjust-btn temp-adjust-btn--sm"
              :aria-label="'提高高温'"
              @click.stop="adjustDualTemp('high', tempStep)"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- 摆风模式：swing_modes 存在时展示 -->
    <div v-if="swingModes.length > 0" class="border-t border-white/[0.05] pt-4 mb-2">
      <div class="flex items-center justify-between mb-3 px-1">
        <span class="text-xs font-bold text-white/40 tracking-widest uppercase">{{
          '摆风'
        }}</span>
        <span class="text-xs font-semibold ccp-info-text">{{
          liveEntity?.attributes?.swing_mode || '—'
        }}</span>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <button
          v-for="mode in swingModes"
          :key="mode"
          :class="['fan-mode-btn', liveEntity?.attributes?.swing_mode === mode ? 'active' : '']"
          @click.stop="setSwingMode(mode)"
        >
          {{ mode }}
        </button>
      </div>
    </div>

    <!-- 预设模式：preset_modes 存在且非 fan 域时展示 -->
    <div v-if="presetModes.length > 0 && !isFan" class="border-t border-white/[0.05] pt-4 mt-2">
      <div class="flex items-center justify-between mb-3 px-1">
        <span class="text-xs font-bold text-white/40 tracking-widest uppercase">{{
          '预设'
        }}</span>
        <span class="text-xs font-semibold ccp-preset-text">{{
          getPresetLabel(liveEntity?.attributes?.preset_mode)
        }}</span>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <button
          v-for="p in presetModes"
          :key="p"
          :class="[
            'preset-btn',
            liveEntity?.attributes?.preset_mode === p ? 'preset-btn--active' : '',
          ]"
          @click.stop="setPreset(p)"
        >
          {{ getPresetLabel(p) }}
        </button>
      </div>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 ClimateControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { Fan, Power, Minus, Plus, Thermometer } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps } from '@/composables/entity/useEntityPopupBase'
import { useClimateControlPopup } from '@/composables/entity/useClimateControlPopup'

const props = defineProps(defineEntityPopupProps())

defineEmits(['close'])

// 从 composable 解构全部业务状态与行为：
// - 实体数据：liveEntity / entityName / stateColor
// - 模式与选项：activeHvacModes / fanModes / swingModes / presetModes / isFan / modeInfo
// - 文案映射：getFanModeLabel / getHvacStateLabel / getPresetLabel
// - 目标温度：hasTargetTemp / currentTemp / currentTempDisplay / currentTempTone / targetTemp
//            / minTemp / maxTemp / tempStep / tempRange / tempTrackStyle
//            / onTempInput / onTempChange / commitTemp / adjustTemp / setHvacMode
// - 风扇：setFanMode / toggleFan
// - 双温区：hasDualSetpoint / dualTempLow / dualTempHigh / adjustDualTemp
// - 摆风与预设：setSwingMode / setPreset
const {
  liveEntity,
  entityName,
  stateColor,
  activeHvacModes,
  fanModes,
  swingModes,
  presetModes,
  isFan,
  modeInfo,
  getFanModeLabel,
  getHvacStateLabel,
  hasTargetTemp,
  currentTemp,
  currentTempDisplay,
  currentTempTone,
  targetTemp,
  minTemp,
  maxTemp,
  tempStep,
  tempRange,
  tempTrackStyle,
  onTempInput,
  onTempChange,
  commitTemp,
  adjustTemp,
  setHvacMode,
  setFanMode,
  toggleFan,
  hasDualSetpoint,
  dualTempLow,
  dualTempHigh,
  adjustDualTemp,
  setSwingMode,
  getPresetLabel,
  setPreset,
} = useClimateControlPopup(props)
</script>

<style scoped src="./styles/ClimateControlPopup.css"></style>