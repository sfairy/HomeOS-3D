<template>
  <div class="ct-root">
    <!-- 头部：仅在非嵌入式模式下显示，包含标题与 tab 切换 -->
    <WidgetHubHeader
      v-if="!embedded"
      v-model="activeTab"
      :title="embedded ? '' : '环境趋势'"
      accent="var(--premium-accent-cyan)"
      :tabs="subTabs"
    >
      <template v-if="!embedded" #icon>
        <TrendingUp class="w-3.5 h-3.5" style="color: var(--premium-accent-cyan)" />
      </template>
    </WidgetHubHeader>
    <!-- 多路温度 tab：复用 TemperatureChart 多通道温度图 -->
    <TemperatureChart
      v-if="activeTab === 'multi'"
      class="ct-panel"
      :config="config"
      :panel-visible="panelVisible"
      embedded
    />
    <!-- 环境指标 tab：复用 SensorTrendChart 传感器趋势图 -->
    <SensorTrendChart
      v-else
      class="ct-panel"
      :config="config"
      :panel-visible="panelVisible"
      embedded
    />
  </div>
</template>

<script setup>
/**
 * @file ClimateTrendPanel.vue
 * @module widgets/climate
 * @description 环境趋势面板：将原 TemperatureChart 与 SensorTrendChart 合并为统一 tab 容器，
 *              支持多路温度与环境指标两种视图切换，可嵌入 ClimateHubPanel 或独立展示。
 * @dependencies
 *  - vue: ref/watch 响应式与监听
 *  - @lucide/vue: TrendingUp 图标
 *  - ./TemperatureChart.vue: 多路温度图表
 *  - ./SensorTrendChart.vue: 环境指标传感器趋势图
 *  - @/components/widgets/shared/WidgetHubHeader.vue: 通用 Hub 头部
 */
import { ref, watch } from 'vue'
import { TrendingUp } from '@lucide/vue'
import TemperatureChart from './TemperatureChart.vue'
import SensorTrendChart from './SensorTrendChart.vue'
import WidgetHubHeader from '@/components/widgets/shared/WidgetHubHeader.vue'

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
  /** multi | metrics — 合并原 sensorTrend */
  defaultTab: { type: String, default: 'multi' },
  embedded: { type: Boolean, default: false },
})

// 子 tab 配置：多路温度 / 环境指标
const subTabs = [
  { key: 'multi', label: '多路温度' },
  { key: 'metrics', label: '环境指标' },
]

// 当前激活 tab，默认根据 defaultTab 选择对应视图
const activeTab = ref(props.defaultTab === 'metrics' ? 'metrics' : 'multi')

// 监听 defaultTab 变化以同步外部 tab 切换请求
watch(
  () => props.defaultTab,
  (tab) => {
    if (tab === 'metrics' || tab === 'multi') activeTab.value = tab
  },
)
</script>

<style scoped src="./styles/climate-hub.css"></style>