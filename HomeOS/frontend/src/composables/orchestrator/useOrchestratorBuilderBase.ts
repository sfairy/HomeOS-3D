/**
 * @file useOrchestratorBuilderBase.ts
 * @module frontend/src/composables
 */
import { ref, computed, inject, nextTick } from 'vue'
import {
  fetchOrchestratorList,
  deleteOrchestratorItem,
  discoverHaOrchestratorItems,
  type OrchestratorKind,
} from '@/services/api/orchestrator'
import { useChromeStore } from '@/stores/chrome.store'
import { flashBuilderResult, useBuilderFeedback } from '@/composables/orchestrator/useBuilderUtils'
import { useOrchestratorHaSync } from '@/composables/orchestrator/useOrchestratorHaSync'
import { ORCHESTRATOR_REFRESH_OVERVIEW_KEY } from '@/composables/orchestrator/orchestrator-inject-keys'
import { useOrchestratorDriftFocus } from '@/composables/orchestrator/useOrchestratorDriftFocus'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { normalizeCrudListResponse } from '@/utils/orchestrator/sync-issues.util'

/**
 * Scene / Script / Automation Builder 共用的 CRUD + HA 同步逻辑
 */
export function useOrchestratorBuilderBase(opts: {
  kind: OrchestratorKind
  apiPath: string
  haImportPath: string
  defaultShowSidebar?: boolean
  trackDiscovering?: boolean
  discoverRequestOptions?: Record<string, unknown>
  getDiscoverParams?: () => Record<string, unknown>
  onDiscoverError?: (err: unknown) => void
}) {
  const chrome = useChromeStore()
  const refreshOrchOverview = inject(ORCHESTRATOR_REFRESH_OVERVIEW_KEY, null) as (() => void) | null
  const { resultMsg, resultOk, withSyncFeedback, dismissAfter } = useBuilderFeedback()
  const haSync = useOrchestratorHaSync(opts.kind)

  useOrchestratorDriftFocus(() => {
    void nextTick(() => {
      document.querySelector('.orch-sync-alert')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  })

  const saving = ref(false)
  const runOnHa = ref(false)
  const editingId = ref<string | null>(null)
  const storedYaml = ref<string>('')
  const formSnapshot = ref<string>('')
  const savedList = ref<Array<Record<string, unknown>>>([])
  const haImportList = ref<Array<Record<string, unknown>>>([])
  const haDiscovering = ref(false)
  const showSidebar = ref(opts.defaultShowSidebar ?? true)
  const showDeleteConfirm = ref(false)
  const deleteTarget = ref<Record<string, unknown> | null>(null)
  const deleteMode = ref('local')
  const deletingLocal = ref(false)
  const driftCount = computed(
    () => Object.values(haSync.syncStatusMap.value).filter((s) => s?.drift).length,
  )

  function makeFormTouched(formSignature: () => string) {
    return computed(() => {
      if (!storedYaml.value && !formSnapshot.value) return false
      return formSnapshot.value !== formSignature()
    })
  }

  async function loadList() {
    try {
      const resp = await fetchOrchestratorList(opts.kind)
      savedList.value = normalizeCrudListResponse(resp.data).rows
      await haSync.loadSyncStatuses(savedList.value as Array<{ id: string | number }>)
      refreshOrchOverview?.()
    } catch (err) {
      logger.warn(`${opts.kind} 列表加载失败`, err)
      flashBuilderResult(
        resultMsg,
        resultOk,
        getApiErrorMessage(err, `${opts.kind} 列表加载失败`),
        false,
        dismissAfter,
        3000,
      )
    }
  }

  async function discoverHA(forceRefresh = false) {
    if (opts.trackDiscovering) haDiscovering.value = true
    try {
      const baseParams = (opts.discoverRequestOptions?.params as Record<string, unknown>) || {}
      const dynamicParams =
        typeof opts.getDiscoverParams === 'function' ? opts.getDiscoverParams() : {}
      const resp = await discoverHaOrchestratorItems(opts.kind, {
        ...baseParams,
        ...dynamicParams,
        ...(forceRefresh ? { refresh: '1' } : {}),
      })
      const raw = (resp.data as Array<Record<string, unknown>>) || []
      const seen = new Set<string>()
      haImportList.value = raw.filter((item) => {
        const key = String(item.entity_id ?? item.ha_config_id ?? item.config_entry_id ?? '')
        if (!key) return true
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    } catch (err) {
      logger.warn(`HA ${opts.kind} 发现失败`, err)
      if (opts.onDiscoverError) {
        opts.onDiscoverError(err)
      } else {
        flashBuilderResult(
          resultMsg,
          resultOk,
          getApiErrorMessage(err, `HA ${opts.kind} 发现失败`),
          false,
          dismissAfter,
          3000,
        )
      }
    } finally {
      if (opts.trackDiscovering) haDiscovering.value = false
    }
  }

  async function doSync(item: Record<string, unknown>) {
    await withSyncFeedback(() => haSync.syncItem(item as { id: string | number }), {
      reload: loadList,
      after: () => discoverHA(true),
    })
  }

  async function doRepair(item: Record<string, unknown>) {
    await withSyncFeedback(() => haSync.repairDriftItem(item as { id: string | number }), {
      reload: loadList,
      after: () => discoverHA(true),
    })
  }

  async function doSyncAll() {
    await withSyncFeedback(() => haSync.syncAllToHa(), {
      reload: loadList,
      ttlMs: 3000,
      after: () => discoverHA(true),
    })
  }

  async function doRepairAll() {
    await withSyncFeedback(
      () => haSync.repairAllDrift('push', savedList.value as Array<{ id: string | number }>),
      {
        reload: loadList,
        ttlMs: 3000,
        after: () => discoverHA(true),
      },
    )
  }

  async function doPullAll(afterDiscover = true) {
    await withSyncFeedback(() => haSync.pullAllFromHa(), {
      reload: loadList,
      ttlMs: 3000,
      after: afterDiscover ? () => discoverHA() : undefined,
    })
  }

  async function doImport(item: Record<string, unknown>) {
    const haConfigId = item.ha_config_id || item.entity_id
    if (!haConfigId) return
    await withSyncFeedback(() => haSync.importFromHa(String(haConfigId)), {
      reload: loadList,
      after: () => discoverHA(true),
    })
  }

  function confirmHaDelete(item: Record<string, unknown>) {
    if (!item.ha_config_id) return
    deleteTarget.value = item
    deleteMode.value = 'ha'
    showDeleteConfirm.value = true
  }

  function confirmDelete(item: Record<string, unknown>) {
    deleteTarget.value = item
    deleteMode.value = 'local'
    showDeleteConfirm.value = true
  }

  function closeDeleteConfirm() {
    if (haSync.deletingHaId.value || deletingLocal.value) return
    showDeleteConfirm.value = false
    deleteTarget.value = null
    deleteMode.value = 'local'
  }

  async function executeDelete(messages?: {
    onDeletedCurrent?: () => void
    deleted?: (name: string) => string
    deleteFailed?: string
  }) {
    if (!deleteTarget.value || haSync.deletingHaId.value || deletingLocal.value) return
    const item = deleteTarget.value
    if (deleteMode.value === 'ha') {
      const r = await haSync.removeFromHa(item)
      showDeleteConfirm.value = false
      deleteTarget.value = null
      deleteMode.value = 'local'
      resultMsg.value = r.message
      resultOk.value = r.ok
      if (r.ok) {
        await discoverHA()
        await loadList()
      }
      dismissAfter(3000)
      return
    }
    const deletedId = item.id
    const wasEditing = editingId.value === deletedId
    showDeleteConfirm.value = false
    deleteTarget.value = null
    deleteMode.value = 'local'
    try {
      deletingLocal.value = true
      await deleteOrchestratorItem(opts.kind, String(item.id))
      await loadList()
      if (wasEditing) {
        editingId.value = null
        messages?.onDeletedCurrent?.()
      }
      flashBuilderResult(
        resultMsg,
        resultOk,
        messages?.deleted?.(String(item.name)) || `${item.name} 已删除`,
        true,
        dismissAfter,
        2000,
      )
    } catch (e) {
      logger.warn(`${opts.kind} 删除失败`, e)
      flashBuilderResult(
        resultMsg,
        resultOk,
        getApiErrorMessage(e, messages?.deleteFailed || `${opts.kind} 删除失败`),
        false,
        dismissAfter,
        2000,
      )
    } finally {
      deletingLocal.value = false
    }
  }

  async function editItem(
    item: Record<string, unknown>,
    onLoad?: (item: Record<string, unknown>) => Promise<void>,
  ) {
    editingId.value = String(item.id)
    runOnHa.value = !!item.runOnHa
    if (onLoad) await onLoad(item)
  }

  async function bulkImportDiscovered(importFlow: {
    doImport: (opts: {
      fetchFn: () => Promise<unknown[] | null | undefined>
      onEach?: (mapped: unknown, row?: unknown) => void | Promise<void>
    }) => Promise<unknown>
  }) {
    const rows = haImportList.value.filter((i) => i.ha_config_id)
    await importFlow.doImport({
      fetchFn: async () => rows,
      onEach: async (item) => {
        const row = item as Record<string, unknown>
        const haConfigId = row.ha_config_id || row.entity_id
        if (haConfigId) await haSync.importFromHa(String(haConfigId))
      },
    })
    await loadList()
    await discoverHA(true)
  }

  return {
    chrome,
    saving,
    runOnHa,
    editingId,
    storedYaml,
    formSnapshot,
    savedList,
    haImportList,
    haDiscovering,
    showSidebar,
    showDeleteConfirm,
    deleteTarget,
    deleteMode,
    deletingLocal,
    resultMsg,
    resultOk,
    driftCount,
    makeFormTouched,
    loadList,
    discoverHA,
    doSync,
    doRepair,
    doSyncAll,
    doRepairAll,
    doPullAll,
    doImport,
    bulkImportDiscovered,
    confirmHaDelete,
    confirmDelete,
    closeDeleteConfirm,
    executeDelete,
    editItem,
    ...haSync,
    withSyncFeedback,
    dismissAfter,
  }
}
