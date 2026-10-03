/**
 * @file frontend\src\composables\device\useDeviceAnalyticsCharts.ts
 * @module src
 */
/**
 * 设备分析图表组合式函数模块
 * 
 * 职责：
 * - 提供设备分析仪表盘中各类图表的渲染和管理能力
 * - 支持趋势图、域分布饼图、热力图、健康趋势图、事件统计图等多种图表类型
 * - 处理图表的生命周期管理（挂载/卸载）、尺寸变化响应、交互事件绑定
 * - 提供数据导出功能（CSV 格式）
 * 
 * 依赖：
 * - vue: ref, nextTick, ComputedRef, Ref
 * - echarts: 图表渲染引擎（动态 import，分包懒加载）
 * - @/utils/entity/entity-derived.util: getEntityDisplayName
 * - @/utils/device/domain-labels.util: getDomainLabel, resolveDomainId
 * - @/utils/chart/device-chart-copy.util: formatDualMetricTooltip, formatHeatmapTooltip
 * - @/utils/chart/device-chart-theme: 图表主题配置
 * - @/stores/entities.store: useEntitiesStore
 * - @/composables/device/useDeviceAnalyticsDashboard: useDeviceAnalyticsDashboard
 * - @/composables/device/useDeviceHealthTrend: useDeviceHealthTrend
 */
import { ref, nextTick, type ComputedRef, type Ref } from 'vue'
import type * as EchartsModuleNS from '@/utils/chart/echarts'
import type { EChartsCoreOption } from 'echarts/core'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { getDomainLabel, resolveDomainId } from '@/utils/device/domain-labels.util'
import { formatDualMetricTooltip, formatHeatmapTooltip } from '@/utils/chart/device-chart-copy.util'
import {
  deviceChartBase,
  deviceChartGrid,
  deviceChartTooltip,
  deviceChartXAxis,
  deviceChartYAxis,
  deviceChartLegend,
  devicePieTooltip,
  DEVICE_CHART_COLORS,
} from '@/utils/chart/device-chart-theme'
import type { useEntitiesStore } from '@/stores/entities.store'
import type { useDeviceAnalyticsDashboard } from '@/composables/device/useDeviceAnalyticsDashboard'
import type { useDeviceHealthTrend } from '@/composables/device/useDeviceHealthTrend'

/** ECharts 模块类型（仅类型引用，运行时经动态 import 懒加载） */
type EchartsModule = typeof EchartsModuleNS
/** ECharts 实例类型 */
type ChartInst = ReturnType<EchartsModule['default']['init']>

/** 仪表板摘要数据类型 */
type Summary = ReturnType<typeof useDeviceAnalyticsDashboard>['summary']
/** 事件统计数据类型 */
type EventsStats = ReturnType<typeof useDeviceAnalyticsDashboard>['eventsStats']
/** 健康趋势数据类型 */
type HealthTrend = ReturnType<typeof useDeviceHealthTrend>['trend']

/**
 * 设备分析图表组合式函数选项接口
 */
