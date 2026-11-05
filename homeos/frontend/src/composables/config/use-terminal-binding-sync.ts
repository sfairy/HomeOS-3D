/**
 * 云端终端绑定同步。
 *
 * 多设备同时访问时，方案由**服务端终端绑定**决定（管理员可在任意设备上给其他设备换方案）。
 * 设备本身只在启动时解析一次绑定，之后如果一直开着页面就永远看不到改绑结果。
 * 这里在页面重新可见 / 窗口聚焦时轻量复查一次绑定：
 * - 只在已登录、非编辑模式、无未保存改动时执行，避免横插一脚覆盖用户正在做的事；
 * - 间隔节流，避免来回切标签页刷接口；
 * - 仅当服务端明确返回 ``source === 'binding'`` 且与当前不同才切换。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { resolveTerminalProfile } from '@/services/api/config'
import { getClientDeviceId } from '@/shared/client/utils/system.util'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import { logger } from '@/shared/utils/core/logger'

/** 两次复查之间的最小间隔（毫秒） */
const BINDING_SYNC_INTERVAL_MS = 60_000

/** `GET config/terminal/:id/profile` 返回体里本模块关心的字段。 */
interface TerminalBindingPayload {
  source?: string
  profileId?: string
}

/**
 * 注册「回到前台时复查云端终端绑定」的监听。
 * 在应用根组件调用一次即可，重复调用会产生重复监听。
 */
export function useTerminalBindingSync() {
  const layoutStore = useLayoutStore()
  const authStore = useAuthStore()
  const chrome = useChromeStore()

  let lastSyncAt = 0
  let inFlight = false

  /** 现在是否该发起一次复查：节流、前台、已登录、非编辑中缺一不可。 */
  function shouldSyncNow(): boolean {
    if (inFlight || !authStore.isAuthenticated) return false
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false
    if (Date.now() - lastSyncAt < BINDING_SYNC_INTERVAL_MS) return false
    // 编辑中或存在未保存改动：云端改绑延后到用户空闲（下次回到前台）再应用
    return !layoutStore.isEditMode && !layoutStore.layoutDirty
  }

  /** 应用服务端绑定：只有明确来自绑定、且与当前方案不同才切换。 */
  async function applyBinding(payload: TerminalBindingPayload | undefined): Promise<void> {
    if (payload?.source !== 'binding') return
    const profileId = String(payload.profileId || '').trim()
    if (!profileId || profileId === layoutStore.activeProfileId) return
    const switched = await layoutStore.switchProfile(profileId, true)
    if (switched) chrome.notify(`已按云端终端绑定切换到方案：${profileId}`, 'info', 5000)
  }

  async function sync(): Promise<void> {
    if (!shouldSyncNow()) return
    lastSyncAt = Date.now()
    inFlight = true
    try {
      const { data } = await resolveTerminalProfile(getClientDeviceId())
      await applyBinding(data?.data ?? data)
    } catch (err) {
      logger.warn('复查云端终端绑定失败', err)
    } finally {
      inFlight = false
    }
  }

  function onVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') void sync()
  }

  onMounted(() => {
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onVisibilityChange)
  })

  onBeforeUnmount(() => {
    if (typeof document === 'undefined') return
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onVisibilityChange)
  })

  return { sync }
}
