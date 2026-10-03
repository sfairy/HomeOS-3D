/**
 * 通知偏好与 WebSocket 通知同步工具。
 *
 * 职责：
 * - 将 HomeOS 通知偏好同步到 HA input_boolean 实体（兼容既有自动化）；
 * - 对 Socket 重推/双通道到达的通知做 toast 去重；
 * - 将通知级别映射为 toast 类型。
 *
 * 依赖：
 * - @homeos/shared：getEntityDomain 提取实体 domain
 * - @/types/notify：通知类型
 */
import { getEntityDomain } from '@homeos/shared'
import type { NotifyType } from '@/types/notify'

/**
 * HomeOS 通知偏好 ↔ HA input_boolean 映射（兼容既有自动化）。
 * - globalNotifyEnabled：全局通知开关
 * - importantNotifyEnabled：非紧急告警开关（生命安全类不受此开关静音）
 * - offlineNotifyEnabled：离线通知开关
 */
export const NOTIFY_PREF_HA_ENTITIES = {
  globalNotifyEnabled: 'input_boolean.notify_global_switch',
  importantNotifyEnabled: 'input_boolean.alarm_switch',
  offlineNotifyEnabled: 'input_boolean.offline_notify_switch',
}

/** 通知偏好 key 类型 */
type NotifyPrefKey = keyof typeof NOTIFY_PREF_HA_ENTITIES

/** entities store 的最小依赖接口（避免直接耦合具体 store 类型） */
type EntitiesStoreLike = {
  getEntity: (id: string) => { state?: string } | null | undefined
  callService: (
    domain: string,
    service: string,
    entityId: string,
    data?: unknown,
    refresh?: boolean,
    opts?: { quiet?: boolean },
  ) => Promise<unknown>
}

/**
 * 将单项偏好同步到 HA 实体（实体不存在时静默跳过）。
 * @param entitiesStore 实体 store 实例
 * @param prefKey 偏好 key
 * @param enabled 是否启用（undefined 视为 true）
 */
export async function syncNotifyPrefToHa(
  entitiesStore: EntitiesStoreLike,
  prefKey: string,
  enabled: boolean | undefined,
) {
  const entityId = (NOTIFY_PREF_HA_ENTITIES as Record<string, string>)[prefKey]
  if (!entityId) return
  const entity = entitiesStore.getEntity(entityId)
  if (!entity || entity.state === 'unavailable') return
  const wantOn = enabled !== false
  const isOn = entity.state === 'on'
  // 状态已一致则跳过，避免多余 service 调用
  if (wantOn === isOn) return
  const domain = getEntityDomain(entityId)
  const service = wantOn ? 'turn_on' : 'turn_off'
  try {
    await entitiesStore.callService(domain, service, entityId, undefined, false, { quiet: true })
  } catch {
    // HA 实体可选，失败不阻断 HomeOS 偏好保存
  }
}

/**
 * 批量将多项通知偏好同步到 HA 实体。
 * @param entitiesStore 实体 store 实例
 * @param prefs 偏好映射
 */
export async function syncAllNotifyPrefsToHa(
  entitiesStore: EntitiesStoreLike,
  prefs: Partial<Record<NotifyPrefKey, boolean | undefined>>,
) {
  const tasks = Object.keys(NOTIFY_PREF_HA_ENTITIES).map((key) =>
    syncNotifyPrefToHa(entitiesStore, key, prefs[key as NotifyPrefKey]),
  )
  await Promise.allSettled(tasks)
}

/** 防止同一通知在 Socket 重推或双通道到达时重复弹 toast */
const recentToastKeys = new Map<string, number>()

/** toast 去重时间窗口（毫秒） */
const TOAST_DEDUP_MS = 5000

/** 记录 toast 已展示，并清理过期记录避免内存增长 */
function markToastSeen(key: string) {
  recentToastKeys.set(key, Date.now())
  // 超过 100 条时清理过期项
  if (recentToastKeys.size > 100) {
    const now = Date.now()
    for (const [k, ts] of recentToastKeys) {
      if (now - ts > TOAST_DEDUP_MS) recentToastKeys.delete(k)
    }
  }
}

/**
 * 判断是否应跳过该通知的 toast 展示（去重）。
 * @param data 通知数据，含 id / message
 * @returns true 表示近期已展示过，应跳过
 */
export function shouldSkipNotificationToast(data: Record<string, unknown>): boolean {
  const id = String(data.id || '').trim()
  const message = String(data.message || '').trim()
  if (!message) return true
  // 有 id 用 id 去重，否则用 message 全文去重
  const key = id ? `id:${id}` : `msg:${message}`
  const last = recentToastKeys.get(key)
  const now = Date.now()
  if (last != null && now - last < TOAST_DEDUP_MS) return true
  markToastSeen(key)
  return false
}

/**
 * 将通知级别映射为 toast 类型。
 * @param level 通知级别（danger / warn / success / error / 其它）
 * @returns 对应的 toast 类型
 */
export function notificationLevelToToastType(level: unknown): NotifyType {
  const l = String(level || 'info')
  if (l === 'danger') return 'warning'
  if (l === 'warn') return 'warning'
  if (l === 'success') return 'success'
  if (l === 'error') return 'error'
  return 'info'
}