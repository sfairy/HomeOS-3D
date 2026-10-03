/**
 * @file 长按检测 Composable
 * @module composables/ui/useLongPress
 *
 * 职责：
 *  - 检测长按手势，用于「短按开关 / 长按弹窗」等交互。
 *  - 提供长按开始、结束、取消及消费判定能力。
 *  - 按下后监听 touchmove，位移超过阈值自动取消，避免滚动/拖动误触长按。
 *
 * 依赖：
 *  - vue 的 ref / onUnmounted。
 */
import { ref, onUnmounted } from 'vue'

/** 默认长按触发时长（毫秒） */
const DEFAULT_LONG_PRESS_MS = 750
/** 位移取消阈值（像素）：触摸位移超过该值判定为滚动/拖动，自动取消长按计时 */
const MOVE_CANCEL_THRESHOLD = 10

/**
 * 长按检测，用于「短按开关 / 长按弹窗」等交互。
 *
 * 调用场景：实体卡片等需要区分短按与长按的交互元素。
 *
 * @param onLongPress - 长按触发回调
 * @param delay - 长按触发延时（毫秒），默认 750
 * @returns onPressStart - 按下开始计时；onPressEnd - 松开取消计时；onPressCancel - 取消计时；consumeLongPress - 消费并查询是否已触发长按
 */
export function useLongPress(onLongPress: (() => void) | undefined, delay = DEFAULT_LONG_PRESS_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null
  /** 长按是否已触发的标志（用于短按回调中排除长按场景） */
  const longPressFired = ref(false)
  /** 触摸起点坐标（用于位移检测） */
  let startX = 0
  let startY = 0
  /** 当前注册的 touchmove 监听 */
  let moveHandler: ((e: TouchEvent) => void) | null = null

  /** 位移超阈值判定：滚动/拖动时自动取消长按计时，避免长按误触发 */
  function handleTouchMove(e: TouchEvent) {
    const touch = e.touches?.[0]
    if (!touch) return
    const dx = Math.abs(touch.clientX - startX)
    const dy = Math.abs(touch.clientY - startY)
    if (Math.max(dx, dy) > MOVE_CANCEL_THRESHOLD) {
      removeMoveListener()
      clear()
    }
  }

  /** 注册 touchmove 监听（按下时启用，passive 不阻塞滚动） */
  function addMoveListener() {
    removeMoveListener()
    moveHandler = handleTouchMove
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
  }

  /** 移除 touchmove 监听 */
  function removeMoveListener() {
    if (moveHandler) {
      window.removeEventListener('touchmove', moveHandler)
      moveHandler = null
    }
  }

  /** 清除计时器与 touchmove 监听 */
  function clear() {
    removeMoveListener()
    if (timer) {
      clearTimeout(timer)
    }
    timer = null
  }

  /** 按下开始：记录起点、注册位移监听并启动延时计时器，到时触发 onLongPress */
  function onPressStart(e?: TouchEvent | MouseEvent) {
    longPressFired.value = false
    clear()
    const touch = e && 'touches' in e ? e.touches[0] : undefined
    if (touch) {
      startX = touch.clientX
      startY = touch.clientY
    }
    addMoveListener()
    timer = window.setTimeout(() => {
      longPressFired.value = true
      onLongPress?.()
    }, delay)
  }

  /** 松开：清除计时器（若未到时则不触发长按） */
  function onPressEnd() {
    clear()
  }

  /**
   * 消费长按标志：返回是否已触发长按并重置标志。
   * 调用场景：在 click 事件中调用，若返回 true 则跳过短按逻辑。
   * @returns 是否已触发长按
   */
  function consumeLongPress() {
    const was = longPressFired.value
    longPressFired.value = false
    return was
  }

  onUnmounted(clear)
  return { onPressStart, onPressEnd, onPressCancel: clear, consumeLongPress }
}
