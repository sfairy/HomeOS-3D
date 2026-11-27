import * as echarts from 'echarts/core'
import type { ECharts, EChartsCoreOption, EChartsInitOpts } from 'echarts/core'
import { hexWithOpacity } from '@/kernel/ui/color'
import { LineChart, BarChart, HeatmapChart, PieChart, RadarChart, GaugeChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  DataZoomComponent,
  GraphicComponent,
  RadarComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

/** 图表公共原语：共享轴样式常量、空态占位 graphic、深色 tooltip 工厂、线性渐变。 */

/** 共享轴线样式（类目轴 axisLine，低透明度） */
export const axisLineStyle = { lineStyle: { color: 'rgba(255,255,255,0.07)' } }

/** 共享分割线样式（虚线 + 低透明度） */
export const splitLineStyle = {
  lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' as const },
}

/** 深色 tooltip 工厂属性（borderWidth / padding / extraCssText 未传时不输出该键） */
interface ChartTooltipOptions {
  borderColor: string
  textStyle: { color: string; fontSize: number; fontWeight?: number }
  borderWidth?: number
  padding?: [number, number]
  extraCssText?: string
}

/**
 * 深色 tooltip 工厂：背景色参数化（各模块深色底色不同，逐字保留）。
 *
 * @param bg 背景色
 * @param options 边框 / 内边距 / 文字样式等其余属性
 */
export function createChartTooltip(bg: string, options: ChartTooltipOptions) {
  return {
    backgroundColor: bg,
    borderColor: options.borderColor,
    ...(options.borderWidth != null && { borderWidth: options.borderWidth }),
    ...(options.padding && { padding: options.padding }),
    ...(options.extraCssText && { extraCssText: options.extraCssText }),
    textStyle: options.textStyle,
  }
}

/**
 * 通用线性渐变：colorStops 色值原样保留（适合十六进制透明度后缀、
 * 混合色值格式等 chartVerticalGradient 无法逐字还原的场合）。
 *
 * @param stops [offset, color] 元组数组（offset 升序）
 * @param direction 渐变方向，默认垂直（上 → 下）
 */
export function chartLinearGradient(
  stops: ReadonlyArray<readonly [number, string]>,
  direction: 'vertical' | 'horizontal' = 'vertical',
) {
  const horizontal = direction === 'horizontal'
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: horizontal ? 1 : 0,
    y2: horizontal ? 0 : 1,
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
  }
}

/** 类目轴标签常规色（时序 / 数值轴） */
export const CHART_LABEL_COLOR = 'rgba(255,255,255,0.58)'

/** 类目轴标签次要色（横向条形图的类目名，比常规再淡一档） */
export const CHART_LABEL_MUTED = 'rgba(255,255,255,0.55)'

/** 饼图 / 横向条形图「无数据」占位扇区与占位条的颜色 */
export const CHART_EMPTY_COLOR = '#64748b'

/**
 * 计数类 Y 轴上限：至少 1，避免全 0 时图表塌缩成一条线。
 *
 * 历史调用点经 `useEchartsHost.yMax` 使用，行为与参数逐字一致。
 */
export function countYMax(values: readonly number[]): number {
  return Math.max(...values, 0, 1)
}

/**
 * 柱/线渐变：顶部实色到底部同色 66 透明。
 *
 * 与 `chartLinearGradient([[0, color], [1, `${color}66`]])` 等价，
 * 这里只收一个入参 —— 调用点此前各自手写四行渐变对象。
 */
export function barGradient(color: string) {
  return chartLinearGradient([
    [0, color],
    [1, `${color}66`],
  ])
}

