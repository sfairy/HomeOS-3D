<template>
  <div class="sc-card widget-glass-card">
    <!-- 头部：非嵌入模式下展示标题与 tab 切换（或固定传感器提示） -->
    <div v-if="!embedded" class="sc-header">
      <h3 class="sc-title"><Activity class="w-3.5 h-3.5 sc-icon" />{{ '传感器趋势' }}</h3>
      <!-- 多 tab 模式：温度 / 湿度 / PM2.5 / CO₂ -->
      <div class="sc-tabs" v-if="!hasFixedSensor">
        <button
          v-for="t in tabs"
          :key="t.key"
          :class="['sc-tab', activeTab === t.key ? 'sc-tab--active' : '']"
          @click="activeTab = t.key"
        >
          {{ t.label }}
        </button>
      </div>
      <!-- 固定传感器模式：仅展示温度趋势 -->
      <span v-else class="sc-fixed-hint">{{ '已绑定传感器，仅显示温度趋势' }}</span>
    </div>
    <div class="sc-body">
      <!-- API 查询状态容器：tone=emerald 绿色主题 -->
      <ApiQueryState
        :loading="loading"
        :error="loadError"
        error-title="传感器趋势加载失败"
        tone="emerald"
        @retry="fetchData"
      >
        <!-- 空态：未检测到任何数据 -->
        <VEmptyState
          v-if="currentData.length === 0"
          compact
          tone="emerald"
          icon="📈"
          :title="'未检测到数据'"
        />
        <template v-else>
          <div ref="chartRef" class="sc-chart" />
        </template>
      </ApiQueryState>
    </div>
  </div>
</template>
<script setup>
/**
 * @file SensorTrendChart.vue
 * @module widgets/climate
 * @description 传感器趋势图表：展示环境传感器（温度/湿度/PM2.5/CO2）的历史走势，
 *              支持「固定传感器」与「自动发现」两种模式，并按 tab 切换不同指标。
 *              数据来源为 HA 历史接口，按 polling 周期（10 分钟）自动刷新。
 *
 * @dependencies
 *  - vue: ref/computed/onMounted/onUnmounted/watch/nextTick
 *  - @/composables/widget/useScheduledPoll: 定时轮询
 *  - @/utils/chart/echarts: ECharts 实例与动画选项
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @lucide/vue: Activity 图标
 *  - @/stores/entities.store: 实体索引（用于自动发现）
 *  - @/stores/auth.store: 鉴权状态
 *  - @/services/api/entities: HA 历史接口
 *  - @/services/notify: 错误通知
 *  - @/utils/core/error-message: 错误信息提取
 *  - @/utils/config/frontend-config: 历史采样时长配置
 *  - @/utils/ui/chart-resize.util: 图表尺寸监听
 *  - @/composables/ui/useFetchGeneration: 请求代际管理（避免竞态）
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useScheduledPoll } from '@/composables/widget/useScheduledPoll'
import { getKioskAnimationOptions } from '@/utils/chart/kiosk-animation'
import { chartLinearGradient } from '@/utils/chart/chart-primitives'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { Activity } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAuthStore } from '@/stores/auth.store'
import { fetchHaHistory } from '@/services/api/entities'
import { notifyError } from '@/services/notify'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { getHaHistoryHours } from '@/utils/config/frontend-config'
import { observeChartResize } from '@/utils/ui/chart-resize.util'
import { useFetchGeneration } from '@/composables/ui/useFetchGeneration'

const props = defineProps({
  config: {},
  panelVisible: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false },
})
const entitiesStore = useEntitiesStore()
const authStore = useAuthStore()
// 当前激活 tab：temp / humidity / pm25 / co2
const activeTab = ref('temp')
// ECharts 容器 DOM 引用
const chartRef = ref(null)
// 加载与错误状态
const loading = ref(true)
const loadError = ref('')
// 请求代际管理：避免快速切换 tab 时旧请求覆盖新数据
const { bumpGeneration, isStale } = useFetchGeneration()
// HA 历史原始数据（按 entity_id 分组）
const rawData = ref([])
// ECharts 实例（延迟初始化）
let chartInstance = null

// 是否配置了固定传感器 ID（仅展示温度趋势）
const hasFixedSensor = computed(() => !!props.config?.sensorIds?.trim())

/**
 * tab 配置：温度 / 湿度 / PM2.5 / CO2
 * 每项包含 key、中文标签、单位、折线颜色与自动发现用的 sensor 关键字
 */
