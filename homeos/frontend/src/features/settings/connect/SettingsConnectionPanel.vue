<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="connection"
    icon-key="link"
    accent="var(--hos-color-accent)"
    layout="single"
    page-class="connection-hub"
  >
    <template #actions>
      <SettingsPendingSaveAction
        :pending="pendingChanges"
        :saving="saving"
        :pending-label="pendingLabel"
        save-text="保存并重连"
        saving-text="保存并重连中…"
        @save="saveAndReconnect"
        @cancel="cancelChanges"
      />
    </template>

    <div class="settings-hub-section conn-hub">
      <SettingsCard full static extra-class="conn-overview-card">
        <ConnectionOverviewSection
          :connection-stat-cells="connectionStatCells"
          :backend-reachable="backendReachable"
          :entities-store="entitiesStore"
        />
      </SettingsCard>

      <SettingsCard full static extra-class="conn-workspace-card">
        <div class="conn-workspace-card__tabs bind-energy-dock">
          <SettingsOrchTabs v-model="connTab" :tabs="connTabs" plain />
        </div>

        <div class="conn-workspace-card__body">
          <div v-show="connTab === 'credentials'">
            <ConnectionCredentialsSection
              v-model:show-token-input="showTokenInput"
              :draft="draft"
              :has-token="haStore.hasToken"
              :testing="testing"
              :test-result="testResult"
              :saving="saving"
              :save-feedback="saveFeedback"
              :copy-ha-url="copyHaUrl"
              :copy-ha-fallback-url="copyHaFallbackUrl"
              :test-connection="testConnection"
            />
          </div>

          <div v-show="connTab === 'entities'">
            <ConnectionEntitiesSection
              :entities-store="entitiesStore"
              :sync-only-enabled-entities="syncOnlyEnabledEntities"
              :sync-filter-saving="syncFilterSaving"
              :sync-filter-feedback="syncFilterFeedback"
              :refreshing-entities="refreshingEntities"
              :refresh-feedback="refreshFeedback"
              :saving="saving"
              :testing="testing"
              :toggle-sync-filter="toggleSyncFilter"
              :refresh-entities="refreshEntities"
              :format-cache-time="formatCacheTime"
            />
            <EventLogRecordFilterSection />
          </div>

          <div v-show="connTab === 'advanced'">
            <ConnectionAdvancedSection
              :ha-ws-mode-badge-mod="haWsModeBadgeMod"
              :ha-ws-mode-desc="haWsModeDesc"
              :ha-ws-mode-label="haWsModeLabel"
            />
          </div>
        </div>
      </SettingsCard>
    </div>
  </SettingsPageShell>
</template>

<script setup>
import SettingsPageShell from '@/components/common/settings-page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/settings-page-shell/SettingsCard.vue'
import SettingsPendingSaveAction from '@/features/settings/shared/SettingsPendingSaveAction.vue'
import SettingsOrchTabs from '@/components/common/SettingsOrchTabs.vue'
import ConnectionOverviewSection from './connection/OverviewSection.vue'
import ConnectionCredentialsSection from './connection/CredentialsSection.vue'
import ConnectionEntitiesSection from './connection/EntitiesSection.vue'
import EventLogRecordFilterSection from './connection/EventLogRecordFilterSection.vue'
import ConnectionAdvancedSection from './connection/AdvancedSection.vue'
import { useConnectionPanel } from '@/features/settings/composables/connect/connection.internals'

const props = defineProps({ activeTab: { type: String, default: 'connection' } })

// 连接面板状态：当前 Tab、凭证/实体同步/高级选项的展示与回调（由 composable 统一管理）
const {
  connTab,
  showTokenInput,
  entitiesStore,
  haStore,
  draft,
  connTabs,
  backendReachable,
  haWsModeLabel,
  haWsModeBadgeMod,
  haWsModeDesc,
  connectionStatCells,
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
  cancelChanges,
} = useConnectionPanel(() => props.activeTab)
</script>
<style src="./connection/styles/connection.css"></style>
