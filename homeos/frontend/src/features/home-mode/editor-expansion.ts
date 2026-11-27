/**
 * @file editor-expansion.internals.ts
 * @module frontend/src/features/home-mode/composables
 */
/** 家居模式编辑器：列表项展开 / focus 高亮 */

import type { MaybeRefOrGetter } from 'vue'
import { computed, ref, toValue, watch } from 'vue'

const COMPACT_THRESHOLD = 3

export function useHomeModeItemExpansion(countSource: MaybeRefOrGetter<number>) {
  const expandedIndex = ref<number | null>(null)
  const expandedAll = ref(false)

  const count = computed(() => toValue(countSource))
  const isCompact = computed(() => count.value >= COMPACT_THRESHOLD)

  function isExpanded(index: number) {
    if (!isCompact.value) return true
    if (expandedAll.value) return true
    return expandedIndex.value === index
  }

  function selectItem(index: number) {
    if (!isCompact.value) return
    expandedAll.value = false
    expandedIndex.value = index
  }

  function focusItem(index: number) {
    if (!isCompact.value) return
    expandedAll.value = false
    expandedIndex.value = index
  }

  function expandAll() {
    if (!isCompact.value) return
    expandedAll.value = true
    expandedIndex.value = null
  }

  function collapseAll() {
    if (!isCompact.value) return
    expandedAll.value = false
    expandedIndex.value = null
  }

  function onCountChange(next: number, prev: number, preferIndex?: number) {
    if (next < COMPACT_THRESHOLD) {
      expandedAll.value = false
      expandedIndex.value = null
      return
    }
    if (prev < COMPACT_THRESHOLD && next >= COMPACT_THRESHOLD) {
      expandedIndex.value = prev > 0 && next > prev ? (preferIndex ?? next - 1) : 0
      expandedAll.value = false
      return
    }
    if (next > prev) {
      expandedAll.value = false
      expandedIndex.value = preferIndex ?? next - 1
      return
    }
    if (next < prev) {
      expandedAll.value = false
      if (expandedIndex.value !== null && expandedIndex.value >= next) {
        expandedIndex.value = Math.max(0, next - 1)
      }
    }
  }

  function syncIndexAfterMove(from: number, to: number) {
    if (expandedAll.value || expandedIndex.value === null) return
    const current = expandedIndex.value
    if (current === from) {
      expandedIndex.value = to
    } else if (from < current && to >= current) {
      expandedIndex.value = current - 1
    } else if (from > current && to <= current) {
      expandedIndex.value = current + 1
    }
  }

  watch(
    count,
    (next, old) => {
      const prev = old ?? 0
      const preferIndex = next > prev ? next - 1 : undefined
      onCountChange(next, prev, preferIndex)
    },
    { immediate: true },
  )

  const activeTabIndex = computed(() => {
    if (!isCompact.value || expandedAll.value) return null
    return expandedIndex.value
  })

  return {
    expandedIndex,
    expandedAll,
    isCompact,
    activeTabIndex,
    isExpanded,
    selectItem,
    focusItem,
    expandAll,
    collapseAll,
    syncIndexAfterMove,
  }
}

/** 监听父级 focus 请求，执行选中/滚动并短暂高亮 */
export function useHomeModeItemFocus(
  focusEpoch: () => number,
  focusIndex: () => number | null,
  onFocus: (index: number) => void | Promise<void>,
) {
  const pulseIndex = ref<number | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(focusEpoch, async () => {
    const index = focusIndex()
    if (index == null || index < 0) return
    await onFocus(index)
    pulseIndex.value = index
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      pulseIndex.value = null
      timer = null
    }, 1200)
  })

  return { pulseIndex }
}
