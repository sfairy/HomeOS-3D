/**
 * @file setup-wizard-core.internals.ts
 * @module frontend/src/views
 */
/** 首装向导核心状态机 */
import { useSystemConfig } from '@/composables/config/system-config-core.internals'
import { useEnvSensorMap } from '@/features/settings/composables/env-sensor-map.internals'
import { pauseGlobalPendingChanges, resumeGlobalPendingChanges, syncGlobalLayoutPendingSnapshot } from '@/composables/settings-kernel/pending.internals'
import { useReduceSecuritySensitivity } from '@/features/security'
import { completeSetupWizard, fetchSetupWizardStatus, validateSetupWizardEntities } from '@/services/api/system'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import type { EntityValidateResult, SetupWizardStatus, SetupWizardStepId } from '@/shared/types/setup-wizard'
import { logger } from '@/shared/utils/core/logger'
import { ensureDoorbellList } from '@/shared/utils/layout/doorbell.util'
import { useSetupWizardEnvStep } from '@/features/settings/composables/connect/setup-wizard-env.internals'
import { useSetupWizardPresence } from '@/features/settings/composables/connect/setup-wizard-presence.internals'
import { useSetupWizardDoorbells } from '@/features/settings/composables/connect/setup-wizard-doorbell.internals'
import { computed, ref } from 'vue'

// ── useSetupWizard ──
const ENV_ROOM_MIN = 3

export function useSetupWizard(envMap = useEnvSensorMap(), envStep = useSetupWizardEnvStep(envMap)) {
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

  function notify(text: string, ok = true) {
    message.value = text
    messageOk.value = ok
    chrome.notify(text, ok ? 'success' : 'warning')
    setTimeout(() => {
      if (message.value === text) message.value = ''
    }, 3500)
  }

  const meterEntityId = ref<string>('')
  const circuitEntityIds = ref<string>('')
  const motionEntityId = ref<string>('')

  const stepMeta = computed(() => STEPS.value[currentStep.value] || STEPS.value[0])

  const {
    presenceHome,
    presenceLoading,
    presenceLoaded,
    autoArmEnabled,
    autoUpgradeEnabled,
    presenceFlagSaving,
    presenceMembers,
    presenceAutoMode,
    presenceSummary,
    presenceAtHomeCount,
    loadPresence,
    toggleAutoArm,
    toggleAutoUpgrade,
  } = useSetupWizardPresence({ stepMeta, notify })

  const progress = computed(() => status.value?.progress ?? 0)
  const learningDays = computed(() => status.value?.learningPeriodDays ?? 7)
  const learningStartedAt = computed(() => status.value?.learningStartedAt || null)

  const { doorbellList, addDoorbell, removeDoorbell } = useSetupWizardDoorbells()

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
    } catch (error) {
      logger.error('加载首装向导状态失败', error)
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
    } catch (error) {
      logger.error('实体校验失败', error)
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
        doorbellList.value.some((doorbell) => doorbell.triggerEntityId?.trim()) || motionEntityId.value.trim()
      if (!hasTrigger) {
        notify('请至少配置一路门铃触发实体或移动传感器', false)
        return false
      }
      const ids = doorbellList.value
        .flatMap((doorbell) => [doorbell.triggerEntityId, doorbell.cameraEntityId, motionEntityId.value])
        .filter(Boolean)
      const validation = await validateEntityIds(ids)
      if (!validation.allOk) {
        notify(`以下实体未在 HA 同步：${validation.missing.join(', ')}`, false)
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
        .map((part) => part.trim())
        .filter(Boolean)
      const validation = await validateEntityIds(ids)
      if (!validation.allOk) {
        notify(`以下实体未找到：${validation.missing.join(', ')}`, false)
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
    } catch (error) {
      logger.error('保存电表失败', error)
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
    } catch (error) {
      logger.error('降低灵敏度失败', error)
      notify('降低灵敏度失败', false)
    }
  }

  async function completeWizard() {
    const required = ['connection', 'energy', 'environment'] as const
    const pending = required.filter((id) => !isStepDone(id))
    if (pending.length) {
      notify(
        `请先完成：${pending.map((id) => STEPS.value.find((scene) => scene.id === id)?.label || id).join('、')}`,
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
    } catch (error) {
      logger.error('完成向导失败', error)
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
        doorbellList.value.some((doorbell) => doorbell.triggerEntityId?.trim()) || motionEntityId.value.trim()
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

