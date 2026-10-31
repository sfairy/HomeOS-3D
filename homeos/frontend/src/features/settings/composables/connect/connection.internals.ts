/**
 * @file connection.internals.ts
 * @module frontend/src/views
 */
/** composables：连接面板 / 凭证 / 展示 / 实体逻辑 */
import { useRegisterSettingsTabPending } from '@/composables/settings-kernel/pending.internals'
import { useSettingsHubRouteSection } from '@/features/settings/composables/hub-ui.internals'
import { useSettingsSidebarReentryReset } from '@/composables/ui/hub-viewport.internals'
import { computed, onMounted, ref } from 'vue'
import { useConnectionDisplay } from '@/features/settings/composables/connect/connection-display.internals'
import { useConnectionEntities } from '@/features/settings/composables/connect/connection-entities.internals'
import { useConnectionCredentials } from '@/features/settings/composables/connect/connection-credentials.internals'

// ── useConnectionPanel ──
/** HA 连接 Tab：聚合 display / credentials / entities 状态，供 Panel 页头保存与 Section 展示共用 */
export function useConnectionPanel(activeTab: () => string) {
  const connTab = ref('credentials')

  const display = useConnectionDisplay()
  const {
    entitiesStore,
    connTabs,
    backendReachable,
    haWsModeLabel,
    haWsModeBadgeMod,
    haWsModeDesc,
    connectionStatCells,
    loadHaWsMode,
  } = display

  const credentials = useConnectionCredentials(loadHaWsMode)
  const {
    haStore,
    draft,
    draftVerifyTls,
    showTokenInput,
    testing,
    testResult,
    saving,
    saveFeedback,
    pendingChanges,
    pendingLabel,
    snapshotHaConfigFromStore,
    copyHaUrl,
    copyHaFallbackUrl,
    saveAndReconnect,
    testConnection,
    cancelChanges,
  } = credentials

  const entities = useConnectionEntities(loadHaWsMode)
  const {
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
  } = entities

  // 第三参数：确认离开后从 store 重新读取 HA 配置，丢弃凭证草稿
  useRegisterSettingsTabPending('connection', () => pendingChanges.value > 0, () => {
    snapshotHaConfigFromStore()
    testResult.value = null
    saveFeedback.value = null
  })

  const connSections = computed(() => connTabs.value)

  useSettingsHubRouteSection(connTab, connSections, {
    tabId: 'connection',
    activeTab,
  })

  useSettingsSidebarReentryReset(activeTab, 'connection', () => {
    connTab.value = 'credentials'
  })

  onMounted(async () => {
    await loadSyncFilterSetting()
    // 连接记录是权威源：先拉一次再建「未保存」基线，否则草稿会比对的空快照。
    await haStore.load()
    snapshotHaConfigFromStore()
  })

  return {
    connTab,
    entitiesStore,
    connTabs,
    backendReachable,
    haWsModeLabel,
    haWsModeBadgeMod,
    haWsModeDesc,
    connectionStatCells,
    haStore,
    draft,
    draftVerifyTls,
    showTokenInput,
    testing,
    testResult,
    saving,
    saveFeedback,
    pendingChanges,
    pendingLabel,
    copyHaUrl,
    copyHaFallbackUrl,
    saveAndReconnect,
    testConnection,
    syncOnlyEnabledEntities,
    syncFilterSaving,
    syncFilterFeedback,
    refreshingEntities,
    refreshFeedback,
    toggleSyncFilter,
    formatCacheTime,
    refreshEntities,
    entitySyncInsight,
    handleEntitySyncBanner,
    cancelChanges,
  }
}





