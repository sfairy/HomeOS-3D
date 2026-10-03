/**
 * 切换操作 Pending 状态统一封装
 *
 * 所属模块：composables/entity
 * 职责：为开关切换、异步按钮操作等场景提供互斥的 pending 状态管理，
 *      避免同一操作期间被重复触发；模式与 useNotificationPrefs.savingKey 保持一致。
 * 返回结构：
 *   - pendingKey：当前挂起操作的 key（响应式 ref）
 *   - isPending(key)：查询指定 key 是否处于 pending
 *   - withPending(key, fn)：以互斥方式执行异步函数，完成后自动释放 key
 * 边界：若当前已有挂起 key，withPending 直接返回 false 不执行回调。
 */
import { ref } from 'vue'
/**
 * 统一 toggle / 异步操作 pending 状态（模式同 useNotificationPrefs.savingKey）
 */
export function useTogglePending() {
  const pendingKey = ref<string | number | null>(null)
  function isPending(key: string | number) {
    return pendingKey.value === key
  }
  async function withPending(key: string | number, fn: () => Promise<void> | void) {
    if (pendingKey.value) return false
    pendingKey.value = key
    try {
      await fn()
      return true
    } finally {
      if (pendingKey.value === key) pendingKey.value = null
    }
  }
  return { pendingKey, isPending, withPending }
}
