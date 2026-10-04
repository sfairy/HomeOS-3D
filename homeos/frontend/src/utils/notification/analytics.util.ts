/**
 * 通知中心列表数据聚合与统计
 *
 * 职责：
 * - 把通知列表按来源分桶聚合，生成来源统计与图表序列。
 * - 提供通知未读数、分级、时间分布等聚合工具，供通知中心与图表组件渲染。
 *
 * 依赖：@homeos/shared 的 notificationSourceLabel / normalizeNotificationSource。
 *
 * 注意：
 * - 来源 key 为通知源标识符，不翻译。
 * - 仅面向用户的来源标签 / 分桶标签使用简体中文。
 */
import { notificationSourceLabel, normalizeNotificationSource } from '@homeos/shared'

/** 通知来源分桶：按来源聚合计数 + 展示标签 + 语义色 */
interface NotificationSourceBucket {
  key: string
  label: string
  count: number
  color: string
}

/** 通知级别分桶：按 level 聚合计数 + 展示标签 + 语义色 */
interface NotificationLevelBucket {
  level: string
  label: string
  count: number
  color: string
}

/** 通知时间分桶：按时间段聚合（如「最近 1 小时」），含展示标签、计数与基准时间戳 */
interface NotificationTimeBucket {
  label: string
  count: number
  ts: number
}

/** 通知统计聚合结果：总数 / 未读 / 已读 / 已投递等计数与各类分桶序列 */
export interface NotificationStatsPayload {
  total: number
  unread: number
  read: number
  delivered: number
  readRate: number
  deliveryRate: number
  windowHours: number
  bySource: Record<string, number>
  byLevel: Record<string, number>
  byTime: NotificationTimeBucket[]
  topSources: Array<{ source: string; count: number }>
}

export interface NotificationAnalyticsSummary {
  total: number
  unread: number
  read: number
  delivered: number
  readRate: number
  deliveryRate: number
  dangerCount: number
  warnCount: number
  sourceCount: number
  topSourceKey: string | null
  topSourceLabel: string | null
  topSourceCount: number
  topLevel: string | null
  topLevelCount: number
  peakTimeLabel: string | null
  peakTimeCount: number
  avgPerHour: number | null
  windowHours: number
}

const SOURCE_COLORS: Record<string, string> = {
  'alert-rule': '#f472b6',
  earthquake: '#fbbf24',
  energy: '#34d399',
  'energy-budget': '#6ee7b7',
  'energy-anomaly': '#34d399',
  advisor: '#a78bfa',
  security: '#f87171',
  'environment-health': '#38bdf8',
  'device-monitor': '#94a3b8',
  'water-monitor': '#22d3ee',
  system: '#94a3b8',
}

const LEVEL_COLORS: Record<string, string> = {
  danger: '#f87171',
  warn: '#fbbf24',
  success: '#34d399',
  info: '#38bdf8',
}

const LEVEL_LABELS: Record<string, string> = {
  danger: '紧急',
  warn: '警告',
  success: '成功',
  info: '信息',
}

const FALLBACK_COLORS = [
  '#f472b6',
  '#fb7185',
  '#fbbf24',
  '#34d399',
  '#38bdf8',
  '#a78bfa',
  '#94a3b8',
]

/** NOTIFICATION_HOUR_OPTIONS：常量集合，成员语义见定义处。 */
export const NOTIFICATION_HOUR_OPTIONS = [24, 72, 168, 720] as const

function sourceChartColor(key: string, index = 0) {
  return SOURCE_COLORS[key] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

function levelChartColor(level: string) {
  return LEVEL_COLORS[level] || '#94a3b8'
}

export function formatHourOption(hours: number) {
  if (hours >= 168 && hours % 168 === 0) return `${hours / 168} 周`
  if (hours >= 24 && hours % 24 === 0) return `${hours / 24} 天`
  return `${hours} 小时`
}

export function buildSourceBuckets(
  notifications: Array<{ source?: string | null }>,
): NotificationSourceBucket[] {
  const counts = new Map<string, number>()
  for (const n of notifications) {
    const key = normalizeNotificationSource(n.source)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count], index) => ({
      key,
      label: notificationSourceLabel(key),
      count,
      color: sourceChartColor(key, index),
    }))
    .sort((a, b) => b.count - a.count)
}

export function buildSourceBucketsFromStats(
  bySource: Record<string, number> = {},
): NotificationSourceBucket[] {
  return Object.entries(bySource)
    .map(([key, count], index) => ({
      key,
      label: notificationSourceLabel(key),
      count,
      color: sourceChartColor(key, index),
    }))
    .sort((a, b) => b.count - a.count)
}

