/**
 * 图表公共原语：共享轴样式常量、空态占位 graphic、深色 tooltip 工厂、线性渐变。
 *
 * 所属模块：图表 / 公共原语
 * 职责：收敛各图表构建器重复手写的 axisLine / splitLine / axisLabel 常量、
 *   空态占位 graphic、tooltip 深色骨架与 colorStops 渐变对象；
 *   所有工厂不改变既有 option 值（色值、字号、字重逐字保留）。
 * 依赖：无（纯数据 / 纯函数，勿引入 echarts 运行时，保持模块轻量）。
 */

/** 共享轴线样式（类目轴 axisLine，低透明度） */
export const axisLineStyle = { lineStyle: { color: 'rgba(255,255,255,0.07)' } }

/** 共享分割线样式（虚线 + 低透明度） */
export const splitLineStyle = {
  lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' as const },
}

/** 共享轴标签样式（墙面可读；额外属性用展开合并） */
export const axisLabelStyle = { color: 'rgba(255,255,255,0.58)', fontSize: 9 }

/** 空态占位文本样式覆盖项 */
export interface ChartEmptyGraphicStyle {
  fill?: string
  fontSize?: number
  fontWeight?: number
}

/**
 * 空态占位文本 graphic 元素（居中；fill / fontSize / fontWeight 可覆盖）。
 *
 * @param text 占位文案
 * @param style 样式覆盖（默认 fill rgba(255,255,255,0.55)、fontSize 12、fontWeight 650）
 */
export function chartEmptyGraphicElement(text: string, style: ChartEmptyGraphicStyle = {}) {
  return {
    type: 'text' as const,
    left: 'center' as const,
    top: 'middle' as const,
    style: {
      text,
      fill: style.fill ?? 'rgba(255,255,255,0.55)',
      fontSize: style.fontSize ?? 12,
      fontWeight: style.fontWeight ?? 650,
    },
  }
}

/**
 * 空态占位 graphic 数组（无数据时挂到 option.graphic）。
 *
 * @param text 占位文案（默认「暂无数据」）
 * @param style 样式覆盖（透传 chartEmptyGraphicElement）
 */
export function chartEmptyGraphic(text?: string, style?: ChartEmptyGraphicStyle) {
  return [chartEmptyGraphicElement(text ?? '暂无数据', style)]
}

/** 深色 tooltip 工厂属性（borderWidth / padding / extraCssText 未传时不输出该键） */
export interface ChartTooltipOptions {
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
