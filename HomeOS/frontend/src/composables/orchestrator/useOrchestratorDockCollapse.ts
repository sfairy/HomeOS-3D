/**
 * @file useOrchestratorDockCollapse.ts
 * @module frontend/src/composables
 */
import { readLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'

import { ref } from 'vue'

function readStored(storageKey: string | null | undefined, defaultCollapsed: boolean): boolean {
  if (!storageKey || typeof localStorage === 'undefined') return defaultCollapsed
  try {
    const stored = readLocalStorage(storageKey)
    if (stored === '0') return false
    if (stored === '1') return true
  } catch {
    /* 忽略配额 / 隐私模式 */
  }
  return defaultCollapsed
}

function writeStored(storageKey: string | null | undefined, collapsed: boolean) {
  if (!storageKey) return
  try {
    writeLocalStorage(storageKey, collapsed ? '1' : '0')
  } catch {
    /* 忽略 */
  }
}

/** 联动 Builder 底部/侧栏折叠状态，可选 localStorage 持久化 */
export function useOrchestratorDockCollapse(
  storageKey: string | null | undefined,
  defaultCollapsed = false,
) {
  const collapsed = ref(readStored(storageKey, defaultCollapsed))

  function toggle() {
    collapsed.value = !collapsed.value
    writeStored(storageKey, collapsed.value)
  }

  function setCollapsed(value: boolean) {
    collapsed.value = value
    writeStored(storageKey, value)
  }

  return { collapsed, toggle, setCollapsed }
}
