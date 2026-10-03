<!--
组件：SettingsLayoutDisplaySection.vue
所属模块：frontend / src / views / settings / display / layout
职责：显示与缩放区段。配置整页等比缩放开关、侧边栏停靠位置（左/右）、页面最大宽度、
      右侧信息栏宽度，并提供宽度预设与匹配当前屏幕。
关键依赖：
  - SettingsCard / SettingsCardIntro / SettingsSectionHead：卡片与头部
  - SettingsRangeField：滑块输入
  - SETTINGS_RANGE_STEP：滑块步进常量
  - useLayoutStore：读写 layoutConfig
数据来源：layoutStore.layoutConfig（panelPosition / pageMaxWidth / rightPanelWidth）+ 父级透传的缩放派生
-->
<template>
  <div class="settings-hub-section">
    <SettingsCard static :extra-class="scalingEnabled ? 'ldp-scaling-on' : ''">
      <SettingsCardIntro
        :icon="Maximize2"
        :icon-class="scalingEnabled ? 'ldp-ic-on' : 'ldp-ic-off'"
        :orb-class="scalingEnabled ? 'ldp-orb-on' : 'ldp-orb-off'"
        eyebrow="整页等比缩放"
        :description="'以设计基准完整显示并自适应当前窗口（含锁屏、弹窗），无裁切。手机首次启动默认开启；平板默认关闭（户型图改用局部缩放）。'"
      >
        <template #actions>
          <button
            type="button"
            :class="['settings-btn-accent shrink-0', scalingEnabled && 'settings-btn-ghost']"
            @click="$emit('toggle-scaling')"
          >
            {{ scalingEnabled ? '关闭缩放' : '开启缩放' }}
          </button>
        </template>
      </SettingsCardIntro>
      <div v-if="scalingEnabled" class="mt-4 flex flex-wrap items-center gap-3">
        <div
          class="flex items-center gap-1.5 bg-black/40 border ldp-scale-badge rounded-lg px-3 py-1.5"
        >
          <span class="text-xs ldp-c-muted font-bold uppercase tracking-widest">{{
            '当前缩放比'
          }}</span>
          <span class="text-sm font-black ldp-c-indigo font-mono">× {{ scale.toFixed(3) }}</span>
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
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsCardIntro from '@/components/common/page-shell/SettingsCardIntro.vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import SettingsRangeField from '@/views/settings/shared/layout/SettingsRangeField.vue'
import { SETTINGS_RANGE_STEP } from '@/utils/settings/range-steps.util'
import { useLayoutStore } from '@/stores/layout.store'

const layoutStore = useLayoutStore()
const layoutConfig = layoutStore.layoutConfig

// 入参：缩放开关、缩放比、设计宽高、视口宽高、宽度预设、屏幕宽高提示
defineProps({
  scalingEnabled: { type: Boolean, default: false },
  scale: { type: Number, default: 1 },
  activeDesignWidth: { type: Number, required: true },
  designHeight: { type: Number, required: true },
  viewportW: { type: Number, required: true },
  viewportH: { type: Number, required: true },
  widthPresets: { type: Array, default: () => [] },
  screenHint: { type: Number, required: true },
  screenHeightHint: { type: Number, required: true },
})

// 对外事件：切换缩放、应用宽度预设、匹配当前屏幕
defineEmits(['toggle-scaling', 'apply-width-preset', 'auto-match-resolution'])
</script>

<style src="./styles/SettingsLayoutDisplaySection.css"></style>
