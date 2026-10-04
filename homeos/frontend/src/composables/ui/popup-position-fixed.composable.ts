/**
 * @file 弹窗位置自适应 Composable（固定像素锚点模式）
 * @module composables/ui/popup-position-fixed
 *
 * 根据锚点像素坐标计算弹窗 fixed 定位、箭头样式与方向 class。
 * 贴边定位用 bottom/right，避免声明高度与真实高度不一致时锚点错位；
 * 方向选择相对户型图显示区（上→下→右→左）。
 */
import { computed } from 'vue'
import {
  getPopupPlacementBounds,
  getTeleportContainerSize,
  resolvePopupNumeric,
  type PopupNumericInput,
} from '@/utils/ui/popup-position-shared.util'
import { pickPopupPlacementDirection } from '@/utils/ui/popup-placement.util'
import { clampNum as clamp } from '@/utils/core/misc.util'

/** 箭头填充色（与弹窗背景深色保持一致） */
const ARROW_FILL = 'rgba(18, 18, 26, 0.9)'

/**
 * 弹窗位置自适应 Composable（固定像素锚点模式）
 */
export function useFixedPopupPosition(
  anchorX: PopupNumericInput,
  anchorY: PopupNumericInput,
  pw: PopupNumericInput,
  ph: PopupNumericInput,
  margin = 16,
) {
  const resolveBounds = () => {
    if (typeof document !== 'undefined') {
      return getPopupPlacementBounds()
    }
    const { cw, ch } = getTeleportContainerSize()
    return { left: 0, top: 0, right: cw, bottom: ch, cw, ch }
  }

  const direction = computed(() => {
    const cx = resolvePopupNumeric(anchorX)
    const cy = resolvePopupNumeric(anchorY)
    const w = resolvePopupNumeric(pw)
    const h = resolvePopupNumeric(ph)
    const bounds = resolveBounds()
    return pickPopupPlacementDirection(cx, cy, w, h, bounds, margin)
  })

  const fixedStyle = computed(() => {
    const cx = resolvePopupNumeric(anchorX)
    const cy = resolvePopupNumeric(anchorY)
    const w = resolvePopupNumeric(pw)
    const h = resolvePopupNumeric(ph)
    const bounds = resolveBounds()
    const { cw, ch, left: bL, top: bT, right: bR, bottom: bB } = bounds
    const { position, alignment } = direction.value
    const style: Record<string, string> = { position: 'fixed', width: w + 'px' }
    const edge = 4

    // 上下展开：水平可调，垂直用 top/bottom 贴热点（不依赖声明高度推算）
    if (position === 'top' || position === 'bottom') {
      if (alignment === 'center') style.left = cx - w / 2 + 'px'
      else if (alignment === 'left') style.left = cx - margin + 'px'
      else style.right = cw - cx - margin + 'px'
    }

    if (position === 'bottom') {
      style.top = cy + margin + 'px'
    } else if (position === 'top') {
      // 底部贴在热点上方：真实内容高度变化时锚点仍正确
      style.bottom = ch - cy + margin + 'px'
    } else if (position === 'right') {
      style.left = cx + margin + 'px'
      if (alignment === 'center') style.top = cy - h / 2 + 'px'
      else if (alignment === 'top') style.top = cy - margin + 'px'
      else style.bottom = ch - cy - margin + 'px'
    } else {
      // left：右侧贴热点
      style.right = cw - cx + margin + 'px'
      if (alignment === 'center') style.top = cy - h / 2 + 'px'
      else if (alignment === 'top') style.top = cy - margin + 'px'
      else style.bottom = ch - cy - margin + 'px'
    }

    // 仅夹取「非贴锚」轴，避免拉开与热点的间距
    const minL = Math.max(edge, bL + edge)
    const maxL = Math.min(cw - w - edge, Math.max(minL, bR - w - edge))
    const minT = Math.max(edge, bT + edge)
    const maxT = Math.min(ch - h - edge, Math.max(minT, bB - h - edge))

    if (position === 'top' || position === 'bottom') {
      let left = 0
      if (style.left != null && style.left !== '') left = parseFloat(style.left)
      else if (style.right != null && style.right !== '') left = cw - w - parseFloat(style.right)
      left = Math.max(minL, Math.min(left, maxL))
      style.left = left + 'px'
      delete style.right
    } else if (style.top != null && style.top !== '') {
      // left/right + top 对齐：只夹垂直，保持 left/right 贴热点
      let top = parseFloat(style.top)
      if (Number.isFinite(top)) {
        style.top = Math.max(minT, Math.min(top, maxT)) + 'px'
        delete style.bottom
      }
    }

    // 整壳左右兜底（贴 right 时先换成 left 再夹）
    if (style.left == null && style.right != null) {
      const left = cw - w - parseFloat(style.right)
      if (Number.isFinite(left)) {
        style.left = Math.max(edge, Math.min(left, cw - w - edge)) + 'px'
        delete style.right
      }
    } else if (style.left != null) {
      const left = parseFloat(style.left)
      if (Number.isFinite(left)) {
        style.left = Math.max(edge, Math.min(left, cw - w - edge)) + 'px'
      }
    }

    return style
  })

  const boxOrigin = () => {
    const w = resolvePopupNumeric(pw)
    const h = resolvePopupNumeric(ph)
    const { cw, ch } = resolveBounds()
    const fs = fixedStyle.value
    let left = 0
    if (fs.left != null && fs.left !== '') left = parseFloat(fs.left)
    else if (fs.right != null && fs.right !== '') left = cw - w - parseFloat(fs.right)
    let top = 0
    if (fs.top != null && fs.top !== '') top = parseFloat(fs.top)
    else if (fs.bottom != null && fs.bottom !== '') top = ch - h - parseFloat(fs.bottom)
    return { left, top, w, h }
  }

  const arrowStyle = computed(() => {
    const cx = resolvePopupNumeric(anchorX)
    const cy = resolvePopupNumeric(anchorY)
    const { left, top, w, h } = boxOrigin()
    const { position } = direction.value
    const m = margin
    const half = m / 2
    const edge = 12
    const base: Record<string, string> = {
      position: 'absolute',
      width: '0',
      height: '0',
      background: 'transparent',
      borderStyle: 'solid',
      margin: '0',
      padding: '0',
      transform: 'none',
      clipPath: 'none',
      pointerEvents: 'none',
      zIndex: '2',
    }
    if (position === 'bottom') {
      return {
        ...base,
        top: `-${m}px`,
        left: `${clamp(cx - left - half, edge, w - edge - m)}px`,
        borderWidth: `0 ${half}px ${m}px ${half}px`,
        borderColor: `transparent transparent ${ARROW_FILL} transparent`,
      }
    }
    if (position === 'top') {
      return {
        ...base,
        bottom: `-${m}px`,
        top: 'auto',
        left: `${clamp(cx - left - half, edge, w - edge - m)}px`,
        borderWidth: `${m}px ${half}px 0 ${half}px`,
        borderColor: `${ARROW_FILL} transparent transparent transparent`,
      }
    }
    if (position === 'right') {
      return {
        ...base,
        left: `-${m}px`,
        top: `${clamp(cy - top - half, edge, h - edge - m)}px`,
        borderWidth: `${half}px ${m}px ${half}px 0`,
        borderColor: `transparent ${ARROW_FILL} transparent transparent`,
      }
    }
    return {
      ...base,
      right: `-${m}px`,
      left: 'auto',
      top: `${clamp(cy - top - half, edge, h - edge - m)}px`,
      borderWidth: `${half}px 0 ${half}px ${m}px`,
      borderColor: `transparent transparent transparent ${ARROW_FILL}`,
    }
  })

  const popupClassArray = computed(() => [
    `popup--${direction.value.position}`,
    `popup--${direction.value.alignment}`,
  ])
  return { direction, fixedStyle, arrowStyle, popupClassArray }
}
