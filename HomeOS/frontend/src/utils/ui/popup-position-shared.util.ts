/**
 * 弹窗定位共享工具。
 *
 * 职责：
 * - 读取 #teleport-target 在定位坐标系中的尺寸（处理等比缩放）
 * - 读取户型图显示区在同一坐标系中的安全边界
 * - 收集锚点的可滚动祖先（用于监听非冒泡的 scroll 事件）
 * - 把 ref / computed / 函数 / 纯数字等多种形态统一解析为数字
 *
 * 依赖：@/composables/ui/useScaling 的 currentScale / activeDesignWidth / activeDesignHeight；
 *       popup-position-dropdown.util 的 getTeleportLiveScale（DOM 实测 scale）。
 */

import { currentScale, activeDesignWidth, activeDesignHeight } from '@/composables/ui/useScaling'
import {
  getTeleportShellRect,
  getTeleportLiveScale,
  shouldUseTeleportCanvasCoords,
} from '@/utils/ui/popup-position-dropdown.util'
import type { PopupPlacementBounds } from '@/utils/ui/popup-placement.util'

/** 读取 #teleport-target 在定位坐标系中的尺寸（缩放时 shell 大于设计稿 content 区） */
export function getTeleportContainerSize() {
  const tel = typeof document !== 'undefined' ? document.getElementById('teleport-target') : null
  if (tel) {
    const s = getTeleportLiveScale(tel)
    const cr = tel.getBoundingClientRect()
    return { cw: cr.width / s, ch: cr.height / s }
  }
  const s = currentScale.value || 1
  if (s !== 1) {
    return { cw: activeDesignWidth.value, ch: activeDesignHeight.value }
  }
  return {
    cw: typeof window !== 'undefined' ? window.innerWidth : 1920,
    ch: typeof window !== 'undefined' ? window.innerHeight : 1080,
  }
}

/** 视口矩形 → 弹窗 fixed 坐标系 */
function viewportRectToPopupCoords(rect: DOMRectReadOnly) {
  const tel = typeof document !== 'undefined' ? document.getElementById('teleport-target') : null
  if (shouldUseTeleportCanvasCoords(tel)) {
    const cr = getTeleportShellRect(tel)
    if (cr) {
      const s = getTeleportLiveScale(tel)
      return {
        left: (rect.left - cr.left) / s,
        top: (rect.top - cr.top) / s,
        right: (rect.right - cr.left) / s,
        bottom: (rect.bottom - cr.top) / s,
      }
    }
  }
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  }
}

/**
 * 户型图 / 仪表盘显示区边界（弹窗不应越出）。
 * 优先 `.floorplan-wrapper`，其次 `.floorplan-area`；找不到则退回整容器。
 */
export function getPopupPlacementBounds(): PopupPlacementBounds & { cw: number; ch: number } {
  const { cw, ch } = getTeleportContainerSize()
  const full = { left: 0, top: 0, right: cw, bottom: ch, cw, ch }
  if (typeof document === 'undefined') return full

  const el =
    (document.querySelector('.floorplan-wrapper') as HTMLElement | null) ||
    (document.querySelector('.floorplan-area') as HTMLElement | null)
  if (!el) return full

  const box = viewportRectToPopupCoords(el.getBoundingClientRect())
  const left = Math.max(0, Math.min(box.left, cw))
  const top = Math.max(0, Math.min(box.top, ch))
  const right = Math.max(left + 1, Math.min(box.right, cw))
  const bottom = Math.max(top + 1, Math.min(box.bottom, ch))
  return { left, top, right, bottom, cw, ch }
}

/** 锚点向上收集可滚动祖先（scroll 事件不冒泡，需单独监听） */
export function collectOverflowScrollParents(el: HTMLElement | null) {
  const parents: HTMLElement[] = []
  let node = el?.parentElement ?? null
  while (node) {
    const style = getComputedStyle(node)
    if (/auto|scroll|overlay/.test(style.overflowY) || /auto|scroll|overlay/.test(style.overflowX))
      parents.push(node)
    node = node.parentElement
  }
  return parents
}

/** 弹窗数值入参的联合类型（支持数字 / 字符串 / ref / computed / 函数 / { value }） */
export type PopupNumericInput =
  | number
  | string
  | null
  | undefined
  | (() => unknown)
  | { value: unknown }

/** 将各种类型的值统一解析为数字（ref / computed / function / 纯数字） */
export function resolvePopupNumeric(v: PopupNumericInput, fallback = 50) {
  if (typeof v === 'function') return Number(v()) || fallback
  if (v != null && typeof v === 'object' && 'value' in v) return Number(v.value) || fallback
  return Number(v) || fallback
}
