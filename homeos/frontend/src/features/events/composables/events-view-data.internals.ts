/**
 * @file events-view-data.internals.ts
 * @module frontend/src/features/events/composables
 */
import { ref, computed, watch, type Ref } from 'vue'
import {
  fetchEventStats,
  fetchEvents,
  fetchEventMeta,
  clearEvents,
} from '@/services/api/entities'
import type { useChromeStore } from '@/stores/chrome.store'
import { logger } from '@/shared/utils/core/logger'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { notifyError } from '@/services/notify'
import {
  configEpoch,
  getEventLogConfig,
} from '@/shared/utils/config/frontend-config'
import {
  formatCount,
  hoursLabel,
  normalizeByDomain,
} from '@/shared/events/utils/events-display.util'
import { getEntityDisplayName, hasEntityFriendlyName } from '@/shared/entity/utils/derived.util'
import type { useEntitiesStore } from '@/stores/entities.store'

type EntitiesStore = ReturnType<typeof useEntitiesStore>
type ChromeStore = ReturnType<typeof useChromeStore>

const PAGE_SIZE = 8


/** 事件日志 meta / 小时窗口 */
export function createEventsViewMetaState(hours: Ref<number>) {
  const serverEventMeta = ref<Record<string, unknown> | null>(null)

  const eventLogMeta = computed(() => {
    void configEpoch.value
    const local = getEventLogConfig()
    const remote = serverEventMeta.value
    if (!remote) return local
    const retentionDays =
      Number(remote.retentionDays) > 0 ? Number(remote.retentionDays) : local.retentionDays
    const maxQueryHours =
      Number(remote.maxQueryHours) > 0 ? Number(remote.maxQueryHours) : local.maxQueryHours
    const remoteHours = Array.isArray(remote.hourOptions)
      ? remote.hourOptions.map((h) => Number(h)).filter((h) => h > 0 && h <= maxQueryHours)
      : []
    return {
      ...local,
      retentionDays,
      maxQueryHours,
      hourOptions: remoteHours.length ? remoteHours : local.hourOptions,
    }
  })

  const hourOptions = computed(() => eventLogMeta.value.hourOptions)

  const pageHint = computed(() => {
    const { retentionDays, maxQueryHours } = eventLogMeta.value
    return `浏览近 ${retentionDays} 天（最多 ${maxQueryHours} 小时）内持久化的实体状态变更（SQLite EventLog，超期自动清理）`
  })

  function syncHoursToRetention() {
    const opts = hourOptions.value
    if (!opts.length) return
    if (!opts.includes(hours.value)) {
      hours.value = opts[opts.length - 1]
    }
  }

  watch(hourOptions, syncHoursToRetention)

  async function loadEventMeta() {
    try {
      const { data } = await fetchEventMeta()
      serverEventMeta.value = data && typeof data === 'object' ? data : null
      syncHoursToRetention()
    } catch (e) {
      logger.debug('事件 meta 加载失败,使用本地配置', e)
    }
  }

  return { serverEventMeta, eventLogMeta, hourOptions, pageHint, syncHoursToRetention, loadEventMeta }
}

/** 列表 / 统计加载 */
export function createEventsViewLoaders(opts: {
  hours: Ref<number>
  entityFilter: Ref<string>
  domainFilter: Ref<string>
  page: Ref<number>
  entitiesStore: EntitiesStore
}) {
  const { hours, entityFilter, domainFilter, page, entitiesStore } = opts
  const events = ref<Array<Record<string, unknown>>>([])
  const total = ref(0)
  const totalPages = ref(1)
  const stats = ref<Record<string, unknown> | null>(null)
  const domainCatalog = ref<Array<{ domain: string; count: number }>>([])
  const loading = ref(false)
  const clearing = ref(false)
  const error = ref('')
  let eventsRequestSeq = 0
  let statsRequestSeq = 0

  function entityDisplayName(entityId: string) {
    return getEntityDisplayName(entityId, entitiesStore.entities[entityId])
  }
  function hasFriendlyName(entityId: string) {
    return hasEntityFriendlyName(entitiesStore.entities[entityId])
  }

  async function loadStats() {
    const seq = ++statsRequestSeq
    try {
      const params: Record<string, unknown> = { hours: hours.value }
      if (entityFilter.value) params.entity_id = entityFilter.value
      if (domainFilter.value) params.domain = domainFilter.value
      const scoped = Boolean(entityFilter.value || domainFilter.value)
      if (scoped) {
        const [filtered, catalog] = await Promise.all([
          fetchEventStats(params),
          fetchEventStats({ hours: hours.value }),
        ])
        if (seq !== statsRequestSeq) return
        stats.value = filtered.data
        domainCatalog.value = normalizeByDomain(catalog.data?.byDomain)
      } else {
        const { data } = await fetchEventStats(params)
        if (seq !== statsRequestSeq) return
        stats.value = data
        domainCatalog.value = normalizeByDomain(data?.byDomain)
      }
    } catch (e) {
      if (seq !== statsRequestSeq) return
      logger.debug('事件统计加载失败', e)
      stats.value = null
    }
  }

  async function loadEvents() {
    const seq = ++eventsRequestSeq
    loading.value = true
    error.value = ''
    try {
      const params: Record<string, unknown> = {
        hours: hours.value,
        limit: PAGE_SIZE,
        page: page.value,
      }
      if (entityFilter.value) params.entity_id = entityFilter.value
      if (domainFilter.value) params.domain = domainFilter.value
      const { data } = await fetchEvents(params)
      if (seq !== eventsRequestSeq) return
      events.value = data?.events || []
      total.value = data?.total ?? events.value.length
      totalPages.value = data?.totalPages ?? 1
      page.value = data?.page ?? page.value
    } catch (e) {
      if (seq !== eventsRequestSeq) return
      logger.warn('事件加载失败', e)
      error.value = getApiErrorMessage(e, '加载失败')
      events.value = []
    } finally {
      if (seq === eventsRequestSeq) loading.value = false
    }
  }

  function reload() {
    page.value = 1
    void loadEvents().then(() => loadStats())
  }

  function goPage(p: number) {
    page.value = p
    loadEvents()
  }

  return {
    events,
    total,
    totalPages,
    stats,
    domainCatalog,
    loading,
    clearing,
    error,
    entityDisplayName,
    hasFriendlyName,
    loadStats,
    loadEvents,
    reload,
    goPage,
  }
}

