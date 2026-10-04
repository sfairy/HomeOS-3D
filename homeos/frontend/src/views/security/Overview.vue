<!--
组件：SecurityOverview.vue
所属模块：frontend / src / views / security
职责：安防总览页面入口。整合告警提示条、安全传感器联动（hazard）横幅、
      模式切换命令栏与传感器 / 事件主体面板，并负责联动失败详情的筛选切换。
关键依赖：
  - useSecurityOverview composable：聚合安防模式、传感器、告警、审计、hazard 等状态
  - SecurityOverviewCommandBar / SecurityOverviewBody：命令栏与主体面板子组件
  - AlertTriangle 图标来自 @lucide/vue
数据来源：useSecurityOverview 返回的响应式状态（传感器 / 模式 / 事件 / hazard 等）
-->
<template>
  <div class="sec-dash sec-dash--overview">
    <div v-if="secPanelError" class="sec-dash-notice sec-dash-notice--warn" role="alert">
      <AlertTriangle class="w-4 h-4 shrink-0" />
      <span class="sec-dash-notice-text">{{ secPanelError }}</span>
    </div>

    <div
      v-if="hazardConfigured"
      class="sec-dash-hazard glass-shine"
      role="region"
      aria-label="安全传感器联动"
    >
      <div class="sec-dash-hazard__glow" aria-hidden="true" />
      <AlertTriangle class="sec-dash-hazard__icon" />
      <div class="sec-dash-hazard__body">
        <p class="sec-dash-hazard__title">{{ hazardBarTitle }}</p>
        <p class="sec-dash-hazard__text">{{ hazardSummary }}</p>
      </div>
      <div class="sec-dash-hazard__actions">
        <button
          v-if="hazardSceneConfigured"
          type="button"
          class="sec-dash-btn sec-dash-btn--ghost"
          :disabled="hazardTesting"
          @click="testHazardLinkage"
        >
          {{ hazardTesting ? '测试中…' : '测试联动' }}
        </button>
        <button
          type="button"
          class="sec-dash-btn sec-dash-btn--ghost-warn"
          :disabled="hazardDrillBusy"
          @click="runHazardDrill('smoke')"
        >
          {{ hazardDrillBusy ? '演习中…' : '烟雾演习' }}
        </button>
        <button
          type="button"
          class="sec-dash-btn sec-dash-btn--ghost-warn"
          :disabled="hazardDrillBusy"
          @click="runHazardDrill('gas')"
        >
          {{ '燃气演习' }}
        </button>
        <button
          type="button"
          class="sec-dash-btn sec-dash-btn--ghost-warn"
          :disabled="hazardDrillBusy"
          @click="runHazardDrill('leak')"
        >
          {{ '漏水演习' }}
        </button>
        <button type="button" class="sec-dash-btn sec-dash-btn--primary" @click="goHazardBindings">
          {{ '绑定设置' }}
        </button>
      </div>
    </div>

    <SecurityOverviewCommandBar
      :security-modes="securityModes"
      :sec-current-mode="secCurrentMode"
      :sec-current-name="secCurrentName"
      :sec-mode-color="secModeColor"
      :sensor-cooldown-sec="sensorCooldownSec"
      :sec-arming="secArming"
      :sec-icon-map="secIconMap"
      :mode-accent-for="modeAccentFor"
      :stat-cards="statCards"
      :sensor-filter="sensorFilter"
      :emergency-busy="emergencyBusy"
      :presence-summary="presenceSummary"
      :arm-zone-selection="armZoneSelection"
      :live-zone-count="zones.length"
      :alert-count="alertCount"
      :active-alert-chips="activeAlertChips"
      :linkage-failure-recent="linkageFailureRecent"
      :reducing-sensitivity="reducingSensitivity"
      @arm="handleSecurityArm"
      @emergency="handleEmergency"
      @toggle-sensor-filter="toggleSensorFilter"
      @go-security-params="goSecurityParams"
      @view-linkage="viewLinkageFailures"
      @acknowledge="handleAcknowledgeAlerts"
      @false-alarm="handleFalseAlarmFeedback"
    />

    <div class="sec-dash-workspace">
      <SecurityOverviewBody
        v-model:alerts-only="alertsOnly"
        v-model:bound-only="boundOnly"
        v-model:sec-event-filter="secEventFilter"
        v-model:arm-selection="armZoneSelection"
        :list-sensors="listSensors"
        :grouped-list-sensors="groupedListSensors"
        :sensor-filters="sensorFilters"
        :sensor-filter="sensorFilter"
        :bound-sensor-count="boundSensorCount"
        :live-zones="zones"
        :backend-zones="zones"
        :sec-current-mode="secCurrentMode"
        :sec-panel-loading="secPanelLoading"
        :sec-panel-ready="secPanelReady"
        :displayed-sec-events="displayedSecEvents"
        :sec-audit-loading="secAuditLoading"
        :sec-audit-error="secAuditError"
        :sec-event-filters="secEventFilters"
        :sec-event-icon-map="secEventIconMap"
        @toggle-sensor-filter="toggleSensorFilter"
        @go-security-modes="goSecurityModes"
        @refresh-audit="fetchSecAuditEvents"
        @refresh-zones="refreshSecPanel"
      />
    </div>
  </div>
</template>

<script setup>
import { nextTick } from 'vue'
import SecurityOverviewCommandBar from '@/views/security/OverviewCommandBar.vue'
import SecurityOverviewBody from '@/views/security/OverviewBody.vue'
import { AlertTriangle } from '@lucide/vue'
import { useSecurityOverview } from '@/composables/security/useSecurityOverview'

const {
  linkageFailureRecent,
  alertCount,
  activeAlertChips,
  secEventFilter,
  reducingSensitivity,
  securityModes,
  secCurrentMode,
  secCurrentName,
  secModeColor,
  sensorCooldownSec,
  secArming,
  secIconMap,
  statCards,
  sensorFilter,
  boundOnly,
  boundSensorCount,
  emergencyBusy,
  sensorFilters,
  alertsOnly,
  listSensors,
  groupedListSensors,
  zones,
  armZoneSelection,
  secPanelError,
  secPanelLoading,
  secPanelReady,
  refreshSecPanel,
  presenceSummary,
  hazardConfigured,
  hazardBarTitle,
  hazardSceneConfigured,
  hazardSummary,
  hazardTesting,
  hazardDrillBusy,
  testHazardLinkage,
  runHazardDrill,
  goHazardBindings,
  displayedSecEvents,
  secAuditLoading,
  secAuditError,
  secEventFilters,
  secEventIconMap,
  toggleSensorFilter,
  handleSecurityArm,
  handleEmergency,
  goSecurityParams,
  goSecurityModes,
  handleFalseAlarmFeedback,
  handleAcknowledgeAlerts,
  fetchSecAuditEvents,
  modeAccentFor,
} = useSecurityOverview()

/**
 * 指挥栏「查看详情」：将事件筛选切到 linkage（联动失败），并把焦点引导到侧栏审计日志。
 * 同值时侧栏 watch 不触发；先清再设以确保仍切到审计。
 */
function viewLinkageFailures() {
  if (secEventFilter.value === 'linkage') {
    // 同值时侧栏 watch 不触发；先清再设，确保仍切到审计
    secEventFilter.value = 'all'
    nextTick(() => {
      secEventFilter.value = 'linkage'
    })
    return
  }
  secEventFilter.value = 'linkage'
}
</script>