export function buildLevelBuckets(
  notifications: Array<{ level?: string | null }>,
): NotificationLevelBucket[] {
  const order = ['danger', 'warn', 'success', 'info']
  const counts = new Map<string, number>()
  for (const n of notifications) {
    const level = String(n.level || 'info')
    counts.set(level, (counts.get(level) || 0) + 1)
  }
  return order
    .filter((level) => (counts.get(level) || 0) > 0)
    .map((level) => ({
      level,
      label: LEVEL_LABELS[level] || level,
      count: counts.get(level) || 0,
      color: levelChartColor(level),
    }))
}

export function buildLevelBucketsFromStats(
  byLevel: Record<string, number> = {},
): NotificationLevelBucket[] {
  const order = ['danger', 'warn', 'success', 'info']
  return order
    .filter((level) => (byLevel[level] || 0) > 0)
    .map((level) => ({
      level,
      label: LEVEL_LABELS[level] || level,
      count: byLevel[level] || 0,
      color: levelChartColor(level),
    }))
}

function resolveNotificationTimestamp(n: { createdAt?: string | null; time?: string | null }) {
  if (n.createdAt) {
    const ts = Date.parse(n.createdAt)
    if (Number.isFinite(ts)) return ts
  }
  return Date.now()
}

export function buildTimeBucketsFromNotifications(
  notifications: Array<{ createdAt?: string | null; time?: string | null }>,
  windowHours = 24,
): NotificationTimeBucket[] {
  const granularity = windowHours <= 48 ? 'hour' : 'day'
  const bucketMs = granularity === 'hour' ? 3600_000 : 86_400_000
  const windowMs = windowHours * 3600_000
  const now = Date.now()
  const start = Math.floor((now - windowMs) / bucketMs) * bucketMs
  const end = Math.floor(now / bucketMs) * bucketMs
  const map = new Map<number, number>()
  for (let ts = start; ts <= end; ts += bucketMs) map.set(ts, 0)

  for (const n of notifications) {
    const raw = resolveNotificationTimestamp(n)
    const key = Math.floor(raw / bucketMs) * bucketMs
    if (!map.has(key)) map.set(key, 0)
    map.set(key, (map.get(key) || 0) + 1)
  }

  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, count]) => ({
      ts,
      count,
      label: formatTimeBucketLabel(ts, granularity),
    }))
}

function formatTimeBucketLabel(ts: number, granularity: 'hour' | 'day') {
  const d = new Date(ts)
  if (granularity === 'hour') return `${String(d.getHours()).padStart(2, '0')}:00`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function computeNotificationAnalyticsSummary(
  notifications: Array<{
    source?: string | null
    level?: string | null
    read?: boolean
    deliveredAt?: string | null
    createdAt?: string | null
    time?: string | null
  }>,
  stats: NotificationStatsPayload | null = null,
  windowHours = 24,
): NotificationAnalyticsSummary {
  const useStats = stats && stats.total > 0
  const sources = useStats
    ? buildSourceBucketsFromStats(stats.bySource)
    : buildSourceBuckets(notifications)
  const levels = useStats
    ? buildLevelBucketsFromStats(stats.byLevel)
    : buildLevelBuckets(notifications)
  const timeBuckets =
    useStats && stats.byTime.length
      ? stats.byTime
      : buildTimeBucketsFromNotifications(notifications, windowHours)
  const topSource = sources[0] || null
  const topLevel = levels[0] || null
  const peak = [...timeBuckets].sort((a, b) => b.count - a.count)[0] || null

  const total = useStats ? stats.total : notifications.length
  const unread = useStats ? stats.unread : notifications.filter((n) => !n.read).length
  const read = useStats ? stats.read : notifications.filter((n) => n.read).length
  const delivered = useStats
    ? stats.delivered
    : notifications.filter((n) => Boolean(n.deliveredAt)).length

  return {
    total,
    unread,
    read,
    delivered,
    readRate: useStats ? stats.readRate : total ? Math.round((read / total) * 1000) / 10 : 0,
    deliveryRate: useStats
      ? stats.deliveryRate
      : total
        ? Math.round((delivered / total) * 1000) / 10
        : 0,
    dangerCount: useStats
      ? stats.byLevel.danger || 0
      : notifications.filter((n) => n.level === 'danger').length,
    warnCount: useStats
      ? stats.byLevel.warn || 0
      : notifications.filter((n) => n.level === 'warn').length,
    sourceCount: sources.length,
    topSourceKey: topSource?.key || null,
    topSourceLabel: topSource?.label || null,
    topSourceCount: topSource?.count || 0,
    topLevel: topLevel?.level || null,
    topLevelCount: topLevel?.count || 0,
    peakTimeLabel: peak?.label || null,
    peakTimeCount: peak?.count || 0,
    avgPerHour: total ? Math.round((total / Math.max(windowHours, 1)) * 10) / 10 : null,
    windowHours: useStats ? stats.windowHours : windowHours,
  }
}

export function formatNotificationCount(n: number) {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function levelFilterLabel(level: string) {
  return LEVEL_LABELS[level] || level
}
