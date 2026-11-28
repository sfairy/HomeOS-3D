/* ── 原 useSecurityOverview.ts 的实现 ── */
import { computed, ref } from 'vue'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { getApiErrorMessage } from '@/kernel/core/error-message'
import { useLayoutStore } from '@/domain/layout/store/layout.store'
import { useSecurityPanelStatus } from '@/features/security/security'
import { executeSecurityPanelArm } from '@/features/security/panel-arm'
import { useReduceSecuritySensitivity } from '@/features/security/use-reduce-security-sensitivity'
import { useSecuritySensors } from '@/features/security/security'
import { useSecurityAuditEvents } from '@/features/security/security'
import { createSecurityOverviewHazard } from './security-overview-hazard'
import { createSecurityOverviewSensorView } from './security-overview-sensors'
import { createSecurityOverviewActions } from './security-overview-actions'

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
    entryPending,
    entryRemainingSeconds,
  } = useSecurityPanelStatus()
  const { reducing: reducingSensitivity, reduceSensitivity } = useReduceSecuritySensitivity()
  const { allSensors, alertCount, activeAlertChips, statCards, sensorFilters, acknowledgeAllAlerts } =
    useSecuritySensors()
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

  /**
   * 进入延时窗口内的「立即撤防」：刻意不做二次确认 —— 窗口只有几十秒，
   * 再弹确认框等于把用户的撤防机会一起吃掉。
   */
  const entryDisarming = ref(false)
  async function disarmEntryNow() {
    if (entryDisarming.value) return
    entryDisarming.value = true
    try {
      const data = await executeSecurityPanelArm('disarmed', [], zones.value, patchModeFromSocket)
      if (data?.success === false) chrome.notify('撤防未完成，请重试', 'warning')
    } catch (error) {
      chrome.notify(getApiErrorMessage(error, '撤防失败，请重试'), 'error')
    } finally {
      entryDisarming.value = false
    }
  }
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
    entryPending,
    entryRemainingSeconds,
    entryDisarming,
    disarmEntryNow,
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
