/**
 * 智能中心分析轨：习惯活跃度、自动化执行、节能对比
 *
 * 所属模块：生活（life）-> 智能中心分析。
 * 职责：并行拉取习惯摘要、节能数据与自动化分析（仅 admin），聚合为图表/卡片所需的数据结构。
 *
 * 依赖：vue、system/energy/orchestrator API、frontend-config、auth.store。
 */
import { computed, onMounted, ref } from 'vue'
import { fetchHabitSummary } from '@/services/api/system'
import { getEnergySavings } from '@/services/api/energy'
import { fetchAutomationAnalyticsSummary } from '@/services/api/orchestrator'
import { getEnergyChartHours } from '@/utils/config/frontend-config'
import { useAuthStore } from '@/stores/auth.store'
import type { LifeTrendPoint } from '@/composables/life/useLifeOverviewAnalytics'

/** 峰值用电周对比数据 */
type SmartPeakCompare = {
  /** 本周峰值 kWh */
  thisWeek: number
  /** 上周峰值 kWh */
  lastWeek: number
  /** 是否改善 */
  improved: boolean
  /** 备注 */
  note: string
}

/**
 * 解包 API 响应：若对象含 data 字段则取 data，否则原样返回。
 * @param res API 响应
 * @returns 解包后的对象
 */
function unwrap(res: unknown): Record<string, unknown> {
  if (res == null || typeof res !== 'object') return {}
  const obj = res as Record<string, unknown>
  if (obj.data != null && typeof obj.data === 'object') return obj.data as Record<string, unknown>
  return obj
}

/**
 * 将小时数格式化为两位字符串标签。
 * @param h 小时（0-23）
 * @returns 形如 '08' 的标签
 */
function hourLabel(h: number) {
  return `${String(h).padStart(2, '0')}`
}

/**
 * 智能中心分析 composable。
 *
 * 调用场景：生活页面智能中心 Tab 中调用，返回习惯/自动化/节能相关的响应式数据。
 *
 * @returns 习惯活跃度、自动化统计、节能对比等数据
 */
