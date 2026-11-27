import { type EChartsCoreOption, type ECharts, type ECElementEvent } from 'echarts'
import { getKioskAnimationOptions } from '@/domain/layout/composables/kiosk-animation'
import { barGradient, CHART_EMPTY_COLOR, chartLinearGradient, countCategoryAxis, countValueAxis, createChartTooltip, pieEmptyData, pieSeries, rankCategoryAxis } from '@/kernel/utils/chart'
import { ref, computed, watch, onMounted, onUnmounted, nextTick, type ToRefs, type Ref, type ComponentPublicInstance, unref, inject } from 'vue'
import { observeChartResize } from '@/kernel/utils/ui/chart-resize.util'
import { buildLevelBuckets, buildLevelBucketsFromStats, buildSourceBuckets, buildSourceBucketsFromStats, buildTimeBucketsFromNotifications, formatPercent, type NotificationAnalyticsSummary, type NotificationStatsPayload, computeNotificationAnalyticsSummary, formatNotificationHourOption, formatNotificationCount, levelFilterLabel, NOTIFICATION_HOUR_OPTIONS } from '@/features/notifications/model/utils/analytics.util'
import { fetchNotificationStats, fetchWebPushVapidPublicKey, subscribeWebPush, testWebPush } from '@/domain/api/notifications'
import { useNotificationCenter, NOTIFICATION_CENTER_KEY } from '@/domain/widget/composables'
import { getApiErrorMessage, logger } from '@/kernel/utils/core'
import { notificationSourceLabel } from '@homeos/shared'
import { notifyError } from '@/kernel/ui/notify'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'

/**
 * @file notifications-analytics-charts.internals.ts
 * @module frontend/src/features/notifications/composables
 */
/** 通知分析页：echarts option 构建（纯函数，无 Vue 依赖以外的状态） */


type AnalyticsSourceBucket = {
  key: string
  label: string
  count: number
  color: string
}

type AnalyticsLevelBucket = {
  level: string
  label: string
  count: number
  color: string
}

type AnalyticsTimeBucket = {
  label: string
  count: number
}

type AnalyticsReadSummary = {
  total: number
  read: number
  unread: number
}

const chartTooltip = createChartTooltip('rgba(12, 12, 18, 0.94)', {
  borderColor: 'rgba(244, 114, 182, 0.32)',
  borderWidth: 1,
  padding: [8, 12],
  extraCssText: 'border-radius: 10px; backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0,0,0,0.35);',
  textStyle: { color: '#fbcfe8', fontSize: 12, fontWeight: 600 },
})

function chartBase() {
  return { ...getKioskAnimationOptions(), backgroundColor: 'transparent' }
}

export function buildNotificationsTimeOption(buckets: AnalyticsTimeBucket[]): EChartsCoreOption {
  const counts = buckets.map((bucket) => bucket.count)
  return {
    ...chartBase(),
    grid: { left: 36, right: 12, top: 16, bottom: buckets.length > 8 ? 36 : 24 },
    xAxis: countCategoryAxis(
      buckets.map((bucket) => bucket.label),
      { adaptive: true, labelFontSize: 9 },
    ),
    yAxis: countValueAxis(counts),
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
          color: chartLinearGradient([
            [0, 'rgba(244, 114, 182, 0.35)'],
            [1, 'rgba(244, 114, 182, 0.02)'],
          ]),
        },
      },
    ],
    tooltip: { ...chartTooltip, trigger: 'axis' },
  }
}

export function buildNotificationsReadOption(summary: AnalyticsReadSummary): EChartsCoreOption {
  const data = [
    { name: '已读', value: summary.read, itemStyle: { color: '#34d399' } },
    { name: '未读', value: summary.unread, itemStyle: { color: '#f472b6' } },
  ]
  return {
    ...chartBase(),
    tooltip: { ...chartTooltip, trigger: 'item' },
    series: [pieSeries(summary.total ? data : pieEmptyData(), ['46%', '72%'])],
  }
}

export function buildNotificationsSourceOption(sourceBuckets: AnalyticsSourceBucket[]): EChartsCoreOption {
  const buckets = sourceBuckets.filter((bucket) => bucket.count > 0)
  const data = buckets.length
    ? buckets.map((bucket) => ({
        name: bucket.label,
        value: bucket.count,
        key: bucket.key,
        itemStyle: { color: bucket.color },
      }))
    : [{ name: '暂无', value: 1, key: '', itemStyle: { color: CHART_EMPTY_COLOR } }]
  return {
    ...chartBase(),
    tooltip: { ...chartTooltip, trigger: 'item' },
    series: [pieSeries(data)],
  }
}

