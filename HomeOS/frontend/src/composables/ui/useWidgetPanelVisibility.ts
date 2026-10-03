/**
 * @file useWidgetPanelVisibility.ts
 * @module composables/ui
 * @description 监听面板 widget 是否在视口内的 composable（用于侧栏滚动时暂停图表）。
 *
 * 依赖：
 * - vue（ref/onUnmounted/Ref 类型）
 */
import { ref, onUnmounted, type Ref } from 'vue'
/** 侧栏需视口门控的 widget（图表 / 轮播 / 媒体 / 天气动画） */
export const PANEL_VISIBILITY_WIDGET_TYPES = new Set([
  'homeEnvironment',
  'homeClimateChart',
  'climateHub',
  'heroSwiper',
  'weather',
  'mediaMini',
  'mediaPlaylist',
  'mediaPlayer',
  'environmentHealth',
  'switchGroup',
])
/**
 * 监听面板 widget 是否在视口内（用于侧栏滚动时暂停图表）。
 *
 * 使用 IntersectionObserver 监听根元素与视口的交集，当交集比例 > 2% 时视为可见。
 * enabled 为 false 时直接返回可见并断开观察，避免不必要的性能开销。
 *
 * @param rootRef 根元素 DOM 引用
 * @param options.enabled 是否启用监听（支持 ref 或布尔值），缺省为 true
 * @returns isVisible 是否可见；bind 绑定元素；disconnect 断开观察
 */
export function useWidgetPanelVisibility(
  rootRef: Ref<HTMLElement | null>,
  options: { enabled?: Ref<boolean> | boolean } = {},
) {
  // 是否可见（默认 true，由 IntersectionObserver 更新）
  const isVisible = ref(true)
  let observer: IntersectionObserver | null = null
  /** 断开 IntersectionObserver */
  function disconnect() {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  }
  /** 连接 IntersectionObserver 监听指定元素 */
  function connect(el: HTMLElement | null) {
    disconnect()
    if (!el) return
    observer = new IntersectionObserver(
      ([entry]) => {
        // 交集比例 > 2% 才视为可见，避免边缘像素抖动
        isVisible.value = entry.isIntersecting && entry.intersectionRatio > 0.02
      },
      { threshold: [0, 0.02, 0.1, 0.25] },
    )
    observer.observe(el)
  }
  /** 绑定元素：根据 enabled 决定是否连接观察器 */
  function bind(el: HTMLElement | null) {
    const enabled = options.enabled
    const active = enabled == null ? true : typeof enabled === 'object' ? enabled.value : enabled
    if (!active) {
      // 未启用时直接视为可见并断开，减少性能开销
      isVisible.value = true
      disconnect()
      return
    }
    connect(el)
  }
  onUnmounted(disconnect)
  return { isVisible, bind, disconnect }
}