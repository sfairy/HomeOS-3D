<!--
  @file DeviceAnalyticsPanel.vue
  @module 设备详情/深度分析面板
  @description 设备详情页的「深度分析」子面板：展示切换次数、运行时长、事件总数、域内对比四项指标，
               并渲染使用趋势图（柱+线双轴）、时段分布图（按小时面积图）与雷达图（本设备 vs 域平均）。
               数据由 useDeviceUsageStats、useDeviceEventStats 组合式函数提供；域平均通过
               fetchAdvisorUsageSummary/fetchEventStats 计算得到。图表使用 ECharts，仅在 visible 且
               DOM 尺寸就绪时渲染，并通过 ResizeObserver 自适应。
  @dependencies vue（ref/computed/watch/nextTick/onMounted/onUnmounted）、@homeos/shared（getEntityDomain）、
                @lucide/vue、echarts、useDeviceUsageStats、useDeviceEventStats、
                fetchAdvisorUsageSummary/fetchEventStats API、DeviceChartHeader、
                device-chart-copy.util/device-chart-theme（图表文案与主题）。
-->
<template>
  <div ref="panelRef" class="device-detail-tab device-analytics-tab">
    <div class="dev-metric-grid device-detail-tab__metrics">
      <div class="dev-metric">
        <div class="dev-metric__icon"><Zap class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ analyticsMetrics.onCount }}</div>
          <div class="dev-metric__label">{{ '切换次数' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--green"><Clock class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ formatRuntime(analyticsMetrics.runtimeMs) }}</div>
          <div class="dev-metric__label">{{ '运行时长' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--amber"><Activity class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ analyticsMetrics.eventCount }}</div>
          <div class="dev-metric__label">{{ '事件总数' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon"><Radar class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ domainCompareShort }}</div>
          <div class="dev-metric__label">{{ '域内对比' }}</div>
        </div>
      </div>
    </div>

    <div
      class="dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop device-detail-tab__card device-analytics-panel"
    >
      <div class="dev-card__header">
        <div class="dev-card__title-row">
          <Sparkles class="w-4 h-4 dan-icon-violet" />
          <span class="dev-card__title">{{ '深度分析' }}</span>
          <span
            v-if="domainCompareLabel"
            :class="[
              'device-analytics-tab__compare-chip',
              domainCompareTone && `device-analytics-tab__compare-chip--${domainCompareTone}`,
            ]"
          >
            {{ domainCompareLabel }}
          </span>
        </div>
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
          <button
            type="button"
            class="dev-btn-refresh"
            :disabled="usageLoading || eventLoading"
            :aria-label="'刷新'"
            @click="refreshAll"
          >
            <RefreshCw :class="['w-3 h-3', (usageLoading || eventLoading) && 'animate-spin']" />
          </button>
        </div>
      </div>

      <div ref="gridRef" class="dev-analytics-grid device-detail-tab__panel">
        <div class="dev-chart-wrap">
          <DeviceChartHeader
            :icon="BarChart3"
            icon-class="w-3 h-3 dan-icon-info"
            :title="DEVICE_CHART_COPY.usageTrend.title"
            :description="DEVICE_CHART_COPY.usageTrend.desc"
            :hint="periodLabel"
          />
          <div v-if="usageLoading" class="dev-state-block device-detail-tab__fallback">
            <RefreshCw class="w-4 h-4 animate-spin" />
          </div>
          <div
            v-else-if="!usageReport?.daily.length"
            class="dev-state-block device-detail-tab__fallback"
          >
            {{ '暂无使用数据，系统正在收集' }}
          </div>
          <div v-else ref="usageChartRef" class="dev-chart-canvas device-detail-tab__canvas"></div>
        </div>

        <div class="dev-chart-wrap">
          <DeviceChartHeader
            :icon="Clock"
            icon-class="w-3 h-3 dan-icon-warn"
            :title="DEVICE_CHART_COPY.usageHourly.title"
            :description="DEVICE_CHART_COPY.usageHourly.desc"
            :hint="hourlyChartTitle"
          />
          <div v-if="eventLoading" class="dev-state-block device-detail-tab__fallback">
            <RefreshCw class="w-4 h-4 animate-spin" />
          </div>
          <div v-else ref="hourlyChartRef" class="dev-chart-canvas device-detail-tab__canvas"></div>
        </div>

        <div class="dev-chart-wrap dev-analytics-grid__full">
          <DeviceChartHeader
            :icon="Radar"
            icon-class="w-3 h-3 dan-icon-success"
            :title="DEVICE_CHART_COPY.usageRadar.title"
            :description="DEVICE_CHART_COPY.usageRadar.desc"
          />
          <div
            ref="radarChartRef"
            class="dev-chart-canvas device-detail-tab__canvas device-analytics-panel__radar-canvas"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { Sparkles, RefreshCw, BarChart3, Clock, Radar, Zap, Activity } from '@lucide/vue'
import type { EChartsCoreOption } from 'echarts/core'
import type * as EchartsModuleNS from '@/utils/chart/echarts'
import { fetchAdvisorUsageSummary } from '@/services/api/system'
import { fetchEventStats } from '@/services/api/entities'
import { useDeviceUsageStats } from '@/composables/device/useDeviceUsageStats'
import { useDeviceEventStats } from '@/composables/device/useDeviceEventStats'
import DeviceChartHeader from '@/components/devices/DeviceChartHeader.vue'
import {
  DEVICE_CHART_COPY,
  formatDualMetricTooltip,
  formatHourlyBucketTooltip,
} from '@/utils/chart/device-chart-copy.util'
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

const props = withDefaults(
  defineProps<{
    entityId: string
    /** Tab 可见时再初始化图表，避免 v-show 隐藏时 clientWidth 为 0 */
    visible?: boolean
  }>(),
  {
    visible: true,
  },
)

const days = ref(7)
const rangeOptions = [
  { value: 7, label: '7天' },
  { value: 30, label: '30天' },
]
const hourlyChartTitle = computed(() => `时段分布（近 ${days.value} 天 · 按小时）`)
const periodLabel = computed(() => `近 ${days.value} 天`)

const entityIdRef = computed(() => props.entityId)
const daysRef = computed(() => days.value)
const visibleRef = computed(() => props.visible)
const eventHours = computed(() => days.value * 24)

const {
  loading: usageLoading,
  report: usageReport,
  refresh: refreshUsage,
} = useDeviceUsageStats(entityIdRef, daysRef, visibleRef)
const {
  loading: eventLoading,
  stats: eventStats,
  hourlyBuckets,
  refresh: refreshEvents,
} = useDeviceEventStats(entityIdRef, eventHours, visibleRef)

const usageChartRef = ref<HTMLElement | null>(null)
const hourlyChartRef = ref<HTMLElement | null>(null)
const radarChartRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)

let usageChart: ChartInst | null = null
let hourlyChart: ChartInst | null = null
let radarChart: ChartInst | null = null
let resizeObserver: ResizeObserver | null = null
let renderScheduled = false

const domainMedian = ref({ onCount: 0, runtime: 0, events: 0 })

const analyticsMetrics = computed(() => {
  const summary = usageReport.value?.summary
  const onCount = summary?.onCount ?? 0
  const runtimeMs = summary?.totalRuntimeMs ?? 0
  const eventCount =
    eventStats.value?.total ?? hourlyBuckets.value.reduce((sum, value) => sum + value, 0)
  return { onCount, runtimeMs, eventCount }
})

const domainCompareShort = computed(() => {
  const median = domainMedian.value.onCount
  if (!median) return '—'
  const on = analyticsMetrics.value.onCount
  if (on > median * 1.1) return '偏高'
  if (on < median * 0.9) return '偏低'
  return '持平'
})

const domainCompareLabel = computed(() => {
  const median = domainMedian.value.onCount
  if (!median) return ''
  const on = analyticsMetrics.value.onCount
  if (on > median * 1.1) return `高于域平均 ${Math.round((on / median - 1) * 100)}%`
  if (on < median * 0.9) return `低于域平均 ${Math.round((1 - on / median) * 100)}%`
  return '与域平均接近'
})

const domainCompareTone = computed<'high' | 'low' | ''>(() => {
  const median = domainMedian.value.onCount
  if (!median) return ''
  const on = analyticsMetrics.value.onCount
  if (on > median * 1.1) return 'high'
  if (on < median * 0.9) return 'low'
  return ''
})

function formatRuntime(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes}分`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}时${mins}分` : `${hours}时`
}

function chartDomReady(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false
  const { clientWidth, clientHeight } = el
  return clientWidth > 0 && clientHeight > 0
}

function scheduleRender() {
  if (renderScheduled) return
  renderScheduled = true
  nextTick(() => {
    renderScheduled = false
    renderAll()
  })
}

async function fetchDomainMedian() {
  try {
    const domain = getEntityDomain(props.entityId)
    const hours = days.value * 24
    const [usageRes, eventsRes] = await Promise.all([
      fetchAdvisorUsageSummary({ days: days.value }),
      fetchEventStats({ hours }),
    ])
    const data = usageRes.data
    const eventsData = eventsRes.data as { byDomain?: Record<string, number> }
    const breakdown = (data?.domainBreakdown || []).find(
      (d: { domain: string }) => d.domain === domain,
    )
    const domainEventTotal = Number(eventsData?.byDomain?.[domain] ?? 0)
    if (breakdown && breakdown.deviceCount > 0) {
      domainMedian.value = {
        onCount: Math.round(breakdown.onCount / breakdown.deviceCount),
        runtime: Math.round(breakdown.totalRuntimeMs / breakdown.deviceCount / 60000),
        events: Math.round(domainEventTotal / breakdown.deviceCount),
      }
    } else {
      domainMedian.value = { onCount: 0, runtime: 0, events: 0 }
    }
  } catch {
    domainMedian.value = { onCount: 0, runtime: 0, events: 0 }
  }
}

/**
 * echarts vendor 通过动态 import 按需加载，保持大依赖独立分包。
 * 导入是异步的：期间组件可能隐藏/卸载或容器变化，重新校验避免僵尸实例。
 */
async function renderUsageChart() {
  if (!props.visible || !usageReport.value?.daily.length) return
  if (!chartDomReady(usageChartRef.value)) return
  if (!usageChart) {
    const echarts = (await import('@/utils/chart/echarts')).default
    if (!props.visible || !chartDomReady(usageChartRef.value)) return
    // 并发调用可能已在 await 期间完成初始化
    if (!usageChart) usageChart = echarts.init(usageChartRef.value)
  }
  const daily = usageReport.value.daily
  const labels = daily.map((d) => d.day.slice(5))
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
        data: daily.map((d) => d.onCount),
        itemStyle: { color: chartVerticalGradient(DEVICE_CHART_COLORS.accent, 0.9, 0.25), borderRadius: [4, 4, 0, 0] },
      },
      {
        name: '运行时长',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: daily.map((d) => Math.round(d.totalRuntimeMs / 60000)),
        itemStyle: { color: DEVICE_CHART_COLORS.purple },
      },
    ],
  }
  usageChart.setOption(option, true)
  usageChart.resize()
}

