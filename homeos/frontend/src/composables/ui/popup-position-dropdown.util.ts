/**
 * 锚点下拉菜单的定位计算工具。
 *
 * 职责：
 * - 解析 Teleport 挂载点与 #teleport-target 参考矩形
 * - 在等比缩放（shell 含 transform）时把视口坐标换算为画布坐标系
 * - 按视口剩余空间选择下拉展开方向并计算 fixed 坐标、宽度与最大高度
 *
 * 坐标契约：
 * - getBoundingClientRect() 得到的锚点为视口像素，换算时以 #teleport-target 为原点并 / liveScale
 * - liveScale 优先取 DOM 实测（visualWidth / offsetWidth），避免 currentScale 与 CSS transition 失步
 * - gap / margin / minWidth / estimatedHeight / chrome* / maxHeight 均为画布（设计稿）单位，不再 / scale
 * - 若调用方持有视口像素宽度，须先自行 / scale 再传入 minWidth
 *
 * Teleport 约定：
 * - 应用内弹窗/锚定下拉 → #teleport-target（随整页等比缩放）
 * - 有意例外挂 body：屏保（自建 scale）、地震预警/向导、引导蒙层、跟手拖拽 ghost
 *
 * 依赖：@/composables/ui/useScaling 的 currentScale / scalingEnabled。
 */

import { currentScale, scalingEnabled } from '@/composables/ui/useScaling'

/** #teleport-target 的定位参考矩形（与 fixed 包含块一致） */
export function getTeleportShellRect(tel: HTMLElement | null) {
  if (!tel) return null
  return tel.getBoundingClientRect()
}

/**
 * Teleport/shell 当前真实缩放系数。
 * 优先用 DOM 实测（visual / local），兼容 transform transition 期间 currentScale 已跳变、视觉仍在缓动的情况。
 */
export function getTeleportLiveScale(tel: HTMLElement | null) {
  const fallback = currentScale.value || 1
  if (!tel) return fallback
  const localW = tel.offsetWidth
  if (!(localW > 0)) return fallback
  const visualW = tel.getBoundingClientRect().width
  if (!(visualW > 0)) return fallback
  return visualW / localW
}

/**
 * 自下而上检查祖先链是否含 transform / filter / perspective（这些会改变 fixed 的包含块）。
 * @param el 起始元素
 * @returns 命中返回 true
 */
function hasFixedContainingTransform(el: HTMLElement | null) {
  let node = el
  while (node) {
    const style = getComputedStyle(node)
    if (style.transform !== 'none' || style.filter !== 'none' || style.perspective !== 'none')
      return true
    node = node.parentElement
  }
  return false
}

/**
 * Teleport 下拉是否使用画布坐标系。
 * 等比缩放开启时始终换算（含 scale=1：shell 仍有 transform，视口坐标会错位）。
 */
export function shouldUseTeleportCanvasCoords(tel: HTMLElement | null) {
  if (!tel) return false
  if (scalingEnabled.value) return true
  return hasFixedContainingTransform(tel.parentElement)
}

/** 锚点矩形（DOMRect 只读子集，供定位计算复用） */
type AnchorRect = Pick<DOMRectReadOnly, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>

/** 下拉展开方向：向上 / 向下 */
type DropdownPlacement = 'top' | 'bottom'

/** 下拉层定位结果（含 left/top/bottom、宽度、方向与最大高度） */
export interface DropdownPosition {
  left: number
  top?: number
  bottom?: number | null
  width: number
  placement: DropdownPlacement | string
  maxHeight: number
}

/** 下拉定位的可选项（预估高度、间距、chrome 高度、最小行高、是否使用视口坐标等） */
interface DropdownPositionOptions {
  estimatedHeight?: number
  margin?: number
  chromeHeight?: number
  minListHeight?: number
  minRowHeight?: number
  viewportCoords?: boolean
}

/**
 * 锚点元素视口矩形 → 下拉层 fixed 坐标（等比缩放时换算为画布坐标系）
 * @param {DOMRectReadOnly|null} rect
 * @param {number} [gap]
 * @param {number} [minWidth]
 * @param {{ estimatedHeight?: number, margin?: number }} [options]
 */
