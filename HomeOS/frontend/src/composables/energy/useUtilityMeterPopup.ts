/**
 * @file useUtilityMeterPopup.ts
 * @module frontend/src/composables
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { ECharts } from 'echarts'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { parseDateParts } from '@/composables/energy/useUtilityMeter'
import {
  resolveAccountEntityIds,
  normalizeEnergySource,
} from '@/utils/energy/source.util'
import { readPopupField } from '@/utils/energy/popup-read.util'
import {
  readPopupAttr,
  parseJsonAttr,
  parseNumAttr,
} from '@/composables/energy/utility-entity-helpers'
import type { UtilityMeterParsedItem } from '@/composables/energy/utility-meter-parse-helpers'
import { resolveAccountLabelForEntityId } from '@/utils/energy/account.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import type { EnergyCategory } from '@/constants/energy-fields'

type ChartEl = HTMLElement & { _chart?: ECharts | null }

interface UtilityMeterPopupProps {
  entityId?: string
  anchor?: unknown
  [key: string]: unknown
}

interface UtilityMeterPopupOpts {
  props: UtilityMeterPopupProps
  sourceKey: EnergyCategory | string
  accentColor: { color1: string; color2: string }
  unitLabelKey: string
  calClassPrefix: string
  parseDayItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
  parseMonthItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
  parseYearItem: (x: Record<string, unknown>) => UtilityMeterParsedItem
}

function markMinMax(arr: UtilityMeterParsedItem[]) {
  const usages = arr.map((x) => x._usage).filter((x) => x > 0)
  if (!usages.length) return arr
  const maxU = Math.max(...usages)
  const minU = Math.min(...usages)
  return arr.map((x) => {
    if (x._usage > 0 && x._usage === maxU) x._isMax = true
    if (x._usage > 0 && x._usage === minU) x._isMin = true
    return x
  })
}
/**
 * 水 / 气 / 电用量弹窗共用的图表、日历与统计逻辑。
 * @param opts.props 弹窗 props（entityId、anchor 等）
 * @param opts.sourceKey 能源类别：water | gas | grid
 * @param opts.accentColor 强调色
 * @param opts.unitLabelKey 用量单位键：ton | cubicMeter | kwh
 * @param opts.calClassPrefix 日历单元格 CSS 前缀（w | gas | ele）
 * @param opts.parseDayItem 日数据解析
 * @param opts.parseMonthItem 月数据解析
 * @param opts.parseYearItem 年数据解析
 */
