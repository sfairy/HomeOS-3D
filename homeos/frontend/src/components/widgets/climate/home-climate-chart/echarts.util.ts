/**
 * home-climate-chart-echarts.util - 家庭气候图表 ECharts 工具函数
 * 功能特性：
 * - 构建 ECharts 配置选项
 * - 处理温湿度历史数据映射
 * - 格式化图例数值
 * - 判断图表容器是否就绪
 * - 生成系列名称
 * 依赖：
 * - kiosk-animation: 图表动画选项（echarts vendor 本身由调用方动态加载）
 * - chart-primitives: 渐变原语（替代 echarts.graphic.LinearGradient，避免静态引入 echarts）
*/
import { getEntityLeaf } from '@homeos/shared'
import { pad2 } from '@/utils/format/locale-format.util'
import { getKioskAnimationOptions } from '@/utils/chart/kiosk-animation'
import { chartLinearGradient } from '@/utils/chart/chart-primitives'
import { formatAuditTimestamp } from '@/utils/format/locale-format.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { TEMP_COLORS, HUM_COLORS } from './constants'
import { adaptiveAxisBound } from './axis.util'

interface ClimateSeriesPoint {
  x: number
  y: number
}

/**
 * 后端 `/ha/history` 返回的历史点。
 * 用结构类型而非 import API 层类型，保持渲染工具层不反向依赖 services。
 */
export interface ClimateHistoryPoint {
  timestamp: string
  value: number | string
}

/** 气候图表数据系列接口 */
export interface ClimateSeries {
  entityId: string
  name: string
  data: ClimateSeriesPoint[]
}

/** 气候图图例项接口 */
export interface ClimateLegendItem {
  key: string
  name: string
  kind: 'temp' | 'hum'
  kindLabel: string
  formattedValue: string
  color: string
  seriesName: string
}

function formatAxisTime(value: number) {
  const d = new Date(value)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 生成图表系列名称（用于 ECharts legend 切换） */
export function chartSeriesName(entityId: string, kind: string) {
  return `${entityId}::${kind}`
}

function hexRgb(hex: string) {
  return `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`
}

/** 格式化图例数值显示（温度/湿度） */
export function formatLegendValue(value: number | null, kind: 'temp' | 'hum') {
  if (value == null || Number.isNaN(value)) return '—'
  return kind === 'hum' ? String(Math.round(value)) : Number(value).toFixed(1)
}

function parseHistory(points: ClimateHistoryPoint[]) {
  return points
    .map((p) => ({ x: new Date(p.timestamp).getTime(), y: parseFloat(String(p.value)) }))
    .filter((p) => !Number.isNaN(p.y))
}

function friendlyBaseName(
  entityId: string,
  entities: Record<string, { state?: string; attributes?: Record<string, unknown> } | undefined>,
) {
  const raw = getEntityDisplayName(entityId, entities[entityId])
  return (
    String(raw)
      .replace(/温度|湿度|temp|humidity/gi, '')
      .trim() || entityId
  )
}

/** 将历史数据映射为图表系列格式（``pointsByEntity`` 由调用方按实体 key 组装） */
export function mapHistorySeries(
  ids: string[],
  pointsByEntity: Map<string, ClimateHistoryPoint[]>,
  entities: Record<string, { state?: string; attributes?: Record<string, unknown> } | undefined>,
) {
  const rows = ids
    .filter((id) => {
      const points = pointsByEntity.get(id)
      return !!points && points.length > 0
    })
    .map((id) => ({
      entityId: id,
      baseName: friendlyBaseName(id, entities),
      data: parseHistory(pointsByEntity.get(id)!),
    }))
    .filter((s) => s.data.length > 0)

  const nameCounts: Record<string, number> = {}
  rows.forEach((r) => {
    nameCounts[r.baseName] = (nameCounts[r.baseName] || 0) + 1
  })

  return rows.map((r) => {
    let name = r.baseName
    if (nameCounts[r.baseName] > 1) {
      const tail = getEntityLeaf(r.entityId)
      name = `${name} · ${String(tail).slice(-8)}`
    }
    return { entityId: r.entityId, name, data: r.data }
  })
}

function buildLineSeries(
  serie: ClimateSeries,
  color: string,
  yAxisIndex: number,
  kind: string,
  withFill = true,
) {
  const item: Record<string, unknown> = {
    id: serie.entityId,
    name: chartSeriesName(serie.entityId, kind),
    type: 'line',
    yAxisIndex,
    data: serie.data.map((d) => [d.x, d.y]),
    smooth: 0.28,
    symbol: 'none',
    lineStyle: { width: withFill ? 2 : 1.75, color },
    emphasis: { focus: 'series', lineStyle: { width: 2.5 } },
  }
  if (withFill) {
    item.areaStyle = {
      color: chartLinearGradient([
        [0, `rgba(${hexRgb(color)},0.18)`],
        [1, `rgba(${hexRgb(color)},0)`],
      ]),
    }
  }
  return item
}

function buildTempYAxis() {
  return {
    type: 'value',
    position: 'left',
    scale: true,
    min: adaptiveAxisBound('temp', 'min'),
    max: adaptiveAxisBound('temp', 'max'),
    splitNumber: 3,
    axisLabel: {
      color: 'rgba(255,107,107,0.5)',
      fontSize: 8,
      margin: 3,
      formatter: (v: number) => `${Math.round(v)}°`,
    },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,0.035)', type: 'dashed' } },
    axisLine: { show: false },
    axisTick: { show: false },
  }
}

