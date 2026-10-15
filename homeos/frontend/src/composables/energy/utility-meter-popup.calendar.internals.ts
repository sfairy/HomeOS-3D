/**
 * @file utility-meter-popup.calendar.internals.ts
 * @module frontend/src/composables/energy
 */
import { ref, computed, type ComputedRef } from 'vue'
import { parseDateParts } from '@/shared/energy'
import type { UtilityMeterParsedItem } from '@/shared/energy'

export function createUtilityMeterCalendar(opts: {
  daylist: ComputedRef<UtilityMeterParsedItem[]>
  calClassPrefix: string
  unitLabelKey: string
}) {
  const { daylist, calClassPrefix, unitLabelKey } = opts
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

  return {
    calYear,
    calMonth,
    curYearNum,
    curMonthNum,
    calDayNames,
    unitLabel,
    calCells,
    calMonthUsage,
    calMonthCost,
    updateCalendar,
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
  }
}
