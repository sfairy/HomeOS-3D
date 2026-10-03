<!--
  EnergyInsight.vue / components/widgets/energy
  能耗洞察面板：能源 Hub 或独立嵌入使用，左侧「洞察」tab 展示本月/上月用电
  对比、日均、环比进度条、分路功率饼图；右侧「电价」tab 内嵌 PricingAlertPanel。
  Props: defaultTab(insight|pricing) 默认页签 / embedded 嵌入态
         / hideTabs 嵌入 Dashboard 时隐藏 tab 切换 / panelVisible 可见性
  依赖：defineAsyncComponent 懒加载 PricingAlertPanel；
        composables: useEnergySource 电表 + 分路数据访问；
        services/api/energy getEnergyCompare + 分路 + 电价接口；
        Pinia: useEntitiesStore Redis 就绪判断；
        @homeos/shared hasEnergyConfig 能源配置判定；
        RouterLink 跳转首装向导绑定电表实体。
  注意：hasGridData 与 hasCircuitData 任一满足即展示数据；否则出空态引导配置。
-->
<template>
  <div :class="['ep-card', embedded ? 'ep-card--embedded' : 'widget-glass-card']">
    <div v-if="!embedded && !hideTabs" class="ep-header">
      <TrendingUp class="w-3.5 h-3.5 ei-icon" />
      <span class="ep-title">{{ '能耗洞察' }}</span>
      <span
        v-if="activeTab === 'insight' && hasGridData"
        class="ep-source"
        :title="'本月/预估等读数来自 HA 实体 sensor.ele_*'"
        >{{ 'HA 实体' }}</span
      >
      <span
        v-else-if="activeTab === 'insight' && hasCircuitData"
        class="ep-source ep-source--circuit"
        >{{ '分路' }}</span
      >
    </div>

    <div v-else-if="embedded && hideTabs" class="ep-toolbar ep-toolbar--embedded">
      <span class="ep-toolbar-label">{{ '能耗洞察' }}</span>
      <span
        v-if="hasGridData"
        class="ep-source"
        :title="'本月/预估等读数来自 HA 实体 sensor.ele_*'"
        >{{ 'HA 实体' }}</span
      >
      <span v-else-if="hasCircuitData" class="ep-source ep-source--circuit">{{ '分路' }}</span>
    </div>

    <div v-if="!hideTabs" class="ep-tabs">
      <button
        type="button"
        :class="['ep-tab', activeTab === 'insight' && 'ep-tab--active']"
        @click="activeTab = 'insight'"
      >
        {{ '洞察' }}
      </button>
      <button
        type="button"
        :class="['ep-tab', activeTab === 'pricing' && 'ep-tab--active']"
        @click="activeTab = 'pricing'"
      >
        {{ '电价' }}
      </button>
    </div>

    <PricingAlertPanel
      v-if="activeTab === 'pricing'"
      embedded
      class="ep-pricing"
      :panel-visible="panelVisible"
    />

    <div v-show="activeTab === 'insight'" class="ep-body">
      <VEmptyState
        v-if="!hasGridData && !hasCircuitData && !insightLoading"
        compact
        tone="amber"
        :title="'尚未绑定能耗数据源'"
      >
        <template #action>
          <RouterLink
            :to="SETTINGS_ROUTES.setupWizard()"
            class="v-empty__link v-empty__link--inline"
            >{{ '前往首装向导配置电表/分路' }}</RouterLink
          >
        </template>
      </VEmptyState>
      <ApiQueryState
        v-else
        :loading="insightLoading"
        :error="insightLoadError"
        error-title="能耗洞察加载失败"
        tone="amber"
        @retry="reloadInsight"
      >
        <template v-if="hasGridData || hasCircuitData">
          <template v-if="hasGridData">
            <div class="ep-bento">
              <div class="ep-hero">
                <span class="ep-hero__label">{{ '本月已用' }}</span>
                <div class="ep-hero__main">
                  <span class="ep-hero__val">{{ monthNum }}</span>
                  <span class="ep-hero__unit">kWh</span>
                </div>
                <div class="ep-bar-wrap">
                  <div class="ep-bar">
                    <VProgressBar :value="barPct" variant="timeline" size="xs" />
                  </div>
                  <span class="ep-bar-text"
                    >{{ '本月进度' }} {{ dayOfMonth }}/{{ daysInMonth }} {{ '天' }}</span
                  >
                </div>
              </div>
              <div class="ep-stat-grid">
                <div class="ep-stat">
                  <span class="ep-stat-label">{{ '预估月费' }}</span>
                  <span class="ep-stat-val ep-stat-val--warn"
                    >{{ predictedCost }} {{ currencyUnit }}</span
                  >
                </div>
                <div class="ep-stat">
                  <span class="ep-stat-label">{{ '日均用电' }}</span>
                  <span class="ep-stat-val">{{ avgDaily }} kWh</span>
                </div>
                <div class="ep-stat ep-stat--wide">
                  <span class="ep-stat-label">{{ '环比上月' }}</span>
                  <span :class="['ep-stat-val', trend > 0 ? 'ei-trend-up' : 'ei-trend-down']"
                    >{{ trend > 0 ? '↑' : trend < 0 ? '↓' : '→' }} {{ Math.abs(trend) }}%</span
                  >
                </div>
              </div>
            </div>
            <div v-if="suggestion" class="ep-tip">💡 {{ suggestion }}</div>
          </template>

          <div
            v-if="hasCircuitConfig && !hasCircuitData && circuitLoadError"
            class="ep-circuit-error"
          >
            <p>{{ circuitLoadError }}</p>
            <button type="button" class="ep-retry-btn" @click="loadConfiguredCircuits">
              {{ '重试分路数据' }}
            </button>
          </div>

          <div v-if="hasCircuitData" class="ep-circuits">
            <div class="ep-circuits-head">
              <span class="ep-circuits-title">{{ '分路功率（24h 均值）' }}</span>
              <span v-if="circuitTotal" class="ep-circuits-total">{{ circuitTotal }} W</span>
            </div>
            <div v-for="row in circuitRows" :key="row.name" class="ep-circuit-row">
              <span class="ep-circuit-name">{{ row.name }}</span>
              <div class="ep-circuit-bar">
                <VProgressBar :value="row.pct" variant="circuit" size="xs" />
              </div>
              <span class="ep-circuit-val">{{ row.avgW }}W</span>
              <span class="ep-circuit-pct">{{ row.percentage }}%</span>
            </div>
          </div>

          <p v-if="redisHint" class="ep-redis-hint">{{ redisHint }}</p>
        </template>
      </ApiQueryState>
    </div>
  </div>