export function rectToDropdownPosition(
  rect: AnchorRect | null | undefined,
  gap = 4,
  minWidth = 200,
  options: DropdownPositionOptions = {},
): DropdownPosition {
  const estimatedHeight = options.estimatedHeight ?? 320
  const margin = options.margin ?? 8
  const chromeHeight = options.chromeHeight ?? 44
  const minListHeight = options.minListHeight ?? 136
  const minRowHeight = options.minRowHeight ?? 68
  const preferHeight = Math.min(estimatedHeight, chromeHeight + minListHeight)
  const minVisibleHeight = chromeHeight + minRowHeight
  if (!rect)
    return {
      left: 0,
      top: 0,
      bottom: null,
      width: 0,
      placement: 'bottom',
      maxHeight: estimatedHeight,
    }
  const tel = typeof document !== 'undefined' ? document.getElementById('teleport-target') : null
  const useCanvas = options.viewportCoords ? false : shouldUseTeleportCanvasCoords(tel)
  let anchorTop
  let anchorBottom
  let anchorLeft
  let anchorWidth
  let viewportH
  let viewportW
  let gapPx = gap
  let marginPx = margin
  let minW = minWidth
  if (useCanvas) {
    const cr = getTeleportShellRect(tel)
    if (!cr)
      return {
        left: 0,
        top: 0,
        bottom: null,
        width: 0,
        placement: 'bottom',
        maxHeight: estimatedHeight,
      }
    const s = getTeleportLiveScale(tel)
    // 仅换算锚点视口矩形；gap/margin/minWidth 已是画布单位
    anchorTop = (rect.top - cr.top) / s
    anchorBottom = (rect.bottom - cr.top) / s
    anchorLeft = (rect.left - cr.left) / s
    anchorWidth = rect.width / s
    viewportH = cr.height / s
    viewportW = cr.width / s
  } else {
    anchorTop = rect.top
    anchorBottom = rect.bottom
    anchorLeft = rect.left
    anchorWidth = rect.width
    viewportH = typeof window !== 'undefined' ? window.innerHeight : 1080
    viewportW = typeof window !== 'undefined' ? window.innerWidth : 1920
  }
  let width = Math.max(anchorWidth, minW)
  // 优先左对齐锚点；若右侧放不下则改为右对齐锚点右缘，再不行夹到视口内
  let left = anchorLeft
  const viewportRight = viewportW - marginPx
  if (left + width > viewportRight) {
    const rightAligned = anchorLeft + anchorWidth - width
    left = Math.max(marginPx, rightAligned)
  }
  if (left + width > viewportRight) {
    const avail = viewportRight - left
    if (avail >= Math.min(minW, anchorWidth)) {
      width = avail
    } else {
      width = Math.max(Math.min(minW, viewportW - marginPx * 2), 120)
      left = Math.max(marginPx, viewportRight - width)
    }
  }
  if (left < marginPx) left = marginPx
  const spaceBelow = viewportH - anchorBottom - marginPx
  const spaceAbove = anchorTop - marginPx
  const availBelow = Math.max(0, spaceBelow - gapPx)
  const availAbove = Math.max(0, spaceAbove - gapPx)
  let placement: DropdownPlacement = 'bottom'
  if (availBelow < preferHeight && availAbove > availBelow) {
    placement = 'top'
  } else if (availBelow < estimatedHeight && availAbove > availBelow) {
    placement = 'top'
  }
  let avail = placement === 'bottom' ? availBelow : availAbove
  let maxHeight = Math.min(estimatedHeight, avail)
  if (avail >= minRowHeight) {
    maxHeight = Math.max(maxHeight, Math.min(minVisibleHeight, avail, estimatedHeight))
  }
  if (maxHeight < chromeHeight + 72 && placement === 'bottom' && availAbove > availBelow) {
    placement = 'top'
    avail = availAbove
    maxHeight = Math.min(estimatedHeight, avail)
  }
  let top: number | undefined
  let bottom: number | undefined
  if (placement === 'bottom') {
    top = anchorBottom + gapPx
  } else {
    bottom = viewportH - anchorTop + gapPx
    // 向上展开时同样保证「chrome + 至少一行」可见，避免搜索过滤后高度塌陷裁切末行
    maxHeight = Math.min(estimatedHeight, availAbove)
    if (availAbove >= minRowHeight) {
      maxHeight = Math.max(maxHeight, Math.min(minVisibleHeight, availAbove, estimatedHeight))
    }
  }
  return { left, top, bottom, width, placement, maxHeight }
}

