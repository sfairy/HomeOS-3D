/**
 * 地震预警应用启动引导模块
 *
 * 所属模块：composables/earthquake
 * 职责：应用启动时完成两项初始化工作——(1) 从后端恢复最近一次地震预警状态，若仍处于活动期且用户未 dismissal 则立即触发预警；
 *      (2) 检测 EEW 配置缺失情况（localStorage 未完成向导、HA 占位默认或缺少经纬度），延迟 1.2 秒弹出配置向导。
 * 导出：useEarthquakeBootstrap() 返回 showSetupWizard 响应式引用供父组件绑定向导弹窗；
 *      reopenEarthquakeWizard() 清除"已完成"标记，下次启动重新弹出向导。
 * 副作用：挂载时注册 window 'homeos:eew-wizard-open' 事件；启动期间会拉取后端预警接口。
 */
import { readLocalStorageFlag, removeLocalStorage } from '@/utils/core/local-storage.util'

import { onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchEarthquakeLatest } from '@/services/api/earthquake'
import { useEarthquakeStore } from '@/stores/earthquake.store'
import { isEarthquakeAlertEnabled } from '@/utils/earthquake/util'
import { useLayoutStore } from '@/stores/layout.store'
import { DEFAULT_HA_URL } from '@/constants/ha'
import { logger } from '@/utils/core/logger'

/**
 * 地震预警应用启动引导模块
 *
 * 模块职责：
 *  - 应用启动时从后端恢复最近一次地震预警状态（若仍处于活动期）；
 *  - 检测 EEW（地震预警）配置缺失情况，必要时延迟弹出 EEW 配置向导。
 *
 * 依赖：
 *  - @/services/api/earthquake（获取最新预警）；
 *  - @/stores/earthquake.store（预警状态管理）；
 *  - @/stores/layout.store（读取 layoutConfig 中的地震/HOME ASSISTANT 配置）；
 *  - @/utils/earthquake/earthquake.util（判断预警是否启用）。
 */

/** localStorage 中标记"已完成后端 EEW 配置向导"的 key */
const WIZARD_DONE_KEY = 'eew_wizard_completed'

/**
 * 判断是否应当提示用户进入 EEW 配置向导。
 *
 * 判定逻辑（任一成立即提示）：
 *  1. localStorage 未标记已完成向导；
 *  2. HOME ASSISTANT 配置为默认占位（url 为空或等于默认占位地址，或 token 为空）；
 *  3. 地震配置中缺少经纬度坐标。
 *
 * 若用户已在配置中填写了经纬度且启用地震预警，则跳过提示。
 *
 * @param layoutStore UI 状态存储实例
 * @returns true 表示应当弹出向导
 */
function shouldPromptWizard(layoutStore: ReturnType<typeof useLayoutStore>): boolean {
  if (readLocalStorageFlag(WIZARD_DONE_KEY)) return false
  const cfg = layoutStore.layoutConfig?.earthquakeConfig
  const ha = layoutStore.layoutConfig?.haConfig
  if (cfg?.enabled && cfg.latitude && cfg.longitude) return false
  const haDefault = !ha?.url || ha.url === DEFAULT_HA_URL || !ha?.token
  const noCoords = !cfg?.latitude || !cfg?.longitude
  return haDefault || noCoords
}

/**
 * 重新打开 EEW 配置向导。
 * 通过清除 localStorage 中的"已完成"标记，使下次启动时重新触发提示。
 * 副作用：会修改 localStorage。
 */
export function reopenEarthquakeWizard() {
  removeLocalStorage(WIZARD_DONE_KEY)
}

/**
 * 地震预警应用启动引导 composable。
 *
 * 在组件挂载时：
 *  1. 监听 window 的 'homeos:eew-wizard-open' 事件（外部触发打开向导）；
 *  2. 拉取后端最新地震预警，若仍处于活动期且用户未 dismissal，则触发预警；
 *  3. 监听 UI 配置加载完成，按需延迟 1.2 秒弹出 EEW 配置向导。
 *
 * 在组件卸载时清理事件监听与定时器。
 *
 * @returns showSetupWizard：是否显示 EEW 配置向导的响应式引用
 */
export function useEarthquakeBootstrap() {
  const showSetupWizard = ref(false)
  let wizardTimer: ReturnType<typeof setTimeout> | null = null
  let stopConfigWatch: (() => void) | null = null

  /** 'homeos:eew-wizard-open' 事件回调：打开向导 */
  function onWizardOpen() {
    showSetupWizard.value = true
  }

  /** 清理延迟打开向导的定时器 */
  function clearWizardTimer() {
    if (wizardTimer) {
      clearTimeout(wizardTimer)
      wizardTimer = null
    }
  }

  /**
   * 在配置加载完成后，按需延迟 1.2 秒弹出 EEW 配置向导。
   * 延迟是为了避免首屏初始化期间弹窗抢夺焦点。
   * @param layoutStore UI 状态存储实例
   */
  function scheduleWizardIfNeeded(layoutStore: ReturnType<typeof useLayoutStore>) {
    clearWizardTimer()
    if (!layoutStore.isConfigLoaded) return
    if (!shouldPromptWizard(layoutStore)) return
    wizardTimer = setTimeout(() => {
      showSetupWizard.value = true
      wizardTimer = null
    }, 1200)
  }

  onMounted(async () => {
    window.addEventListener('homeos:eew-wizard-open', onWizardOpen)

    try {
      const res = await fetchEarthquakeLatest()
      const { isActive, payload } = res.data || {}
      const eventId = String(payload?.eventId || '').trim()
      const store = useEarthquakeStore()
      if (isActive && eventId && isEarthquakeAlertEnabled() && !store.isEventDismissed(eventId)) {
        store.triggerAlert(payload)
      }
    } catch (e) {
      // 后端拉取预警失败不影响主流程，仅记录调试日志
      logger.debug('跳过获取 EEW 最新警报', e)
    }

    const layoutStore = useLayoutStore()
    stopConfigWatch = watch(
      () => layoutStore.isConfigLoaded,
      () => scheduleWizardIfNeeded(layoutStore),
      { immediate: true },
    )
  })

  onUnmounted(() => {
    window.removeEventListener('homeos:eew-wizard-open', onWizardOpen)
    stopConfigWatch?.()
    clearWizardTimer()
  })

  return { showSetupWizard }
}