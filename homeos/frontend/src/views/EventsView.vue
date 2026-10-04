/** * 事件日志视图：数据分析 + 事件流双栏布局，展示 HA 实体状态变化时间线。 */
<script setup>
/**
 * 职责：渲染 views/EventsView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { useEventsView } from '@/composables/events/useEventsView'
import EventsViewHero from '@/views/events/ViewHero.vue'
import EventsViewToolbar from '@/views/events/ViewToolbar.vue'
import EventsViewAnalytics from '@/views/events/ViewAnalytics.vue'
import EventsViewStream from '@/views/events/ViewStream.vue'
import '@/assets/styles/list-page-dual-pane.css'
import '@/views/events/premium.css'

const {
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
  domainFilterOptions,
  domainStatsPreview,
  topEntitiesPreview,
  pageHint,
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
} = useEventsView()
</script>

<template>
  <div
    class="list-page events-view"
    :style="{
      '--page-accent': 'var(--module-accent-events)',
      '--page-accent-rgb': 'var(--module-accent-events-rgb)',
      '--page-accent-secondary': 'var(--module-accent-events-sub)',
    }"
  >
    <EventsViewHero
      :page-hint="pageHint"
      :stats="stats"
      :summary-metrics="summaryMetrics"
      :loading="loading"
      @reload="reload"
    />

    <div class="events-view__toolbar">
      <EventsViewToolbar
        :hours="hours"
        :hour-options="hourOptions"
        :entity-filter="entityFilter"
        :domain-filter="domainFilter"
        :domain-filter-options="domainFilterOptions"
        :domain-stats-preview="domainStatsPreview"
        :top-entities-preview="topEntitiesPreview"
        :entity-select-options="entitySelectOptions"
        :entity-options-loading="entityOptionsLoading"
        :loading="loading"
        :format-hour-option="formatHourOption"
        :format-count="formatCount"
        :entity-display-name="entityDisplayName"
        @update:hours="hours = $event"
        @update:domain-filter="onDomainFilterChange"
        @reload="reload"
        @entity-select-open="onEntitySelectOpen"
        @entity-select-search="onEntitySelectSearch"
        @entity-select="onEntitySelect"
        @filter-by-entity="filterByEntity"
      />
    </div>

    <section class="events-view__content">
      <div class="events-view__layout">
        <section class="events-view__analytics">
          <EventsViewAnalytics
            :stats="stats"
            :hours="hours"
            :entity-filter="entityFilter"
            :domain-filter="domainFilter"
            :entity-display-name="entityDisplayName"
            :format-count="formatCount"
            @filter-by-domain="filterByDomain"
            @filter-by-entity="filterByEntity"
          />
        </section>

        <EventsViewStream
          :loading="loading"
          :clearing="clearing"
          :is-admin="isAdmin"
          :error="error"
          :events="events"
          :entity-filter="entityFilter"
          :domain-filter="domainFilter"
          :result-summary="resultSummary"
          :page="page"
          :total-pages="totalPages"
          :total="total"
          :entity-display-name="entityDisplayName"
          :has-friendly-name="hasFriendlyName"
          :format-count="formatCount"
          @clear-all="clearAllRecords"
          @retry="reload"
          @clear-filter="clearAllFilters"
          @go-page="goPage"
        />
      </div>
    </section>
  </div>
</template>