export function useDeviceAnalyticsCharts(options: {
  /** 组件可见性 */
  visible: ComputedRef<boolean>
  /** 加载状态 */
  loading: Ref<boolean>
  /** 错误信息 */
  error: Ref<string | null>
  /** 是否有数据 */
  hasData: ComputedRef<boolean>
  /** 当前激活的标签页 */
  activeTab: Ref<'overview' | 'activity' | 'health' | 'alerts'>
  /** 统计天数 */
  days: Ref<number>
  /** 摘要数据 */
  summary: Summary
  /** 事件统计数据 */
  eventsStats: EventsStats
  /** 健康趋势数据 */
  healthTrend: HealthTrend
  /** 热力图设备数据 */
  heatmapDevices: ComputedRef<
    Array<{ entityId: string; daily: Array<{ day: string; onCount: number }> }>
  >
  /** 事件域分布条目 */
  eventDomainEntries: ComputedRef<Array<[string, number]>>
  /** 实体存储 */
  entitiesStore: ReturnType<typeof useEntitiesStore>
  /** 域过滤回调 */
  onFilterDomain: (domain: string) => void
  /** 实体过滤回调 */
  onFilterEntity: (entityId: string) => void
  /** 刷新健康数据 */
  refreshHealth: () => void
  /** 刷新所有数据 */
  refresh: () => Promise<void>
}) {
  const {
    visible,
    loading,
    error,
    hasData,
    activeTab,
    days,
    summary,
    healthTrend,
    heatmapDevices,
    eventDomainEntries,
    entitiesStore,
    onFilterDomain,
    onFilterEntity,
    refreshHealth,
    refresh,
  } = options

  /** 趋势图表容器引用 */
  const trendChartRef = ref<HTMLElement | null>(null)
  /** 域分布图表容器引用 */
  const domainChartRef = ref<HTMLElement | null>(null)
  /** 热力图图表容器引用 */
  const heatmapChartRef = ref<HTMLElement | null>(null)
  /** 事件统计图表容器引用 */
  const eventsChartRef = ref<HTMLElement | null>(null)
  /** 健康趋势图表容器引用 */
  const healthTrendRef = ref<HTMLElement | null>(null)

  /** 趋势图表实例 */
  let trendChart: ChartInst | null = null
  /** 域分布图表实例 */
  let domainChart: ChartInst | null = null
  /** 热力图图表实例 */
  let heatmapChart: ChartInst | null = null
  /** 事件统计图表实例 */
  let eventsChart: ChartInst | null = null
  /** 健康趋势图表实例 */
  let healthTrendChart: ChartInst | null = null
  /** 尺寸变化观察器 */
  let resizeObserver: ResizeObserver | null = null
  /** 是否已有渲染任务在调度中 */
  let renderScheduled = false

  /**
   * 获取实体显示名称
   * 
   * @param id 实体 ID
   * @returns 实体显示名称，若无则返回实体 ID
   */
  function entityName(id: string) {
    return getEntityDisplayName(id, entitiesStore.entities[id]) || id
  }

  /**
   * 检查图表容器是否已就绪（有实际尺寸）
   * 
   * @param el 图表容器元素
   * @returns true 表示容器已就绪
   */
  function chartDomReady(el: HTMLElement | null): el is HTMLElement {
    if (!el) return false
    const { clientWidth, clientHeight } = el
    return clientWidth > 0 && clientHeight > 0
  }

  /**
   * 调度图表渲染任务
   * 
   * 使用 nextTick 延迟执行，避免重复调度
   */
  function scheduleRender() {
    if (renderScheduled || !visible.value) return
    renderScheduled = true
    nextTick(() => {
      renderScheduled = false
      void renderAll()
    })
  }

  /**
   * 绑定域分布图表的点击事件
   * 
   * 点击图表区域时触发域过滤回调
   */
  function bindDomainChartClick() {
    domainChart?.off('click')
    domainChart?.on('click', (params) => {
      const data = params.data as { domainId?: string; name?: string } | undefined
      const domain = data?.domainId || resolveDomainId(String(params.name || ''))
      if (domain) onFilterDomain(domain)
    })
  }

  /**
   * 绑定事件统计图表的点击事件
   * 
   * 点击图表区域时触发域过滤回调
   */
  function bindEventsChartClick() {
    eventsChart?.off('click')
    eventsChart?.on('click', (params) => {
      const data = params.data as { domainId?: string; name?: string } | undefined
      const domain = data?.domainId || resolveDomainId(String(params.name || ''))
      if (domain) onFilterDomain(domain)
    })
  }

  /**
   * 绑定热力图的点击事件
   * 
   * 点击热力图单元格时触发实体过滤回调
   */
  function bindHeatmapClick() {
    heatmapChart?.off('click')
    heatmapChart?.on('click', (params) => {
      const val = params.value
      if (!Array.isArray(val)) return
      const yIdx = val[1]
      if (typeof yIdx !== 'number') return
      const device = heatmapDevices.value[yIdx]
      if (device) onFilterEntity(device.entityId)
    })
  }

  /**
   * 渲染使用趋势图表（切换次数 + 运行时长）
   */
  async function renderTrendChart() {
    if (!chartDomReady(trendChartRef.value)) return
    if (!trendChart) trendChart = (await import('@/utils/chart/echarts')).default.init(trendChartRef.value)
    const daily = summary.value.dailyTotals || []
    const labels = daily.map((d) => d.day.slice(5))
    trendChart.setOption(
      {
        ...deviceChartBase(),
        tooltip: {
          ...deviceChartTooltip(),
          trigger: 'axis',
          confine: true,
          formatter: (params: unknown) =>
            formatDualMetricTooltip(params, [
              { name: '切换次数', unit: '次' },
              { name: '运行时长', unit: '分钟' },
            ]),
        },
        legend: deviceChartLegend(),
        grid: deviceChartGrid({ top: 36 }),
        xAxis: deviceChartXAxis(labels),
        yAxis: [
          { ...deviceChartYAxis('次数(次)'), position: 'left' },
          { ...deviceChartYAxis('时长(分)'), position: 'right', splitLine: { show: false } },
        ],
        series: [
          {
            name: '切换次数',
            type: 'line',
            smooth: true,
            data: daily.map((d) => d.onCount),
            itemStyle: { color: DEVICE_CHART_COLORS.accent },
            areaStyle: { color: 'rgba(56,189,248,0.12)' },
          },
          {
            name: '运行时长',
            type: 'line',
            smooth: true,
            yAxisIndex: 1,
            data: daily.map((d) => Math.round(d.totalRuntimeMs / 60000)),
            itemStyle: { color: DEVICE_CHART_COLORS.purple },
          },
        ],
      } satisfies EChartsCoreOption,
      true,
    )
    trendChart.resize()
  }

  /**
   * 渲染域分布饼图
   */
  async function renderDomainChart() {
    if (!chartDomReady(domainChartRef.value)) return
    if (!domainChart) domainChart = (await import('@/utils/chart/echarts')).default.init(domainChartRef.value)
    const domains = summary.value.domainBreakdown || []
    domainChart.setOption(
      {
        ...deviceChartBase(),
        tooltip: { ...devicePieTooltip(), confine: true, appendTo: 'body' },
        series: [
          {
            type: 'pie',
            radius: ['45%', '68%'],
            data: domains.map((d) => ({
              name: getDomainLabel(d.domain),
              value: d.onCount,
              domainId: d.domain,
            })),
            label: { show: false },
            emphasis: { scale: false, label: { show: false } },
          },
        ],
      } satisfies EChartsCoreOption,
      true,
    )
    domainChart.resize()
    bindDomainChartClick()
  }

  /**
   * 渲染设备使用热力图
   */
  async function renderHeatmapChart() {
    if (!chartDomReady(heatmapChartRef.value) || !heatmapDevices.value.length) return
    if (!heatmapChart) heatmapChart = (await import('@/utils/chart/echarts')).default.init(heatmapChartRef.value)
    const devices = heatmapDevices.value
    const dayLabels = (summary.value.dailyTotals || []).map((d) => d.day.slice(5))
    const data: Array<[number, number, number]> = []
    devices.forEach((device, yIdx) => {
      dayLabels.forEach((_, xIdx) => {
        const fullDay = summary.value.dailyTotals[xIdx]?.day
        const row = device.daily.find((d) => d.day === fullDay)
        data.push([xIdx, yIdx, row?.onCount ?? 0])
      })
    })
    heatmapChart.setOption(
      {
        ...deviceChartBase(),
        tooltip: {
          position: 'top',
          ...deviceChartTooltip(),
          confine: true,
          formatter: (params: unknown) => {
            const item = (Array.isArray(params) ? params[0] : params) as {
              data?: [number, number, number]
            }
            const point = item?.data
            if (!Array.isArray(point)) return ''
            const [xIdx, yIdx, count] = point
            const dayLabel = dayLabels[xIdx] ?? ''
            const device = devices[yIdx]
            return formatHeatmapTooltip(dayLabel, entityName(device?.entityId ?? ''), count ?? 0)
          },
        },
        grid: { height: '72%', top: '6%', left: 88, right: 12, bottom: 32 },
        xAxis: {
          type: 'category',
          name: '日期',
          data: dayLabels,
          splitArea: { show: true },
          axisLabel: { color: DEVICE_CHART_COLORS.axis, fontSize: 9 },
        },
        yAxis: {
          type: 'category',
          name: '设备',
          data: devices.map((d) => entityName(d.entityId).slice(0, 12)),
          axisLabel: { color: DEVICE_CHART_COLORS.axis, fontSize: 9 },
        },
        visualMap: {
          min: 0,
          max: Math.max(10, ...data.map((d) => d[2])),
          calculable: false,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          itemWidth: 10,
          itemHeight: 80,
          inRange: { color: ['#1e293b', '#38bdf8', '#fbbf24'] },
          text: ['多', '少'],
          textStyle: { color: DEVICE_CHART_COLORS.axis, fontSize: 9 },
        },
        series: [{ type: 'heatmap', data, label: { show: false } }],
      } satisfies EChartsCoreOption,
      true,
    )
    heatmapChart.resize()
    bindHeatmapClick()
  }

  /**
   * 渲染健康趋势图表（离线设备数 + 低电量设备数）
   */
  async function renderHealthTrendChart() {
    if (!chartDomReady(healthTrendRef.value) || healthTrend.value.length < 2) return
    if (!healthTrendChart) healthTrendChart = (await import('@/utils/chart/echarts')).default.init(healthTrendRef.value)
    const rows = healthTrend.value
    const labels = rows.map((r) => r.day.slice(5))
    healthTrendChart.setOption(
      {
        ...deviceChartBase(),
        tooltip: { ...deviceChartTooltip(), trigger: 'axis', confine: true },
        legend: { textStyle: { color: DEVICE_CHART_COLORS.axis, fontSize: 10 } },
        grid: deviceChartGrid(),
        xAxis: deviceChartXAxis(labels),
        yAxis: deviceChartYAxis('数量'),
        series: [
          {
            name: '离线',
            type: 'line',
            smooth: true,
            areaStyle: { color: 'rgba(248,113,113,0.12)' },
            data: rows.map((r) => r.offline),
            itemStyle: { color: DEVICE_CHART_COLORS.red },
          },
          {
            name: '低电量',
            type: 'line',
            smooth: true,
            areaStyle: { color: 'rgba(251,191,36,0.12)' },
            data: rows.map((r) => r.lowBattery),
            itemStyle: { color: DEVICE_CHART_COLORS.amber },
          },
        ],
      } satisfies EChartsCoreOption,
      true,
    )
    healthTrendChart.resize()
  }

  /**
   * 渲染事件统计柱状图
   */
  async function renderEventsChart() {
    if (!chartDomReady(eventsChartRef.value) || !eventDomainEntries.value.length) return
    if (!eventsChart) eventsChart = (await import('@/utils/chart/echarts')).default.init(eventsChartRef.value)
    const entries = eventDomainEntries.value
    eventsChart.setOption(
      {
        ...deviceChartBase(),
        tooltip: { ...deviceChartTooltip(), confine: true },
        grid: deviceChartGrid(),
        xAxis: deviceChartXAxis(entries.map(([d]) => getDomainLabel(d))),
        yAxis: deviceChartYAxis('事件(次)'),
        series: [
          {
            type: 'bar',
            data: entries.map(([domain, count]) => ({
              name: getDomainLabel(domain),
              value: count,
              domainId: domain,
            })),
            itemStyle: { color: DEVICE_CHART_COLORS.green, borderRadius: [4, 4, 0, 0] },
          },
        ],
      } satisfies EChartsCoreOption,
      true,
    )
    eventsChart.resize()
    bindEventsChartClick()
  }

  /**
   * 根据当前激活的标签页渲染对应图表
   */
  async function renderActiveTab() {
    if (!visible.value || loading.value || error.value || !hasData.value) return
    switch (activeTab.value) {
      case 'overview':
        await renderTrendChart()
        await renderDomainChart()
        break
      case 'activity':
        await renderHeatmapChart()
        break
      case 'health':
        await renderHealthTrendChart()
        await renderEventsChart()
        break
      case 'alerts':
        break
    }
  }

  /**
   * 渲染所有图表
   */
  async function renderAll() {
    await renderActiveTab()
  }

  /**
   * 重新加载数据并渲染图表
   */
  async function reload() {
    refreshHealth()
    await refresh()
    scheduleRender()
  }

  /**
   * 导出设备使用统计数据为 CSV 文件
   */
  function exportCsv() {
    if (!summary.value.topDevices.length) return
    // CSV 表头
    const rows = [['排名', 'entity_id', '名称', '切换次数', '运行时长(分钟)']]
    // 数据行
    summary.value.topDevices.forEach((d, i) => {
      rows.push([
        String(i + 1),
        d.entityId,
        entityName(d.entityId),
        String(d.onCount),
        String(Math.round(d.totalRuntimeMs / 60000)),
      ])
    })
    // 生成 CSV 内容
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    // 创建 Blob 并下载
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `device-usage-${days.value}d.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 处理窗口尺寸变化
   */
  function handleResize() {
    if (!visible.value) return
    trendChart?.resize()
    domainChart?.resize()
    heatmapChart?.resize()
    healthTrendChart?.resize()
    eventsChart?.resize()
  }

  /**
   * 挂载图表组件
   * 
   * @param rootRef 根容器引用
   */
  function mountCharts(rootRef: Ref<HTMLElement | null>) {
    resizeObserver = new ResizeObserver(() => scheduleRender())
    if (rootRef.value) resizeObserver.observe(rootRef.value)
    window.addEventListener('resize', handleResize)
    scheduleRender()
  }

  /**
   * 卸载图表组件，清理资源
   */
  function unmountCharts() {
    resizeObserver?.disconnect()
    window.removeEventListener('resize', handleResize)
    trendChart?.dispose()
    domainChart?.dispose()
    heatmapChart?.dispose()
    eventsChart?.dispose()
    healthTrendChart?.dispose()
    trendChart = null
    domainChart = null
    heatmapChart = null
    eventsChart = null
    healthTrendChart = null
  }

  return {
    trendChartRef,
    domainChartRef,
    heatmapChartRef,
    eventsChartRef,
    healthTrendRef,
    scheduleRender,
    renderAll,
    reload,
    exportCsv,
    mountCharts,
    unmountCharts,
  }
}
