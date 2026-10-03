<!--
  @file DeviceUsageStats.vue
  @module 设备详情/使用统计面板
  @description 设备详情页的「使用统计」子面板：展示切换次数、累计开启时长、日均使用、上次使用四项指标，
               并以柱+线双轴趋势图与每日明细表格渲染近 N 天（7/30）的使用数据。
               数据由 useDeviceUsageStats 组合式函数提供；图表使用 ECharts，仅在 visible 且
               DOM 尺寸就绪时渲染，并通过 ResizeObserver 自适应。
  @dependencies vue（ref/computed/watch/nextTick/onMounted/onUnmounted）、@lucide/vue、echarts、
                useDeviceUsageStats、DeviceChartHeader、locale-format.util、
                device-chart-copy.util/device-chart-theme（图表文案与主题）。
-->
<template>
  <!-- 设备使用统计标签页组件 -->
  <div class="device-detail-tab device-usage-tab">
    <!-- 设备使用统计指标网格 -->
    <div class="dev-metric-grid device-detail-tab__metrics">
      <!-- 切换次数指标 -->
      <div class="dev-metric">
        <div class="dev-metric__icon"><Zap class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ usageStats.toggleCount }}</div>
          <div class="dev-metric__label">{{ '切换次数' }}</div>
        </div>
      </div>
      <!-- 累计开启时长指标 -->
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--green"><Clock class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ formatDurationMs(usageStats.totalOnTime) }}</div>
          <div class="dev-metric__label">{{ '累计开启' }}</div>
        </div>
      </div>
      <!-- 日均使用次数指标 -->
      <div class="dev-metric">
        <div class="dev-metric__icon"><TrendingUp class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ usageStats.averageDaily }}</div>
          <div class="dev-metric__label">{{ '日均使用' }}</div>
        </div>
      </div>
      <!-- 上次使用时间指标 -->
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--amber"><Calendar class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ formatLastUsedLabel(usageStats.lastUsed) }}</div>
          <div class="dev-metric__label">{{ '上次使用' }}</div>
        </div>
      </div>
    </div>

    <!-- 使用统计卡片 -->
    <div
      class="dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop device-detail-tab__card"
    >
      <!-- 卡片头部 -->
      <div class="dev-card__header">
        <div class="dev-card__title-row">
          <BarChart3 class="w-4 h-4 dus-icon-violet" />
          <span class="dev-card__title">{{ '使用统计' }}</span>
        </div>
        <!-- 头部操作区：时间范围选择和刷新按钮 -->
        <div class="device-usage-tab__header-actions">
          <div class="dev-range">
            <button
              v-for="r in rangeOptions"
              :key="r.value"
              type="button"
              :class="['dev-range__btn', days === r.value && 'dev-range__btn--active']"
              @click="days = r.value"
            >
              {{ r.label }}
            </button>
          </div>
          <button
            type="button"
            class="dev-btn-refresh"
            :disabled="loading"
            :aria-label="'刷新'"
            @click="refresh"
          >
            <RefreshCw :class="['w-3 h-3', loading && 'animate-spin']" />
          </button>
        </div>
      </div>

      <!-- 加载中状态 -->
      <div v-if="loading && !usageData.length" class="dev-state-block device-detail-tab__fallback">
        <RefreshCw class="w-4 h-4 animate-spin" />
        <span>{{ '加载统计…' }}</span>
      </div>

      <!-- 错误状态 -->
      <div
        v-else-if="error"
        class="dev-state-block dev-state-block--error device-detail-tab__fallback"
      >
        <AlertCircle class="w-4 h-4" />
        <span>{{ error }}</span>
        <button type="button" class="dev-range__btn" @click="refresh">{{ '重试' }}</button>
      </div>

      <!-- 无数据状态 -->
      <div v-else-if="!usageData.length" class="dev-state-block device-detail-tab__fallback">
        <BarChart3 class="w-4 h-4" />
        <span>{{ '暂无使用数据，系统正在收集设备切换记录' }}</span>
      </div>

      <!-- 图表和表格内容区 -->
      <div v-else class="device-detail-tab__panel device-detail-tab__panel--split">
        <!-- 左侧：使用趋势图表 -->
        <div class="dev-chart-wrap device-detail-tab__chart-wrap">
          <DeviceChartHeader
            :icon="Calendar"
            icon-class="w-3 h-3 dus-icon-info"
            :title="DEVICE_CHART_COPY.usageTrend.title"
            :description="DEVICE_CHART_COPY.usageTrend.desc"
            :hint="chartTitle"
          />
          <div ref="chartRef" class="dev-chart-canvas device-detail-tab__canvas"></div>
        </div>
        <!-- 右侧：每日明细表格 -->
        <div class="dev-chart-wrap device-detail-tab__table-wrap">
          <DeviceChartHeader
            :icon="List"
            icon-class="w-3 h-3 dus-icon-violet"
            title="每日明细"
            description="表格与左侧图表同源：切换次数与累计开启时长。"
            :hint="`${usageData.length} 天`"
          />
          <div class="device-detail-tab__rank-scroll">
            <table class="dev-rank-table device-usage-tab__daily-table">
              <thead>
                <tr>
                  <th>{{ '日期' }}</th>
                  <th>{{ '次数' }}</th>
                  <th>{{ '时长' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in dailyRowsDesc" :key="row.day">
                  <td>{{ formatDayLabel(row.day) }}</td>
                  <td>{{ row.onCount }}</td>
                  <td>{{ formatDurationMs(row.totalRuntimeMs) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  BarChart3,
  RefreshCw,
  AlertCircle,
  Calendar,
  Zap,
  Clock,
  TrendingUp,
  List,
} from '@lucide/vue'
import type { EChartsCoreOption } from 'echarts/core'
import type * as EchartsModuleNS from '@/utils/chart/echarts'
import { useDeviceUsageStats } from '@/composables/device/useDeviceUsageStats'
import DeviceChartHeader from '@/components/devices/DeviceChartHeader.vue'
import { formatLocaleDate, formatDurationMs } from '@/utils/format/locale-format.util'
import { DEVICE_CHART_COPY, formatDualMetricTooltip } from '@/utils/chart/device-chart-copy.util'
import {
  deviceChartBase,
  deviceChartGrid,
  deviceChartTooltip,
  deviceChartXAxis,
  deviceChartYAxis,
  deviceChartLegend,
  DEVICE_CHART_COLORS,
  chartVerticalGradient,
} from '@/utils/chart/device-chart-theme'

/** 图表实例类型：来自按需加载 echarts 入口模块的 init 返回值 */
type EchartsModule = typeof EchartsModuleNS
type ChartInst = ReturnType<EchartsModule['default']['init']>

/**
 * 组件属性定义
 */
const props = withDefaults(
  defineProps<{
    /** 实体 ID */
    entityId: string
    /** 是否可见，用于控制图表渲染 */
    visible?: boolean
  }>(),
  {
    visible: true,
  },
)

/** 时间范围选择（天数） */
const days = ref(7)
/** 时间范围选项 */
const rangeOptions = [
  { value: 7, label: '7天' },
  { value: 30, label: '30天' },
]

/** 实体 ID 计算属性，用于传递给 useDeviceUsageStats */
const entityIdRef = computed(() => props.entityId)
/** 天数计算属性，用于传递给 useDeviceUsageStats */
const daysRef = computed(() => days.value)
/** 可见性计算属性，用于传递给 useDeviceUsageStats */
const visibleRef = computed(() => props.visible)

/**
 * 使用设备使用统计组合式函数
 * 
 * 返回：
 * - loading: 加载状态
 * - error: 错误信息
 * - report: 统计报告数据
 * - refresh: 刷新方法
 */
const { loading, error, report, refresh } = useDeviceUsageStats(entityIdRef, daysRef, visibleRef)

/** 图表容器引用 */
const chartRef = ref<HTMLElement | null>(null)
/** ECharts 实例 */
let chartInstance: ChartInst | null = null
/** 尺寸变化观察器 */
let resizeObserver: ResizeObserver | null = null

/** 每日使用数据 */
const usageData = computed(() => report.value?.daily || [])
/** 图表标题 */
const chartTitle = computed(() => `近 ${days.value} 天使用趋势`)
/** 按日期倒序排列的每日数据 */
const dailyRowsDesc = computed(() => [...usageData.value].reverse())

/**
 * 使用统计汇总数据
 * 
 * 包含：
 * - toggleCount: 总切换次数
 * - totalOnTime: 累计开启时长（毫秒）
 * - averageDaily: 日均使用次数
 * - lastUsed: 上次使用日期
 */
const usageStats = computed(() => {
  const data = usageData.value
  // 总切换次数：优先使用报告摘要，否则从每日数据累加
  const toggleCount = report.value?.summary.onCount ?? data.reduce((sum, d) => sum + d.onCount, 0)
  // 累计开启时长：优先使用报告摘要，否则从每日数据累加
  const totalOnTime =
    report.value?.summary.totalRuntimeMs ?? data.reduce((sum, d) => sum + d.totalRuntimeMs, 0)
  // 日均使用次数：优先使用报告摘要，否则计算平均值
  const averageDaily =
    report.value?.summary.avgDaily ?? (data.length ? Math.round(toggleCount / data.length) : 0)

  // 查找上次使用日期：从最后一天向前遍历，找到第一个有使用记录的日期
  let lastUsed: string | null = null
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].onCount > 0) {
      lastUsed = data[i].day
      break
    }
  }

  return { toggleCount, totalOnTime, averageDaily, lastUsed }
})

