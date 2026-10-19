/**
 * @file useSecurityOverview.ts
 * @module composables/security
 * @description 安防总览 composable，聚合面板状态、传感器、审计事件、危险联动等核心逻辑。
 */
import { computed } from 'vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useSecurityPanelStatus } from '@/composables/security/useSecurityPanelStatus'
import { useReduceSecuritySensitivity } from '@/features/security/composables/useReduceSecuritySensitivity'
import { useSecuritySensors } from '@/features/security/composables/useSecuritySensors'
import { useSecurityAuditEvents } from '@/features/security/composables/useSecurityAuditEvents'
import { createSecurityOverviewHazard } from './security-overview-hazard.internals'
import { createSecurityOverviewSensorView } from './security-overview-sensors.internals'
import { createSecurityOverviewActions } from './security-overview-actions.internals'

/** 安防模式到强调色的映射 */
const MODE_ACCENTS: Record<string, string> = {
  disarmed: '#34d399',
  armed_home: '#fbbf24',
  armed_away: '#f87171',
  armed_night: '#a78bfa',
}

function modeAccentFor(key: string) {
  return MODE_ACCENTS[key] || '#0A84FF'
}

/**
 * 安防总览 composable
 * @returns 聚合后的响应式状态与业务方法
 */
export function useSecurityOverview() {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()

  const securityModes = computed(() => layoutStore.layoutConfig.securityModes || [])
  const {
    currentMode: secCurrentMode,
    zones,
    loading: secPanelLoading,
    refresh: refreshSecPanel,
    patchModeFromSocket,
    error: secPanelError,
    ready: secPanelReady,
  } = useSecurityPanelStatus()
  const { reducing: reducingSensitivity, reduceSensitivity } = useReduceSecuritySensitivity()
  const {
    allSensors,
    alertCount,
    activeAlertChips,
    statCards,
    sensorFilters,
    acknowledgeAllAlerts,
  } = useSecuritySensors()
  const {
    secEventFilter,
    secAuditLoading,
    secAuditError,
    secEventIconMap,
    secEventFilters,
    displayedSecEvents,
    linkageFailureRecent,
    addSecEvent,
    fetchSecAuditEvents,
  } = useSecurityAuditEvents(zones)

  const hazard = createSecurityOverviewHazard({ layoutStore, chrome })
  const sensors = createSecurityOverviewSensorView({
    securityModes,
    secCurrentMode,
    allSensors,
    alertCount,
  })
  const actions = createSecurityOverviewActions({
    layoutStore,
    chrome,
    securityModes,
    secCurrentMode,
    zones,
    allSensors,
    boundSensorCount: sensors.boundSensorCount,
    boundOnly: sensors.boundOnly,
    patchModeFromSocket,
    reduceSensitivity,
    acknowledgeAllAlerts,
    addSecEvent,
    fetchSecAuditEvents,
    refreshSecPanel,
  })

  return {
    linkageFailureRecent,
    alertCount,
    activeAlertChips,
    secEventFilter,
    reducingSensitivity,
    securityModes,
    secCurrentMode,
    secCurrentName: sensors.secCurrentName,
    secModeColor: sensors.secModeColor,
    sensorCooldownSec: actions.sensorCooldownSec,
    secArming: actions.secArming,
    secIconMap: sensors.secIconMap,
    statCards,
    sensorFilter: sensors.sensorFilter,
    boundOnly: sensors.boundOnly,
    boundSensorCount: sensors.boundSensorCount,
    emergencyBusy: actions.emergencyBusy,
    sensorFilters,
    alertsOnly: sensors.alertsOnly,
    listSensors: sensors.listSensors,
    groupedListSensors: sensors.groupedListSensors,
    zones,
    armZoneSelection: actions.armZoneSelection,
    secPanelError,
    secPanelLoading,
    secPanelReady,
    refreshSecPanel,
    presenceSummary: actions.presenceSummary,
    hazardConfigured: hazard.hazardConfigured,
    hazardBarTitle: hazard.hazardBarTitle,
    hazardSceneConfigured: hazard.hazardSceneConfigured,
    hazardSummary: hazard.hazardSummary,
    hazardTesting: hazard.hazardTesting,
    hazardDrillBusy: hazard.hazardDrillBusy,
    testHazardLinkage: hazard.testHazardLinkage,
    runHazardDrill: hazard.runHazardDrill,
    goHazardBindings: hazard.goHazardBindings,
    displayedSecEvents,
    secAuditLoading,
    secAuditError,
    secEventFilters,
    secEventIconMap,
    toggleSensorFilter: sensors.toggleSensorFilter,
    handleSecurityArm: actions.handleSecurityArm,
    handleEmergency: actions.handleEmergency,
    goSecurityParams: actions.goSecurityParams,
    goSecurityModes: actions.goSecurityModes,
    handleFalseAlarmFeedback: actions.handleFalseAlarmFeedback,
    handleAcknowledgeAlerts: actions.handleAcknowledgeAlerts,
    fetchSecAuditEvents,
    modeAccentFor,
  }
}