const tabs = computed(() => [
  { key: 'temp', label: '温度', unit: '°C', color: '#FF6B6B', autoSensor: 'temperature' },
  { key: 'humidity', label: '湿度', unit: '%', color: '#0A84FF', autoSensor: 'humidity' },
  { key: 'pm25', label: 'PM2.5', unit: 'µg/m³', color: '#FF9500', autoSensor: 'pm25' },
  { key: 'co2', label: 'CO₂', unit: 'ppm', color: '#8B5CF6', autoSensor: 'co2' },
])

// 当前激活 tab 的完整配置
const currentTab = computed(() => tabs.value.find((tab) => tab.key === activeTab.value))

/**
 * 预构建传感器索引 map（按 keyword 索引），基于 store 派生 sensorIndex。
 * 显式访问 onlineCount 以建立对在线状态变化的响应式依赖。
 * @returns {Object} keyword -> entity_id 的映射
 */
const sensorIndexByKeyword = computed(() => {
  void entitiesStore.onlineCount
  const map = {}
  const keywords = [
    'temperature',
    'temp',
    'humidity',
    'pm25',
    'pm2.5',
    'pm_2_5',
    'co2',
    'carbon_dioxide',
  ]
  for (const domain of ['sensor', 'binary_sensor']) {
    const ids = entitiesStore.sensorIndex.get(domain) || []
    for (let i = 0; i < ids.length; i++) {
      const key = ids[i]
      const lower = key.toLowerCase()
      for (let k = 0; k < keywords.length; k++) {
        const kw = keywords[k]
        if (lower.includes(kw) && !map[kw]) map[kw] = key
      }
    }
  }
  return map
})
/**
 * 根据 activeTab 自动发现匹配的传感器 entity_id。
 * 按各 tab 预设的关键字顺序在 sensorIndexByKeyword 中查找。
 * @returns {string|null} 匹配到的 entity_id，未找到时返回 null
 */
function autoDiscoverSensor() {
  const kws = {
    temp: ['temperature', 'temp'],
    humidity: ['humidity'],
    pm25: ['pm25', 'pm2.5', 'pm_2_5'],
    co2: ['co2', 'carbon_dioxide'],
  }
  const search = kws[activeTab.value] || []
  const idx = sensorIndexByKeyword.value
  for (const kw of search) {
    if (idx[kw]) return idx[kw]
  }
  return null
}

/**
 * 当前选中的传感器 entity_id：
 *  - 优先使用 config.sensorIds 中的第一个
 *  - 否则通过 autoDiscoverSensor 自动发现
 * @returns {string|undefined} entity_id
 */
const sensorId = computed(() => {
  if (props.config?.sensorIds) return props.config.sensorIds.split(',')[0]?.trim()
  return autoDiscoverSensor()
})

/**
 * 当前 tab 的图表数据：从 rawData 中按 sensorId 过滤并转为 {x,y} 数组。
 * 过滤掉 state 解析失败的点。
 * @returns {Array<{x:number,y:number}>} 时序数据点
 */
const currentData = computed(() => {
  if (!sensorId.value || !rawData.value) return []
  for (const group of rawData.value) {
    if (group && group.length > 0 && group[0].entity_id === sensorId.value) {
      return group
        .map((e) => ({
          x: new Date(e.last_changed).getTime(),
          y: parseFloat(e.state),
        }))
        .filter((e) => !isNaN(e.y))
    }
  }
  return []
})

/**
 * 构建 ECharts 配置：折线图 + 渐变区域，按 tab 颜色绘制。
 * @returns {Object} ECharts option
 */
function buildOption() {
  const tab = currentTab.value
  const data = currentData.value
  return {
    ...getKioskAnimationOptions(),
    backgroundColor: 'transparent',
    grid: { left: 36, right: 8, top: 4, bottom: 8 },
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9, formatter: (v) => v + tab.unit },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name: tab.label,
        type: 'line',
        data: data.map((d) => [d.x, d.y]),
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { width: 2, color: tab.color },
        areaStyle: {
          color: chartLinearGradient([
            [0, tab.color + '33'],
            [1, tab.color + '00'],
          ]),
        },
      },
    ],
  }
}

