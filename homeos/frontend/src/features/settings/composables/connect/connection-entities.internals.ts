/**
 * @file connection-entities.internals.ts
 * @module frontend/src/features/settings/composables/connect
 */
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { logger } from '@/shared/utils/core/logger'
import { formatShortDateTime } from '@/shared/utils/format/locale-format.util'
import { buildEntitySyncRecommendations } from '@/shared/recommend/utils/entity-sync-recommend.util'
import { handleSystemConfigPatchError, patchSystemConfig, useSystemConfig } from '@/composables/config/system-config-core.internals'
import { computed, ref } from 'vue'

export function useConnectionEntities(onRefreshSuccess?: () => void | Promise<void>) {
  const entitiesStore = useEntitiesStore()
  const chrome = useChromeStore()
  const { load: loadSystemConfig, getCached } = useSystemConfig()
  const syncOnlyEnabledEntities = ref(true)
  const syncFilterSaving = ref(false)
  const syncFilterFeedback = ref<{ ok?: boolean; message: string } | null>(null)
  const refreshingEntities = ref(false)
  const refreshFeedback = ref<{ ok?: boolean; message: string } | null>(null)

  async function loadSyncFilterSetting() {
    try {
      const cfg = await loadSystemConfig({ force: !getCached() })
      syncOnlyEnabledEntities.value = cfg?.haConnector?.syncOnlyEnabledEntities !== false
    } catch (e) {
      logger.warn('加载实体同步过滤配置失败', e)
      syncFilterFeedback.value = {
        ok: false,
        message: getApiErrorMessage(e, '加载实体同步过滤配置失败'),
      }
    }
  }

  function toggleSyncFilter() {
    if (syncFilterSaving.value) return
    syncOnlyEnabledEntities.value = !syncOnlyEnabledEntities.value
    onSyncFilterToggle()
  }

  async function onSyncFilterToggle() {
    syncFilterSaving.value = true
    syncFilterFeedback.value = { message: '正在保存…' }
    try {
      await patchSystemConfig({
        haConnector: { syncOnlyEnabledEntities: syncOnlyEnabledEntities.value },
      })
      syncFilterFeedback.value = {
        ok: true,
        message: syncOnlyEnabledEntities.value
          ? '已保存；已启用过滤，建议点击「刷新实体」与 HA 对齐'
          : '已保存；关闭过滤后请点击「刷新实体」以拉取全部实体',
      }
    } catch (e) {
      if (await handleSystemConfigPatchError(e, chrome)) {
        await loadSyncFilterSetting()
        syncFilterFeedback.value = {
          ok: false,
          message: '配置已被其他终端修改，已重新加载',
        }
        return
      }
      syncFilterFeedback.value = {
        ok: false,
        message: getApiErrorMessage(e, '保存失败'),
      }
      syncOnlyEnabledEntities.value = !syncOnlyEnabledEntities.value
    } finally {
      syncFilterSaving.value = false
    }
  }

  async function refreshEntities() {
    refreshingEntities.value = true
    refreshFeedback.value = { message: '正在从 HA 重新同步实体…' }
    try {
      const result = await entitiesStore.refreshEntitiesFromServer()
      if (result.ok) {
        refreshFeedback.value = {
          ok: true,
          message: result.count > 0 ? `已加载 ${result.count} 个实体` : '已同步，当前 0 个实体',
        }
        await onRefreshSuccess?.()
      } else {
        refreshFeedback.value = { ok: false, message: '刷新失败，请检查 HA 连接或稍后重试' }
      }
    } catch (e) {
      refreshFeedback.value = {
        ok: false,
        message: (e as { message?: string })?.message || '刷新失败',
      }
    } finally {
      refreshingEntities.value = false
    }
  }

  function formatCacheTime(ts: number | null | undefined) {
    if (!ts) return '—'
    return formatShortDateTime(ts) || '—'
  }

  const entitySyncInsight = computed(() =>
    buildEntitySyncRecommendations({
      totalCount: entitiesStore.totalCount,
      syncOnlyEnabledEntities: syncOnlyEnabledEntities.value,
      cacheHydrated: entitiesStore.entitiesCacheHydrated,
    }),
  )

  async function handleEntitySyncBanner(banner: { id: string }) {
    if (banner.id === 'enable-sync-filter' && !syncOnlyEnabledEntities.value) {
      syncOnlyEnabledEntities.value = true
      await onSyncFilterToggle()
    } else if (banner.id === 'refresh-entities') {
      await refreshEntities()
    }
  }

  return {
    entitiesStore,
    syncOnlyEnabledEntities,
    syncFilterSaving,
    syncFilterFeedback,
    refreshingEntities,
    refreshFeedback,
    loadSyncFilterSetting,
    toggleSyncFilter,
    formatCacheTime,
    refreshEntities,
    entitySyncInsight,
    handleEntitySyncBanner,
  }
}
