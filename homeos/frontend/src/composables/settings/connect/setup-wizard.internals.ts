/**
 * @file setup-wizard.internals.ts
 * @module frontend/src/views
 */
/** composables：合并自 setup 向导面板与环境步骤 */
import {
  handleSystemConfigPatchError,
  useSystemConfig,
} from '@/composables/config/system-config-core.internals'
import { getEnvSensorFields, useEnvSensorMap } from '@/composables/settings/env-sensor-map.internals'
import { pauseGlobalPendingChanges, resumeGlobalPendingChanges, syncGlobalLayoutPendingSnapshot } from '@/composables/settings/pending.internals'
import { useReduceSecuritySensitivity } from '@/composables/security/useReduceSecuritySensitivity'
import { loadPresenceHome } from '@/composables/presence/load-presence-home'
import { completeSetupWizard, fetchSetupWizardStatus, validateSetupWizardEntities } from '@/services/api/system'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import type { DoorbellConfig, EntityValidateResult, PresenceHomeResponse, PresenceMember, SetupWizardStatus, SetupWizardStepId } from '@/types/setup-wizard'
import { logger } from '@/utils/core/logger'
import { formatLocaleDate } from '@/utils/format/locale-format.util'
import { ensureDoorbellList } from '@/utils/layout/doorbell.util'
import { formatPresenceDetailSummary } from '@/utils/presence/display.util'
import { useSettingsHubRouteSection } from '@/composables/settings/hub-ui.internals'
import { envRoomTabEmoji } from '@/utils/settings/tab-emoji.util'
import { Droplets, Leaf, Thermometer, Wind } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'

// ── useSetupWizard ──
/** 环境步骤达标所需的最少已绑定房间数（与后端 ENV_ROOM_MIN 口径一致） */
const ENV_ROOM_MIN = 3

