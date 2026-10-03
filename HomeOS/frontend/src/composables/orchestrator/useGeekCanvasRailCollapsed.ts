/**
 * @file Geek 画布左侧投放栏折叠状态（localStorage 持久化）
 */
import { readLocalStorageFlag, writeLocalStorage } from '@/utils/core/local-storage.util'

import { ref } from 'vue'

/**
 * @param storageKey localStorage 键；空字符串则不持久化
 */
export function useGeekCanvasRailCollapsed(storageKey: string) {
  const railCollapsed = ref(
    Boolean(
      storageKey &&
        typeof localStorage !== 'undefined' &&
        readLocalStorageFlag(storageKey),
    ),
  )

  function toggleRail() {
    railCollapsed.value = !railCollapsed.value
    if (!storageKey || typeof localStorage === 'undefined') return
    try {
      writeLocalStorage(storageKey, railCollapsed.value ? '1' : '0')
    } catch {
      /* 忽略配额 / 隐私模式 */
    }
  }

  function hydrateRailCollapsed() {
    if (!storageKey || typeof localStorage === 'undefined') return
    try {
      railCollapsed.value = readLocalStorageFlag(storageKey)
    } catch {
      /* 忽略 */
    }
  }

  return { railCollapsed, toggleRail, hydrateRailCollapsed }
}