export function buildNotificationsLevelOption(levelBuckets: AnalyticsLevelBucket[]): EChartsCoreOption {
  const labels = levelBuckets.length ? levelBuckets.map((bucket) => bucket.label) : ['暂无']
  const values = levelBuckets.length ? levelBuckets.map((bucket) => bucket.count) : [0]
  return {
    ...chartBase(),
    grid: { left: 36, right: 12, top: 16, bottom: levelBuckets.length > 4 ? 36 : 24 },
    xAxis: countCategoryAxis(labels),
    yAxis: countValueAxis(values),
    series: [
      {
        type: 'bar',
        data: values.map((value, index) => ({
          value,
          level: levelBuckets[index]?.level,
          itemStyle: {
            color: barGradient(levelBuckets[index]?.color || '#f472b6'),
            borderRadius: [6, 6, 0, 0],
          },
        })),
        barWidth: 18,
      },
    ],
    tooltip: { ...chartTooltip, trigger: 'axis' },
  }
}

export function buildNotificationsRankOption(sourceBuckets: AnalyticsSourceBucket[]): EChartsCoreOption {
  const buckets = sourceBuckets.slice(0, 8)
  const labels = buckets.length ? buckets.map((bucket) => bucket.label.slice(0, 8)) : ['暂无']
  const values = buckets.length ? buckets.map((bucket) => bucket.count) : [0]
  return {
    ...chartBase(),
    grid: {
      left: 56,
      right: 16,
      top: 8,
      bottom: 8,
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel',
    },
    xAxis: countValueAxis(values, { minInterval: false }),
    yAxis: rankCategoryAxis(labels),
    series: [
      {
        type: 'bar',
        data: values.map((value, index) => ({
          value,
          key: buckets[index]?.key,
          itemStyle: {
            color: barGradient(buckets[index]?.color || '#f472b6'),
            borderRadius: [0, 6, 6, 0],
          },
        })),
        barWidth: 10,
      },
    ],
    tooltip: { ...chartTooltip, trigger: 'axis' },
  }
}

/** KPI 指标卡 + 点击下钻过滤。 */

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

  /**
   * 生成函数式模板 ref：把 DOM 元素写回指定 Ref。
   *
   * 不用 `ref="name"` 字符串形式——vue-tsc 不会把字符串 ref 当作对脚本变量的读取，
   * 开启 `noUnusedLocals` 后会误报「声明但未使用」；函数 ref 是显式引用。
   * 换成 `useTemplateRef('name')` 也没用：实测 vue-tsc 3.3.14 / vue 3.5.44 下
   * `ref="x"` + `useTemplateRef('x')` 照样报 TS6133，模板字符串 ref 不参与读取判定。
   */
  function bindChartRef(target: Ref<HTMLElement | null>) {
    return (el: Element | ComponentPublicInstance | null) => {
      target.value = el instanceof HTMLElement ? el : null
    }
  }
  const bindSourceChart = bindChartRef(sourceChartRef)
  const bindLevelChart = bindChartRef(levelChartRef)
  const bindRankChart = bindChartRef(rankChartRef)
  const bindTimeChart = bindChartRef(timeChartRef)
  const bindReadChart = bindChartRef(readChartRef)

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
        value: formatPercent(s.readRate),
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

  function buildTimeOption(): EChartsCoreOption {
    return buildNotificationsTimeOption(timeBuckets.value)
  }
  function buildReadOption(): EChartsCoreOption {
    return buildNotificationsReadOption(summary.value)
  }
  function buildSourceOption(): EChartsCoreOption {
    return buildNotificationsSourceOption(sourceBuckets.value)
  }
  function buildLevelOption(): EChartsCoreOption {
    return buildNotificationsLevelOption(levelBuckets.value)
  }
  function buildRankOption(): EChartsCoreOption {
    return buildNotificationsRankOption(sourceBuckets.value)
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
    // getOrInitChart：data watch 深监听会紧邻首帧再次触发 renderCharts，
    // 两次调用都可能在 await 前通过 ``if (!charts[key])``，直接 init 会触发重复初始化告警
    if (!charts[key]) charts[key] = (await import('@/kernel/utils/chart')).getOrInitChart(el)
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
    for (const stop of [stopSourceResize, stopLevelResize, stopRankResize, stopTimeResize, stopReadResize]) stop?.()
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

  // 重渲染调度：合并同一轮内的多次触发。图表 option 构建 + echarts.setOption + resize
  // 每次都要走一遍 5 张图，重复触发（列表批量变更时很常见）不该排成 5 份渲染任务。
  let renderInFlight = false
  let renderPending = false
  async function runRender() {
    renderInFlight = true
    try {
      do {
        renderPending = false
        await renderCharts()
      } while (renderPending)
    } finally {
      renderInFlight = false
    }
  }
  function scheduleRender() {
    if (renderInFlight) {
      renderPending = true
      return
    }
    void runRender()
  }

  /**
   * 图表指纹：只取**图表真正用到**的字段（来源 / 级别 / 创建时间 + 两个小对象 + 窗口），
   * 拼成一个字符串。
   *
   * 原实现对 ``[notifications, stats, summary, hours, activeSource]`` 开 ``deep: true``：
   * 每次变更都要深遍历整个通知列表（每条通知的全部字段），而且列表里任一行的任一字段
   * 变化（比如某条通知的已读态被打上）都会重渲染全部 5 张图。指纹方案里订阅范围收窄到
   * 「参与聚合的字段」，且内容没变时字符串不变、watcher 不会触发。
   */
  const analyticsSignature = computed(() => {
    const rows = notifications.value
    const listKey =
      rows.length > 0
        ? rows
            .map((row) => `${row.source ?? ''}\u0000${row.level ?? ''}\u0000${row.createdAt ?? row.time ?? ''}`)
            .join('\u0001')
        : ''
    return [
      hours.value,
      unref(props.activeSource),
      JSON.stringify(serverStats.value ?? null),
      JSON.stringify(summary.value),
      rows.length,
      listKey,
    ].join('\u0002')
  })

  // 监听数据变化：指纹变化（即图表输入真的变了）→ 合并渲染
  watch(analyticsSignature, () => {
    nextTick(scheduleRender)
  })

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
    bindSourceChart,
    bindLevelChart,
    bindRankChart,
    bindTimeChart,
    bindReadChart,
    kpiCells,
    summary,
  }
}