function useSetupWizard(envMap = useEnvSensorMap(), envStep = useSetupWizardEnvStep(envMap)) {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()
  const { load: loadSystemConfig, save: saveSystemConfig } = useSystemConfig()
  const { reduceSensitivity: reduceSensitivityApi } = useReduceSecuritySensitivity()

  const STEPS = computed(() => [
    { id: 'connection', label: '连接 HA', num: 1 },
    { id: 'security', label: '安防绑定', num: 2 },
    { id: 'energy', label: '主电表', num: 3 },
    { id: 'environment', label: '环境传感器', num: 4 },
    { id: 'dashboard', label: '户型与收藏', num: 5 },
    { id: 'complete', label: '完成', num: 6 },
  ])

  const currentStep = ref(0)
  const loading = ref(false)
  const saving = ref(false)
  const status = ref<SetupWizardStatus | null>(null)
  const validateResult = ref<EntityValidateResult | null>(null)
  const message = ref<string>('')
  const messageOk = ref(true)

  const meterEntityId = ref<string>('')
  const circuitEntityIds = ref<string>('')
  const motionEntityId = ref<string>('')

  const presenceHome = ref<PresenceHomeResponse | null>(null)
  const presenceLoading = ref(false)
  const presenceLoaded = ref(false)
  const autoArmEnabled = ref(false)
  const autoUpgradeEnabled = ref(false)
  const presenceFlagSaving = ref(false)

  const presenceMembers = computed((): PresenceMember[] => {
    const list = presenceHome.value?.members
    return Array.isArray(list) ? list : []
  })

  const presenceAutoMode = computed(() => presenceHome.value?.autoMode !== false)

  const presenceSummary = computed(() =>
    formatPresenceDetailSummary(presenceMembers.value, {
      loading: presenceLoading.value,
      autoMode: presenceAutoMode.value,
      personCount: presenceHome.value?.persons?.length ?? 0,
    }),
  )

  const presenceAtHomeCount = computed(() => presenceMembers.value.filter((m) => m.atHome).length)

  function applyPresenceSecurityFlags(cfg: { security?: Record<string, unknown> } | null) {
    const sec = cfg?.security || {}
    autoArmEnabled.value = Boolean(sec.autoArmOnEveryoneLeft)
    autoUpgradeEnabled.value = Boolean(sec.autoUpgradeToAwayOnEveryoneLeft)
  }

  async function loadPresence() {
    presenceLoading.value = true
    try {
      const [presence, cfg] = await Promise.all([
        loadPresenceHome(),
        loadSystemConfig().catch(() => null),
      ])
      presenceHome.value = (presence as PresenceHomeResponse | null) ?? null
      if (!presence) {
        notify('加载在家状态失败', false)
      }
      applyPresenceSecurityFlags(cfg)
    } catch (e) {
      logger.error('加载人员 presence 失败', e)
      presenceHome.value = null
      notify('加载在家状态失败', false)
    } finally {
      presenceLoading.value = false
      presenceLoaded.value = true
    }
  }

  async function setPresenceSecurityFlag(
    key: 'autoArmOnEveryoneLeft' | 'autoUpgradeToAwayOnEveryoneLeft',
    next: boolean,
  ) {
    if (presenceFlagSaving.value) return false
    const prevArm = autoArmEnabled.value
    const prevUpgrade = autoUpgradeEnabled.value
    if (key === 'autoArmOnEveryoneLeft') autoArmEnabled.value = next
    else autoUpgradeEnabled.value = next
    presenceFlagSaving.value = true
    try {
      await saveSystemConfig({ security: { [key]: next } })
      const label =
        key === 'autoArmOnEveryoneLeft' ? '全员离家自动布防' : '居家/夜间升级为离家布防'
      notify(next ? `已开启：${label}` : `已关闭：${label}`)
      return true
    } catch (e) {
      autoArmEnabled.value = prevArm
      autoUpgradeEnabled.value = prevUpgrade
      logger.error('保存 Presence 安防开关失败', e)
      if (await handleSystemConfigPatchError(e, chrome)) {
        notify('配置已被其他终端修改，已重新加载', false)
        return false
      }
      notify('保存失败，请稍后重试', false)
      return false
    } finally {
      presenceFlagSaving.value = false
    }
  }

  async function toggleAutoArm() {
    return setPresenceSecurityFlag('autoArmOnEveryoneLeft', !autoArmEnabled.value)
  }

  async function toggleAutoUpgrade() {
    return setPresenceSecurityFlag(
      'autoUpgradeToAwayOnEveryoneLeft',
      !autoUpgradeEnabled.value,
    )
  }

  const stepMeta = computed(() => STEPS.value[currentStep.value] || STEPS.value[0])

  watch(stepMeta, (meta) => {
    if (meta.id === 'security') void loadPresence()
  })

  const progress = computed(() => status.value?.progress ?? 0)
  const learningDays = computed(() => status.value?.learningPeriodDays ?? 7)
  const learningStartedAt = computed(() => status.value?.learningStartedAt || null)

  const doorbellList = computed({
    get(): DoorbellConfig[] {
      const hc = layoutStore.layoutConfig.haConfig
      if (!hc.doorbells) hc.doorbells = []
      return hc.doorbells
    },
    set(v: DoorbellConfig[]) {
      layoutStore.layoutConfig.haConfig.doorbells = v
    },
  })

  function addDoorbell() {
    doorbellList.value.push({
      id: `db_${Date.now()}`,
      label: '新门铃',
      triggerEntityId: '',
      cameraEntityId: '',
      lockEntityId: '',
    })
  }

  function removeDoorbell(idx: number) {
    doorbellList.value = doorbellList.value.filter((_, i) => i !== idx)
  }

  function notify(text: string, ok = true) {
    message.value = text
    messageOk.value = ok
    chrome.notify(text, ok ? 'success' : 'warning')
    setTimeout(() => {
      if (message.value === text) message.value = ''
    }, 3500)
  }

  async function refreshStatus() {
    loading.value = true
    try {
      const { data } = await fetchSetupWizardStatus<SetupWizardStatus>()
      status.value = data
      motionEntityId.value = layoutStore.layoutConfig.haConfig?.motionSensorEntityId || ''
      if (!meterEntityId.value && data?.ha) {
        const cfg = await loadSystemConfig().catch(() => null)
        const energy = cfg?.energy
        meterEntityId.value = energy?.meterEntityId || ''
        const circuits = energy?.circuitEntityIds
        if (Array.isArray(circuits) && circuits.length) {
          circuitEntityIds.value = circuits.join(', ')
        }
      }
    } catch (e) {
      logger.error('加载首装向导状态失败', e)
      notify('无法加载向导状态', false)
    } finally {
      loading.value = false
    }
  }

  async function validateEntityIds(ids: string[]): Promise<EntityValidateResult> {
    const entityIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))]
    if (!entityIds.length) return { allOk: false, valid: [], missing: [], empty: true }
    const knownLocally = (id: string) => Boolean(entitiesStore.getEntity(id))
    try {
      const { data } = await validateSetupWizardEntities(entityIds)
      const missing = (data?.missing || []).filter((id: string) => !knownLocally(id))
      const valid = entityIds.filter((id) => !missing.includes(id))
      const result = { ...data, valid, missing, allOk: missing.length === 0 }
      validateResult.value = result
      return result
    } catch (e) {
      logger.error('实体校验失败', e)
      const missing = entityIds.filter((id) => !knownLocally(id))
      if (!missing.length) {
        const result = { allOk: true, valid: entityIds, missing: [] }
        validateResult.value = result
        return result
      }
      notify('实体校验失败', false)
      return { allOk: false, valid: entityIds.filter(knownLocally), missing }
    }
  }

  function isStepDone(stepId: SetupWizardStepId) {
    return Boolean(status.value?.steps?.[stepId]?.done)
  }

  function canNavigateToStep(idx: number) {
    if (idx < 0 || idx >= STEPS.value.length) return false
    if (idx <= currentStep.value) return true
    for (let i = 0; i < idx; i++) {
      const id = STEPS.value[i]?.id
      // security / dashboard 可稍后补齐，不阻断后续导航
      if (!id || id === 'complete' || id === 'dashboard' || id === 'security') continue
      if (!isStepDone(id as SetupWizardStepId)) return false
    }
    return true
  }

  async function saveSecurityStep() {
    saving.value = true
    try {
      const hasTrigger =
        doorbellList.value.some((d) => d.triggerEntityId?.trim()) || motionEntityId.value.trim()
      if (!hasTrigger) {
        notify('请至少配置一路门铃触发实体或移动传感器', false)
        return false
      }
      const ids = doorbellList.value
        .flatMap((d) => [d.triggerEntityId, d.cameraEntityId, motionEntityId.value])
        .filter(Boolean)
      const v = await validateEntityIds(ids)
      if (!v.allOk) {
        notify(`以下实体未在 HA 同步：${v.missing.join(', ')}`, false)
        return false
      }
      const hc = layoutStore.layoutConfig.haConfig
      hc.motionSensorEntityId = motionEntityId.value.trim()
      const ok = await layoutStore.saveLayout(true)
      if (!ok) return false // saveConfig 已弹出失败提示
      syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
      notify('安防绑定已保存')
      await refreshStatus()
      return true
    } finally {
      saving.value = false
    }
  }

  async function saveEnergyStep() {
    saving.value = true
    try {
      const ids = [meterEntityId.value, ...circuitEntityIds.value.split(/[\s,;]+/)].filter(Boolean)
      const circuits = circuitEntityIds.value
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const v = await validateEntityIds(ids)
      if (!v.allOk) {
        notify(`以下实体未找到：${v.missing.join(', ')}`, false)
        return false
      }
      await saveSystemConfig({
        energy: {
          meterEntityId: meterEntityId.value.trim(),
          circuitEntityIds: circuits,
        },
      })
      notify('主电表与分路已保存')
      await refreshStatus()
      return true
    } catch (e) {
      logger.error('保存电表失败', e)
      notify('保存电表失败', false)
      return false
    } finally {
      saving.value = false
    }
  }

  async function saveEnvironmentStep() {
    if (!envStep.envStepReady.value) {
      notify(
        `请至少映射 ${ENV_ROOM_MIN} 个房间的环境传感器（当前 ${envStep.envConfiguredRoomCount.value}）`,
        false,
      )
      return false
    }
    const ok = await envMap.save()
    if (ok) {
      notify('环境传感器映射已保存')
      await refreshStatus()
    } else {
      notify('保存环境映射失败', false)
    }
    return ok
  }

  async function reduceSensitivity() {
    try {
      await reduceSensitivityApi({ recordFeedback: false, source: 'setup_wizard' })
      notify('已延长安防冷却时间，误报应有所减少')
    } catch (e) {
      logger.error('降低灵敏度失败', e)
      notify('降低灵敏度失败', false)
    }
  }

  async function completeWizard() {
    const required = ['connection', 'energy', 'environment'] as const
    const pending = required.filter((id) => !isStepDone(id))
    if (pending.length) {
      notify(
        `请先完成：${pending.map((id) => STEPS.value.find((s) => s.id === id)?.label || id).join('、')}`,
        false,
      )
      return false
    }
    if (!isStepDone('security')) {
      const ok = await chrome.confirm(
        '尚未配置门铃或移动传感器。仍可完成向导，建议稍后在安防设置中补齐。是否继续？',
        '安防尚未绑定',
        { confirmText: '仍要完成', cancelText: '先去配置', type: 'warning' },
      )
      if (!ok) return false
    }
    if (!isStepDone('dashboard')) {
      const ok = await chrome.confirm(
        '尚未上传户型图或配置常用设备。仍可完成向导启用能源学习期，建议稍后在设置清单中补齐。是否继续？',
        '仪表板尚未就绪',
        { confirmText: '仍要完成', cancelText: '先去配置', type: 'warning' },
      )
      if (!ok) return false
    }
    saving.value = true
    try {
      await completeSetupWizard({ learningPeriodDays: learningDays.value })
      notify('首装向导已完成，能源学习期已启用')
      await refreshStatus()
      return true
    } catch (e) {
      logger.error('完成向导失败', e)
      notify('完成向导失败', false)
      return false
    } finally {
      saving.value = false
    }
  }

  async function nextStep() {
    const id = stepMeta.value.id
    if (id === 'connection') {
      if (!status.value?.steps?.connection?.done) {
        notify('请先确保 HA 已连接且实体数 > 0', false)
        return
      }
    } else if (id === 'security') {
      const hasTrigger =
        doorbellList.value.some((d) => d.triggerEntityId?.trim()) || motionEntityId.value.trim()
      if (hasTrigger) {
        const ok = await saveSecurityStep()
        if (!ok) return
      } else {
        notify('未配置门铃或传感器，已跳过，可稍后在安防设置中补齐')
      }
    } else if (id === 'energy') {
      if (!meterEntityId.value.trim()) {
        notify('请填写主电表 entity_id', false)
        return
      }
      const ok = await saveEnergyStep()
      if (!ok) return
    } else if (id === 'environment') {
      const ok = await saveEnvironmentStep()
      if (!ok) return
    } else if (id === 'dashboard') {
      await refreshStatus()
    } else if (id === 'complete') {
      const ok = await completeWizard()
      if (!ok) return
      return
    }
    if (currentStep.value < STEPS.value.length - 1) {
      currentStep.value++
      if (STEPS.value[currentStep.value]?.id === 'environment') envMap.syncRoomEntries()
    }
  }

  function prevStep() {
    if (currentStep.value > 0) currentStep.value--
  }

  function goToStep(idx: number) {
    if (!canNavigateToStep(idx)) {
      notify('请先完成前面的步骤', false)
      return
    }
    if (idx >= 0 && idx < STEPS.value.length) {
      if (STEPS.value[idx]?.id === 'environment') envMap.syncRoomEntries()
      currentStep.value = idx
    }
  }

  async function init() {
    // 暂停 dirty 检测，避免初始化过程中的修改触发"有修改"提示
    pauseGlobalPendingChanges()
    try {
      await envMap.load()
      envMap.syncRoomEntries()
      ensureDoorbellList(layoutStore.layoutConfig.haConfig)
      await refreshStatus()
      // 初始化完成后同步快照，将当前状态设为新基线
      syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
    } finally {
      // 恢复 dirty 检测
      resumeGlobalPendingChanges()
    }
  }

  return {
    STEPS,
    currentStep,
    stepMeta,
    progress,
    loading,
    saving,
    status,
    validateResult,
    message,
    messageOk,
    meterEntityId,
    circuitEntityIds,
    motionEntityId,
    doorbellList,
    addDoorbell,
    removeDoorbell,
    learningDays,
    learningStartedAt,
    init,
    refreshStatus,
    nextStep,
    prevStep,
    goToStep,
    reduceSensitivity,
    completeWizard,
    inferEnvMap: () => {
      const { matchedCount } = envMap.applyInference(entitiesStore.entities)
      envMap.syncRoomEntries()
      notify(
        matchedCount
          ? `已推断 ${matchedCount} 个传感器映射，请核对后保存`
          : '未找到可匹配的传感器，请手动填写',
      )
    },
    presenceHome,
    presenceMembers,
    presenceLoading,
    presenceLoaded,
    presenceAutoMode,
    presenceSummary,
    presenceAtHomeCount,
    autoArmEnabled,
    autoUpgradeEnabled,
    presenceFlagSaving,
    loadPresence,
    toggleAutoArm,
    toggleAutoUpgrade,
  }
}

