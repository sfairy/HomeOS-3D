/**
 * 设置面板视口与分页组合式函数
 * 
 * 职责：提供设置面板的侧边栏重入重置、自适应分页等功能
 * 依赖：
 *   - vue - 响应式系统与生命周期钩子
 *   - vue-router - 路由相关功能
 * 
 * 功能模块：
 *   - useSettingsSidebarReentryReset - 侧边栏重入时重置子 Tab
 *   - useAdaptiveViewportPagination - 自适应视口分页
 *   - useFixedPagePagination - 固定页数分页
 */
import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue'
import { useRoute } from 'vue-router'

// ── useSettingsSidebarReentryReset ──
/**
 * keep-alive 设置面板：从其它侧栏 Tab 再次进入本页时重置 Hub / Orch 子 Tab。
 * 若 URL 含 ?section= 深链则跳过，避免覆盖跳转目标。
 */
export function useSettingsSidebarReentryReset(
  activeTabSource: MaybeRefOrGetter<string>,
  selfTab: string,
  resetFn: () => void,
) {
  const route = useRoute()
  watch(
    () => unref(activeTabSource),
    (tab, prev) => {
      if (tab === selfTab && prev && prev !== selfTab) {
        if (route.query.section) return
        resetFn()
      }
    },
  )
}

// ── useAdaptiveViewportPagination ──
interface AdaptiveViewportPaginationOptions {
  viewportRef: Ref<HTMLElement | null>
  rowMeasureRef: Ref<HTMLElement | null>
  itemCount: Ref<number>
  gap?: number
  minPerPage?: number
  enabled?: Ref<boolean>
}

/** 根据容器高度与行高计算每页条数，支持上下页切换（无滚动条） */
export function useAdaptiveViewportPagination(options: AdaptiveViewportPaginationOptions) {
  const {
    viewportRef,
    rowMeasureRef,
    itemCount,
    gap = 8,
    minPerPage = 1,
    enabled = ref(true),
  } = options

  const currentPage = ref(1)
  const itemsPerPage = ref(minPerPage)
  const rowHeight = ref(0)

  let resizeObserver: ResizeObserver | null = null

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(itemCount.value / Math.max(itemsPerPage.value, 1))),
  )

  const canPrev = computed(() => currentPage.value > 1)
  const canNext = computed(() => currentPage.value < totalPages.value)

  const pageLabel = computed(() => `${currentPage.value} / ${totalPages.value}`)

  const sliceRange = computed(() => {
    const perPage = Math.max(itemsPerPage.value, 1)
    const start = (currentPage.value - 1) * perPage
    return { start, end: start + perPage }
  })

  function contentHeight(el: HTMLElement) {
    const styles = getComputedStyle(el)
    const pt = parseFloat(styles.paddingTop) || 0
    const pb = parseFloat(styles.paddingBottom) || 0
    return Math.max(0, el.clientHeight - pt - pb)
  }

  function recalculate() {
    if (!enabled.value) return

    const viewport = viewportRef.value
    const measure = rowMeasureRef.value
    if (!viewport || !measure) return

    const measuredRow = measure.offsetHeight
    if (measuredRow > 0) rowHeight.value = measuredRow

    const height = contentHeight(viewport)
    const row = rowHeight.value
    if (!height || !row) return

    const perPage = Math.max(minPerPage, Math.floor((height + gap) / (row + gap)))
    if (perPage !== itemsPerPage.value) {
      itemsPerPage.value = perPage
    }

    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
    }
  }

  function bindObserver() {
    resizeObserver?.disconnect()
    if (typeof ResizeObserver === 'undefined') return

    resizeObserver = new ResizeObserver(() => recalculate())
    if (viewportRef.value) resizeObserver.observe(viewportRef.value)
    if (rowMeasureRef.value) resizeObserver.observe(rowMeasureRef.value)
  }

  function prevPage() {
    if (!canPrev.value) return
    currentPage.value -= 1
  }

  function nextPage() {
    if (!canNext.value) return
    currentPage.value += 1
  }

  function resetPage() {
    currentPage.value = 1
  }

  function sliceItems<T>(items: T[] | null | undefined): T[] {
    if (!items?.length) return []
    const { start, end } = sliceRange.value
    return items.slice(start, end)
  }

  function globalIndex(localIndex: number) {
    return (currentPage.value - 1) * Math.max(itemsPerPage.value, 1) + localIndex + 1
  }

  watch(itemCount, () => {
    resetPage()
    nextTick(recalculate)
  })

  watch(totalPages, (pages) => {
    if (currentPage.value > pages) currentPage.value = pages
  })

  watch(enabled, (active) => {
    if (active) nextTick(() => {
      bindObserver()
      recalculate()
    })
  })

  onMounted(async () => {
    await nextTick()
    bindObserver()
    recalculate()
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  return {
    currentPage,
    itemsPerPage,
    totalPages,
    canPrev,
    canNext,
    pageLabel,
    prevPage,
    nextPage,
    resetPage,
    recalculate,
    sliceItems,
    globalIndex,
  }
}

// ── useFixedPagePagination ──
interface FixedPagePaginationOptions {
  itemCount: Ref<number>
  perPage: number
}

/** 固定每页条数，上下页切换（无滚动条） */
export function useFixedPagePagination(options: FixedPagePaginationOptions) {
  const { itemCount, perPage } = options

  const currentPage = ref(1)
  const itemsPerPage = computed(() => perPage)

  const totalPages = computed(() =>
    Math.max(1, Math.ceil(itemCount.value / Math.max(perPage, 1))),
  )

  const canPrev = computed(() => currentPage.value > 1)
  const canNext = computed(() => currentPage.value < totalPages.value)

  const pageLabel = computed(() => `${currentPage.value} / ${totalPages.value}`)

  const sliceRange = computed(() => {
    const start = (currentPage.value - 1) * perPage
    return { start, end: start + perPage }
  })

  function prevPage() {
    if (!canPrev.value) return
    currentPage.value -= 1
  }

  function nextPage() {
    if (!canNext.value) return
    currentPage.value += 1
  }

  function resetPage() {
    currentPage.value = 1
  }

  function sliceItems<T>(items: T[] | null | undefined): T[] {
    if (!items?.length) return []
    const { start, end } = sliceRange.value
    return items.slice(start, end)
  }

  function globalIndex(localIndex: number) {
    return (currentPage.value - 1) * perPage + localIndex + 1
  }

  watch(itemCount, () => {
    resetPage()
  })

  watch(totalPages, (pages) => {
    if (currentPage.value > pages) currentPage.value = pages
  })

  return {
    currentPage,
    itemsPerPage,
    totalPages,
    canPrev,
    canNext,
    pageLabel,
    prevPage,
    nextPage,
    resetPage,
    sliceItems,
    globalIndex,
  }
}
