<!--
  SmartOverviewPanel.vue / components/widgets/orchestrator
  智慧概览仪表盘：编排 Hub 顶部聚合卡片，展示习惯总结 KPI、联动健康徽章、
  能源节省金额、自适应气候建议 + 自动化执行统计柱状图 + 联动来源饼图双 ECharts。
  Props: 无显式入参
  Emit: goto(section) 点击卡片请求外层跳转到对应子 Hub 页签
  依赖：services/api/system habit + linkage-health + adaptive-climate-recommend 接口；
        services/api/energy getEnergySavings 能源节省；
        services/api/orchestrator automation-analytics-summary；
        composables: useHubChart (useLifeChartHost 内部) 托管多个 ECharts 实例；
        Pinia: useAuthStore 管理员权限控制管理入口；
        utils: life-charts.util 构建 ECharts option；SETTINGS_ROUTES 跳转。
  注意：ECharts 通过 onMounted 延迟初始化；窗口 resize 由 useHubChart 统一监听。
-->
<template>
  <div class="smart-overview">
    <ApiQueryState
      :loading="loading"
      :error="loadError"
      tone="emerald"
      error-title="智能总览加载失败"
      @retry="load"
    >
      <div class="smart-overview__grid">
        <button
          type="button"
          class="smart-overview__card smart-overview__card--habits"
          @click="emit('goto', 'habits')"
        >
          <span class="smart-overview__icon-wrap" aria-hidden="true">
            <Sparkles class="smart-overview__icon" />
          </span>
          <div class="smart-overview__card-body">
            <span class="smart-overview__label">{{ '习惯' }}</span>
            <span class="smart-overview__value">
              {{ habit.needsBaseline ? '学习中' : `${habit.pendingCount || 0} 条待处理` }}
            </span>
            <span class="smart-overview__hint">{{ habit.note || '基于日常使用学习场景偏好' }}</span>
          </div>
        </button>

        <button
          type="button"
          class="smart-overview__card smart-overview__card--linkage"
          @click="emit('goto', 'linkage')"
        >
          <span class="smart-overview__icon-wrap" aria-hidden="true">
            <Link2 class="smart-overview__icon" />
          </span>
          <div class="smart-overview__card-body">
            <span class="smart-overview__label">{{ '联动冲突' }}</span>
            <span
              class="smart-overview__value"
              :class="{ 'smart-overview__value--warn': conflictCount > 0 }"
            >
              {{ conflictCount > 0 ? `${conflictCount} 项` : '无冲突' }}
            </span>
            <span class="smart-overview__hint">{{
              conflictCount > 0 ? '内置模板与家庭模式可能打架' : '联动健康正常'
            }}</span>
          </div>
        </button>

        <div class="smart-overview__card smart-overview__card--static smart-overview__card--energy">
          <span class="smart-overview__icon-wrap" aria-hidden="true">
            <Zap class="smart-overview__icon" />
          </span>
          <div class="smart-overview__card-body">
            <span class="smart-overview__label">{{ '节能估算' }}</span>
            <span class="smart-overview__value">
              <template v-if="savings.estimatedMonthlySavingsYuan != null">
                {{ `约 ¥${savings.estimatedMonthlySavingsYuan}/月` }}
              </template>
              <template v-else>{{ '需绑定电表' }}</template>
            </span>
            <span class="smart-overview__hint">{{
              savings.estimatedMonthlySavingsYuan != null
                ? savings.note || '规则估算（非实测账单）'
                : savings.note || '绑定累计电量电表后可估算'
            }}</span>
          </div>
        </div>

        <div class="smart-overview__card smart-overview__card--static smart-overview__card--pref">
          <span class="smart-overview__icon-wrap" aria-hidden="true">
            <Thermometer class="smart-overview__icon" />
          </span>
          <div class="smart-overview__card-body">
            <span class="smart-overview__label">{{ '偏好来源' }}</span>
            <span class="smart-overview__value smart-overview__value--sm">
              {{ preference.summary || '家庭默认偏好' }}
            </span>
            <span class="smart-overview__hint">
              {{
                preference.defaultTemperature != null
                  ? `舒适温度 ${preference.defaultTemperature}℃`
                  : '在访问控制中设置个人偏好'
              }}
            </span>
          </div>
        </div>
      </div>

      <div class="smart-overview__charts">
        <div class="smart-overview__chart-card">
          <span class="smart-overview__chart-label">{{ '执行成功率' }}</span>
          <div ref="gaugeRef" class="smart-overview__spark smart-overview__spark--gauge" />
        </div>
        <div class="smart-overview__chart-card smart-overview__chart-card--wide">
          <div class="smart-overview__chart-head">
            <span class="smart-overview__chart-label">{{ '习惯活跃 · 24h' }}</span>
            <button type="button" class="smart-overview__chart-link" @click="emit('goto', 'habits')">
              {{ '习惯' }}
            </button>
          </div>
          <div ref="habitRef" class="smart-overview__spark" />
        </div>
      </div>

      <div v-if="gaps.length" class="smart-overview__gaps">
        <h4 class="smart-overview__gaps-title">{{ '完善建议' }}</h4>
        <RouterLink
          v-for="gap in gaps"
          :key="gap.id"
          :to="gap.to"
          class="smart-overview__gap"
        >
          <span class="smart-overview__gap-label">{{ gap.label }}</span>
          <span class="smart-overview__gap-action">{{ gap.action }}</span>
        </RouterLink>
      </div>

      <p v-else class="smart-overview__ok">{{ '智能闭环已就绪，可在各 Tab 查看详情' }}</p>
    </ApiQueryState>
  </div>
