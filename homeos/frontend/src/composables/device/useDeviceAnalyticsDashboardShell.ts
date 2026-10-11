/** 设备分析仪表盘 Shell Composable */
import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
  type Ref,
  type ComponentPublicInstance,
} from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import { getDomainLabel } from '@/shared/device/utils/domain-labels.util'
import { useDeviceAnalyticsDashboard } from '@/composables/device/useDeviceAnalyticsDashboard'
import { useDeviceAnalyticsMetrics } from '@/composables/device/useDeviceAnalyticsMetrics'
import { useDeviceHealthTrend } from '@/composables/device/useDeviceHealthTrend'
import { useDeviceAnalyticsCharts } from '@/composables/device/useDeviceAnalyticsCharts'

/**
 * 将运行时长（毫秒）格式化为紧凑显示文案。
 *
 * @param ms 毫秒数。
 * @returns 形如「5 分」或「2h 30m」或「3h」。
 */
function formatDeviceRuntime(ms: number) {
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} 分`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/**
 * 异常提示类型的中文标签。
 *
 * @param type 提示类型，取值为 spike / forgotten / unused 等。
 * @returns 中文标签；未知类型回退到「提示」。
 */
export function hintTypeLabel(type: string) {
  if (type === 'spike') return '异常活跃'
  if (type === 'forgotten') return '可能遗忘'
  if (type === 'unused') return '长期未用'
  return '提示'
}

/**
 * 异常提示的样式类名（用于在模板中区分危险 / 警告级别）。
 *
 * @param type 提示类型。
 * @returns 对应的 CSS 类名后缀；spike / forgotten 各有专属样式。
 */
export function hintClass(type: string) {
  if (type === 'forgotten') return 'dev-hint-item--danger'
  if (type === 'spike') return 'dev-hint-item--warn'
  return ''
}

/**
 * 设备分析仪表盘 Shell Composable。
 *
 * @param options 包含 visible（可见性）、onFilterDomain / onFilterEntity（图表点击过滤回调）。
 * @returns 仪表盘所需全部状态、ref、绑定函数与工具方法。
 */
export function useDeviceAnalyticsDashboardShell(options: {
  visible: Ref<boolean>
  onFilterDomain: (domain: string) => void
  onFilterEntity: (entityId: string) => void
}) {
  const entitiesStore = useEntitiesStore()
  // 时间窗口天数，默认 7
  const days = ref(7)
  // 当前激活的 Tab：overview / activity / health / alerts
  const activeTab = ref<'overview' | 'activity' | 'health' | 'alerts'>('overview')
  // 可见性的 ComputedRef 包装，便于子 composable 接收
  const visibleRef = computed(() => options.visible.value)
  // 时间窗口选项
  const rangeOptions = [
    { value: 7, label: '7天' },
    { value: 30, label: '30天' },
  ]

  // 拉取分析数据
  const { loading, error, summary, eventsStats, refresh } = useDeviceAnalyticsDashboard(
    days,
    visibleRef,
  )
  // 健康趋势
  const {
    trend: healthTrend,
    current: healthCurrent,
    refresh: refreshHealth,
  } = useDeviceHealthTrend()
  // 派生指标
  const {
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
  } = useDeviceAnalyticsMetrics(days, summary, eventsStats)

  // 根元素 ref，用于挂载 ResizeObserver
  const rootRef = ref<HTMLElement | null>(null)

  // 装配图表 composable
  const {
    trendChartRef,
    domainChartRef,
    heatmapChartRef,
    eventsChartRef,
    healthTrendRef,
    scheduleRender,
    reload,
    exportCsv,
    mountCharts,
    unmountCharts,
  } = useDeviceAnalyticsCharts({
    visible: visibleRef,
    loading,
    error,
    hasData,
    activeTab,
    days,
    summary,
    eventsStats,
    healthTrend,
    heatmapDevices,
    eventDomainEntries,
    entitiesStore,
    onFilterDomain: options.onFilterDomain,
    onFilterEntity: options.onFilterEntity,
    refreshHealth,
    refresh,
  })

  /**
   * 解析实体显示名；解析失败时回退到 id 本身。
   *
   * @param id 实体 id。
   * @returns 实体显示名或 id。
   */
  function entityName(id: string) {
    return getEntityDisplayName(id, entitiesStore.entities[id]) || id
  }

  // 数据 / Tab / 可见性变化时调度一次图表重渲染；deep 监听嵌套结构
  watch(
    [summary, eventsStats, healthTrend, options.visible, loading, activeTab],
    () => {
      scheduleRender()
    },
    { deep: true },
  )

  // 挂载时初始化健康趋势并启动图表监听
  onMounted(() => {
    refreshHealth()
    mountCharts(rootRef)
  })

  // 卸载时清理图表实例与事件监听
  onUnmounted(() => {
    unmountCharts()
  })

  /**
   * 生成 Vue 模板 ref 绑定函数；将 DOM 元素（或 null）写入指定 Ref。
   *
   * @param target 待写入的 Ref。
   * @returns 模板 ref 回调函数。
   */
  function bindChartRef(target: Ref<HTMLElement | null>) {
    return (el: Element | ComponentPublicInstance | null) => {
      target.value = el instanceof HTMLElement ? el : null
    }
  }

  // 各图表的 ref 绑定回调
  const bindTrendChart = bindChartRef(trendChartRef)
  const bindDomainChart = bindChartRef(domainChartRef)
  const bindHeatmapChart = bindChartRef(heatmapChartRef)
  const bindEventsChart = bindChartRef(eventsChartRef)
  const bindHealthTrend = bindChartRef(healthTrendRef)

  return {
    rootRef,
    days,
    activeTab,
    rangeOptions,
    loading,
    error,
    summary,
    eventsStats,
    healthTrend,
    healthCurrent,
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
    trendChartRef,
    domainChartRef,
    heatmapChartRef,
    eventsChartRef,
    healthTrendRef,
    bindTrendChart,
    bindDomainChart,
    bindHeatmapChart,
    bindEventsChart,
    bindHealthTrend,
    reload,
    exportCsv,
    entityName,
    getDomainLabel,
    formatRuntime: formatDeviceRuntime,
    hintTypeLabel,
    hintClass,
  }
}