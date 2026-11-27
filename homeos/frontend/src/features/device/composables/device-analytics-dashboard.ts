import { ref, computed, watch, onMounted, onUnmounted, type Ref, type ComponentPublicInstance } from 'vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { getEntityDisplayName } from '@/domain/entity/model/utils/derived.util'
import { getDomainLabel } from '@/features/device/model/utils'
import { useDeviceAnalyticsMetrics } from '@/features/device/composables/use-device-analytics-metrics'
import { useDeviceHealthTrend } from '@/features/device/composables/device'
import { useDeviceAnalyticsCharts } from '@/features/device/composables/use-device-analytics-charts'
import { fetchAdvisorUsageSummary } from '@/kernel/http'
import { fetchEventStats } from '@/domain/api/entities'
import { type DeviceAnalyticsSummary, type EventLogStats } from '@/kernel/types/device'
import { createFetchSequence } from '@/kernel/utils/core'

/** 设备分析仪表盘 Shell Composable */

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
  const { loading, error, summary, eventsStats, refresh } = useDeviceAnalyticsDashboard(days, visibleRef)
  // 健康趋势
  const { trend: healthTrend, current: healthCurrent, refresh: refreshHealth } = useDeviceHealthTrend()
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
  // 根元素同样用函数 ref 绑定：vue-tsc 不把模板里的 `ref="name"` 字符串当作对脚本变量的
  // 读取，开启 noUnusedLocals 后只被模板引用的 ref 会误报「声明但未使用」。函数 ref 是真实
  // 表达式引用，判定成立。**`useTemplateRef('name')` 同样无效**——实测（vue-tsc 3.3.14 /
  // vue 3.5.44）`ref="x"` + `useTemplateRef('x')` 与 `ref="x"` + `ref()` 一样报 TS6133，
  // 因为模板字符串 ref 根本不参与读取判定；别再尝试换成 useTemplateRef。
  const bindRootRef = bindChartRef(rootRef)

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
    bindRootRef,
    reload,
    exportCsv,
    entityName,
    getDomainLabel,
    formatRuntime: formatDeviceRuntime,
    hintTypeLabel,
    hintClass,
  }
}

/** 设备分析仪表盘 Composable */

// 空摘要常量，用于初始化与失败时复位
const EMPTY_SUMMARY: DeviceAnalyticsSummary = {
  topDevices: [],
  totalDevices: 0,
  days: 7,
  dailyTotals: [],
  domainBreakdown: [],
  anomalyHints: [],
  topDeviceDaily: [],
}

// 空事件统计常量
const EMPTY_EVENTS: EventLogStats = {
  total: 0,
  byDomain: {},
  topEntities: [],
}

/**
 * 设备分析仪表盘 Composable。
 *
 * @param days    时间窗口天数（响应式），变化时自动重新加载。
 * @param visible 可选的可见性开关；为 false 时跳过请求与 watch 自动触发。
 * @returns loading / error / summary / eventsStats / refresh。
 */
export function useDeviceAnalyticsDashboard(days: Ref<number>, visible?: Ref<boolean>) {
  const loading = ref(false)
  const error = ref('')
  const summary = ref<DeviceAnalyticsSummary>({ ...EMPTY_SUMMARY })
  const eventsStats = ref<EventLogStats>({ ...EMPTY_EVENTS })
  // 请求序号守卫，确保只有最新一次请求的结果会写入状态
  const seqGuard = createFetchSequence()

  /**
   * 刷新分析数据：并行拉取摘要与事件统计。
   *
   * 副作用：会修改 loading / error / summary / eventsStats；过期序号的响应会被丢弃。
   * 调用场景：
   *   - watch 监听 days / visible 时自动调用。
   *   - 外部组件通过返回的 refresh 手动刷新。
   */
  async function refresh() {
    if (visible && !visible.value) return
    const seq = seqGuard.next()
    loading.value = true
    error.value = ''
    try {
      // 时间窗口换算为小时，供事件统计接口使用
      const hours = days.value * 24
      const [summaryRes, eventsRes] = await Promise.all([
        fetchAdvisorUsageSummary({ days: days.value }),
        fetchEventStats({ hours }),
      ])
      if (!seqGuard.isCurrent(seq)) return
      summary.value = { ...EMPTY_SUMMARY, ...(summaryRes.data as DeviceAnalyticsSummary) }
      eventsStats.value = { ...EMPTY_EVENTS, ...(eventsRes.data as EventLogStats) }
    } catch {
      if (!seqGuard.isCurrent(seq)) return
      // 翻译：错误提示文案
      error.value = '加载分析数据失败，请稍后重试'
      // 复位时保留当前 days，避免 UI 显示与实际请求不一致
      summary.value = { ...EMPTY_SUMMARY, days: days.value }
      eventsStats.value = { ...EMPTY_EVENTS }
    } finally {
      if (seqGuard.isCurrent(seq)) loading.value = false
    }
  }

  // 监听时间窗口与可见性，任一变化即重新加载；immediate 保证初始化即拉取一次
  watch(
    [days, () => visible?.value],
    () => {
      if (visible && !visible.value) return
      void refresh()
    },
    { immediate: true },
  )

  return { loading, error, summary, eventsStats, refresh }
}
