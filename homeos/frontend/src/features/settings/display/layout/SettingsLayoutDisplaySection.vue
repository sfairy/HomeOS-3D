<!--
  显示与缩放区段。配置整页等比缩放开关、侧边栏停靠位置（左/右）、页面最大宽度、
  右侧信息栏宽度，并提供宽度预设与匹配当前屏幕。
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard static :extra-class="scalingEnabled ? 'ldp-scaling-on' : ''">
      <SettingsCardIntro
        :icon="Maximize2"
        :icon-class="scalingEnabled ? 'ldp-ic-on' : 'ldp-ic-off'"
        :orb-class="scalingEnabled ? 'ldp-orb-on' : 'ldp-orb-off'"
        eyebrow="整页等比缩放"
        :description="'以设计基准完整显示并自适应当前窗口（含锁屏、弹窗）。画布始终等比缩放到刚好铺满窗口，不会出现滚动条；窗口很窄时字号会同比变小。平板默认关闭（户型图改用局部缩放）。'"
      >
        <template #actions>
          <button
            type="button"
            :class="['settings-btn-accent shrink-0', scalingEnabled && 'settings-btn-ghost']"
            :title="scalingTooNarrow ? `当前窗口 ${viewportW}×${viewportH} 完整显示需 ×${requiredScale.toFixed(3)}，低于建议的 ×${MIN_SCALE}，文字会明显变小` : ''"
            @click="$emit('toggle-scaling')"
          >
            {{ scalingEnabled ? '关闭缩放' : '开启缩放' }}
          </button>
        </template>
      </SettingsCardIntro>
      <p
        v-if="scalingTooNarrow"
        class="mt-3 text-xs ldp-c-warn leading-relaxed"
        role="note"
      >
        当前窗口 {{ viewportW }}×{{ viewportH }}px 完整显示设计基准需 ×{{ requiredScale.toFixed(3) }}，低于建议的可读比例 ×{{ MIN_SCALE }}；开启后会按 ×{{ requiredScale.toFixed(3) }} 渲染，内容仍能完整显示，但文字会明显变小。
      </p>
      <p v-else-if="clampHint" class="mt-3 text-xs ldp-c-warn leading-relaxed" role="note">
        {{ clampHint }}
      </p>
      <div v-if="scalingEnabled" class="mt-4 flex flex-wrap items-center gap-3">
        <div
          class="flex items-center gap-1.5 bg-black/40 border ldp-scale-badge rounded-lg px-3 py-1.5"
        >
          <span class="text-xs ldp-c-muted font-bold uppercase tracking-widest">{{
            '当前缩放比'
          }}</span>
          <span class="text-sm font-black ldp-c-indigo font-mono">× {{ scale.toFixed(3) }}</span>
          <span v-if="scalingEnabled && scaleClamped" class="text-[11px] font-bold ldp-c-warn"
            >字号偏小</span
          >
        </div>
        <div
          class="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5"
        >
          <span class="text-xs ldp-c-muted font-bold uppercase tracking-widest">{{
            '内容区'
          }}</span>
          <span class="text-sm font-black ldp-c-text font-mono"
            >{{ activeDesignWidth }}×{{ designHeight }}</span
          >
        </div>
        <div
          class="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5"
        >
          <span class="text-xs ldp-c-muted font-bold uppercase tracking-widest">{{
            '实际渲染'
          }}</span>
          <span class="text-sm font-black ldp-c-text font-mono"
            >{{ viewportW }}×{{ viewportH }}</span
          >
        </div>
      </div>
      <div v-if="!scalingEnabled" class="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
        <Info class="w-3.5 h-3.5 ldp-c-faint shrink-0" />
        <p class="text-xs ldp-c-muted leading-relaxed">
          {{ '关闭时页面按「最大宽度」自然铺满。适合超宽显示器；平板可用户型图局部缩放，需要整屏等比时再开启。' }}
        </p>
      </div>
    </SettingsCard>

    <SettingsCard full static>
      <SettingsSectionHead
        :title="'布局尺寸与停靠'"
        :description="'控制侧边栏位置、页面最大宽度与右侧信息栏宽度'"
        bordered
      />

      <div class="mt-5 space-y-5">
        <div>
          <label class="settings-form-label mb-2">{{ '侧边功能区停靠位置' }}</label>
          <div class="flex gap-2">
            <button
              :class="[
                'flex-1 py-3 border rounded-xl font-bold transition-all text-sm',
                layoutConfig.panelPosition === 'right'
                  ? 'ldp-pos-btn--active'
                  : 'ldp-pos-btn--idle',
              ]"
              @click="layoutConfig.panelPosition = 'right'"
            >
              {{ '停靠在屏幕右侧 (默认)' }}
            </button>
            <button
              :class="[
                'flex-1 py-3 border rounded-xl font-bold transition-all text-sm',
                layoutConfig.panelPosition === 'left' ? 'ldp-pos-btn--active' : 'ldp-pos-btn--idle',
              ]"
              @click="layoutConfig.panelPosition = 'left'"
            >
              {{ '停靠在屏幕左侧' }}
            </button>
          </div>
        </div>

        <div class="settings-slider-group mt-5">
          <SettingsRangeField
            v-model="layoutConfig.pageMaxWidth"
            :label="'中控页面最大宽度'"
            :min="1024"
            :max="3840"
            :step="SETTINGS_RANGE_STEP.layoutWidth"
            unit="px"
            input-wide
          >
            <div class="flex flex-wrap gap-2 mt-3">
              <button
                v-for="preset in widthPresets"
                :key="preset.w"
                type="button"
                class="settings-btn-ghost text-[12px] px-3 py-1.5"
                @click="$emit('apply-width-preset', preset.w)"
              >
                {{ preset.label }}
              </button>
              <button
                type="button"
                class="settings-btn-accent text-[12px] px-3 py-1.5"
                @click="$emit('auto-match-resolution')"
              >
                {{
                  '匹配当前屏幕 ({w}×{h})'
                    .replace('{w}', String(screenHint))
                    .replace('{h}', String(screenHeightHint))
                }}
              </button>
            </div>
            <p class="text-xs ldp-c-muted mt-2">
              {{
                '平板推荐 1366×1024。可点「匹配当前屏幕」同步宽度与缩放基准高度，减少宽高比失配。'
              }}
            </p>
          </SettingsRangeField>

          <SettingsRangeField
            v-model="layoutConfig.rightPanelWidth"
            :label="'主页右侧信息栏宽度'"
            :min="200"
            :max="500"
            :step="SETTINGS_RANGE_STEP.panelPx"
            unit="px"
            input-wide
          >
            <p class="text-xs ldp-c-muted mt-2">
              {{ '即主页右边时间/天气部件、图表占用的宽度。放大可容纳更宽图表，但会挤压户型图。' }}
            </p>
          </SettingsRangeField>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { Maximize2, Info } from '@lucide/vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/settings-page-shell/SettingsCardIntro.vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import SettingsRangeField from '@/features/settings/shared/layout/SettingsRangeField.vue'
