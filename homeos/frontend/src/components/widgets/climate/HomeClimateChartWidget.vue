/**
 * @file HomeClimateChartWidget.vue
 * @module widgets/climate
 * @description 全屋气候图表 Widget：整合头部、加载/空态与图表主体，
 *              通过 useHomeClimateChart 驱动多视图温湿度趋势展示。
 * @dependencies
 *  - vue: 提供 ref / computed 响应式 API
 *  - ./home-climate-chart/HomeClimateChartChrome.vue: 图表头部（视图切换 / 状态提示）
 *  - ./home-climate-chart/HomeClimateChartBody.vue: 图表主体容器
 *  - ./home-climate-chart/useHomeClimateChart: 图表数据与视图状态驱动 composable
 */
<template>
  <div class="hcc-card widget-glass-card">
    <!-- 图表头部：负责视图切换按钮与状态徽标 -->
    <HomeClimateChartChrome
      v-model:active-view="activeView"
      :view-options="viewOptions"
      :state-variant="stateVariant"
      :empty-title="viewEmptyTitle"
    />

    <!-- 图表主体：仅在无状态异常（stateVariant 为空）时渲染，避免重复渲染空态 -->
    <HomeClimateChartBody
      v-if="!stateVariant"
      :active-view="activeView"
      :set-chart-ref="setChartRef"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import HomeClimateChartChrome from './home-climate-chart/HomeClimateChartChrome.vue'
import HomeClimateChartBody from './home-climate-chart/HomeClimateChartBody.vue'
import { useHomeClimateChart } from './home-climate-chart/useHomeClimateChart'
import './home-climate-chart/styles/home-climate-chart.css'

const props = defineProps({
  config: { type: Object, default: () => ({}) },
  panelVisible: { type: Boolean, default: true },
})

// 图表实例引用，供 composable 调用底层 ECharts API
const chartRef = ref(null)
/**
 * 设置图表 DOM 引用回调，由子组件 HomeClimateChartBody 在挂载时调用。
 * @param {HTMLElement|null} el 图表容器元素
 */
const setChartRef = (el) => {
  chartRef.value = el
}

const {
  loading,
  viewOptions,
  activeView,
  hasEntities,
  hasSeries,
  hasViewSeries,
  viewEmptyTitle,
} = useHomeClimateChart({
  config: computed(() => props.config),
  panelVisible: computed(() => props.panelVisible),
  chartRef,
})

/**
 * 计算当前状态变体：
 *  - 'loading'     首次加载且尚无数据
 *  - 'no-entities' 缺少实体配置
 *  - 'no-data'     当前视图无可用数据序列
 *  - null          正常显示图表主体
 */
const stateVariant = computed(() => {
  if (loading.value && !hasSeries.value) return 'loading'
  if (!hasEntities.value) return 'no-entities'
  if (!hasViewSeries.value) return 'no-data'
  return null
})
</script>