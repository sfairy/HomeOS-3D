/**
 * @file useEntityPopupAnchor.ts
 * @module composables/entity
 * @description 实体控制弹窗锚点定位 composable（户型图像素锚点 / 百分比锚点）。
 *
 * 职责：根据 props 中是否提供 anchorX/anchorY 决定走"固定像素锚点"还是"百分比锚点"，
 *      统一输出弹窗 style、popupClass、箭头 style。
 *
 * 依赖：
 * - vue（computed）
 * - @/composables/ui/usePopupPosition（useFixedPopupPosition / usePopupPosition）
 * - @/utils/ui/popup-position-shared.util（PopupNumericInput）
 */
import { computed } from 'vue'
import { useFixedPopupPosition, usePopupPosition } from '@/composables/ui/usePopupPosition'
import type { PopupNumericInput } from '@/utils/ui/popup-position-shared.util'

/** 弹窗锚点 props：anchorX/Y 为像素锚点，xPct/yPct 为百分比锚点 */
interface EntityPopupAnchorProps {
  anchorX?: number | null
  anchorY?: number | null
  xPct?: number | string
  yPct?: number | string
}

/**
 * 实体控制弹窗锚点定位（户型图像素锚点 / 百分比锚点）。
 *
 * @param props 锚点配置（anchorX/Y 与 xPct/yPct 二选一）
 * @param pw 弹窗宽度（数字或返回数字的函数）
 * @param ph 弹窗高度（数字或返回数字的函数）
 * @param margin 弹窗与边界的最小间距（默认 16）
 * @returns useAnchor 是否使用像素锚点；anchorStyle 弹窗定位样式；popupClass 弹窗 class；arrowStyle 箭头样式
 */
export function useEntityPopupAnchor(
  props: EntityPopupAnchorProps,
  pw: PopupNumericInput,
  ph: PopupNumericInput,
  margin: number | PopupNumericInput = 16,
) {
  // 同时存在 anchorX 与 anchorY 时启用像素锚点模式
  const useAnchor = computed(() => props.anchorX != null && props.anchorY != null)
  const fr = useFixedPopupPosition(
    () => props.anchorX ?? 0,
    () => props.anchorY ?? 0,
    pw,
    ph,
    typeof margin === 'number' ? margin : 16,
  )
  const pr = usePopupPosition(
    () => props.xPct,
    () => props.yPct,
    pw,
    ph,
    typeof margin === 'number' ? margin : 16,
  )
  // 根据锚点模式选择对应的样式 / class / 箭头
  const anchorStyle = computed(() => (useAnchor.value ? fr.fixedStyle.value : pr.popupStyle.value))
  const popupClass = computed(() =>
    useAnchor.value ? fr.popupClassArray.value : pr.popupClassArray.value,
  )
  // 像素锚点才有箭头样式，百分比锚点模式下不展示
  const arrowStyle = computed(() => (useAnchor.value ? fr.arrowStyle.value : {}))
  return {
    useAnchor,
    anchorStyle,
    popupClass,
    arrowStyle,
  }
}