export function useLifeSmartAnalytics() {
  const authStore = useAuthStore()
  /** 加载状态 */
  const loading = ref(false)
  /** 习惯待办数 */
  const habitPending = ref(0)
  /** 习惯是否需要基线（数据不足时为 true） */
  const habitNeedsBaseline = ref(false)
  /** 24 小时习惯活跃度趋势（用于图表） */
  const habitActivity = ref<LifeTrendPoint[]>([])
  /** 自动化执行统计 */
  const automation = ref<{
    successRate: number
    totalExecutions: number
    failureCount: number
    successCount: number
  } | null>(null)
  /** 按小时分布的自动化失败数（用于图表） */
  const failuresByHour = ref<LifeTrendPoint[]>([])
  /** 执行次数 Top 自动化列表 */
  const topAutomations = ref<Array<{ name: string; executions: number; successRate: number }>>([])
  /** 峰值用电周对比 */
  const peakCompare = ref<SmartPeakCompare | null>(null)
  /** 预计月节能金额（元） */
  const savingsYuan = ref<number | null>(null)

  /** 是否为管理员（自动化分析仅 admin 可见） */
  const isAdmin = computed(() => authStore.role === 'admin')

  /** 组合桶：成功 / 失败 / 习惯待办，用于图表展示 */
  const mixBuckets = computed(() => {
    const auto = automation.value
    return [
      {
        key: 'ok',
        label: '成功',
        count: auto?.successCount ?? 0,
        color: '#34d399',
      },
      {
        key: 'fail',
        label: '失败',
        count: auto?.failureCount ?? 0,
        color: '#fb7185',
      },
      {
        key: 'habit',
        label: '习惯待办',
        count: habitPending.value,
        color: '#fbbf24',
      },
    ]
  })

  /**
   * 加载智能中心分析数据：并行请求习惯摘要、节能数据，admin 额外请求自动化分析。
   *
   * 异常：单个请求失败不影响其它数据，使用 Promise.allSettled 容错。
   */
  async function load() {
    loading.value = true
    try {
      const tasks: Promise<unknown>[] = [fetchHabitSummary(), getEnergySavings()]
      if (isAdmin.value) {
        tasks.push(fetchAutomationAnalyticsSummary({ hours: getEnergyChartHours() }))
      }
      const results = await Promise.allSettled(tasks)

      // 习惯摘要：聚合 topRooms 峰值小时与 awayLightHints 离家亮灯概率
      if (results[0].status === 'fulfilled') {
        const habit = unwrap(results[0].value)
        habitPending.value = Number(habit.pendingCount) || 0
        habitNeedsBaseline.value = Boolean(habit.needsBaseline)
        const hours = Array.from({ length: 24 }, (_, h) => ({
          label: hourLabel(h),
          value: 0,
        }))
        const topRooms = Array.isArray(habit.topRooms) ? habit.topRooms : []
        for (const row of topRooms as Array<Record<string, unknown>>) {
          const h = Number(row.peakHour)
          if (h >= 0 && h < 24) hours[h].value += Number(row.activityScore) || 1
        }
        const away = Array.isArray(habit.awayLightHints) ? habit.awayLightHints : []
        for (const row of away as Array<Record<string, unknown>>) {
          const h = Number(row.hour)
          if (h >= 0 && h < 24) {
            // 概率值乘以 12 放大，便于在活跃度图表中可视化
            hours[h].value += (Number(row.lightOnProbability) || 0) * 12
          }
        }
        const max = Math.max(...hours.map((x) => x.value), 0)
        habitActivity.value =
          max > 0
            ? hours.map((x) => ({ ...x, value: +x.value.toFixed(2) }))
            : []
      }
      // 节能数据：月预计节能金额 + 周峰值对比
      if (results[1].status === 'fulfilled') {
        const savings = unwrap(results[1].value)
        savingsYuan.value =
          savings.estimatedMonthlySavingsYuan != null
            ? Number(savings.estimatedMonthlySavingsYuan)
            : null
        const wow = savings.weekOverWeek as Record<string, unknown> | undefined
        if (wow && (wow.thisWeekPeakKwh != null || wow.lastWeekPeakKwh != null)) {
          peakCompare.value = {
            thisWeek: Number(wow.thisWeekPeakKwh) || 0,
            lastWeek: Number(wow.lastWeekPeakKwh) || 0,
            improved: Boolean(wow.improved),
            note: String(wow.note || ''),
          }
        } else {
          peakCompare.value = null
        }
      }

      // 自动化分析（仅 admin）：成功率/失败数/Top 自动化
      if (isAdmin.value && results[2]?.status === 'fulfilled') {
        const summary = unwrap(results[2].value)
        if (summary.totalExecutions != null) {
          automation.value = {
            successRate: Number(summary.successRate) || 0,
            totalExecutions: Number(summary.totalExecutions) || 0,
            failureCount: Number(summary.failureCount) || 0,
            successCount: Number(summary.successCount) || 0,
          }
          const rows = Array.isArray(summary.failuresByHour) ? summary.failuresByHour : []
          failuresByHour.value = Array.from({ length: 24 }, (_, h) => {
            const hit = (rows as Array<{ hour: number; count: number }>).find((r) => r.hour === h)
            return { label: hourLabel(h), value: Number(hit?.count) || 0 }
          })
          const tops = Array.isArray(summary.topAutomations) ? summary.topAutomations : []
          topAutomations.value = (tops as Array<Record<string, unknown>>)
            .slice(0, 5)
            .map((a) => ({
              name: String(a.name || a.automationId || '自动化'),
              executions: Number(a.executions) || 0,
              successRate: Number(a.successRate) || 0,
            }))
        } else {
          automation.value = null
          failuresByHour.value = []
          topAutomations.value = []
        }
      }
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void load()
  })

  return {
    loading,
    isAdmin,
    habitPending,
    habitNeedsBaseline,
    habitActivity,
    automation,
    failuresByHour,
    topAutomations,
    peakCompare,
    savingsYuan,
    mixBuckets,
    load,
  }
}