/**
 * @file notifications-analytics-charts.internals.ts
 * @module frontend/src/features/notifications/composables
 */
/** 通知分析页：echarts option 构建（纯函数，无 Vue 依赖以外的状态） */

import type { EChartsCoreOption } from 'echarts'
import { getKioskAnimationOptions } from '@/composables/ui/kiosk-animation'

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

const chartTooltip = {
  backgroundColor: 'rgba(12, 12, 18, 0.94)',
  borderColor: 'rgba(244, 114, 182, 0.32)',
  borderWidth: 1,
  padding: [8, 12] as [number, number],
  extraCssText:
    'border-radius: 10px; backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0,0,0,0.35);',
  textStyle: { color: '#fbcfe8', fontSize: 12, fontWeight: 600 },
}

const axisLineStyle = { lineStyle: { color: 'rgba(255,255,255,0.07)' } }
const splitLineStyle = { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' as const } }

function chartBase() {
  return { ...getKioskAnimationOptions(), backgroundColor: 'transparent' }
}

function barGradient(color: string) {
  return {
    type: 'linear' as const,
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

function yMax(values: number[]) {
  return Math.max(...values, 0, 1)
}

export function buildNotificationsTimeOption(buckets: AnalyticsTimeBucket[]): EChartsCoreOption {
  const counts = buckets.map((bucket) => bucket.count)
  return {
    ...chartBase(),
    grid: { left: 36, right: 12, top: 16, bottom: buckets.length > 8 ? 36 : 24 },
    xAxis: {
      type: 'category',
      data: buckets.map((bucket) => bucket.label),
      axisLine: axisLineStyle,
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(255,255,255,0.58)',
        fontSize: 9,
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
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
    },
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
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(244, 114, 182, 0.35)' },
              { offset: 1, color: 'rgba(244, 114, 182, 0.02)' },
            ],
          },
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
    series: [
      {
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '54%'],
        label: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: 600 },
        itemStyle: { borderRadius: 4, borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
        data: summary.total ? data : [{ name: '暂无', value: 1, itemStyle: { color: '#64748b' } }],
      },
    ],
  }
}

export function buildNotificationsSourceOption(
  sourceBuckets: AnalyticsSourceBucket[],
): EChartsCoreOption {
  const buckets = sourceBuckets.filter((bucket) => bucket.count > 0)
  const data = buckets.length
    ? buckets.map((bucket) => ({
        name: bucket.label,
        value: bucket.count,
        key: bucket.key,
        itemStyle: { color: bucket.color },
      }))
    : [{ name: '暂无', value: 1, key: '', itemStyle: { color: '#64748b' } }]
  return {
    ...chartBase(),
    tooltip: { ...chartTooltip, trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '54%'],
        label: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: 600 },
        itemStyle: { borderRadius: 4, borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
        data,
      },
    ],
  }
}

export function buildNotificationsLevelOption(
  levelBuckets: AnalyticsLevelBucket[],
): EChartsCoreOption {
  const labels = levelBuckets.length ? levelBuckets.map((bucket) => bucket.label) : ['暂无']
  const values = levelBuckets.length ? levelBuckets.map((bucket) => bucket.count) : [0]
  return {
    ...chartBase(),
    grid: { left: 36, right: 12, top: 16, bottom: levelBuckets.length > 4 ? 36 : 24 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: axisLineStyle,
      axisTick: { show: false },
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: yMax(values),
      minInterval: 1,
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 10 },
    },
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

export function buildNotificationsRankOption(
  sourceBuckets: AnalyticsSourceBucket[],
): EChartsCoreOption {
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
