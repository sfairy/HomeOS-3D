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