</template>

<script setup>
/**
 * @file Insight.vue
 * @module widgets/energy
 * @description 能耗洞察面板：展示本月/上月/年度用电对比、日均用电、环比趋势与节能建议，
 *              支持 HA 实体读数与分路功率饼图两种数据源，并可切换电价告警子 tab。
 * @dependencies
 *  - vue: computed/ref/onMounted/watch/defineAsyncComponent 响应式与异步组件
 *  - vue-router: RouterLink 路由跳转
 *  - @lucide/vue: TrendingUp 图标
 *  - @/stores/entities.store: 实体状态（Redis 状态判断）
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/components/common/base/VProgressBar.vue: 进度条组件
 *  - @/utils/core/error-message: 错误信息提取
 *  - @/utils/telemetry/redis-status: Redis 状态判断
 *  - @/composables/energy/useEnergySource: 能源数据访问器
 *  - @homeos/shared: hasEnergyConfig 能源配置判断
 *  - @/utils/energy/source.util: 计量实体 ID 解析
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 *  - @/services/api/energy: 对比/分路/电价接口
 *  - @/utils/config/frontend-config: 图表小时数配置
 */
import { computed, ref, onMounted, watch, defineAsyncComponent } from 'vue'
import { RouterLink } from 'vue-router'
import { TrendingUp } from '@lucide/vue'
import { useEntitiesStore } from '@/stores/entities.store'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VProgressBar from '@/components/common/base/VProgressBar.vue'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { isRedisReadyStatus } from '@/utils/telemetry/redis-status'
import { useEnergySource } from '@/composables/energy/useEnergySource'
import { hasEnergyConfig, getEntityLeaf } from '@homeos/shared'
import { resolvePowerEntityId } from '@/utils/energy/source.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import {
  getEnergyCompare,
  getConfiguredCircuitBreakdown,
  getEnergyPricing,
  postCircuitBreakdown,
} from '@/services/api/energy'
import { getEnergyChartHours } from '@/utils/config/frontend-config'

