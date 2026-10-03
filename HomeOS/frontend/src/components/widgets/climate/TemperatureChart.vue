<template>
  <!-- TemperatureChart 全屋温度趋势图：拉取温度传感器历史并按曲线展示 -->
  <div class="temp-card widget-glass-card">
    <div v-if="!embedded" class="temp-card__header">
      <div class="temp-card__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
        </svg>
      </div>
      <span class="temp-card__title">{{ '全屋温度趋势图' }}</span>
      <span class="temp-card__range">{{ chartHoursLabel }}</span>
    </div>

    <ApiQueryState
      :loading="loading && series.length === 0"
      :error="loadError"
      error-title="温度趋势加载失败"
      tone="rose"
      @retry="fetchData"
    >
      <div v-if="series.length === 0" class="temp-card__state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
        </svg>
        <span class="temp-card__state-title">{{ '暂无温度数据' }}</span>
        <span class="temp-card__state-hint">{{ '请在面板设置中配置传感器 ID' }}</span>
      </div>

      <template v-else>
        <div ref="chartRef" class="temp-card__chart"></div>
        <div v-if="series.length > 1" class="temp-card__legend">
          <button
            v-for="(s, i) in series"
            :key="s.name"
            :class="['temp-card__legend-item', { 'temp-card__legend-item--off': legendHidden[i] }]"
            @click="toggleLegend(i)"
          >
            <span
              class="temp-card__legend-dot"
              :style="{
                background: legendHidden[i]
                  ? 'rgba(255,255,255,0.15)'
                  : COLORS[i % COLORS.length].main,
              }"
            ></span>
            <span class="temp-card__legend-name">{{ s.name }}</span>
          </button>
        </div>
      </template>
    </ApiQueryState>
  </div>
</template>

<script setup>
/**
 * TemperatureChart - 全屋温度趋势图组件
 * 职责：根据 config.sensorIds 拉取 HA 历史数据，绘制多条温度曲线，支持图例切换与
 *      5 分钟轮询刷新；面板不可见时销毁图表实例以节省资源。
 * 关键依赖：useScheduledPoll、echarts、useFetchGeneration、observeChartResize。
 * Props:
 * - config：含 sensorIds（逗号分隔的实体 ID）；
 * - panelVisible：面板可见性，决定是否拉取与渲染；
 * - embedded：嵌入模式开关。
 */
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { useScheduledPoll } from '@/composables/widget/useScheduledPoll'
import { getKioskAnimationOptions } from '@/utils/chart/kiosk-animation'
import { chartLinearGradient } from '@/utils/chart/chart-primitives'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useEntitiesStore } from '@/stores/entities.store'
import { fetchHaHistory } from '@/services/api/entities'
import { formatAuditTimestamp } from '@/utils/format/locale-format.util'
import { notifyError } from '@/services/notify'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { getHaHistoryHours } from '@/utils/config/frontend-config'
import { observeChartResize } from '@/utils/ui/chart-resize.util'
import { useFetchGeneration } from '@/composables/ui/useFetchGeneration'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
const props = defineProps({
  config: {},
  panelVisible: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
})

const authStore = useAuthStore()
const entitiesStore = useEntitiesStore()
const loading = ref(true)
const loadError = ref('')
const { bumpGeneration, isStale } = useFetchGeneration()
const series = ref([])
const chartRef = ref(null)
const legendHidden = ref([])
let chartInstance = null

// 时间窗标签：>=24h 用天（D），否则用小时（H）
const chartHoursLabel = computed(() => {
  const h = getHaHistoryHours()
  return h >= 24 && h % 24 === 0 ? `${h / 24}D` : `${h}H`
})

// 系列配色：main 为线色，gradient 为填充渐变
const COLORS = [
  { main: '#FF6B6B', gradient: ['rgba(255,107,107,0.25)', 'rgba(255,107,107,0)'] },
  { main: '#66D4CF', gradient: ['rgba(102,212,207,0.25)', 'rgba(102,212,207,0)'] },
  { main: '#0A84FF', gradient: ['rgba(10,132,255,0.25)', 'rgba(10,132,255,0)'] },
  { main: '#BF5AF2', gradient: ['rgba(191,90,242,0.25)', 'rgba(191,90,242,0)'] },
  { main: '#FF9F0A', gradient: ['rgba(255,159,10,0.25)', 'rgba(255,159,10,0)'] },
]

