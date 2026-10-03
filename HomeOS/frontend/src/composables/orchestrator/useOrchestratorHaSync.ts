/**
 * @file useOrchestratorHaSync.ts
 * @module frontend/src/composables
 */
import { ref } from 'vue'
import {
  fetchOrchestratorSyncPreview,
  syncOrchestratorItemToHa,
  repairOrchestratorDrift,
  syncAllOrchestratorToHa,
  repairAllOrchestratorDrift,
  pullOrchestratorFromHa,
  syncOrchestratorFromHa,
  removeOrchestratorFromHa,
} from '@/services/api/orchestrator'
import { useChromeStore } from '@/stores/chrome.store'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { hasHaLink } from '@/utils/orchestrator/sync-issues.util'
import {
  fetchOrchestratorBulkSyncStatuses,
  invalidateOrchestratorSyncPrefix,
} from '@/utils/orchestrator/sync-status-cache.util'
import { orchestratorDriftDialog } from '@/composables/orchestrator/useOrchestratorDriftDialog'

/** 单条联动器条目的 HA 同步状态（后端返回形状的子集） */
interface SyncStatusInfo {
  drift?: boolean
  synced?: boolean
  lastSyncError?: string
  localHash?: string
  haHash?: string
  haConfigId?: string
  [key: string]: unknown
}

/** 联动器列表条目在本模块中用到的字段 */
interface OrchestratorListItem {
  id?: string | number
  name?: string
  alias?: string
  [key: string]: unknown
}

function formatSyncAllMessage(data: Record<string, unknown> | null | undefined) {
  if (!data) return '批量同步失败'
  let msg = `推送完成: ${data.synced || 0} 成功, ${data.failed || 0} 失败`
  if (data.repaired) msg += `, 修复漂移 ${data.repaired}`
  return msg
}