const PricingAlertPanel = defineAsyncComponent(
  () => import('@/components/widgets/energy/PricingAlertPanel.vue'),
)

const props = defineProps({
  /** insight | pricing — 合并原 pricingAlert 微件 */
  defaultTab: { type: String, default: 'insight' },
  embedded: { type: Boolean, default: false },
  /** 嵌入能源仪表板时隐藏子 Tab 切换 */
  hideTabs: { type: Boolean, default: false },
  panelVisible: { type: Boolean, default: true },
})

const activeTab = ref(props.defaultTab === 'pricing' ? 'pricing' : 'insight')
watch(
  () => props.defaultTab,
  (tab) => {
    if (tab === 'pricing' || tab === 'insight') activeTab.value = tab
  },
)
const currencyUnit = computed(() => '元')

const entitiesStore = useEntitiesStore()
const energy = useEnergySource()

const statsSensors = computed(() => energy.statsSensors?.value || {})
const hasGridData = computed(() => hasEnergyConfig('grid', statsSensors.value))

const circuitRows = ref([])
const circuitTotal = ref('')
const hasCircuitData = computed(() => circuitRows.value.length > 0)
/** 由 API 回写：是否已在 AppConfig 配置分路（勿用 layout statsSensors.circuits） */
const circuitsConfigured = ref(false)
const hasCircuitConfig = computed(() => circuitsConfigured.value || hasCircuitData.value)

const insightLoading = ref(false)
const insightLoadError = ref('')
const circuitLoadError = ref('')

const redisOk = computed(() => isRedisReadyStatus(entitiesStore.redisStatus))

const redisHint = computed(() => {
  if (entitiesStore.redisStatus === 'unknown') return ''
  if (!redisOk.value && (hasGridData.value || hasCircuitData.value)) {
    return 'Redis 未就绪：功率趋势/分路分析不可用；请在连接 Tab 同机部署 Redis。'
  }
  if (analyticsNote.value) return analyticsNote.value
  return ''
})

const analyticsNote = ref('')
const pricingRate = ref(0.56)

async function loadPricingRate() {
  try {
    const { data } = await getEnergyPricing()
    const rate = data?.currentPrice
    if (rate != null && !Number.isNaN(parseFloat(rate))) {
      pricingRate.value = parseFloat(rate)
    }
  } catch {
    /* 回退默认单价 */
  }
}

async function loadConfiguredCircuits() {
  circuitRows.value = []
  circuitTotal.value = ''
  circuitLoadError.value = ''
  circuitsConfigured.value = false
  if (!redisOk.value) return
  try {
    const hours = getEnergyChartHours()
    const { data } = await getConfiguredCircuitBreakdown(hours)
    circuitsConfigured.value = !!data?.configured
    let pie = data?.pieData || []
    let totalAvgW = data?.totalAvgW

    // configured 有 entity 列表但无饼图时，走 POST 自定义分路试算
    if (data?.configured && !pie.length && Array.isArray(data.circuitEntityIds) && data.circuitEntityIds.length) {
      const circuitMap = {}
      for (const raw of data.circuitEntityIds) {
        const id = String(raw || '').trim()
        if (!id) continue
        const suffix = getEntityLeaf(id)
        const label = String(suffix).replace(/_/g, ' ')
        const key = circuitMap[label] ? `${label} (${id})` : label
        circuitMap[key] = [id]
      }
      const { data: breakdown } = await postCircuitBreakdown(circuitMap, hours)
      pie = breakdown?.pieData || []
      totalAvgW = breakdown?.totalAvgW
    }

    if (!data?.configured || !pie.length) return
    circuitTotal.value = totalAvgW != null ? String(totalAvgW) : ''
    circuitRows.value = pie.slice(0, 6).map((p) => ({
      name: p.name,
      avgW: p.value,
      percentage: p.percentage,
      pct: Math.min(100, p.percentage || 0),
    }))
  } catch (e) {
    circuitLoadError.value = getApiErrorMessage(e, '分路数据加载失败')
  }
}