</template>

<script setup>
/**
 * @file SmartOverviewPanel.vue
 * @module widgets/orchestrator
 * @description 智能中心总览面板：聚合习惯摘要、联动健康、自适应气候推荐、能耗节约、
 *              自动化成功率仪表盘与小时分布趋势图，提供一站式智能洞察。
 * @dependencies
 *  - vue: computed/ref/onMounted 响应式与生命周期
 *  - vue-router: RouterLink 路由跳转
 *  - @lucide/vue: Sparkles / Link2 / Zap / Thermometer 图标
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/services/api/system: 习惯摘要/联动健康/自适应气候推荐接口
 *  - @/services/api/energy: 能耗节约接口
 *  - @/services/api/orchestrator: 自动化分析汇总接口
 *  - @/utils/config/frontend-config: 图表小时数配置
 *  - @/stores/auth.store: 鉴权状态
 *  - @/composables/life/useLifeChartHost: ECharts 实例托管
 *  - @/utils/chart/life-charts.util: 小时分布与成功率仪表盘配置构建
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 */
import { computed, ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { Sparkles, Link2, Zap, Thermometer } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { fetchHabitSummary, fetchLinkageHealth, fetchAdaptiveClimateRecommend } from '@/services/api/system'
import { getEnergySavings } from '@/services/api/energy'
import { fetchAutomationAnalyticsSummary } from '@/services/api/orchestrator'
import { getEnergyChartHours } from '@/utils/config/frontend-config'
import { useAuthStore } from '@/stores/auth.store'
import { useHubChart } from '@/composables/life/useLifeChartHost'
import {
  buildHourAreaOption,
  buildSuccessRateGaugeOption,
} from '@/utils/chart/life-charts.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { getApiErrorMessage } from '@/utils/core/error-message'

const emit = defineEmits(['goto'])
const authStore = useAuthStore()

const loading = ref(true)
const loadError = ref('')
const habit = ref({})
const savings = ref({})
const linkage = ref({})
const preference = ref({})
const loadedOnce = ref(false)
const autoSummary = ref(null)
const habitActivity = ref([])

const conflictCount = computed(() =>
  Array.isArray(linkage.value?.conflicts) ? linkage.value.conflicts.length : 0,
)

const gaps = computed(() => {
  const list = []
  if (habit.value.needsBaseline) {
    list.push({
      id: 'baseline',
      label: '习惯基线尚未建立',
      action: '去习惯 Tab 重建',
      to: SETTINGS_ROUTES.smartServices(),
    })
  }
  if (savings.value.estimatedMonthlySavingsYuan == null && !savings.value.monthKwh) {
    list.push({
      id: 'meter',
      label: '未绑定电表，节能估算不可用',
      action: '去生活账户',
      to: SETTINGS_ROUTES.lifeAccounts('energy'),
    })
  }
  if (!(linkage.value?.security?.members || []).length) {
    list.push({
      id: 'presence',
      label: '未配置在家人员，偏好无法按人匹配',
      action: '去安防联动',
      to: SETTINGS_ROUTES.securityModes(),
    })
  }
  if (preference.value.source === 'fallback') {
    list.push({
      id: 'prefs',
      label: '完善个人舒适温度与色温',
      action: '去访问控制',
      to: SETTINGS_ROUTES.access('security'),
    })
  }
  return list.slice(0, 4)
})

function unwrap(res) {
  if (res == null) return {}
  if (typeof res === 'object' && 'data' in res && res.data != null && typeof res.data === 'object') {
    return res.data
  }
  return res
}

function buildHabitSeries(habitData) {
  const hours = Array.from({ length: 24 }, (_, h) => ({
    label: String(h).padStart(2, '0'),
    value: 0,
  }))
  for (const row of habitData.topRooms || []) {
    const h = Number(row.peakHour)
    if (h >= 0 && h < 24) hours[h].value += Number(row.activityScore) || 1
  }
  for (const row of habitData.awayLightHints || []) {
    const h = Number(row.hour)
    if (h >= 0 && h < 24) hours[h].value += (Number(row.lightOnProbability) || 0) * 12
  }
  return hours.some((x) => x.value > 0) ? hours.map((x) => ({ ...x, value: +x.value.toFixed(2) })) : []
}

async function load(opts = {}) {
  if (!opts.quiet || !loadedOnce.value) {
    loading.value = true
    loadError.value = ''
  }
  try {
    const tasks = [
      fetchHabitSummary(),
      getEnergySavings(),
      fetchLinkageHealth(),
      fetchAdaptiveClimateRecommend(),
    ]
    if (authStore.role === 'admin') {
      tasks.push(fetchAutomationAnalyticsSummary({ hours: getEnergyChartHours() }))
    }
    const results = await Promise.allSettled(tasks)
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    if (!fulfilled.length) {
      const reason = results.find((r) => r.status === 'rejected')?.reason
      loadError.value = getApiErrorMessage(reason, '服务暂时不可用，请稍后刷新重试')
      return
    }
    habit.value = results[0].status === 'fulfilled' ? unwrap(results[0].value) : {}
    savings.value = results[1].status === 'fulfilled' ? unwrap(results[1].value) : {}
    linkage.value = results[2].status === 'fulfilled' ? unwrap(results[2].value) : {}
    const climate = results[3].status === 'fulfilled' ? unwrap(results[3].value) : {}
    preference.value = climate?.preference || {}
    habitActivity.value = buildHabitSeries(habit.value)
    if (authStore.role === 'admin' && results[4]?.status === 'fulfilled') {
      const summary = unwrap(results[4].value)
      autoSummary.value = summary.totalExecutions != null ? summary : null
    } else {
      autoSummary.value = null
    }
    loadedOnce.value = true
  } catch (e) {
    loadError.value = getApiErrorMessage(e, '加载失败')
  } finally {
    loading.value = false
  }
}

const gaugeRef = ref(null)
const habitRef = ref(null)

useHubChart(
  gaugeRef,
  () =>
    buildSuccessRateGaugeOption(
      autoSummary.value?.successRate ?? 0,
      autoSummary.value?.totalExecutions ?? 0,
    ),
  [autoSummary],
)

useHubChart(
  habitRef,
  () =>
    buildHourAreaOption(habitActivity.value, {
      accent: '#fbbf24',
      name: '活跃度',
      emptyLabel: '学习中',
    }),
  [habitActivity],
)

onMounted(() => load())

defineExpose({ load })
</script>

<style scoped src="./styles/SmartOverviewPanel.css"></style>
