/** * 通知中心视图：数据分析 + 消息流双栏布局。 */
<script setup>
/**
 * 职责：渲染 views/NotificationsView 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { useNotificationsView } from '@/composables/notifications/useNotificationsView'
import NotificationsViewHero from '@/views/notifications/ViewHero.vue'
import NotificationsViewToolbar from '@/views/notifications/ViewToolbar.vue'
import NotificationsViewAnalytics from '@/views/notifications/ViewAnalytics.vue'
import NotificationsViewStream from '@/views/notifications/ViewStream.vue'
import '@/assets/styles/list-page-dual-pane.css'
import '@/views/notifications/premium.css'

const {
  hours,
  hourOptions,
  stats,
  statsLoading,
  statsError,
  prefFilteredNotifications,
  displayNotifications,
  activeSource,
  activeLevel,
  levelFilters,
  remoteLoading,
  unreadCount,
  analyticsSummary,
  pageHint,
  summaryMetrics,
  resultSummary,
  reload,
  markAllRead,
  clearAll,
  filterBySource,
  filterByLevel,
  formatCount,
  formatHourOption,
} = useNotificationsView()
</script>

<template>
  <div
    class="list-page notifications-view"
    :style="{
      '--page-accent': '#f472b6',
      '--page-accent-rgb': '244, 114, 182',
      '--page-accent-secondary': '#fb7185',
    }"
  >
    <NotificationsViewHero
      :page-hint="pageHint"
      :summary-metrics="summaryMetrics"
      :loading="remoteLoading || statsLoading"
      :unread-count="unreadCount"
      :can-clear="displayNotifications.length > 0"
      @reload="reload"
      @mark-all-read="markAllRead"
      @clear-all="clearAll"
    />

    <NotificationsViewToolbar
      :hours="hours"
      :hour-options="hourOptions"
      :active-level="activeLevel"
      :level-filters="levelFilters"
      :loading="remoteLoading || statsLoading"
      :format-hour-option="formatHourOption"
      @update:hours="hours = $event"
      @update:active-level="activeLevel = $event"
      @reload="reload"
    />

    <div v-if="statsError" class="notifications-view__stats-error">
      {{ statsError }}
    </div>

    <section class="notifications-view__content">
      <div class="notifications-view__layout">
        <section class="notifications-view__analytics">
          <NotificationsViewAnalytics
            :notifications="prefFilteredNotifications"
            :stats="stats"
            :summary="analyticsSummary"
            :hours="hours"
            :active-source="activeSource"
            :format-count="formatCount"
            @filter-by-source="filterBySource"
            @filter-by-level="filterByLevel"
          />
        </section>

        <NotificationsViewStream
          :result-summary="resultSummary"
          :unread-count="unreadCount"
          :can-clear="displayNotifications.length > 0"
          @mark-all-read="markAllRead"
          @clear-all="clearAll"
        />
      </div>
    </section>
  </div>
</template>
