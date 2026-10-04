/**
 * @file useSecurityOverview.ts
 * @module composables/security
 * @description 安防总览 composable，聚合面板状态、传感器、审计事件、危险联动等核心逻辑。
 *   - 组合 useSecurityPanelStatus / useSecuritySensors / useSecurityAuditEvents / useReduceSecuritySensitivity
 *   - 提供布防操作、紧急求助、误报反馈、危险场景测试/演习等业务方法
 *   - 监听传感器状态变化推送会话事件，并同步告警确认与通知已读
 *   - 派生模式名称/颜色、过滤器、分组列表、危险配置摘要等 UI 所需结构
 * @dependencies vue, @/utils/core/logger, vue-router, @lucide/vue, @/stores/layout.store, @/stores/auth.store, @/utils/config/frontend-config, @/composables/security/*, @/utils/ui/haptics.util, @/services/api/orchestrator, @/services/api/notifications, @/services/api/security, @/utils/core/error-message, @homeos/shared, @/constants/security-emergency, @/utils/security/security-panel-arm.util, @/types/layout
 */
import { ref, computed, watch, onMounted } from 'vue'
import { logger } from '@/utils/core/logger'
import { useRouter } from 'vue-router'
import { ShieldCheck, Shield, ShieldOff, Home, Moon, AlertTriangle } from '@lucide/vue'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useAuthStore } from '@/stores/auth.store'
import {
  getMaxRemoteNotifications,
  configEpoch,
  getConfigSection,
} from '@/utils/config/frontend-config'
import { useSecurityPanelStatus } from '@/composables/security/useSecurityPanelStatus'
import { useReduceSecuritySensitivity } from '@/composables/security/useReduceSecuritySensitivity'
import { useSecuritySensors } from '@/composables/security/useSecuritySensors'
import { useSecurityAuditEvents } from '@/composables/security/useSecurityAuditEvents'
import { hapticAlert } from '@/utils/ui/haptics.util'
import { callService } from '@/services/api/entities'
import { sceneEntityIdFromRecord } from '@/utils/ha/scene-script.util'
import { fetchNotifications, markNotificationRead } from '@/services/api/notifications'
import {
  fetchPresenceSummary,
  runHazardDrill as runHazardDrillApi,
  triggerSecurityEmergency,
} from '@/services/api/security'
import { loadPresenceHome } from '@/composables/presence/load-presence-home'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { hasAnyHazardSensorBinding, formatHazardBindingSummaryText } from '@homeos/shared'
import { normalizeSecurityEmergency } from '@/constants/security-emergency'
import { executeSecurityPanelArm } from '@/utils/security/panel-arm.util'
import type { SecurityMode } from '@/types/layout'
import type { Component } from 'vue'

/** 安防总览传感器结构（与 useSecuritySensors 输出一致） */
type SecurityOverviewSensor = {
  entity_id: string
  name: string
  domain: string
  alert: boolean
  type: string
  label: string
  order: number
  iconComp: Component
  iconColor: string
  css: string
  bound: boolean
  offline: boolean
}

/** 安防模式到强调色的映射 */
const MODE_ACCENTS: Record<string, string> = {
  disarmed: '#34d399',
  armed_home: '#fbbf24',
  armed_away: '#f87171',
  armed_night: '#a78bfa',
}

/**
 * 根据模式 key 获取强调色
 * @param key 模式 key
 * @returns 颜色值，未知模式回退到默认蓝
 */
function modeAccentFor(key: string) {
  return MODE_ACCENTS[key] || '#0A84FF'
}
/**
 * 安防总览 composable
 * @returns 聚合后的响应式状态与业务方法
 */
