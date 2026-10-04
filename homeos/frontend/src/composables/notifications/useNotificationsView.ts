/**
 * @file useNotificationsView.ts
 * @module frontend/src/composables
 */
import { computed, inject, onMounted, ref, watch } from 'vue'
import { fetchNotificationStats } from '@/services/api/notifications'
import { useNotificationCenter } from '@/composables/widget/useNotificationCenter'
import { NOTIFICATION_CENTER_KEY } from '@/composables/widget/notification-center.context'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'
import {
  computeNotificationAnalyticsSummary,
  formatHourOption,
  formatNotificationCount,
  levelFilterLabel,
  NOTIFICATION_HOUR_OPTIONS,
  type NotificationStatsPayload,
} from '@/utils/notification/analytics.util'
import { notificationSourceLabel } from '@homeos/shared'

export function useNotificationsView() {
  const state = inject(NOTIFICATION_CENTER_KEY, null) ?? useNotificationCenter()

  const {
    authStore,
    sourceFilters,
    levelFilters,
    dndSettings,
    notifyPrefs,
    remoteLoading,
    remoteError,
    activeSource,
    activeLevel,
    displayNotifications,
    prefFilteredNotifications,
    unreadCount,
    lanPushReady,
    markAllRead,
    clearAll,
    fetchRemote,
  } = state

  const hours = ref<number>(24)
  const stats = ref<NotificationStatsPayload | null>(null)
  const statsLoading = ref(false)
  const statsError = ref('')

  const hourOptions = NOTIFICATION_HOUR_OPTIONS

  async function fetchStats() {
    if (!authStore.isAuthenticated) return
    statsLoading.value = true
    statsError.value = ''
    try {
      const params: Record<string, string | number> = { hours: hours.value }
      if (activeSource.value !== 'all') params.source = activeSource.value
      const res = await fetchNotificationStats(params)
      stats.value = res.data as NotificationStatsPayload
    } catch (e: unknown) {
      stats.value = null
      statsError.value = getApiErrorMessage(e, '统计数据加载失败')
      logger.warn('通知统计加载失败', e)
    } finally {
      statsLoading.value = false
    }
  }

  async function reload() {
    await Promise.all([fetchRemote(), fetchStats()])
  }

  watch([hours, activeSource], () => {
    fetchStats()
  })

  onMounted(() => {
    fetchStats()
  })

  const analyticsSummary = computed(() =>
    computeNotificationAnalyticsSummary(prefFilteredNotifications.value, stats.value, hours.value),
  )

  const pageHint = computed(() => {
    const parts = [`分析近 ${formatHourOption(hours.value)} 内持久化通知（PostgreSQL）与实时消息`]
    const dnd = dndSettings.value as
      | { dndActive?: boolean; dndStart?: number | string; dndEnd?: number | string }
      | null
      | undefined
    if (dnd?.dndActive) {
      parts.push(`当前免打扰 ${dnd.dndStart}:00–${dnd.dndEnd}:00`)
    }
    if (!notifyPrefs.value.globalNotifyEnabled) {
      parts.push('全局通知已关闭，列表可能为空')
    }
    return parts.join(' · ')
  })

  const summaryMetrics = computed(() => {
    const s = analyticsSummary.value
    const cells = [
      { key: 'unread', value: s.unread, label: '未读', tone: s.unread > 0 ? 'pink' : 'muted' },
      { key: 'total', value: formatNotificationCount(s.total), label: '统计总量', tone: 'sky' },
      {
        key: 'read-rate',
        value: `${s.readRate}%`,
        label: '已读率',
        tone: s.readRate >= 80 ? 'green' : 'amber',
      },
      {
        key: 'danger',
        value: s.dangerCount,
        label: '紧急',
        tone: s.dangerCount > 0 ? 'red' : 'muted',
      },
      { key: 'delivery', value: `${s.deliveryRate}%`, label: '推送送达', tone: 'amber' },
    ]
    if (lanPushReady.value) {
      cells.push({ key: 'lan', value: '已连接', label: '局域网推送', tone: 'green' })
    }
    return cells
  })

  const resultSummary = computed(() => {
    const total = displayNotifications.value.length
    const unread = unreadCount.value
    const parts = [`近 ${formatHourOption(hours.value)}`]
    if (activeSource.value !== 'all') {
      const row = sourceFilters.value.find((f) => f.key === activeSource.value)
      parts.push(row?.label || notificationSourceLabel(activeSource.value))
    }
    if (activeLevel.value !== 'all') {
      parts.push(levelFilterLabel(activeLevel.value))
    }
    if (!total) return `${parts.join(' · ')} · 暂无消息`
    return `${parts.join(' · ')} · ${formatNotificationCount(total)} 条${unread ? ` · ${unread} 未读` : ''}`
  })

  function filterBySource(key: string) {
    activeSource.value = key
  }

  function filterByLevel(level: string) {
    activeLevel.value = level
  }

  async function markAllReadAndRefresh() {
    await markAllRead()
    await fetchStats()
  }

  async function clearAllAndRefresh() {
    await clearAll()
    await fetchStats()
  }

  return {
    authStore,
    hours,
    hourOptions,
    stats,
    statsLoading,
    statsError,
    sourceFilters,
    levelFilters,
    dndSettings,
    remoteLoading,
    remoteError,
    activeSource,
    activeLevel,
    displayNotifications,
    prefFilteredNotifications,
    unreadCount,
    analyticsSummary,
    pageHint,
    summaryMetrics,
    resultSummary,
    markAllRead: markAllReadAndRefresh,
    clearAll: clearAllAndRefresh,
    fetchRemote,
    fetchStats,
    reload,
    filterBySource,
    filterByLevel,
    formatCount: formatNotificationCount,
    formatHourOption,
  }
}
