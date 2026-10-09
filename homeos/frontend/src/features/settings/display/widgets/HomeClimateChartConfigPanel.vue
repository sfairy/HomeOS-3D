<!--
  组件文件：HomeClimateChartConfigPanel.vue
  所属模块：frontend/src/features/settings/display/widgets
  组件职责：全屋温湿度图表小部件的配置面板，允许用户选择默认视图（综合/温度/湿度）、
    多路温度传感器实体与多路湿度传感器实体；底部汇总选择情况并提供保存按钮。
  主要 props / emits：
    - defineModel<HomeClimateChartConfig> draft：双向绑定配置草稿对象
      （defaultView、temperatureEntities、humidityEntities）
    - props embedded：是否嵌入 Hero Swiper 中（影响底部提示文案）
    - emit save：点击保存按钮，写入草稿到编辑态
  依赖关系：引用 HOME_CLIMATE_CHART_VIEW_OPTIONS 常量与 HomeClimateChartConfig TS 类型；
    使用 EntityMultiSelect 组件做多实体选择。
  注意事项：当 embedded=true 时，保存仅写入布局草稿，仍须点击页头「保存布局」持久化。
-->
<template>
  <div class="hcc-config">
    <div class="hcc-config__panel">
      <div class="hcc-config__head" v-if="!embedded">
        <div>
          <p class="hcc-config__eyebrow">{{ '全屋温湿度' }}</p>
          <p class="hcc-config__desc">
            {{ '添加各房间温度、湿度传感器，图表将拉取历史曲线并在侧栏展示。' }}
          </p>
        </div>
      </div>

      <div class="hcc-config__section">
        <label class="settings-form-label">{{ '默认视图' }}</label>
        <div class="hcc-config__segments">
          <button
            v-for="opt in viewOptions"
            :key="opt.id"
            type="button"
            :class="[
              'hcc-config__segment',
              draft.defaultView === opt.id && 'hcc-config__segment--active',
            ]"
            @click="draft.defaultView = opt.id"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div class="hcc-config__section">
        <label class="settings-form-label">{{ '温度传感器' }}</label>
        <p class="hcc-config__hint">{{ '支持多个 sensor.* 实体，按选择顺序展示曲线。' }}</p>
        <EntityMultiSelect
          v-model="draft.temperatureEntities"
          :allowed-domains="['sensor']"
          suggest-device-class="temperature"
          placeholder="搜索并选择温度传感器"
          wrapper-class="hcc-config__multiselect"
        />
      </div>

      <div class="hcc-config__section">
        <label class="settings-form-label">{{ '湿度传感器' }}</label>
        <p class="hcc-config__hint">
          {{ 'device_class 为 humidity 的传感器，或与温度配对使用。' }}
        </p>
        <EntityMultiSelect
          v-model="draft.humidityEntities"
          :allowed-domains="['sensor']"
          suggest-device-class="humidity"
          placeholder="搜索并选择湿度传感器"
          wrapper-class="hcc-config__multiselect"
        />
      </div>
    </div>

    <div class="hcc-config__foot">
      <p class="hcc-config__foot-hint">
        {{
          embedded
            ? `${summary} · 保存后需点击页头「保存布局」持久化`
            : summary
        }}
      </p>
      <button type="button" class="settings-btn-primary text-xs" @click="$emit('save')">
        {{ '保存配置' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EntityMultiSelect from '@/components/common/EntityMultiSelect.vue'
import {
  HOME_CLIMATE_CHART_VIEW_OPTIONS,
  type HomeClimateChartConfig,
} from '@/utils/registry/home-climate-chart-options'

const draft = defineModel<Required<HomeClimateChartConfig>>({ required: true })

defineProps<{ embedded?: boolean }>()

defineEmits<{ save: [] }>()

const viewOptions = HOME_CLIMATE_CHART_VIEW_OPTIONS

const summary = computed(() => {
  const t = draft.value.temperatureEntities.length
  const h = draft.value.humidityEntities.length
  const view = viewOptions.find((o) => o.id === draft.value.defaultView)?.label || '综合'
  return `${t} 路温度 · ${h} 路湿度 · 默认 ${view}`
})
</script>

<style scoped src="./styles/HomeClimateChartConfigPanel.css"></style>