/** 摘要卡片派生 */
export function createEventsViewSummaries(opts: {
  hours: Ref<number>
  entityFilter: Ref<string>
  domainFilter: Ref<string>
  events: Ref<Array<Record<string, unknown>>>
  total: Ref<number>
  stats: Ref<Record<string, unknown> | null>
  domainCatalog: Ref<Array<{ domain: string; count: number }>>
  entitiesStore: EntitiesStore
  entityDisplayName: (entityId: string) => string
}) {
  const {
    hours,
    entityFilter,
    domainFilter,
    events,
    total,
    stats,
    domainCatalog,
    entitiesStore,
    entityDisplayName,
  } = opts

  const domainStatsPreview = computed(() => normalizeByDomain(stats.value?.byDomain).slice(0, 8))

  const domainFilterOptions = computed(() => {
    if (domainCatalog.value.length) return domainCatalog.value
    if (!domainFilter.value && !entityFilter.value) {
      const fromStats = normalizeByDomain(stats.value?.byDomain)
      if (fromStats.length) return fromStats
    }
    const rows = [...entitiesStore.domainCounts.entries()]
      .map(([domain, count]) => ({ domain, count: Number(count) || 0 }))
      .filter((row) => row.domain)
      .sort((a, b) => b.count - a.count)
    return rows.slice(0, 24)
  })

  const activeDomainCount = computed(() => normalizeByDomain(stats.value?.byDomain).length)

  const topEntitiesPreview = computed(() => {
    const rows = stats.value?.topEntities
    if (!Array.isArray(rows)) return []
    return rows.slice(0, 6)
  })

  const summaryMetrics = computed(() => {
    if (!stats.value) return []
    const domains = normalizeByDomain(stats.value?.byDomain)
    const topDomain = domains[0]
    return [
      { key: 'total', label: '总记录', value: formatCount(stats.value.total), tone: 'sky' },
      { key: 'domains', label: '活跃域', value: String(activeDomainCount.value), tone: 'pink' },
      {
        key: 'top',
        label: '最热域',
        value: topDomain?.domain || '—',
        tone: topDomain ? 'green' : 'muted',
      },
      { key: 'hours', label: '回溯窗口', value: hoursLabel(hours.value), tone: 'muted' },
    ]
  })

  const resultSummary = computed(() => {
    const parts = []
    if (domainFilter.value) parts.push(`域 ${domainFilter.value}`)
    if (entityFilter.value) {
      const name = entityDisplayName(entityFilter.value)
      const label = name !== entityFilter.value ? `${name}` : entityFilter.value
      parts.push(label)
    }
    if (parts.length) {
      return `筛选 ${parts.join(' · ')} · 本页 ${events.value.length} 条`
    }
    return `本页 ${events.value.length} 条 · 共 ${formatCount(total.value)} 条`
  })

  const ensuredEntityIds = computed(() => {
    const ids = new Set(events.value.map((evt) => evt.entityId as string).filter(Boolean))
    for (const row of topEntitiesPreview.value) {
      if (row?.entityId) ids.add(row.entityId)
    }
    return [...ids]
  })

  return {
    domainStatsPreview,
    domainFilterOptions,
    topEntitiesPreview,
    summaryMetrics,
    resultSummary,
    ensuredEntityIds,
  }
}

export async function clearAllEventRecords(opts: {
  chrome: ChromeStore
  clearing: Ref<boolean>
  page: Ref<number>
  loadEvents: () => Promise<void>
  loadStats: () => Promise<void>
}) {
  const { chrome, clearing, page, loadEvents, loadStats } = opts
  const ok = await chrome.confirm(
    '将永久删除数据库中全部事件变更日志条目（含时间线缓存），此操作不可恢复。确定继续？',
    '清除全部记录',
    { type: 'danger', confirmText: '清除' },
  )
  if (!ok) return
  clearing.value = true
  try {
    const { data } = await clearEvents()
    const deleted = Number(data?.deleted ?? 0)
    if (data?.complete === false) {
      chrome.notify(
        `已清除 ${formatCount(deleted)} 条记录，仍有剩余记录未删完，请再次执行清除`,
        'warning',
      )
    } else {
      chrome.notify(
        deleted > 0 ? `已清除 ${formatCount(deleted)} 条记录` : '记录已清空',
        'success',
      )
    }
    page.value = 1
    await Promise.all([loadEvents(), loadStats()])
  } catch (e) {
    notifyError(e, '清除失败')
  } finally {
    clearing.value = false
  }
}
