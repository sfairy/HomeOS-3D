<!--
  组件文件：WeatherEffectsSceneParamsCard.vue
  所属模块：frontend/src/features/settings/display/weather-effects
  组件职责：天气动效分场景参数微调卡片，按天气类型（晴/多云/雨/雪/雾等）以 Tab 分组
    展示可调参数。每个场景使用 SettingsRangeField 滑块调节粒子密度、强度等数值，并
    提供雨天水洼反光开关；顶部设有「恢复预设」按钮清除当前场景的手动覆盖。
  主要 props / emits：无 props / emits（独立 Card，依赖 composable 上下文）。
  依赖关系：通过 useWeatherEffectsSection composable 获取 activeScene 当前场景、
    sceneTabs 场景 Tab 列表、activeSceneGroup 场景参数组、puddleEnabled 水洼开关、
    getSceneField/setSceneField/hasSceneOverrides/resetScene 参数操作方法。
  注意事项：分场景参数仅持久化手动调整过的项（overrides），其余项始终继承当前预设的
    默认值；切换全局预设会清空所有场景 overrides。
-->
<template>
  <div class="weather-fx-panel-section">
    <SettingsSectionHead
      :title="'分场景特效参数'"
      :description="'按天气类型微调；未改动的项沿用当前预设默认值'"
      bordered
    />

    <div class="weather-scene-dock mt-4">
      <SettingsOrchTabs v-model="activeScene" :tabs="sceneTabs" plain />
    </div>

    <div v-if="activeSceneGroup" class="weather-scene-editor mt-5">
      <div class="weather-scene-editor__head">
        <div class="weather-scene-editor__icon">{{ activeSceneGroup.emoji }}</div>
        <div class="min-w-0">
          <h4 class="text-sm font-bold text-white">{{ activeSceneGroup.label }}</h4>
          <p class="text-[12px] wsp-text-label mt-0.5">{{ activeSceneGroup.desc }}</p>
        </div>
        <button
          v-if="hasSceneOverrides(activeScene)"
          type="button"
          class="weather-scene-reset"
          @click="resetScene(activeScene)"
        >
          {{ '恢复预设' }}
        </button>
      </div>

      <div class="weather-scene-editor__body">
        <SettingsRangeField
          v-for="field in activeSceneGroup.fields"
          :key="field.key"
          :model-value="getSceneField(activeScene, field.key)"
          :label="field.label"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          value-accent="sky"
          :format-display="() => formatSceneField(activeScene, field)"
          @update:model-value="setSceneField(activeScene, field.key, $event)"
        />

        <div
          v-if="activeSceneGroup.hasPuddle"
          class="weather-fx-toggle-row weather-fx-toggle-row--inset"
        >
          <div class="weather-fx-toggle-row__text">
            <span class="text-xs font-bold wsp-text-secondary">{{ '水洼反光' }}</span>
            <span class="text-[12px] wsp-text-label">{{ '地面雨后反光动画' }}</span>
          </div>
          <WeatherEffectsSwitch v-model="puddleEnabled" size="sm" />
        </div>
      </div>
    </div>

    <p class="settings-note-callout settings-note-callout--sky mt-5">
      <span class="settings-note-callout__label">{{ '提示' }}</span>
      <span>{{ '分场景参数仅保存你手动调整过的项；切换预设会重置全部场景覆盖。' }}</span>
    </p>
  </div>
</template>

<script setup>
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import SettingsOrchTabs from '@/features/settings/shared/layout/SettingsOrchTabs.vue'
import SettingsRangeField from '@/features/settings/shared/layout/SettingsRangeField.vue'
import WeatherEffectsSwitch from './WeatherEffectsSwitch.vue'
import { useWeatherEffectsSection } from './context'

const {
  activeScene,
  sceneTabs,
  activeSceneGroup,
  puddleEnabled,
  getSceneField,
  setSceneField,
  formatSceneField,
  hasSceneOverrides,
  resetScene,
} = useWeatherEffectsSection([
  'activeScene',
  'sceneTabs',
  'activeSceneGroup',
  'puddleEnabled',
  'getSceneField',
  'setSceneField',
  'formatSceneField',
  'hasSceneOverrides',
  'resetScene',
])
</script>

<style scoped src="./styles/weather-effects.css"></style>
