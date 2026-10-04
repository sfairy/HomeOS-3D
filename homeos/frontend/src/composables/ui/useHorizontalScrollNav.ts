/**
 * @file 横向滚动导航 Composable
 * @module composables/ui/useHorizontalScrollNav
 *
 * 职责：
 *  - 检测横向轨道是否溢出，控制左右箭头的显隐。
 *  - 提供平滑滚动（按步长滚动）与子元素滚动入视（居中对齐）能力。
 *  - 通过 ResizeObserver 监听轨道尺寸变化，自动刷新滚动状态。
 *
 * 依赖：
 *  - vue 的 ref / watch / nextTick / onMounted / onUnmounted 与 Ref 类型。
 */
import { ref, watch, nextTick, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * 横向溢出轨道：检测是否需要左右箭头，并提供平滑滚动。
 *
 * 调用场景：Tab 栏、横向卡片列表等可能溢出容器的导航区域。
 *
 * @param trackRef - 轨道容器元素引用
 * @param contentKey - 内容变化时刷新滚动状态（如 tab 列表变更），可为 Ref 或取值函数
 * @returns hasOverflow - 是否溢出；canScrollLeft - 可否左滚；canScrollRight - 可否右滚；updateScrollState - 刷新状态；scrollNav - 按方向滚动；scrollChildIntoView - 子元素滚动入视；refresh - nextTick 刷新
 */
export function useHorizontalScrollNav(
  trackRef: Ref<HTMLElement | null>,
  /** 内容变化时刷新滚动状态（如 tab 列表变更） */
  contentKey?: Ref<unknown> | (() => unknown),
) {
  /** 是否存在横向溢出（scrollWidth > clientWidth） */
  const hasOverflow = ref(false)
  /** 是否可向左滚动（scrollLeft > 0） */
  const canScrollLeft = ref(false)
  /** 是否可向右滚动（scrollLeft < maxScroll） */
  const canScrollRight = ref(false)
  let resizeObserver: ResizeObserver | null = null

  /** 刷新滚动状态：根据 scrollWidth / clientWidth / scrollLeft 计算 canScroll* 标志（2px 容差防抖） */
  function updateScrollState() {
    const track = trackRef.value
    if (!track) {
      hasOverflow.value = false
      canScrollLeft.value = false
      canScrollRight.value = false
      return
    }
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth)
    hasOverflow.value = maxScroll > 2
    canScrollLeft.value = track.scrollLeft > 2
    canScrollRight.value = track.scrollLeft < maxScroll - 2
  }

  /**
   * 按方向平滑滚动：步长取 180px 与容器宽度 65% 的较大值。
   * @param dir - -1 向左，1 向右
   */
  function scrollNav(dir: -1 | 1) {
    const track = trackRef.value
    if (!track) return
    const step = Math.max(180, Math.floor(track.clientWidth * 0.65))
    track.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  /**
   * 将指定子元素滚动入视（居中对齐）。若已在视区内则不滚动。
   * @param el - 目标子元素
   * @param behavior - 滚动行为，默认 'smooth'
   */
  function scrollChildIntoView(el: HTMLElement | null | undefined, behavior: ScrollBehavior = 'smooth') {
    const track = trackRef.value
    if (!el || !track) return
    // 只读取目标元素相对于当前 row 的 offsetLeft，绝不调用 scrollIntoView，
    // 避免浏览器递归滚动外层视窗、页面和胶囊导航。
    const targetLeft = el.offsetLeft - (track.clientWidth - el.offsetWidth) / 2
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth)
    const nextLeft = Math.min(maxScroll, Math.max(0, targetLeft))
    if (Math.abs(track.scrollLeft - nextLeft) <= 2) return
    track.scrollTo({ left: nextLeft, behavior })
  }

  /** 在 nextTick 中刷新滚动状态（等待 DOM 更新完成） */
  function refresh() {
    nextTick(updateScrollState)
  }

  onMounted(() => {
    refresh()
    const track = trackRef.value
    if (!track || typeof ResizeObserver === 'undefined') return
    // 监听轨道尺寸变化，自动刷新滚动状态
    resizeObserver = new ResizeObserver(() => updateScrollState())
    resizeObserver.observe(track)
  })

  onUnmounted(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  // 内容变化时（如 tab 列表变更）在 post 阶段刷新滚动状态
  if (contentKey) {
    watch(contentKey, refresh, { flush: 'post' })
  }

  return {
    hasOverflow,
    canScrollLeft,
    canScrollRight,
    updateScrollState,
    scrollNav,
    scrollChildIntoView,
    refresh,
  }
}