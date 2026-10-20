/**
 * @file useEarthquakeHistoryAnalytics.ts
 * @module frontend/src/composables
 */
import { ref, computed, watch, type ToRefs, unref } from 'vue'
import {
  useEchartsHost,
  axisLineStyle,
  splitLineStyle,
  yMax,
} from '@/composables/ui/useEchartsHost'
import {
  buildDepthBuckets,
  buildDistanceBuckets,
  buildMagBuckets,
  buildPeriodTimeBuckets,
  buildTopPlaces,
  computeAnalyticsSummary,
  shortenPlace,
} from '@/shared/earthquake/utils/history-analytics.util'
import { formatEarthquakeMagnitude } from '@/composables/earthquake/earthquake-layout.util'

/**
 * 地震预警历史分析 composable
 * - 接收地震事件列表（本地 EEW 记录或远端筛选结果），派生统计摘要与分桶数据；
 * - 渲染 4 个 ECharts 图表：震级分布、距离分布、时间分布、附加维度（深度/震中 Top）；
 * - 提供 KPI 单元格数据供模板渲染（事件总数、最大震级、强震数、近距事件等）；
 * - 自动响应容器尺寸变化与可见性变化，重渲染图表。
 */

/**
 * 地震历史分析 composable。
 *
 * @param props.items  地震事件原始列表（local 与远端 schema 不同，通过 accessors 适配）
 * @param props.tab    当前标签页：'local' = 本地 EEW 记录；其他值 = 远端筛选
 * @param props.period 时间范围（影响时间分桶的粒度）
 * @returns 图表 ref、KPI 单元格等供模板使用
 */
