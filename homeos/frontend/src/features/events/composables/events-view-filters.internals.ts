/**
 * @file events-view-filters.internals.ts
 * @module frontend/src/features/events/composables
 */
import { ref, watch, type Ref } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { fetchEntities } from '@/services/api/entities'
import { logger } from '@/shared/utils/core/logger'
import { formatEntitySelectOption } from '@/shared/entity/utils/select.util'
import type { HaEntityState } from '@/shared/types/entity-store'
import type { useEntitiesStore } from '@/stores/entities.store'
import type { RouteLocationNormalizedLoaded } from 'vue-router'

type EntitiesStore = ReturnType<typeof useEntitiesStore>
type EntityOption = { value: string; label: string; hint: string }

/** 实体下拉选项与域/实体筛选 */
export function createEventsViewFilters(opts: {
  entityFilter: Ref<string>
  domainFilter: Ref<string>
  entitiesStore: EntitiesStore
  stats: Ref<Record<string, unknown> | null>
  reload: () => void
  syncHoursToRetention: () => void
  hours: Ref<number>
}) {
  const { entityFilter, domainFilter, entitiesStore, stats, reload, syncHoursToRetention, hours } =
    opts

  const entitySelectOptions = ref<EntityOption[]>([])
  const entityOptionsLoading = ref(false)
  let entityOptionsRequestSeq = 0
  let entitySearchTimer: ReturnType<typeof setTimeout> | null = null

  function mapEntityOption(
    entityId: string,
    entity: HaEntityState | Record<string, unknown> | null | undefined,
  ) {
    return formatEntitySelectOption(entityId, entity)
  }

  function optionMatchesDomain(entityId: string, domain: string) {
    if (!domain) return true
    return entityId.startsWith(`${domain}.`)
  }

  function sortEntityOptions(rows: EntityOption[]) {
    return rows.sort((a, b) => a.label.localeCompare(b.label, 'zh'))
  }

  function ensureCurrentEntityOption(rows: EntityOption[], seen: Set<string>) {
    const id = entityFilter.value
    if (!id || seen.has(id)) return
    if (!optionMatchesDomain(id, domainFilter.value)) return
    seen.add(id)
    rows.unshift(mapEntityOption(id, entitiesStore.entities[id]))
  }

  function mergeEntityOptions(incoming: EntityOption[]) {
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

  function replaceEntityOptions(incoming: EntityOption[]) {
    const domain = domainFilter.value
    const seen = new Set<string>()
    const next: EntityOption[] = []
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

  function applyHoursFromRoute(route: RouteLocationNormalizedLoaded) {
    const q = route.query.hours
    const raw = typeof q === 'string' ? q.trim() : Array.isArray(q) ? String(q[0] || '').trim() : ''
    if (!raw) return
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n <= 0) return
    hours.value = n
    syncHoursToRetention()
  }

  function applyEntityFilterFromRoute(route: RouteLocationNormalizedLoaded) {
    const q = route.query.entity_id
    const id = typeof q === 'string' ? q.trim() : ''
    entityFilter.value = id
    if (id) {
      mergeEntityOptions([mapEntityOption(id, entitiesStore.entities[id])])
    }
    applyHoursFromRoute(route)
  }

  watch(domainFilter, () => {
    void fetchEntitySelectOptions('')
  })

  function clearEntitySearchTimer() {
    if (entitySearchTimer) clearTimeout(entitySearchTimer)
    entitySearchTimer = null
  }

  return {
    entitySelectOptions,
    entityOptionsLoading,
    onEntitySelectOpen,
    onEntitySelectSearch,
    onEntitySelect,
    filterByEntity,
    filterByDomain,
    onDomainFilterChange,
    clearAllFilters,
    applyEntityFilterFromRoute,
    clearEntitySearchTimer,
  }
}