/**
 * 更新（或初始化）ECharts 图表。
 * 仅在 panelVisible 且 chartRef 存在时执行，避免无谓渲染。
 * echarts vendor 通过动态 import 按需加载，保持大依赖独立分包。
 */
async function updateChart() {
  if (!props.panelVisible || !chartRef.value) return
  if (!chartInstance) {
    const echarts = (await import('@/utils/chart/echarts')).default
    // 导入是异步的：期间面板可能隐藏或容器被卸载，重新校验避免僵尸实例
    if (!props.panelVisible || !chartRef.value) return
    // 并发调用可能已在 await 期间完成初始化
    if (!chartInstance) chartInstance = echarts.init(chartRef.value)
  }
  chartInstance.setOption(buildOption(), true)
}

/** 响应容器尺寸变化，重绘图表 */
function onResize() {
  if (!props.panelVisible) return
  chartInstance?.resize()
}

// 防抖定时器：sensorId 切换时合并多次变更，避免连续请求
let fetchDebounceTimer = null

/**
 * 防抖拉取数据：300ms 内多次调用合并为一次。
 */
function debounceFetch() {
  if (fetchDebounceTimer) clearTimeout(fetchDebounceTimer)
  fetchDebounceTimer = setTimeout(() => {
    fetchDebounceTimer = null
    void fetchData()
  }, 300)
}

/**
 * 拉取 HA 历史数据并更新图表。
 * 通过 bumpGeneration 获取请求代际 token，响应返回后校验避免竞态。
 * @returns {Promise<void>}
 * @throws {Error} 拉取失败时设置 loadError 并通过 notifyError 提示
 */
async function fetchData() {
  if (!props.panelVisible) return
  // 未鉴权或缺少 sensorId 时直接结束，清空错误
  if (!authStore.isAuthenticated || !sensorId.value) {
    loading.value = false
    loadError.value = ''
    return
  }
  const token = bumpGeneration()
  loadError.value = ''
  try {
    loading.value = true
    const res = await fetchHaHistory(sensorId.value, getHaHistoryHours())
    // 校验代际：若期间发起新请求，则丢弃本次结果
    if (isStale(token)) return
    rawData.value = res.data || []
    loading.value = false
    nextTick(() => updateChart())
  } catch (e) {
    rawData.value = []
    loadError.value = getApiErrorMessage(e, '获取传感器数据失败')
    notifyError(e, '获取传感器数据')
    loading.value = false
  }
}
// sensorId 变化时防抖拉取新数据
watch(
  () => sensorId.value,
  () => {
    debounceFetch()
  },
)
// tab 切换时仅更新图表配置（数据已加载）
watch(activeTab, () => {
  nextTick(() => updateChart())
})
// 面板可见性变化：可见时按需拉取或重绘，隐藏时释放 ECharts 实例
watch(
  () => props.panelVisible,
  (visible) => {
    if (visible) {
      if (rawData.value.length === 0) void fetchData()
      else nextTick(() => updateChart())
    } else {
      chartInstance?.dispose()
      chartInstance = null
    }
  },
)

// 监听容器 ref 变化，绑定/解绑尺寸观察器
let disposeResize = null

watch(
  chartRef,
  (el) => {
    disposeResize?.()
    disposeResize = observeChartResize(el, onResize)
  },
  { flush: 'post' },
)

onMounted(() => {
  if (props.panelVisible) void fetchData()
})

// 定时轮询：每 10 分钟刷新一次（immediate=false 避免与 onMounted 重复）
useScheduledPoll(
  () => {
    if (props.panelVisible) return fetchData()
  },
  10 * 60 * 1000,
  { key: 'widget:SensorTrendChart', immediate: false },
)

onUnmounted(() => {
  if (fetchDebounceTimer) clearTimeout(fetchDebounceTimer)
  fetchDebounceTimer = null
  disposeResize?.()
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style scoped src="./styles/SensorTrendChart.css"></style>