// ── useSetupWizardPanel ──
const STEP_LABELS: Record<string, string> = {
  complete: '完成',
  connection: '连接 HA',
  energy: '主电表',
  environment: '环境传感器',
  security: '安防绑定',
}

const PRESENCE_MEMBER_TONES = ['cyan', 'violet', 'emerald', 'amber', 'rose']

export function useSetupWizardPanel(activeTab: () => string) {
  const envMap = useEnvSensorMap()
  const envStep = useSetupWizardEnvStep(envMap)
  const wizard = useSetupWizard(envMap, envStep)

  useSettingsHubRouteSection(ref(''), wizard.STEPS, {
    tabId: 'setup-wizard',
    activeTab,
    onApply: (sec: string) => {
      const idx = wizard.STEPS.value.findIndex((s: { id: string }) => s.id === sec)
      if (idx >= 0) wizard.goToStep(idx)
    },
  })

  const wizardSteps = computed(() =>
    wizard.STEPS.value.map((s) => ({
      ...s,
      label: STEP_LABELS[s.id] ?? s.label,
    })),
  )

  function formatDate(iso: string) {
    try {
      return formatLocaleDate(iso)
    } catch {
      return iso
    }
  }

  function memberInitial(name: string) {
    const s = String(name || '').trim()
    return s ? s.charAt(0).toUpperCase() : '?'
  }

  function memberTone(idx: number) {
    return PRESENCE_MEMBER_TONES[idx % PRESENCE_MEMBER_TONES.length]
  }

  onMounted(() => wizard.init())

  return {
    envMap,
    envStep,
    wizard,
    wizardSteps,
    formatDate,
    memberInitial,
    memberTone,
  }
}