async function loadAnalytics() {
  analyticsNote.value = ''
  if (!hasGridData.value || !redisOk.value) return
  const powerEntity = resolvePowerEntityId(statsSensors.value, entitiesStore.entities)
  if (!powerEntity) return
  try {
    const { data } = await getEnergyCompare(powerEntity)
    if (data?.change != null) {
      const sign = data.change > 0 ? '+' : ''
      analyticsNote.value = 'Redis 日环比（{entity}）：今日均值较昨日 {change}%'
        .replace('{entity}', powerEntity)
        .replace('{change}', `${sign}${data.change}`)
    }
  } catch {
    /* 无趋势数据时静默 */
  }
}

async function reloadInsight() {
  insightLoadError.value = ''
  insightLoading.value = true
  try {
    await Promise.all([loadConfiguredCircuits(), loadAnalytics(), loadPricingRate()])
    if (
      hasCircuitConfig.value &&
      redisOk.value &&
      !hasCircuitData.value &&
      circuitLoadError.value
    ) {
      insightLoadError.value = circuitLoadError.value
    }
  } finally {
    insightLoading.value = false
  }
}

onMounted(() => {
  if (props.panelVisible !== false) void reloadInsight()
})

watch(
  () => props.panelVisible,
  (visible) => {
    if (visible !== false) void reloadInsight()
  },
)

watch(
  () => entitiesStore.redisStatus,
  (status) => {
    if (props.panelVisible === false) return
    if (!isRedisReadyStatus(status)) return
    void reloadInsight()
  },
)

function getVal(fieldKey) {
  const raw = energy.raw('grid', fieldKey)
  if (raw == null || raw === '') return NaN
  const v = parseFloat(raw)
  return Number.isNaN(v) ? NaN : v
}

const monthNum = computed(() => {
  const v = getVal('monthNum')
  return Number.isNaN(v) ? '--' : v.toFixed(0)
})

const avgDaily = computed(() => {
  const today = new Date().getDate()
  const m = parseFloat(monthNum.value)
  return isNaN(m) ? '--' : (m / Math.max(today, 1)).toFixed(1)
})

const lastMonthNum = computed(() => {
  const v = getVal('lastMonthNum')
  return Number.isNaN(v) ? 0 : v
})

const trend = computed(() => {
  const m = parseFloat(monthNum.value)
  if (isNaN(m) || lastMonthNum.value === 0) return 0
  const days = new Date().getDate()
  const projected =
    (m / days) * new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  return Math.round(((projected - lastMonthNum.value) / lastMonthNum.value) * 100)
})

const predictedCost = computed(() => {
  const m = parseFloat(monthNum.value)
  if (isNaN(m)) return '--'
  const daysIn = new Date().getDate()
  const totalDays = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const projected = (m / daysIn) * totalDays
  return (projected * pricingRate.value).toFixed(0)
})

const dayOfMonth = new Date().getDate()
const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
const barPct = Math.min(100, Math.round((dayOfMonth / daysInMonth) * 100))

const suggestion = computed(() => {
  if (!hasGridData.value) return ''
  if (trend.value > 20) return '用电量较上月增长明显，建议排查设备异常'
  if (trend.value > 10) return '适度节能，考虑调整空调设定温度'
  if (trend.value < -10) return '节能效果显著，继续保持！'
  return ''
})
</script>

<style scoped src="./styles/Insight.css"></style>
