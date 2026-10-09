<!--
组件：EditorDataSection.vue
所属模块：frontend / src / views / settings / display / floating
职责：浮动组件编辑器 - 数据绑定区段。关联 HA 实体（entityId）、显示标题、图标显隐，
      并提供自定义颜色（强调色/标题色/数值色）与预设色板。
关键依赖：
  - EntityInput：实体选择
  - useDraftObjectField：草稿字段双向绑定
  - AFH_THEMES / AFH_SEMANTIC_COLOR_PRESETS：主题与语义色预设
  - normalizeHexColor：颜色值规范化
数据来源：父级透传的 afhConfig（双向）/ fw（组件类型）
-->
<script setup>
/**
 * 职责：渲染 views/EditorDataSection 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import { Eye, EyeOff, Palette, Zap } from '@lucide/vue'
import EntityInput from '@/components/common/EntityInput.vue'
import { useDraftObjectField } from '@/features/settings/composables/hub-ui.internals'
import { AFH_THEMES } from '@/features/settings/composables/display/layout-floating.internals'
import {
  AFH_SEMANTIC_COLOR_PRESETS,
  normalizeHexColor,
} from '@/utils/floorplan/floating-entity-colors.util'

// 入参：浮动组件对象（含 type 用于区分实体/ AQI 等）
defineProps({
  fw: { type: Object, required: true },
})

// 双向绑定：AFH 编辑器草稿配置（含 entityId / title / 自定义颜色等）
const afhConfig = defineModel('afhConfig', { type: Object, required: true })

const { field } = useDraftObjectField(() => afhConfig.value)
const entityIdModel = field('entityId')
const titleModel = field('title')
const showIconModel = field('showIcon')
const customColorsEnabledModel = field('customColorsEnabled')
const customColorAccentModel = field('customColorAccent')
const customColorLabelModel = field('customColorLabel')
const customColorValueModel = field('customColorValue')

// 颜色预设列表：语义色预设 + 主题色（排除 auto/neutral）
const colorPresets = computed(() => [
  ...AFH_SEMANTIC_COLOR_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    accent: preset.accent,
  })),
  ...AFH_THEMES.filter((theme) => theme.id !== 'auto' && theme.id !== 'neutral').map((theme) => ({
    id: theme.id,
    label: theme.label,
    accent: theme.accent,
  })),
])

// 颜色选择器输入同步：规范化后写入指定字段
function syncColorFromPicker(fieldKey, event) {
  const next = normalizeHexColor(event.target.value)
  if (!next) return
  afhConfig.value[fieldKey] = next
}

// 应用预设色：写入强调色，标题/数值色为空时一并填充，并启用自定义颜色
function applyPreset(accent) {
  customColorAccentModel.value = accent
  if (!customColorLabelModel.value) customColorLabelModel.value = accent
  if (!customColorValueModel.value) customColorValueModel.value = accent
  customColorsEnabledModel.value = true
}
</script>

<template>
  <div class="afh-section afh-section--data">
    <header class="afh-section__head">
      <div class="afh-section__lead">
        <span class="afh-section__badge afh-section__badge--sky"><Zap /></span>
        <div>
          <h4 class="afh-section__title">{{ '数据绑定' }}</h4>
          <p class="afh-section__desc">{{ '关联 Home Assistant 实体并定制卡片展示' }}</p>
        </div>
      </div>
      <span
        :class="[
          'afh-status-chip',
          afhConfig.entityId ? 'afh-status-chip--sky' : 'afh-status-chip--idle',
        ]"
      >
        {{ afhConfig.entityId ? '已绑定' : '待绑定' }}
      </span>
    </header>

    <div class="afh-form">
      <label class="afh-form__field">
        <span class="afh-form__label">{{
          fw.type === 'entity' ? '实体 ID' : '实体 ID（留空自动发现）'
        }}</span>
        <EntityInput
          v-model="entityIdModel"
          :placeholder="fw.type === 'aqi' ? 'sensor.城市名_aqi' : 'sensor.living_room_temp'"
          input-class="afh-input"
        />
        <p v-if="fw.type === 'aqi'" class="afh-form__hint">
          {{ '约定实体 sensor.{城市名}_aqi；留空则按已绑定 weather.{城市名} 自动匹配' }}
        </p>
      </label>

      <label class="afh-form__field">
        <span class="afh-form__label">{{ '显示标题' }}</span>
        <input
          v-model="titleModel"
          type="text"
          class="afh-input"
          :placeholder="fw.config?.title || '自动'"
        />
        <p class="afh-form__hint">{{ '留空时使用实体友好名称' }}</p>
      </label>

      <div class="afh-form__field">
        <span class="afh-form__label">{{ '显示图标' }}</span>
        <div class="afh-toggle" role="group" :aria-label="'显示图标'">
          <button
            type="button"
            :class="['afh-toggle__opt', showIconModel && 'afh-toggle__opt--active']"
            :aria-pressed="showIconModel"
            @click="showIconModel = true"
          >
            <Eye class="afh-toggle__icon" aria-hidden="true" />
            <span>{{ '显示' }}</span>
          </button>
          <button
            type="button"
            :class="['afh-toggle__opt', !showIconModel && 'afh-toggle__opt--active']"
            :aria-pressed="!showIconModel"
            @click="showIconModel = false"
          >
            <EyeOff class="afh-toggle__icon" aria-hidden="true" />
            <span>{{ '隐藏' }}</span>
          </button>
        </div>
      </div>

      <div v-if="fw.type === 'entity'" class="afh-form__field afh-form__field--colors">
        <span class="afh-form__label">{{ '自定义颜色' }}</span>
        <div class="afh-toggle" role="group" :aria-label="'自定义颜色'">
          <button
            type="button"
            :class="['afh-toggle__opt', !customColorsEnabledModel && 'afh-toggle__opt--active']"
            :aria-pressed="!customColorsEnabledModel"
            @click="customColorsEnabledModel = false"
          >
            <span>{{ '跟随主题' }}</span>
          </button>
          <button
            type="button"
            :class="['afh-toggle__opt', customColorsEnabledModel && 'afh-toggle__opt--active']"
            :aria-pressed="customColorsEnabledModel"
            @click="customColorsEnabledModel = true"
          >
            <Palette class="afh-toggle__icon" aria-hidden="true" />
            <span>{{ '自定义' }}</span>
          </button>
        </div>
        <p class="afh-form__hint">{{ '跟随主题时按电金 / 气橙 / 水青 / 讯紫及设备域自动配色' }}</p>

        <div v-if="customColorsEnabledModel" class="afh-color-editor">
          <div class="afh-color-editor__presets">
            <button
              v-for="preset in colorPresets"
              :key="preset.id"
              type="button"
              class="afh-color-editor__preset"
              :title="preset.label"
              :style="{ '--preset-accent': preset.accent }"
              @click="applyPreset(preset.accent)"
            />
          </div>

          <label class="afh-color-editor__row">
            <span class="afh-color-editor__label">{{ '强调色' }}</span>
            <input
              type="color"
              class="afh-color-editor__picker"
              :value="customColorAccentModel || '#94a3b8'"
              @input="syncColorFromPicker('customColorAccent', $event)"
            />
            <input
              v-model="customColorAccentModel"
              type="text"
              class="afh-input afh-color-editor__hex"
              placeholder="#22d3ee"
            />
          </label>

          <label class="afh-color-editor__row">
            <span class="afh-color-editor__label">{{ '标题色' }}</span>
            <input
              type="color"
              class="afh-color-editor__picker"
              :value="customColorLabelModel || customColorAccentModel || '#94a3b8'"
              @input="syncColorFromPicker('customColorLabel', $event)"
            />
            <input
              v-model="customColorLabelModel"
              type="text"
              class="afh-input afh-color-editor__hex"
              :placeholder="customColorAccentModel || '跟随强调色'"
            />
          </label>

          <label class="afh-color-editor__row">
            <span class="afh-color-editor__label">{{ '数值色' }}</span>
            <input
              type="color"
              class="afh-color-editor__picker"
              :value="customColorValueModel || customColorAccentModel || '#ffffff'"
              @input="syncColorFromPicker('customColorValue', $event)"
            />
            <input
              v-model="customColorValueModel"
              type="text"
              class="afh-input afh-color-editor__hex"
              :placeholder="customColorAccentModel || '跟随强调色'"
            />
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
