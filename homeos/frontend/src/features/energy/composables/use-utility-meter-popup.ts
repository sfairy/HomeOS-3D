/**
 * @file useUtilityMeterPopup.ts
 * @module frontend/src/composables
 */
import { computed } from 'vue'
import { useEntitiesStore } from '@/domain/entity/store/entities.store'
import { useLayoutStore } from '@/domain/layout/store/layout.store'
import { readPopupAttr, parseJsonAttr, parseNumAttr } from '@/domain/energy/model/index'
import type { UtilityMeterParsedItem } from '@/domain/energy/model/index'
import type { EnergyCategory } from '@/domain/energy/model/constants/energy-fields'
import { createUtilityMeterAccountState, createUtilityMeterLists } from './utility-meter-popup.lists.internals'
import { createUtilityMeterCalendar } from './utility-meter-popup.calendar.internals'
import { createUtilityMeterCharts } from './utility-meter-popup.charts.internals'
import { useServerEnergyHistory } from './use-server-energy-history'

/** 有服务端日/月聚合的账户类型（后端按实体推导单位，电 kWh / 燃气、水 m³）。 */
const SERVER_AGGREGATE_SOURCES = new Set(['grid', 'gas', 'water'])

/**
 * 能源卡类别 → 聚合表里该读哪个单位。
 *
 * 必须显式声明：`energy_usage_daily` / `energy_usage_monthly` 里电与气的行并存，
 * 不按单位过滤就等于把立方米直接加到度电上 —— 电力卡凭空气涨、燃气卡拿到混合和。
 * 用查表而不是三元，是因为这里的读取动作本身不该引入分支（复杂度门禁只许变简单）。
 */
const SERVER_UNITS: Record<string, string> = { grid: 'kWh', gas: 'm³', water: 'm³' }

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
  const { props, sourceKey, accentColor, unitLabelKey, calClassPrefix, parseDayItem, parseMonthItem, parseYearItem } =
    opts
  const es = useEntitiesStore()
  const layout = useLayoutStore()
  const { color1, color2 } = accentColor

  const account = createUtilityMeterAccountState({ props, sourceKey, es, layout })
  // 只有电费账户有服务端日/月聚合表；水/气继续走 HA 属性，避免把 kWh 表套到 m³ 上。
  // 电 / 燃气 / 水务都走服务端聚合：后端已按单位隔离（kWh vs m³），
  // 只给电开会让燃气与水永远只有「当前读数」、没有趋势。
  //
  // 单位必须**按卡片类别显式传**：聚合表里电与气的行并存，不声明就等于求混合和。
  const serverUnit = computed(() => SERVER_UNITS[sourceKey])
  const serverHistory = useServerEnergyHistory(
    computed(() => SERVER_AGGREGATE_SOURCES.has(sourceKey)),
    serverUnit,
  )
  const lists = createUtilityMeterLists({
    popField: account.popField,
    popNum: account.popNum,
    ent: account.ent,
    parseDayItem,
    parseMonthItem,
    parseYearItem,
    server: {
      day: serverHistory.dayItems,
      month: serverHistory.monthItems,
      // 多账户时服务端只有「全家合计」，按户号展示会串数，交给属性列表。
      wins: computed(() => account.accountOptions.value.length <= 1),
    },
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
