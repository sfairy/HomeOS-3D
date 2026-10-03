/**
 * 能源用量图表构建工具
 *
 * 所属模块：能源 / 用量图表
 * 职责：解析水 / 电 / 气的日 / 月用量列表，构建双轴柱线组合 ECharts 选项
 *   （柱=用量、线=费用），并处理空态占位与标签旋转。
 * 依赖：utility-meter-parse-helpers（解析器）、misc.util（宽松 JSON 解析）。
 */
import type { UtilityMeterParsedItem } from '@/composables/energy/utility-meter-parse-helpers'
import {
  parseGasDayItem,
  parseGasMonthItem,
  parseGridDayItem,
  parseGridMonthItem,
  parseWaterDayItem,
  parseWaterMonthItem,
} from '@/composables/energy/utility-meter-parse-helpers'
import { parseJsonLoose } from '@/utils/core/misc.util'
import { chartVerticalGradient } from '@/utils/chart/device-chart-theme'
import { axisLabelStyle, chartEmptyGraphic, createChartTooltip } from '@/utils/chart/chart-primitives'

/** 用量分类：grid=电、gas=气、water=水 */
type UsageCat = 'grid' | 'gas' | 'water'
/** 用量时间范围：day=日、month=月 */
type UsageRange = 'day' | 'month'

/** 分类 → 物理单位映射 */
const UNIT_BY_CAT: Record<UsageCat, string> = {
  grid: 'kWh',
  gas: 'm³',
  water: 'm³',
}

/** 分类 → 日维度解析器映射 */
const DAY_PARSER: Record<UsageCat, (x: Record<string, unknown>) => UtilityMeterParsedItem> = {
  grid: parseGridDayItem,
  gas: parseGasDayItem,
  water: (x) => parseWaterDayItem(x),
}

/** 分类 → 月维度解析器映射 */
const MONTH_PARSER: Record<UsageCat, (x: Record<string, unknown>) => UtilityMeterParsedItem> = {
  grid: parseGridMonthItem,
  gas: parseGasMonthItem,
  water: parseWaterMonthItem,
}

/** 返回分类对应的物理单位 */
export function usageUnitForCategory(cat: UsageCat) {
  return UNIT_BY_CAT[cat]
}

/**
 * 解析能源用量列表为结构化条目数组。
 *
 * @param raw 原始数据（JSON 字符串或已解析对象）
 * @param cat 用量分类
 * @param range 时间范围
 * @returns 解析后的条目数组；day 最多 31 条、month 最多 24 条；输入非法时返回空数组
 */
export function parseEnergyUsageList(
  raw: unknown,
  cat: UsageCat,
  range: UsageRange,
): UtilityMeterParsedItem[] {
  const list = parseJsonLoose(raw, 'null')
  if (!Array.isArray(list) || !list.length) return []
  const parser = range === 'day' ? DAY_PARSER[cat] : MONTH_PARSER[cat]
  const limit = range === 'day' ? 31 : 24
  return list.slice(0, limit).map((item) => parser(item as Record<string, unknown>))
}

/**
 * 构建能源用量图表 ECharts 选项（双轴：柱=用量、线=费用）。
 *
 * @param data 已解析的用量条目数组
 * @param unit 用量单位（kWh / m³）
 * @param range 时间范围（影响柱宽与标签旋转阈值）
 * @param accent 柱体主色（默认琥珀色）
 * @returns ECharts option；data 为空时渲染「暂无明细曲线」占位文本
 */
export function buildEnergyUsageChartOption(
  data: UtilityMeterParsedItem[],
  unit: string,
  range: UsageRange,
  accent = '#fbbf24',
) {
  const labels = data.map((d) => d._label || '')
  const usages = data.map((d) => d._usage || 0)
  const costs = data.map((d) => d._cost || 0)
  const empty = !data.length
  // 标签数量过多时旋转 45 度避免重叠
  const rotate =
    (range === 'day' && labels.length > 15) || (range === 'month' && labels.length > 12) ? 45 : 0

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      ...createChartTooltip('rgba(20,20,30,0.95)', {
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#fff', fontSize: 11 },
      }),
      axisPointer: { type: 'shadow' },
    },
    grid: { left: 42, right: 42, top: 12, bottom: labels.length > 12 ? 40 : 28 },
    xAxis: {
      type: 'category',
      data: empty ? ['—'] : labels,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
      axisLabel: { ...axisLabelStyle, rotate },
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
        data: empty ? [] : usages,
        yAxisIndex: 0,
        itemStyle: {
          color: chartVerticalGradient(accent, 0.85, 0.15),
          borderRadius: [4, 4, 0, 0],
        },
        barMaxWidth: range === 'day' ? 10 : 14,
      },
      {
        name: '费用(元)',
        type: 'line',
        data: empty ? [] : costs,
        yAxisIndex: 1,
        itemStyle: { color: '#f59e0b' },
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 4,
      },
    ],
    graphic: empty ? chartEmptyGraphic('暂无明细曲线') : undefined,
  }
}