/** 切换图例显示/隐藏并同步派发 ECharts 事件 */
function toggleLegend(i) {
  const hidden = !legendHidden.value[i]
  legendHidden.value = legendHidden.value.map((v, j) => (j === i ? hidden : v))
  if (!chartInstance) return
  chartInstance.dispatchAction({ type: 'legendToggleSelect', name: series.value[i]?.name })
}

function now() {
  return Date.now()
}
const xMin = computed(() => now() - getHaHistoryHours() * 3600 * 1000)
const xMax = computed(() => now())

function buildOption() {
  const s = series.value
  const legendSelected = {}
  s.forEach((serie, idx) => {
    legendSelected[serie.name] = !legendHidden.value[idx]
  })

  const seriesConfig = s.map((serie, idx) => {
    const c = COLORS[idx % COLORS.length]
    return {
      id: serie.name,
      name: serie.name,
      type: 'line',
      data: serie.data.map((d) => [d.x, d.y]),
      smooth: 0.4,
      symbol: 'none',
      lineStyle: { width: 2, color: c.main },
      areaStyle: {
        color: chartLinearGradient([
          [0, c.gradient[0]],
          [1, c.gradient[1]],
        ]),
      },
      emphasis: {
        lineStyle: { width: 3, shadowColor: c.main, shadowBlur: 8 },
        areaStyle: {
          color: chartLinearGradient([
            [0, `rgba(${hexRgb(c.main)},0.4)`],
            [1, `rgba(${hexRgb(c.main)},0)`],
          ]),
        },
      },
    }
  })

  return {
    ...getKioskAnimationOptions(),
    backgroundColor: 'transparent',
    legend: {
      show: false,
      selected: legendSelected,
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(18,18,28,0.98)',
      borderColor: 'var(--premium-border-strong)',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: '#fff', fontSize: 11 },
      axisPointer: {
        type: 'cross',
        snap: true,
        lineStyle: { color: 'rgba(255,255,255,0.12)', type: 'dashed', width: 1 },
        label: {
          show: true,
          backgroundColor: 'rgba(18,18,28,0.95)',
          color: '#fff',
          fontSize: 10,
          fontWeight: 600,
          formatter: (p) => {
            if (p.axisDimension === 'x') {
              const t = new Date(p.value)
              return pad(t.getHours()) + ':' + pad(t.getMinutes())
            }
            return Number(p.value).toFixed(1) + '°'
          },
        },
      },
      formatter: (params) => {
        if (!params || !params.length) return ''
        const d = params[0].data
        const t = d[0] ? new Date(d[0]) : null
        const ts = t ? formatAuditTimestamp(t) : ''
        let html = `<div style="color:rgba(255,255,255,0.6);font-size:var(--premium-fs-caption);margin-bottom:8px;font-weight:600">${ts}</div>`
        for (const p of params) {
          html +=
            '<div style="display:flex;align-items:center;margin-bottom:3px">' +
            `<span style="width:8px;height:8px;border-radius:2px;background:${p.color};margin-right:8px;flex:none;box-shadow:0 0 4px ${p.color}"></span>` +
            `<span style="flex:1">${p.seriesName}</span>` +
            `<b style="margin-left:14px">${Number(p.data[1] ?? 0).toFixed(1)}°C</b>` +
            '</div>'
        }
        return html
      },
    },
    grid: { left: 48, right: 12, top: 8, bottom: 12 },
    xAxis: {
      type: 'time',
      min: xMin.value,
      max: xMax.value,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
      axisPointer: { label: { offset: [0, 16] } },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: 'rgba(255,255,255,0.58)',
        fontSize: 9,
        fontWeight: 400,
        formatter: (v) => v + '°',
      },
      splitLine: {
        lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' },
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisPointer: { label: { offset: [-16, 0] } },
    },
    series: seriesConfig,
  }
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function hexRgb(hex) {
  return `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`
}

