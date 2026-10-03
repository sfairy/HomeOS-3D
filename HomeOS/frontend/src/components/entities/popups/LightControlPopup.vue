/**
 * @file LightControlPopup.vue
 * @module components/entities/popups
 * @brief 灯光控制弹窗
 *
 * 职责：
 * - 基于 EntityPopupShell 渲染 light 域控制面板
 * - 提供开/关、亮度调节、色温调节、RGB 颜色拾取（色相+饱和度面板 + 预设色）
 * - 支持渐入时间（transition）配置
 * - 滑动条防抖提交，颜色拾取支持鼠标/触摸/键盘
 *
 * 依赖：
 * - vue、@lucide/vue（Sun/Power 等）
 * - ./EntityPopupShell、./PopupHead
 * - @/composables/entity/useEntityPopupBase、useSliderCommit
 * - 外部样式 ./styles/PopupAccents.css
 */
<template>
  <!-- LightControlPopup 灯光控制弹窗：控制灯光实体，支持亮度、色温、颜色调节 -->
  <EntityPopupShell
    v-if="liveEntity"
    :entity="liveEntity"
    :x-pct="xPct"
    :y-pct="yPct"
    :anchor-x="anchorX"
    :anchor-y="anchorY"
    :width="270"
    :height="popupHeight"
    accent="#fbbf24"
    accent-rgb="251, 191, 36"
    shell-class="popup-shell--narrow"
    @close="$emit('close')"
  >
    <PopupHead :title="entityName" :icon="Sun" :eyebrow="isOn ? '运行中' : '已关闭'" />

    <!-- 电源控制区域 -->
    <div class="popup-section flex justify-between items-center" style="margin-bottom: 14px">
      <span class="text-xs lcp-section-label font-bold uppercase tracking-wider">{{
        '电源状态'
      }}</span>
      <button
        :class="[
          'flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all',
          isOn ? 'lcp-power-on text-black font-bold' : 'lcp-power-off font-medium',
        ]"
        @click.stop="togglePower"
      >
        <Power class="w-3.5 h-3.5" />
        <span class="text-xs uppercase">{{ isOn ? '开启' : '关闭' }}</span>
      </button>
    </div>

    <div class="space-y-3 mb-4">
      <div class="flex justify-between items-center">
        <span class="text-xs lcp-section-label font-bold uppercase tracking-widest">{{
          '亮度'
        }}</span>
        <span class="text-xs lcp-brightness font-mono">{{ brightnessLocal }}%</span>
      </div>
      <div class="px-1">
        <input
          type="range"
          min="1"
          max="100"
          class="slider-range"
          data-no-swipe-close
          aria-label="调节亮度"
          :value="brightnessRange"
          :style="brightnessTrackStyle"
          @input="onBrightnessInput"
          @change="onBrightnessChange"
          @mouseup="commitBrightness"
          @touchend="commitBrightness"
        />
      </div>
    </div>

    <!-- 色温调节区域（仅支持色温但不支持 RGB 的设备） -->
    <div v-if="hasColorTemp && !hasRgb" class="space-y-3 mb-4">
      <div class="flex justify-between items-center">
        <span class="text-xs lcp-section-label font-bold uppercase tracking-widest">{{
          '色温'
        }}</span>
        <div class="text-right leading-tight">
          <span class="text-xs text-white/50 font-mono">{{ colorTempLocal }}K</span>
          <span class="block text-xs lcp-kelvin-range font-mono"
            >{{ minKelvin }}–{{ maxKelvin }}K</span
          >
        </div>
      </div>
      <div class="px-1">
        <input
          type="range"
          :min="minKelvin"
          :max="maxKelvin"
          :step="colorTempStep"
          :value="colorTempRange"
          class="slider-range slider-range--ct"
          data-no-swipe-close
          aria-label="调节色温"
          :style="colorTempTrackStyle"
          @input="onColorTempInput"
          @change="onColorTempChange"
          @mouseup="commitColorTemp"
          @touchend="commitColorTemp"
        />
      </div>
    </div>

    <!-- RGB 颜色选择区域（支持 RGB 的设备） -->
    <div v-if="hasRgb" class="mb-4">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs lcp-section-label font-bold uppercase tracking-widest">{{
          '颜色'
        }}</span>
        <div class="flex items-center gap-2">
          <span
            class="w-3 h-3 rounded-full border border-white/20"
            :style="{ background: `rgb(${rgbColor.r},${rgbColor.g},${rgbColor.b})` }"
          />
          <span class="text-xs text-white/30 font-mono">#{{ hexColor }}</span>
        </div>
      </div>
      <div class="color-picker-area">
        <div
          ref="paletteRef"
          class="color-palette"
          role="slider"
          aria-label="选择灯光颜色"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="hueX"
          :aria-valuetext="`色相 ${hueX}，饱和度 ${satY}`"
          tabindex="0"
          @mousedown="startPickColor"
          @touchstart.prevent="startPickColor"
          @keydown="handlePaletteKeydown"
        >
          <div class="color-palette-bar gradient-hue" />
          <div class="color-palette-bar gradient-sat" />
          <div class="color-picker-thumb" :style="{ left: hueX + '%', top: satY + '%' }" />
        </div>
        <div class="color-presets">
          <button
            v-for="c in colorPresets"
            :key="c"
            class="color-preset-dot"
            :style="{ background: c }"
            @click="applyPresetColor(c)"
          />
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3 pt-1 border-t border-white/5">
      <span class="text-xs lcp-section-label font-bold uppercase tracking-widest shrink-0">{{
        '渐入'
      }}</span>
      <input
        v-model.number="transitionTime"
        type="range"
        min="0"
        max="10"
        step="0.5"
        class="slider-range flex-1"
        :style="transitionTrackStyle"
        @change="applyTransition"
      />
      <span class="text-xs text-white/40 font-mono w-8 text-right">{{ transitionTime }}s</span>
    </div>
  </EntityPopupShell>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 LightControlPopup 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * LightControlPopup - 灯光控制弹窗组件
 * 功能特性：
 * - 控制灯光开关
 * - 调节亮度
 * - 调节色温（支持的设备）
 * - RGB 颜色选择（支持的设备）
 * - 渐入时间设置
 * - 颜色预设
 * - 弹出式面板
 */
