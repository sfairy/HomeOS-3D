/**
 * @file notifications-analytics-charts.internals.ts
 * @module frontend/src/features/notifications/composables
 */
/** 通知分析页：echarts option 构建（纯函数，无 Vue 依赖以外的状态） */

import type { EChartsCoreOption } from 'echarts'
import { getKioskAnimationOptions } from '@/composables/ui/kiosk-animation'
import {
  barGradient,
  CHART_EMPTY_COLOR,
  chartLinearGradient,
  countCategoryAxis,
  countValueAxis,
  createChartTooltip,
  pieEmptyData,
  pieSeries,
  rankCategoryAxis,
} from '@/shared/utils/chart/chart-primitives'

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
