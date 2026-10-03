/**
 * 居家环境 / 能源中心 Hub 内嵌图表选项
 *
 * 所属模块：Hub / 环境能源图表
 * 职责：构建环境趋势、舒适度雷达、IAQ 迷你曲线、用水柱状图等 Hub 内嵌图表的 ECharts 选项；
 *   统一空态占位与配色，复用 life-charts 的基础工具。
 * 依赖：kiosk-animation（动画选项）、life-charts.util（基础配置 + tooltip）。
 */
import { getKioskAnimationOptions } from '@/utils/chart/kiosk-animation'
import { lifeChartBase, lifeChartTooltip, buildEnvTrendOption } from '@/utils/chart/life-charts.util'
import {
  axisLineStyle,
  axisLabelStyle,
  splitLineStyle,
  chartEmptyGraphic,
  chartLinearGradient,
} from '@/utils/chart/chart-primitives'
import type { LifeEnvDay } from '@/composables/life/useLifeOverviewAnalytics'

/**
 * 构建环境趋势 Hub 图表选项（复用 life-charts 的 buildEnvTrendOption 并覆盖 grid）。
 *
 * @param days 每日环境数据数组
 * @returns ECharts option（含自定义 grid 边距）
 */
export function buildEnvTrendHubOption(days: LifeEnvDay[]) {
  const base = buildEnvTrendOption(days) as Record<string, unknown>
  return {
    ...base,
    grid: { left: 36, right: 36, top: 30, bottom: 24 },
  }
}

/**
 * 舒适度雷达：差度分越高越差 → 转为舒适分(100-score)展示。
 *
 * @param items 各指标行（含 label / score / empty）；score 为差度分 0–100
 * @returns ECharts option；有效指标 < 3 时渲染「传感器不足」占位文本
 */
export function buildComfortRadarOption(
  items: Array<{ label: string; score: number | null; empty?: boolean }>,
) {
  const rows = items.filter((i) => !i.empty && i.score != null)
  const tip = lifeChartTooltip('rgba(52, 211, 153, 0.32)')
  const empty = rows.length < 3
  const indicators = empty
    ? [
        { name: 'PM2.5', max: 100 },
        { name: 'CO₂', max: 100 },
        { name: '温度', max: 100 },
        { name: '湿度', max: 100 },
        { name: 'TVOC', max: 100 },
      ]
    : rows.map((r) => ({ name: r.label, max: 100 }))
  // 差度分 → 舒适分（100 - score），夹取到 [0, 100]
  const values = empty ? [] : rows.map((r) => Math.max(0, Math.min(100, 100 - (r.score as number))))

  return {
    ...lifeChartBase(),
    tooltip: { ...tip, trigger: 'item' },
    radar: {
      indicator: indicators,
      center: ['50%', '54%'],
      radius: '62%',
      axisName: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 10,
        fontWeight: 650,
      },
      splitNumber: 4,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      splitArea: {
        areaStyle: {
          color: ['rgba(52, 211, 153, 0.02)', 'rgba(52, 211, 153, 0.05)'],
        },
      },
    },
    series: [
      {
        type: 'radar',
        data: empty
          ? []
          : [
              {
                value: values,
                name: '舒适平衡',
                symbol: 'circle',
                symbolSize: 5,
                lineStyle: { width: 2, color: '#34d399' },
                itemStyle: { color: '#6ee7b7' },
                areaStyle: {
                  color: {
                    type: 'radial',
                    x: 0.5,
                    y: 0.5,
                    r: 0.7,
                    colorStops: [
                      { offset: 0, color: 'rgba(52, 211, 153, 0.45)' },
                      { offset: 1, color: 'rgba(52, 211, 153, 0.06)' },
                    ],
                  },
                },
              },
            ],
      },
    ],
    graphic: empty ? chartEmptyGraphic('传感器不足') : undefined,
  }
}
/**
 * 构建 IAQ 迷你曲线（sparkline）选项：无坐标轴的纯面积曲线。
 *
 * @param points 每日 IAQ 均值数组
 * @param accent 曲线主色（默认玫红色）
 * @returns ECharts option；无有效值时 x 轴仅显示占位符
 */
export function buildIaqSparklineOption(
  points: Array<{ date?: string; avgIaq?: number | null }>,
  accent = '#fb7185',
) {
  const labels = points.map((p) => String(p.date || '').slice(5))
  const values = points.map((p) => (p.avgIaq == null ? null : Number(p.avgIaq)))
  const empty = !values.some((v) => v != null)
  const tip = lifeChartTooltip('rgba(251, 113, 133, 0.32)')
  return {
    ...getKioskAnimationOptions(),
    backgroundColor: 'transparent',
    grid: { left: 2, right: 2, top: 6, bottom: 2 },
    tooltip: { ...tip, trigger: 'axis' },
    xAxis: {
      type: 'category',
      show: false,
      data: empty ? ['—'] : labels,
    },
    yAxis: { type: 'value', show: false, scale: true },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: empty ? [] : values,
        lineStyle: { width: 2, color: accent },
        areaStyle: {
          color: chartLinearGradient([
            [0, `${accent}55`],
            [1, `${accent}00`],
          ]),
        },
      },
    ],
  }
}

/**
 * 构建用水量柱状图选项（最近 21 天）。
 *
 * @param daily 每日用水数据数组
 * @param accent 柱体主色（默认青色）
 * @returns ECharts option；无有效用水时渲染「暂无用水记录」占位文本
 */
export function buildWaterUsageChartOption(
  daily: Array<{ date: string; usageM3?: number }>,
  accent = '#22d3ee',
) {
  const rows = daily.slice(-21)
  const labels = rows.map((d) => String(d.date || '').slice(5))
  const values = rows.map((d) => Number(d.usageM3) || 0)
  const empty = !values.some((v) => v > 0)
  const tip = lifeChartTooltip('rgba(34, 211, 238, 0.32)')
  return {
    ...lifeChartBase(),
    grid: { left: 36, right: 10, top: 12, bottom: 22 },
    tooltip: {
      ...tip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => `${v} m³`,
    },
    xAxis: {
      type: 'category',
      data: empty ? ['—'] : labels,
      axisTick: { show: false },
      axisLine: axisLineStyle,
      axisLabel: {
        ...axisLabelStyle,
        interval: Math.max(0, Math.floor(labels.length / 7) - 1),
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: axisLabelStyle,
    },
    series: [
      {
        type: 'bar',
        data: empty ? [] : values,
        barMaxWidth: 14,
        itemStyle: {
          borderRadius: [5, 5, 2, 2],
          color: chartLinearGradient([
            [0, accent],
            [1, `${accent}40`],
          ]),
        },
      },
    ],
    graphic: empty ? chartEmptyGraphic('暂无用水记录') : undefined,
  }
}

/**
 * 指标差度条百分比：空=0，有 score 用 score，否则告警态给偏高占比。
 *
 * @param item.score 差度分（0–100）
 * @param item.warn 是否告警态
 * @param item.empty 是否空态
 * @returns 0–100 的整数百分比（最低 4，最高 100）
 */
export function metricBarPct(item: {
  score?: number | null
  warn?: boolean
  empty?: boolean
}): number {
  if (item.empty) return 0
  if (item.score != null && Number.isFinite(item.score)) {
    return Math.max(4, Math.min(100, Math.round(item.score)))
  }
  return item.warn ? 72 : 28
}