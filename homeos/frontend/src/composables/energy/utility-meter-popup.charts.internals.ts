/**
 * @file utility-meter-popup.charts.internals.ts
 * @module frontend/src/composables/energy
 */
import { ref, watch, onMounted, onUnmounted, nextTick, type Ref, type ComputedRef } from 'vue'
import type { ECharts } from 'echarts'
import type { UtilityMeterParsedItem } from '@/shared/energy'

type ChartEl = HTMLElement & { _chart?: ECharts | null }

export function createUtilityMeterCharts(opts: {
  color1: string
  color2: string
  unitLabel: ComputedRef<string>
  daylist: ComputedRef<UtilityMeterParsedItem[]>
  monthlist: ComputedRef<UtilityMeterParsedItem[]>
  yearlist: ComputedRef<UtilityMeterParsedItem[]>
  exp: Ref<boolean>
  expTab: Ref<string>
  entityIdProp: () => unknown
}) {
  const { color1, color2, unitLabel, daylist, monthlist, yearlist, exp, expTab, entityIdProp } = opts
  const dayChartRef = ref<ChartEl | null>(null)
  const monthChartRef = ref<ChartEl | null>(null)
  const yearChartRef = ref<ChartEl | null>(null)

  async function renderChart(
    el: ChartEl | null,
    data: UtilityMeterParsedItem[],
    unit: string,
    type: string,
  ) {
    if (typeof document !== 'undefined' && document.hidden) return
    if (!el || !data.length) return
    if (el.clientWidth === 0 || el.clientHeight === 0) return
    const echarts = (await import('@/shared/utils/chart/echarts')).default
    if (el._chart) el._chart.dispose()
    const chart = echarts.init(el)
    el._chart = chart
    const labels = data.map((d) => d._label || '')
    const usages = data.map((d) => d._usage || 0)
    const costs = data.map((d) => d._cost || 0)
    const rotate =
      (type === 'day' && labels.length > 15) || (type === 'month' && labels.length > 12) ? 45 : 0
    chart.setOption(buildChartOption({ labels, usages, costs, unit, type, rotate, color1, color2 }))
  }

  function renderCharts() {
    if (typeof document !== 'undefined' && document.hidden) return
    if (!exp.value) return
    nextTick(() => {
      const unit = unitLabel.value
      if (expTab.value === 'day') void renderChart(dayChartRef.value, daylist.value, unit, 'day')
      else if (expTab.value === 'month')
        void renderChart(monthChartRef.value, monthlist.value, unit, 'month')
      else if (expTab.value === 'year') {
        void renderChart(yearChartRef.value, yearlist.value, unit, 'year')
      }
    })
  }

  function disposeCharts() {
    ;[dayChartRef, monthChartRef, yearChartRef].forEach((refEl) => {
      if (refEl.value?._chart) {
        refEl.value._chart.dispose()
        refEl.value._chart = null
      }
    })
  }

  const observer = createChartVisibilityObserver({
    dayChartRef,
    monthChartRef,
    yearChartRef,
    daylist,
    monthlist,
    yearlist,
    exp,
    unitLabel,
    renderChart,
  })

  function onPageVisibilityChange() {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      disposeCharts()
    } else if (exp.value) {
      renderCharts()
    }
  }

  function setDayChartRef(el: ChartEl | null) {
    if (dayChartRef.value && dayChartRef.value !== el) observer.unobserveChartEl(dayChartRef.value)
    dayChartRef.value = el
    if (el) observer.observeChartEl(el)
  }
  function setMonthChartRef(el: ChartEl | null) {
    if (monthChartRef.value && monthChartRef.value !== el)
      observer.unobserveChartEl(monthChartRef.value)
    monthChartRef.value = el
    if (el) observer.observeChartEl(el)
  }
  function setYearChartRef(el: ChartEl | null) {
    if (yearChartRef.value && yearChartRef.value !== el) observer.unobserveChartEl(yearChartRef.value)
    yearChartRef.value = el
    if (el) observer.observeChartEl(el)
  }

  function openTab(tab: string) {
    expTab.value = tab
    exp.value = true
    nextTick(() => renderCharts())
  }
  function switchTab(tab: string) {
    expTab.value = tab
    nextTick(() => renderCharts())
  }
  function closeExpand() {
    exp.value = false
    ;[dayChartRef, monthChartRef, yearChartRef].forEach((refEl) => {
      if (refEl.value) observer.unobserveChartEl(refEl.value)
    })
    disposeCharts()
  }
  function openDayTab(cell: { _data?: UtilityMeterParsedItem }) {
    if (cell._data) {
      expTab.value = 'day'
      nextTick(() => renderCharts())
    }
  }

  watch(
    () => entityIdProp(),
    () => {
      exp.value = false
      disposeCharts()
    },
  )
  onMounted(() => {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onPageVisibilityChange)
    }
  })
  onUnmounted(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onPageVisibilityChange)
    }
    observer.disconnectChartObserver()
    disposeCharts()
  })

  return {
    setDayChartRef,
    setMonthChartRef,
    setYearChartRef,
    openTab,
    switchTab,
    closeExpand,
    openDayTab,
  }
}