/** Teleport 下拉层 fixed 定位样式（向上展开时用 bottom 锚定） */
export function buildDropdownFixedStyle(
  ddPos: DropdownPosition | null | undefined,
  options?: { fitContent?: boolean },
) {
  if (!ddPos) return { visibility: 'hidden' as const }
  const fitContent = options?.fitContent === true
  const width = ddPos.width > 0 ? ddPos.width : 0
  if (!fitContent && width <= 0) {
    return { visibility: 'hidden' as const }
  }
  const style: Record<string, string> = {
    left: `${ddPos.left}px`,
    maxHeight: `${ddPos.maxHeight}px`,
    visibility: 'visible',
  }
  if (fitContent) {
    // 内容自适应：用 max-content，width 字段作为 minWidth 兜底（多为锚点宽）
    style.width = 'max-content'
    if (width > 0) style.minWidth = `${width}px`
  } else {
    style.width = `${width}px`
  }
  if (ddPos.bottom != null) {
    style.bottom = `${ddPos.bottom}px`
    style.top = 'auto'
  } else {
    style.top = `${ddPos.top ?? 0}px`
  }
  return style
}

/**
 * 测量下拉面板内容自然宽度（元素处于 transform 画布内时为画布单位）。
 * 临时放开 width 约束读取 scrollWidth，测完恢复，避免影响当前布局。
 */
export function measureDropdownFitWidth(
  el: HTMLElement | null | undefined,
  {
    minWidth = 0,
    maxWidth = Number.POSITIVE_INFINITY,
  }: { minWidth?: number; maxWidth?: number } = {},
) {
  if (!el) return Math.max(0, minWidth)
  const prevWidth = el.style.width
  const prevMinWidth = el.style.minWidth
  const prevMaxWidth = el.style.maxWidth
  el.style.width = 'max-content'
  el.style.minWidth = '0'
  el.style.maxWidth = 'none'
  const natural = Math.ceil(el.scrollWidth || el.offsetWidth || 0)
  el.style.width = prevWidth
  el.style.minWidth = prevMinWidth
  el.style.maxWidth = prevMaxWidth
  const cappedMax = Number.isFinite(maxWidth) ? maxWidth : natural
  return Math.min(cappedMax, Math.max(minWidth, natural || minWidth))
}

/** 视口内下拉可用高度（与 rectToDropdownPosition 坐标系一致） */
function computeDropdownAvail(
  rect: AnchorRect | null | undefined,
  placement: DropdownPlacement | string,
  gap = 4,
  margin = 8,
  options: { viewportCoords?: boolean } = {},
) {
  if (!rect) return 0
  const tel = typeof document !== 'undefined' ? document.getElementById('teleport-target') : null
  const useCanvas = options.viewportCoords ? false : shouldUseTeleportCanvasCoords(tel)
  let viewportH
  let anchorTop
  let anchorBottom
  let marginPx = margin
  let gapPx = gap
  if (useCanvas) {
    const cr = getTeleportShellRect(tel)
    if (!cr) return 0
    const s = getTeleportLiveScale(tel)
    // 仅换算锚点；gap/margin 已是画布单位
    anchorTop = (rect.top - cr.top) / s
    anchorBottom = (rect.bottom - cr.top) / s
    viewportH = cr.height / s
  } else {
    anchorTop = rect.top
    anchorBottom = rect.bottom
    viewportH = typeof window !== 'undefined' ? window.innerHeight : 1080
  }
  if (placement === 'top') {
    return Math.max(0, anchorTop - marginPx - gapPx)
  }
  return Math.max(0, viewportH - anchorBottom - marginPx - gapPx)
}

/** 按实际内容高度扩展下拉 maxHeight（不超过视口可用空间） */
export function expandDropdownMaxHeight(
  pos: DropdownPosition | null | undefined,
  anchorRect: AnchorRect | null | undefined,
  {
    gap = 4,
    maxHeight = 320,
    margin = 8,
    scrollHeight = 0,
    viewportCoords = false,
  }: {
    gap?: number
    maxHeight?: number
    margin?: number
    scrollHeight?: number
    viewportCoords?: boolean
  },
) {
  if (!pos || !anchorRect || scrollHeight <= 0) return pos
  if (scrollHeight <= pos.maxHeight) return pos
  const avail = computeDropdownAvail(anchorRect, pos.placement, gap, margin, { viewportCoords })
  return {
    ...pos,
    maxHeight: Math.min(scrollHeight, maxHeight, avail),
  }
}

/**
 * 视口坐标 → 弹窗定位坐标系（#teleport-target 内 fixed 弹窗使用）
 */
export function viewportPointToPopupAnchor(rawX: number, rawY: number) {
  const el = typeof document !== 'undefined' ? document.getElementById('teleport-target') : null
  if (shouldUseTeleportCanvasCoords(el)) {
    const cr = getTeleportShellRect(el)
    if (cr) {
      const s = getTeleportLiveScale(el)
      return {
        anchorX: (rawX - cr.left) / s,
        anchorY: (rawY - cr.top) / s,
      }
    }
  }
  return { anchorX: rawX, anchorY: rawY }
}
