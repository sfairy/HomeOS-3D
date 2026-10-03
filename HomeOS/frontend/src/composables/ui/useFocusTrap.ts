/**
 * @file 模态框焦点陷阱 Composable
 * @module composables/ui/useFocusTrap
 *
 * 职责：
 *  - 模态框打开时聚焦首个可聚焦元素（优先 input/textarea/autofocus）。
 *  - Tab 键循环限制在容器内部，防止焦点逃逸到模态框背后的页面。
 *  - 模态框关闭时恢复焦点到打开前的元素。
 *
 * 依赖：
 *  - vue 的 watch / nextTick / onUnmounted 生命周期钩子与 Ref 类型。
 */
import { watch, nextTick, onUnmounted, type Ref } from 'vue'

/** 可聚焦元素选择器：链接、按钮、输入框、文本域、下拉框及带 tabindex 的元素 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 获取容器内所有可聚焦元素（过滤 disabled 与 aria-hidden）。
 * @param container - 容器元素
 * @returns 可聚焦元素数组；容器为空时返回空数组
 */
function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [] as HTMLElement[]
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  )
}

/**
 * 模态框焦点陷阱：打开时聚焦首元素，Tab 循环于容器内，关闭时恢复焦点。
 *
 * 调用场景：对话框、抽屉等需要限制焦点范围的模态组件。
 *
 * @param containerRef - 焦点容器元素引用
 * @param active - 是否激活焦点陷阱（通常绑定模态框的可见状态）
 * @sideEffect 在 document 上添加 / 移除 keydown 监听；修改 document.activeElement
 */
export function useFocusTrap(
  containerRef: Ref<HTMLElement | null>,
  active: Ref<boolean> | { readonly value: boolean },
) {
  /** 打开陷阱前聚焦的元素，用于关闭时恢复焦点 */
  let previousFocus: HTMLElement | null = null

  /** keydown 处理器：Tab 键在容器内循环，Shift+Tab 反向循环 */
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Tab' || !active.value) return
    const container = containerRef.value
    if (!container) return
    const focusable = getFocusableElements(container)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const current = document.activeElement
    if (e.shiftKey) {
      // Shift+Tab：当前在首元素或容器外时，跳到末元素
      if (current === first || !container.contains(current)) {
        e.preventDefault()
        last.focus()
      }
    } else if (current === last) {
      // Tab：当前在末元素时，跳回首元素
      e.preventDefault()
      first.focus()
    }
  }

  /** 激活焦点陷阱：记录原焦点，添加 keydown 监听，nextTick 后聚焦首元素 */
  function activate() {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.addEventListener('keydown', onKeyDown)
    nextTick(() => {
      const focusable = getFocusableElements(containerRef.value)
      // 优先聚焦 input/textarea/带 autofocus 的元素
      const preferred = containerRef.value?.querySelector('input, textarea, [autofocus]')
      if (preferred instanceof HTMLElement) {
        preferred.focus()
      } else if (focusable[0]) {
        focusable[0].focus()
      }
    })
  }

  /** 停用焦点陷阱：移除监听并恢复原焦点 */
  function deactivate() {
    document.removeEventListener('keydown', onKeyDown)
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus()
    }
    previousFocus = null
  }

  watch(active, (isActive) => {
    if (isActive) activate()
    else deactivate()
  })
  onUnmounted(deactivate)
}