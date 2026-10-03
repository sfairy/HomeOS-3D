<!--
组件：SettingsEnvHealthPanel.vue
所属模块：frontend / src / views / settings / home
职责：环境与健康面板入口。基于 SettingsBindingsEnvironmentSection 展示 HA 区域列表、
      传感器绑定、隐藏房间与 CSV 导入导出，页头提供「同步 HA 区域」与保存/取消。
关键依赖：
  - SettingsPageShell / SettingsCard / SettingsPendingSaveAction：页面骨架与保存条
  - SettingsFlowBand / SettingsFlowStat：流程概览
  - SettingsBindingsEnvironmentSection：环境绑定子区段
  - RegistryDegradedGuide：注册中心降级提示
  - useSettingsEnvHub：聚合房间列表、传感器映射、保存/取消等
数据来源：useSettingsEnvHub() 返回的 envRoomList / sensorMap / 各类操作
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="env-health"
    icon-key="map-pin"
    accent="var(--module-accent-energy)"
    layout="single"
    page-class="env-health-hub"
    body-class="env-health-hub__body"
  >
    <template #actions>
      <button
        type="button"
        class="settings-btn-ghost text-xs"
        :disabled="envLoading"
        @click="refreshHaAreas"
      >
        {{ '同步 HA 区域' }}
      </button>
      <SettingsPendingSaveAction
        :pending="envPendingChanges"
        :saving="envSaving"
        save-text="保存环境配置"
        @save="saveEnvMapWithNotify"
        @cancel="cancelEnvChanges"
      />
    </template>

    <template #mobile-save>
      <SettingsPendingSaveAction
        :pending="envPendingChanges"
        :saving="envSaving"
        save-text="保存环境配置"
        @save="saveEnvMapWithNotify"
        @cancel="cancelEnvChanges"
      />
    </template>

    <SettingsCard full static extra-class="env-health-workspace">
      <SettingsFlowBand
        :steps="envFlowSteps"
        class="env-health-flow"
        band-class="env-health-flow-band"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="envFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'HA 区域'"
            :value="envRoomList.length"
            tone="accent"
            val-tone="accent"
          />
          <SettingsFlowStat
            :label="'待保存'"
            :value="envPendingChanges"
            :tone="envPendingChanges ? 'amber' : 'emerald'"
            :val-tone="envPendingChanges ? 'amber' : 'emerald'"
          />
        </template>
      </SettingsFlowBand>
      <div class="settings-deploy-notes !mt-2.5">
        <div class="settings-deploy-note settings-deploy-note--sky">
          <div class="settings-deploy-note__icon">
            <MapPin class="w-4 h-4" />
          </div>
          <div class="settings-deploy-note__body">
            <p class="settings-deploy-note__title">{{ '房间目录' }}</p>
            <p class="settings-deploy-note__text">
              {{
                '新增/删除房间请在 HA「设置 → 区域与楼层」操作后点「同步 HA 区域」；显示名覆盖见'
              }}
              <RouterLink :to="SETTINGS_ROUTES.rooms()" class="env-health-link underline">{{
                '房间配置'
              }}</RouterLink>
              {{ '。用水监测见' }}
              <RouterLink :to="SETTINGS_ROUTES.params('water')" class="env-health-link underline">{{
                '运行参数 → 用水'
              }}</RouterLink>
            </p>
          </div>
        </div>
      </div>
    </SettingsCard>

    <RegistryDegradedGuide
      v-if="registryDegraded"
      :reason="registryError"
      :refreshing="envLoading"
      @retry="refreshHaAreas"
    />

    <SettingsBindingsEnvironmentSection
      v-model:bindings-env-tab="bindingsEnvTab"
      v-model:env-room-tab="envRoomTab"
      :env-loading="envLoading"
      :env-room-list="envRoomList"
      :bindings-env-tabs="bindingsEnvTabs"
      :env-room-tabs="envRoomTabs"
      :active-env-room="activeEnvRoom"
      v-model:sensor-map="sensorMap"
      :env-sensor-field-list="envSensorFieldList"
      :hidden-preset-count="hiddenRoomCount"
      :show-sensor-fields="true"
      :pending-env-changes="envPendingChanges"
      :save-bindings="saveEnvMapWithNotify"
      @infer-env-map="inferEnvMap"
      @sync-ha-areas="refreshHaAreas"
      @restore-hidden-rooms="handleRestoreHiddenRooms"
      @remove-env-room="handleRemoveEnvRoom"
      @export-env-csv="exportEnvCsv"
      @env-csv-file="onEnvCsvFile"
    />
  </SettingsPageShell>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Activity, Gauge, MapPin, Thermometer } from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsPendingSaveAction from '@/views/settings/shared/SettingsPendingSaveAction.vue'
import SettingsFlowBand from '@/views/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/views/settings/shared/layout/SettingsFlowStat.vue'
import SettingsBindingsEnvironmentSection from '@/views/settings/connect/bindings/SettingsBindingsEnvironmentSection.vue'
import RegistryDegradedGuide from '@/views/settings/shared/RegistryDegradedGuide.vue'
import { useSettingsEnvHub } from '@/composables/settings/hub-ui.internals'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

// 入参：当前激活的 Tab id
const props = defineProps({ activeTab: { type: String, default: 'env-health' } })

// 环境流程步骤：HA 区域 → 传感器绑定 → 健康评分 → 微件
const envFlowSteps = [
  { label: 'HA 区域', meta: '同步楼层', icon: MapPin, tone: 'in' },
  { label: '传感器绑定', meta: '温湿度·空气质量', icon: Thermometer, tone: 'sky' },
  { label: '健康评分', meta: '聚合计算', icon: Activity, tone: 'mid' },
  { label: '微件', meta: '大屏展示', icon: Gauge, tone: 'out' },
]

const {
  bindingsEnvTab,
  envRoomTab,
  envLoading,
  envSaving,
  envPendingChanges,
  envRoomList,
  bindingsEnvTabs,
  envRoomTabs,
  activeEnvRoom,
  hiddenRoomCount,
  sensorMap,
  envSensorFieldList,
  inferEnvMap,
  exportEnvCsv,
  onEnvCsvFile,
  saveEnvMapWithNotify,
  cancelEnvChanges,
  refreshHaAreas,
  handleRemoveEnvRoom,
  handleRestoreHiddenRooms,
  registryDegraded,
  registryError,
} = useSettingsEnvHub({
  tabId: 'env-health',
  activeTab: () => props.activeTab,
  saveSuccessMessage: '环境传感器配置已保存',
})

// 流程折叠态摘要：区域数 + 待保存数/已同步
const envFlowSummary = computed(() => {
  const n = envRoomList.value.length
  const pending = envPendingChanges.value
  return `${n} 区域 · ${pending ? `${pending} 待保存` : '已同步'}`
})
</script>

<style scoped src="../shared/styles/bindings-theme.css"></style>
