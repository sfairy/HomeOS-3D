/**
 * @file security-overview-actions.internals.ts
 * @module frontend/src/features/security/composables
 */
import { ref, watch, onMounted, type Ref, type ComputedRef } from 'vue'
import { useRouter } from 'vue-router'
import { logger } from '@/shared/utils/core/logger'
import { Shield, ShieldCheck, AlertTriangle } from '@lucide/vue'
import {
  getMaxRemoteNotifications,
  configEpoch,
  getConfigSection,
} from '@/shared/utils/config/frontend-config'
import { hapticAlert } from '@/shared/utils/ui/haptics.util'
import { fetchNotifications, markNotificationRead } from '@/services/api/notifications'
import {
  fetchPresenceSummary,
  triggerSecurityEmergency,
} from '@/services/api/security'
import { loadPresenceHome } from '@/shared/presence/composables/load-presence-home'
import { normalizeSecurityEmergency } from '@/shared/constants/security-emergency'
import {
  executeSecurityPanelArm,
  interpretSecurityArmResult,
} from '@/shared/security/utils/panel-arm.util'
import type { SecurityMode } from '@/shared/types/layout'
import type { SecurityOverviewSensor } from './security-overview-sensors.internals'
import type { useLayoutStore } from '@/stores/layout.store'
import type { useChromeStore } from '@/stores/chrome.store'
import type { useSecurityPanelStatus } from '@/composables/security/useSecurityPanelStatus'
import type { useReduceSecuritySensitivity } from './useReduceSecuritySensitivity'
import type { Component } from 'vue'

type LayoutStore = ReturnType<typeof useLayoutStore>
type ChromeStore = ReturnType<typeof useChromeStore>
/** WebSocket 模式变更补丁回调（与安防面板 composable 同源） */
type PatchModeFromSocket = ReturnType<typeof useSecurityPanelStatus>['patchModeFromSocket']
/** 降低灵敏度触发器（与向导共用 composable 同源） */
type ReduceSensitivity = ReturnType<typeof useReduceSecuritySensitivity>['reduceSensitivity']