async function renderHourlyChart() {
  if (!props.visible || eventLoading.value) return
  if (!chartDomReady(hourlyChartRef.value)) return
  if (!hourlyChart) {
    const echarts = (await import('@/utils/chart/echarts')).default
    if (!props.visible || !chartDomReady(hourlyChartRef.value)) return
    // 并发调用可能已在 await 期间完成初始化
    if (!hourlyChart) hourlyChart = echarts.init(hourlyChartRef.value)
  }
  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`)
  const option: EChartsCoreOption = {
    ...deviceChartBase(),
    tooltip: {
      ...deviceChartTooltip(),
      formatter: (params: unknown) => {
        const item = (Array.isArray(params) ? params[0] : params) as {
          dataIndex?: number
          value?: number
        }
        const hour = item?.dataIndex ?? 0
        const count = typeof item?.value === 'number' ? item.value : Number(item?.value ?? 0)
        return formatHourlyBucketTooltip(hour, count, eventHours.value)
      },
    },
    grid: deviceChartGrid(),
    xAxis: deviceChartXAxis(hours),
    yAxis: deviceChartYAxis('事件(次)'),
    series: [
      {
        type: 'line',
        smooth: true,
        areaStyle: { color: chartVerticalGradient(DEVICE_CHART_COLORS.amber, 0.4, 0.02) },
        data: hourlyBuckets.value,
        itemStyle: { color: DEVICE_CHART_COLORS.amber },
      },
    ],
  }
  hourlyChart.setOption(option, true)
  hourlyChart.resize()
}

async function renderRadarChart() {
  if (!props.visible) return
  if (!chartDomReady(radarChartRef.value)) return
  if (!radarChart) {
    const echarts = (await import('@/utils/chart/echarts')).default
    if (!props.visible || !chartDomReady(radarChartRef.value)) return
    // 并发调用可能已在 await 期间完成初始化
    if (!radarChart) radarChart = echarts.init(radarChartRef.value)
  }
  const { onCount: deviceOn, runtimeMs, eventCount: deviceEvents } = analyticsMetrics.value
  const deviceRuntime = Math.round(runtimeMs / 60000)
  const maxOn = Math.max(deviceOn, domainMedian.value.onCount, 1)
  const maxRuntime = Math.max(deviceRuntime, domainMedian.value.runtime, 1)
  const maxEvents = Math.max(deviceEvents, domainMedian.value.events, 1)

  const option: EChartsCoreOption = {
    ...deviceChartBase(),
    legend: {
      data: ['本设备', '域平均'],
      textStyle: { color: DEVICE_CHART_COLORS.axis, fontSize: 10 },
      bottom: 0,
    },
    radar: {
      center: ['50%', '52%'],
      radius: '72%',
      indicator: [
        { name: '切换次数', max: maxOn * 1.2 },
        { name: '运行时长(分)', max: maxRuntime * 1.2 },
        { name: '事件数', max: maxEvents * 1.2 },
      ],
      axisName: { color: DEVICE_CHART_COLORS.axisName, fontSize: 10 },
      splitLine: { lineStyle: { color: DEVICE_CHART_COLORS.grid } },
      splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.04)'] } },
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: [deviceOn, deviceRuntime, deviceEvents],
            name: '本设备',
            areaStyle: { color: 'rgba(56,189,248,0.2)' },
            lineStyle: { color: DEVICE_CHART_COLORS.accent },
          },
          {
            value: [
              domainMedian.value.onCount,
              domainMedian.value.runtime,
              domainMedian.value.events,
            ],
            name: '域平均',
            areaStyle: { color: 'rgba(167,139,250,0.15)' },
            lineStyle: { color: DEVICE_CHART_COLORS.purple },
          },
        ],
      },
    ],
  }
  radarChart.setOption(option, true)
  radarChart.resize()
}

async function renderAll() {
  if (!props.visible) return
  await renderUsageChart()
  await renderHourlyChart()
  await renderRadarChart()
}

async function refreshAll() {
  refreshUsage()
  refreshEvents()
  await fetchDomainMedian()
  scheduleRender()
}

function resizeCharts() {
  if (!props.visible) return
  usageChart?.resize()
  hourlyChart?.resize()
  radarChart?.resize()
}

function observeChartContainers() {
  if (!resizeObserver) return
  for (const el of [
    gridRef.value,
    usageChartRef.value,
    hourlyChartRef.value,
    radarChartRef.value,
  ]) {
    if (el) resizeObserver.observe(el)
  }
}

function handleContainerResize() {
  if (!props.visible) return
  resizeCharts()
  scheduleRender()
}

watch(
  [usageReport, hourlyBuckets, days, () => props.visible, usageLoading, eventLoading],
  () => {
    if (!props.visible) return
    fetchDomainMedian().then(scheduleRender)
  },
  { deep: true },
)

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      fetchDomainMedian().then(scheduleRender)
    }
  },
)

watch([usageChartRef, hourlyChartRef, radarChartRef, gridRef], () => {
  observeChartContainers()
  if (props.visible) scheduleRender()
})

onMounted(() => {
  fetchDomainMedian().then(scheduleRender)
  resizeObserver = new ResizeObserver(() => handleContainerResize())
  if (panelRef.value) resizeObserver.observe(panelRef.value)
  observeChartContainers()
  window.addEventListener('resize', resizeCharts)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', resizeCharts)
  usageChart?.dispose()
  hourlyChart?.dispose()
  radarChart?.dispose()
  usageChart = null
  hourlyChart = null
  radarChart = null
})
</script>

<style scoped src="./styles/DeviceAnalyticsPanel.css"></style>
