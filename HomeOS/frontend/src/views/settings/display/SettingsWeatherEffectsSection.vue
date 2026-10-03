<!--
组件：SettingsWeatherEffectsSection.vue
所属模块：frontend / src / views / settings / display
职责：天气特效区块。链路概览 + 工作区卡（总开关 + Tab + 面板 + 保存）。
      Tab 切换：基础配置、全局参数（粒子密度/风速/星空云层）、分场景参数、调试（仅开发构建）。
关键依赖：
  - SettingsCard / SettingsFlowBand / SettingsFeatureMaster：卡片与总开关
  - SettingsOrchTabs / SettingsRangeField / SettingsSectionHead：Tab 与滑块
  - WeatherEffectsSwitch / WeatherEffectsOverviewCard / WeatherEffectsSceneParamsCard：子组件
  - useWeatherEffectsConfig：天气特效配置表单与保存逻辑
  - WEATHER_EFFECTS_KEY：向子组件 provide 配置
数据来源：useWeatherEffectsConfig 派生（最终来自系统配置 + layoutConfig.debugMode）
-->
<template>
  <div class="settings-hub-section weather-effects-hub">
    <SettingsCard full static extra-class="weather-fx-overview-card">
      <SettingsFlowBand
        :steps="weatherFxFlowSteps"
        class="weather-fx-flow-band"
        band-class="weather-fx-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="特效流程"
        :collapsed-summary="weatherFxFlowSummary"
      />
    </SettingsCard>

    <SettingsCard full static extra-class="weather-fx-workspace-card">
      <SettingsFeatureMaster
        class="settings-feature-master--inset"
        :icon="CloudRain"
        tone="sky"
        :active="form.enabled"
        :title="'启用天气场景背景特效'"
        :hint="
          form.enabled
            ? '保存后立即生效（公开配置热更新）'
            : '关闭后首页不再渲染雨雪云雾等动态特效'
        "
      >
        <template #actions>
          <WeatherEffectsSwitch v-model="form.enabled" />
        </template>
      </SettingsFeatureMaster>

      <div class="weather-fx-workspace-card__tabs">
        <SettingsOrchTabs v-model="activePanel" :tabs="panelTabs" plain />
      </div>

      <div class="weather-fx-workspace-card__body">
        <div v-show="activePanel === 'overview'" class="weather-fx-workspace-card__panel">
          <WeatherEffectsOverviewCard />
        </div>

        <div v-show="activePanel === 'global'" class="weather-fx-workspace-card__panel">
          <div class="weather-fx-panel-section">
            <SettingsSectionHead
              :title="'全局渲染参数'"
              :description="'粒子密度、风速倍率与星空 / 云层基础配置'"
              bordered
            />

            <div class="settings-slider-group mt-5">
              <SettingsRangeField
                v-for="s in globalSliders"
                :key="s.key"
                v-model="form[s.key]"
                :label="s.label"
                :min="s.min"
                :max="s.max"
                :step="s.step"
                :unit="s.unit || ''"
                :hint="s.hint"
                value-accent="sky"
              />
            </div>
          </div>
        </div>

        <div v-show="activePanel === 'scenes'" class="weather-fx-workspace-card__panel">
          <WeatherEffectsSceneParamsCard />
        </div>

        <div
          v-if="isDevBuild"
          v-show="activePanel === 'debug'"
          class="weather-fx-workspace-card__panel"
        >
          <div class="weather-fx-panel-section weather-fx-debug-panel">
            <SettingsSectionHead
              :icon="Eye"
              icon-class="wd-icon-warn"
              orb-class="wd-orb-warn"
              eyebrow="调试工具"
              title="开发调试"
              :description="'开发构建专用：开启后主屏显示气象测试条与边界辅助；可一键跳转总览预览各天气场景。'"
              bordered
            />

            <button
              type="button"
              :class="[
                'weather-debug-toggle',
                layoutStore.layoutConfig.debugMode && 'weather-debug-toggle--on',
              ]"
              @click="layoutStore.layoutConfig.debugMode = !layoutStore.layoutConfig.debugMode"
            >
              {{ layoutStore.layoutConfig.debugMode ? '调试工具已显现' : '调试工具已隐藏' }}
            </button>

            <div class="weather-debug-preview">
              <div class="weather-debug-preview__head">
                <h4 class="text-sm font-bold text-white">{{ '天气特效预览' }}</h4>
                <p class="text-[12px] wd-text-label mt-0.5">
                  {{ '跳转总览页并切换调试天气状态，实时查看背景特效。' }}
                </p>
              </div>
              <div class="weather-debug-preview__actions">
                <button
                  v-for="w in weatherPreviewStates"
                  :key="w.id"
                  type="button"
                  class="weather-debug-preview__btn"
                  @click="previewWeatherEffect(w.id)"
                >
                  {{ w.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-connection-actions weather-fx-workspace-card__footer">
          <div class="settings-connection-actions__btns">
            <button type="button" class="settings-btn-primary" :disabled="saving" @click="save">
              {{ saving ? '保存中…' : '保存天气特效配置' }}
            </button>
            <button type="button" class="settings-btn-ghost" @click="resetToDefaults">
              {{ '恢复默认' }}
            </button>
          </div>
        </div>
      </div>
    </SettingsCard>
  </div>
</template>

<script setup>
import { provide, ref, computed } from 'vue'
import { CloudRain, Eye, Map, Monitor, SlidersHorizontal, Sparkles } from '@lucide/vue'
import { isDevBuild } from '@/utils/core/misc.util'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsSectionHead from '@/views/settings/shared/layout/SettingsSectionHead.vue'
import SettingsOrchTabs from '@/views/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsRangeField from '@/views/settings/shared/layout/SettingsRangeField.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFeatureMaster from '@/views/settings/shared/layout/SettingsFeatureMaster.vue'
import { useWeatherEffectsConfig } from '@/composables/settings/hub-backup-orchestrator.internals'
import { useRegisterSettingsTabPending } from '@/composables/settings/pending.internals'
import { useLayoutStore } from '@/stores/layout.store'
import { WEATHER_EFFECTS_KEY } from './weather-effects/context'
import WeatherEffectsSwitch from './weather-effects/WeatherEffectsSwitch.vue'
import WeatherEffectsOverviewCard from './weather-effects/WeatherEffectsOverviewCard.vue'
import WeatherEffectsSceneParamsCard from './weather-effects/WeatherEffectsSceneParamsCard.vue'

const config = useWeatherEffectsConfig()
provide(WEATHER_EFFECTS_KEY, config)

const layoutStore = useLayoutStore()
const {
  form,
  presetOptions,
  routeSummary,
  globalSliders,
  saving,
  isDirty,
  save,
  resetToDefaults,
  weatherPreviewStates,
  previewWeatherEffect,
} = config

// 注册 general Tab 的待保存状态（用于全局待保存指示器）
useRegisterSettingsTabPending('general', () => isDirty.value)
// 当前激活的面板 Tab
const activePanel = ref('overview')

// 面板 Tab 配置（开发构建额外追加调试 Tab）
const panelTabs = computed(() => {
  const tabs = [
    { id: 'overview', label: '基础配置', emoji: '🎛️', accent: 'var(--module-accent-devices)' },
    { id: 'global', label: '全局参数', emoji: '⚙️', accent: 'var(--module-accent-layout-sub)' },
    { id: 'scenes', label: '分场景', emoji: '🌈', accent: 'var(--module-accent-layout)' },
  ]
  if (isDevBuild) {
    tabs.push({ id: 'debug', label: '调试', emoji: '🔧', accent: 'var(--module-accent-automation)' })
  }
  return tabs
})

// 当前预设档位标签
const presetLabel = computed(
  () => presetOptions.find((p) => p.id === form.value.preset)?.label || form.value.preset,
)

// 特效流程步骤：总开关 → 预设档位 → 显示范围 → 场景参数 → 大屏背景
const weatherFxFlowSteps = computed(() => [
  {
    label: '总开关',
    meta: form.value.enabled ? '已启用' : '已关闭',
    icon: CloudRain,
    tone: 'in',
  },
  {
    label: '预设档位',
    meta: presetLabel.value || '默认',
    icon: SlidersHorizontal,
    tone: 'sky',
  },
  {
    label: '显示范围',
    meta: routeSummary.value || '路由',
    icon: Map,
    tone: 'mid',
  },
  {
    label: '场景参数',
    meta: '粒子 / 风速',
    icon: Sparkles,
    tone: 'exec',
  },
  {
    label: '大屏背景',
    meta: '即时热更新',
    icon: Monitor,
    tone: 'out',
  },
])

// 特效流程折叠态摘要文案
const weatherFxFlowSummary = computed(() =>
  form.value.enabled
    ? `已启用 · ${presetLabel.value || '默认'}`
    : '已关闭 · 首页不渲染动态特效',
)
</script>
<style src="./weather-effects/styles/weather-effects.css"></style>
