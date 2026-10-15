/**
 * @file useEventsView.ts
 * @module frontend/src/composables
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useEnsureVisibleEntities } from '@/composables/entity/useEnsureVisibleEntities'
import {
  getEventLogConfig,
  loadFrontendConfig,
  onConfigChange,
} from '@/shared/utils/config/frontend-config'
import { formatCount, formatHourOption } from '@/shared/events/utils/events-display.util'
import {
  createEventsViewMetaState,
  createEventsViewLoaders,
  createEventsViewSummaries,
  clearAllEventRecords,
} from './events-view-data.internals'
import { createEventsViewFilters } from './events-view-filters.internals'

function buildEventsViewApi(parts: {
  hours: ReturnType<typeof ref<number>>
  entityFilter: ReturnType<typeof ref<string>>
  domainFilter: ReturnType<typeof ref<string>>
  page: ReturnType<typeof ref<number>>
  meta: ReturnType<typeof createEventsViewMetaState>
  loaders: ReturnType<typeof createEventsViewLoaders>
  summaries: ReturnType<typeof createEventsViewSummaries>
  filters: ReturnType<typeof createEventsViewFilters>
  clearAllRecords: () => Promise<void>
}) {
  const { hours, entityFilter, domainFilter, page, meta, loaders, summaries, filters, clearAllRecords } =
    parts
  return {
    hours,
    entityFilter,
    domainFilter,
    page,
    events: loaders.events,
    total: loaders.total,
    totalPages: loaders.totalPages,
    stats: loaders.stats,
    loading: loaders.loading,
    clearing: loaders.clearing,
    error: loaders.error,
    entitySelectOptions: filters.entitySelectOptions,
    entityOptionsLoading: filters.entityOptionsLoading,
    hourOptions: meta.hourOptions,
    pageHint: meta.pageHint,
    domainStatsPreview: summaries.domainStatsPreview,
    domainFilterOptions: summaries.domainFilterOptions,
    topEntitiesPreview: summaries.topEntitiesPreview,
    summaryMetrics: summaries.summaryMetrics,
    resultSummary: summaries.resultSummary,
    formatHourOption,
    formatCount,
    entityDisplayName: loaders.entityDisplayName,
    hasFriendlyName: loaders.hasFriendlyName,
    reload: loaders.reload,
    goPage: loaders.goPage,
    onEntitySelectOpen: filters.onEntitySelectOpen,
    onEntitySelectSearch: filters.onEntitySelectSearch,
    onEntitySelect: filters.onEntitySelect,
    filterByEntity: filters.filterByEntity,
    filterByDomain: filters.filterByDomain,
    onDomainFilterChange: filters.onDomainFilterChange,
    clearAllFilters: filters.clearAllFilters,
    clearAllRecords,
  }
}

export function useEventsView() {
  const route = useRoute()
  const entitiesStore = useEntitiesStore()
  const chrome = useChromeStore()
  const hours = ref(getEventLogConfig().maxQueryHours)
  const entityFilter = ref('')
  const domainFilter = ref('')
  const page = ref(1)

  const meta = createEventsViewMetaState(hours)
  const loaders = createEventsViewLoaders({ hours, entityFilter, domainFilter, page, entitiesStore })
  const summaries = createEventsViewSummaries({
    hours,
    entityFilter,
    domainFilter,
    events: loaders.events,
    total: loaders.total,
    stats: loaders.stats,
    domainCatalog: loaders.domainCatalog,
    entitiesStore,
    entityDisplayName: loaders.entityDisplayName,
  })
  useEnsureVisibleEntities(summaries.ensuredEntityIds)
  const filters = createEventsViewFilters({
    entityFilter,
    domainFilter,
    entitiesStore,
    stats: loaders.stats,
    reload: loaders.reload,
    syncHoursToRetention: meta.syncHoursToRetention,
    hours,
  })

  let offConfigChange: (() => void) | null = null
  onMounted(async () => {
    await loadFrontendConfig()
    await meta.loadEventMeta()
    meta.syncHoursToRetention()
    offConfigChange = onConfigChange(() => meta.syncHoursToRetention())
    filters.applyEntityFilterFromRoute(route)
    loaders.reload()
  })
  watch(
    () => [route.query.entity_id, route.query.hours] as const,
    () => {
      filters.applyEntityFilterFromRoute(route)
      loaders.reload()
    },
  )
  onUnmounted(() => {
    offConfigChange?.()
    offConfigChange = null
    filters.clearEntitySearchTimer()
  })

  return buildEventsViewApi({
    hours,
    entityFilter,
    domainFilter,
    page,
    meta,
    loaders,
    summaries,
    filters,
    clearAllRecords: () =>
      clearAllEventRecords({
        chrome,
        clearing: loaders.clearing,
        page,
        loadEvents: loaders.loadEvents,
        loadStats: loaders.loadStats,
      }),
  })
}