export function useEarthquakeHistoryAnalytics(
  props: ToRefs<{
    items: unknown[]
    tab: string
    period: string
  }>,
) {
  // —— 图表 DOM 引用 ——
  /** 震级分布图 DOM */
  const magChartRef = ref<HTMLElement | null>(null)
  /** 距离分布图 DOM */
  const distChartRef = ref<HTMLElement | null>(null)
  /** 时间分布图 DOM */
  const timeChartRef = ref<HTMLElement | null>(null)
  /** 附加维度图 DOM（local 为震中 Top，远端为深度分布） */
  const extraChartRef = ref<HTMLElement | null>(null)

  // 保持原语义：resize 观察与渲染共用调度 owner；渲染调度/重试/清理由 useEchartsHost 承担
  const { schedule, getChartBase } = useEchartsHost({
    charts: {
      mag: { el: () => magChartRef.value, build: buildMagOption },
      dist: { el: () => distChartRef.value, build: buildDistOption },
      time: { el: () => timeChartRef.value, build: buildTimeOption },
      extra: { el: () => extraChartRef.value, build: buildExtraOption },
    },
    sharedResizeOwner: true,
  })

  /**
   * 字段访问器：根据 tab（local/远端）从原始行中提取震级、距离、震中、时间、深度、烈度。
   * local 模式字段名与远端不同，需分别适配。
   */
  const accessors = computed(() => {
    if (unref(props.tab) === 'local') {
      return {
        getMagnitude: (row: unknown) => (row as { magnitude?: number | null }).magnitude,
        getDistanceKm: (row: unknown) => (row as { distance?: number | null }).distance,
        getPlace: (row: unknown) => (row as { epicenter?: string | null }).epicenter,
        getTimeMs: (row: unknown) => {
          const rowData = row as { savedAt?: number | null; originTime?: number | null }
          return rowData.savedAt || rowData.originTime
        },
        getDepth: () => null,
        getIntensity: (row: unknown) => {
          const intensityRow = row as { localIntensity?: number | null; maxIntensity?: number | null }
          return intensityRow.localIntensity ?? intensityRow.maxIntensity
        },
      }
    }
    return {
      getMagnitude: (row: unknown) => (row as { magnitude?: number | null }).magnitude,
      getDistanceKm: (row: unknown) => (row as { distanceKm?: number | null }).distanceKm,
      getPlace: (row: unknown) => (row as { place?: string | null }).place,
      getTimeMs: (row: unknown) => (row as { originTime?: number | null }).originTime,
      getDepth: (row: unknown) => (row as { depth?: number | null }).depth,
      getIntensity: (row: unknown) => (row as { intensity?: number | null }).intensity,
    }
  })

  const items = computed(() => unref(props.items))
  const tab = computed(() => unref(props.tab))
  const period = computed(() => unref(props.period))

  // —— 统计摘要与各维度分桶（均由 util 函数计算） ——
  const summary = computed(() => computeAnalyticsSummary(items.value, accessors.value))
  const magBuckets = computed(() => buildMagBuckets(items.value, accessors.value.getMagnitude))
  const distBuckets = computed(() =>
    buildDistanceBuckets(items.value, accessors.value.getDistanceKm),
  )
  const timeBuckets = computed(() =>
    buildPeriodTimeBuckets(items.value, accessors.value.getTimeMs, period.value),
  )
  const depthBuckets = computed(() => buildDepthBuckets(items.value, accessors.value.getDepth))
  const topPlaces = computed(() => buildTopPlaces(items.value, accessors.value.getPlace, 5))
  /**
   * KPI 单元格数据（供模板渲染顶部指标行）。
   *  - total：事件总数（local=EEW 记录数，远端=筛选范围）；
   *  - max：最大震级（>=5 标记 warn tone）；
   *  - m4：M4+ 强震数（M5+ 进一步标记 danger tone）；
   *  - near：200km 内事件数（>0 标记 danger）；
   *  - avg：平均震级与平均深度；
   *  - intensity：最大烈度（>=6 标记 warn）。
   */
  const kpiCells = computed(() => {
    const summaryValue = summary.value
    return [
      {
        key: 'total',
        label: '事件总数',
        value: String(summaryValue.total),
        hint: tab.value === 'local' ? 'EEW 记录' : '筛选范围',
      },
      {
        key: 'max',
        label: '最大震级',
        value: summaryValue.maxMagnitude != null ? `M${formatEarthquakeMagnitude(summaryValue.maxMagnitude)}` : '—',
        hint: summaryValue.strongestPlace ? shortenPlace(summaryValue.strongestPlace, 8) : '',
        tone: summaryValue.maxMagnitude != null && summaryValue.maxMagnitude >= 5 ? 'warn' : 'accent',
      },
      {
        key: 'm4',
        label: '强震 M4+',
        value: String(summaryValue.m4Plus),
        hint: summaryValue.m5Plus ? `M5+ ${summaryValue.m5Plus} 次` : '无 M5+',
        tone: summaryValue.m5Plus ? 'danger' : 'muted',
      },
      {
        key: 'near',
        label: '200km 内',
        value: String(summaryValue.within200Km),
        hint: summaryValue.nearestKm != null ? `最近 ${summaryValue.nearestKm} km` : '无坐标',
        tone: summaryValue.within200Km > 0 ? 'danger' : 'muted',
      },
      {
        key: 'avg',
        label: '平均震级',
        value: summaryValue.avgMagnitude != null ? `M${summaryValue.avgMagnitude.toFixed(1)}` : '—',
        hint: summaryValue.avgDepth != null ? `均深 ${summaryValue.avgDepth} km` : '',
      },
      {
        key: 'intensity',
        label: tab.value === 'local' ? '最高烈度' : '最大烈度',
        value: summaryValue.maxIntensity != null ? `${summaryValue.maxIntensity} 度` : '—',
        hint: summaryValue.farthestKm != null ? `最远 ${summaryValue.farthestKm} km` : '',
        tone: summaryValue.maxIntensity != null && summaryValue.maxIntensity >= 6 ? 'warn' : 'muted',
      },
    ]
  })

  /** 震级分桶配色（按桶序，从灰到红渐变） */
  const MAG_COLORS = ['#94a3b8', '#7dd3fc', '#fbbf24', '#fb923c', '#f87171']

  /** 图表 tooltip 共用样式（深色背景 + 暖色文字） */
  const chartTooltip = {
    backgroundColor: 'rgba(12, 12, 18, 0.94)',
    borderColor: 'rgba(251, 191, 36, 0.32)',
    borderWidth: 1,
    padding: [8, 12],
    extraCssText:
      'border-radius: 10px; backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0,0,0,0.35);',
    textStyle: { color: '#fde68a', fontSize: 12, fontWeight: 600 },
  }

  /**
   * 生成纵向线性渐变（从顶部 color 到底部 color+66 半透明）。
   * @param color 顶部颜色（HEX）
   * @returns ECharts linear gradient 配置
   */
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

  /**
   * 构造震级分布柱状图 option。
   * 每个震级分桶一个柱子，颜色按 MAG_COLORS 映射，柱顶显示数值。
   * @returns ECharts option
   */
  function buildMagOption() {
    const buckets = magBuckets.value
    return {
      ...getChartBase(),
      grid: { left: 36, right: 12, top: 16, bottom: 24 },
      xAxis: {
        type: 'category',
        data: buckets.map((bucket) => bucket.label),
        axisLine: axisLineStyle,
        axisTick: { show: false },
        axisLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yMax(buckets.map((bucket) => bucket.count)),
        minInterval: 1,
        axisLine: { show: false },
        splitLine: splitLineStyle,
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
      },
      series: [
        {
          type: 'bar',
          data: buckets.map((bucket, i) => ({
            value: bucket.count,
            itemStyle: {
              color: barGradient(MAG_COLORS[i] || '#fbbf24'),
              borderRadius: [6, 6, 0, 0],
              shadowBlur: 8,
              shadowColor: `${MAG_COLORS[i] || '#fbbf24'}44`,
            },
          })),
          barWidth: '52%',
          label: {
            show: true,
            position: 'top',
            color: 'rgba(255,255,255,0.65)',
            fontSize: 10,
            formatter: ({ value }: { value?: number }) => String(value ?? 0),
          },
        },
      ],
      tooltip: { ...chartTooltip, trigger: 'axis' },
    }
  }

  /**
   * 构造距离分布环形图 option。
   * 过滤掉 count=0 的桶；若全为 0 则显示"无距离数据"占位扇区。
   * @returns ECharts option
   */
  function buildDistOption() {
    const buckets = distBuckets.value.filter((bucket) => bucket.count > 0)
    const data = buckets.length
      ? buckets.map((bucket) => ({ name: bucket.label, value: bucket.count, itemStyle: { color: bucket.color } }))
      : [{ name: '无距离数据', value: 1, itemStyle: { color: '#64748b' } }]
    return {
      ...getChartBase(),
      tooltip: { ...chartTooltip, trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '54%'],
          label: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: 600 },
          itemStyle: {
            borderRadius: 4,
            borderColor: 'rgba(0,0,0,0.35)',
            borderWidth: 1,
          },
          data,
        },
      ],
    }
  }

  /**
   * 构造时间分布柱状图 option。
   * 标签数 > 6 时旋转 32 度避免重叠。
   * @returns ECharts option
   */
  function buildTimeOption() {
    const buckets = timeBuckets.value
    const counts = buckets.map((bucket) => bucket.count)
    return {
      ...getChartBase(),
      grid: { left: 36, right: 12, top: 16, bottom: buckets.length > 6 ? 36 : 24 },
      xAxis: {
        type: 'category',
        data: buckets.map((bucket) => bucket.label),
        axisLine: axisLineStyle,
        axisTick: { show: false },
        axisLabel: {
          color: 'rgba(255,255,255,0.58)',
          fontSize: 9,
          interval: 0,
          rotate: buckets.length > 6 ? 32 : 0,
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
          type: 'bar',
          data: counts,
          barWidth: '55%',
          itemStyle: {
            color: barGradient('#fbbf24'),
            borderRadius: [6, 6, 0, 0],
            shadowBlur: 8,
            shadowColor: 'rgba(251, 191, 36, 0.25)',
          },
        },
      ],
      tooltip: { ...chartTooltip, trigger: 'axis' },
    }
  }
  /**
   * 构造附加维度图 option。
   *  - local 模式：震中 Top 5 横向柱状图（按事件数排序）；
   *  - 远端模式：震源深度分布纵向柱状图。
   * @returns ECharts option
   */
  function buildExtraOption() {
    if (tab.value === 'local') {
      const places = topPlaces.value
      const labels = places.length ? places.map((place) => place.label) : ['暂无']
      const values = places.length ? places.map((place) => place.count) : [0]
      return {
        ...getChartBase(),
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
            data: values,
            barWidth: 10,
            itemStyle: {
              color: barGradient('#7dd3fc'),
              borderRadius: [0, 6, 6, 0],
              shadowBlur: 6,
              shadowColor: 'rgba(125, 211, 252, 0.2)',
            },
          },
        ],
        tooltip: { ...chartTooltip, trigger: 'axis' },
      }
    }

    const buckets = depthBuckets.value
    const counts = buckets.map((bucket) => bucket.count)
    return {
      ...getChartBase(),
      grid: { left: 36, right: 12, top: 16, bottom: 24 },
      xAxis: {
        type: 'category',
        data: buckets.map((bucket) => bucket.label),
        axisLine: { show: false },
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yMax(counts),
        minInterval: 1,
        splitLine: splitLineStyle,
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
      },
      series: [
        {
          type: 'bar',
          data: counts,
          barWidth: '52%',
          itemStyle: {
            color: barGradient('#7dd3fc'),
            borderRadius: [6, 6, 0, 0],
            shadowBlur: 6,
            shadowColor: 'rgba(125, 211, 252, 0.2)',
          },
        },
      ],
      tooltip: { ...chartTooltip, trigger: 'axis' },
    }
  }

  // 数据/周期/标签变化时重新调度渲染（深度监听以感知 items 内部变化）
  watch(
    [() => unref(props.items), () => unref(props.period), () => unref(props.tab)],
    () => {
      schedule()
    },
    { deep: true },
  )

  return {
    magChartRef,
    distChartRef,
    timeChartRef,
    extraChartRef,
    kpiCells,
  }
}