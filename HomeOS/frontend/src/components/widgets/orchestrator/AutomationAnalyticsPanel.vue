<!--
  @module 自动化分析面板（AutomationAnalyticsPanel）
  @description 展示自动化执行成功率、失败时段分布与高频自动化统计的可视化面板。
    通过 fetchAutomationAnalyticsSummary 拉取后端聚合数据，并依赖 useHubChart
    托管仪表盘与区域图的生命周期。仅管理员可查看；非管理员显示权限提示。
  @dependencies
    - vue（ref/computed/onMounted）
    - @lucide/vue BarChart3 图标
    - ApiQueryState 通用加载/错误状态组件
    - services/api/orchestrator 拉取汇总数据
    - stores/auth.store 判断管理员权限
    - utils/config/frontend-config 读取图表窗口小时数
    - utils/core/error-message 错误信息提取
    - composables/life/useHubChart 图表生命周期托管
    - utils/chart/life-charts.util 构建仪表盘/区域图配置
-->
<template>
  <div :class="['aa-panel', embedded && 'aa-panel--embedded']">
    <header v-if="!embedded" class="aa-panel__head">
      <BarChart3 class="w-3.5 h-3.5 aa-icon" />
      <h3>{{ '自动化分析' }}</h3>
      <button type="button" class="aa-panel__refresh" :disabled="loading" @click="load">
        {{ '刷新' }}
      </button>
    </header>

    <!-- 非管理员：仅显示权限提示，不发起数据请求 -->
    <div v-if="!isAdmin" class="aa-empty">
      <BarChart3 class="aa-empty__icon" />
      <p class="aa-empty__title">{{ '需要管理员权限' }}</p>
      <p class="aa-empty__desc">{{ '自动化执行分析仅管理员可查看' }}</p>
    </div>

    <ApiQueryState
      v-else
      :loading="loading"
      :error="error"
      tone="sky"
      error-title="自动化分析加载失败"
      @retry="load"
    >
      <template v-if="summary">
        <!-- 顶部统计卡片：成功率、执行次数、失败数 -->
        <div class="aa-stats">
          <div class="aa-stat">
            <span class="aa-stat-val">{{ summary.successRate }}%</span>
            <span class="aa-stat-label">{{ '成功率' }}</span>
          </div>
          <div class="aa-stat">
            <span class="aa-stat-val">{{ summary.totalExecutions }}</span>
            <span class="aa-stat-label">{{ '执行次数' }}</span>
          </div>
          <div class="aa-stat aa-stat--fail">
            <span class="aa-stat-val">{{ summary.failureCount }}</span>
            <span class="aa-stat-label">{{ '失败' }}</span>
          </div>
        </div>

        <!-- 图表区：左侧成功率仪表盘，右侧 24 小时失败曲线 -->
        <div class="aa-charts">
          <div class="aa-chart-card">
            <h4>{{ '成功率' }}</h4>
            <div ref="gaugeRef" class="aa-spark aa-spark--gauge" />
          </div>
          <div class="aa-chart-card aa-chart-card--wide">
            <h4>{{ '失败时段曲线' }}</h4>
            <div ref="failRef" class="aa-spark" />
          </div>
        </div>

        <!-- 失败高峰时段（按小时聚合），最多展示 6 条 -->
        <section v-if="topFailures.length" class="aa-block">
          <h4>{{ '失败高峰' }}</h4>
          <div class="aa-bars">
            <div v-for="h in topFailures" :key="h.hour" class="aa-bar-row">
              <span class="aa-bar-label">{{ String(h.hour).padStart(2, '0') }}:00</span>
              <div class="aa-bar-track">
                <div class="aa-bar-fill" :style="{ width: `${h.pct}%` }" />
              </div>
              <span class="aa-bar-count">{{ h.count }}</span>
            </div>
          </div>
        </section>

        <!-- 高频自动化 TOP 5 列表 -->
        <section v-if="summary.topAutomations?.length" class="aa-block">
          <h4>{{ '高频自动化' }}</h4>
          <ul class="aa-list">
            <li v-for="a in summary.topAutomations.slice(0, 5)" :key="a.automationId">
              <span class="aa-name">{{ a.name }}</span>
              <span class="aa-meta">{{ a.executions }} · {{ a.successRate }}%</span>
            </li>
          </ul>
        </section>
      </template>

      <!-- 数据为空：尚未运行任何自动化 -->
      <div v-else class="aa-empty">
        <BarChart3 class="aa-empty__icon" />
        <p class="aa-empty__title">{{ '暂无执行数据' }}</p>
        <p class="aa-empty__desc">{{ '运行自动化后，成功率与失败时段将在此显示' }}</p>
      </div>
    </ApiQueryState>
  </div>
