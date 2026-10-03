/**
 * @file useSwiperDraggable.ts
 * @module composables/ui
 * @description 横向 swipe 拖拽 + CSS snap + scroll 事件管理 composable。
 *
 * 依赖：
 * - vue（ref/onMounted/onUnmounted/Ref 类型）
 */
import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/** Swiper 拖拽选项 */
interface SwiperDragOptions {
  /** 拖拽阈值 px，在此以内不算拖拽。0 表示无阈值 */
  dragThreshold?: number
  /** 拖拽排除的 CSS 选择器（如按钮区域），命中时不启动拖拽 */
  dragExcludeSelector?: string
}

/**
 * 横向 swipe 拖拽 + CSS snap + scroll 事件管理。
 *
 * 供 MediaMiniWidget 等横向滑动部件复用。通过鼠标/触摸事件模拟原生 scroll-snap 拖拽，
 * 拖拽时临时关闭 snap 以获得流畅手感，松手后恢复 snap 并对齐到最近幻灯片。
 *
 * @param sliderRef 滑动容器 DOM 引用
 * @param activeSlide 当前幻灯片索引 ref（双向：拖拽/滚动时更新，scrollToSlide 时同步）
 * @param options 拖拽选项（阈值/排除选择器）
 * @returns isDragging/dragMoved 状态与拖拽/滚动事件处理函数
 */
export function useSwiperDraggable(
  sliderRef: Ref<HTMLElement | null>,
  activeSlide: Ref<number>,
  options: SwiperDragOptions = {},
) {
  // 是否正在拖拽中
  const isDragging = ref(false)
  // 本次拖拽是否实际产生了位移（用于区分点击与拖拽）
  const dragMoved = ref(false)
  let startX = 0
  let startScrollLeft = 0

  /** 从鼠标或触摸事件中统一取 pageX 坐标 */
  function pageX(e: MouseEvent | TouchEvent) {
    return 'touches' in e
      ? (e.touches[0]?.pageX ?? (e as unknown as MouseEvent).pageX)
      : (e as MouseEvent).pageX
  }

  /** 拖拽开始：命中排除元素则跳过；记录起始坐标并关闭 snap */
  function onDragStart(e: MouseEvent | TouchEvent) {
    const el = sliderRef.value
    if (!el) return
    if (options.dragExcludeSelector) {
      const target = (e as MouseEvent).target as HTMLElement | null
      if (target?.closest?.(options.dragExcludeSelector)) return
    }
    isDragging.value = true
    dragMoved.value = false
    el.style.cursor = 'grabbing'
    el.style.scrollSnapType = 'none'
    startX = pageX(e) - el.offsetLeft
    startScrollLeft = el.scrollLeft
  }

  function onDragLeave() {
    endDrag()
  }

  function onDragEnd() {
    endDrag()
    // 下一帧重置 dragMoved，确保点击事件能正确识别为非拖拽
    requestAnimationFrame(() => {
      dragMoved.value = false
    })
  }

  /** 结束拖拽：恢复光标与 snap，并对齐到最近幻灯片 */
  function endDrag() {
    const el = sliderRef.value
    if (!el) {
      isDragging.value = false
      return
    }
    isDragging.value = false
    el.style.cursor = ''
    el.style.scrollSnapType = ''
    snapToSlide()
  }

  /** 拖拽移动：按位移差 * 1.5 加速滚动，未超过阈值时不标记为已移动 */
  function onDragMove(e: MouseEvent | TouchEvent) {
    if (!isDragging.value || !sliderRef.value) return
    const dx = (pageX(e) - sliderRef.value.offsetLeft - startX) * 1.5
    const threshold = options.dragThreshold ?? 0
    if (!dragMoved.value && Math.abs(dx) < threshold) return
    dragMoved.value = true
    e.preventDefault()
    sliderRef.value.scrollLeft = startScrollLeft - dx
  }

  /** 根据当前 scrollLeft 对齐到最近的幻灯片索引 */
  function snapToSlide() {
    if (!sliderRef.value) return
    const w = sliderRef.value.clientWidth
    activeSlide.value = Math.round(sliderRef.value.scrollLeft / w)
  }

  /** 平滑滚动到指定索引的幻灯片（拖拽中不响应） */
  function scrollToSlide(idx: number) {
    if (!sliderRef.value || isDragging.value) return
    activeSlide.value = idx
    sliderRef.value.scrollTo({ left: idx * sliderRef.value.clientWidth, behavior: 'smooth' })
  }

  /** scroll 事件回调：拖拽中不响应，否则按 scrollLeft 更新当前幻灯片索引 */
  function onScroll() {
    if (!sliderRef.value || isDragging.value) return
    const w = sliderRef.value.clientWidth
    activeSlide.value = Math.round(sliderRef.value.scrollLeft / w)
  }

  onMounted(() => {
    sliderRef.value?.addEventListener('scroll', onScroll, { passive: true })
  })

  onUnmounted(() => {
    sliderRef.value?.removeEventListener('scroll', onScroll)
  })

  return {
    isDragging,
    dragMoved,
    onDragStart,
    onDragLeave,
    onDragEnd,
    onDragMove,
    snapToSlide,
    scrollToSlide,
  }
}