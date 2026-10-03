/**
 * 生活中心 ECharts 选项构建（总览 / 模块分析轨共用）
 *
 * 所属模块：生活中心 / 图表
 * 职责：构建功率趋势、温湿度趋势、
 *   24 时段面积曲线、峰电周环比、时长排行、成功率仪表等 ECharts 选项。
 *   统一 tooltip / 网格 / 空态文案风格。
 * 依赖：kiosk-animation（动画选项）、useLifeOverviewAnalytics 类型。
 */
import { getKioskAnimationOptions } from '@/utils/chart/kiosk-animation'
import {
  axisLineStyle,
  axisLabelStyle,
  splitLineStyle,
  chartEmptyGraphic,
  chartEmptyGraphicElement,
  chartLinearGradient,
  createChartTooltip,
} from '@/utils/chart/chart-primitives'
import { chartVerticalGradient } from '@/utils/chart/device-chart-theme'
import type { LifeEnvDay, LifeTrendPoint } from '@/composables/life/useLifeOverviewAnalytics'

/** 生活中心图表基础配置（动画选项 + 透明背景） */
export function lifeChartBase() {
  return { ...getKioskAnimationOptions(), backgroundColor: 'transparent' }
}

/**
 * 生活中心 tooltip 配置工厂。
 *
 * @param accent 边框色（默认青绿色半透明）
 * @returns tooltip 配置对象（深色背景 + 模糊 + 阴影）
 */
export function lifeChartTooltip(accent = 'rgba(45, 212, 191, 0.32)') {
  return {
    ...createChartTooltip('rgba(12, 12, 18, 0.94)', {
      borderColor: accent,
      borderWidth: 1,
      padding: [8, 12],
      extraCssText:
        'border-radius: 10px; backdrop-filter: blur(12px); box-shadow: 0 8px 28px rgba(0,0,0,0.35);',
      textStyle: { color: '#e2e8f0', fontSize: 12, fontWeight: 600 },
    }),
  }
}

/**
 * 构建功率趋势面积曲线选项。
 *
 * @param points 趋势点数组（label + value）
 * @param accent 曲线主色（默认琥珀色；为琥珀色时 tooltip 边框用琥珀半透明，否则用青绿）
 * @returns ECharts option；无数据时渲染「暂无采样」占位文本
 */