/** 计数类目轴（横轴，桶标签）：轴线低透明度、刻度隐藏、标签可自适应稀疏。 */
export interface CountCategoryAxisOptions {
  /** 桶数多时稀疏 + 旋转（默认 false：标签固定不旋转、全部显示）。 */
  adaptive?: boolean
  /** 标签字号（默认 10；自适应形态用 9 以容纳更密的标签）。 */
  labelFontSize?: number
  /** 标签颜色（默认常规色；部分页面的类目名用次要色）。 */
  labelColor?: string
  /** 超过该桶数才稀疏标签（默认 12，仅 adaptive 时生效）。 */
  sparseThreshold?: number
  /** 超过该桶数才旋转 32°（默认 10，仅 adaptive 时生效）。 */
  rotateThreshold?: number
  /** 是否显示轴线（默认 true；横向条形图 / 深度分桶等场景关掉）。 */
  showAxisLine?: boolean
  /** 是否隐藏刻度（默认 true；关掉则交由 ECharts 默认，即显示刻度）。 */
  hideAxisTick?: boolean
}

/**
 * 计数类目轴：`type: 'category'` + 共享轴线 + 隐藏刻度。
 *
 * @param labels 桶标签
 * @param options 自适应 / 字号 / 标签色 / 阈值 / 轴线与刻度开关
 */
export function countCategoryAxis(labels: readonly string[], options: CountCategoryAxisOptions = {}) {
  const {
    adaptive = false,
    labelFontSize = 10,
    labelColor = CHART_LABEL_COLOR,
    sparseThreshold = 12,
    rotateThreshold = 10,
    showAxisLine = true,
    hideAxisTick = true,
  } = options
  const axisLabel: Record<string, unknown> = { color: labelColor, fontSize: labelFontSize }
  if (adaptive) {
    const count = labels.length
    axisLabel.interval = count > sparseThreshold ? Math.floor(count / 8) : 0
    axisLabel.rotate = count > rotateThreshold ? 32 : 0
  }
  return {
    type: 'category' as const,
    data: [...labels],
    axisLine: showAxisLine ? axisLineStyle : { show: false },
    ...(hideAxisTick && { axisTick: { show: false } }),
    axisLabel,
  }
}

/** 类目轴（横向条形图的纵轴）：只留标签，轴线与刻度都不画。 */
export function rankCategoryAxis(labels: readonly string[]) {
  return {
    type: 'category' as const,
    data: [...labels],
    axisLine: { show: false },
    axisLabel: { color: CHART_LABEL_MUTED, fontSize: 10 },
  }
}

/** 计数数值轴：从 0 起、上限取 `countYMax`、虚线分割线、标签常规色。 */
export interface CountValueAxisOptions {
  /** 是否强制整数刻度（默认 true：计数图不该出现 0.5 个事件）。 */
  minInterval?: boolean
  /** 是否保留 Y 轴轴线（默认 false = 隐藏；少数图沿用 ECharts 默认的画法）。 */
  showAxisLine?: boolean
}

/**
 * 计数数值轴：纵向柱图的 Y 轴，也用作横向条形图的 X 轴。
 *
 * @param values 参与求上限的取值序列
 * @param options 整数刻度 / 轴线开关
 */
export function countValueAxis(values: readonly number[], options: CountValueAxisOptions = {}) {
  const { minInterval = true, showAxisLine = false } = options
  return {
    type: 'value' as const,
    min: 0,
    max: countYMax(values),
    ...(minInterval && { minInterval: 1 }),
    axisLine: { show: showAxisLine },
    splitLine: splitLineStyle,
    axisLabel: { color: CHART_LABEL_COLOR, fontSize: 10 },
  }
}

/**
 * 环形 / 饼图系列：统一的半径、中心、标签与描边。
 *
 * @param data 扇区数据（`{ name, value, itemStyle? }`）
 * @param radius 半径区间，默认 `['42%', '68%']`
 */
export function pieSeries(data: readonly unknown[], radius: readonly [string, string] = ['42%', '68%']) {
  return {
    type: 'pie' as const,
    radius: [...radius],
    center: ['50%', '54%'],
    label: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: 600 },
    itemStyle: { borderRadius: 4, borderColor: 'rgba(0,0,0,0.35)', borderWidth: 1 },
    data: [...data],
  }
}

