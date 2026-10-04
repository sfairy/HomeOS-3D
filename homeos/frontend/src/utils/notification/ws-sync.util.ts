/**
 * 通知偏好与 WebSocket 通知同步工具。
 *
 * 职责：
 * - 将 HomeOS 通知偏好同步到 HA input_boolean 实体（兼容既有自动化）；
 * - 对 Socket 重推/双通道到达的通知做 toast 去重；
 * - 将通知级别映射为 toast 类型。
 *
 * 依赖：
 * - @/types/notify：通知类型
 */
import type { NotifyType } from '@/types/notify'

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