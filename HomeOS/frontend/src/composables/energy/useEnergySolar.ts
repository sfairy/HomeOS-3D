/**
 * 光伏/储能发电监控 composable
 *
 * 职责：封装「发电-用电-充电」三流数据的查询（GET /energy/solar）：
 *  - 5 分钟轮询 + 面板可见时刷新（复用 useWidgetApiQuery）
 *  - 派生展示所需的 computed：当前发电功率、日累计发电量、SOC、充电功率、自消纳率
 *  - 未检测到发电/储能实体时暴露 configured:false，供卡片隐藏与提示
 */
import { computed, ref } from 'vue'
import { useWidgetApiQuery } from '@/composables/api/useWidgetApiQuery'
import {
  getEnergySolar,
  getEnergyStorageDispatch,
  runEnergyStorageDispatch,
  type EnergySolarPayload,
  type EnergyStorageDispatchPayload,
} from '@/services/api/energy'
import { getApiErrorMessage } from '@/utils/core/error-message'

/** useEnergySolar：函数，按签名入参返回处理结果。 */
export function useEnergySolar(options: { panelVisible?: () => boolean } = {}) {
  const query = useWidgetApiQuery<EnergySolarPayload>(
    'energySolar',
    async () => {
      const res = await getEnergySolar()
      return { data: res.data }
    },
    5 * 60 * 1000,
    {
      pollKey: 'widget:EnergySolarPanel',
      panelVisible: options.panelVisible,
      immediate: false,
    },
  )

  /** 发电监控数据（未拉取时为 null） */
  const data = computed(() => query.data?.value ?? null)
  /** 是否检测到发电/储能实体（未检测到时卡片隐藏 + 提示） */
  const configured = computed(() => data.value?.configured === true)
  const loading = query.loading
  const loadError = query.error
  /** 当前发电功率（W） */
  const currentPowerW = computed(() => data.value?.currentPowerW ?? 0)
  /** 日累计发电量（kWh） */
  const todayGenerationKwh = computed(() => data.value?.todayGenerationKwh ?? 0)
  /** 储能电量百分比 SOC（%），无电池实体时为 null */
  const batterySoc = computed(() => data.value?.batterySoc ?? null)
  /** 当前充电功率（W） */
  const chargePowerW = computed(() => data.value?.chargePowerW ?? 0)
  /** 日累计用电量（kWh） */
  const todayUsageKwh = computed(() => data.value?.todayUsageKwh ?? 0)
  /** 自消纳率（%） */
  const selfConsumptionRate = computed(() => data.value?.selfConsumptionRate ?? null)
  /** 日聚合历史（近 7 日） */
  const dayHistory = computed(() => data.value?.history?.day ?? [])
  /** 周聚合历史（近 4 周） */
  const weekHistory = computed(() => data.value?.history?.week ?? [])

  /** 储能峰谷调度状态（静默拉取，失败不影响发电监控展示） */
  const dispatch = useWidgetApiQuery<EnergyStorageDispatchPayload>(
    'energyStorageDispatch',
    async () => {
      const res = await getEnergyStorageDispatch()
      return { data: res.data }
    },
    5 * 60 * 1000,
    {
      pollKey: 'widget:EnergyStorageDispatch',
      panelVisible: options.panelVisible,
      immediate: false,
    },
  )
  /** 储能调度是否已启用 */
  const dispatchEnabled = computed(() => dispatch.data?.value?.enabled === true)
  /** 当前时段（peak/valley/flat） */
  const period = computed(() => dispatch.data?.value?.period ?? 'flat')
  /** 上次动作描述 */
  const dispatchStatus = computed(() => {
    const d = dispatch.data?.value
    if (!d) return null
    return {
      period: d.period,
      lastAction: d.lastAction,
      lastActionReason: d.lastActionReason,
      cooldownRemainingSec: d.cooldownRemainingSec,
      actionCount: d.actionCount,
    }
  })

  const dispatchRunning = ref(false)
  const dispatchRunError = ref('')

  async function runDispatchOnce() {
    if (dispatchRunning.value) return
    dispatchRunning.value = true
    dispatchRunError.value = ''
    try {
      await runEnergyStorageDispatch()
      await dispatch.retry()
    } catch (e: unknown) {
      dispatchRunError.value = getApiErrorMessage(e, '储能调度执行失败')
      throw e
    } finally {
      dispatchRunning.value = false
    }
  }

  return {
    data,
    configured,
    loading,
    loadError,
    currentPowerW,
    todayGenerationKwh,
    batterySoc,
    chargePowerW,
    todayUsageKwh,
    selfConsumptionRate,
    dayHistory,
    weekHistory,
    dispatchEnabled,
    period,
    dispatchStatus,
    dispatchRunning,
    dispatchRunError,
    runDispatchOnce,
    dispatchRefresh: dispatch.retry,
    retry: query.retry,
    execute: query.execute,
  }
}