/** 空态饼图数据：一条灰色占位扇区，避免全空时图表只剩标题。 */
export function pieEmptyData(label = '暂无') {
  return [{ name: label, value: 1, itemStyle: { color: CHART_EMPTY_COLOR } }]
}

/**
 * 设备侧 ECharts 容器就绪检测与懒加载初始化（与 DeviceAnalyticsPanel 等手写逻辑对齐）。
 */

function chartDomReady(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false
  const { clientWidth, clientHeight } = el
  return clientWidth > 0 && clientHeight > 0
}

/**
 * 容器就绪时在动态 import 后幂等 getOrInitChart；await 期间可通过 isActive 放弃初始化。
 */
export async function ensureDeviceChartOnElement(
  el: HTMLElement | null,
  instance: ECharts | null,
  isActive?: () => boolean,
): Promise<ECharts | null> {
  if (!chartDomReady(el)) return instance
  if (instance) return instance
  const mod = await import('@/kernel/chart')
  if (isActive && !isActive()) return null
  if (!chartDomReady(el)) return null
  return mod.getOrInitChart(el)
}

/** 设备页图表说明文案（统一维护，便于理解曲线含义） */

export const DEVICE_CHART_COPY = {
  usageTrend: {
    title: '每日使用趋势',
    desc: '柱状图 = 当天开关/切换次数；折线 = 当天累计开启时长（分钟）。适用于灯、开关等可控实体。',
  },
  usageHourly: {
    title: '一天内活跃时段',
    desc: '将所选周期内的事件按「小时」累加，反映设备常在哪些时段被使用（非单日曲线）。',
  },
  usageRadar: {
    title: '与同域设备对比',
    desc: '雷达三维：切换次数、运行时长、事件数。蓝区为本设备，紫区为同域实体平均值。',
  },
  historyTrend: {
    title: '状态变更轨迹',
    desc: '纵轴为状态类别（非数值高低），横轴为时间。每个点表示一次状态或属性变更。',
  },
  globalTrend: {
    title: '全局使用趋势',
    desc: '全屋可控实体的每日切换次数（左轴）与运行总时长（右轴，分钟）。',
  },
  domainPie: {
    title: '域使用分布',
    desc: '按实体域统计切换次数占比，点击扇区可筛选对应域。',
  },
  activityHeatmap: {
    title: '活跃热力图',
    desc: '行 = 设备，列 = 日期，颜色越深表示当天切换越频繁。点击格子可定位设备。',
  },
  activityRank: {
    title: '设备活跃排行',
    desc: '按切换次数排序，反映近期最常被操作的实体。',
  },
  healthTrend: {
    title: '健康趋势',
    desc: '基于浏览器本地每日快照：离线实体数与低电量实体数变化。',
  },
  eventsByDomain: {
    title: '事件按域分布',
    desc: '所选周期内状态/属性变更事件，按实体域汇总。',
  },
  statusPie: {
    title: '在线状态',
    desc: '当前已加载实体中，在线 vs 离线（unavailable/unknown）占比。',
  },
  domainCountPie: {
    title: '实体域占比',
    desc: '当前已加载实体按域（light、sensor 等）的数量分布。',
  },
} as const

/**
 * 双轴折线/柱线组合图 tooltip 格式化。
 *
 * @param params ECharts tooltip 回调参数（单个或数组）
 * @param series 各系列元信息（name + unit），用于匹配并拼接单位
 * @returns HTML 字符串：表头（axisValue）+ 各系列名值与单位
 */