function buildHumYAxis() {
  return {
    type: 'value',
    position: 'right',
    scale: true,
    min: adaptiveAxisBound('hum', 'min'),
    max: adaptiveAxisBound('hum', 'max'),
    splitNumber: 3,
    axisLabel: {
      color: 'rgba(10,132,255,0.5)',
      fontSize: 8,
      margin: 3,
      formatter: (v: number) => `${Math.round(v)}%`,
    },
    splitLine: { show: false },
    axisLine: { show: false },
    axisTick: { show: false },
  }
}

function buildSingleYAxis(view: string) {
  const isHum = view === 'humidity'
  const kind = isHum ? 'hum' : 'temp'
  return [
    {
      type: 'value',
      scale: true,
      min: adaptiveAxisBound(kind, 'min'),
      max: adaptiveAxisBound(kind, 'max'),
      axisLabel: {
        color: 'rgba(255,255,255,0.58)',
        fontSize: 9,
        margin: 4,
        formatter: (v: number) => (isHum ? `${Math.round(v)}%` : `${Math.round(v)}°`),
      },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
  ]
}

interface BuildClimateChartOptionParams {
  activeView: string
  temperatureSeries: ClimateSeries[]
  humiditySeries: ClimateSeries[]
  legendItems: ClimateLegendItem[]
  legendHidden: boolean[]
  xMin: number
  xMax: number
}

/** 构建完整的 ECharts 配置选项 */
export function buildClimateChartOption(params: BuildClimateChartOptionParams) {
  const { activeView, temperatureSeries, humiditySeries, legendItems, legendHidden, xMin, xMax } =
    params

  const isCombinedView = activeView === 'all'
  const showTemp = isCombinedView || activeView === 'temperature'
  const showHum = isCombinedView || activeView === 'humidity'

  const series: Record<string, unknown>[] = []
  const lineFill = !isCombinedView
  if (showTemp) {
    temperatureSeries.forEach((s, i) => {
      series.push(buildLineSeries(s, TEMP_COLORS[i % TEMP_COLORS.length], 0, 'temp', lineFill))
    })
  }
  if (showHum) {
    humiditySeries.forEach((s, i) => {
      series.push(
        buildLineSeries(
          s,
          HUM_COLORS[i % HUM_COLORS.length],
          isCombinedView ? 1 : 0,
          'hum',
          lineFill,
        ),
      )
    })
  }

  const legendSelected: Record<string, boolean> = Object.fromEntries(
    series.map((s) => [s.name as string, true]),
  )
  legendItems.forEach((item, idx) => {
    if (item.seriesName in legendSelected) {
      legendSelected[item.seriesName] = !legendHidden[idx]
    }
  })

  const yAxis = isCombinedView ? [buildTempYAxis(), buildHumYAxis()] : buildSingleYAxis(activeView)

  return {
    ...getKioskAnimationOptions(),
    backgroundColor: 'transparent',
    legend: { show: false, selected: legendSelected },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(18,18,28,0.98)',
      borderColor: 'var(--premium-border-strong)',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: '#fff', fontSize: 11 },
      axisPointer: isCombinedView
        ? {
            type: 'cross',
            snap: true,
            link: [{ xAxisIndex: [0] }],
            lineStyle: { color: 'rgba(255,255,255,0.12)', type: 'dashed', width: 1 },
            label: {
              backgroundColor: 'rgba(18,18,28,0.92)',
              borderColor: 'var(--premium-border-strong)',
              borderWidth: 1,
              color: '#fff',
              fontSize: 10,
              padding: [4, 6],
            },
          }
        : {
            type: 'cross',
            snap: true,
            lineStyle: { color: 'rgba(255,255,255,0.12)', type: 'dashed', width: 1 },
          },
      formatter: (
        params: Array<{
          data?: [number, number]
          color?: string
          seriesId?: string
          seriesName?: string
        }>,
      ) => {
        if (!params?.length) return ''
        const t = params[0].data?.[0] ? new Date(params[0].data[0]) : null
        const ts = t ? formatAuditTimestamp(t) : ''
        // 外壳页 CSP 是 ``style-src 'self'``，tooltip 里的行内 style **会被浏览器拦下**
        // （曾经表现为控制台一串「Applying inline style violates …」且 tooltip 样式静默失效）。
        // 因此这里只输出类名，样式集中在 styles/home-climate-chart.css；
        // 唯一带动态值的圆点改用 SVG 的 ``fill`` 呈现属性 —— 它不受 style-src 约束。
        let html = `<div class="hcc-tip__time">${ts}</div>`
        for (const p of params) {
          const isHum = humiditySeries.some((s) => s.entityId === p.seriesId)
          const unit = isHum ? '%' : '°C'
          const label =
            temperatureSeries.find((s) => s.entityId === p.seriesId)?.name ??
            humiditySeries.find((s) => s.entityId === p.seriesId)?.name ??
            p.seriesName
          const dotColor = typeof p.color === 'string' && p.color ? p.color : 'currentColor'
          html +=
            '<div class="hcc-tip__row">' +
            `<svg class="hcc-tip__dot" viewBox="0 0 8 8" aria-hidden="true"><rect width="8" height="8" rx="2" fill="${dotColor}"/></svg>` +
            `<span class="hcc-tip__label">${label}</span>` +
            `<b class="hcc-tip__value">${Number(p.data?.[1] ?? 0).toFixed(1)}${unit}</b>` +
            '</div>'
        }
        return html
      },
    },
    grid: {
      left: isCombinedView ? 24 : 28,
      right: isCombinedView ? 24 : 4,
      top: isCombinedView ? 14 : 4,
      bottom: 14,
      containLabel: false,
    },
    xAxis: {
      type: 'time',
      min: xMin,
      max: xMax,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: true,
        color: 'rgba(255,255,255,0.58)',
        fontSize: 8,
        margin: 4,
        hideOverlap: true,
        formatter: formatAxisTime,
      },
      splitLine: { show: false },
    },
    yAxis,
    series,
  }
}

/** 判断图表容器是否已就绪（有尺寸且可见） */
export function isChartContainerReady(el: HTMLElement | null | undefined) {
  return !!el && el.clientWidth >= 2 && el.clientHeight >= 2
}