import { MIN_SCALE } from '@/composables/ui/useScaling'
import { computed } from 'vue'
import { SETTINGS_RANGE_STEP } from '@/shared/utils/settings/range-steps.util'
import { useLayoutStore } from '@/stores/layout.store'

const layoutStore = useLayoutStore()
const layoutConfig = layoutStore.layoutConfig

const props = defineProps({
  scalingEnabled: { type: Boolean, default: false },
  scale: { type: Number, default: 1 },
  scaleClamped: { type: Boolean, default: false },
  activeDesignWidth: { type: Number, required: true },
  designHeight: { type: Number, required: true },
  viewportW: { type: Number, required: true },
  viewportH: { type: Number, required: true },
  widthPresets: { type: Array, default: () => [] },
  screenHint: { type: Number, required: true },
  screenHeightHint: { type: Number, required: true },
})

/**
 * 当前窗口完整显示设计稿所需的原始缩放比（未封顶、未触底）。
 * 判定「是否触底」必须用这个比值，而不是固定宽度：1920×500 这类宽而矮的窗口
 * 宽度远超 768，纵向却严重触底；竖屏平板同理。反之很窄但很高的窗口也未必触底。
 */
const requiredScale = computed(() =>
  Math.min(props.viewportW / props.activeDesignWidth, props.viewportH / props.designHeight),
)

/**
 * 开启后缩放比会低于可读性警戒线（文字明显变小）。
 *
 * 只用于**提示**，不再禁用按钮：这条线只影响可读性，不影响「能否完整显示」，
 * 更不是不可用。早期版本在这里 `:disabled`，结果在 1241×765 这类常见笔记本窗口上
 * 按钮变灰 —— 用户一旦关掉缩放就再也开不回来。
 */
const scalingTooNarrow = computed(() => {
  if (props.scalingEnabled) return false
  const required = requiredScale.value
  if (!Number.isFinite(required) || required <= 0) return false
  return required < MIN_SCALE
})

/**
 * 可读性提示：区分「尚未开启但开启后字会很小」与「已开启且字很小」。
 *
 * 「始终完整显示」策略下不存在触底/滚动，这里的提示只解释字号代价，
 * 不再暗示内容会被裁切或被推到视口外。
 */
const clampHint = computed(() => {
  const required = requiredScale.value
  if (!Number.isFinite(required) || required <= 0) return ''
  if (!props.scalingEnabled) {
    if (required >= MIN_SCALE) return ''
    return `当前窗口 ${props.viewportW}×${props.viewportH} 对设计基准 ${props.activeDesignWidth}×${props.designHeight} 需要 ×${required.toFixed(3)} 才能完整显示，低于建议的可读比例 ×${MIN_SCALE}；开启后按 ×${required.toFixed(3)} 渲染，内容仍完整可见，但文字会明显变小。`
  }
  if (!props.scaleClamped) return ''
  return `当前缩放比 ×${required.toFixed(3)} 低于建议的可读比例 ×${MIN_SCALE}：画布仍完整显示在窗口内，但正文会被压到 8px 以下。`
})

defineEmits(['toggle-scaling', 'apply-width-preset', 'auto-match-resolution'])
</script>

<style src="./styles/SettingsLayoutDisplaySection.css"></style>