/** 布防 / 紧急 / 告警确认与会话事件同步 */
export function createSecurityOverviewActions(opts: {
  layoutStore: LayoutStore
  chrome: ChromeStore
  securityModes: ComputedRef<SecurityMode[]>
  secCurrentMode: Ref<string>
  zones: Ref<Array<{ id: string; sensors?: string[] }>>
  allSensors: ComputedRef<SecurityOverviewSensor[]>
  boundSensorCount: ComputedRef<number>
  boundOnly: Ref<boolean>
  patchModeFromSocket: PatchModeFromSocket
  reduceSensitivity: ReduceSensitivity
  acknowledgeAllAlerts: () => void
  addSecEvent: (
    icon: Component,
    text: string,
    css: string,
    extra?: { zoneIds?: string[] },
  ) => void
  fetchSecAuditEvents: () => Promise<void> | void
  refreshSecPanel: () => void
}) {
  const {
    layoutStore,
    chrome,
    securityModes,
    secCurrentMode,
    zones,
    allSensors,
    boundSensorCount,
    boundOnly,
    patchModeFromSocket,
    reduceSensitivity,
    acknowledgeAllAlerts,
    addSecEvent,
    fetchSecAuditEvents,
    refreshSecPanel,
  } = opts

  const router = useRouter()
  const secArming = ref<string | null>(null)
  const armZoneSelection = ref<string[]>([])
  const emergencyBusy = ref(false)
  const lastEmergencyAt = ref(0)
  const sensorCooldownSec = ref<number | null>(null)
  const presenceSummary = ref('')

  function loadSecurityParams() {
    void configEpoch.value
    const sec = getConfigSection('security')
    if (sec?.sensorAlertCooldownSec != null) {
      sensorCooldownSec.value = sec.sensorAlertCooldownSec
    }
  }

  function goSecurityParams() {
    router.push({ path: '/settings', query: { tab: 'params', section: 'security' } })
  }

  function goSecurityModes() {
    router.push({ path: '/settings', query: { tab: 'security-modes' } })
  }

  async function handleFalseAlarmFeedback() {
    const data = await reduceSensitivity({ recordFeedback: true, source: 'security_overview' })
    if (data?.sensorAlertCooldownSec != null) sensorCooldownSec.value = data.sensorAlertCooldownSec
    await fetchSecAuditEvents()
  }

  async function handleAcknowledgeAlerts() {
    acknowledgeAllAlerts()
    try {
      const res = await fetchNotifications({ limit: getMaxRemoteNotifications() })
      const list = Array.isArray(res.data) ? res.data : []
      for (const notification of list) {
        const src = notification.source || ''
        if (
          !notification.read &&
          (src.includes('security') || src.includes('anomaly') || src === 'sensor-alert')
        ) {
          await markNotificationRead(notification.id)
        }
      }
    } catch (error) {
      logger.debug('确认安全通知失败', error)
    }
    addSecEvent(ShieldCheck, '用户确认了所有告警', 'sec-event-item--mode')
  }

  async function handleSecurityArm(mode: string) {
    if (secArming.value) return
    const isDisarm = mode === 'disarmed'
    const armModeName = securityModes.value.find((modeEntry: SecurityMode) => modeEntry.key === mode)?.name
    const ok = await chrome.confirm(
      isDisarm ? '确定撤防？撤防后监控将关闭' : `确定布防${armModeName || mode}？布防期间将联动安防设备`,
      isDisarm ? '撤防确认' : '布防确认',
      { type: 'danger', confirmText: isDisarm ? '确认撤防' : '确认布防' },
    )
    if (!ok) return
    secArming.value = mode
    try {
      const zoneIds = armZoneSelection.value.length ? armZoneSelection.value : []
      const data = await executeSecurityPanelArm(mode, zoneIds, zones.value, patchModeFromSocket)
      const selectedMode = securityModes.value.find((modeEntry: SecurityMode) => modeEntry.key === mode)
      const label = selectedMode?.name || mode
      const outcome = interpretSecurityArmResult(mode, label, data)
      if (outcome.kind === 'failed') {
        chrome.notify(outcome.message, 'error')
        await fetchSecAuditEvents()
        return
      }
      if (outcome.kind === 'partial') {
        chrome.notify(outcome.message, 'warning')
        addSecEvent(Shield, `手动${label}（联动降级）`, 'sec-event-item--mode')
        await fetchSecAuditEvents()
        return
      }
      if (outcome.kind === 'skipped') {
        addSecEvent(ShieldCheck, `已是${label}，跳过重复联动`, 'sec-event-item--mode')
      } else {
        addSecEvent(Shield, `手动${label}`, 'sec-event-item--mode')
        hapticAlert()
      }
      await fetchSecAuditEvents()
    } catch (requestError: unknown) {
      const status = (requestError as { response?: { status?: number } })?.response?.status
      chrome.notify(status === 403 ? '权限不足，需管理员账号' : '安防操作失败', 'error')
      logger.error('安防操作失败:', requestError)
    } finally {
      secArming.value = null
    }
  }

  function emergencySummaryText() {
    const cfg = normalizeSecurityEmergency(layoutStore.layoutConfig.securityEmergency || {})
    if (cfg.mode === 'notify_only') return '已触发静默通知（不控设备）'
    if (cfg.mode === 'key_areas') return '已触发重点区域声光联动'
    if (cfg.mode === 'custom') return '已触发自定义求救联动'
    return '已触发全屋声光联动'
  }

  async function handleEmergency() {
    if (emergencyBusy.value) return
    const cooldownMs = 60_000
    if (Date.now() - lastEmergencyAt.value < cooldownMs) {
      chrome.notify('紧急求助冷却中，请稍后再试', 'warning')
      return
    }
    emergencyBusy.value = true
    try {
      const { data } = await triggerSecurityEmergency()
      if (data?.success === false) {
        const msg = data.reason === 'cooldown' ? '紧急求助冷却中，请稍后再试' : '紧急求助进行中'
        chrome.notify(msg, 'warning')
        return
      }
      lastEmergencyAt.value = Date.now()
      addSecEvent(AlertTriangle, '紧急求助已触发', 'sec-event-item--danger')
      chrome.notify(emergencySummaryText(), 'warning')
      await fetchSecAuditEvents()
      refreshSecPanel()
    } catch (emergencyError: unknown) {
      const status = (emergencyError as { response?: { status?: number } })?.response?.status
      chrome.notify(status === 403 ? '权限不足，需管理员账号' : '紧急求助失败，请重试', 'error')
      logger.error('紧急求助失败:', emergencyError)
    } finally {
      emergencyBusy.value = false
    }
  }

  let prevSecMode = 'disarmed'
  watch(secCurrentMode, (mode) => {
    if (prevSecMode !== mode) {
      const selectedMode = securityModes.value.find((modeEntry: SecurityMode) => modeEntry.key === mode)
      addSecEvent(ShieldCheck, `安防模式: ${selectedMode?.name || mode}`, 'sec-event-item--mode')
      prevSecMode = mode
    }
  })

  let prevSensorStates: Record<string, boolean> = {}
  let sensorStatesSeeded = false

  function zoneIdsForSensor(entityId: string) {
    return (zones.value || [])
      .filter((z) => Array.isArray(z.sensors) && z.sensors.includes(entityId))
      .map((z) => z.id)
  }

  function syncSensorStateEvents(sensors: SecurityOverviewSensor[]) {
    if (!sensorStatesSeeded) {
      for (const sensor of sensors) prevSensorStates[sensor.entity_id] = sensor.alert
      sensorStatesSeeded = true
      return
    }
    for (const sensor of sensors) {
      const prev = prevSensorStates[sensor.entity_id]
      if (prev !== undefined && prev !== sensor.alert) {
        addSecEvent(
          sensor.iconComp,
          sensor.alert ? `${sensor.name} 告警` : `${sensor.name} 恢复`,
          sensor.alert ? 'sec-event-item--danger' : 'sec-event-item--ok',
          { zoneIds: zoneIdsForSensor(sensor.entity_id) },
        )
      }
    }
    prevSensorStates = {}
    for (const sensor of sensors) prevSensorStates[sensor.entity_id] = sensor.alert
  }

  watch(
    () => {
      const list = allSensors.value
      let sig = String(list.length)
      for (let i = 0; i < list.length; i++) {
        const sensor = list[i]
        sig += `\0${sensor.entity_id}:${sensor.alert ? 1 : 0}`
      }
      return sig
    },
    () => syncSensorStateEvents(allSensors.value),
  )

  onMounted(() => {
    prevSecMode = secCurrentMode.value
    syncSensorStateEvents(allSensors.value)
    fetchSecAuditEvents()
    loadSecurityParams()
    if (boundSensorCount.value > 0) boundOnly.value = true
    Promise.all([loadPresenceHome(), fetchPresenceSummary().catch(() => ({ data: null }))])
      .then(([data, mmRes]) => {
        const parts: string[] = []
        const atHome = data?.atHomeCount ?? 0
        const total = data?.totalPersons ?? 0
        if (total > 0) parts.push(`在家 ${atHome}/${total} 人`)
        const presenceData = mmRes.data
        if (presenceData?.totalRooms > 0) {
          parts.push(`毫米波 ${presenceData.occupiedRooms}/${presenceData.totalRooms} 间有人`)
        }
        presenceSummary.value = parts.join(' · ')
      })
      .catch(() => {
        presenceSummary.value = ''
      })
  })

  return {
    secArming,
    armZoneSelection,
    emergencyBusy,
    sensorCooldownSec,
    presenceSummary,
    goSecurityParams,
    goSecurityModes,
    handleFalseAlarmFeedback,
    handleAcknowledgeAlerts,
    handleSecurityArm,
    handleEmergency,
  }
}