/**
 * @file useNotificationsView.ts
 * @module frontend/src/composables
 */

export function useNotificationsView() {
  const state = inject(NOTIFICATION_CENTER_KEY, null) ?? useNotificationCenter()

  const {
    authStore,
    sourceFilters,
    levelFilters,
    dndSettings,
    notifyPrefs,
    remoteLoading,
    remoteError,
    activeSource,
    activeLevel,
    displayNotifications,
    prefFilteredNotifications,
    unreadCount,
    lanPushReady,
    markAllRead,
    clearAll,
    fetchRemote,
  } = state

  const hours = ref<number>(24)
  const stats = ref<NotificationStatsPayload | null>(null)
  const statsLoading = ref(false)
  const statsError = ref('')

  const hourOptions = NOTIFICATION_HOUR_OPTIONS

  async function fetchStats() {
    if (!authStore.isAuthenticated) return
    statsLoading.value = true
    statsError.value = ''
    try {
      const params: Record<string, string | number> = { hours: hours.value }
      if (activeSource.value !== 'all') params.source = activeSource.value
      const res = await fetchNotificationStats(params)
      stats.value = res.data as NotificationStatsPayload
    } catch (e: unknown) {
      stats.value = null
      statsError.value = getApiErrorMessage(e, '统计数据加载失败')
      logger.warn('通知统计加载失败', e)
    } finally {
      statsLoading.value = false
    }
  }

  async function reload() {
    await Promise.all([fetchRemote(), fetchStats()])
  }

  watch([hours, activeSource], () => {
    fetchStats()
  })

  onMounted(() => {
    fetchStats()
  })

  const analyticsSummary = computed(() =>
    computeNotificationAnalyticsSummary(prefFilteredNotifications.value, stats.value, hours.value),
  )

  const pageHint = computed(() => {
    const parts = [`分析近 ${formatNotificationHourOption(hours.value)} 内持久化通知（SQLite）与实时消息`]
    const dnd = dndSettings.value as
      | { dndActive?: boolean; dndStart?: number | string; dndEnd?: number | string }
      | null
      | undefined
    if (dnd?.dndActive) {
      parts.push(`当前免打扰 ${dnd.dndStart}:00–${dnd.dndEnd}:00`)
    }
    if (!notifyPrefs.value.globalNotifyEnabled) {
      parts.push('全局通知已关闭，列表可能为空')
    }
    return parts.join(' · ')
  })

  const summaryMetrics = computed(() => {
    const s = analyticsSummary.value
    const cells = [
      { key: 'unread', value: s.unread, label: '未读', tone: s.unread > 0 ? 'pink' : 'muted' },
      { key: 'total', value: formatNotificationCount(s.total), label: '统计总量', tone: 'sky' },
      {
        key: 'read-rate',
        value: formatPercent(s.readRate),
        label: '已读率',
        tone: s.readRate >= 80 ? 'green' : 'amber',
      },
      {
        key: 'danger',
        value: s.dangerCount,
        label: '紧急',
        tone: s.dangerCount > 0 ? 'red' : 'muted',
      },
      { key: 'delivery', value: formatPercent(s.deliveryRate), label: '推送送达', tone: 'amber' },
    ]
    if (lanPushReady.value) {
      cells.push({ key: 'lan', value: '已连接', label: '局域网推送', tone: 'green' })
    }
    return cells
  })

  const resultSummary = computed(() => {
    const total = displayNotifications.value.length
    const unread = unreadCount.value
    const parts = [`近 ${formatNotificationHourOption(hours.value)}`]
    if (activeSource.value !== 'all') {
      const row = sourceFilters.value.find((f) => f.key === activeSource.value)
      parts.push(row?.label || notificationSourceLabel(activeSource.value))
    }
    if (activeLevel.value !== 'all') {
      parts.push(levelFilterLabel(activeLevel.value))
    }
    if (!total) return `${parts.join(' · ')} · 暂无消息`
    return `${parts.join(' · ')} · ${formatNotificationCount(total)} 条${unread ? ` · ${unread} 未读` : ''}`
  })

  function filterBySource(key: string) {
    activeSource.value = key
  }

  function filterByLevel(level: string) {
    activeLevel.value = level
  }

  async function markAllReadAndRefresh() {
    await markAllRead()
    await fetchStats()
  }

  async function clearAllAndRefresh() {
    await clearAll()
    await fetchStats()
  }

  return {
    authStore,
    hours,
    hourOptions,
    stats,
    statsLoading,
    statsError,
    sourceFilters,
    levelFilters,
    dndSettings,
    remoteLoading,
    remoteError,
    activeSource,
    activeLevel,
    displayNotifications,
    prefFilteredNotifications,
    unreadCount,
    analyticsSummary,
    pageHint,
    summaryMetrics,
    resultSummary,
    markAllRead: markAllReadAndRefresh,
    clearAll: clearAllAndRefresh,
    fetchRemote,
    fetchStats,
    reload,
    filterBySource,
    filterByLevel,
    formatCount: formatNotificationCount,
    formatNotificationHourOption,
  }
}

