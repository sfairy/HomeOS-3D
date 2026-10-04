/**
 * 设备分析指标派生 Composable
 *
 * 模块：设备 / 分析仪表盘 / 指标派生
 * 职责：
 *   - 基于 summary 与 eventsStats 派生一系列纯计算属性，供仪表盘 UI 与图表消费。
 *   - 包含：是否含数据、周期标签、用量汇总、Top 活跃设备、低活跃设备、异常计数、
 *     热力图设备列表、事件按域排序、Tab 配置。
 *
 * 设计说明：
 *   - 全部为 computed，无副作用，依赖响应式 summary / eventsStats 自动重算。
 *
 * 依赖：
 *   - @/composables/device/useDeviceAnalyticsDashboard：summary / eventsStats 的类型来源。
 */
import { computed, type Ref } from 'vue'
import type { useDeviceAnalyticsDashboard } from '@/composables/device/useDeviceAnalyticsDashboard'

// 低活跃判定阈值：7 天内切换次数 <= 2 视为低活跃
const LOW_ACTIVITY_THRESHOLD = 2

type Summary = ReturnType<typeof useDeviceAnalyticsDashboard>['summary']
type EventsStats = ReturnType<typeof useDeviceAnalyticsDashboard>['eventsStats']

/**
 * 设备分析指标派生 Composable。
 *
 * @param days        时间窗口天数（响应式），用于生成周期标签。
 * @param summary     设备使用统计摘要（Ref）。
 * @param eventsStats 事件统计结果（Ref）。
 * @returns LOW_ACTIVITY_THRESHOLD / hasData / periodLabel / usageTotals / topActiveDevice /
 *          lowActivityDevices / alertCounts / heatmapDevices / eventDomainEntries / analyticsTabs。
 */
export function useDeviceAnalyticsMetrics(
  days: Ref<number>,
  summary: Summary,
  eventsStats: EventsStats,
) {
  // 是否含数据：有设备总数或日汇总即视为有数据
  const hasData = computed(
    () => summary.value.totalDevices > 0 || summary.value.dailyTotals.length > 0,
  )
  // 周期标签，例如「近 7 天」
  const periodLabel = computed(() => `近 ${days.value} 天`)

  // 用量汇总：周期内总切换次数 / 总运行时长 / 日均切换次数
  const usageTotals = computed(() => {
    const daily = summary.value.dailyTotals || []
    const onCount = daily.reduce((s, d) => s + d.onCount, 0)
    const totalRuntimeMs = daily.reduce((s, d) => s + d.totalRuntimeMs, 0)
    // 日均切换次数：总数除以天数，避免空数组除零
    const avgDaily = daily.length ? Math.round(onCount / daily.length) : 0
    return { onCount, totalRuntimeMs, avgDaily }
  })

  // Top 活跃设备：取 topDevices[0]，无数据时为 null
  const topActiveDevice = computed(() => summary.value.topDevices[0] ?? null)

  /**
   * 低活跃设备列表：
   *   - topDevices 中切换次数 <= LOW_ACTIVITY_THRESHOLD 的设备。
   *   - 再补充 anomalyHints 中标记为 unused 但未在 topDevices 出现的设备（次数视为 0）。
   *   - 按切换次数升序、运行时长升序排序，取前 12 个。
   */
  const lowActivityDevices = computed(() => {
    const map = new Map<string, { entityId: string; onCount: number; totalRuntimeMs: number }>()
    for (const d of summary.value.topDevices) {
      if (d.onCount <= LOW_ACTIVITY_THRESHOLD) map.set(d.entityId, d)
    }
    for (const hint of summary.value.anomalyHints) {
      // 跳过非 unused 类型或已在 map 中的实体，避免重复
      if (hint.type !== 'unused' || map.has(hint.entityId)) continue
      map.set(hint.entityId, { entityId: hint.entityId, onCount: 0, totalRuntimeMs: 0 })
    }
    return [...map.values()]
      .sort((a, b) => a.onCount - b.onCount || a.totalRuntimeMs - b.totalRuntimeMs)
      .slice(0, 12)
  })

  // 异常计数：按 spike / forgotten / unused 分类统计 anomalyHints
  const alertCounts = computed(() => {
    const hints = summary.value.anomalyHints
    return {
      spike: hints.filter((h) => h.type === 'spike').length,
      forgotten: hints.filter((h) => h.type === 'forgotten').length,
      unused: hints.filter((h) => h.type === 'unused').length,
    }
  })

  // 热力图设备列表：优先使用 topDeviceDaily；缺失时回退到 topDevices 前 6 个（daily 为空）
  const heatmapDevices = computed(() =>
    summary.value.topDeviceDaily?.length
      ? summary.value.topDeviceDaily
      : summary.value.topDevices.slice(0, 6).map((d) => ({
          entityId: d.entityId,
          daily: [] as Array<{ day: string; onCount: number }>,
        })),
  )

  // 事件按域聚合：byDomain 转数组后按次数降序取前 10
  const eventDomainEntries = computed(() =>
    Object.entries(eventsStats.value.byDomain || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
  )

  // 仪表盘 Tab 配置：含 id / label / count；count 为 null 时 Tab 不显示徽标
  const analyticsTabs = computed(() => [
    { id: 'overview' as const, label: '总览' },
    { id: 'activity' as const, label: '活跃度', count: summary.value.topDevices.length || null },
    { id: 'health' as const, label: '健康事件', count: eventsStats.value.total || null },
    { id: 'alerts' as const, label: '异常提醒', count: summary.value.anomalyHints.length || null },
  ])

  return {
    LOW_ACTIVITY_THRESHOLD,
    hasData,
    periodLabel,
    usageTotals,
    topActiveDevice,
    lowActivityDevices,
    alertCounts,
    heatmapDevices,
    eventDomainEntries,
    analyticsTabs,
  }
}