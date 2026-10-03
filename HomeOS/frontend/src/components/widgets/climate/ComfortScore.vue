<template>
  <!-- ComfortScore 舒适度卡片：环形进度展示舒适度得分、雷达图与近 7 日趋势 -->
  <div :class="['cf-card', embedded ? 'cf-card--embedded' : 'widget-glass-card']">
    <div v-if="!embedded" class="cf-header">
      <Smile class="w-3.5 h-3.5 cf-icon" />
      <span class="cf-title">{{ '舒适度' }}</span>
    </div>
    <div class="cf-body">
      <ApiQueryState
        :loading="iaqLoading && !effectiveIaqError"
        :error="effectiveIaqError"
        error-title="舒适度数据加载失败"
        tone="emerald"
        @retry="retryIaq"
      >
        <VEmptyState v-if="!hasData" compact tone="emerald" :title="'传感器数据不足'" />
        <template v-else>
          <div class="cf-split">
            <div class="cf-hero">
              <div class="cf-score-wrap" :style="{ '--cf-ring': scoreColor }">
                <div class="cf-ring">
                  <svg viewBox="0 0 100 100" class="cf-svg" aria-hidden="true">
                    <circle
                      cx="50"
                      cy="50"
                      r="36"
                      fill="none"
                      stroke="rgba(255,255,255,0.06)"
                      stroke-width="7"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="36"
                      fill="none"
                      :stroke="scoreColor"
                      stroke-width="7"
                      stroke-linecap="round"
                      :stroke-dasharray="226"
                      :stroke-dashoffset="226 - (score / 100) * 226"
                      transform="rotate(-90, 50, 50)"
                      class="cf-ring-progress"
                    />
                  </svg>
                  <div class="cf-score-text">
                    <span class="cf-score-num" :style="{ color: scoreColor }">{{ score }}</span>
                    <span class="cf-score-grade">{{ '舒适' }}</span>
                  </div>
                </div>
              </div>
              <div class="cf-hero-meta">
                <span
                  class="cf-hero-badge"
                  :style="{
                    color: scoreColor,
                    background: `color-mix(in srgb, ${scoreColor} 18%, transparent)`,
                    borderColor: `color-mix(in srgb, ${scoreColor} 30%, transparent)`,
                  }"
                >
                  {{ scoreLabel }}
                </span>
                <p class="cf-hero-source">{{ scoreSource }}</p>
                <div v-if="outdoorTemp != null" class="cf-compare">
                  <span class="cf-compare-label">{{ '室外' }}</span>
                  <span class="cf-compare-val">{{ outdoorTemp }}°C</span>
                  <span class="cf-compare-diff" :class="tempDiffClass">{{ tempDiffLabel }}</span>
                </div>
              </div>
            </div>
            <div ref="radarRef" class="cf-radar" />
          </div>

          <div v-if="details.length" class="cf-details">
            <div class="cf-details__group">
              <span class="cf-details__caption">{{ '空气' }}</span>
              <div class="cf-details__row cf-details__row--3">
                <div
                  v-for="d in airDetails"
                  :key="d.label"
                  :class="['cf-det', d.empty && 'cf-det--empty', !d.empty && d.warn && 'cf-det--warn']"
                >
                  <span class="cf-det-label">{{ d.label }}</span>
                  <div class="cf-det-main">
                    <span class="cf-det-val">{{ d.empty ? '—' : d.value }}</span>
                    <span v-if="!d.empty && d.unit" class="cf-det-unit">{{ d.unit }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="cf-details__group">
              <span class="cf-details__caption">{{ '温湿度' }}</span>
              <div class="cf-details__row cf-details__row--2">
                <div
                  v-for="d in climateDetails"
                  :key="d.label"
                  :class="['cf-det', d.empty && 'cf-det--empty', !d.empty && d.warn && 'cf-det--warn']"
                >
                  <span class="cf-det-label">{{ d.label }}</span>
                  <div class="cf-det-main">
                    <span class="cf-det-val">{{ d.empty ? '—' : d.value }}</span>
                    <span v-if="!d.empty && d.unit" class="cf-det-unit">{{ d.unit }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="iaqTrend.length >= 2" class="cf-trend cf-trend--chart">
            <div class="cf-trend__head">
              <span class="cf-trend-label">{{ '污染指数 · 近 7 日' }}</span>
              <span :class="['cf-trend-val', iaqTrendDelta <= 0 ? 'cf-trend-down' : 'cf-trend-up']">
                {{ iaqTrendDelta <= 0 ? '↓' : '↑' }} {{ Math.abs(iaqTrendDelta) }}
              </span>
            </div>
            <div ref="sparkRef" class="cf-spark" />
          </div>
        </template>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * ComfortScore - 舒适度卡片组件
 * 职责：基于室内空气质量（IAQ）或本地传感器（温湿度/CO₂/PM2.5）计算舒适度分数，
 *      并以环形进度、雷达图与近 7 日趋势小图展示。
 * 关键依赖：
 * - fetchEnvIaq / fetchEnvHealth / fetchEnvTrend：拉取 IAQ、传感器映射与趋势；
 * - useWeatherEntity：读取室外温度用于温差异步展示；
 * - useHubChart + buildComfortRadarOption / buildIaqSparklineOption：渲染图表；
 * - env-score.util：分数、配色、文案与展示项构建工具。
 * Props:
 * - iaqResult/iaqLoadError：外部注入的 IAQ 结果与错误（避免重复拉取）；
 * - embedded：嵌入模式开关；
 * - panelVisible：面板可见性，控制数据加载时机。
 */
import { computed, ref, onMounted, watch } from 'vue'
import { Smile } from '@lucide/vue'
import { fetchEnvTrend, fetchEnvHealth } from '@/services/api/system'
import { notifyError } from '@/services/notify'

import { useEntitiesStore } from '@/stores/entities.store'
import { useWeatherEntity } from '@/composables/entity/useWeatherEntity'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { fetchEnvIaq } from '@/composables/climate/useEnvIaq'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import {
  iaqToHealthScore,
  healthScoreColor,
  healthScoreLabel,
  buildEnvMetricDisplayItems,
} from '@/utils/climate/env-score.util'
import {
  buildComfortRadarOption,
  buildIaqSparklineOption,
} from '@/utils/chart/env-energy-hub-charts.util'

const props = defineProps({
  iaqResult: { type: Object, default: null },
  iaqLoadError: { type: String, default: '' },
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

const entitiesStore = useEntitiesStore()
const { entity: weatherEnt } = useWeatherEntity()
const iaqTrend = ref([])
const localIaq = ref(null)
const localIaqError = ref('')
const iaqLoading = ref(false)
const radarRef = ref(null)
const sparkRef = ref(null)

// 优先使用外部注入的 IAQ 结果，否则回退到本地拉取
const iaqFromApi = computed(() => props.iaqResult ?? localIaq.value)
const effectiveIaqError = computed(() => props.iaqLoadError || localIaqError.value)

async function loadIaqScore() {
  // 已有外部注入时跳过本地拉取，避免重复请求
  if (props.iaqResult) return
  iaqLoading.value = true
  localIaqError.value = ''
  let sensorMap = null
  try {
    const healthRes = await fetchEnvHealth()
    sensorMap = healthRes?.data?.sensorMap || null
  } catch {
    sensorMap = null
  }
  const outcome = await fetchEnvIaq(entitiesStore.entities, 60_000, sensorMap)
  if (outcome.status === 'ok') {
    localIaq.value = outcome.data
  } else if (outcome.status === 'error') {
    localIaq.value = null
    localIaqError.value = outcome.message
  } else {
    localIaq.value = null
  }
  iaqLoading.value = false
}

function retryIaq() {
  // 重试时同时刷新得分与趋势
  void loadIaqScore()
  void loadIaqTrend()
}

async function loadIaqTrend() {
  try {
    const { data } = await fetchEnvTrend({ days: 7 })
    iaqTrend.value = Array.isArray(data) ? data.filter((d) => d.avgIaq != null) : []
  } catch (e) {
    iaqTrend.value = []
    notifyError(e, '加载失败', { silent: true })
  }
}

const iaqTrendDelta = computed(() => {
  // 近 7 日趋势首末差值，用于展示升降幅度
  const rows = iaqTrend.value
  if (rows.length < 2) return 0
  const first = rows[0].avgIaq
  const last = rows[rows.length - 1].avgIaq
  if (first == null || last == null) return 0
  return Math.round(last - first)
})

onMounted(() => {
  if (props.panelVisible !== false) {
    loadIaqTrend()
    loadIaqScore()
  }
})

watch(
  () => props.panelVisible,
  (visible) => {
    if (visible && !iaqTrend.value.length) loadIaqTrend()
    if (visible && !props.iaqResult) loadIaqScore()
  },
)

watch(
  () => props.iaqResult,
  (result) => {
    // 外部结果被替换时清空本地缓存与错误，避免旧数据混入
    if (result) {
      localIaq.value = null
      localIaqError.value = ''
    }
  },
)

/** 按关键词遍历传感器索引查找首个有效数值 */
function findSensorVal(keywords) {
  void entitiesStore.derivedEpoch
  void entitiesStore.getDomainEpoch('sensor')
  for (const kw of keywords) {
    const sensorIds = entitiesStore.sensorIndex?.get('sensor') || []
    for (let i = 0; i < sensorIds.length; i++) {
      const key = sensorIds[i]
      if (key.includes(kw)) {
        const v = parseFloat(entitiesStore.entities[key]?.state)
        if (!isNaN(v)) return v
      }
    }
  }
  return null
}

const temp = computed(() => findSensorVal(['temperature', 'temp']))
const hum = computed(() => findSensorVal(['humidity']))
const co2 = computed(() => findSensorVal(['co2', 'carbon_dioxide']))
const pm25 = computed(() => findSensorVal(['pm25', 'pm2.5', 'pm_2_5']))

const hasData = computed(() => temp.value !== null || iaqFromApi.value?.iaq != null)

// 舒适度评分：优先使用 IAQ 综合指数；否则基于本地温湿度/CO₂/PM2.5 启发式估算
const score = computed(() => {
  if (iaqFromApi.value?.iaq != null) {
    return iaqToHealthScore(iaqFromApi.value.iaq)
  }
  let s = 50
  if (temp.value !== null) {
    const t = temp.value
    if (t >= 20 && t <= 26) s += 20
    else if (t >= 18 && t <= 28) s += 10
    else if (t < 16 || t > 30) s -= 15
    else s -= 5
  }
  if (hum.value !== null) {
    const h = hum.value
    if (h >= 40 && h <= 60) s += 15
    else if (h >= 30 && h <= 70) s += 5
    else s -= 10
  }
  if (co2.value !== null) {
    const c = co2.value
    if (c <= 800) s += 10
    else if (c <= 1200) s += 0
    else s -= 15
  }
  if (pm25.value !== null) {
    const p = pm25.value
    if (p <= 12) s += 10
    else if (p <= 35) s += 0
    else s -= 10
  }
  return Math.max(0, Math.min(100, Math.round(s)))
})

const scoreColor = computed(() => healthScoreColor(score.value))
const scoreLabel = computed(() => healthScoreLabel(score.value))
const scoreSource = computed(() =>
  iaqFromApi.value?.iaq != null ? '基于 IAQ 综合指数' : '基于本地传感器估算',
)

const outdoorTemp = computed(() => {
  const t = weatherEnt.value?.attributes?.temperature
  return t != null ? Math.round(parseFloat(t) * 10) / 10 : null
})

const tempDiffLabel = computed(() => {
  if (temp.value == null || outdoorTemp.value == null) return ''
  const diff = temp.value - outdoorTemp.value
  const sign = diff > 0 ? '+' : ''
  return `室内 ${sign}${diff.toFixed(1)}°C`
})

const tempDiffClass = computed(() => {
  // 室内外温差超过 8°C 警告，4-8°C 中等，否则正常
  if (temp.value == null || outdoorTemp.value == null) return ''
  const diff = Math.abs(temp.value - outdoorTemp.value)
  if (diff > 8) return 'cf-compare-diff--warn'
  if (diff > 4) return 'cf-compare-diff--mid'
  return 'cf-compare-diff--ok'
})

const AIR_LABELS = new Set(['PM2.5', 'CO₂', 'TVOC'])

const details = computed(() => {
  // 有 IAQ 数据时使用统一构建函数；否则基于本地传感器估算
  if (iaqFromApi.value?.readings || iaqFromApi.value?.iaq != null) {
    return buildEnvMetricDisplayItems(iaqFromApi.value).map((item) => ({
      label: item.label,
      value: item.valueNum,
      unit: item.unit,
      warn: item.warn,
      empty: item.empty,
      score: item.score,
    }))
  }
  const d = [
    {
      label: 'PM2.5',
      value: pm25.value != null ? pm25.value.toFixed(0) : '—',
      unit: 'µg/m³',
      warn: pm25.value != null && pm25.value > 35,
      empty: pm25.value == null,
      score: null,
    },
    {
      label: 'CO₂',
      value: co2.value != null ? co2.value.toFixed(0) : '—',
      unit: 'ppm',
      warn: co2.value != null && co2.value > 1200,
      empty: co2.value == null,
      score: null,
    },
    {
      label: 'TVOC',
      value: '—',
      unit: 'ppb',
      warn: false,
      empty: true,
      score: null,
    },
    {
      label: '温度',
      value: temp.value != null ? temp.value.toFixed(1) : '—',
      unit: '°C',
      warn: temp.value != null && (temp.value > 28 || temp.value < 18),
      empty: temp.value == null,
      score: null,
    },
    {
      label: '湿度',
      value: hum.value != null ? hum.value.toFixed(0) : '—',
      unit: '%',
      warn: hum.value != null && (hum.value > 70 || hum.value < 30),
      empty: hum.value == null,
      score: null,
    },
  ]
  return d
})

const airDetails = computed(() => details.value.filter((item) => AIR_LABELS.has(item.label)))
const climateDetails = computed(() => details.value.filter((item) => !AIR_LABELS.has(item.label)))

const radarItems = computed(() => {
  // 雷达图分项：优先使用服务端返回的子项分数，否则根据本地数据估算
  const scores = iaqFromApi.value?.scores
  if (scores && typeof scores === 'object') {
    return [
      { label: 'PM2.5', score: scores.pm25 ?? null, empty: scores.pm25 == null },
      { label: 'CO₂', score: scores.co2 ?? null, empty: scores.co2 == null },
      { label: 'TVOC', score: scores.tvoc ?? null, empty: scores.tvoc == null },
      { label: '温度', score: scores.temp ?? null, empty: scores.temp == null },
      { label: '湿度', score: scores.humidity ?? null, empty: scores.humidity == null },
    ]
  }
  return details.value.map((d) => ({
    label: d.label,
    score: d.warn ? 70 : d.empty ? null : 25,
    empty: d.empty,
  }))
})

// 雷达图与近 7 日趋势小图，依赖对应数据源自动重绘
useHubChart(radarRef, () => buildComfortRadarOption(radarItems.value), [radarItems, hasData])
useHubChart(
  sparkRef,
  () => buildIaqSparklineOption(iaqTrend.value),
  [iaqTrend],
)
</script>

<style scoped src="./styles/ComfortScore.css"></style>