export function formatDualMetricTooltip(params: unknown, series: Array<{ name: string; unit: string }>): string {
  const items = Array.isArray(params) ? params : [params]
  if (!items.length) return ''
  const header = String((items[0] as { axisValue?: string }).axisValue ?? '')
  const lines = items.map((raw) => {
    const item = raw as {
      seriesName?: string
      value?: number | string
      color?: string
    }
    const idx = series.findIndex((s) => s.name === item.seriesName)
    const unit = idx >= 0 ? series[idx].unit : ''
    const val = item.value ?? '—'
    // 不用 ECharts 的 ``item.marker``：那是它生成的带行内 style 的 <span>，会被 CSP 拦下。
    // 自绘 SVG 圆点，颜色走 fill 呈现属性。
    const dotColor = typeof item.color === 'string' && item.color ? item.color : 'currentColor'
    const dot = `<svg class="chart-tip__dot" viewBox="0 0 8 8" aria-hidden="true"><rect width="8" height="8" rx="2" fill="${dotColor}"/></svg>`
    return `${dot}${item.seriesName ?? ''}：<b>${val}${unit ? ` ${unit}` : ''}</b>`
  })
  return `<div class="chart-tip__caption">${header}</div>${lines.join('<br/>')}`
}

/**
 * 时段分布 tooltip 格式化。
 *
 * @param hour 起始小时（0–23）
 * @param count 该时段累计事件数
 * @param totalHours 统计窗口总小时数（用于推算天数）
 * @returns HTML 字符串：天数提示 + 时段区间 + 事件次数 + 说明
 */
export function formatHourlyBucketTooltip(hour: number, count: number, totalHours: number): string {
  const next = (hour + 1) % 24
  return [
    `<div class="chart-tip__caption chart-tip__caption--tight">近 ${totalHours / 24} 天累计</div>`,
    `<div>${String(hour).padStart(2, '0')}:00 – ${String(next).padStart(2, '0')}:00</div>`,
    `<div>事件 <b>${count}</b> 次</div>`,
    '<div class="chart-tip__footnote">反映该时段的使用习惯</div>',
  ].join('')
}

/**
 * 热力图 tooltip 格式化。
 *
 * @param dayLabel 日期标签
 * @param deviceName 设备名
 * @param count 切换次数
 * @returns HTML 字符串：日期 + 设备名 + 切换次数
 */
export function formatHeatmapTooltip(dayLabel: string, deviceName: string, count: number): string {
  return [
    `<div class="chart-tip__caption chart-tip__caption--tight">${dayLabel}</div>`,
    `<div>${deviceName}</div>`,
    `<div>切换 <b>${count}</b> 次</div>`,
  ].join('')
}

/** 设备页 ECharts 主题：颜色常量 + tooltip / grid / legend / axis 工厂函数。 */

/** 设备页图表配色常量（accent / 状态色 / 网格 / 轴色等） */
export const DEVICE_CHART_COLORS = {
  accent: '#38bdf8', // 主强调色（天蓝）
  green: '#34d399', // 健康 / 在线色
  red: '#f87171', // 告警 / 离线色
  amber: '#fbbf24', // 警示色
  purple: '#a78bfa', // 对比色（同域平均等）
  grid: 'rgba(255,255,255,0.06)', // 网格线色
  /** 与 --premium-border-strong 数值一致（ECharts 不支持 CSS var） */
  sliceBorder: 'rgba(255,255,255,0.08)', // 饼图扇区边框色
  axis: 'rgba(255,255,255,0.58)', // 轴标签色
  axisName: 'rgba(255,255,255,0.62)', // 轴名色
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
    renderMode: 'html', // 以 HTML 渲染，脱离父容器
    appendTo: 'body', // 挂载到 body 避免被父级 overflow 裁切
    confine: false, // 不限制在图表容器内
    transitionDuration: 0.15,
    extraCssText: 'z-index: 13100; pointer-events: none; box-shadow: 0 8px 24px rgba(0,0,0,0.35);',
    position: sidebarPieTooltipPosition,
  }
}

