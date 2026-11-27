/* ── 原 useReduceSecuritySensitivity.ts 的实现 ── */
import { ref } from 'vue'
import { reduceSetupSecuritySensitivity } from '@/kernel/http/index'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { logger } from '@/kernel/core/logger'

/**
 * 降低安防传感器告警灵敏度（延长冷却），向导与安防页共用
 * @returns reducing 进行中标记 / reduceSensitivity 触发方法
 */
export function useReduceSecuritySensitivity() {
  const chrome = useChromeStore()
  // 操作进行中标记，防止重复点击
  const reducing = ref(false)

  /**
   * 触发降低灵敏度
   * @param options.recordFeedback 是否记录为误报反馈
   * @param options.source 调用来源（如 setup / security_overview）
   * @returns 成功返回后端数据；失败返回 null
   * @sideEffects 成功时 Toast 提示新冷却秒数；失败时 Toast 提示并记录日志
   */
  async function reduceSensitivity(options: { recordFeedback?: boolean; source?: string } = {}) {
    const { recordFeedback = false, source = 'setup' } = options
    reducing.value = true
    try {
      const { data } = await reduceSetupSecuritySensitivity({ recordFeedback, source })
      chrome.notify(`已延长传感器冷却至 ${data.sensorAlertCooldownSec} 秒`, 'success')
      return data
    } catch (e) {
      logger.error('降低灵敏度失败', e)
      chrome.notify('操作失败', 'error')
      return null
    } finally {
      reducing.value = false
    }
  }

  return { reducing, reduceSensitivity }
}
