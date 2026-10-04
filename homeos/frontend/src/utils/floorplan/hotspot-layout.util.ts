/**
 * 户型图热点布局度量工具
 *
 * 职责：
 * - 维护热点圆点 / 图标 / 标签的像素常量（与 floorplan-hotspot.css 对齐）。
 * - 提供热点主体尺寸度量（圆点 / 自定义图标 / 徽章三种形态）。
 * - 提供图标 / 圆点中心锚点布局（含命中区域半宽 / 半高，标签绝对定位不参与高度）。
 * - 提供百分比坐标钳制与锚点部件解析。
 *
 * 依赖：@/types/layout 的 FloorWidget 类型。
 *
 * 注意：像素常量 / 坐标 / 缩放为运行时数值，不翻译。
 */
import type { FloorWidget } from '@/types/layout'

/** 与 floorplan-hotspot.css / --premium-fs-micro 对齐 */
export const HOTSPOT_DOT_PX = 20
const HOTSPOT_ICON_BASE_PX = 52
const HOTSPOT_LABEL_GAP_PX = 4
/** HOTSPOT_LABEL_FONT_PX：常量，取值语义见定义处。 */
export const HOTSPOT_LABEL_FONT_PX = 12
const HOTSPOT_LABEL_LINE_PX = 12

/** 钳制到 [0,100] 的百分比坐标，保留两位小数 */
function clampHotspotPct(v: number) {
  return Math.max(0, Math.min(100, Math.round(v * 100) / 100))
}

/**
 * 度量热点主体尺寸：根据 widget 类型决定圆点 / 自定义图标 / 徽章三种形态的 bodyH 与 iconSize。
 *
 * @param widget 部件（含 type / iconScale / stateIcons）
 * @returns 含 scale / bodyH / iconSize / isBadge / hasCustomIcon 的度量结果
 */
function measureHotspotBody(widget: Pick<FloorWidget, 'type' | 'iconScale' | 'stateIcons'>) {
  const scale = (widget.iconScale || 100) / 100
  const isBadge = widget.type === 'BadgeWidget'
  const hasCustomIcon = Boolean(widget.stateIcons && Object.keys(widget.stateIcons).length)
  let bodyH = HOTSPOT_DOT_PX
  if (hasCustomIcon || isBadge) {
    bodyH = isBadge && !hasCustomIcon ? HOTSPOT_LABEL_FONT_PX + 6 : HOTSPOT_ICON_BASE_PX * scale
  }
  const iconSize = hasCustomIcon ? HOTSPOT_ICON_BASE_PX * scale : HOTSPOT_DOT_PX
  return { scale, bodyH, iconSize, isBadge, hasCustomIcon }
}

/**
 * 图标 / 圆点中心锚点布局（标签绝对定位，不参与高度）。
 *
 * @param widget 部件
 * @param _dpr 设备像素比（保留参数，目前未使用）
 * @returns 含 bodyH / iconSize / 命中区域半宽半高 / 标签 Y 等的布局对象
 */
export function measureHotspotLayout(
  widget: Pick<FloorWidget, 'type' | 'iconScale' | 'stateIcons'>,
  _dpr = 1,
) {
  const body = measureHotspotBody(widget)
  return {
    ...body,
    labelH: HOTSPOT_LABEL_LINE_PX,
    gap: HOTSPOT_LABEL_GAP_PX,
    iconCenterY: 0,
    labelY: body.bodyH / 2 + HOTSPOT_LABEL_GAP_PX + HOTSPOT_LABEL_LINE_PX / 2,
    bodyTop: -body.bodyH / 2,
    hitHalfW: Math.max(28 * body.scale, body.iconSize / 2 + 8),
    hitHalfH: body.bodyH / 2 + 4,
  }
}

/** 将存储坐标解析为图标中心锚点 */
export function resolveHotspotAnchorPct(widget: Pick<FloorWidget, 'xPct' | 'yPct'>) {
  return {
    xPct: Number(widget.xPct) || 0,
    yPct: Number(widget.yPct) || 0,
  }
}

/** 保存前确保 icon 锚点标记写入 JSON */
function prepareFloorWidgetsForPersistence(widgets: FloorWidget[] = []): FloorWidget[] {
  return widgets.map((w) => ({ ...w, hotspotAnchor: 'icon' as const }))
}

export function prepareLayoutHotspotAnchorsForSave(layout: {
  floors?: Array<{ widgets?: FloorWidget[] }>
  hotspotAnchorConvention?: string
}) {
  layout.hotspotAnchorConvention = 'icon'
  for (const floor of layout.floors || []) {
    if (!Array.isArray(floor.widgets)) continue
    floor.widgets = prepareFloorWidgetsForPersistence(floor.widgets)
  }
}

/** 计算拖拽抓取偏移（不修改 widget） */
export function computeHotspotDragGrab(
  widget: FloorWidget,
  metrics: FloorplanLayoutMetrics,
  clientX: number,
  clientY: number,
) {
  const anchor = resolveHotspotAnchorPct(widget)
  const pointer = clientToFloorLayoutPct(clientX, clientY, metrics)
  return {
    anchor,
    grabOffsetXpct: pointer.xPct - anchor.xPct,
    grabOffsetYpct: pointer.yPct - anchor.yPct,
  }
}

export type FloorplanLayoutMetrics = {
  layoutW: number
  layoutH: number
  rect: DOMRect
  scaleX: number
  scaleY: number
}

/** 户型图容器布局尺寸（CSS % 基准）与视口缩放比 */
export function getFloorplanLayoutMetrics(
  element: HTMLElement | null | undefined,
): FloorplanLayoutMetrics | null {
  if (!element) return null
  const layoutW = element.clientWidth
  const layoutH = element.clientHeight
  if (layoutW <= 0 || layoutH <= 0) return null
  const rect = element.getBoundingClientRect()
  const scaleX = rect.width > 0 ? rect.width / layoutW : 1
  const scaleY = rect.height > 0 ? rect.height / layoutH : 1
  return { layoutW, layoutH, rect, scaleX, scaleY }
}

/** 视口坐标 → 户型图内 CSS 百分比（与 left/top % 一致） */
export function clientToFloorLayoutPct(
  clientX: number,
  clientY: number,
  metrics: FloorplanLayoutMetrics,
) {
  const layoutX = (clientX - metrics.rect.left) / metrics.scaleX
  const layoutY = (clientY - metrics.rect.top) / metrics.scaleY
  return {
    xPct: clampHotspotPct((layoutX / metrics.layoutW) * 100),
    yPct: clampHotspotPct((layoutY / metrics.layoutH) * 100),
  }
}

export function floorLayoutPctFromPointer(
  clientX: number,
  clientY: number,
  metrics: FloorplanLayoutMetrics,
  grabOffsetXpct: number,
  grabOffsetYpct: number,
) {
  const pointer = clientToFloorLayoutPct(clientX, clientY, metrics)
  return {
    xPct: clampHotspotPct(pointer.xPct - grabOffsetXpct),
    yPct: clampHotspotPct(pointer.yPct - grabOffsetYpct),
  }
}
