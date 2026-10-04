<!--
  @file DeviceStateHistoryPanel.vue
  @module 设备详情/状态历史面板
  @description 设备详情页的「状态历史」子面板：展示样本记录数、状态变更、属性变更与最近变更四项指标，
               并以时间线图表（状态色带 + 属性变更点）与明细表格渲染状态变更条目。
               支持时间范围切换（6h/24h/7d/30d），范围受全局 maxQueryHours 约束并自动钳制。
               数据由 useDeviceStateHistory 组合式函数提供；图表使用 ECharts，仅在 visible 且
               DOM 尺寸就绪时渲染，并通过 ResizeObserver 自适应。
  @dependencies vue（ref/computed/watch/nextTick/onMounted/onUnmounted）、@lucide/vue、echarts、
                useDeviceStateHistory（availableDeviceHistoryRanges/clampDeviceHistoryRange/hoursForRange）、
                DeviceChartHeader、device-chart-copy.util/device-chart-theme、displayEventState、
                displayEntityStateLabel、formatDetailedDateTimeOrDash、frontend-config（事件日志配置）。
-->
<template>
  <div ref="panelRef" class="device-detail-tab device-history-tab">
    <div
      v-if="!loading && events.length"
      class="dev-metric-grid device-detail-tab__metrics device-detail-tab__metrics--4"
    >
      <div class="dev-metric">
        <div class="dev-metric__icon"><Activity class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ sampleRecordCount }}</div>
          <div class="dev-metric__label">{{ truncated ? '样本记录' : '记录总数' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--green"><TrendingUp class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ historyStats.stateChanges }}</div>
          <div class="dev-metric__label">{{ truncated ? '样本状态变更' : '状态变更' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon dev-metric__icon--amber"><List class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value">{{ historyStats.attrChanges }}</div>
          <div class="dev-metric__label">{{ truncated ? '样本属性变更' : '属性变更' }}</div>
        </div>
      </div>
      <div class="dev-metric">
        <div class="dev-metric__icon"><Clock class="w-4 h-4" /></div>
        <div>
          <div class="dev-metric__value device-history-tab__metric-time">
            {{ historyStats.latestLabel }}
          </div>
          <div class="dev-metric__label">{{ '最近变更' }}</div>
        </div>
      </div>
    </div>

    <div
      class="dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop device-detail-tab__card device-history-panel"
    >
      <div class="dev-card__header">
        <div class="dev-card__title-row">
          <Activity class="w-4 h-4 dsh-icon-info" />
          <span class="dev-card__title">{{ '状态历史' }}</span>
          <span v-if="total > 0" class="device-history-panel__count">
            {{ truncated ? `共 ${total} 条 · 显示 ${events.length}` : `${total} 条` }}
          </span>
        </div>
        <div class="device-history-panel__actions">
          <div class="dev-range">
            <button
              v-for="range in historyRanges"
              :key="range.value"
              type="button"
              :class="['dev-range__btn', selectedRange === range.value && 'dev-range__btn--active']"
              @click="selectedRange = range.value"
            >
              {{ range.label }}
            </button>
          </div>
          <button
            type="button"
            class="dev-btn-refresh"
            :disabled="loading"
            :aria-label="'刷新'"
            :title="'刷新'"
            @click="refresh"
          >
            <RefreshCw :class="['w-3 h-3', loading && 'animate-spin']" />
          </button>
          <router-link
            :to="eventsLink"
            class="list-page__link-btn device-history-panel__events-link"
          >
            {{ '完整事件' }}
          </router-link>
        </div>
      </div>

      <div v-if="loading && !events.length" class="dev-state-block device-detail-tab__fallback">
        <RefreshCw class="w-4 h-4 animate-spin" />
        <span>{{ '加载历史数据…' }}</span>
      </div>

      <div
        v-else-if="error"
        class="dev-state-block dev-state-block--error device-detail-tab__fallback"
      >
        <AlertCircle class="w-4 h-4" />
        <span>{{ error }}</span>
        <button type="button" class="dev-range__btn" @click="refresh">{{ '重试' }}</button>
      </div>

      <div v-else-if="!events.length" class="dev-state-block device-detail-tab__fallback">
        <BarChart3 class="w-4 h-4 opacity-40" />
        <span>{{ emptyHistoryMessage }}</span>
      </div>

      <template v-else>
        <div
          class="device-detail-tab__panel device-detail-tab__panel--split device-history-panel__body"
        >
        <div class="dev-chart-wrap device-history-panel__chart">
          <DeviceChartHeader
            :icon="TrendingUp"
            icon-class="w-3 h-3 dsh-icon-info"
            :title="DEVICE_CHART_COPY.historyTrend.title"
            :description="DEVICE_CHART_COPY.historyTrend.desc"
            :hint="chartHint"
          />
          <div
            ref="chartRef"
            class="device-history-panel__canvas dev-chart-canvas device-detail-tab__canvas"
          ></div>
        </div>

        <div class="dev-chart-wrap device-history-panel__list-wrap">
          <DeviceChartHeader
            :icon="List"
            icon-class="w-3 h-3 dsh-icon-violet"
            title="状态变更日志"
            description="与左侧轨迹对应；悬停行可在图上定位同一条变更。"
            :hint="`显示 ${events.length} 条`"
          />
          <div class="device-history-panel__list-scroll">
            <table class="device-history-panel__table">
              <thead>
                <tr>
                  <th>{{ '时间' }}</th>
                  <th>{{ '旧状态' }}</th>
                  <th>{{ '新状态' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="evt in events"
                  :key="evt.id"
                  :class="[
                    'device-history-panel__row',
                    highlightedId === evt.id && 'device-history-panel__row--highlight',
                  ]"
                  @mouseenter="highlightedId = evt.id"
                  @mouseleave="highlightedId = null"
                >
                  <td
                    class="device-history-panel__time"
                    :title="formatDetailedDateTimeOrDash(evt.createdAt)"
                  >
                    {{ formatListTime(evt.createdAt) }}
                  </td>
                  <td>
                    <code
                      v-if="evt.attrText"
                      class="device-history-panel__state device-history-panel__state--old"
                      >{{ '—' }}</code
                    >
                    <code
                      v-else-if="evt.oldState"
                      class="device-history-panel__state device-history-panel__state--old"
                      >{{ formatEventState(evt.oldState) }}</code
                    >
                    <span v-else class="device-history-panel__muted">{{ '—' }}</span>
                  </td>
                  <td>
                    <code
                      v-if="evt.attrText"
                      class="device-history-panel__state device-history-panel__state--attr"
                      >{{ displayEventState(evt) }}</code
                    >
                    <code
                      v-else-if="evt.state"
                      class="device-history-panel__state device-history-panel__state--new"
                      >{{ formatEventState(evt.state) }}</code
                    >
                    <span v-else class="device-history-panel__muted">{{ '—' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  Activity,
  RefreshCw,
  AlertCircle,
  BarChart3,
  TrendingUp,
  List,
  Clock,
} from '@lucide/vue'
import type { EChartsCoreOption } from 'echarts/core'
import type * as EchartsModuleNS from '@/utils/chart/echarts'
import {
  useDeviceStateHistory,
  availableDeviceHistoryRanges,
  clampDeviceHistoryRange,
  hoursForRange,
  type DeviceHistoryRange,
  type DeviceStateHistoryEvent,
} from '@/composables/device/useDeviceStateHistory'
import { displayEventState } from '@/utils/events/events-display.util'
import { displayEntityStateLabel } from '@/constants/entity-state-labels'
import { formatDetailedDateTimeOrDash } from '@/utils/format/locale-format.util'
import DeviceChartHeader from '@/components/devices/DeviceChartHeader.vue'
import { DEVICE_CHART_COPY } from '@/utils/chart/device-chart-copy.util'
import {
  deviceChartBase,
  deviceChartTooltip,
  DEVICE_CHART_COLORS,
  chartVerticalGradient,
} from '@/utils/chart/device-chart-theme'
import { configEpoch, getEventLogConfig } from '@/utils/config/frontend-config'

/** 图表实例类型：来自按需加载 echarts 入口模块的 init 返回值 */
type EchartsModule = typeof EchartsModuleNS
type ChartInst = ReturnType<EchartsModule['default']['init']>

const props = withDefaults(
  defineProps<{
    entityId: string
    visible?: boolean
  }>(),
  {
    visible: true,
  },
)

const selectedRange = ref<DeviceHistoryRange>('24h')
const entityIdRef = computed(() => props.entityId)
const rangeRef = computed(() => selectedRange.value)
const visibleRef = computed(() => props.visible)

const { loading, error, events, total, truncated, refresh } = useDeviceStateHistory(
  entityIdRef,
  rangeRef,
  visibleRef,
)

const sampleRecordCount = computed(() => (truncated.value ? events.value.length : total.value))

const maxQueryHours = computed(() => {
  void configEpoch.value
  return getEventLogConfig().maxQueryHours
})
const historyRanges = computed(() => availableDeviceHistoryRanges(maxQueryHours.value))
const selectedRangeHours = computed(() => hoursForRange(selectedRange.value))
const eventsLink = computed(() => ({
  path: '/events',
  query: {
    entity_id: props.entityId,
    hours: String(selectedRangeHours.value),
  },
}))

watch(
  maxQueryHours,
  (maxHours) => {
    selectedRange.value = clampDeviceHistoryRange(selectedRange.value, maxHours)
  },
  { immediate: true },
)

const emptyHistoryMessage = computed(() => '该时段暂无状态变更条目')

const panelRef = ref<HTMLElement | null>(null)
const chartRef = ref<HTMLElement | null>(null)
const highlightedId = ref<number | null>(null)

let chartInstance: ChartInst | null = null
let resizeObserver: ResizeObserver | null = null
let renderScheduled = false

const chartHint = computed(() => {
  const labels: Record<DeviceHistoryRange, string> = {
    '6h': '近 6 小时',
    '24h': '近 24 小时',
    '7d': '近 7 天',
    '30d': '近 30 天',
  }
  return labels[selectedRange.value]
})

const historyStats = computed(() => {
  const list = events.value
  const stateChanges = list.filter((e) => !e.attrText).length
  const attrChanges = list.filter((e) => e.attrText).length
  const latest = list[0]?.createdAt
  return {
    stateChanges,
    attrChanges,
    latestLabel: latest ? formatListTime(latest) : '—',
  }
})

const chartEventsAsc = computed(() =>
  [...events.value].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  ),
)

const stateCategories = computed(() => {
  const set = new Set<string>()
  for (const evt of chartEventsAsc.value) {
    if (evt.attrText) {
      set.add('属性变更')
      continue
    }
    if (evt.state) set.add(evt.state)
    if (evt.oldState) set.add(evt.oldState)
  }
  return [...set]
})

function formatEventState(state: string) {
  return displayEntityStateLabel(props.entityId, state)
}

function formatListTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  if (sameDay) return `${h}:${m}:${s}`
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${mo}-${day} ${h}:${m}`
}

function stateColor(state: string): string {
  const map: Record<string, string> = {
    on: '#34d399',
    off: '#6b7280',
    open: '#34d399',
    closed: '#6b7280',
    locked: '#34d399',
    unlocked: '#6b7280',
    playing: '#c084fc',
    idle: '#6b7280',
    unavailable: '#f87171',
    unknown: '#94a3b8',
    属性变更: '#a78bfa',
  }
  return map[state] || DEVICE_CHART_COLORS.accent
}

function chartDomReady(): boolean {
  if (!chartRef.value) return false
  const { clientWidth, clientHeight } = chartRef.value
  return clientWidth > 0 && clientHeight > 0
}

function scheduleRender() {
  if (renderScheduled || !props.visible) return
  renderScheduled = true
  nextTick(() => {
    renderScheduled = false
    renderChart()
  })
}

function eventChartLabel(evt: DeviceStateHistoryEvent): string {
  if (evt.attrText) return '属性变更'
  return evt.state || evt.oldState || '—'
}

/**
 * echarts vendor 通过动态 import 按需加载，保持大依赖独立分包。
 * 导入是异步的：期间组件可能隐藏/卸载或容器变化，重新校验避免僵尸实例。
 */
async function renderChart() {
  if (!props.visible || !chartEventsAsc.value.length || !chartDomReady()) return

  if (!chartInstance) {
    const echarts = (await import('@/utils/chart/echarts')).default
    if (!props.visible || !chartEventsAsc.value.length || !chartDomReady()) return
    // 并发调用可能已在 await 期间完成初始化
    if (!chartInstance) chartInstance = echarts.init(chartRef.value)
  }

  const categories = stateCategories.value.length ? stateCategories.value : ['—']
  const indexOf = (state: string) => Math.max(0, categories.indexOf(state))

  const lineData = chartEventsAsc.value.map((evt) => {
    const ts = new Date(evt.createdAt).getTime()
    return [ts, indexOf(eventChartLabel(evt))] as [number, number]
  })

  const option: EChartsCoreOption = {
    ...deviceChartBase(),
    tooltip: {
      ...deviceChartTooltip(),
      trigger: 'axis',
      confine: true,
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params : [params]
        if (!items.length) return ''
        const axisVal = (items[0] as { axisValue?: number }).axisValue
        const ts = typeof axisVal === 'number' ? axisVal : Number(axisVal)
        const evt =
          chartEventsAsc.value.find((e) => Math.abs(new Date(e.createdAt).getTime() - ts) < 1000) ??
          chartEventsAsc.value.reduce((best, e) => {
            const diff = Math.abs(new Date(e.createdAt).getTime() - ts)
            const bestDiff = Math.abs(new Date(best.createdAt).getTime() - ts)
            return diff < bestDiff ? e : best
          })
        if (!evt) return ''
        const time = formatDetailedDateTimeOrDash(evt.createdAt)
        if (evt.attrText) {
          return `<div style="font-size:var(--premium-fs-micro);color:rgba(255,255,255,0.55);margin-bottom:4px">${time}</div><div>${displayEventState(evt)}</div>`
        }
        const from = evt.oldState
          ? `<span style="color:#fca5a5">${formatEventState(evt.oldState)}</span>`
          : '—'
        const to = evt.state
          ? `<span style="color:#6ee7b7">${formatEventState(evt.state)}</span>`
          : '—'
        return `<div style="font-size:var(--premium-fs-micro);color:rgba(255,255,255,0.55);margin-bottom:4px">${time}</div><div>${from} → ${to}</div>`
      },
    },
    grid: { left: 48, right: 16, top: 20, bottom: 28 },
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: DEVICE_CHART_COLORS.axis,
        fontSize: 9,
        formatter: (value: number) => {
          const d = new Date(value)
          if (selectedRange.value === '7d' || selectedRange.value === '30d') {
            return `${d.getMonth() + 1}/${d.getDate()}`
          }
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        },
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      name: '状态类别',
      nameTextStyle: { color: DEVICE_CHART_COLORS.axisName, fontSize: 10 },
      data: categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: DEVICE_CHART_COLORS.axis,
        fontSize: 10,
        formatter: (val: string) => {
          const label = val === '属性变更' ? val : formatEventState(val)
          return label.length > 10 ? `${label.slice(0, 9)}…` : label
        },
      },
      splitLine: { lineStyle: { color: DEVICE_CHART_COLORS.grid } },
    },
    series: [
      {
        name: '状态变更',
        type: 'line',
        step: 'end',
        showSymbol: true,
        symbolSize: 6,
        data: lineData,
        lineStyle: { width: 2, color: DEVICE_CHART_COLORS.accent },
        itemStyle: {
          color: (params: { data?: [number, number] }) => {
            const idx = params.data?.[1]
            if (typeof idx !== 'number') return DEVICE_CHART_COLORS.accent
            return stateColor(categories[idx] || '')
          },
        },
        areaStyle: { color: chartVerticalGradient(DEVICE_CHART_COLORS.accent, 0.3, 0.02) },
      },
    ],
  }

  chartInstance.setOption(option, true)
  chartInstance.resize()
}

function handleResize() {
  if (!props.visible) return
  chartInstance?.resize()
}

watch([events, () => props.visible, selectedRange], () => scheduleRender(), { deep: true })

watch(
  () => props.visible,
  (visible) => {
    if (visible) scheduleRender()
  },
)

onMounted(() => {
  resizeObserver = new ResizeObserver(() => scheduleRender())
  if (panelRef.value) resizeObserver.observe(panelRef.value)
  if (chartRef.value) resizeObserver.observe(chartRef.value)
  window.addEventListener('resize', handleResize)
  scheduleRender()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style src="./styles/DevicePanels.css"></style>
