/**
 * 能源分析微件 EnergyAnalyticsWidget
 *
 * 所属模块：frontend/widgets/energy
 * 职责：综合展示能源用量分析，包括：功率趋势图、能耗基线、设备能耗排名（24h）、
 *       温度-功率关联分析；支持 Redis 降级到 HA 历史的兜底链路。
 * 依赖：
 *   - vue (computed/ref/watch)
 *   - vue-router (RouterLink)
 *   - @/components/common/ApiQueryState、HaStatusDegradeBanner
 *   - @/composables/api/useWidgetApiQuery
 *   - @/stores/entities.store、@/stores/ha-bindings.store
 *   - @/services/api/energy（ranking / correlate / baseline）
 *   - @/utils/config/frontend-config（图表小时数与配置纪元）
 *   - @/composables/energy/useEnergySource（resolvePowerEntityId）
 *   - @/utils/entity/entity-derived.util（domainIndexToArray）
 *   - @/utils/chart/energy-trend-source.util（loadEnergyTrendWithFallback 降级加载）
 *   - @/utils/chart/life-charts.util（buildPowerTrendOption）
 *   - @/composables/life/useLifeChartHost（useHubChart）
 */
<template>
  <!-- 根容器 -->
  <div class="energy-analytics">
    <!-- 头部：标题 + 刷新按钮 -->
    <header :class="['energy-analytics__head', embedded && 'energy-analytics__head--embedded']">
      <h3 v-if="!embedded">{{ '能源分析' }}</h3>
      <span v-else class="energy-analytics__label">{{ '能源分析' }}</span>
      <button
        type="button"
        class="energy-analytics__refresh"
        :disabled="loading"
        @click="query.retry()"
      >
        {{ '刷新' }}
      </button>
    </header>

    <ApiQueryState
      :loading="loading"
      :error="loadError"
      error-title="能源分析加载失败"
      @retry="query.retry()"
    >
      <HaStatusDegradeBanner
        v-if="redisDegraded && !usingHaHistory && hasPartialData"
        :redis-ready="false"
        :show-retry="false"
        :force-visible="true"
        class="energy-analytics__degrade"
      />
      <p v-if="usingHaHistory && hasData" class="energy-analytics__ha-badge">{{ '使用 HA 历史' }}</p>
      <VEmptyState
        v-if="!powerEntity && !hasPartialData"
        compact
        tone="amber"
        :title="'未绑定能耗数据源'"
      >
        <template #action>
          <RouterLink
            :to="SETTINGS_ROUTES.setupWizard()"
            class="v-empty__link v-empty__link--inline"
            >{{ '前往配置' }}</RouterLink
          >
        </template>
      </VEmptyState>
      <VEmptyState
        v-else-if="redisDegraded && !usingHaHistory && !hasData"
        compact
        tone="amber"
        :title="'历史数据服务未就绪'"
        :description="'Redis 时间线不可用，且 HA Recorder 暂无功率采样'"
      >
        <template #action>
          <button type="button" class="v-empty__link v-empty__link--inline" @click="query.retry()">
            {{ '重试' }}
          </button>
        </template>
      </VEmptyState>
      <VEmptyState
        v-else-if="!hasData"
        compact
        tone="neutral"
        :title="'暂无分析数据'"
        :description="'等待采集或设备运行后刷新；也可检查 HA Recorder 是否启用'"
      />

      <template v-else>
        <!-- 主体展示区：左侧趋势图 + 右侧侧栏 -->
        <div class="energy-analytics__stage">
          <section v-if="trendSummary || trendPoints.length" class="energy-analytics__block energy-analytics__block--chart">
            <h4>{{ `${chartHoursLabel} 趋势` }}</h4>
            <p v-if="trendSummary">
              {{
                `采样 ${trendSummary.count} 点 · 均值 ${trendSummary.avg} · 峰值 ${trendSummary.max}`
              }}
            </p>
            <div
              v-if="trendPoints.length"
              ref="trendChartRef"
              class="energy-analytics__chart"
            />
          </section>

          <div class="energy-analytics__rail">
            <section v-if="baseline" class="energy-analytics__block">
              <h4>{{ '能耗基线' }}</h4>
              <p>
                {{
                  `样本 ${baseline.count} · 均值 ${baseline.average?.toFixed?.(1) ?? baseline.average}`
                }}
              </p>
            </section>

            <section v-if="ranking.length" class="energy-analytics__block">
              <h4>{{ '设备能耗排名（24h）' }}</h4>
              <ul class="energy-analytics__list">
                <li v-for="row in ranking" :key="row.entityId">
                  <span class="energy-analytics__rank">#{{ row.rank }}</span>
                  <span>{{ row.entityId }}</span>
                  <span class="energy-analytics__muted">{{ `${row.kwh ?? '--'} kWh` }}</span>
                </li>
              </ul>
            </section>
          </div>
        </div>

        <section v-if="correlate.length" class="energy-analytics__block">
          <h4>{{ '温度-功率关联' }}</h4>
          <ul class="energy-analytics__list">
            <li v-for="row in correlate.slice(0, 5)" :key="row.temperature">
              {{ `${row.temperature}°C → 均值 ${row.avgPower}W（${row.samples} 样本）` }}
            </li>
          </ul>
        </section>
      </template>
    </ApiQueryState>
  </div>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 AnalyticsWidget 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import HaStatusDegradeBanner from '@/components/common/HaStatusDegradeBanner.vue'