export function buildPowerTrendOption(points: LifeTrendPoint[], accent = '#fbbf24') {
  const labels = points.map((p) => p.label)
  const values = points.map((p) => p.value)
  const empty = !values.length
  const max = Math.max(...values, 1)
  const tip = lifeChartTooltip(
    accent === '#fbbf24' ? 'rgba(251, 191, 36, 0.32)' : 'rgba(45, 212, 191, 0.32)',
  )
  return {
    ...lifeChartBase(),
    grid: { left: 36, right: 10, top: 12, bottom: 22 },
    tooltip: { ...tip, trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: empty ? ['—'] : labels,
      axisTick: { show: false },
      axisLine: axisLineStyle,
      axisLabel: {
        ...axisLabelStyle,
        interval: Math.max(0, Math.floor(labels.length / 6) - 1),
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max,
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: axisLabelStyle,
    },
    series: [
      {
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: empty ? [] : values,
        lineStyle: { width: 2, color: accent },
        areaStyle: {
          color: chartLinearGradient([
            [0, `${accent}4d`],
            [1, `${accent}05`],
          ]),
        },
      },
    ],
    graphic: empty ? chartEmptyGraphic('暂无采样') : undefined,
  }
}

/**
 * 构建温湿度双轴趋势选项（左轴温度 ℃、右轴湿度 %）。
 *
 * @param days 每日环境数据数组
 * @returns ECharts option；数据点 ≤ 3 时开启 sparse 模式（显示符号 + boundaryGap）；
 *   无数据时渲染「暂无温湿度」占位文本
 */
export function buildEnvTrendOption(days: LifeEnvDay[]) {
  const labels = days.map((d) => String(d.date || '').slice(5))
  const temps = days.map((d) => (d.avgTemperature == null ? null : Number(d.avgTemperature)))
  const hums = days.map((d) => (d.avgHumidity == null ? null : Number(d.avgHumidity)))
  // sparse 模式：数据点少时显示符号 + 留边界间隙，避免点位贴边
  const sparse = labels.length > 0 && labels.length <= 3
  const empty = !labels.length
  const tip = lifeChartTooltip('rgba(56, 189, 248, 0.32)')
  return {
    ...lifeChartBase(),
    grid: { left: 32, right: 32, top: 26, bottom: 18 },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 6,
    },
    tooltip: { ...tip, trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: empty ? ['—'] : labels,
      boundaryGap: sparse,
      axisTick: { show: false },
      axisLine: axisLineStyle,
      axisLabel: axisLabelStyle,
    },
    yAxis: [
      {
        type: 'value',
        name: '℃',
        scale: true,
        nameTextStyle: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        axisLine: { show: false },
        splitLine: splitLineStyle,
        axisLabel: axisLabelStyle,
      },
      {
        type: 'value',
        name: '%',
        scale: true,
        nameTextStyle: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: axisLabelStyle,
      },
    ],
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: !sparse,
        showSymbol: sparse,
        symbolSize: sparse ? 7 : 4,
        data: empty ? [] : temps,
        lineStyle: { width: 2, color: '#fb7185' },
        areaStyle: {
          color: chartVerticalGradient('#fb7185', 0.28, 0),
        },
      },
      {
        name: '湿度',
        type: 'line',
        yAxisIndex: 1,
        smooth: !sparse,
        showSymbol: sparse,
        symbolSize: sparse ? 7 : 4,
        data: empty ? [] : hums,
        lineStyle: { width: 2, color: '#38bdf8' },
        areaStyle: {
          color: chartVerticalGradient('#38bdf8', 0.22, 0),
        },
      },
    ],
    graphic: empty ? chartEmptyGraphic('暂无温湿度') : undefined,
  }
}
/**
 * 24 时段面积曲线（习惯活跃 / 自动化失败等）
 *
 * @param points 趋势点数组（label + value）
 * @param opts.accent 曲线主色（默认紫色）
 * @param opts.name 系列名（默认 '数值'）
 * @param opts.emptyLabel 空态占位文本（默认 '暂无采样'）
 * @returns ECharts option；全零数据渲染 emptyLabel 占位文本
 */
export function buildHourAreaOption(
  points: LifeTrendPoint[],
  opts: { accent?: string; name?: string; emptyLabel?: string } = {},
) {
  const accent = opts.accent || '#a78bfa'
  const name = opts.name || '数值'
  const labels = points.map((p) => p.label)
  const values = points.map((p) => p.value)
  const hasData = values.some((v) => v > 0)
  // 根据主色首字符选择 tooltip 边框色（琥珀色系 vs 紫色系）
  const tip = lifeChartTooltip(
    accent.startsWith('#f') ? 'rgba(251, 191, 36, 0.32)' : 'rgba(167, 139, 250, 0.32)',
  )
  return {
    ...lifeChartBase(),
    grid: { left: 28, right: 8, top: 14, bottom: 22 },
    tooltip: { ...tip, trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: labels.length ? labels : ['—'],
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: axisLineStyle,
      axisLabel: {
        color: 'rgba(255,255,255,0.58)',
        fontSize: 9,
        interval: 3,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
    },
    series: [
      {
        name,
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: hasData ? values : labels.map(() => 0),
        lineStyle: { width: 2.2, color: accent },
        areaStyle: {
          color: chartLinearGradient([
            [0, `${accent}66`],
            [1, `${accent}08`],
          ]),
        },
      },
    ],
    graphic: hasData
      ? undefined
      : chartEmptyGraphicElement(opts.emptyLabel || '暂无采样', {
          fill: 'rgba(255,255,255,0.58)',
          fontSize: 11,
          fontWeight: 600,
        }),
  }
}

/**
 * 峰段周环比对比柱（上周峰电 vs 本周峰电）。
 *
 * @param thisWeek 本周峰电值
 * @param lastWeek 上周峰电值
 * @returns ECharts option（双柱对比，上周灰阶 + 本周蓝渐变）
 */
export function buildPeakCompareOption(thisWeek: number, lastWeek: number) {
  const tip = lifeChartTooltip('rgba(56, 189, 248, 0.32)')
  return {
    ...lifeChartBase(),
    grid: { left: 40, right: 12, top: 16, bottom: 28 },
    tooltip: { ...tip, trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category',
      data: ['上周峰电', '本周峰电'],
      axisTick: { show: false },
      axisLine: axisLineStyle,
      axisLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: 'kWh',
      nameTextStyle: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 9 },
    },
    series: [
      {
        type: 'bar',
        barWidth: 28,
        data: [
          {
            value: lastWeek,
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
              color: chartVerticalGradient('#94a3b8', 0.85, 0.25),
            },
          },
          {
            value: thisWeek,
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
              color: chartLinearGradient([
                [0, '#38bdf8'],
                [1, 'rgba(56, 189, 248, 0.25)'],
              ]),
            },
          },
        ],
      },
    ],
  }
}
/**
 * 横向时长条（分钟）
 *
 * @param rows 行数组（name + minutes）；minutes > 0 的行取前 6 条
 * @returns ECharts option；无数据时渲染「暂无在室时长」占位文本；tooltip 自动追加 ' 分钟'
 */
