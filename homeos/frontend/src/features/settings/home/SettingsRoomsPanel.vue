<!--
组件：SettingsRoomsPanel.vue
所属模块：frontend / src / views / settings / home
职责：房间面板入口。通过子导航切换两个区段：
      catalog（HA 区域目录 + 传感器绑定）、scopes（房间配置消费方说明）。
      页头提供「同步 HA 区域」与保存/取消。
关键依赖：
  - SettingsPageShell / SettingsCard / SettingsPendingSaveAction：页面骨架与保存条
  - SettingsFlowBand / SettingsFlowStat / SettingsSectionHead / SettingsHubSubnav：流程/头部/子导航
  - SettingsBindingsEnvironmentSection：房间目录 + 传感器绑定子区段
  - RegistryDegradedGuide：注册中心降级提示
  - useSettingsEnvHub / useSettingsHubRouteSection：房间 hub 与子导航路由同步
数据来源：useSettingsEnvHub()
-->
<template>
  <SettingsPageShell
    :active-tab="activeTab"
    tab="rooms"
    icon-key="map-pin"
    accent="var(--module-accent-bindings)"
    layout="single"
    page-class="rooms-hub"
    body-class="rooms-hub__body"
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
        save-text="保存房间配置"
        @save="saveEnvMapWithNotify"
        @cancel="cancelEnvChanges"
      />
    </template>

    <template #subnav>
      <SettingsHubSubnav
        v-model="roomsSection"
        :sections="roomsSubnavSections"
        nav-class="rooms-hub-subnav"
      />
    </template>

    <SettingsCard full static extra-class="rooms-summary-card">
      <SettingsFlowBand
        :steps="roomsFlowSteps"
        class="rooms-flow-band"
        band-class="rooms-flow-band__shell"
        collapsible
        default-collapsed
        toggle-label="流程概览"
        :collapsed-summary="roomsFlowSummary"
      >
        <template #stats>
          <SettingsFlowStat
            :label="'已同步'"
            :value="envRoomList.length"
            tone="emerald"
            val-tone="emerald"
          />
          <SettingsFlowStat
            :label="'待保存'"
            :value="envPendingChanges"
            :tone="envPendingChanges ? 'amber' : 'emerald'"
            :val-tone="envPendingChanges ? 'amber' : 'emerald'"
          />
        </template>
      </SettingsFlowBand>
      <p class="rooms-hero-compact__hints mt-2.5">
        <RouterLink :to="SETTINGS_ROUTES.rooms('catalog')" class="rooms-hero-compact__link">
          {{ '环境与健康 · 绑传感器' }}
        </RouterLink>
        <span class="rooms-hero-compact__sep" aria-hidden="true">{{ '·' }}</span>
        <span>{{
          '增删房间请在 HA「设置 → 区域与楼层」操作后，点「同步 HA 区域」'
        }}</span>
      </p>
    </SettingsCard>

    <RegistryDegradedGuide
      v-if="registryDegraded && roomsSection === 'catalog'"
      :reason="registryError"
      :refreshing="envLoading"
      @retry="refreshHaAreas"
    />

    <SettingsBindingsEnvironmentSection
      v-show="roomsSection === 'catalog'"
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
      :show-sensor-fields="false"
      @infer-env-map="inferEnvMap"
      @sync-ha-areas="refreshHaAreas"
      @restore-hidden-rooms="handleRestoreHiddenRooms"
      @remove-env-room="handleRemoveEnvRoom"
      @export-env-csv="exportEnvCsv"
      @env-csv-file="onEnvCsvFile"
    />

    <div v-show="roomsSection === 'scopes'" class="settings-hub-section settings-hub-section--fit">
      <SettingsCard full extra-class="rooms-scope-card">
        <SettingsSectionHead
          :title="'房间配置消费方'"
          :description="'保存后自动同步到以下模块'"
          bordered
        />
        <ul class="rooms-hub-scope-grid">
          <li v-for="item in scopeItems" :key="item.id" class="rooms-hub-scope-item">
            <span class="rooms-hub-scope-item__emoji">{{ item.emoji }}</span>
            <div class="rooms-hub-scope-item__body min-w-0">
              <p class="rooms-hub-scope-item__title">{{ item.title }}</p>
              <p class="rooms-hub-scope-item__desc">{{ item.description }}</p>
            </div>
            <RouterLink v-if="item.to" :to="item.to" class="rooms-hub-scope-item__link">{{
              item.linkLabel
            }}</RouterLink>
          </li>
        </ul>
      </SettingsCard>
    </div>
  </SettingsPageShell>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Layers, MapPin, RefreshCw, Sparkles } from '@lucide/vue'