/** - 申请浏览器通知权限并使用 VAPID 公钥创建推送订阅； */

/**
 * 把 VAPID 公钥的 base64url 字符串转为 Uint8Array，供 PushManager.subscribe 使用。
 *
 * @param base64String base64url 编码的公钥（可能省略 padding）
 * @returns 长度为 65 的 Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // 补齐 base64 padding，并把 base64url 转换为 base64
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** 根据测试推送返回的 delivered/sent 数提示成功或未送达。 */
function notifyWebPushDelivery(
  chrome: ReturnType<typeof useChromeStore>,
  data: { sent?: number; delivered?: number } | null | undefined,
): void {
  const delivered = Number(data?.delivered ?? data?.sent ?? 0)
  if (delivered > 0) {
    chrome.notify('测试推送已发送', 'success')
    return
  }
  chrome.notify('测试推送未送达（通道未启用、未配置或无可用订阅）', 'warning')
}

async function ensureSw(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  return navigator.serviceWorker.ready
}

async function createAndReportSubscription(
  chrome: ReturnType<typeof useChromeStore>,
  label?: string,
): Promise<boolean> {
  const reg = await ensureSw()
  if (!reg) {
    chrome.notify('当前浏览器不支持 Web Push', 'warning')
    return false
  }
  const { data } = await fetchWebPushVapidPublicKey()
  if (!data?.publicKey) {
    chrome.notify('WebPush 未配置 VAPID 公钥', 'warning')
    return false
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    chrome.notify('未授予通知权限', 'warning')
    return false
  }
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey) as BufferSource,
  })
  const json = sub.toJSON()
  // 校验订阅信息完整：endpoint 与 p256dh/auth keys 必须齐备
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('订阅信息不完整')
  }
  await subscribeWebPush({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    label: label || '本机浏览器',
  })
  chrome.notify('已订阅 WebPush 通知', 'success')
  return true
}

/**
 * WebPush 订阅 composable。
 *
 * @returns busy 订阅/测试中标志；subscribed 是否已订阅；subscribe 订阅方法；sendTest 测试推送方法
 */
export function useWebPushSubscribe() {
  const chrome = useChromeStore()
  const busy = ref(false)
  const subscribed = ref(false)

  /**
   * 申请权限并创建 WebPush 订阅，上报后端。
   *
   * @param label 订阅标签（默认"本机浏览器"）
   * @returns 是否订阅成功
   */
  async function subscribe(label?: string): Promise<boolean> {
    busy.value = true
    try {
      const ok = await createAndReportSubscription(chrome, label)
      if (ok) subscribed.value = true
      return ok
    } catch (e: unknown) {
      notifyError(e, '订阅 WebPush')
      return false
    } finally {
      busy.value = false
    }
  }

  /**
   * 发送一次测试推送，验证订阅链路可用。
   */
  async function sendTest(): Promise<void> {
    busy.value = true
    try {
      const { data } = await testWebPush<{ sent?: number; delivered?: number }>()
      notifyWebPushDelivery(chrome, data)
    } catch (e: unknown) {
      notifyError(e, '测试推送')
    } finally {
      busy.value = false
    }
  }

  return { busy, subscribed, subscribe, sendTest }
}
