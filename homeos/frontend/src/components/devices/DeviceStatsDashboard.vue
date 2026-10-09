<!--
  @file DeviceStatsDashboard.vue
  @module 设备列表/统计侧栏仪表盘
  @description 设备列表页的统计侧栏卡片：展示全部实体数、在线/离线/低电量四项指标，
               并以饼图渲染状态分布与域分布（Top 8 域）。
               图表使用 ECharts，通过 ResizeObserver 与 window resize 自适应；visible 为 false 时跳过渲染。
  @dependencies vue（ref/computed/watch/onMounted/onUnmounted/nextTick）、@lucide/vue、
                entities.store、echarts、device-chart-theme（图表主题）、getDomainLabel。
-->
<template>
  <div
    class="device-stats device-stats--sidebar dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop"
  >
    <div class="dev-card__header">
      <div class="dev-card__title-row">
        <Activity class="w-4 h-4 dsd-icon-info" />
        <span class="dev-card__title">{{ '设备概览' }}</span>
      </div>
      <button
        type="button"
        class="dev-btn-refresh"
        :disabled="refreshing"
        :aria-label="'刷新'"
        @click="refreshData"
      >
        <RefreshCw :class="['w-3 h-3', refreshing && 'animate-spin']" />
      </button>
    </div>

    <!-- 顶部四指标卡：全部实体 / 在线 / 离线 / 低电量 -->
    <div class="dev-metric-grid dev-metric-grid--sidebar">
      <div class="dev-metric">
        <div class="dev-metric__icon">
          <Layers class="w-4 h-4" />
        </div>
        <div>
          <div class="dev-metric__value">{{ stats.total }}</div>
          <div class="dev-metric__label">{{ '全部实体' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--green">
          <Wifi class="w-4 h-4" />
        </div>
        <div>
          <div class="dev-metric__value">{{ stats.online }}</div>
          <div class="dev-metric__label">{{ '在线' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--red">
          <WifiOff class="w-4 h-4" />
        </div>
        <div>
          <div class="dev-metric__value">{{ stats.offline }}</div>
          <div class="dev-metric__label">{{ '离线' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--amber">
          <BatteryWarning class="w-4 h-4" />
        </div>
        <div>
          <div class="dev-metric__value">{{ stats.lowBattery }}</div>
          <div class="dev-metric__label">{{ '低电量' }}</div>
        </div>
      </div>
    </div>

    <!-- 图表区：状态分布饼图 + 域分布饼图 -->
    <div class="device-stats__charts">
      <div class="dev-chart-wrap">
        <div class="dev-chart-wrap__title">
          <CircleDot class="w-3 h-3 dsd-icon-info" />
          <span>{{ '状态分布' }}</span>
        </div>
        <div ref="statusChartRef" class="dev-chart-canvas"></div>
      </div>
      <div class="dev-chart-wrap">
        <div class="dev-chart-wrap__title">
          <Grid3x3 class="w-3 h-3 dsd-icon-violet" />
          <span>{{ '域分布' }}</span>
        </div>
        <div ref="domainChartRef" class="dev-chart-canvas"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  Activity,
  RefreshCw,
  Layers,
  Wifi,
  WifiOff,
  BatteryWarning,
  CircleDot,
  Grid3x3,
} from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import type { EChartsCoreOption } from 'echarts/core'
import type * as EchartsModuleNS from '@/utils/chart/echarts'

import {
  DEVICE_CHART_COLORS,
  deviceSidebarPieTooltip,
  deviceChartBase,
} from '@/utils/chart/device-chart-theme'
import { getDomainLabel } from '@/utils/device/domain-labels.util'
import { entityDomainColor } from '@/constants/entity-domain-meta'
import { ensureDeviceChartOnElement } from '@/utils/chart/device-chart-boot.util'

/** 图表实例类型：来自按需加载 echarts 入口模块的 init 返回值 */
type EchartsModule = typeof EchartsModuleNS
type ChartInst = ReturnType<EchartsModule['default']['init']>

const props = withDefaults(
  defineProps<{
    /** 侧栏可见时再初始化/刷新图表，避免 display:none 时 clientWidth 为 0 */
    visible?: boolean
  }>(),
  {
    visible: true,
  },
)

// 实体 store，用于聚合统计指标与图表数据。
const entitiesStore = useEntitiesStore()
// 状态分布图与域分布图的 DOM 容器引用。
const statusChartRef = ref<HTMLElement | null>(null)
const domainChartRef = ref<HTMLElement | null>(null)
// 刷新中标志，控制刷新按钮动画。
const refreshing = ref(false)
// ECharts 实例缓存，避免重复 init；卸载时 dispose 释放。
let statusChart: ChartInst | null = null
let domainChart: ChartInst | null = null
// 容器尺寸观察者，触发图表 resize。
let resizeObserver: ResizeObserver | null = null
// 渲染调度标志，防止 nextTick 内重复调度。
let renderScheduled = false

/**
 * 计算属性：统计指标。遍历所有实体计算总数、在线数、低电量数，离线数由总数减在线数得出。
 */
const stats = computed(() => {
  const devices = entitiesStore.entities
  const keys = Object.keys(devices)
  const total = keys.length
  let online = 0
  let lowBattery = 0

  for (const key of keys) {
    const d = devices[key]
    if (d.state !== 'unavailable' && d.state !== 'unknown') online++
    const batteryLevel = d.attributes?.battery_level
    if (typeof batteryLevel === 'number' && batteryLevel <= 20) lowBattery++
  }

  return {
    total,
    online,
    offline: total - online,
    lowBattery,
  }
})

/**
 * 计算属性：按域聚合的实体计数 Map。
 */
const domainCounts = computed(() => {
  const counts: Record<string, number> = {}
  const devices = entitiesStore.entities
  for (const key of Object.keys(devices)) {
    const domain = key.split('.')[0]
    counts[domain] = (counts[domain] || 0) + 1
  }
  return counts
})

/**
 * 计算属性：按计数降序取 Top 8 域，附加本地化标签，用于域分布饼图。
 */
const sortedDomains = computed(() => {
  return Object.entries(domainCounts.value)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count]) => ({
      id,
      label: getDomainLabel(id),
      count,
    }))
})

/**
 * 类型守卫：判断图表容器是否已具备非零宽高，避免在 display:none 时初始化图表。
 * @param el 容器元素
 * @returns 是否可初始化
 */
/**
 * 调度渲染：通过 nextTick 合并多次变更触发的渲染请求，renderScheduled 防重入。
 */
function scheduleRender() {
  if (renderScheduled) return
  renderScheduled = true
  nextTick(() => {
    renderScheduled = false
    renderCharts()
  })
}

// 实际渲染入口：visible 为 false 时跳过，避免不可见时无谓计算。
async function renderCharts() {
  if (!props.visible) return
  await initStatusChart()
  await initDomainChart()
}

/**
 * 初始化/更新状态分布饼图：在线（绿）vs 离线（红）双扇区。
 * setOption 第二参 true 表示不合并而是全量替换。
 * echarts vendor 通过动态 import 按需加载，保持大依赖独立分包。
 */
async function initStatusChart() {
  statusChart = await ensureDeviceChartOnElement(statusChartRef.value, statusChart, () => props.visible)
  if (!statusChart) return

  const option: EChartsCoreOption = {
    ...deviceChartBase(),
    tooltip: deviceSidebarPieTooltip(),
    series: [
      {
        type: 'pie',
        radius: ['46%', '66%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: DEVICE_CHART_COLORS.sliceBorder,
          borderWidth: 1,
        },
        label: { show: false },
        emphasis: {
          scale: false,
          focus: 'self',
          label: { show: false },
          itemStyle: { shadowBlur: 6, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.35)' },
        },
        labelLine: { show: false },
        data: [
          { value: stats.value.online, name: '在线', itemStyle: { color: '#34d399' } },
          { value: stats.value.offline, name: '离线', itemStyle: { color: '#f87171' } },
        ],
      },
    ],
  }

  statusChart.setOption(option, true)
  statusChart.resize()
}

/**
 * 初始化/更新域分布饼图：按 sortedDomains 渲染 Top 8 域，使用 entityDomainColor 统一语义色。
 */
async function initDomainChart() {
  domainChart = await ensureDeviceChartOnElement(domainChartRef.value, domainChart, () => props.visible)
  if (!domainChart) return

  const data = sortedDomains.value.map((d) => ({
    value: d.count,
    name: d.label,
    itemStyle: { color: entityDomainColor(d.id) },
  }))

  const option: EChartsCoreOption = {
    ...deviceChartBase(),
    tooltip: deviceSidebarPieTooltip(),
    series: [
      {
        type: 'pie',
        radius: ['46%', '66%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: DEVICE_CHART_COLORS.sliceBorder,
          borderWidth: 1,
        },
        label: { show: false },
        emphasis: {
          scale: false,
          focus: 'self',
          label: { show: false },
          itemStyle: { shadowBlur: 6, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.35)' },
        },
        labelLine: { show: false },
        data,
      },
    ],
  }

  domainChart.setOption(option, true)
  domainChart.resize()
}

// 手动刷新：触发重新渲染（数据来自 store 响应式更新，此处主要为图表重绘）。
function refreshData() {
  refreshing.value = true
  scheduleRender()
  refreshing.value = false
}

// 窗口尺寸变化时同步 resize 两个图表实例。
function handleResize() {
  if (!props.visible) return
  statusChart?.resize()
  domainChart?.resize()
}

// 监听总数/在线数变化触发重渲染。
watch(() => [stats.value.total, stats.value.online], scheduleRender)

// 监听域分布变化触发重渲染。
watch(sortedDomains, scheduleRender)

// 监听可见性：变为可见时调度渲染，确保从隐藏切换回来时图表正确绘制。
watch(
  () => props.visible,
  (visible) => {
    if (visible) scheduleRender()
  },
)

/**
 * 挂载：调度首渲染，注册 ResizeObserver 观察两图表容器与 window resize 监听。
 */
onMounted(() => {
  scheduleRender()
  resizeObserver = new ResizeObserver(() => scheduleRender())
  if (statusChartRef.value) resizeObserver.observe(statusChartRef.value)
  if (domainChartRef.value) resizeObserver.observe(domainChartRef.value)
  window.addEventListener('resize', handleResize)
})

/**
 * 卸载：断开 ResizeObserver、移除 resize 监听、dispose 图表实例并置空，避免内存泄漏。
 */
onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', handleResize)
  statusChart?.dispose()
  domainChart?.dispose()
  statusChart = null
  domainChart = null
})
</script>

<style scoped>
.dsd-icon-info {
  color: var(--set-info, #7dd3fc);
}
.dsd-icon-violet {
  color: var(--premium-accent-violet, #a78bfa);
}
</style>
