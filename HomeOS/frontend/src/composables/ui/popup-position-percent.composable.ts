/**
 * @file 弹窗位置自适应 Composable（百分比锚点模式）
 * @module composables/ui/popup-position-percent
 *
 * 职责：
 *  - 根据锚点百分比坐标（0-100）与弹窗尺寸，计算弹窗的方向 class 与百分比定位样式。
 *  - 兼容整页等比缩放画布：当 scalingEnabled 为 true 时使用 teleport 容器尺寸进行方向选择。
 *
 * 依赖：
 *  - vue 的 computed 计算属性。
 *  - useScaling 的 scalingEnabled（是否启用缩放）。
 *  - popup-position-shared.util 的 getTeleportContainerSize / resolvePopupNumeric / PopupNumericInput。
 *  - popup-placement.util 的 pickPopupPlacementDirection（方向选择算法）。
 */
import { computed } from 'vue'
import { scalingEnabled } from '@/composables/ui/useScaling'
import {
  getPopupPlacementBounds,
  resolvePopupNumeric,
  type PopupNumericInput,
} from '@/utils/ui/popup-position-shared.util'
import { pickPopupPlacementDirection } from '@/utils/ui/popup-placement.util'

/**
 * 弹窗位置自适应 Composable（百分比锚点模式）
 *
 * 锚点坐标以百分比（0-100）形式传入，方向选择时再换算为像素。
 * 弹窗本身使用百分比 left/top 定位，跟随容器尺寸自适应。
 *
 * @param xPct - 锚点 X 坐标（百分比 0-100）
 * @param yPct - 锚点 Y 坐标（百分比 0-100）
 * @param pw - 弹窗宽度（像素）
 * @param ph - 弹窗高度（像素）
 * @param margin - 弹窗与视口边缘的最小间距（像素），默认 16
 * @returns direction - 方向（position + alignment）；popupStyle - 百分比定位样式；popupClassArray - 方向 class 数组
 */
export function usePopupPosition(
  xPct: PopupNumericInput,
  yPct: PopupNumericInput,
  pw: PopupNumericInput,
  ph: PopupNumericInput,
  margin = 16,
) {
  /** 方向（position + alignment）：将百分比锚点换算为像素后调用方向选择算法 */
  const direction = computed(() => {
    const x = resolvePopupNumeric(xPct)
    const y = resolvePopupNumeric(yPct)
    const w = resolvePopupNumeric(pw)
    const h = resolvePopupNumeric(ph)
    const bounds = scalingEnabled.value
      ? getPopupPlacementBounds()
      : (() => {
          const cw = typeof window !== 'undefined' ? window.innerWidth : 1920
          const ch = typeof window !== 'undefined' ? window.innerHeight : 1080
          return { left: 0, top: 0, right: cw, bottom: ch, cw, ch }
        })()
    const { cw: ww, ch: wh } = bounds
    // 百分比坐标换算为像素坐标（相对整壳）；空间判断用户型图 bounds
    const cx = (x / 100) * ww
    const cy = (y / 100) * wh
    return pickPopupPlacementDirection(cx, cy, w, h, bounds, margin)
  })

  /** 弹窗百分比定位样式：直接使用百分比 left/top，跟随容器尺寸自适应 */
  const popupStyle = computed(() => ({
    left: resolvePopupNumeric(xPct) + '%',
    top: resolvePopupNumeric(yPct) + '%',
  }))

  /** 弹窗方向 class 数组，用于模板中绑定 popup--top/popup--center 等 class */
  const popupClassArray = computed(() => [
    `popup--${direction.value.position}`,
    `popup--${direction.value.alignment}`,
  ])
  return { direction, popupStyle, popupClassArray }
}