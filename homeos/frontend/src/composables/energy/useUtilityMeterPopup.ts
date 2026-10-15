/**
 * @file useUtilityMeterPopup.ts
 * @module frontend/src/composables
 */
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { readPopupAttr, parseJsonAttr, parseNumAttr } from '@/shared/energy'
import type { UtilityMeterParsedItem } from '@/shared/energy'
import type { EnergyCategory } from '@/shared/energy/constants/energy-fields'
import {
  createUtilityMeterAccountState,
  createUtilityMeterLists,
} from './utility-meter-popup.lists.internals'
import { createUtilityMeterCalendar } from './utility-meter-popup.calendar.internals'
import { createUtilityMeterCharts } from './utility-meter-popup.charts.internals'

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

/**
 * 水 / 气 / 电用量弹窗共用的图表、日历与统计逻辑。
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

  const account = createUtilityMeterAccountState({ props, sourceKey, es, layout })
  const lists = createUtilityMeterLists({
    popField: account.popField,
    popNum: account.popNum,
    ent: account.ent,
    parseDayItem,
    parseMonthItem,
    parseYearItem,
  })
  const calendar = createUtilityMeterCalendar({
    daylist: lists.daylist,
    calClassPrefix,
    unitLabelKey,
  })
  const charts = createUtilityMeterCharts({
    color1,
    color2,
    unitLabel: calendar.unitLabel,
    daylist: lists.daylist,
    monthlist: lists.monthlist,
    yearlist: lists.yearlist,
    exp: lists.exp,
    expTab: lists.expTab,
    entityIdProp: () => props.entityId,
  })

  return {
    activeEntityId: account.activeEntityId,
    accountOptions: account.accountOptions,
    accountLabel: account.accountLabel,
    popField: account.popField,
    popNum: account.popNum,
    ent: account.ent,
    hasChartData: account.hasChartData,
    daylist: lists.daylist,
    monthlist: lists.monthlist,
    yearlist: lists.yearlist,
    exp: lists.exp,
    expTab: lists.expTab,
    curList: lists.curList,
    sumUsage: lists.sumUsage,
    sumCost: lists.sumCost,
    summaryLabel: lists.summaryLabel,
    mTrendStr: lists.mTrendStr,
    mTrendDir: lists.mTrendDir,
    lmTrendStr: lists.lmTrendStr,
    lmTrendDir: lists.lmTrendDir,
    setDayChartRef: charts.setDayChartRef,
    setMonthChartRef: charts.setMonthChartRef,
    setYearChartRef: charts.setYearChartRef,
    calYear: calendar.calYear,
    calMonth: calendar.calMonth,
    curYearNum: calendar.curYearNum,
    curMonthNum: calendar.curMonthNum,
    calDayNames: calendar.calDayNames,
    calCells: calendar.calCells,
    calMonthUsage: calendar.calMonthUsage,
    calMonthCost: calendar.calMonthCost,
    updateCalendar: calendar.updateCalendar,
    openTab: charts.openTab,
    switchTab: charts.switchTab,
    closeExpand: charts.closeExpand,
    openDayTab: charts.openDayTab,
    onCalPrev: calendar.onCalPrev,
    onCalNext: calendar.onCalNext,
    onCalToday: calendar.onCalToday,
    readPopupAttr,
    parseJsonAttr,
    parseNumAttr,
    sourceCfg: account.sourceCfg,
  }
}
