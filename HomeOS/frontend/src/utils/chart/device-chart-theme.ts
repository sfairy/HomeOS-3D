/**
 * 设备页 ECharts 主题：颜色常量 + tooltip / grid / legend / axis 工厂函数。
 *
 * 所属模块：设备分析 / 图表主题
 * 职责：集中维护设备页图表的颜色、tooltip、网格、图例、坐标轴等共享配置，
 *   保证各图表视觉一致；ECharts 不支持 CSS 变量，颜色以字面量映射。
 * 依赖：echarts/core 类型、ui/color.util 的 hexWithOpacity。
 */
import type { EChartsCoreOption } from 'echarts/core'
import { createChartTooltip } from '@/utils/chart/chart-primitives'
import { hexWithOpacity } from '@/utils/ui/color.util'

/** 设备页图表配色常量（accent / 状态色 / 网格 / 轴色等） */
export const DEVICE_CHART_COLORS = {
  accent: '#38bdf8', // 主强调色（天蓝）
  green: '#34d399',  // 健康 / 在线色
  red: '#f87171',    // 告警 / 离线色
  amber: '#fbbf24',  // 警示色
  purple: '#a78bfa', // 对比色（同域平均等）
  grid: 'rgba(255,255,255,0.06)', // 网格线色
  /** 与 --premium-border-strong 数值一致（ECharts 不支持 CSS var） */
  sliceBorder: 'rgba(255,255,255,0.08)', // 饼图扇区边框色
  axis: 'rgba(255,255,255,0.58)',        // 轴标签色
  axisName: 'rgba(255,255,255,0.62)',    // 轴名色
}

/** 通用坐标轴 tooltip 配置（深色背景 + premium 边框） */
export function deviceChartTooltip(): NonNullable<EChartsCoreOption['tooltip']> {
  return {
    trigger: 'axis',
    ...createChartTooltip('rgba(18,18,28,0.98)', {
      borderColor: 'var(--premium-border-strong)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#fff', fontSize: 11 },
    }),
  }
}

/** 饼图 tooltip 配置（按项触发，显示 名称：数值（百分比%）） */
export function devicePieTooltip(): NonNullable<EChartsCoreOption['tooltip']> {
  return {
    trigger: 'item',
    ...createChartTooltip('rgba(18,18,28,0.98)', {
      borderColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: '#fff', fontSize: 11 },
    }),
    formatter: '{b}: {c} ({d}%)',
  }
}

/**
 * 侧栏小饼图 tooltip 定位算法：将鼠标坐标转换为视口绝对坐标，
 *   并在溢出视口边缘时翻转方向，避免被 overflow 裁切。
 *
 * @param point 鼠标在图表容器内的相对坐标 [x, y]
 * @param rect 图表容器在视口中的位置与尺寸
 * @param size tooltip 内容尺寸与视口尺寸
 * @returns tooltip 在视口中的绝对坐标 [x, y]
 */
function sidebarPieTooltipPosition(
  point: number[],
  _params: unknown,
  _dom: HTMLDivElement | null,
  rect: { x: number; y: number; width: number; height: number } | null,
  size: { contentSize: number[]; viewSize: number[] },
): number[] {
  const [mouseX, mouseY] = point
  const absX = (rect?.x ?? 0) + mouseX
  const absY = (rect?.y ?? 0) + mouseY
  const boxWidth = size.contentSize[0] ?? 0
  const boxHeight = size.contentSize[1] ?? 0
  const viewWidth = size.viewSize[0] ?? window.innerWidth
  const viewHeight = size.viewSize[1] ?? window.innerHeight

  let posX = absX + 10
  let posY = absY - boxHeight - 8

  if (posX + boxWidth > viewWidth - 8) {
    posX = Math.max(8, absX - boxWidth - 10)
  }
  if (posY < 8) {
    posY = absY + 12
  }
  if (posY + boxHeight > viewHeight - 8) {
    posY = Math.max(8, viewHeight - boxHeight - 8)
  }

  return [posX, posY]
}

/** 侧栏小饼图：tooltip 挂到 body + 视口内定位，避免 overflow 裁切 */
export function deviceSidebarPieTooltip(): NonNullable<EChartsCoreOption['tooltip']> {
  return {
    ...devicePieTooltip(),
    renderMode: 'html',        // 以 HTML 渲染，脱离父容器
    appendTo: 'body',          // 挂载到 body 避免被父级 overflow 裁切
    confine: false,            // 不限制在图表容器内
    transitionDuration: 0.15,
    extraCssText: 'z-index: 13100; pointer-events: none; box-shadow: 0 8px 24px rgba(0,0,0,0.35);',
    position: sidebarPieTooltipPosition,
  }
}

/** 笛卡尔坐标系网格配置（含标签包含模式，兼容 ECharts 6） */
export function deviceChartGrid(options?: {
  top?: number
}): NonNullable<EChartsCoreOption['grid']> {
  return {
    left: 40,
    right: 16,
    top: options?.top ?? 28,
    bottom: 28,
    // ECharts 6：等同已废弃的 grid.containLabel
    outerBoundsMode: 'same',
    outerBoundsContain: 'axisLabel',
  }
}

/** 图例配置（顶部居中，小字号） */
export function deviceChartLegend(top = 2): NonNullable<EChartsCoreOption['legend']> {
  return {
    top,
    left: 'center',
    itemWidth: 10,
    itemHeight: 8,
    itemGap: 14,
    textStyle: { color: DEVICE_CHART_COLORS.axis, fontSize: 10 },
  }
}

/** 类目轴（X 轴）配置 */
export function deviceChartXAxis(data: string[]): NonNullable<EChartsCoreOption['xAxis']> {
  return {
    type: 'category',
    data,
    axisLine: { lineStyle: { color: DEVICE_CHART_COLORS.grid } },
    axisLabel: { color: DEVICE_CHART_COLORS.axis, fontSize: 10 },
    axisTick: { show: false },
  }
}

/** 数值轴（Y 轴）配置（虚线分割线 + 可选轴名） */
export function deviceChartYAxis(name?: string): NonNullable<EChartsCoreOption['yAxis']> {
  return {
    type: 'value',
    name,
    nameTextStyle: { color: DEVICE_CHART_COLORS.axisName, fontSize: 10 },
    axisLine: { show: false },
    splitLine: { lineStyle: { color: DEVICE_CHART_COLORS.grid, type: 'dashed' } },
    axisLabel: { color: DEVICE_CHART_COLORS.axis, fontSize: 10 },
  }
}

/** 图表基础配置（透明背景 + 600ms 动画） */
export function deviceChartBase(): EChartsCoreOption {
  return {
    backgroundColor: 'transparent',
    animationDuration: 600,
  }
}

/**
 * 生成 ECharts 垂直渐变填充（面积图 / 柱状图顶部到末端的柔和多彩效果）。
 * 以 object 形式声明，无需 import echarts.graphic。
 *
 * @param color 渐变起始色（十六进制）
 * @param fromOpacity 顶部不透明度（默认 0.32）
 * @param toOpacity 底部不透明度（默认 0.02）
 */
export function chartVerticalGradient(
  color: string,
  fromOpacity = 0.32,
  toOpacity = 0.02,
): {
  type: 'linear'
  x: number
  y: number
  x2: number
  y2: number
  colorStops: Array<{ offset: number; color: string }>
} {
  return {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: hexWithOpacity(color, fromOpacity) },
      { offset: 1, color: hexWithOpacity(color, toOpacity) },
    ],
  }
}