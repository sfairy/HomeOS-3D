/**
 * @file setup-wizard-core.internals.ts
 * @module frontend/src/views
 */
/** 首装向导核心状态机 */
import { useSystemConfig } from '@/composables/config/system-config-core.internals'
import { useEnvSensorMap } from '@/features/settings/shared/composables/env-sensor-map.internals'
import {
  pauseGlobalPendingChanges,
  resumeGlobalPendingChanges,
  syncGlobalLayoutPendingSnapshot,
} from '@/composables/settings-kernel/pending.internals'
import { useReduceSecuritySensitivity } from '@/features/security'
import { completeSetupWizard, fetchSetupWizardStatus, validateSetupWizardEntities } from '@/services/api/system'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import type { EntityValidateResult, SetupWizardStatus, SetupWizardStepId } from '@/shared/types/setup-wizard'
import type { EnergyMeterScope, SharedEnergyConfig } from '@homeos/shared'
import { logger } from '@/shared/utils/core/logger'
import { seedPanelEnergyMeter } from '@/shared/energy/utils/binding-bridge.util'
import { ensureDoorbellList } from '@/shared/utils/layout/doorbell.util'
import { useSetupWizardEnvStep } from '@/features/settings/connect/composables/setup-wizard-env.internals'
import { useSetupWizardPresence } from '@/features/settings/connect/composables/setup-wizard-presence.internals'
import { useSetupWizardDoorbells } from '@/features/settings/connect/composables/setup-wizard-doorbell.internals'
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
    { id: 'energy', label: '能源绑定', num: 3 },
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
  const meterScope = ref<EnergyMeterScope>('total')
  const mainPowerEntityId = ref<string>('')
  const monthMeterEntityId = ref<string>('')
  const dayMeterEntityId = ref<string>('')
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
  /** 后端算好的能源口径/粒度覆盖，前端只展示（旧后端可能不返回） */
  const energyBinding = computed(() => status.value?.energy || null)
  /** 用户是否手动改过口径：改过就不再被自动建议覆盖 */
  const scopeTouched = ref(false)

  /** 标记口径已被手动选择（供 UI 在用户点击分段控件时调用） */
  function markScopeTouched() {
    scopeTouched.value = true
  }

  /** 用户选了主电表后按实体名猜口径，省掉理解「清零周期」的成本 */
  async function applySuggestedScope(entityId: string) {
    const eid = String(entityId || '').trim()
    if (!eid || scopeTouched.value) return
    let info = validateResult.value?.entities?.[eid]
    if (!info) {
      const result = await validateEntityIds([eid]).catch(() => null)
      info = result?.entities?.[eid]
    }
    const suggested = info?.suggestedScope
    if (suggested && suggested !== meterScope.value) meterScope.value = suggested
  }

  const { doorbellList, addDoorbell, removeDoorbell } = useSetupWizardDoorbells()

  async function refreshStatus() {
    loading.value = true
    try {
      const { data } = await fetchSetupWizardStatus<SetupWizardStatus>()
      status.value = data
      motionEntityId.value = layoutStore.layoutConfig.haConfig?.motionSensorEntityId || ''
      // 能源绑定三项都要回填：总功率是新字段，旧配置里没有，缺省按空串处理。
      // 只在本地为空时覆盖，避免刷新把用户正在编辑的值冲掉。
      const cfg = await loadSystemConfig().catch(() => null)
      await hydrateEnergyBinding(cfg?.energy)
    } catch (error) {
      logger.error('加载首装向导状态失败', error)
      notify('无法加载向导状态', false)
    } finally {
      loading.value = false
    }
  }

  /**
   * 用系统配置回填能源绑定表单。
   *
   * 只填空值：向导面板可能与设置页同时挂着，刷新状态时若直接覆盖，
   * 会把用户刚选中还没保存的实体冲掉。回填完顺手校验一次类型，
   * 让「已识别为累计电量 / 功率」在保存前就能看到。
   */
  async function hydrateEnergyBinding(energy: SharedEnergyConfig | undefined) {
    meterEntityId.value ||= energy?.meterEntityId || ''
    if (energy?.meterScope) meterScope.value = energy.meterScope
    mainPowerEntityId.value ||= energy?.mainPowerEntityId || ''
    monthMeterEntityId.value ||= energy?.monthMeterEntityId || ''
    dayMeterEntityId.value ||= energy?.dayMeterEntityId || ''
    circuitEntityIds.value ||= (energy?.circuitEntityIds || []).join(', ')
    const bound = [
      meterEntityId.value,
      mainPowerEntityId.value,
      monthMeterEntityId.value,
      dayMeterEntityId.value,
      ...circuitEntityIds.value.split(/[\s,;]+/),
    ]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
    if (bound.length) await validateEntityIds(bound)
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

  /**
   * 校验能源绑定并返回「不该保存」的原因；通过则返回 null。
   *
   * 类型判错是「保存成功但趋势永远算不对」的典型来源：主表填了功率会得到 0/负数曲线，
   * 总功率填了累计电量则永远算不出实时负荷。这些必须在写库前拦住。
   */
  async function rejectInvalidEnergyBindings(input: {
    meter: string
    mainPower: string
    monthMeter: string
    dayMeter: string
    ids: string[]
  }): Promise<string | null> {
    const validation = await validateEntityIds(input.ids)
    if (!validation.allOk) return `以下实体未找到：${validation.missing.join(', ')}`
    const kinds = validation.entities || {}
    if (kinds[input.meter]?.kind === 'power') {
      return '主电表须为累计电量（kWh/Wh），不能选功率（W）传感器'
    }
    if (input.mainPower && kinds[input.mainPower]?.kind === 'energy') {
      return '总功率须为瞬时功率（W/kW），不能选累计电量传感器'
    }
    const auxiliary = [
      { id: input.monthMeter, label: '月累计' },
      { id: input.dayMeter, label: '日累计' },
    ].find((item) => item.id && kinds[item.id]?.kind === 'power')
    return auxiliary ? `${auxiliary.label}须为累计电量传感器，不能填功率（W）` : null
  }

  /**
   * 读取能源绑定表单并自查「同一块表被填两次」（会重复计费）。
   * 返回错误文案或规范化后的绑定值，供保存与校验共用。
   */
  function readEnergyBindingInput():
    | { error: string }
    | {
        value: {
          meter: string
          mainPower: string
          monthMeter: string
          dayMeter: string
          circuits: string[]
          ids: string[]
        }
      } {
    const meter = meterEntityId.value.trim()
    const mainPower = mainPowerEntityId.value.trim()
    const monthMeter = monthMeterEntityId.value.trim()
    const dayMeter = dayMeterEntityId.value.trim()
    if (!meter) return { error: '请填写主电表 entity_id' }
    const circuits = [
      ...new Set(
        circuitEntityIds.value
          .split(/[\s,;]+/)
          .map((part) => part.trim())
          .filter(Boolean),
      ),
    ]
    if (circuits.includes(meter)) {
      return { error: '分路不能与主电表重复，请从分路中移除主电表' }
    }
    if (monthMeter === meter || dayMeter === meter) {
      return { error: '月/日累计不能与主电表填同一个实体，它们是同一块表的其它口径' }
    }
    const ids = [...new Set([meter, mainPower, monthMeter, dayMeter, ...circuits].filter(Boolean))]
    return { value: { meter, mainPower, monthMeter, dayMeter, circuits, ids } }
  }

  /**
   * 把向导绑定的主电表同步给能耗面板（仅在面板完全没配置时）。
   *
   * 为什么需要：向导写的是后端聚合用的 `config.energy`，而能耗面板/弹窗读的是
   * `layoutConfig.statsSensors.energySources.grid` —— 两套绑定互不相通，用户绑完
   * 向导会发现面板还是空的。判定规则（含「空白面板才继承、并把默认的约定命名切成
   * 综合实体」）集中在 `binding-bridge.util`，与绑定页共用同一份，两边各写一遍迟早会分叉。
   */
  async function seedPanelEnergySource(meter: string): Promise<void> {
    if (!seedPanelEnergyMeter(layoutStore.layoutConfig.statsSensors, meter)) return
    if (!(await layoutStore.saveLayout(true))) return
    syncGlobalLayoutPendingSnapshot(layoutStore.layoutConfig)
  }

  async function saveEnergyStep() {
    saving.value = true
    try {
      const parsed = readEnergyBindingInput()
      if ('error' in parsed) {
        notify(parsed.error, false)
        return false
      }
      const { meter, mainPower, monthMeter, dayMeter, circuits, ids } = parsed.value
      const rejected = await rejectInvalidEnergyBindings({ ...parsed.value, ids })
      if (rejected) {
        notify(rejected, false)
        return false
      }
      const kinds = validateResult.value?.entities || {}
      const powerCircuitCount = circuits.filter((id) => kinds[id]?.kind === 'power').length
      await saveSystemConfig({
        energy: {
          meterEntityId: meter,
          meterScope: meterScope.value,
          mainPowerEntityId: mainPower,
          monthMeterEntityId: monthMeter,
          dayMeterEntityId: dayMeter,
          circuitEntityIds: circuits,
        },
      })
      await seedPanelEnergySource(meter)
      notify(
        powerCircuitCount
          ? `能源绑定已保存：${circuits.length} 路分路（${powerCircuitCount} 路功率）`
          : '主电表与分路已保存',
      )
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
      notify(`请至少映射 ${ENV_ROOM_MIN} 个房间的环境传感器（当前 ${envStep.envConfiguredRoomCount.value}）`, false)
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
    meterScope,
    markScopeTouched,
    applySuggestedScope,
    scopeTouched,
    mainPowerEntityId,
    monthMeterEntityId,
    dayMeterEntityId,
    circuitEntityIds,
    energyBinding,
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
      notify(matchedCount ? `已推断 ${matchedCount} 个传感器映射，请核对后保存` : '未找到可匹配的传感器，请手动填写')
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