import { Sun, Power } from '@lucide/vue'
import EntityPopupShell from '@/components/entities/popups/EntityPopupShell.vue'
import PopupHead from '@/components/entities/popups/PopupHead.vue'
import { defineEntityPopupProps } from '@/composables/entity/useEntityPopupBase'
import { useLightControlPopup } from '@/composables/entity/useLightControlPopup'
import '@/assets/styles/popup-base.css'
import './styles/LightControlPopup.css'

const props = defineProps(defineEntityPopupProps())

defineEmits(['close'])

const {
  liveEntity,
  entityName,
  isOn,
  popupHeight,
  hasRgb,
  hasColorTemp,
  minKelvin,
  maxKelvin,
  colorTempStep,
  colorTempLocal,
  colorTempRange,
  colorTempTrackStyle,
  onColorTempInput,
  onColorTempChange,
  commitColorTemp,
  brightnessLocal,
  brightnessRange,
  brightnessTrackStyle,
  onBrightnessInput,
  onBrightnessChange,
  commitBrightness,
  transitionTime,
  transitionTrackStyle,
  paletteRef,
  hueX,
  satY,
  rgbColor,
  hexColor,
  colorPresets,
  startPickColor,
  handlePaletteKeydown,
  applyPresetColor,
  togglePower,
  applyTransition,
} = useLightControlPopup(props)
</script>

<style src="./styles/PopupAccents.css"></style>
<style scoped>
:deep(.popup-shell) {
  --accent-end: #fb923c;
}
</style>