/** 笛卡尔坐标系网格配置（含标签包含模式，兼容 ECharts 6） */
export function deviceChartGrid(options?: { top?: number }): NonNullable<EChartsCoreOption['grid']> {
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

/** ECharts 按需加载入口 */

echarts.use([
  LineChart,
  BarChart,
  HeatmapChart,
  PieChart,
  RadarChart,
  GaugeChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  DataZoomComponent,
  GraphicComponent,
  RadarComponent,
  CanvasRenderer,
])

export default echarts

/**
 * 幂等获取图表实例：容器已有实例时复用，否则新建。
 *
 * ECharts 的 ``init`` 在容器已有实例时会打印
 * ``There is a chart instance already initialized on the dom.`` 并返回既有实例。
 * 因此并发初始化（典型场景：动态 import 期间数据 watch 再次触发渲染，两次调用
 * 都在 await 前通过了 ``if (!chart)`` 判断）会在开发期刷出该告警，
 * 生产构建（``NODE_ENV === 'production'``）下静默。
 *
 * 这里先查 ECharts 自身的 DOM 注册表，命中即复用 —— 与 ``init`` 的既有实例分支
 * 行为完全一致，仅消除告警。所有 ``init`` 调用点应改用本函数。
 *
 * @param dom 图表容器
 * @param theme 主题，默认 undefined
 * @param opts 初始化选项（如显式传入 width / height 以避免测量期告警）
 * @returns 容器上的既有实例，或新建实例
 */
export function getOrInitChart(dom: HTMLElement, theme?: string | object | null, opts?: EChartsInitOpts): ECharts {
  return echarts.getInstanceByDom(dom) ?? echarts.init(dom, theme, opts)
}

/** 各独立 Hub（安防 / 模式日志 / 生活 / 设备）共用的 ECharts 主题。 */

/** Hub 图表配色（继承设备页配色 + 各 Hub accent 色） */
export const HUB_CHART_COLORS = {
  ...DEVICE_CHART_COLORS,
  security: '#fb7185', // 安防 Hub accent
  securitySub: '#f59e0b', // 安防 Hub 次色
  securitySoft: 'rgba(251, 113, 133, 0.35)', // 安防 Hub 半透明色
  homeMode: '#fbbf24', // 在家模式 Hub accent
  homeModeSub: '#fb7185', // 在家模式 Hub 次色
  homeModeSoft: 'rgba(251, 191, 36, 0.35)', // 在家模式半透明色
  life: '#2dd4bf', // 生活 Hub accent
  lifeSub: '#fbbf24', // 生活 Hub 次色
  devices: '#38bdf8', // 设备 Hub accent
  devicesSub: '#22d3ee', // 设备 Hub 次色
}

/** Hub accent 类型枚举 */
type HubChartAccent = 'security' | 'home-mode' | 'life' | 'devices' | 'default'

/** accent 类型 → 十六进制色值映射 */
const ACCENT_HEX: Record<HubChartAccent, string> = {
  security: HUB_CHART_COLORS.security,
  'home-mode': HUB_CHART_COLORS.homeMode,
  life: HUB_CHART_COLORS.life,
  devices: HUB_CHART_COLORS.devices,
  default: HUB_CHART_COLORS.accent,
}

/**
 * 返回指定 accent 类型的十六进制色值。
 * @param accent accent 类型（默认 'default'）
 * @returns 十六进制色值字符串
 */
export function hubAccentColor(accent: HubChartAccent = 'default'): string {
  return ACCENT_HEX[accent] ?? ACCENT_HEX.default
}

/** Hub 通用坐标轴 tooltip（透传 deviceChartTooltip） */
export function hubChartTooltip() {
  return deviceChartTooltip()
}

/** Hub 饼图 tooltip（透传 devicePieTooltip） */
export function hubPieTooltip() {
  return devicePieTooltip()
}

/** Hub 网格配置（透传 deviceChartGrid） */
export function hubChartGrid(options?: { top?: number }) {
  return deviceChartGrid(options)
}

/** Hub 图表基础配置（透传 deviceChartBase） */
export function hubChartBase(): EChartsCoreOption {
  return deviceChartBase()
}
