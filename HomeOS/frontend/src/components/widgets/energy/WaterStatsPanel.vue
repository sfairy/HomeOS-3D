<template>
  <div class="ws-root">
    <!-- 工具栏：标题 + 天数选择 -->
    <div :class="['ws-toolbar', embedded && 'ws-toolbar--embedded']">
      <div v-if="!embedded" class="ws-header-left">
        <Droplets class="w-3.5 h-3.5 ws-icon" />
        <span class="ws-title">{{ '用水统计' }}</span>
      </div>
      <div v-else class="ws-toolbar-label">{{ '用水趋势' }}</div>
      <HosSelect variant="widget" v-model.number="days" @change="() => query.execute()">
        <option :value="7">{{ '近 7 天' }}</option>
        <option :value="30">{{ '近 30 天' }}</option>
        <option :value="90">{{ '近 90 天' }}</option>
      </HosSelect>
    </div>

    <div class="ws-body">
      <ApiQueryState
        :loading="loading"
        :error="error"
        tone="sky"
        error-title="用水统计加载失败"
        @retry="() => query.execute()"
      >
        <div class="ws-layout">
          <!-- 汇总：总用水 / 日均 -->
          <div class="ws-summary">
            <div class="ws-sum-item">
              <span class="ws-sum-val">{{ stats.totalM3 ?? 0 }}</span>
              <span class="ws-sum-unit">{{ 'm³ 总用水' }}</span>
            </div>
            <div class="ws-sum-item">
              <span class="ws-sum-val">{{ stats.avgDailyM3 ?? 0 }}</span>
              <span class="ws-sum-unit">{{ 'm³ 日均' }}</span>
            </div>
          </div>

          <VEmptyState
            v-if="(stats.daily || []).length === 0"
            compact
            tone="sky"
            :title="'暂无用水记录'"
          />
          <div v-else ref="chartRef" class="ws-echart" />
        </div>

        <!-- 预估用量 -->
        <div v-if="forecastText" class="ws-forecast">
          <span class="text-xs ws-forecast-text">{{ '预估用量' }}: {{ forecastText }}</span>
        </div>
        <!-- 阈值信息：日上限与持续流次数 -->
        <div v-if="stats.thresholds" class="ws-thresholds">
          <span class="text-xs text-white/50">
            {{
              `阈值: 日上限 ${stats.thresholds.dailyLimitM3} m³ · 持续 ${stats.thresholds.continuousFlowCount} 次`
            }}
          </span>
        </div>
        <!-- 异常告警列表 -->
        <div v-if="anomalyList.length" class="ws-anomaly">
          <AlertTriangle class="w-3 h-3 shrink-0 ws-alert-icon" />
          <span>{{ anomalyList.join(' · ') }}</span>
        </div>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * @file WaterStatsPanel.vue
 * @module widgets/energy
 * @description 用水统计面板：展示近 N 天的用水统计（总量、日均、趋势图、预估、阈值、异常告警）。
 * @dependencies
 *  - vue: ref/computed/watch 响应式与监听
 *  - @/components/common/base/HosSelect.vue: 下拉选择
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @/composables/api/useWidgetApiQuery: 带轮询的查询封装
 *  - @/composables/life/useLifeChartHost: ECharts 实例托管
 *  - @/services/api/system: 用水统计接口
 *  - @/utils/chart/env-energy-hub-charts.util: 图表配置构造
 *  - @lucide/vue: Droplets / AlertTriangle 图标
 */
import HosSelect from '@/components/common/base/HosSelect.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { ref, computed, watch } from 'vue'
import { useWidgetApiQuery } from '@/composables/api/useWidgetApiQuery'
import { Droplets, AlertTriangle } from '@lucide/vue'
import { fetchWaterStatistics } from '@/services/api/system'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import { buildWaterUsageChartOption } from '@/utils/chart/env-energy-hub-charts.util'

/**
 * 组件 Props。
 * @property {boolean} embedded - 是否嵌入模式（隐藏标题改展示标签），默认 false
 * @property {boolean} panelVisible - 面板是否可见（控制轮询），默认 true
 */
const props = defineProps({
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

// 查询天数（7 / 30 / 90）
const days = ref(30)
// 图表容器引用，供 useHubChart 挂载
const chartRef = ref(null)

/**
 * 用水统计查询：基于 useWidgetApiQuery 封装，120s 轮询，panelVisible 控制启停。
 * @returns 查询对象（loading / error / data / execute）
 */
const query = useWidgetApiQuery(
  'waterStats',
  async () => {
    const { data } = await fetchWaterStatistics({ days: days.value })
    return { data: data || {} }
  },
  120_000,
  {
    pollKey: 'widget:WaterStatsPanel',
    panelVisible: () => props.panelVisible,
    immediate: false,
  },
)

// 加载中状态
const loading = query.loading
// 错误信息
const error = query.error
/** 统计数据（含 daily / totals / forecast / thresholds / anomalyCounts）。 */
const stats = computed(() => query.data?.value || {})

// 面板可见时立即执行一次查询
watch(
  () => props.panelVisible,
  (visible) => {
    if (visible) void query.execute()
  },
  { immediate: true },
)

// 天数切换时重新查询
watch(days, () => {
  void query.execute()
})

/**
 * 每日用水序列，作为图表数据源。
 * @returns {Array} 每日数据点数组
 */
const dailySeries = computed(() => stats.value.daily || [])

// 通过 useHubChart 将图表配置绑定到 chartRef，依赖变化时自动重绘
useHubChart(
  chartRef,
  () => buildWaterUsageChartOption(dailySeries.value),
  [dailySeries, days],
)

/**
 * 异常类型到中文标签的映射。
 */
const anomalyLabels = computed(() => ({
  continuous_flow: '持续水流',
  overflow: '超量用水',
}))
/**
 * 异常告警文案列表，格式「类型 次数」。
 * @returns {string[]} 异常告警字符串数组
 */
const anomalyList = computed(() => {
  const counts = stats.value.anomalyCounts || {}
  return Object.entries(counts).map(([k, v]) => `${anomalyLabels.value[k] || k} ${v} 次`)
})

/**
 * 预估用量文案：拼接 7 天 / 30 天预测值。
 * @returns {string} 预估用量字符串
 */
const forecastText = computed(() => {
  const f = stats.value.forecast
  if (!f) return ''
  const parts = []
  if (f.next7DaysM3 != null) parts.push(`7d ${f.next7DaysM3} m³`)
  if (f.next30DaysM3 != null) parts.push(`30d ${f.next30DaysM3} m³`)
  return parts.join(' · ')
})
</script>

<style scoped src="./styles/WaterStatsPanel.css"></style>
