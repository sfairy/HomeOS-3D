/**
 * @file alert-rules-earthquake.internals.ts
 * @module frontend/src/views
 */
/** 告警规则：地震预警布局切片 */
import { afterLayoutCancelSync, syncGlobalLayoutPendingSnapshot, useSettingsHubPending } from '@/composables/settings-kernel/pending.internals'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { applyEarthquakeLayoutSlice, type pickEarthquakeLayoutSlice } from '../display/layout-dashboard.internals'
import { createDefaultEarthquakeConfig } from '@/shared/types/earthquake'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { ref } from 'vue'

export function useAlertRulesEarthquake() {
  const chrome = useChromeStore()
  const layoutStore = useLayoutStore()
  const initialEarthquakeSnapshot = ref<string | null>(null)
  const earthquakeSaving = ref(false)

  function earthquakeLayoutCurrent() {
    // 返回 store 活引用，便于 pending deep-watch；勿 clone（否则改开关不会触发未保存）
    return {
      earthquakeConfig:
        layoutStore.layoutConfig.earthquakeConfig || createDefaultEarthquakeConfig(),
    }
  }

  function snapshotEarthquakeFromStore() {
    snapshotEarthquake(earthquakeLayoutCurrent())
  }

  const {
    pendingCount: earthquakePending,
    pendingLabel: earthquakePendingLabel,
    takeSnapshot: snapshotEarthquake,
    confirmAndRevert: confirmEarthquakeRevert,
    revertSilently: revertEarthquakeSilently,
  } = useSettingsHubPending({
    snapshot: initialEarthquakeSnapshot,
    current: earthquakeLayoutCurrent,
    ready: () => layoutStore.isConfigLoaded,
    applyBaseline: (baseline) => {
      applyEarthquakeLayoutSlice(
        layoutStore.layoutConfig,
        baseline as ReturnType<typeof pickEarthquakeLayoutSlice>,
      )
    },
  })

  async function cancelEarthquakeChanges() {
    await confirmEarthquakeRevert(
      chrome,
      (baseline) => {
        applyEarthquakeLayoutSlice(
          layoutStore.layoutConfig,
          baseline as ReturnType<typeof pickEarthquakeLayoutSlice>,
        )
      },
      { onReverted: () => afterLayoutCancelSync(layoutStore.layoutConfig) },
    )
  }

  async function saveEarthquake() {
    earthquakeSaving.value = true
    try {
      const ok = await layoutStore.saveLayout(true)
      if (ok) {
        snapshotEarthquakeFromStore()
        syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
        chrome.notify('地震预警配置已保存', 'success')
      } else {
        chrome.notify('保存失败', 'error')
      }
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '保存失败'), 'error')
    } finally {
      earthquakeSaving.value = false
    }
  }


  return {
    earthquakePending,
    earthquakePendingLabel,
    earthquakeSaving,
    snapshotEarthquakeFromStore,
    saveEarthquake,
    cancelEarthquakeChanges,
    revertEarthquakeDraft: revertEarthquakeSilently,
  }
}
