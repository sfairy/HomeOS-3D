/** * 通知中心视图：数据分析 + 消息流双栏布局。 */
<script setup>
import {
  NotificationsViewAnalytics,
  NotificationsViewHero,
  NotificationsViewStream,
  NotificationsViewToolbar,
  useNotificationsView,
} from '@/features/notifications'
import '@/assets/styles/list-page-dual-pane.css'
import '@/features/notifications/premium.css'

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
  /* 组合式函数导出的是 formatNotificationHourOption；此处原名 formatHourOption 解构不到，
     会得到 undefined 并以 required Function prop 传给 ViewToolbar，
     导致整页被 ErrorBoundary 拦下（$props.formatHourOption is not a function）。 */
  formatNotificationHourOption: formatHourOption,
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
