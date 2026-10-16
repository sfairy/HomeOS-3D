/**
 * @file notification-center.filters.internals.ts
 * @module frontend/src/composables/widget
 */
/** 通知中心：纯过滤 / 合并工具（不依赖 Vue 生命周期） */
import {
  buildNotificationSourceFilters,
  matchesNotificationSourceFilter,
  isLifeSafetyNotification,
} from '@homeos/shared'

/** 通知中心展示条目（远程 + 本地合并） */
export interface NotificationCenterItem {
  id: string | number
  level?: string
  message?: string
  source?: string
  time?: string
  createdAt?: string
  read?: boolean
  entityId?: string
  monitorKind?: string
  deliveredAt?: string
}

/** 与设置页「通知偏好」对齐的过滤开关 */
export interface NotificationCenterPrefs {
  globalNotifyEnabled: boolean
  importantNotifyEnabled: boolean
  offlineNotifyEnabled: boolean
  lowBatteryNotifyEnabled: boolean
}

/** 判断通知是否为「设备离线/恢复在线」类型。 */
export function isOfflineNotification(notification: NotificationCenterItem): boolean {
  if (notification.monitorKind === 'offline' || notification.monitorKind === 'online') return true
  // HA（中枢）失联 / 恢复不是「设备离线」：它恰恰是解释「为什么一批设备离线告警没来」的
  // 系统性通知，绝不能被「设备离线提醒」开关连带吞掉（后端也已把它归为不可静音类）。
  if (notification.source === 'ha-connection') return false
  const message = notification.message || ''
  return (
    notification.source === 'device-monitor' ||
    message.includes('离线') ||
    message.includes('恢复在线') ||
    message.includes('offline') ||
    message.includes('back online')
  )
}

/** 判断通知是否为「低电量」类型。 */
export function isLowBatteryNotification(notification: NotificationCenterItem): boolean {
  if (notification.monitorKind === 'low_battery') return true
  const message = notification.message || ''
  return message.includes('电量') || message.includes('低电量') || message.includes('battery')
}

/**
 * 合并远程 + 本地通知，按时间倒序；同时间戳时远程排在本地前面。
 */
export function mergeNotificationLists(
  remote: NotificationCenterItem[],
  local: NotificationCenterItem[],
): NotificationCenterItem[] {
  const merged: NotificationCenterItem[] = [
    ...remote.map((notification) => ({ ...notification, read: notification.read || false })),
    ...local,
  ]
  merged.sort((left, right) => {
    const leftTime =
      Date.parse(left.createdAt || left.time || '') || (typeof left.id === 'number' ? left.id : 0)
    const rightTime =
      Date.parse(right.createdAt || right.time || '') ||
      (typeof right.id === 'number' ? right.id : 0)
    if (leftTime !== rightTime) return rightTime - leftTime
    const leftIndex = Number(left.id) > 1e15 ? 0 : 1
    const rightIndex = Number(right.id) > 1e15 ? 0 : 1
    return leftIndex - rightIndex
  })
  return merged
}

/** 应用通知偏好：关闭紧急/离线/低电量时移除对应项。 */
export function applyNotifyPrefs(
  list: NotificationCenterItem[],
  prefs: NotificationCenterPrefs,
): NotificationCenterItem[] {
  let filtered = list
  if (!prefs.globalNotifyEnabled) return []
  if (!prefs.importantNotifyEnabled) {
    // 与后端一致：关闭「告警与警告」时仍保留生命安全类（danger / 安防 / EEW 等）
    filtered = filtered.filter(
      (notification) =>
        notification.level === 'info' ||
        notification.level === 'success' ||
        isLifeSafetyNotification(notification.level, notification.source),
    )
  }
  if (!prefs.offlineNotifyEnabled) {
    filtered = filtered.filter((notification) => !isOfflineNotification(notification))
  }
  if (!prefs.lowBatteryNotifyEnabled) {
    filtered = filtered.filter((notification) => !isLowBatteryNotification(notification))
  }
  return filtered
}

/** 按级别过滤（`all` 不过滤）。 */
export function filterByLevel(
  list: NotificationCenterItem[],
  level: string,
): NotificationCenterItem[] {
  if (level === 'all') return list
  return list.filter((notification) => (notification.level || 'info') === level)
}

/** 按来源过滤。 */
export function filterBySource(
  list: NotificationCenterItem[],
  source: string,
): NotificationCenterItem[] {
  return list.filter((notification) => matchesNotificationSourceFilter(notification.source, source))
}

/** 构造来源筛选 tab（最多 `maxTabs` 个）。 */
export function buildSourceFilters(list: NotificationCenterItem[], maxTabs = 9) {
  return buildNotificationSourceFilters(list, { maxTabs })
}

/** 各来源 tab 的数量徽标。 */
export function countBySource(
  list: NotificationCenterItem[],
  sourceKeys: Array<{ key: string }>,
): Record<string, number> {
  const counts: Record<string, number> = { all: list.length }
  for (const filter of sourceKeys) {
    if (filter.key === 'all') continue
    counts[filter.key] = filterBySource(list, filter.key).length
  }
  return counts
}
