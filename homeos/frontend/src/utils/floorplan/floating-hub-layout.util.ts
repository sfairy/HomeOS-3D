/**
 * 户型图浮动 Hub / 部件布局工具
 *
 * 职责：
 * - 维护浮动部件居中 transform 常量。
 * - 提供百分比坐标钳制（保留 1 位小数，钳制到 [0,100]）。
 * - 提供根矩形合法性判定、部件百分比净化、矩形中心 / 边缘锚点反推等工具，
 *   供浮动 Hub 拖拽与布局定位使用。
 *
 * 依赖：@/utils/registry/widget-registry 的 isFloatingPanelType；@/types/layout。
 *
 * 注意：坐标 / 像素 / transform 字符串为运行时数值 / CSS 字面量，不翻译。
 */
import { isFloatingPanelType } from '@/utils/registry/widget-registry'
import type { FloatingWidget } from '@/types/layout'

/** 浮动部件居中 transform 常量 */
const AFH_CENTER_TRANSFORM = 'translate(-50%, -50%)'

/**
 * 钳制百分比坐标到 [0,100]，保留 1 位小数；非有限值回退到 fallback。
 *
 * @param value 原始百分比
 * @param fallback 非有限值时的回退（默认 50）
 * @returns 钳制后的百分比
 */
function clampAfhPct(value: number, fallback = 50) {
  if (!Number.isFinite(value)) return fallback
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10
}

/**
 * 判定根矩形是否有效（宽高均 > 0）。
 *
 * @param root 根矩形
 * @returns true 表示有效
 */
export function isValidRootRect(root: DOMRect) {
  return root.width > 0 && root.height > 0
}

/**
 * 净化部件百分比坐标（原地写回）：xPct / yPct 非法时回退到对应 fallback。
 *
 * @param widget 部件（仅取 xPct / yPct）
 * @param fallbackX xPct 回退值（默认 50）
 * @param fallbackY yPct 回退值（默认 50）
 */
export function sanitizeWidgetPct(
  widget: Pick<FloatingWidget, 'xPct' | 'yPct'>,
  fallbackX = 50,
  fallbackY = 50,
) {
  widget.xPct = clampAfhPct(Number(widget.xPct), fallbackX)
  widget.yPct = clampAfhPct(Number(widget.yPct), fallbackY)
}

/**
 * 由矩形中心相对根矩形的位置反推百分比坐标。
 *
 * @param rect 目标矩形
 * @param root 根矩形
 * @returns 中心点的 { xPct, yPct }
 */
export function rectCenterPct(rect: DOMRect, root: DOMRect) {
  return {
    xPct: clampAfhPct(((rect.left + rect.width / 2 - root.left) / root.width) * 100),
    yPct: clampAfhPct(((rect.top + rect.height / 2 - root.top) / root.height) * 100),
  }
}

/** 与 getWidgetAnchorTransform 阈值一致：根据视觉包围盒反推边缘锚点坐标 */
export function getPanelEdgeAnchorFromRect(rect: DOMRect, root: DOMRect) {
  if (!isValidRootRect(root) || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
    return { xPct: 50, yPct: 50 }
  }
  const toPctX = (px: number) => ((px - root.left) / root.width) * 100
  const toPctY = (px: number) => ((px - root.top) / root.height) * 100

  const left = toPctX(rect.left)
  const right = toPctX(rect.right)
  const top = toPctY(rect.top)
  const bottom = toPctY(rect.bottom)
  const cx = toPctX(rect.left + rect.width / 2)
  const cy = toPctY(rect.top + rect.height / 2)

  let xPct = cx
  let yPct = cy
  if (cy < 14) yPct = top
  else if (cy > 86) yPct = bottom
  if (cx < 16) xPct = left
  else if (cx > 84) xPct = right

  return { xPct: clampAfhPct(xPct), yPct: clampAfhPct(yPct) }
}

export function getWidgetAnchorTransform(widget: Pick<FloatingWidget, 'type' | 'xPct' | 'yPct'>) {
  const isPanel = isFloatingPanelType(widget.type)
  if (!isPanel) return AFH_CENTER_TRANSFORM

  let tx = -50
  let ty = -50
  if (widget.yPct < 14) ty = 0
  else if (widget.yPct > 86) ty = -100
  if (widget.xPct < 16) tx = 0
  else if (widget.xPct > 84) tx = -100
  return `translate(${tx}%, ${ty}%)`
}

export function anchorPctFromPointer(
  clientX: number,
  clientY: number,
  rootRect: DOMRect,
  grabOffsetPxX: number,
  grabOffsetPxY: number,
  fallback = { xPct: 50, yPct: 50 },
) {
  if (!isValidRootRect(rootRect)) return fallback
  const anchorX = clientX - grabOffsetPxX
  const anchorY = clientY - grabOffsetPxY
  return {
    xPct: clampAfhPct(((anchorX - rootRect.left) / rootRect.width) * 100, fallback.xPct),
    yPct: clampAfhPct(((anchorY - rootRect.top) / rootRect.height) * 100, fallback.yPct),
  }
}

export function popupAnchorFromWidgetRect(rect: DOMRect) {
  return {
    rawX: rect.left + rect.width / 2,
    rawY: rect.top + rect.height / 2 + 30,
  }
}