</template>

<script setup>
/**
 * 自动化分析面板脚本
 *
 * 数据流：
 * 1. onMounted 调用 load()，仅管理员发起请求
 * 2. fetchAutomationAnalyticsSummary 返回汇总数据
 * 3. computed 派生失败时段序列与高峰列表
 * 4. useHubChart 在 ref 挂载后绘制图表
 */
import { ref, computed, onMounted } from 'vue'
import { BarChart3 } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { fetchAutomationAnalyticsSummary } from '@/services/api/orchestrator'
import { useAuthStore } from '@/stores/auth.store'
import { getEnergyChartHours } from '@/utils/config/frontend-config'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import {
  buildHourAreaOption,
  buildSuccessRateGaugeOption,
} from '@/utils/chart/life-charts.util'

defineProps({
  /** 是否嵌入到 SmartHub 等容器中（嵌入时隐藏头部） */
  embedded: { type: Boolean, default: false },
})

const authStore = useAuthStore()
/** 是否管理员：决定是否拉取数据 */
const isAdmin = computed(() => authStore.role === 'admin')
/** 加载中状态 */
const loading = ref(true)
/** 错误信息（为空表示无错误） */
const error = ref('')
/** 后端返回的汇总数据 */
const summary = ref(null)
/**
 * 24 小时失败次数序列（缺失小时补 0）
 * @returns {Array<{label:string, value:number}>} 24 项区域图数据
 */
const failureSeries = computed(() => {
  const rows = summary.value?.failuresByHour || []
  return Array.from({ length: 24 }, (_, hour) => {
    const hit = rows.find((r) => r.hour === hour)
    return { label: String(hour).padStart(2, '0'), value: Number(hit?.count) || 0 }
  })
})

/**
 * 失败高峰 TOP 6，并计算每条占总峰值的百分比用于条形宽度
 * @returns {Array<{hour:number, count:number, pct:number}>}
 */
const topFailures = computed(() => {
  const rows = summary.value?.failuresByHour || []
  // Math.max(1, ...) 避免除零，确保 max 至少为 1
  const max = Math.max(1, ...rows.map((r) => r.count))
  return rows
    .filter((r) => r.count > 0)
    .slice(0, 6)
    .map((r) => ({ ...r, pct: Math.round((r.count / max) * 100) }))
})

/** 成功率仪表盘挂载节点 */
const gaugeRef = ref(null)
/** 失败时段曲线挂载节点 */
const failRef = ref(null)

// 仪表盘：依赖 summary.successRate / totalExecutions，summary 变化时自动重建
useHubChart(
  gaugeRef,
  () =>
    buildSuccessRateGaugeOption(summary.value?.successRate ?? 0, summary.value?.totalExecutions ?? 0),
  [summary],
)

// 失败曲线：依赖 failureSeries，数据更新时自动重建
useHubChart(
  failRef,
  () =>
    buildHourAreaOption(failureSeries.value, {
      accent: '#38bdf8',
      name: '失败次数',
      emptyLabel: '暂无失败',
    }),
  [failureSeries],
)

/**
 * 拉取自动化分析汇总数据
 * - 非管理员：直接置空并结束，不发起请求
 * - 异常：清空 summary 并展示错误信息
 * @returns {Promise<void>}
 */
async function load() {
  if (!isAdmin.value) {
    loading.value = false
    summary.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    const { data } = await fetchAutomationAnalyticsSummary({ hours: getEnergyChartHours() })
    // 仅当后端返回 totalExecutions 时才认为数据有效
    summary.value = data?.totalExecutions != null ? data : null
  } catch (e) {
    summary.value = null
    error.value = getApiErrorMessage(e, '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => load())
// 暴露给父组件刷新接口
defineExpose({ load })
</script>

<style scoped src="./styles/AutomationAnalyticsPanel.css"></style>