function buildChartOption(args: {
  labels: string[]
  usages: number[]
  costs: number[]
  unit: string
  type: string
  rotate: number
  color1: string
  color2: string
}) {
  const { labels, usages, costs, unit, type, rotate, color1, color2 } = args
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(20,20,30,0.95)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 11 },
      axisPointer: { type: 'shadow' },
    },
    grid: { left: 50, right: 50, top: 10, bottom: labels.length > 12 ? 40 : 30 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9, rotate },
    },
    yAxis: [
      {
        type: 'value',
        name: unit,
        nameTextStyle: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      },
      {
        type: 'value',
        name: '元',
        nameTextStyle: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: `用量(${unit})`,
        type: 'bar',
        data: usages,
        yAxisIndex: 0,
        itemStyle: { color: color1, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: type === 'day' ? 10 : type === 'month' ? 14 : 20,
      },
      {
        name: '费用(元)',
        type: 'line',
        data: costs,
        yAxisIndex: 1,
        itemStyle: { color: color2 },
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 4,
      },
    ],
  }
}

function createChartVisibilityObserver(opts: {
  dayChartRef: Ref<ChartEl | null>
  monthChartRef: Ref<ChartEl | null>
  yearChartRef: Ref<ChartEl | null>
  daylist: ComputedRef<UtilityMeterParsedItem[]>
  monthlist: ComputedRef<UtilityMeterParsedItem[]>
  yearlist: ComputedRef<UtilityMeterParsedItem[]>
  exp: Ref<boolean>
  unitLabel: ComputedRef<string>
  renderChart: (
    el: ChartEl | null,
    data: UtilityMeterParsedItem[],
    unit: string,
    type: string,
  ) => Promise<void>
}) {
  const {
    dayChartRef,
    monthChartRef,
    yearChartRef,
    daylist,
    monthlist,
    yearlist,
    exp,
    unitLabel,
    renderChart,
  } = opts
  let chartVisibilityObserver: IntersectionObserver | null = null
  const observedChartEls = new WeakSet<Element>()

  function ensureChartVisibilityObserver() {
    if (chartVisibilityObserver || typeof IntersectionObserver === 'undefined') return
    chartVisibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as ChartEl
          if (!entry.isIntersecting || entry.intersectionRatio <= 0.02) {
            if (el._chart) {
              el._chart.dispose()
              el._chart = null
            }
            continue
          }
          if (el._chart || !exp.value) continue
          const unit = unitLabel.value
          if (el === dayChartRef.value) void renderChart(el, daylist.value, unit, 'day')
          else if (el === monthChartRef.value) void renderChart(el, monthlist.value, unit, 'month')
          else if (el === yearChartRef.value) void renderChart(el, yearlist.value, unit, 'year')
        }
      },
      { threshold: [0, 0.02, 0.1] },
    )
  }

  function observeChartEl(el: ChartEl | null) {
    if (!el || observedChartEls.has(el)) return
    ensureChartVisibilityObserver()
    chartVisibilityObserver?.observe(el)
    observedChartEls.add(el)
  }
  function unobserveChartEl(el: ChartEl | null) {
    if (!el || !chartVisibilityObserver) return
    chartVisibilityObserver.unobserve(el)
    if (el._chart) {
      el._chart.dispose()
      el._chart = null
    }
  }
  function disconnectChartObserver() {
    chartVisibilityObserver?.disconnect()
    chartVisibilityObserver = null
  }
  return { observeChartEl, unobserveChartEl, disconnectChartObserver }
}
