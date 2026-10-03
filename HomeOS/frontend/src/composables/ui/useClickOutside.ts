/**
 * @file 点击外部检测 Composable
 * @module composables/ui/useClickOutside
 *
 * 职责：
 *  - 在 document 上监听指定事件（默认 click），当点击发生在目标元素外部时触发回调。
 *  - 组件卸载时自动移除监听，避免内存泄漏。
 *
 * 依赖：
 *  - vue 的 onMounted / onUnmounted 生命周期钩子与 Ref 类型。
 */
import { onMounted, onUnmounted, type Ref } from 'vue'

/** 目标引用类型：可为 Ref<HTMLElement> / Ref<HTMLElement[]> / 取值函数 */
type TargetRef =
  Ref<HTMLElement | null> | Ref<HTMLElement[]> | (() => HTMLElement | null | HTMLElement[])

/** 点击外部检测选项 */
interface ClickOutsideOptions {
  /** 监听的事件名，默认 'click' */
  event?: string
  /** 是否在捕获阶段监听，默认 false */
  capture?: boolean
}

/**
 * 点击元素外部时触发回调（document 级监听，组件卸载自动清理）。
 *
 * 调用场景：下拉框、弹出层等需要在点击外部时关闭的组件。
 *
 * @param targetRef - 目标元素引用（Ref 或取值函数），支持单个或数组
 * @param onOutside - 点击外部时的回调
 * @param opts - 选项（事件名 / 捕获阶段）
 * @sideEffect 在 document 上添加 / 移除事件监听
 */
export function useClickOutside(
  targetRef: TargetRef,
  onOutside: (event: Event) => void,
  opts: ClickOutsideOptions = {},
): void {
  const eventName = opts.event || 'click'
  const capture = opts.capture ?? false

  /** 解析目标元素数组：支持 Ref / 函数 / 单元素 / 数组 */
  function resolveTargets(): HTMLElement[] {
    const raw = typeof targetRef === 'function' ? targetRef() : targetRef?.value
    if (!raw) return []
    return Array.isArray(raw) ? raw.filter(Boolean) : [raw]
  }

  /** 事件处理器：若点击命中任一目标元素则跳过，否则触发 onOutside */
  function handler(event: Event) {
    const targets = resolveTargets()
    if (targets.some((el: HTMLElement) => el.contains(event.target as Node))) return
    onOutside(event)
  }

  onMounted(() => {
    document.addEventListener(eventName, handler, capture)
  })
  onUnmounted(() => {
    document.removeEventListener(eventName, handler, capture)
  })
}