import { useWidgetApiQuery } from '@/composables/api/useWidgetApiQuery'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  getEnergyRanking,
  getEnergyCorrelate,
  getEnergyBaseline,
} from '@/services/api/energy'
import { getEnergyChartHours, configEpoch } from '@/utils/config/frontend-config'
import { resolvePowerEntityId } from '@/utils/energy/source.util'
import { useHaBindingsStore } from '@/stores/ha-bindings.store'
import { domainIndexToArray } from '@/utils/entity/derived.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { loadEnergyTrendWithFallback } from '@/utils/chart/energy-trend-source.util'
import { buildPowerTrendOption } from '@/utils/chart/life-charts.util'
import { useHubChart } from '@/composables/life/useLifeChartHost'

/**
 * 组件 Props。
 * @property {boolean} embedded - 是否嵌入模式（标题改展示标签），默认 false
 * @property {boolean} panelVisible - 面板是否可见（控制轮询），默认 true
 */
const props = defineProps({
  embedded: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

// HA 绑定仓库（读取 statsSensors 配置）
const haBindingsStore = useHaBindingsStore()
// 实体状态仓库
const entitiesStore = useEntitiesStore()

/**
 * 汇总趋势数据：返回有效采样点数、均值、峰值。
 * @param {Array<{value:number}>} points - 趋势数据点
 * @returns {{count:number,avg:number,max:number}|null} 汇总对象，无有效数据时返回 null
 */
function summarizeTrend(points) {
  const values = (points || []).map((p) => p.value).filter((v) => v > 0)
  if (!values.length) return null
  return {
    count: values.length,
    avg: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
    max: Math.max(...values),
  }
}

/**
 * 格式化趋势数据点的横轴标签：total > 48 时仅显示时，否则显示时:分。
 * @param {number|string} ts - 时间戳或时间字符串
 * @param {number} index - 数据点索引（兜底用）
 * @param {number} total - 数据点总数
 * @returns {string} 横轴标签
 */
function formatTrendLabel(ts, index, total) {
  if (ts == null) return String(index + 1)
  const d = new Date(typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : ts)
  if (Number.isNaN(d.getTime())) return String(index + 1)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (total > 48) return `${hh}`
  return `${hh}:${mm}`
}

/**
 * 将后端趋势点映射为图表数据点（统一 value/ts/label 字段）。
 * 兼容多种字段命名（value/state、ts/timestamp/time）。
 * @param {Array} points - 原始趋势点
 * @returns {Array<{value:number, ts:number|undefined, label:string}>} 标准化数据点
 */
function mapTrendPoints(points) {
  return (points || []).map((p, i) => {
    const value = Number(p.value ?? p.state ?? 0) || 0
    const tsRaw = p.ts ?? p.timestamp ?? p.time
    let ts
    if (typeof tsRaw === 'number') ts = tsRaw < 1e12 ? tsRaw * 1000 : tsRaw
    else if (typeof tsRaw === 'string') {
      const parsed = new Date(tsRaw).getTime()
      ts = Number.isFinite(parsed) ? parsed : undefined
    }
    return {
      value,
      ts,
      label: formatTrendLabel(ts ?? tsRaw, i, points.length),
    }
  })
}

/**
 * 图表回看小时数（来自前端配置，引用 configEpoch 触发响应式刷新）。
 * @returns {number} 小时数
 */
const chartHours = computed(() => {
  void configEpoch.value
  return getEnergyChartHours()
})

/** 统计传感器绑定配置。 */
const statsSensors = computed(() => haBindingsStore.statsSensors || {})
/**
 * 解析主功率传感器 entity_id（依赖 sensor 域纪元触发刷新）。
 * @returns {string} 功率实体 ID，未绑定时返回空字符串
 */
const powerEntity = computed(() => {
  void entitiesStore.getDomainEpoch('sensor')
  return resolvePowerEntityId(statsSensors.value, entitiesStore.entities)
})
/**
 * 查找可用的温度传感器 entity_id（名称含 temp 且状态有效）。
 * @returns {string} 温度实体 ID，未找到时返回空字符串
 */
const tempEntity = computed(() => {
  void entitiesStore.getDomainEpoch('sensor')
  const ids = domainIndexToArray(entitiesStore.domainEntityIndex.get('sensor'))
  for (const key of ids) {
    if (!key.includes('temp')) continue
    const e = entitiesStore.entities[key]
    if (e?.state && e.state !== 'unavailable' && e.state !== 'unknown') return key
  }
  return ''
})

/**
 * 能源分析聚合查询：并发加载排名/趋势/基线/关联，支持部分失败兜底；
 * 5 分钟轮询，panelVisible 控制启停。
 * 内部按 Redis -> HA 历史链路降级，并标记 redisDegraded/usingHaHistory。
 */
const query = useWidgetApiQuery(
  'energyAnalytics',
  async () => {
    const partialErrors = []
    let redisDegraded = false
    let usingHaHistory = false
    let trendSummary = null
    let trendPoints = []
    let baseline = null
    let ranking = []
    let correlate = []

    try {
      const rankRes = await getEnergyRanking(8)
      ranking = Array.isArray(rankRes.data) ? rankRes.data : []
    } catch {
      partialErrors.push('排名加载失败')
    }

    if (powerEntity.value) {
      const trend = await loadEnergyTrendWithFallback(powerEntity.value, chartHours.value, {
        isPrimaryUsable: (points) => summarizeTrend(points) != null,
      })
      redisDegraded = trend.redisDegraded
      usingHaHistory = trend.usingHaHistory
      trendPoints = mapTrendPoints(Array.isArray(trend.points) ? trend.points : [])
      trendSummary = summarizeTrend(trendPoints)
      if (!trendSummary && !trendPoints.length) partialErrors.push('趋势加载失败')
      try {
        const baseRes = await getEnergyBaseline(powerEntity.value)
        if (baseRes.data && !baseRes.data.error) baseline = baseRes.data
      } catch {
        partialErrors.push('基线加载失败')
      }
    }

    if (tempEntity.value && powerEntity.value) {
      try {
        const corrRes = await getEnergyCorrelate(tempEntity.value, powerEntity.value)
        correlate = Array.isArray(corrRes.data) ? corrRes.data : []
      } catch {
        partialErrors.push('关联分析失败')
      }
    }

    if (partialErrors.length) {
      const hasAny =
        ranking.length > 0 ||
        !!trendSummary ||
        trendPoints.length > 0 ||
        !!baseline ||
        correlate.length > 0
      if (!hasAny) throw new Error(partialErrors[0])
    }

    return {
      data: {
        trendSummary,
        trendPoints,
        baseline,
        ranking,
        correlate,
        redisDegraded,
        usingHaHistory,
        partialErrors,
      },
      meta: {
        redisReady: redisDegraded && !usingHaHistory ? false : undefined,
        degraded: redisDegraded || usingHaHistory || partialErrors.length > 0,
      },
    }
  },
  5 * 60 * 1000,
  {
    pollKey: 'widget:EnergyAnalyticsWidget',
    panelVisible: () => props.panelVisible,
    immediate: false,
  },
)

// 加载中状态
const loading = query.loading
// 加载错误信息
const loadError = query.error
/** 趋势汇总（采样数/均值/峰值）。 */
const trendSummary = computed(() => query.data?.value?.trendSummary ?? null)
/** 趋势数据点数组（供图表渲染）。 */
const trendPoints = computed(() => query.data?.value?.trendPoints || [])
/** 能耗基线（样本数/均值）。 */
const baseline = computed(() => query.data?.value?.baseline ?? null)
/** 设备能耗排名（24h，按 kWh 降序）。 */
const ranking = computed(() => query.data?.value?.ranking || [])
/** 温度-功率关联分析结果。 */
const correlate = computed(() => query.data?.value?.correlate || [])
/** Redis 是否处于降级态（含查询级 degraded 标记）。 */
const redisDegraded = computed(() =>
  Boolean(query.data?.value?.redisDegraded || query.degraded?.value),
)
/** 是否正在使用 HA 历史兜底。 */
const usingHaHistory = computed(() => Boolean(query.data?.value?.usingHaHistory))
/**
 * 图表时长展示标签：整 24 小时倍数显示为 Nd，否则 Nh。
 * @returns {string} 时长标签
 */
const chartHoursLabel = computed(() => {
  const h = chartHours.value
  return h >= 24 && h % 24 === 0 ? `${h / 24}d` : `${h}h`
})

/** 是否存在部分数据（已绑定功率实体即视为有部分数据）。 */
const hasPartialData = computed(() => !!powerEntity.value)
/** 是否存在任意可用分析数据（控制空状态展示）。 */
const hasData = computed(
  () =>
    trendSummary.value ||
    trendPoints.value.length ||
    baseline.value ||
    ranking.value.length ||
    correlate.value.length,
)

// 趋势图表容器引用，供 useHubChart 挂载
const trendChartRef = ref(null)
// 通过 useHubChart 将功率趋势图绑定到 trendChartRef，trendPoints 变化时自动重绘
useHubChart(
  trendChartRef,
  () => buildPowerTrendOption(trendPoints.value),
  [trendPoints],
)

// 面板可见时立即执行一次查询
watch(
  () => props.panelVisible,
  (visible) => {
    if (visible) void query.execute()
  },
  { immediate: true },
)

// 功率实体或图表时长变化时重新查询
watch([powerEntity, chartHours], () => {
  if (props.panelVisible) void query.execute()
})
</script>

<style scoped src="./styles/AnalyticsWidget.css"></style>