import SettingsPageShell from '@/components/common/page-shell/SettingsPageShell.vue'
import SettingsCard from '@/components/common/page-shell/SettingsCard.vue'
import SettingsFlowBand from '@/features/settings/shared/layout/SettingsFlowBand.vue'
import SettingsFlowStat from '@/features/settings/shared/layout/SettingsFlowStat.vue'
import SettingsSectionHead from '@/features/settings/shared/layout/SettingsSectionHead.vue'
import SettingsHubSubnav from '@/features/settings/shared/layout/SettingsHubSubnav.vue'
import SettingsPendingSaveAction from '@/features/settings/shared/SettingsPendingSaveAction.vue'
import SettingsBindingsEnvironmentSection from '@/features/settings/connect/bindings/SettingsBindingsEnvironmentSection.vue'
import RegistryDegradedGuide from '@/features/settings/shared/RegistryDegradedGuide.vue'
import { useSettingsEnvHub } from '@/features/settings/composables/hub-ui.internals'
import { useSettingsHubRouteSection } from '@/features/settings/composables/hub-ui.internals'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

// 入参：当前激活的 Tab id
const props = defineProps({ activeTab: { type: String, default: 'rooms' } })

// 房间 hub：聚合 HA 区域列表、传感器映射、保存/取消等
const hub = useSettingsEnvHub({
  tabId: 'rooms',
  activeTab: () => props.activeTab,
  saveSuccessMessage: '房间配置已保存',
})

const {
  roomsSection,
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
  roomsSubnavSections,
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
} = hub

// 房间流程步骤：HA 区域 → 同步目录 → 房间映射 → 模块消费
const roomsFlowSteps = [
  { label: 'HA 区域', meta: '区域与楼层', icon: MapPin, tone: 'in' },
  { label: '同步目录', meta: '显示名覆盖', icon: RefreshCw, tone: 'sky' },
  { label: '房间映射', meta: '隐藏/排序', icon: Layers, tone: 'mid' },
  { label: '模块消费', meta: '语音·环境·向导', icon: Sparkles, tone: 'out' },
]

// 流程折叠态摘要：房间数 + 待保存/已同步
const roomsFlowSummary = computed(() => {
  const n = envRoomList.value.length
  const pending = envPendingChanges.value
  return `${n} 房间 · ${pending ? `${pending} 待保存` : '已同步'}`
})

// 子导航路由同步：URL query 与 roomsSection 双向绑定
useSettingsHubRouteSection(roomsSection, roomsSubnavSections, {
  tabId: 'rooms',
  activeTab: () => props.activeTab,
  onApply(sec) {
    roomsSection.value = sec
  },
})

// 房间配置消费方说明列表：仅保留真正读取本页 envSensorMap / HA 区域的下游模块
const scopeItems = computed(() => [
  {
    id: 'env',
    emoji: '🌡️',
    title: '环境健康面板',
    description: '按 HA 区域展示温湿度、PM2.5、CO₂、TVOC 与 IAQ 综合评分',
    to: SETTINGS_ROUTES.rooms('catalog'),
    linkLabel: '去绑传感器',
  },
  {
    id: 'voice',
    emoji: '🎙️',
    title: '语音分房间控制',
    description: 'voice.rooms 标签随本页房间显示名热更新，如「客厅开灯」',
    to: SETTINGS_ROUTES.voice(),
    linkLabel: '语音中心',
  },
  {
    id: 'wizard',
    emoji: '✨',
    title: '首装向导',
    description: '环境步骤读取同一套 HA 区域与传感器映射',
    to: SETTINGS_ROUTES.setupWizard(),
    linkLabel: '首装向导',
  },
])
</script>

<style scoped src="../shared/styles/bindings-theme.css"></style>
