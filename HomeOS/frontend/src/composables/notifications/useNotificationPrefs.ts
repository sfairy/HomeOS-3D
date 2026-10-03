/**
 * @file useNotificationPrefs.ts
 * @module frontend/src/composables
 */
import { ref, computed, watch } from 'vue'
import {
  fetchNotificationSettings,
  updateNotificationPreferences,
  updateNotificationSettings,
} from '@/services/api/notifications'
import { useAuthStore } from '@/stores/auth.store'
import { useEntitiesStore } from '@/stores/entities.store'
import {
  NOTIFY_PREF_HA_ENTITIES,
  syncAllNotifyPrefsToHa,
  syncNotifyPrefToHa,
} from '@/utils/notification/ws-sync.util'
import {
  DEFAULT_NOTIFY_PREFS,
  parseNotificationSettings,
} from '@/utils/notification/dnd.util'
import { logger } from '@/utils/core/logger'
import { extractErrorMessage, getApiErrorMessage } from '@/utils/core/error-message'

/** 通知偏好对象类型 */
type NotifyPrefs = typeof DEFAULT_NOTIFY_PREFS
/** 通知偏好键（仅这些字段可通过 updatePref 修改） */
type NotifyPrefKey = keyof NotifyPrefs

/** catch 中捕获的错误可能携带的 HTTP/消息字段 */
interface HttpLikeError {
  response?: { status?: number }
  message?: string
}

/**
 * 通知偏好：GET 合并全屋默认 + 当前用户 User.preferences.notification；
 * PUT /notifications/preferences 写入用户级开关。
 */
export function useNotificationPrefs() {
  const authStore = useAuthStore()
  const entitiesStore = useEntitiesStore()
  const prefs = ref({ ...DEFAULT_NOTIFY_PREFS })
  const loading = ref(false)
  const loadError = ref('')
  const savingKey = ref<NotifyPrefKey | null>(null)
  let haSyncDone = false
  const canEdit = computed(() => {
    const role = authStore.role
    return authStore.isAuthenticated && (role === 'admin' || role === 'adult')
  })
  const globalOn = computed(() => prefs.value.globalNotifyEnabled !== false)

  async function trySyncToHa() {
    if (haSyncDone || !authStore.isAuthenticated) return
    await syncAllNotifyPrefsToHa(
      entitiesStore as unknown as Parameters<typeof syncAllNotifyPrefsToHa>[0],
      prefs.value,
    )
    const anyReady = Object.values(NOTIFY_PREF_HA_ENTITIES).some((id) => {
      const e = entitiesStore.getEntity(id)
      return e && e.state !== 'unavailable'
    })
    if (anyReady) haSyncDone = true
  }

  // 实体 hydrate 后补同步一次（load 时常早于 WS）
  watch(
    () => Object.keys(entitiesStore.entities || {}).length,
    () => {
      void trySyncToHa()
    },
  )

  async function load() {
    if (!authStore.isAuthenticated) return
    loading.value = true
    loadError.value = ''
    haSyncDone = false
    try {
      const res = await fetchNotificationSettings()
      prefs.value = parseNotificationSettings(res.data)
      await trySyncToHa()
    } catch (e) {
      loadError.value = getApiErrorMessage(e, '通知偏好加载失败')
      logger.warn('通知偏好加载失败', loadError.value)
    } finally {
      loading.value = false
    }
  }
  async function updatePref<K extends NotifyPrefKey>(key: K, next: NotifyPrefs[K]) {
    if (!canEdit.value || savingKey.value) return false
    const prev = prefs.value[key]
    prefs.value = { ...prefs.value, [key]: next }
    savingKey.value = key
    try {
      let res
      try {
        res = await updateNotificationPreferences({ [key]: next })
      } catch (prefErr) {
        logger.debug(
          '用户级 preferences 不可用,回退 settings',
          (prefErr as HttpLikeError)?.response?.status || (prefErr as HttpLikeError)?.message,
        )
        res = await updateNotificationSettings({ [key]: next })
      }
      prefs.value = parseNotificationSettings(res.data)
      await syncNotifyPrefToHa(
        entitiesStore as unknown as Parameters<typeof syncNotifyPrefToHa>[0],
        key,
        prefs.value[key] as boolean,
      )
      return true
    } catch (e) {
      logger.warn(`通知偏好保存失败 (${key})`, extractErrorMessage(e))
      prefs.value = { ...prefs.value, [key]: prev }
      return false
    } finally {
      savingKey.value = null
    }
  }
  function isPrefDisabled(key: NotifyPrefKey | string) {
    if (loading.value || savingKey.value) return true
    if (!canEdit.value) return true
    if (key !== 'globalNotifyEnabled' && !globalOn.value) return true
    return false
  }
  return {
    prefs,
    loading,
    loadError,
    savingKey,
    canEdit,
    globalOn,
    load,
    updatePref,
    isPrefDisabled,
  }
}
