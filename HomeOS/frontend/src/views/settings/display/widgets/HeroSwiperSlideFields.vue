<!--
  组件文件：HeroSwiperSlideFields.vue
  所属模块：frontend/src/views/settings/display/widgets
  组件职责：Hero 三页联动配置的单 Slide 内部字段编辑子组件，根据当前激活 Slide 的
    type 渲染对应的配置表单：卡片类型分组下拉、Hub Tab 配置、历史预设段、自定义 HTML
    文本域、全屋温湿度图表内嵌字段、温度曲线图与开关快捷键实体多选。
  主要 props / emits：
    - props activeSlide：当前幻灯片对象（id/type/config）
    - props slideGroups：卡片类型分组下拉数据
    - props activeHubTabSet / activePresetOptions：Hub Tab 集合与历史预设集合
    - props climateChartViewOptions：温湿度图表视图选项
    - defineModel slideTabDraft / climateTempEntities / climateHumEntities /
      tempChartSensors / switchShortcutEntities：五组双向绑定草稿字段
    - emit type-select：选中卡片类型时触发，payload 为 type id
    - emit set-config-field：修改历史预设/默认视图等配置字段，payload (field, value)
    - emit html-input：自定义 HTML 文本域输入事件
  依赖关系：引用 SettingsGroupedSelect、EntityMultiSelect、HubTabsConfigField 等子组件。
  注意事项：temperatureChart 的传感器字段在内部桥接为逗号分隔字符串；对缺失的 config
    字段使用空字符串兜底避免报错。
-->
<template>
  <div v-if="activeSlide" class="hero-swiper-config__fields">
    <div class="hero-swiper-config__field">
      <label class="settings-form-label">{{ '卡片类型' }}</label>
      <SettingsGroupedSelect
        :model-value="activeSlide.type"
        :groups="slideGroups"
        placeholder="选择卡片类型"
        search-placeholder="搜索卡片类型…"
        :min-width="280"
        :max-height="360"
        @select="$emit('type-select', $event)"
      />
    </div>

    <div v-if="activeHubTabSet" class="hero-swiper-config__field">
      <HubTabsConfigField v-model="slideTabDraft" :tab-set="activeHubTabSet" />
    </div>

    <div v-else-if="activePresetOptions" class="hero-swiper-config__field">
      <label class="settings-form-label">{{ '历史类型' }}</label>
      <div class="hero-swiper-config__segments">
        <button
          v-for="preset in activePresetOptions"
          :key="preset.id"
          type="button"
          :class="[
            'hero-swiper-config__segment',
            activeSlide.config?.preset === preset.id && 'hero-swiper-config__segment--active',
          ]"
          @click="$emit('set-config-field', 'preset', preset.id)"
        >
          {{ preset.label }}
        </button>
      </div>
    </div>

    <div v-else-if="activeSlide.type === 'customHtml'" class="hero-swiper-config__field">
      <label class="settings-form-label">{{ 'HTML 内容' }}</label>
      <textarea
        :value="String(activeSlide.config?.rawHtml ?? '')"
        rows="5"
        class="settings-field resize-y font-mono text-xs hsf-html-input min-h-[5rem]"
        :placeholder="`<div class=&quot;p-4&quot;>${'自定义内容'}</div>`"
        @input="$emit('html-input', $event)"
      />
    </div>

    <template v-if="activeSlide.type === 'homeClimateChart'">
      <div class="hero-swiper-config__field">
        <label class="settings-form-label">{{ '默认视图' }}</label>
        <div class="hero-swiper-config__segments">
          <button
            v-for="opt in climateChartViewOptions"
            :key="opt.id"
            type="button"
            :class="[
              'hero-swiper-config__segment',
              (activeSlide.config?.defaultView || 'all') === opt.id &&
                'hero-swiper-config__segment--active',
            ]"
            @click="$emit('set-config-field', 'defaultView', opt.id)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div class="hero-swiper-config__field">
        <label class="settings-form-label">{{ '温度传感器' }}</label>
        <p class="hero-swiper-config__hint-inline">
          {{ '支持多个 sensor.* 实体，按选择顺序展示曲线。' }}
        </p>
        <EntityMultiSelect
          v-model="climateTempEntities"
          :allowed-domains="['sensor']"
          suggest-device-class="temperature"
          placeholder="搜索并选择温度传感器"
        />
      </div>
      <div class="hero-swiper-config__field">
        <label class="settings-form-label">{{ '湿度传感器' }}</label>
        <p class="hero-swiper-config__hint-inline">
          {{ 'device_class 为 humidity 的传感器，或与温度配对使用。' }}
        </p>
        <EntityMultiSelect
          v-model="climateHumEntities"
          :allowed-domains="['sensor']"
          suggest-device-class="humidity"
          placeholder="搜索并选择湿度传感器"
        />
      </div>
    </template>

    <div v-if="activeSlide.type === 'temperatureChart'" class="hero-swiper-config__field">
      <label class="settings-form-label">{{ '温度传感器' }}</label>
      <p class="hero-swiper-config__hint-inline">
        {{ '支持多个 sensor.* 实体，按选择顺序展示曲线。' }}
      </p>
      <EntityMultiSelect
        v-model="tempChartSensorsList"
        :allowed-domains="['sensor']"
        suggest-device-class="temperature"
        placeholder="搜索并选择温度传感器"
      />
    </div>

    <div v-if="activeSlide.type === 'switchGroup'" class="hero-swiper-config__field">
      <label class="settings-form-label">{{ '快捷开关实体' }}</label>
      <p class="hero-swiper-config__hint-inline">
        {{ '用于「快捷」页，支持 switch / input_boolean 实体。' }}
      </p>
      <EntityMultiSelect
        v-model="switchShortcutEntities"
        :allowed-domains="['switch', 'input_boolean']"
        placeholder="搜索并选择快捷开关"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SettingsGroupedSelect from '@/views/settings/shared/layout/SettingsGroupedSelect.vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import HubTabsConfigField from './HubTabsConfigField.vue'
import type { HeroSwiperSlideGroup } from '@/utils/registry/hero-swiper-slide-registry'
import type { HubTabOption } from '@/utils/registry/hub-tabs-options'

defineProps<{
  activeSlide: { id: string; type: string; config?: Record<string, unknown> } | undefined
  slideGroups: HeroSwiperSlideGroup[]
  activeHubTabSet: HubTabOption[] | null
  activePresetOptions: Array<{ id: string; label: string }> | null
  climateChartViewOptions: Array<{ id: string; label: string }>
}>()

defineEmits<{
  'type-select': [type: string]
  'set-config-field': [field: string, value: string]
  'html-input': [event: Event]
}>()

const slideTabDraft = defineModel<{ defaultTab: string; visibleTabs: string[] }>('slideTabDraft', {
  required: true,
})
const climateTempEntities = defineModel<string[]>('climateTempEntities', { required: true })
const climateHumEntities = defineModel<string[]>('climateHumEntities', { required: true })
const tempChartSensors = defineModel<string>('tempChartSensors', { required: true })
const switchShortcutEntities = defineModel<string[]>('switchShortcutEntities', { required: true })

/** temperatureChart 配置仍是逗号分隔字符串，桥接为多选数组 */
const tempChartSensorsList = computed({
  get: () =>
    String(tempChartSensors.value || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  set: (ids: string[]) => {
    tempChartSensors.value = ids.filter(Boolean).join(',')
  },
})
</script>

<style scoped src="./styles/hero-swiper-config-panel.css"></style>