export function useUtilityMeterPopup(opts: UtilityMeterPopupOpts) {
  const {
    props,
    sourceKey,
    accentColor,
    unitLabelKey,
    calClassPrefix,
    parseDayItem,
    parseMonthItem,
    parseYearItem,
  } = opts
  const es = useEntitiesStore()
  const layout = useLayoutStore()
  const { color1, color2 } = accentColor
  const activeEntityId = ref(props.entityId)
  watch(
    () => props.entityId,
    (v) => {
      activeEntityId.value = v || activeEntityId.value
    },
  )
  const accountOptions = computed(() => {
    const ids = resolveAccountEntityIds(sourceKey, layout.layoutConfig.statsSensors)
    if (props.entityId && !ids.includes(props.entityId)) ids.unshift(props.entityId)
    return [...new Set(ids)]
  })
  watch(
    accountOptions,
    (list) => {
      if (!activeEntityId.value && list.length) activeEntityId.value = list[0]
    },
    { immediate: true },
  )

  const sourceCfg = computed(() =>
    normalizeEnergySource(layout.layoutConfig.statsSensors, sourceKey),
  )

  function accountLabel(eid: string) {
    const fromConfig = resolveAccountLabelForEntityId(sourceKey, eid, sourceCfg.value)
    if (fromConfig) return fromConfig
    return getEntityDisplayName(eid, es.entities[eid])
  }

  function popField(key: string) {
    return readPopupField(
      sourceKey,
      key,
      layout.layoutConfig.statsSensors,
      es.entities,
      activeEntityId.value,
      sourceCfg.value,
    )
  }
  function popNum(key: string) {
    const raw = popField(key)
    if (raw == null || raw === '') return null
    return parseNumAttr(raw)
  }
  const ent = computed(() => es.entities[activeEntityId.value || ''] || null)
  const sourceMode = computed(() => sourceCfg.value.mode)
  const hasChartData = computed(() => {
    if (sourceMode.value === 'multi') {
      return !!(popField('daylist') || popField('monthlist') || popField('yearlist'))
    }
    return true
  })
  const rawDaylist = computed(
    () => parseJsonAttr(popField('daylist')) ?? parseJsonAttr(readPopupAttr(ent.value, 'daylist')),
  )
  const rawMonthlist = computed(
    () =>
      parseJsonAttr(popField('monthlist')) ?? parseJsonAttr(readPopupAttr(ent.value, 'monthlist')),
  )
  const rawYearlist = computed(
    () =>
      parseJsonAttr(popField('yearlist')) ?? parseJsonAttr(readPopupAttr(ent.value, 'yearlist')),
  )
  const daylist = computed(() => {
    const d = rawDaylist.value
    if (!Array.isArray(d) || !d.length) return [] as UtilityMeterParsedItem[]
    return markMinMax(
      d.slice(0, 31).map((item) => parseDayItem(item as Record<string, unknown>)),
    )
  })
  const monthlist = computed(() => {
    const d = rawMonthlist.value
    if (!Array.isArray(d) || !d.length) return [] as UtilityMeterParsedItem[]
    return d.slice(0, 24).map((item) => parseMonthItem(item as Record<string, unknown>))
  })
  const yearlist = computed(() => {
    const d = rawYearlist.value
    const thisYear = new Date().getFullYear()
    const yUsage = popNum('yearNum')
    const yCost = popNum('yearCost')
    const list =
      Array.isArray(d) && d.length
        ? d.slice(0, 10).map((item) => parseYearItem(item as Record<string, unknown>))
        : ([] as UtilityMeterParsedItem[])

    // HA yearlist 常不含当月；顶部「年用电」卡片的 yearNum/yearCost 含当月，用于校正当年柱状/折线
    if (yUsage == null && yCost == null) return list

    let found = false
    const patched = list.map((item) => {
      const yMatch = String(item._label || '').match(/(\d{4})/)
      if (!yMatch || parseInt(yMatch[1], 10) !== thisYear) return item
      found = true
      const usage = yUsage != null ? yUsage : item._usage
      const cost = yCost != null ? yCost : item._cost
      return {
        ...item,
        _usage: usage,
        _cost: cost,
        _usageStr: usage > 0 ? usage.toFixed(1) : '--',
        _costStr: cost > 0 ? cost.toFixed(2) : '--',
      }
    })
    if (!found) {
      const usage = yUsage ?? 0
      const cost = yCost ?? 0
      patched.unshift({
        _label: String(thisYear),
        _usage: usage,
        _cost: cost,
        _usageStr: usage > 0 ? usage.toFixed(1) : '--',
        _costStr: cost > 0 ? cost.toFixed(2) : '--',
        _time: String(thisYear),
      })
    }
    return patched
  })
  const exp = ref(false)
  const expTab = ref('day')
  const curList = computed(() => {
    const src =
      expTab.value === 'day'
        ? daylist.value
        : expTab.value === 'month'
          ? monthlist.value
          : yearlist.value
    return src.map((d) => ({ ...d, _usage: d._usageStr, _cost: d._costStr }))
  })
  const sumUsage = computed(() => {
    const src =
      expTab.value === 'day'
        ? daylist.value
        : expTab.value === 'month'
          ? monthlist.value
          : yearlist.value
    return src.reduce((s, x) => s + x._usage, 0).toFixed(1)
  })
  const sumCost = computed(() => {
    const src =
      expTab.value === 'day'
        ? daylist.value
        : expTab.value === 'month'
          ? monthlist.value
          : yearlist.value
    return src.reduce((s, x) => s + x._cost, 0).toFixed(2)
  })
  const summaryLabel = computed(() => {
    if (expTab.value === 'day') return `近${daylist.value.length}天合计:`
    if (expTab.value === 'month') return `近${monthlist.value.length}月合计:`
    return `${yearlist.value.length}年合计:`
  })
  const mTrendStr = ref<string>('')
  const mTrendDir = ref<string>('')
  const lmTrendStr = ref<string>('')
  const lmTrendDir = ref<string>('')
  const dayChartRef = ref<ChartEl | null>(null)
  const monthChartRef = ref<ChartEl | null>(null)
  const yearChartRef = ref<ChartEl | null>(null)
  const calYear = ref(new Date().getFullYear())
  const calMonth = ref(new Date().getMonth() + 1)
  const curYearNum = new Date().getFullYear()
  const curMonthNum = new Date().getMonth() + 1
  const calDayNames = computed(() => ['一', '二', '三', '四', '五', '六', '日'])
  const UNIT_LABELS: Record<string, string> = {
    kwh: 'kWh',
    ton: '吨',
    cubicMeter: 'm³',
  }
  const unitLabel = computed(() => UNIT_LABELS[unitLabelKey] || unitLabelKey)
  const calCells = computed(() => {
    const y = calYear.value
    const m = calMonth.value
    const first = new Date(y, m - 1, 1)
    const last = new Date(y, m, 0)
    const startDow = first.getDay() === 0 ? 6 : first.getDay() - 1
    const cells: Array<{
      day: number | ''
      cls: string
      _usage?: string
      _cost?: string
      _data?: UtilityMeterParsedItem
    }> = []
    const dateMap: Record<
      string,
      { _usage: string; _cost: string; _data: UtilityMeterParsedItem }
    > = {}
    daylist.value.forEach((d) => {
      const parts = parseDateParts(d._label || '')
      if (
        parts &&
        parts.month === m &&
        (parts.year === undefined || parts.year === calYear.value)
      ) {
        dateMap[parts.day] = { _usage: d._usageStr, _cost: d._costStr, _data: d }
      }
    })
    for (let i = 0; i < startDow; i++)
      cells.push({ day: '', cls: `${calClassPrefix}-cal-cell--empty` })
    const today = new Date()
    for (let d = 1; d <= last.getDate(); d++) {
      const data = dateMap[d]
      let cls = ''
      const thisDate = new Date(y, m - 1, d)
      if (today.toDateString() === thisDate.toDateString())
        cls += ` ${calClassPrefix}-cal-cell--today`
      if (data) cls += ` ${calClassPrefix}-cal-cell--has`
      if (thisDate > today) cls += ` ${calClassPrefix}-cal-cell--future`
      cells.push({ day: d, cls, _usage: data?._usage, _cost: data?._cost, _data: data?._data })
    }
    return cells
  })
  const calMonthUsage = computed(() => {
    let s = 0
    calCells.value.forEach((c) => {
      if (c._data) s += c._data._usage || 0
    })
    return s.toFixed(1)
  })
  const calMonthCost = computed(() => {
    let s = 0
    calCells.value.forEach((c) => {
      if (c._data) s += c._data._cost || 0
    })
    return s.toFixed(2)
  })
  function updateCalendar() {
    if (calMonth.value < 1) {
      calMonth.value = 12
      calYear.value--
    }
    if (calMonth.value > 12) {
      calMonth.value = 1
      calYear.value++
    }
  }
  async function renderChart(
    el: ChartEl | null,
    data: UtilityMeterParsedItem[],
    unit: string,
    type: string,
  ) {
    if (typeof document !== 'undefined' && document.hidden) return
    if (!el || !data.length) return
    if (el.clientWidth === 0 || el.clientHeight === 0) return
    const echarts = (await import('@/utils/chart/echarts')).default
    // 动态 import 期间容器可能已被重复渲染/关闭：init 前再清理一次，避免僵尸实例
    if (el._chart) el._chart.dispose()
    const chart = echarts.init(el)
    el._chart = chart
    const labels = data.map((d) => d._label || '')
    const usages = data.map((d) => d._usage || 0)
    const costs = data.map((d) => d._cost || 0)
    const rotate =
      (type === 'day' && labels.length > 15) || (type === 'month' && labels.length > 12) ? 45 : 0
    chart.setOption({
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
    })
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
  function onPageVisibilityChange() {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      disposeCharts()
    } else if (exp.value) {
      renderCharts()
    }
  }
  function setDayChartRef(el: ChartEl | null) {
    if (dayChartRef.value && dayChartRef.value !== el) unobserveChartEl(dayChartRef.value)
    dayChartRef.value = el
    if (el) observeChartEl(el)
  }
  function setMonthChartRef(el: ChartEl | null) {
    if (monthChartRef.value && monthChartRef.value !== el) unobserveChartEl(monthChartRef.value)
    monthChartRef.value = el
    if (el) observeChartEl(el)
  }
  function setYearChartRef(el: ChartEl | null) {
    if (yearChartRef.value && yearChartRef.value !== el) unobserveChartEl(yearChartRef.value)
    yearChartRef.value = el
    if (el) observeChartEl(el)
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
      if (refEl.value) unobserveChartEl(refEl.value)
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
    () => props.entityId,
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
    disconnectChartObserver()
    disposeCharts()
  })
  return {
    activeEntityId,
    accountOptions,
    accountLabel,
    popField,
    popNum,
    ent,
    hasChartData,
    daylist,
    monthlist,
    yearlist,
    exp,
    expTab,
    curList,
    sumUsage,
    sumCost,
    summaryLabel,
    mTrendStr,
    mTrendDir,
    lmTrendStr,
    lmTrendDir,
    setDayChartRef,
    setMonthChartRef,
    setYearChartRef,
    calYear,
    calMonth,
    curYearNum,
    curMonthNum,
    calDayNames,
    calCells,
    calMonthUsage,
    calMonthCost,
    updateCalendar,
    openTab,
    switchTab,
    closeExpand,
    openDayTab,
    onCalPrev() {
      calMonth.value--
      updateCalendar()
    },
    onCalNext() {
      calMonth.value++
      updateCalendar()
    },
    onCalToday() {
      calYear.value = curYearNum
      calMonth.value = curMonthNum
      updateCalendar()
    },
    readPopupAttr,
    parseJsonAttr,
    parseNumAttr,
    sourceCfg,
  }
}