export function useSecurityOverview() {
  const router = useRouter()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const authStore = useAuthStore()

  // 安防模式列表（来自布局配置）
  const securityModes = computed(() => layoutStore.layoutConfig.securityModes || [])
  // 复用面板状态 composable
  const {
    currentMode: secCurrentMode,
    zones,
    loading: secPanelLoading,
    refresh: refreshSecPanel,
    patchModeFromSocket,
    error: secPanelError,
    ready: secPanelReady,
  } = useSecurityPanelStatus()
  // 复用降低灵敏度 composable
  const { reducing: reducingSensitivity, reduceSensitivity } = useReduceSecuritySensitivity()
  // 复用传感器聚合 composable
  const {
    allSensors,
    alertCount,
    activeAlertChips,
    statCards,
    sensorFilters,
    acknowledgeAllAlerts,
  } = useSecuritySensors()

  // 复用审计事件 composable，传入实时区域用于生成区域过滤项
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

  // 布防进行中标记，防止重复触发
  const secArming = ref<string | null>(null)
  // 布防区域选择（手动指定要布防的区域）
  const armZoneSelection = ref<string[]>([])
  // 紧急求助进行中标记
  const emergencyBusy = ref(false)
  // 上次紧急求助时间戳，用于前端冷却
  const lastEmergencyAt = ref(0)
  // 传感器类型过滤器
  const sensorFilter = ref('all')
  // 仅显示告警传感器开关
  const alertsOnly = ref(false)
  // 仅显示已绑定传感器开关
  const boundOnly = ref(false)
  // 传感器告警冷却秒数（来自配置）
  const sensorCooldownSec = ref<number | null>(null)
  // 在家状态摘要文案
  const presenceSummary = ref('')
  // 危险场景测试进行中标记
  const hazardTesting = ref(false)
  // 危险演习进行中标记
  const hazardDrillBusy = ref(false)

  // 危险传感器或紧急场景是否已配置
  const hazardConfigured = computed(() => {
    const hc = layoutStore.layoutConfig.haConfig || {}
    return Boolean(hc.hazardEmergencySceneId?.trim() || hasAnyHazardSensorBinding(hc))
  })

  // 危险配置摘要文案：已绑定数量 · 紧急场景 · 演习模式
  const hazardSummary = computed(() => {
    const hc = layoutStore.layoutConfig.haConfig || {}
    const bindingText = formatHazardBindingSummaryText(hc)
    const parts: string[] = []
    if (bindingText) parts.push(`已绑定 ${bindingText}`)
    if (hc.hazardEmergencySceneId?.trim()) parts.push('紧急场景')
    if (hc.hazardDrillMode) parts.push('演习模式')
    return parts.length ? parts.join(' · ') : '可在集成绑定中配置烟/燃气/水浸传感器与紧急场景'
  })

  // 危险栏标题：根据配置完整度显示不同文案
  const hazardBarTitle = computed(() => {
    const hc = layoutStore.layoutConfig.haConfig || {}
    const hasScene = Boolean(hc.hazardEmergencySceneId?.trim())
    const hasBinding = hasAnyHazardSensorBinding(hc)
    if (hasScene && hasBinding) return '安全传感器联动已配置'
    if (hasBinding) return '危险传感器已绑定'
    if (hasScene) return '紧急场景已配置'
    return '安全传感器'
  })

  // 紧急场景是否已配置
  const hazardSceneConfigured = computed(() =>
    Boolean(layoutStore.layoutConfig.haConfig?.hazardEmergencySceneId?.trim()),
  )

  /**
   * 测试危险场景联动：触发配置的紧急场景
   * @sideEffects 成功时 Toast 提示；失败时 Toast 错误；未配置时引导跳转
   */
  async function testHazardLinkage() {
    const raw = layoutStore.layoutConfig.haConfig?.hazardEmergencySceneId?.trim()
    // 支持多场景：按逗号/分号/空白分隔
    const sceneIds = raw
      ? raw
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    if (!sceneIds.length) {
      chrome.notify('请先在集成绑定中配置紧急场景 ID', 'warning')
      goHazardBindings()
      return
    }
    hazardTesting.value = true
    try {
      for (const sceneId of sceneIds) {
        const entityId = sceneEntityIdFromRecord({ haConfigId: sceneId }) || sceneId
        await callService({ domain: 'scene', service: 'turn_on', entity_id: entityId })
      }
      chrome.notify(
        sceneIds.length > 1
          ? `已触发 ${sceneIds.length} 个紧急场景（测试）`
          : '已触发紧急场景（测试）',
        'success',
      )
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '场景执行失败'), 'error')
    } finally {
      hazardTesting.value = false
    }
  }

  /**
   * 触发危险演习
   * @param kind 演习类型，默认 'smoke'
   * @sideEffects 成功时 Toast 提示；失败时 Toast 错误
   */
  async function runHazardDrill(kind = 'smoke') {
    hazardDrillBusy.value = true
    try {
      const { data } = await runHazardDrillApi(kind)
      chrome.notify(data?.message || '演习已触发', data?.success !== false ? 'success' : 'warning')
    } catch (e) {
      chrome.notify(getApiErrorMessage(e, '演习失败'), 'error')
    } finally {
      hazardDrillBusy.value = false
    }
  }

  /** 跳转到集成绑定设置页 */
  function goHazardBindings() {
    router.push({ path: '/settings', query: { tab: 'bindings', section: 'security' } })
  }

  // 安防模式图标映射
  const secIconMap = { Shield, ShieldOff, Home, Moon, ShieldCheck }

  // 当前模式名称，缺省回退为"已撤防"
  const secCurrentName = computed(() => {
    const sm = securityModes.value.find((m: SecurityMode) => m.key === secCurrentMode.value)
    return sm?.name || '已撤防'
  })

  // 当前模式对应的文字颜色类
  const secModeColor = computed(() => {
    const map: Record<string, string> = {
      disarmed: 'text-emerald-400',
      armed_home: 'text-amber-400',
      armed_away: 'text-red-400',
      armed_night: 'text-violet-400',
    }
    return map[secCurrentMode.value] || 'text-gray-400'
  })
  // 过滤后的传感器列表：按类型与绑定状态过滤
  const filteredSensors = computed(() => {
    let list =
      sensorFilter.value === 'all'
        ? allSensors.value
        : allSensors.value.filter((s) => s.type === sensorFilter.value)
    // 仅显示已绑定时进一步过滤
    if (boundOnly.value) list = list.filter((s) => s.bound)
    return list
  })

  // 已绑定传感器数量
  const boundSensorCount = computed(() => allSensors.value.filter((s) => s.bound).length)

  // 实际展示的传感器列表：alertsOnly 开启时仅保留告警项
  const listSensors = computed(() => {
    if (!alertsOnly.value) return filteredSensors.value
    return filteredSensors.value.filter((s) => s.alert)
  })

  // 按类型分组的传感器列表，用于分组渲染
  const groupedListSensors = computed(() => {
    const groups: Record<string, { type: string; label: string; items: SecurityOverviewSensor[] }> =
      {}
    for (const s of listSensors.value) {
      if (!groups[s.type]) groups[s.type] = { type: s.type, label: s.label, items: [] }
      groups[s.type].items.push(s)
    }
    // 按预设类型顺序排序
    const order: Record<string, number> = { smoke: 0, gas: 1, co: 2, leak: 3, door: 4, motion: 5 }
    return Object.values(groups).sort((a, b) => (order[a.type] || 99) - (order[b.type] || 99))
  })

  /**
   * 切换传感器类型过滤器：同类型再次点击则重置为 all
   * @param key 类型 key
   */
  function toggleSensorFilter(key: string) {
    sensorFilter.value = sensorFilter.value === key ? 'all' : key
  }

  // 告警数变化时自动开启"仅告警"视图
  watch(
    alertCount,
    (n) => {
      if (n > 0) alertsOnly.value = true
    },
    { immediate: true },
  )

  /**
   * 加载安防参数（如传感器告警冷却秒数）
   * @sideEffects 更新 sensorCooldownSec
   */
  function loadSecurityParams() {
    void configEpoch.value
    const sec = getConfigSection('security')
    if (sec?.sensorAlertCooldownSec != null) {
      sensorCooldownSec.value = sec.sensorAlertCooldownSec
    }
  }

  /** 跳转到安防参数设置页 */
  function goSecurityParams() {
    router.push({ path: '/settings', query: { tab: 'params', section: 'security' } })
  }

  /** 跳转到安防模式设置页 */
  function goSecurityModes() {
    router.push({ path: '/settings', query: { tab: 'security-modes' } })
  }

  /**
   * 处理误报反馈：降低灵敏度并记录反馈，刷新审计日志
   * @sideEffects 更新 sensorCooldownSec 与审计事件
   */
  async function handleFalseAlarmFeedback() {
    const data = await reduceSensitivity({ recordFeedback: true, source: 'security_overview' })
    if (data?.sensorAlertCooldownSec != null) sensorCooldownSec.value = data.sensorAlertCooldownSec
    await fetchSecAuditEvents()
  }

  /**
   * 处理确认所有告警：标记本地已确认 + 标记相关通知已读 + 推送会话事件
   * @sideEffects 更新 acknowledgedSensorIds 与通知状态
   */
  async function handleAcknowledgeAlerts() {
    acknowledgeAllAlerts()
    try {
      // 同步标记安防/异常/传感器告警类通知为已读
      const res = await fetchNotifications({ limit: getMaxRemoteNotifications() })
      const list = Array.isArray(res.data) ? res.data : []
      for (const n of list) {
        const src = n.source || ''
        if (
          !n.read &&
          (src.includes('security') || src.includes('anomaly') || src === 'sensor-alert')
        ) {
          await markNotificationRead(n.id)
        }
      }
    } catch (e) {
      // 通知已读失败不影响主流程，仅记日志
      logger.debug('确认安全通知失败', e)
    }
    addSecEvent(ShieldCheck, '用户确认了所有告警', 'sec-event-item--mode')
  }
  /**
   * 处理安防布防操作
   * @param mode 目标模式 key
   * @sideEffects 调用后端布防、推送会话事件、刷新审计日志
   * @exceptions 403 提示权限不足；其他错误提示安防操作失败
   */
  async function handleSecurityArm(mode: string) {
    // 已有布防进行中时跳过，防止重复触发
    if (secArming.value) return
    // 权限校验：仅管理员可切换模式
    if (authStore.role !== 'admin') {
      chrome.notify('仅管理员可切换安防模式', 'warning')
      return
    }
    // 二次确认：布防/撤防为危险操作，仅用户手动触发路径执行（自动布防不经此函数）
    const isDisarm = mode === 'disarmed'
    const armModeName = securityModes.value.find((m: SecurityMode) => m.key === mode)?.name
    const ok = await chrome.confirm(
      isDisarm ? '确定撤防？撤防后监控将关闭' : `确定布防${armModeName || mode}？布防期间将联动安防设备`,
      isDisarm ? '撤防确认' : '布防确认',
      { type: 'danger', confirmText: isDisarm ? '确认撤防' : '确认布防' },
    )
    if (!ok) return
    secArming.value = mode
    try {
      // 未手动选择区域时布防全部
      const zoneIds = armZoneSelection.value.length ? armZoneSelection.value : []
      const data = await executeSecurityPanelArm(mode, zoneIds, zones.value, patchModeFromSocket)
      const sm = securityModes.value.find((m: SecurityMode) => m.key === mode)
      if (data?.success === false) {
        const failedActions = data?.actions?.failed ?? 0
        chrome.notify(
          failedActions > 0
            ? `${sm?.name || mode}未生效：${failedActions} 条联动失败，布防已取消`
            : `${sm?.name || mode}未生效`,
          'error',
        )
        await fetchSecAuditEvents()
        return
      }
      if (data?.skipped) {
        // 已处于目标模式，跳过重复联动
        addSecEvent(ShieldCheck, `已是${sm?.name || mode}，跳过重复联动`, 'sec-event-item--mode')
      } else {
        addSecEvent(Shield, `手动${sm?.name || mode}`, 'sec-event-item--mode')
        // 触发触觉反馈，提示用户操作生效
        hapticAlert()
      }
      await fetchSecAuditEvents()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      chrome.notify(status === 403 ? '权限不足，需管理员账号' : '安防操作失败', 'error')
      logger.error('安防操作失败:', err)
    } finally {
      secArming.value = null
    }
  }

  /**
   * 生成紧急求助摘要文案
   * @returns 根据紧急模式返回对应文案
   */
  function emergencySummaryText() {
    const cfg = normalizeSecurityEmergency(layoutStore.layoutConfig.securityEmergency || {})
    if (cfg.mode === 'notify_only') return '已触发静默通知（不控设备）'
    if (cfg.mode === 'key_areas') return '已触发重点区域声光联动'
    if (cfg.mode === 'custom') return '已触发自定义求救联动'
    // 默认全屋声光联动
    return '已触发全屋声光联动'
  }

  /**
   * 处理紧急求助：调用后端触发紧急联动
   * @sideEffects 成功时推送会话事件与 Toast；失败时 Toast 错误
   * @exceptions 403 提示权限不足；其他错误提示紧急求助失败
   */
  async function handleEmergency() {
    // 进行中时跳过
    if (emergencyBusy.value) return
    // 权限校验：仅管理员可触发
    if (authStore.role !== 'admin') {
      chrome.notify('仅管理员可触发紧急求助', 'warning')
      return
    }
    // 前端冷却 60 秒，防止误触频繁触发
    const cooldownMs = 60_000
    if (Date.now() - lastEmergencyAt.value < cooldownMs) {
      chrome.notify('紧急求助冷却中，请稍后再试', 'warning')
      return
    }
    emergencyBusy.value = true
    try {
      const { data } = await triggerSecurityEmergency()
      if (data?.success === false) {
        // 后端冷却或进行中
        const msg = data.reason === 'cooldown' ? '紧急求助冷却中，请稍后再试' : '紧急求助进行中'
        chrome.notify(msg, 'warning')
        return
      }
      lastEmergencyAt.value = Date.now()
      addSecEvent(AlertTriangle, '紧急求助已触发', 'sec-event-item--danger')
      chrome.notify(emergencySummaryText(), 'warning')
      await fetchSecAuditEvents()
      refreshSecPanel()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      chrome.notify(status === 403 ? '权限不足，需管理员账号' : '紧急求助失败，请重试', 'error')
      logger.error('紧急求助失败:', err)
    } finally {
      emergencyBusy.value = false
    }
  }

  // 监听模式变化，推送会话事件
  let prevSecMode = 'disarmed'
  watch(secCurrentMode, (mode) => {
    if (prevSecMode !== mode) {
      const sm = securityModes.value.find((m: SecurityMode) => m.key === mode)
      addSecEvent(ShieldCheck, `安防模式: ${sm?.name || mode}`, 'sec-event-item--mode')
      prevSecMode = mode
    }
  })

  // 传感器状态快照，用于检测告警/恢复变化
  let prevSensorStates: Record<string, boolean> = {}
  // 是否已完成首次快照播种
  let sensorStatesSeeded = false

  /**
   * 查询传感器所属区域 ID 列表
   * @param entityId 传感器实体 ID
   * @returns 包含该传感器的区域 ID 列表
   */
  function zoneIdsForSensor(entityId: string) {
    return (zones.value || [])
      .filter((z) => Array.isArray(z.sensors) && z.sensors.includes(entityId))
      .map((z) => z.id)
  }

  /**
   * 同步传感器状态变化事件：首次播种快照，后续检测变化推送告警/恢复事件
   * @param sensors 当前传感器列表
   * @sideEffects 更新 prevSensorStates 并推送会话事件
   */
  function syncSensorStateEvents(sensors: SecurityOverviewSensor[]) {
    // 首次仅播种快照，不推送事件
    if (!sensorStatesSeeded) {
      for (const s of sensors) prevSensorStates[s.entity_id] = s.alert
      sensorStatesSeeded = true
      return
    }
    for (const s of sensors) {
      const prev = prevSensorStates[s.entity_id]
      // 状态变化时推送告警或恢复事件
      if (prev !== undefined && prev !== s.alert) {
        addSecEvent(
          s.iconComp,
          s.alert ? `${s.name} 告警` : `${s.name} 恢复`,
          s.alert ? 'sec-event-item--danger' : 'sec-event-item--ok',
          { zoneIds: zoneIdsForSensor(s.entity_id) },
        )
      }
    }
    // 更新快照
    prevSensorStates = {}
    for (const s of sensors) prevSensorStates[s.entity_id] = s.alert
  }

  /**
   * 浅层监听：allSensors 为 computed，依赖 domainEpoch / haConfig，每次重算产出新数组。
   * 再以 length + entity_id:alert 指纹触发，避免 deep watch 大列表开销。
   */
  watch(
    () => {
      const list = allSensors.value
      let sig = String(list.length)
      for (let i = 0; i < list.length; i++) {
        const s = list[i]
        sig += `\0${s.entity_id}:${s.alert ? 1 : 0}`
      }
      return sig
    },
    () => syncSensorStateEvents(allSensors.value),
  )
  // 挂载时初始化：播种状态、拉取审计、加载参数、聚合在家摘要
  onMounted(() => {
    prevSecMode = secCurrentMode.value
    syncSensorStateEvents(allSensors.value)
    fetchSecAuditEvents()
    loadSecurityParams()
    // 存在绑定传感器时默认开启"仅绑定"过滤
    if (boundSensorCount.value > 0) boundOnly.value = true
    // 并行拉取在家状态与毫米波摘要，组装 presenceSummary
    Promise.all([loadPresenceHome(), fetchPresenceSummary().catch(() => ({ data: null }))])
      .then(([data, mmRes]) => {
        const parts: string[] = []
        const atHome = data?.atHomeCount ?? 0
        const total = data?.totalPersons ?? 0
        if (total > 0) parts.push(`在家 ${atHome}/${total} 人`)
        const mm = mmRes.data
        if (mm?.totalRooms > 0) {
          parts.push(`毫米波 ${mm.occupiedRooms}/${mm.totalRooms} 间有人`)
        }
        presenceSummary.value = parts.join(' · ')
      })
      .catch(() => {
        presenceSummary.value = ''
      })
  })

  return {
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
  }
}