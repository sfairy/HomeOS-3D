/**
 * 组件：SettingsConnectionPanel.vue
 *
 * 职责：HA/Redis 连接设置面板。页头保存并重连，工作区按 Tab 组织凭证 / 实体同步 / Redis /
 *      高级选项四个分区，概览区展示连接状态统计。
 * 关键依赖：
 *  - useConnectionPanel：连接面板核心状态与回调
 *  - SettingsPageShell / SettingsCard / SettingsOrchTabs：页面壳层与卡片
 *  - connection 子组件：Overview / Credentials / Entities / EventLogRecordFilter / Redis / Advanced
 * 数据来源：useConnectionPanel 内部状态 + 父级透传 activeTab
 */
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="connection"
    icon-key="link"
    accent="var(--module-accent-connection)"
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

          <div v-show="connTab === 'redis'">
            <ConnectionRedisSection
              :redis-health="redisHealth"
              :redis-label="redisLabel"
              :redis-refresh-error="redisRefreshError"
            />
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
/**
 * 职责：渲染 views/SettingsConnectionPanel 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsPendingSaveAction from '@/features/settings/shared/SettingsPendingSaveAction.vue'
import SettingsOrchTabs from '@/features/settings/shared/layout/SettingsOrchTabs.vue'
import ConnectionOverviewSection from './connection/OverviewSection.vue'
import ConnectionCredentialsSection from './connection/CredentialsSection.vue'
import ConnectionEntitiesSection from './connection/EntitiesSection.vue'
import EventLogRecordFilterSection from './connection/EventLogRecordFilterSection.vue'
import ConnectionRedisSection from './connection/RedisSection.vue'
import ConnectionAdvancedSection from './connection/AdvancedSection.vue'
import { useConnectionPanel } from '@/features/settings/composables/connect/connection.internals'

// 入参：当前激活的设置 Tab
const props = defineProps({ activeTab: { type: String, default: 'connection' } })

// 连接面板状态：当前 Tab、凭证/实体同步/Redis/高级选项的展示与回调（由 composable 统一管理）
const {
  connTab,
  showTokenInput,
  entitiesStore,
  haStore,
  draft,
  connTabs,
  redisHealth,
  redisLabel,
  redisRefreshError,
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
