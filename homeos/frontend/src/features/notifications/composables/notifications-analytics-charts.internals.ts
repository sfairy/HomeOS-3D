/**
 * @file notifications-analytics-charts.internals.ts
 * @module frontend/src/features/notifications/composables
 */
/** 通知分析页：echarts option 构建（纯函数，无 Vue 依赖以外的状态） */

import type { EChartsCoreOption } from 'echarts'
import { getKioskAnimationOptions } from '@/composables/ui/kiosk-animation'
import {
  getChartPalette,
  chartTooltip,
  chartAxisLabel,
  chartBarGradient,
} from '@/shared/utils/chart/chart-palette'

export type AnalyticsSourceBucket = {
  key: string
  label: string
  count: number
  color: string
}

export type AnalyticsLevelBucket = {
  level: string
  label: string
  count: number
  color: string
}

export type AnalyticsTimeBucket = {
  label: string
  count: number
}

export type AnalyticsReadSummary = {
  total: number
  read: number
  unread: number
}

const axisLineStyle = { lineStyle: { color: 'rgba(255,255,255,0.07)' } }
const splitLineStyle = { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' as const } }

function chartBase() {
  return { ...getKioskAnimationOptions(), backgroundColor: 'transparent' }
}

function yMax(values: number[]) {
  return Math.max(...values, 0, 1)
}

/** 饼图过多来源会把外置标签压在一起：聚合为 top 6 + 其他。 */
function compactBuckets(buckets: AnalyticsSourceBucket[], limit = 6): AnalyticsSourceBucket[] {
  const positive = buckets.filter((bucket) => bucket.count > 0)
  if (positive.length <= limit) return positive
  const head = positive.slice(0, limit)
  const rest = positive.slice(limit)
  const restCount = rest.reduce((sum, bucket) => sum + bucket.count, 0)
  return restCount > 0
    ? [...head, { key: '__other__', label: '其他', count: restCount, color: '' }]
    : head
}

export function buildNotificationsTimeOption(buckets: AnalyticsTimeBucket[]): EChartsCoreOption {
  const palette = getChartPalette()
  const counts = buckets.map((bucket) => bucket.count)
  return {
    ...chartBase(),
    grid: { left: 42, right: 16, top: 18, bottom: buckets.length > 8 ? 42 : 28 },
    xAxis: {
      type: 'category',
      data: buckets.map((bucket) => bucket.label),
      axisLine: axisLineStyle,
      axisTick: { show: false },
      axisLabel: {
        ...chartAxisLabel(palette),
        interval: buckets.length > 12 ? Math.floor(buckets.length / 8) : 0,
        rotate: buckets.length > 10 ? 32 : 0,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: yMax(counts),
      minInterval: 1,
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: chartAxisLabel(palette),
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: counts,
        lineStyle: { width: 2.5, color: palette.accent },
        itemStyle: { color: palette.accent, borderColor: palette.accentStrong, borderWidth: 1 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${palette.accent}59` },
              { offset: 1, color: `${palette.accent}05` },
            ],
          },
        },
      },
    ],
    tooltip: { ...chartTooltip(palette), trigger: 'axis' },
  }
}

export function buildNotificationsReadOption(summary: AnalyticsReadSummary): EChartsCoreOption {
  const palette = getChartPalette()
  const data = [
    { name: '已读', value: summary.read, itemStyle: { color: palette.success } },
    { name: '未读', value: summary.unread, itemStyle: { color: palette.accent } },
  ]
  // 已读率由本图表自行推导，避免依赖调用方额外字段。
  const readTotal = summary.total > 0 ? summary.total : summary.read + summary.unread
  const pct = readTotal > 0 ? Math.round((summary.read / readTotal) * 100) : 0
  return {
    ...chartBase(),
    // 环心显示已读率，避免读者必须对照右侧 hint 才能读出比例。
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '43%',
        silent: true,
        style: {
          text: pct + '%',
          fill: palette.fg1,
          fontSize: 20,
          fontWeight: 700,
          textAlign: 'center',
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '55%',
        silent: true,
        style: {
          text: '已读率',
          fill: palette.fg3,
          fontSize: 11,
          textAlign: 'center',
        },
      },
    ],
    tooltip: { ...chartTooltip(palette), trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '54%'],
        label: {
          color: palette.fg2,
          fontSize: 11,
          fontWeight: 600,
          formatter: (item: { value?: number; name?: string }) =>
            Number(item.value) > 0 ? String(item.name ?? '') : '',
        },
        itemStyle: { borderRadius: 4, borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
        data: summary.total ? data : [{ name: '暂无', value: 1, itemStyle: { color: palette.fg3 } }],
      },
    ],
  }
}

export function buildNotificationsSourceOption(
  sourceBuckets: AnalyticsSourceBucket[],
): EChartsCoreOption {
  const palette = getChartPalette()
  const buckets = compactBuckets(sourceBuckets)
  const data = buckets.length
    ? buckets.map((bucket, index) => ({
        name: bucket.label,
        value: bucket.count,
        key: bucket.key,
        itemStyle: { color: bucket.color || palette.colorAt(index) },
      }))
    : [{ name: '暂无', value: 1, key: '', itemStyle: { color: palette.fg3 } }]
  return {
    ...chartBase(),
    tooltip: { ...chartTooltip(palette), trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '54%'],
        minShowLabelAngle: 6,
        label: { color: palette.fg2, fontSize: 11, fontWeight: 600 },
        labelLine: { length: 8, length2: 8, lineStyle: { color: palette.fg3 } },
        itemStyle: { borderRadius: 4, borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
        data,
      },
    ],
  }
}

export function buildNotificationsLevelOption(
  levelBuckets: AnalyticsLevelBucket[],
): EChartsCoreOption {
  const palette = getChartPalette()
  const labels = levelBuckets.length ? levelBuckets.map((bucket) => bucket.label) : ['暂无']
  const values = levelBuckets.length ? levelBuckets.map((bucket) => bucket.count) : [0]
  return {
    ...chartBase(),
    grid: { left: 42, right: 16, top: 18, bottom: levelBuckets.length > 4 ? 42 : 28 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: axisLineStyle,
      axisTick: { show: false },
      axisLabel: chartAxisLabel(palette),
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: yMax(values),
      minInterval: 1,
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: chartAxisLabel(palette),
    },
    series: [
      {
        type: 'bar',
        data: values.map((value, index) => ({
          value,
          level: levelBuckets[index]?.level,
          itemStyle: {
            color: chartBarGradient(levelBuckets[index]?.color || palette.accent),
            borderRadius: [6, 6, 0, 0],
          },
        })),
        barWidth: 18,
      },
    ],
    tooltip: { ...chartTooltip(palette), trigger: 'axis' },
  }
}

export function buildNotificationsRankOption(
  sourceBuckets: AnalyticsSourceBucket[],
): EChartsCoreOption {
  const palette = getChartPalette()
  const buckets = sourceBuckets.slice(0, 8)
  const labels = buckets.length ? buckets.map((bucket) => bucket.label.slice(0, 8)) : ['暂无']
  const values = buckets.length ? buckets.map((bucket) => bucket.count) : [0]
  return {
    ...chartBase(),
    grid: {
      left: 68,
      right: 18,
      top: 10,
      bottom: 10,
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel',
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: yMax(values),
      splitLine: splitLineStyle,
      axisLabel: chartAxisLabel(palette),
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisLabel: { ...chartAxisLabel(palette), color: palette.fg2 },
    },
    series: [
      {
        type: 'bar',
        data: values.map((value, index) => ({
          value,
          key: buckets[index]?.key,
          itemStyle: {
            color: chartBarGradient(buckets[index]?.color || palette.colorAt(index)),
            borderRadius: [0, 6, 6, 0],
          },
        })),
        barWidth: 10,
      },
    ],
    tooltip: { ...chartTooltip(palette), trigger: 'axis' },
  }
}
