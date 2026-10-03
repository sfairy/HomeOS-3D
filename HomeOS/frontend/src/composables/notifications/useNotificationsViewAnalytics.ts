/**
 * @file useNotificationsViewAnalytics.ts
 * @module composables/notifications
 * @description 通知中心分析视图 composable：5 张 ECharts（来源 / 级别 / 排行 / 时段 / 已读）+
 * KPI 指标卡 + 点击下钻过滤。
 *
 * 职责：
 * - 接收宿主 props（notifications / stats / summary / hours / activeSource / formatCount）的 ToRefs；
 * - 派生来源 / 级别 / 时段 buckets（优先服务端 stats，回退到本地 notifications 聚合）；
 * - 构建 5 张图表 option 并在 onMounted / watch 触发渲染；
 * - 绑定 ResizeObserver 自适应尺寸；
 * - 点击来源 / 级别 / 排行图表元素 → emit 过滤事件；
 * - onUnmounted 释放所有图表与 observer。
 *
 * 依赖：
 * - vue（ref、computed、watch、onMounted、onUnmounted、nextTick、ToRefs、unref）
 * - echarts（ECharts、ECElementEvent、EChartsCoreOption；echarts 实例经动态 import 懒加载）
 * - @/utils/chart/echarts（echarts 实例，动态 import）
 * - @/utils/chart/kiosk-animation（getKioskAnimationOptions 动画开关）
 * - @/utils/ui/chart-resize.util（observeChartResize）
 * - @/utils/notification/analytics.util（buckets 构建与 summary / stats 类型）
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick, type ToRefs, unref } from 'vue'
import { getKioskAnimationOptions } from '@/utils/chart/kiosk-animation'
import type { ECharts, ECElementEvent, EChartsCoreOption } from 'echarts'
import { observeChartResize } from '@/utils/ui/chart-resize.util'
import {
  buildLevelBuckets,
  buildLevelBucketsFromStats,
  buildSourceBuckets,
  buildSourceBucketsFromStats,
  buildTimeBucketsFromNotifications,
  type NotificationAnalyticsSummary,
  type NotificationStatsPayload,
} from '@/utils/notification/analytics.util'

/** 5 张图表的 key：来源 / 级别 / 排行 / 时段 / 已读 */
type ChartKey = 'source' | 'level' | 'rank' | 'time' | 'read'

/** 通知行的最小数据形状（来源 / 级别 / 创建时间） */
type NotificationRow = {
  source?: string | null
  level?: string | null
  createdAt?: string | null
  time?: string | null
}

/**
 * 通知中心分析视图 composable。
 *
 * @param props 通知 / stats / summary / hours / activeSource / formatCount 的 ToRefs
 * @param emit 过滤事件回调（filter-by-source / filter-by-level）
 * @returns 5 张图表的 ref、KPI 单元格数组、summary
 */