// ── useSetupWizardEnvStep ──
const ENV_SENSOR_ICONS = {
  temperature: Thermometer,
  humidity: Droplets,
  pm25: Wind,
  co2: Leaf,
  tvoc: Wind,
} as const

const ENV_SENSOR_UNITS = {
  temperature: '°C',
  humidity: '%',
  pm25: 'µg/m³',
  co2: 'ppm',
  tvoc: 'ppb',
} as const

const SENSOR_KEYS = ['temperature', 'humidity', 'pm25', 'co2', 'tvoc'] as const

export function useSetupWizardEnvStep(envMap: ReturnType<typeof useEnvSensorMap>) {
  const {
    sensorMap,
    roomList: envRoomList,
    loading: envLoading,
    registryDegraded,
    registryError,
    refreshHaAreas,
  } = envMap

  const envRoomTab = ref('living')

  const envSensorFieldList = computed(() =>
    Object.values(getEnvSensorFields()).map((f) => ({
      ...f,
      icon: ENV_SENSOR_ICONS[f.key as keyof typeof ENV_SENSOR_ICONS],
      unit: ENV_SENSOR_UNITS[f.key as keyof typeof ENV_SENSOR_UNITS],
      iconClass:
        f.key === 'temperature'
          ? 'sw-env-sensor-icon--temp'
          : f.key === 'humidity'
            ? 'sw-env-sensor-icon--humid'
            : f.key === 'pm25'
              ? 'sw-env-sensor-icon--pm25'
              : f.key === 'co2'
                ? 'sw-env-sensor-icon--co2'
                : 'sw-env-sensor-icon--tvoc',
      shortLabel:
        f.key === 'temperature'
          ? '温度'
          : f.key === 'humidity'
            ? '湿度'
            : f.key === 'pm25'
              ? 'PM2.5'
              : f.key === 'co2'
                ? 'CO₂'
                : 'TVOC',
    })),
  )

  function envRoomBound(roomId: string) {
    const entry = sensorMap.value[roomId]
    if (!entry) return false
    return SENSOR_KEYS.some((k) => String(entry[k] || '').trim())
  }

  function envRoomSensorCount(roomId: string) {
    const entry = sensorMap.value[roomId]
    if (!entry) return 0
    return SENSOR_KEYS.filter((k) => String(entry[k] || '').trim()).length
  }

  const envConfiguredRoomCount = computed(
    () => envRoomList.value.filter((room) => envRoomBound(room.id)).length,
  )

  const envStepReady = computed(() => envConfiguredRoomCount.value >= ENV_ROOM_MIN)

  const envProgressPct = computed(() =>
    Math.min(100, Math.round((envConfiguredRoomCount.value / ENV_ROOM_MIN) * 100)),
  )

  const envRoomTabs = computed(() =>
    envRoomList.value.map((room) => ({
      id: room.id,
      label: sensorMap.value[room.id]?.label?.trim() || room.defaultLabel,
      emoji: envRoomTabEmoji(room.id),
      accent: envRoomBound(room.id) ? '#34d399' : '#64748b',
      count: envRoomBound(room.id) ? String(envRoomSensorCount(room.id)) : undefined,
    })),
  )

  watch(envRoomTabs, (tabs) => {
    if (!tabs.length) return
    if (!tabs.some((t) => t.id === envRoomTab.value)) {
      envRoomTab.value = tabs[0].id
    }
  })

  const activeEnvRoom = computed(() => envRoomList.value.find((r) => r.id === envRoomTab.value))

  return {
    sensorMap,
    envLoading,
    envRoomTab,
    envSensorFieldList,
    envRoomBound,
    envRoomSensorCount,
    envConfiguredRoomCount,
    envStepReady,
    envProgressPct,
    envRoomTabs,
    activeEnvRoom,
    registryDegraded,
    registryDegradedReason: registryError,
    refreshAreas: refreshHaAreas,
  }
}