export function buildDurationRankBarOption(rows: Array<{ name: string; minutes: number }>) {
  const list = rows.filter((r) => r.minutes > 0).slice(0, 6)
  const tip = lifeChartTooltip('rgba(56, 189, 248, 0.32)')
  const empty = !list.length
  return {
    ...lifeChartBase(),
    grid: { left: 72, right: 16, top: 8, bottom: 8 },
    tooltip: {
      ...tip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number | string) => `${v} 分钟`,
    },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: splitLineStyle,
      axisLabel: { ...axisLabelStyle, formatter: '{value}′' },
    },
    yAxis: {
      type: 'category',
      data: empty ? ['—'] : list.map((r) => r.name),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 10, width: 64, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: empty ? [] : list.map((r) => r.minutes),
        barWidth: 10,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: chartLinearGradient(
            [
              [0, 'rgba(56, 189, 248, 0.35)'],
              [1, '#38bdf8'],
            ],
            'horizontal',
          ),
        },
      },
    ],
    graphic: empty ? chartEmptyGraphic('暂无在室时长') : undefined,
  }
}

/**
 * 成功率半环仪表
 *
 * @param rate 成功率（0–100）
 * @param total 总执行次数；≤ 0 时视为无数据
 * @returns ECharts option；无数据时不显示进度条并渲染 '—' + '暂无执行'
 */
export function buildSuccessRateGaugeOption(rate: number, total: number) {
  const tip = lifeChartTooltip('rgba(52, 211, 153, 0.32)')
  const hasData = total > 0
  const safe = hasData ? Math.max(0, Math.min(100, Number(rate) || 0)) : 0
  return {
    ...lifeChartBase(),
    tooltip: { ...tip, trigger: 'item' },
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        radius: '92%',
        center: ['50%', '58%'],
        progress: {
          show: hasData,
          width: 10,
          itemStyle: {
            color: chartLinearGradient(
              [
                [0, '#34d399'],
                [1, '#38bdf8'],
              ],
              'horizontal',
            ),
          },
        },
        axisLine: {
          lineStyle: {
            width: 10,
            color: [[1, 'rgba(255,255,255,0.08)']],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        title: {
          show: true,
          offsetCenter: [0, '68%'],
          color: 'rgba(255,255,255,0.58)',
          fontSize: 10,
          fontWeight: 650,
        },
        detail: {
          valueAnimation: hasData,
          offsetCenter: [0, '18%'],
          formatter: () => (hasData ? `${Math.round(safe)}%` : '—'),
          color: 'rgba(255,255,255,0.92)',
          fontSize: 22,
          fontWeight: 780,
        },
        data: [{ value: safe, name: hasData ? `${total} 次` : '暂无执行' }],
      },
    ],
  }
}