/**
 * echarts vendor 通过动态 import 按需加载，保持大依赖独立分包。
 * 导入是异步的：期间面板可能隐藏或容器被卸载，重新校验避免僵尸实例。
 */
async function updateChart() {
  if (!props.panelVisible || !chartRef.value) return
  if (!chartInstance) {
    const echarts = (await import('@/utils/chart/echarts')).default
    if (!props.panelVisible || !chartRef.value) return
    // 并发调用可能已在 await 期间完成初始化
    if (!chartInstance) chartInstance = echarts.init(chartRef.value)
  }
  chartInstance.setOption(buildOption(), true)
}

function onResize() {
  if (!props.panelVisible) return
  chartInstance?.resize()
}

/** 从 config.sensorIds（逗号分隔字符串）解析实体 ID 列表 */
function getSensorIds() {
  if (props.config?.sensorIds) {
    return props.config.sensorIds
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s)
  }
  return []
}

async function fetchData() {
  if (!props.panelVisible) return
  if (!authStore.isAuthenticated) {
    loading.value = false
    return
  }
  const sensorIds = getSensorIds()
  if (sensorIds.length === 0) {
    loading.value = false
    return
  }
  const token = bumpGeneration()
  loadError.value = ''
  try {
    const ids = sensorIds.join(',')
    const res = await fetchHaHistory(ids, getHaHistoryHours())
    if (isStale(token)) return
    const newSeries = []
    for (const entityData of res.data) {
      if (!entityData || entityData.length === 0) continue
      const entityId = entityData[0].entity_id
      // 名称去除「温度」后缀避免冗余展示
      let name = getEntityDisplayName(entityId, entitiesStore.entities[entityId])
      name = name.replace(/温度$/g, '').trim()
      const data = entityData
        .map((e) => ({ x: new Date(e.last_changed).getTime(), y: parseFloat(e.state) }))
        .filter((e) => !isNaN(e.y))
      newSeries.push({ entityId, name, data })
    }
    // 按配置顺序排序，保证图例与配置一致
    newSeries.sort((a, b) => {
      const ia = sensorIds.indexOf(a.entityId)
      const ib = sensorIds.indexOf(b.entityId)
      return ia - ib
    })
    series.value = newSeries
    nextTick(() => updateChart())
  } catch (e) {
    series.value = []
    loadError.value = getApiErrorMessage(e, '获取温度历史失败')
    notifyError(e, '获取温度历史')
  } finally {
    loading.value = false
  }
}

watch(
  series,
  () => {
    nextTick(() => updateChart())
  },
  { deep: true },
)
watch(
  () => authStore.isAuthenticated,
  (t) => {
    if (t) fetchData()
  },
)
watch(
  () => props.panelVisible,
  (visible) => {
    if (visible) {
      // 初始处于离屏的图表此前未拉取历史，转可见时需补一次 fetch，否则一直空白直到下次轮询
      if (series.value.length === 0) void fetchData()
      else nextTick(() => updateChart())
    } else {
      chartInstance?.dispose()
      chartInstance = null
    }
  },
)

let disposeResize = null
let initTimer = null

watch(
  chartRef,
  (el) => {
    disposeResize?.()
    disposeResize = observeChartResize(el, onResize)
  },
  { flush: 'post' },
)

onMounted(() => {
  // 延迟 1s 启动，避免与首屏其他渲染争抢资源
  initTimer = setTimeout(() => {
    if (props.panelVisible) void fetchData()
  }, 1000)
})
useScheduledPoll(
  () => {
    if (props.panelVisible) return fetchData()
  },
  5 * 60 * 1000,
  { key: 'widget:TemperatureChart', immediate: false },
)

onUnmounted(() => {
  if (initTimer) clearTimeout(initTimer)
  disposeResize?.()
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style scoped src="./styles/TemperatureChart.css"></style>
