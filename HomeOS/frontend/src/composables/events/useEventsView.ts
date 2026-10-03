/**
 * @file useEventsView.ts
 * @module frontend/src/composables
 */
import { getEntityDomain } from '@homeos/shared'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  fetchEventStats,
  fetchEvents,
  fetchEntities,
  clearEvents,
  fetchEventMeta,
} from '@/services/api/entities'
import { useEntitiesStore } from '@/stores/entities.store'
import { useAuthStore } from '@/stores/auth.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useEnsureVisibleEntities } from '@/composables/entity/useEnsureVisibleEntities'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { notifyError } from '@/services/notify'
import { getEntityDisplayName, hasEntityFriendlyName } from '@/utils/entity/derived.util'
import { formatEntitySelectOption } from '@/utils/entity/select.util'
import type { HaEntityState } from '@/types/entity-store'
import {
  configEpoch,
  getEventLogConfig,
  loadFrontendConfig,
  onConfigChange,
} from '@/utils/config/frontend-config'
import {
  formatCount,
  formatHourOption,
  hoursLabel,
  normalizeByDomain,
} from '@/utils/events/events-display.util'

const PAGE_SIZE = 8

/** useEventsView：函数，按签名入参返回处理结果。 */
export function useEventsView() {
  const route = useRoute()
  const entitiesStore = useEntitiesStore()
  const authStore = useAuthStore()
  const chrome = useChromeStore()
  const hours = ref(getEventLogConfig().maxQueryHours)
  const entityFilter = ref('')
  const domainFilter = ref('')
  const page = ref(1)
  const events = ref<Array<Record<string, unknown>>>([])
  const total = ref(0)
  const totalPages = ref(1)
  const stats = ref<Record<string, unknown> | null>(null)
  /** 未按域/实体收窄的域目录，供「实体类型」下拉使用（避免选中某域后选项只剩一项） */
  const domainCatalog = ref<Array<{ domain: string; count: number }>>([])
  const loading = ref(false)
  const clearing = ref(false)
  const error = ref('')
  const entitySelectOptions = ref<Array<{ value: string; label: string; hint: string }>>([])
  const entityOptionsLoading = ref(false)
  const serverEventMeta = ref<Record<string, unknown> | null>(null)
  let eventsRequestSeq = 0
  let statsRequestSeq = 0
  let entityOptionsRequestSeq = 0
  let entitySearchTimer: ReturnType<typeof setTimeout> | null = null

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
    return `浏览近 ${retentionDays} 天（最多 ${maxQueryHours} 小时）内持久化的实体状态变更（PostgreSQL EventLog，超期自动清理）`
  })

  function syncHoursToRetention() {
    const opts = hourOptions.value
    if (!opts.length) return
    if (!opts.includes(hours.value)) {
      hours.value = opts[opts.length - 1]
    }
  }

  watch(hourOptions, syncHoursToRetention)

  const domainStatsPreview = computed(() => normalizeByDomain(stats.value?.byDomain).slice(0, 8))

  const domainFilterOptions = computed(() => {
    if (domainCatalog.value.length) return domainCatalog.value
    // 目录未就绪时：勿用已按域收窄的 stats.byDomain（会只剩当前选中域）
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

  const isAdmin = computed(() => authStore.role === 'admin')

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

  useEnsureVisibleEntities(ensuredEntityIds)

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

  function mapEntityOption(entityId: string, entity: HaEntityState | Record<string, unknown> | null | undefined) {
    return formatEntitySelectOption(entityId, entity)
  }

  function optionMatchesDomain(entityId: string, domain: string) {
    if (!domain) return true
    return entityId.startsWith(`${domain}.`)
  }

  function sortEntityOptions(rows: Array<{ value: string; label: string; hint: string }>) {
    return rows.sort((a, b) => a.label.localeCompare(b.label, 'zh'))
  }

  function ensureCurrentEntityOption(
    rows: Array<{ value: string; label: string; hint: string }>,
    seen: Set<string>,
  ) {
    const id = entityFilter.value
    if (!id || seen.has(id)) return
    if (!optionMatchesDomain(id, domainFilter.value)) return
    seen.add(id)
    rows.unshift(mapEntityOption(id, entitiesStore.entities[id]))
  }

  function mergeEntityOptions(incoming: Array<{ value: string; label: string; hint: string }>) {
    const domain = domainFilter.value
    const seen = new Set(
      entitySelectOptions.value
        .filter((o) => optionMatchesDomain(o.value, domain))
        .map((o) => o.value),
    )
    const merged = entitySelectOptions.value.filter((o) => optionMatchesDomain(o.value, domain))
    for (const opt of incoming) {
      if (!opt?.value || seen.has(opt.value)) continue
      if (!optionMatchesDomain(opt.value, domain)) continue
      seen.add(opt.value)
      merged.push(opt)
    }
    ensureCurrentEntityOption(merged, seen)
    entitySelectOptions.value = sortEntityOptions(merged)
  }

  /** 按当前实体类型重建选项（避免合并残留其它域） */
  function replaceEntityOptions(incoming: Array<{ value: string; label: string; hint: string }>) {
    const domain = domainFilter.value
    const seen = new Set<string>()
    const next: Array<{ value: string; label: string; hint: string }> = []
    for (const opt of incoming) {
      if (!opt?.value || seen.has(opt.value)) continue
      if (!optionMatchesDomain(opt.value, domain)) continue
      seen.add(opt.value)
      next.push(opt)
    }
    ensureCurrentEntityOption(next, seen)
    entitySelectOptions.value = sortEntityOptions(next)
  }

  function syncOptionsFromStats() {
    const rows = stats.value?.topEntities
    if (!Array.isArray(rows) || !rows.length) return
    const domain = domainFilter.value
    const scoped = domain
      ? rows.filter((row) => optionMatchesDomain(String(row?.entityId || ''), domain))
      : rows
    if (!scoped.length) return
    mergeEntityOptions(
      scoped.map((row) => mapEntityOption(row.entityId, entitiesStore.entities[row.entityId])),
    )
  }

  async function fetchEntitySelectOptions(search = '') {
    const seq = ++entityOptionsRequestSeq
    entityOptionsLoading.value = true
    try {
      const q = search.trim()
      const domain = domainFilter.value
      // 有类型约束时先丢掉其它域残留，再补 stats / API 结果
      if (domain) {
        entitySelectOptions.value = entitySelectOptions.value.filter((o) =>
          optionMatchesDomain(o.value, domain),
        )
      }
      if (!q) syncOptionsFromStats()
      const params: Record<string, unknown> = { limit: 80, page: 1 }
      if (q) params.search = q
      if (domain) params.domain = domain
      const { data } = await fetchEntities(params, { timeout: 30_000 })
      if (seq !== entityOptionsRequestSeq) return
      const rows = (data?.entities || []).map((e: { entity_id: string }) =>
        mapEntityOption(e.entity_id, e),
      )
      if (q || domain) {
        replaceEntityOptions(rows)
      } else {
        mergeEntityOptions(rows)
      }
    } catch (e) {
      if (seq !== entityOptionsRequestSeq) return
      logger.debug('事件实体选项加载失败', e)
      if (search.trim()) entitySelectOptions.value = []
    } finally {
      if (seq === entityOptionsRequestSeq) entityOptionsLoading.value = false
    }
  }

  async function onEntitySelectOpen() {
    await fetchEntitySelectOptions('')
  }

  function onEntitySelectSearch(query: string) {
    if (entitySearchTimer) clearTimeout(entitySearchTimer)
    entitySearchTimer = setTimeout(() => {
      void fetchEntitySelectOptions(query)
    }, 250)
  }

  function syncDomainFromEntityId(entityId: string) {
    const dom = getEntityDomain(entityId).trim()
    if (dom && domainFilter.value !== dom) {
      domainFilter.value = dom
    }
  }

  function onEntitySelect(value: string) {
    entityFilter.value = value || ''
    if (value) syncDomainFromEntityId(value)
    reload()
  }

  function filterByEntity(entityId: string) {
    entityFilter.value = entityId
    syncDomainFromEntityId(entityId)
    mergeEntityOptions([mapEntityOption(entityId, entitiesStore.entities[entityId])])
    reload()
  }

  function applyDomainFilter(domain: string) {
    domainFilter.value = domain
    if (entityFilter.value && domain && !entityFilter.value.startsWith(`${domain}.`)) {
      entityFilter.value = ''
    }
    entitySelectOptions.value = domain
      ? entitySelectOptions.value.filter((o) => optionMatchesDomain(o.value, domain))
      : entitySelectOptions.value
    reload()
  }

  function onDomainFilterChange(domain: string) {
    const next = String(domain || '').trim()
    if (!next) {
      clearDomainFilter()
      return
    }
    applyDomainFilter(next)
  }

  function filterByDomain(domain: string) {
    if (domainFilter.value === domain) {
      clearDomainFilter()
      return
    }
    applyDomainFilter(domain)
  }

  function clearDomainFilter() {
    domainFilter.value = ''
    reload()
  }

  function clearAllFilters() {
    entityFilter.value = ''
    domainFilter.value = ''
    reload()
  }

  async function clearAllRecords() {
    const ok = await chrome.confirm(
      '将永久删除数据库中全部事件变更日志条目（含 Redis 时间线缓存），此操作不可恢复。确定继续？',
      '清除全部记录',
      { type: 'danger', confirmText: '清除' },
    )
    if (!ok) return
    clearing.value = true
    try {
      const { data } = await clearEvents()
      const deleted = Number(data?.deleted ?? 0)
      chrome.notify(
        deleted > 0 ? `已清除 ${formatCount(deleted)} 条记录` : '记录已清空',
        'success',
      )
      page.value = 1
      await Promise.all([loadEvents(), loadStats()])
    } catch (e) {
      notifyError(e, '清除失败')
    } finally {
      clearing.value = false
    }
  }

  let offConfigChange: (() => void) | null = null

  function applyHoursFromRoute() {
    const q = route.query.hours
    const raw = typeof q === 'string' ? q.trim() : Array.isArray(q) ? String(q[0] || '').trim() : ''
    if (!raw) return
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n <= 0) return
    hours.value = n
    syncHoursToRetention()
  }

  function applyEntityFilterFromRoute() {
    const q = route.query.entity_id
    const id = typeof q === 'string' ? q.trim() : ''
    entityFilter.value = id
    if (id) {
      mergeEntityOptions([mapEntityOption(id, entitiesStore.entities[id])])
    }
    applyHoursFromRoute()
  }

  async function loadEventMeta() {
    try {
      const { data } = await fetchEventMeta()
      serverEventMeta.value = data && typeof data === 'object' ? data : null
      syncHoursToRetention()
    } catch (e) {
      logger.debug('事件 meta 加载失败,使用本地配置', e)
    }
  }

  watch(domainFilter, () => {
    void fetchEntitySelectOptions('')
  })

  onMounted(async () => {
    await loadFrontendConfig()
    await loadEventMeta()
    syncHoursToRetention()
    offConfigChange = onConfigChange(() => {
      syncHoursToRetention()
    })
    applyEntityFilterFromRoute()
    reload()
  })

  watch(
    () => [route.query.entity_id, route.query.hours] as const,
    () => {
      applyEntityFilterFromRoute()
      reload()
    },
  )

  onUnmounted(() => {
    offConfigChange?.()
    offConfigChange = null
    if (entitySearchTimer) clearTimeout(entitySearchTimer)
    entitySearchTimer = null
  })

  return {
    hours,
    entityFilter,
    domainFilter,
    page,
    events,
    total,
    totalPages,
    stats,
    loading,
    clearing,
    error,
    isAdmin,
    entitySelectOptions,
    entityOptionsLoading,
    hourOptions,
    pageHint,
    domainStatsPreview,
    domainFilterOptions,
    topEntitiesPreview,
    summaryMetrics,
    resultSummary,
    formatHourOption,
    formatCount,
    entityDisplayName,
    hasFriendlyName,
    reload,
    goPage,
    onEntitySelectOpen,
    onEntitySelectSearch,
    onEntitySelect,
    filterByEntity,
    filterByDomain,
    onDomainFilterChange,
    clearAllFilters,
    clearAllRecords,
  }
}
