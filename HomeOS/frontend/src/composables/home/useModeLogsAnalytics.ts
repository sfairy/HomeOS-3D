/**
 * 模式触发日志前端图表构建
 */
import {
  hubChartBase,
  hubChartGrid,
  hubChartTooltip,
  hubPieTooltip,
  HUB_CHART_COLORS,
  hubAccentColor,
} from '@/utils/chart/hub-chart-theme'
import { getKioskAnimationOptions } from '@/utils/chart/kiosk-animation'
import {
  HOME_MODE_LOG_SOURCE_LABELS,
  type HomeModeTriggerLogAnalytics,
} from '@homeos/shared'

/** 与后端 / shared aggregateHomeModeTriggerLogs 返回结构对齐 */
export type ModeLogAnalytics = HomeModeTriggerLogAnalytics

/** EMPTY_MODE_LOG_ANALYTICS：对象常量，字段 / 方法语义见定义处。 */
export const EMPTY_MODE_LOG_ANALYTICS: ModeLogAnalytics = {
  sourceBuckets: [],
  dayBuckets: [],
  ok: 0,
  fail: 0,
  total: 0,
}

/** buildModeSourcePieOption：函数，按签名入参返回处理结果。 */
export function buildModeSourcePieOption(
  buckets: Array<{ key: string; count: number }>,
) {
  const palette = [
    hubAccentColor('home-mode'),
    '#38bdf8',
    '#34d399',
    '#fb7185',
    '#a78bfa',
    '#94a3b8',
  ]
  const data = buckets.map((b, i) => ({
    name: (HOME_MODE_LOG_SOURCE_LABELS as Record<string, string>)[b.key] || b.key,
    value: b.count,
    itemStyle: { color: palette[i % palette.length] },
  }))
  return {
    ...hubChartBase(),
    ...getKioskAnimationOptions(),
    tooltip: hubPieTooltip(),
    series: [
      {
        type: 'pie',
        radius: ['40%', '66%'],
        center: ['50%', '54%'],
        padAngle: 2,
        label: { color: 'rgba(255,255,255,0.68)', fontSize: 10, fontWeight: 600 },
        itemStyle: { borderRadius: 5, borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
        data: data.length
          ? data
          : [{ name: '暂无', value: 1, itemStyle: { color: '#64748b' } }],
      },
    ],
  }
}

/** buildModeTimelineOption：函数，按签名入参返回处理结果。 */
export function buildModeTimelineOption(byDay: Array<{ date: string; count: number }>) {
  const accent = hubAccentColor('home-mode')
  return {
    ...hubChartBase(),
    ...getKioskAnimationOptions(),
    grid: hubChartGrid({ top: 18 }),
    tooltip: { ...hubChartTooltip(), trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: byDay.length ? byDay.map((d) => d.date.slice(5)) : ['—'],
      axisLine: { lineStyle: { color: HUB_CHART_COLORS.grid } },
      axisLabel: { color: HUB_CHART_COLORS.axis, fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: HUB_CHART_COLORS.grid, type: 'dashed' } },
      axisLabel: { color: HUB_CHART_COLORS.axis, fontSize: 10 },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: byDay.length ? byDay.map((d) => d.count) : [0],
        lineStyle: { width: 2, color: accent },
        itemStyle: { color: accent },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(251, 191, 36, 0.32)' },
              { offset: 1, color: 'rgba(251, 191, 36, 0.02)' },
            ],
          },
        },
      },
    ],
  }
}

/** buildModeResultBarOption：函数，按签名入参返回处理结果。 */
export function buildModeResultBarOption(ok: number, fail: number) {
  return {
    ...hubChartBase(),
    ...getKioskAnimationOptions(),
    grid: hubChartGrid({ top: 16 }),
    tooltip: { ...hubChartTooltip(), trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category',
      data: ['成功', '失败'],
      axisLine: { lineStyle: { color: HUB_CHART_COLORS.grid } },
      axisLabel: { color: HUB_CHART_COLORS.axis, fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLine: { show: false },
      splitLine: { lineStyle: { color: HUB_CHART_COLORS.grid, type: 'dashed' } },
      axisLabel: { color: HUB_CHART_COLORS.axis, fontSize: 10 },
    },
    series: [
      {
        type: 'bar',
        barWidth: 28,
        data: [
          {
            value: ok,
            itemStyle: { color: HUB_CHART_COLORS.green, borderRadius: [8, 8, 0, 0] },
          },
          {
            value: fail,
            itemStyle: { color: HUB_CHART_COLORS.red, borderRadius: [8, 8, 0, 0] },
          },
        ],
      },
    ],
  }
}
