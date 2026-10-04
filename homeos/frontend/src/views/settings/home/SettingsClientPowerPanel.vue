<!--
组件：SettingsClientPowerPanel.vue
所属模块：frontend / src / views / settings / home
职责：客户端智能充放电设置面板入口。基于 SettingsPageShell 组合 Hero（总开关/本机 ID/心跳间隔）、
      Pending（待配对终端列表）、Devices（充放电策略列表）三个区段，页头提供保存与取消。
关键依赖：
  - SettingsPageShell / SettingsPendingSaveAction：页面骨架与保存条
  - ClientPowerHeroSection / ClientPowerPendingSection / ClientPowerDevicesSection：三个子区段
  - useClientPowerPanel：聚合配置读写、状态轮询、待配对管理、展示派生
数据来源：useClientPowerPanel() 返回的 config / status / pending 及派生状态
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="smart-charge"
    icon-key="plug-zap"
    accent="var(--module-accent-energy)"
    layout="single"
    page-class="smart-charge-hub"
    body-class="smart-charge-hub__body"
  >
    <template #actions>
      <SettingsPendingSaveAction
        :pending="clientPowerPendingCount"
        :saving="saving"
        save-text="保存充电配置"
        @save="save"
        @cancel="cancelChanges"
      />
    </template>

    <section class="settings-hub-section charge-hub">
      <ClientPowerHeroSection
        :config="config"
        :loading="loading"
        :saving="saving"
        :status-loading="statusLoading"
        :registered-count="registeredCount"
        :enabled-count="enabledCount"
        :online-count="onlineCount"
        :pending-count="pendingCount"
        :local-client-id="localClientId"
        :local-battery-hint="localBatteryHint"
        :local-needs-https-for-battery="localNeedsHttpsForBattery"
        :copy-client-id="copyClientId"
        @patch-config="(patch) => Object.assign(config, patch)"
        @refresh-status="refreshStatus"
      />

      <ClientPowerPendingSection
        v-if="pending.length"
        :pending="pending"
        :device-kind="deviceKind"
        :pending-card-title="pendingCardTitle"
        :pending-live-row="pendingLiveRow"
        :pending-battery-row="pendingBatteryRow"
        :pending-offline="pendingOffline"
        :battery-state="batteryState"
        :battery-percent="batteryPercent"
        :spec-chips="specChips"
        :add-client-from-pending="addClientFromPending"
        :dismiss-pending="dismissPending"
        :pending-offline-count="pendingOfflineCount"
        :dismiss-all-offline-pending="dismissAllOfflinePending"
      />

      <ClientPowerDevicesSection
        :config="config"
        :pending="pending"
        :loading="loading"
        :saving="saving"
        :policy-count="policyCount"
        :enabled-count="enabledCount"
        :client-live-row="clientLiveRow"
        :device-kind-for-client="deviceKindForClient"
        :client-card-title="clientCardTitle"
        :client-needs-switch="clientNeedsSwitch"
        :client-threshold-invalid="clientThresholdInvalid"
        :battery-state="batteryState"
        :battery-percent="batteryPercent"
        :spec-chips="specChips"
        :remove-client="removeClient"
        :add-empty-client="addEmptyClient"
        :add-client-from-pending="addClientFromPending"
        :save="save"
        :presence-wake-local-hint="presenceWakeLocalHint"
      />
    </section>
  </SettingsPageShell>
</template>

<script setup>
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import ClientPowerHeroSection from './client-power/ClientPowerHeroSection.vue'
import ClientPowerPendingSection from './client-power/ClientPowerPendingSection.vue'
import ClientPowerDevicesSection from './client-power/ClientPowerDevicesSection.vue'
import { useClientPowerPanel } from '@/views/settings/home/client-power/internals'

// 入参：当前激活的 Tab id
defineProps({ activeTab: { type: String, default: 'smart-charge' } })

const {
  loading,
  saving,
  statusLoading,
  config,
  pending,
  refreshStatus,
  save,
  cancelChanges,
  addClientFromPending,
  removeClient,
  addEmptyClient,
  dismissPending,
  dismissAllOfflinePending,
  localClientId,
  localBatteryHint,
  localNeedsHttpsForBattery,
  presenceWakeLocalHint,
  registeredCount,
  enabledCount,
  onlineCount,
  pendingCount,
  policyCount,
  clientLiveRow,
  pendingLiveRow,
  pendingBatteryRow,
  pendingCardTitle,
  pendingOffline,
  pendingOfflineCount,
  clientNeedsSwitch,
  clientThresholdInvalid,
  deviceKind,
  deviceKindForClient,
  clientCardTitle,
  specChips,
  batteryState,
  batteryPercent,
  copyClientId,
  clientPowerPendingCount,
} = useClientPowerPanel()
</script>

<style scoped src="./client-power/styles/client-power.css"></style>
