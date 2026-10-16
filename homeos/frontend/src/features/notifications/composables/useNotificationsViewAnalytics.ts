/** KPI 指标卡 + 点击下钻过滤。 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick, type ToRefs, unref } from 'vue'
import type { ECharts, ECElementEvent, EChartsCoreOption } from 'echarts'
import { observeChartResize } from '@/shared/utils/ui/chart-resize.util'
import {
  buildLevelBuckets,
  buildLevelBucketsFromStats,
  buildSourceBuckets,
  buildSourceBucketsFromStats,
  buildTimeBucketsFromNotifications,
  formatPercent,
  type NotificationAnalyticsSummary,
  type NotificationStatsPayload,
} from '@/shared/notifications/utils/analytics.util'
import {
  buildNotificationsLevelOption,
  buildNotificationsRankOption,
  buildNotificationsReadOption,
  buildNotificationsSourceOption,
  buildNotificationsTimeOption,
} from '@/features/notifications/composables/notifications-analytics-charts.internals'

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
    if (!charts[key]) charts[key] = (await import('@/shared/utils/chart/echarts')).getOrInitChart(el)
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
    sourceChartRef,
    levelChartRef,
    rankChartRef,
    timeChartRef,
    readChartRef,
    kpiCells,
    summary,
  }
}