export function useNotificationsViewAnalytics(
  props: ToRefs<{
    notifications: NotificationRow[]
    stats: NotificationStatsPayload | null
    summary: NotificationAnalyticsSummary
    hours: number
    activeSource: string
    formatCount: (n: number) => string
  }>,
  emit: (event: 'filter-by-source' | 'filter-by-level', value: string) => void,
) {
  // 5 张图表的容器 ref（DOM 挂载点）
  const sourceChartRef = ref<HTMLElement | null>(null)
  const levelChartRef = ref<HTMLElement | null>(null)
  const rankChartRef = ref<HTMLElement | null>(null)
  const timeChartRef = ref<HTMLElement | null>(null)
  const readChartRef = ref<HTMLElement | null>(null)

  // 5 张 echarts 实例（懒初始化）
  const charts: Record<ChartKey, ECharts | null> = {
    source: null,
    level: null,
    rank: null,
    time: null,
    read: null,
  }
  // 5 个 ResizeObserver 的 stop 句柄
  let stopSourceResize: (() => void) | null = null
  let stopLevelResize: (() => void) | null = null
  let stopRankResize: (() => void) | null = null
  let stopTimeResize: (() => void) | null = null
  let stopReadResize: (() => void) | null = null

  // 解包 props：服务端 stats / summary / notifications / hours
  const serverStats = computed(() => unref(props.stats))
  const summary = computed(() => unref(props.summary))
  const notifications = computed(() => unref(props.notifications))
  const hours = computed(() => unref(props.hours))

  // 来源 buckets：优先服务端 stats，回退到本地 notifications 聚合
  const sourceBuckets = computed(() =>
    serverStats.value?.bySource
      ? buildSourceBucketsFromStats(serverStats.value.bySource)
      : buildSourceBuckets(notifications.value),
  )

  // 级别 buckets：优先服务端 stats，回退到本地 notifications 聚合
  const levelBuckets = computed(() =>
    serverStats.value?.byLevel
      ? buildLevelBucketsFromStats(serverStats.value.byLevel)
      : buildLevelBuckets(notifications.value),
  )

  // 时段 buckets：优先服务端 stats，回退到本地按 hours 窗口聚合
  const timeBuckets = computed(() =>
    serverStats.value?.byTime?.length
      ? serverStats.value.byTime
      : buildTimeBucketsFromNotifications(notifications.value, hours.value),
  )

  // KPI 指标卡：总量 / 未读 / 已读率 / 紧急 / 峰值时段 / 均值（每项带 tone 配色）
  const kpiCells = computed(() => {
    const s = summary.value
    const formatCount = unref(props.formatCount)
    return [
      {
        key: 'total',
        label: '统计总量',
        value: formatCount(s.total),
        hint: `${hours.value}h 窗口`,
        tone: 'accent',
      },
      {
        key: 'unread',
        label: '未读',
        value: String(s.unread),
        hint: s.unread ? '待处理' : '已全部已读',
        tone: s.unread ? 'pink' : 'muted',
      },
      {
        key: 'read-rate',
        label: '已读率',
        value: `${s.readRate}%`,
        hint: `已读 ${formatCount(s.read)}`,
        tone: s.readRate >= 80 ? 'sky' : 'warn',
      },
      {
        key: 'danger',
        label: '紧急',
        value: String(s.dangerCount),
        hint: s.warnCount ? `警告 ${s.warnCount}` : '—',
        tone: s.dangerCount ? 'warn' : 'muted',
      },
      {
        key: 'peak',
        label: '峰值时段',
        value: s.peakTimeLabel || '—',
        hint: s.peakTimeCount ? `${formatCount(s.peakTimeCount)} 条` : '暂无',
        tone: s.peakTimeCount ? 'accent' : 'muted',
      },
      {
        key: 'avg',
        label: '均值',
        value: s.avgPerHour != null ? `${s.avgPerHour}/h` : '—',
        hint: s.topSourceLabel ? `最热 ${s.topSourceLabel}` : '—',
        tone: 'pink',
      },
    ]
  })

  // 图表基础 option：动画 + 透明背景
  const chartBase = { ...getKioskAnimationOptions(), backgroundColor: 'transparent' }
  // 图表 tooltip 样式：粉色调暗色玻璃拟态
  const chartTooltip = {
    backgroundColor: 'rgba(12, 12, 18, 0.94)',
    borderColor: 'rgba(244, 114, 182, 0.32)',
    borderWidth: 1,
    padding: [8, 12],
    extraCssText:
      'border-radius: 10px; backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0,0,0,0.35);',
    textStyle: { color: '#fbcfe8', fontSize: 12, fontWeight: 600 },
  }
  // 坐标轴 / 分割线样式
  const axisLineStyle = { lineStyle: { color: 'rgba(255,255,255,0.07)' } }
  const splitLineStyle = { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } }

  /** 生成柱状图垂直渐变（顶部不透明，底部半透明）。 */
  function barGradient(color: string) {
    return {
      type: 'linear',
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color },
        { offset: 1, color: `${color}66` },
      ],
    }
  }

  /** 计算 y 轴最大值：取最大值与 1 的较大者，避免 0 数据时空轴。 */
  function yMax(values: number[]) {
    return Math.max(...values, 0, 1)
  }

  /** 构建时段折线图 option（小时分布，颜色：粉 #f472b6）。 */
  function buildTimeOption(): EChartsCoreOption {
    const buckets = timeBuckets.value
    const counts = buckets.map((b) => b.count)
    return {
      ...chartBase,
      grid: { left: 36, right: 12, top: 16, bottom: buckets.length > 8 ? 36 : 24 },
      xAxis: {
        type: 'category',
        data: buckets.map((b) => b.label),
        axisLine: axisLineStyle,
        axisTick: { show: false },
        axisLabel: {
          color: 'rgba(255,255,255,0.58)',
          fontSize: 9,
          interval: buckets.length > 12 ? Math.floor(buckets.length / 8) : 0,
          rotate: buckets.length > 10 ? 32 : 0,
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yMax(counts),
        minInterval: 1,
        axisLine: { show: false },
        splitLine: splitLineStyle,
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          data: counts,
          lineStyle: { width: 2.5, color: '#f472b6' },
          itemStyle: { color: '#f472b6', borderColor: '#fb7185', borderWidth: 1 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(244, 114, 182, 0.35)' },
                { offset: 1, color: 'rgba(244, 114, 182, 0.02)' },
              ],
            },
          },
        },
      ],
      tooltip: { ...chartTooltip, trigger: 'axis' },
    }
  }

  /** 构建已读率环形饼图 option（已读绿色 / 未读粉色）。 */
  function buildReadOption(): EChartsCoreOption {
    const s = summary.value
    const data = [
      { name: '已读', value: s.read, itemStyle: { color: '#34d399' } },
      { name: '未读', value: s.unread, itemStyle: { color: '#f472b6' } },
    ]
    return {
      ...chartBase,
      tooltip: { ...chartTooltip, trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['46%', '72%'],
          center: ['50%', '54%'],
          label: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: 600 },
          itemStyle: { borderRadius: 4, borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
          data: s.total ? data : [{ name: '暂无', value: 1, itemStyle: { color: '#64748b' } }],
        },
      ],
    }
  }

  /** 构建来源环形饼图 option（按 bucket 颜色，过滤 count=0 项）。 */
  function buildSourceOption(): EChartsCoreOption {
    const buckets = sourceBuckets.value.filter((b) => b.count > 0)
    const data = buckets.length
      ? buckets.map((b) => ({
          name: b.label,
          value: b.count,
          key: b.key,
          itemStyle: { color: b.color },
        }))
      : [{ name: '暂无', value: 1, key: '', itemStyle: { color: '#64748b' } }]
    return {
      ...chartBase,
      tooltip: { ...chartTooltip, trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '54%'],
          label: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: 600 },
          itemStyle: { borderRadius: 4, borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
          data,
        },
      ],
    }
  }

  /** 构建级别柱状图 option（按 level 颜色渐变）。 */
  function buildLevelOption(): EChartsCoreOption {
    const buckets = levelBuckets.value
    const labels = buckets.length ? buckets.map((b) => b.label) : ['暂无']
    const values = buckets.length ? buckets.map((b) => b.count) : [0]
    return {
      ...chartBase,
      grid: { left: 36, right: 12, top: 16, bottom: buckets.length > 4 ? 36 : 24 },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: axisLineStyle,
        axisTick: { show: false },
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yMax(values),
        minInterval: 1,
        axisLine: { show: false },
        splitLine: splitLineStyle,
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
      },
      series: [
        {
          type: 'bar',
          data: values.map((value, i) => ({
            value,
            level: buckets[i]?.level,
            itemStyle: {
              color: barGradient(buckets[i]?.color || '#f472b6'),
              borderRadius: [6, 6, 0, 0],
            },
          })),
          barWidth: 18,
        },
      ],
      tooltip: { ...chartTooltip, trigger: 'axis' },
    }
  }

  /** 构建来源排行横向柱状图 option（取前 8）。 */
  function buildRankOption(): EChartsCoreOption {
    const buckets = sourceBuckets.value.slice(0, 8)
    const labels = buckets.length ? buckets.map((b) => b.label.slice(0, 8)) : ['暂无']
    const values = buckets.length ? buckets.map((b) => b.count) : [0]
    return {
      ...chartBase,
      grid: {
        left: 56,
        right: 16,
        top: 8,
        bottom: 8,
        outerBoundsMode: 'same',
        outerBoundsContain: 'axisLabel',
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: yMax(values),
        splitLine: splitLineStyle,
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
      },
      yAxis: {
        type: 'category',
        data: labels,
        axisLine: { show: false },
        axisLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
      },
      series: [
        {
          type: 'bar',
          data: values.map((value, i) => ({
            value,
            key: buckets[i]?.key,
            itemStyle: {
              color: barGradient(buckets[i]?.color || '#f472b6'),
              borderRadius: [0, 6, 6, 0],
            },
          })),
          barWidth: 10,
        },
      ],
      tooltip: { ...chartTooltip, trigger: 'axis' },
    }
  }

  /**
   * 确保图表实例存在并应用 option：懒初始化 echarts.init，setOption 第二参数 true 表示 notMerge。
   *
   * @param key 图表 key
   * @param el 容器 DOM
   * @param builder option 构建函数
   */
  async function ensureChart(key: ChartKey, el: HTMLElement | null, builder: () => EChartsCoreOption) {
    if (!el) return
    if (!charts[key]) charts[key] = (await import('@/utils/chart/echarts')).default.init(el)
    charts[key]!.setOption(builder(), true)
    charts[key]!.resize()
  }

  /**
   * 绑定来源 / 排行 / 级别图表的点击下钻：先 off 旧的，再 on 新的，
   * 点击元素时按 key / level emit 过滤事件。
   */
  function bindChartClicks() {
    charts.source?.off('click')
    charts.rank?.off('click')
    charts.level?.off('click')
    charts.source?.on('click', (params: ECElementEvent) => {
      const data = params?.data as { key?: string } | undefined
      const key = data?.key || sourceBuckets.value.find((b) => b.label === params?.name)?.key
      if (key) emit('filter-by-source', key)
    })
    charts.rank?.on('click', (params: ECElementEvent) => {
      const idx = params?.dataIndex
      const row = sourceBuckets.value[idx ?? -1]
      if (row?.key) emit('filter-by-source', row.key)
    })
    charts.level?.on('click', (params: ECElementEvent) => {
      const idx = params?.dataIndex
      const row = levelBuckets.value[idx ?? -1]
      if (row?.level) emit('filter-by-level', row.level)
    })
  }

  /** 渲染 5 张图表并绑定点击下钻。 */
  async function renderCharts() {
    await ensureChart('time', timeChartRef.value, buildTimeOption)
    await ensureChart('read', readChartRef.value, buildReadOption)
    await ensureChart('source', sourceChartRef.value, buildSourceOption)
    await ensureChart('level', levelChartRef.value, buildLevelOption)
    await ensureChart('rank', rankChartRef.value, buildRankOption)
    bindChartClicks()
  }

  /**
   * 释放所有图表与 ResizeObserver：先 stop 所有 resize，再 dispose 所有 echarts 实例。
   * 在 onUnmounted 调用，避免内存泄漏。
   */
  function disposeCharts() {
    for (const stop of [
      stopSourceResize,
      stopLevelResize,
      stopRankResize,
      stopTimeResize,
      stopReadResize,
    ])
      stop?.()
    stopSourceResize = stopLevelResize = stopRankResize = stopTimeResize = stopReadResize = null
    for (const key of Object.keys(charts) as ChartKey[]) {
      charts[key]?.dispose()
      charts[key] = null
    }
  }

  /** 为 5 张图表绑定 ResizeObserver，容器尺寸变化时 resize 对应 echarts 实例。 */
  function bindResizeObservers() {
    stopTimeResize = observeChartResize(timeChartRef.value, () => charts.time?.resize())
    stopReadResize = observeChartResize(readChartRef.value, () => charts.read?.resize())
    stopSourceResize = observeChartResize(sourceChartRef.value, () => charts.source?.resize())
    stopLevelResize = observeChartResize(levelChartRef.value, () => charts.level?.resize())
    stopRankResize = observeChartResize(rankChartRef.value, () => charts.rank?.resize())
  }

  // 监听数据变化：notifications / stats / summary / hours / activeSource 任一变化 → 重渲染
  watch(
    [notifications, () => unref(props.stats), summary, hours, () => unref(props.activeSource)],
    () => {
      nextTick(renderCharts)
    },
    { deep: true },
  )

  // 挂载：nextTick 等 DOM 渲染完成 → 渲染 + 绑定 resize，再延时 120ms 二次渲染兜底
  onMounted(() => {
    nextTick(() => {
      void renderCharts()
      bindResizeObservers()
      window.setTimeout(() => void renderCharts(), 120)
    })
  })

  // 卸载：释放所有图表与 observer，避免内存泄漏
  onUnmounted(disposeCharts)

  return {
    sourceChartRef,
    levelChartRef,
    rankChartRef,
    timeChartRef,
    readChartRef,
    kpiCells,
    summary,
  }
}