/**
 * 格式化上次使用时间标签
 * 
 * @param dateStr 日期字符串
 * @returns 格式化后的标签（今天/昨天/月/日）
 */
function formatLastUsedLabel(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return '今天'
  if (d.toDateString() === yesterday.toDateString()) return '昨天'
  return formatLocaleDate(d, { month: 'numeric', day: 'numeric' })
}

/**
 * 格式化日期标签为 MM/DD 格式
 * 
 * @param day 日期字符串
 * @returns 格式化后的日期标签
 */
function formatDayLabel(day: string): string {
  const d = new Date(day)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * 检查图表容器是否已就绪（有实际尺寸）
 * 
 * @returns true 表示容器已就绪
 */
function chartDomReady(): boolean {
  if (!chartRef.value) return false
  const { clientWidth, clientHeight } = chartRef.value
  return clientWidth > 0 && clientHeight > 0
}

/**
 * 渲染使用趋势图表
 * echarts vendor 通过动态 import 按需加载，保持大依赖独立分包。
 */
async function renderChart() {
  // 如果组件不可见、容器不存在或无数据，直接返回
  if (!props.visible || !chartRef.value || !usageData.value.length) return
  if (!chartDomReady()) return

  // 初始化 ECharts 实例
  if (!chartInstance) {
    const echarts = (await import('@/utils/chart/echarts')).default
    // 导入是异步的：期间组件可能隐藏/卸载或容器变化，重新校验避免僵尸实例
    if (!props.visible || !chartRef.value || !chartDomReady()) return
    // 并发调用可能已在 await 期间完成初始化
    if (!chartInstance) chartInstance = echarts.init(chartRef.value)
  }

  // 准备图表数据
  const labels = usageData.value.map((d) => formatDayLabel(d.day))
  const counts = usageData.value.map((d) => d.onCount)
  const durations = usageData.value.map((d) => Math.round(d.totalRuntimeMs / 60000))

  // 构建 ECharts 配置选项
  const option: EChartsCoreOption = {
    ...deviceChartBase(),
    tooltip: {
      ...deviceChartTooltip(),
      trigger: 'axis',
      formatter: (params: unknown) =>
        formatDualMetricTooltip(params, [
          { name: '切换次数', unit: '次' },
          { name: '运行时长', unit: '分钟' },
        ]),
    },
    legend: deviceChartLegend(),
    grid: deviceChartGrid({ top: 36 }),
    xAxis: deviceChartXAxis(labels),
    yAxis: [
      deviceChartYAxis('次数(次)'),
      { ...deviceChartYAxis('时长(分)'), splitLine: { show: false } },
    ],
    series: [
      {
        name: '切换次数',
        type: 'bar',
        data: counts,
        itemStyle: { color: chartVerticalGradient(DEVICE_CHART_COLORS.accent, 0.9, 0.25), borderRadius: [4, 4, 0, 0] },
      },
      {
        name: '运行时长',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: durations,
        itemStyle: { color: DEVICE_CHART_COLORS.purple },
      },
    ],
  }

  // 设置图表选项并调整尺寸
  chartInstance.setOption(option, true)
  chartInstance.resize()
}

// 监听使用数据变化，重新渲染图表
watch(usageData, () => nextTick(renderChart), { deep: true })

// 监听组件可见性变化
watch(
  () => props.visible,
  (visible) => {
    if (visible) nextTick(renderChart)
  },
)

// 监听时间范围变化，重新渲染图表
watch(days, () => nextTick(renderChart))

/**
 * 组件挂载时初始化
 */
onMounted(() => {
  // 设置尺寸变化监听
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => chartInstance?.resize())
    resizeObserver.observe(chartRef.value)
  }
  // 延迟渲染图表
  nextTick(renderChart)
})

/**
 * 组件卸载时清理资源
 */
onUnmounted(() => {
  resizeObserver?.disconnect()
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style src="./styles/DevicePanels.css"></style>
