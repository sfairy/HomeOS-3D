/**
 * v-swipe-close 指令：在元素上水平 swipe 超过阈值时触发绑定的回调。
 * 忽略垂直主导手势（与调光等垂直交互区分）。
 * 支持触摸与鼠标/触控笔（pointer events）。
 *
 * 用法：<div class="popup-shell" v-swipe-close="() => $emit('close')">
 */
import type { ObjectDirective } from 'vue'

/** 水平滑动触发关闭的最小绝对像素阈值 */
const DEFAULT_THRESHOLD_PX = 80
/** 水平滑动触发关闭的最小屏幕宽度比例（与像素阈值取较大值） */
const DEFAULT_THRESHOLD_RATIO = 0.2

// 起手落在交互控件上时不触发 swipe-close，避免与滑块/拖拽冲突
const INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a, [role="slider"], [class*="slider"], [class*="wheel"], [class*="track"], [class*="drag"], [data-no-swipe-close]'

/**
 * 扩展 HTMLElement 类型，附加 swipe-close 指令的内部状态字段。
 * - __swipeCloseHandler：绑定的关闭回调（updated 时可热替换）
 * - __swipeCloseCleanup：事件监听器清理函数（beforeUnmount 时调用）
 */
type SwipeCloseEl = HTMLElement & {
  __swipeCloseHandler?: (() => void) | null
  __swipeCloseCleanup?: () => void
}

/**
 * 为目标元素绑定 pointer 事件监听器，实现水平滑动检测。
 *
 * @param el 目标元素，需已设置 __swipeCloseHandler
 *
 * 监听事件：
 * - pointerdown：记录起始坐标，标记追踪开始
 * - pointermove：若手势转为垂直主导则取消追踪（让位于垂直交互）
 * - pointerup：判断水平位移是否超过阈值，超过则触发回调
 * - pointercancel：重置追踪状态
 *
 * 副作用：在 el 上注册 4 个 passive 事件监听器，并将清理函数存入 __swipeCloseCleanup
 */
function attach(el: SwipeCloseEl) {
  let startX = 0
  let startY = 0
  let tracking = false
  let activePointerId: number | null = null

  /** 重置追踪状态，丢弃当前 pointer 的关联 */
  function resetTracking() {
    tracking = false
    activePointerId = null
  }

  /** pointerdown 处理：仅在主键（左键/触屏）且起点非交互控件时开始追踪 */
  function onPointerDown(e: PointerEvent) {
    if (e.button != null && e.button !== 0) return
    // 起点落在滑块/按钮等交互控件上时不启动追踪，避免误触发关闭
    if ((e.target as Element | null)?.closest?.(INTERACTIVE_SELECTOR)) {
      resetTracking()
      return
    }
    startX = e.clientX
    startY = e.clientY
    tracking = true
    activePointerId = e.pointerId
  }

  /** pointermove 处理：检测手势方向，垂直主导时放弃追踪以让位垂直交互（如调光） */
  function onPointerMove(e: PointerEvent) {
    if (!tracking || e.pointerId !== activePointerId) return
    if (Math.abs(e.clientY - startY) > Math.abs(e.clientX - startX)) {
      resetTracking()
    }
  }

  /** pointerup 处理：判定水平滑动是否达到关闭阈值 */
  function finishSwipe(e: PointerEvent) {
    if (!tracking || e.pointerId !== activePointerId) return
    resetTracking()
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    // 垂直位移仍大于水平时不触发（二次校验，防止 move 后又转水平）
    if (Math.abs(dy) > Math.abs(dx)) return
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024
    // 取像素阈值与屏幕比例阈值的较大值，适配不同屏幕尺寸
    const minDx = Math.max(DEFAULT_THRESHOLD_PX, width * DEFAULT_THRESHOLD_RATIO)
    if (Math.abs(dx) >= minDx) el.__swipeCloseHandler?.()
  }

  el.addEventListener('pointerdown', onPointerDown, { passive: true })
  el.addEventListener('pointermove', onPointerMove, { passive: true })
  el.addEventListener('pointerup', finishSwipe, { passive: true })
  el.addEventListener('pointercancel', resetTracking, { passive: true })

  el.__swipeCloseCleanup = () => {
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', finishSwipe)
    el.removeEventListener('pointercancel', resetTracking)
  }
}

/**
 * v-swipe-close 指令定义。
 *
 * 绑定值：`() => void` 类型的关闭回调。
 * 生命周期：
 * - mounted：保存回调并绑定 pointer 事件
 * - updated：热替换回调引用（无需重新绑定事件）
 * - beforeUnmount：解绑事件并清理状态
 */
export const swipeClose: ObjectDirective<HTMLElement, () => void> = {
  mounted(el, binding) {
    const target = el as SwipeCloseEl
    target.__swipeCloseHandler = typeof binding.value === 'function' ? binding.value : null
    attach(target)
  },
  updated(el, binding) {
    const target = el as SwipeCloseEl
    // 仅更新回调引用，事件监听器保持不变
    target.__swipeCloseHandler = typeof binding.value === 'function' ? binding.value : null
  },
  beforeUnmount(el) {
    const target = el as SwipeCloseEl
    target.__swipeCloseCleanup?.()
    delete target.__swipeCloseCleanup
    delete target.__swipeCloseHandler
  },
}