/** 联动中心 HA 同步通用逻辑（自动化/场景/脚本/模板实体） */
export function useOrchestratorHaSync(apiPrefix: string) {
  const chrome = useChromeStore()
  const syncing = ref(false)
  const syncStatusMap = ref<Record<string, SyncStatusInfo>>({})
  /** 批量修复进度：{ current, total, name } | null */
  const repairProgress = ref<{ current: number; total: number; name: string } | null>(null)

  async function loadSyncStatuses(items: OrchestratorListItem[]) {
    const linked = (items || []).filter(hasHaLink)
    if (!linked.length) {
      syncStatusMap.value = {}
      return
    }
    try {
      syncStatusMap.value = (await fetchOrchestratorBulkSyncStatuses(
        apiPrefix,
        linked.map((item) => String(item.id)),
      )) as Record<string, SyncStatusInfo>
    } catch (e) {
      logger.debug(`批量同步状态失败 [${apiPrefix}]`, e)
      // 保留旧 map，避免失败时伪装成「无漂移」
    }
  }

  async function fetchSyncPreview(item: OrchestratorListItem) {
    const res = await fetchOrchestratorSyncPreview(apiPrefix, String(item.id))
    return res.data || {}
  }

  async function syncItem(item: OrchestratorListItem, options: { skipPreview?: boolean } = {}) {
    if (!options.skipPreview) {
      try {
        const preview = (await fetchSyncPreview(item)) as {
          hasChanges?: boolean
          haYaml?: string
          diff?: { preview?: string[]; changed?: number }
        }
        if (preview.hasChanges && preview.haYaml) {
          const lines = preview.diff?.preview?.slice(0, 14) || []
          const summary = lines.length
            ? lines.join('\n')
            : `变更约 ${preview.diff?.changed || 0} 行`
          const ok = await chrome.confirm(
            `推送到 HA 将覆盖远端配置，是否继续？\n\n${summary}${lines.length >= 14 ? '\n…' : ''}`,
            '推送到 HA',
          )
          if (!ok) return { ok: false, message: '已取消同步' }
        }
      } catch (e) {
        logger.debug(`同步预览已跳过 [${apiPrefix}/${item.id}]`, e)
      }
    }
    syncing.value = true
    try {
      const res = await syncOrchestratorItemToHa(apiPrefix, String(item.id))
      invalidateOrchestratorSyncPrefix(apiPrefix)
      const data = res.data as Record<string, unknown>
      return {
        ok: !!data?.success,
        message: String(data?.message || (data?.success ? '已同步' : '同步失败')),
        haConfigId: data?.haConfigId,
      }
    } catch (e) {
      return { ok: false, message: getApiErrorMessage(e, '同步失败') }
    } finally {
      syncing.value = false
    }
  }

  async function repairDriftItem(
    item: OrchestratorListItem,
    direction = 'push',
    options: { skipDiffConfirm?: boolean; useSyncing?: boolean } = {},
  ) {
    const manageSyncing = options.useSyncing !== false
    if (!options.skipDiffConfirm) {
      try {
        const preview = (await fetchSyncPreview(item)) as {
          hasChanges?: boolean
          localYaml?: string
          haYaml?: string
          diff?: { preview?: string[]; added?: number; removed?: number; changed?: number }
        }
        if (preview.hasChanges && (preview.localYaml || preview.haYaml)) {
          const ok = await orchestratorDriftDialog.openDriftDialog({
            itemName: item.name || item.alias || String(item.id),
            direction: direction === 'pull' ? 'pull' : 'push',
            localYaml: preview.localYaml || '',
            haYaml: preview.haYaml || '',
            diffPreview: preview.diff?.preview || [],
            diffStats: {
              added: preview.diff?.added || 0,
              removed: preview.diff?.removed || 0,
              changed: preview.diff?.changed || 0,
            },
          })
          if (!ok) return { ok: false, message: '已取消修复' }
        }
      } catch (e) {
        logger.debug(`漂移差异预览已跳过 [${apiPrefix}/${item.id}]`, e)
      }
    }
    if (manageSyncing) syncing.value = true
    try {
      const res = await repairOrchestratorDrift(apiPrefix, String(item.id), direction)
      invalidateOrchestratorSyncPrefix(apiPrefix)
      const data = res.data as Record<string, unknown>
      return {
        ok: !!data?.success,
        message: String(data?.message || (data?.success ? '漂移已修复' : '修复失败')),
      }
    } catch (e) {
      return { ok: false, message: getApiErrorMessage(e, '漂移修复失败') }
    } finally {
      if (manageSyncing) syncing.value = false
    }
  }

  async function syncAllToHa() {
    syncing.value = true
    try {
      const res = await syncAllOrchestratorToHa(apiPrefix)
      const data = (res.data || {}) as Record<string, unknown>
      return {
        ok: ((data.failed as number) || 0) === 0,
        message: formatSyncAllMessage(data),
        data,
      }
    } catch {
      return { ok: false, message: '批量同步失败' }
    } finally {
      syncing.value = false
    }
  }

  async function repairAllDrift(direction = 'push', items: OrchestratorListItem[] | null = null) {
    const driftItems = (items || []).filter(
      (item) => item.id != null && syncStatusMap.value[String(item.id)]?.drift,
    )
    if (driftItems.length > 0) {
      syncing.value = true
      repairProgress.value = { current: 0, total: driftItems.length, name: '' }
      let repaired = 0
      let failed = 0
      const errors: string[] = []
      try {
        for (let i = 0; i < driftItems.length; i++) {
          const item = driftItems[i]
          repairProgress.value = {
            current: i + 1,
            total: driftItems.length,
            name: item.name || item.alias || String(item.id),
          }
          const r = await repairDriftItem(item, direction, { useSyncing: false })
          if (r.ok) repaired++
          else {
            failed++
            errors.push(`${item.name || item.id}: ${r.message}`)
          }
        }
        repairProgress.value = { current: driftItems.length, total: driftItems.length, name: '' }
        return {
          ok: failed === 0,
          message: `修复完成: ${repaired} 成功, ${failed} 失败`,
          data: { repaired, failed, errors },
        }
      } catch (e) {
        return { ok: false, message: getApiErrorMessage(e, '批量修复失败') }
      } finally {
        syncing.value = false
        repairProgress.value = null
      }
    }
    syncing.value = true
    try {
      const res = await repairAllOrchestratorDrift(apiPrefix, direction)
      const data = (res.data || {}) as Record<string, unknown>
      return {
        ok: ((data.failed as number) || 0) === 0,
        message: `修复完成: ${data.repaired || 0} 成功, ${data.failed || 0} 失败`,
        data,
      }
    } catch (e) {
      return { ok: false, message: getApiErrorMessage(e, '批量修复失败') }
    } finally {
      syncing.value = false
    }
  }

  async function pullAllFromHa(options: { allHaScenes?: boolean } = {}) {
    syncing.value = true
    try {
      const params = options.allHaScenes ? { all: 'true' } : undefined
      const res = await pullOrchestratorFromHa(apiPrefix, params)
      const data = res.data as Record<string, unknown>
      const suffix = options.allHaScenes && apiPrefix === 'scene' ? '（含全部 HA 场景）' : ''
      return {
        ok: true,
        message: `导入 ${data?.imported || 0} 条, 更新 ${data?.updated || 0} 条` + suffix,
      }
    } catch {
      return { ok: false, message: '拉取失败' }
    } finally {
      syncing.value = false
    }
  }

  async function importFromHa(
    haConfigId: string,
    extra: Record<string, unknown> = {},
    options: { useSyncing?: boolean; timeoutMs?: number } = {},
  ) {
    const useSyncing = options.useSyncing !== false && apiPrefix !== 'template-entity'
    if (useSyncing) syncing.value = true
    try {
      const res = await syncOrchestratorFromHa(apiPrefix, haConfigId, extra, {
        timeout: options.timeoutMs || 30000,
      })
      const data = res.data as Record<string, unknown>
      return {
        ok: !!data?.success,
        message: String(data?.message || '已导入'),
        templateId: data?.templateId != null ? String(data.templateId) : undefined,
        localId:
          data?.automationId != null
            ? String(data.automationId)
            : data?.scriptId != null
              ? String(data.scriptId)
              : data?.sceneId != null
                ? String(data.sceneId)
                : data?.localId != null
                  ? String(data.localId)
                  : undefined,
      }
    } catch (e) {
      return { ok: false, message: getApiErrorMessage(e, '导入失败') }
    } finally {
      if (useSyncing) syncing.value = false
    }
  }

  const deletingHaId = ref<string | null>(null)

  async function removeFromHa(item: Record<string, unknown>, options: { timeoutMs?: number } = {}) {
    const haConfigId = item?.ha_config_id || item?.haConfigId
    const entryId = item?.config_entry_id || item?.ha_config_entry_id
    const key = haConfigId || entryId || item?.entity_id
    if (!key) return { ok: false, message: '缺少 HA 配置标识' }
    if (!haConfigId && !entryId) {
      return { ok: false, message: '无法删除：缺少配置 ID' }
    }
    deletingHaId.value = String(key)
    try {
      const res = await removeOrchestratorFromHa(
        apiPrefix,
        {
          haConfigId: haConfigId || '',
          ha_config_entry_id: entryId,
          config_entry_id: entryId,
          entity_id: item?.entity_id,
          name: item?.name,
        },
        { timeout: options.timeoutMs || 15000 },
      )
      const data = res.data as Record<string, unknown>
      return {
        ok: !!data?.success,
        message: String(data?.message || (data?.success ? '已从 HA 删除' : '删除失败')),
      }
    } catch (e) {
      return { ok: false, message: getApiErrorMessage(e, '从 HA 删除失败') }
    } finally {
      deletingHaId.value = null
    }
  }

  return {
    syncing,
    syncStatusMap,
    repairProgress,
    deletingHaId,
    loadSyncStatuses,
    fetchSyncPreview,
    syncItem,
    repairDriftItem,
    repairAllDrift,
    syncAllToHa,
    pullAllFromHa,
    importFromHa,
    removeFromHa,
  }
}
