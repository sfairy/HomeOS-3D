/**
 * @file setup-wizard-doorbell.internals.ts
 * @module frontend/src/views
 */
/** 首装向导：门铃绑定 */
import { useLayoutStore } from '@/stores/layout.store'
import type { DoorbellConfig } from '@/shared/types/setup-wizard'
import { computed } from 'vue'

export function useSetupWizardDoorbells() {
  const layoutStore = useLayoutStore()
  const doorbellList = computed({
    get(): DoorbellConfig[] {
      const hc = layoutStore.layoutConfig.haConfig
      if (!hc.doorbells) hc.doorbells = []
      return hc.doorbells
    },
    set(v: DoorbellConfig[]) {
      layoutStore.layoutConfig.haConfig.doorbells = v
    },
  })

  function addDoorbell() {
    doorbellList.value.push({
      id: `db_${Date.now()}`,
      label: '新门铃',
      triggerEntityId: '',
      cameraEntityId: '',
      lockEntityId: '',
    })
  }

  function removeDoorbell(idx: number) {
    doorbellList.value = doorbellList.value.filter((_, i) => i !== idx)
  }

  return { doorbellList, addDoorbell, removeDoorbell }
}
