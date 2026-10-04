<!--
  NotificationCenter.vue / components/widgets/system
  系统通知中心：聚合多源通知（HA persistent_notification、Frigate、系统告警、
  策略触发），支持按 source 过滤、单条/全部标记已读、分页/虚拟滚动、跳转设置。
  Props: variant 展示模式（popover 弹窗 / hub 面板 / rail 侧栏）
         / inline 是否内联（非全局层）
  依赖：composables: useNotificationCenter 数据源 + inject NOTIFICATION_CENTER_KEY
                      + useFixedPagePagination 分页；
        RouterLink 跳转通知设置；
        子组件：ApiQueryState / VirtualList / VEmptyState；
        @homeos/shared notificationSourceLabel 源标签中文化。
  注意: inject 注入优先（外层 <NotificationCenterProvider>）；否则自举 useNotificationCenter。
-->
<template>
  <div :class="['nc-root', variantClass]">
    <div v-if="showInlineHeader && authStore.isAuthenticated" class="nc-header">
      <div class="nc-header-left">
        <span v-if="popover" class="nc-title">
          {{ '通知' }} ({{ unreadCount > 0 ? unreadCount + '/' : ''
          }}{{ displayNotifications.length }})
        </span>
        <span v-else-if="drawer" class="nc-title nc-title--drawer">
          {{ displayNotifications.length }} {{ '条' }}
        </span>
        <RouterLink
          v-if="dndSettings"
          :to="SETTINGS_ROUTES.alerts()"
          :class="['nc-dnd', dndSettings.dndActive ? 'nc-dnd--on' : 'nc-dnd--off']"
          :title="
            dndSettings.dndActive
              ? `免打扰 ${dndSettings.dndStart}:00–${dndSettings.dndEnd}:00（点击编辑）`
              : '当前未免打扰（点击编辑）'
          "
        >
          {{ dndSettings.dndActive ? 'DND' : '正常' }}
        </RouterLink>
        <span
          v-if="lanPushReady && !page"
          class="nc-lan-push"
          title="WebSocket 实时推送已连接，局域网内多终端可同步通知与实体状态"
        >
          {{ '局域网推送' }}
        </span>
      </div>
      <div v-if="!page" class="nc-header-actions">
        <button v-if="unreadCount > 0" class="nc-action-btn" @click="markAllRead" :title="'已读'">
          {{ '已读' }}
        </button>
        <button class="nc-clear-btn" @click="clearAll" :title="'清除'">{{ '清除' }}</button>
      </div>
    </div>

    <div
      v-if="authStore.isAuthenticated"
      class="nc-filters"
      role="tablist"
      :aria-label="'通知来源筛选'"
      @keydown="onFilterKeydown"
    >
      <button
        v-for="(f, idx) in sourceFilters"
        :key="f.key"
        :class="['nc-filter', activeSource === f.key && 'nc-filter--active']"
        role="tab"
        :aria-selected="activeSource === f.key"
        :tabindex="activeSource === f.key ? 0 : -1"
        :ref="(el) => setFilterRef(el, idx)"
        @click="activeSource = f.key"
      >
        {{ f.label }}
        <span v-if="filterCounts[f.key] > 0" class="nc-filter__count">{{
          filterCounts[f.key]
        }}</span>
      </button>
    </div>

    <ApiQueryState
      v-if="
        authStore.isAuthenticated &&
        page &&
        (remoteLoading || remoteError) &&
        !displayNotifications.length
      "
      :loading="remoteLoading"
      :error="remoteError"
      skeleton="list"
      error-title="通知加载失败"
      tone="pink"
      @retry="fetchRemote"
    />

    <div
      v-if="authStore.isAuthenticated && page && pagedNotifications.length"
      class="nc-items nc-items--paged"
      role="list"
      :aria-label="'通知列表'"
    >
      <div
        v-for="(n, index) in pagedNotifications"
        :key="n.id"
        :class="itemClasses(n, index)"
        role="listitem"
        :data-index="index"
        :tabindex="focusedIndex === index ? 0 : -1"
        :aria-label="n.message"
        @click="onNotificationClick(n)"
        @focus="focusedIndex = index"
        @keydown.enter.prevent="onNotificationClick(n)"
        @keydown.space.prevent="onNotificationClick(n)"
      >
        <div class="nc-item__icon-wrap" :class="`nc-item__icon-wrap--${n.level || 'info'}`">
          <component
            :is="levelIcon(n.level)"
            class="nc-item__icon"
            :class="levelColor(n.level)"
          />
        </div>
        <div class="nc-item__body">
          <p class="nc-text">{{ n.message }}</p>
          <div class="nc-meta">
            <span class="nc-source">{{ notificationSourceLabel(n.source) }}</span>
            <span class="nc-meta-sep" aria-hidden="true">·</span>
            <span class="nc-time">{{ n.time }}{{ n.deliveredAt ? ` · ${'已推送'}` : '' }}</span>
          </div>
        </div>
        <ChevronRight
          v-if="resolveNotificationLink(n)"
          class="nc-item__chevron"
          aria-hidden="true"
        />
        <button class="nc-dismiss" :aria-label="'关闭通知'" @click.stop="dismiss(n.id)">
          <X class="nc-dismiss__icon" />
        </button>
      </div>
    </div>

    <VirtualList
      v-else-if="authStore.isAuthenticated && displayNotifications.length"
      ref="listRef"
      class="nc-items"
      role="list"
      :aria-label="'通知列表'"
      :items="displayNotifications"
      :item-height="itemHeight"
      :item-gap="itemGap"
      :item-key="(n) => n.id"
      @keydown="onListKeydown"
    >
      <template #default="{ item: n, index }">
        <div
          :class="itemClasses(n, index)"
          role="listitem"
          :data-index="index"
          :tabindex="focusedIndex === index ? 0 : -1"
          :aria-label="n.message"
          @click="onNotificationClick(n)"
          @focus="focusedIndex = index"
          @keydown.enter.prevent="onNotificationClick(n)"
          @keydown.space.prevent="onNotificationClick(n)"
        >
          <div class="nc-item__icon-wrap" :class="`nc-item__icon-wrap--${n.level || 'info'}`">
            <component
              :is="levelIcon(n.level)"
              class="nc-item__icon"
              :class="levelColor(n.level)"
            />
          </div>
          <div class="nc-item__body">
            <p class="nc-text">{{ n.message }}</p>
            <div class="nc-meta">
              <span class="nc-source">{{ notificationSourceLabel(n.source) }}</span>
              <span class="nc-meta-sep" aria-hidden="true">·</span>
              <span class="nc-time">{{ n.time }}{{ n.deliveredAt ? ` · ${'已推送'}` : '' }}</span>
            </div>
          </div>
          <ChevronRight
            v-if="resolveNotificationLink(n)"
            class="nc-item__chevron"
            aria-hidden="true"
          />
          <button class="nc-dismiss" :aria-label="'关闭通知'" @click.stop="dismiss(n.id)">
            <X class="nc-dismiss__icon" />
          </button>
        </div>
      </template>
    </VirtualList>

    <footer v-if="page && authStore.isAuthenticated && totalPages > 1" class="nc-pager">
      <button
        type="button"
        class="list-page__btn"
        :disabled="!canPrev || remoteLoading"
        @click="prevPage"
      >
        上一页
      </button>
      <span class="list-page__muted">
        {{ currentPage }} / {{ totalPages }}（共 {{ displayNotifications.length }} 条）
      </span>
      <button
        type="button"
        class="list-page__btn"
        :disabled="!canNext || remoteLoading"
        @click="nextPage"
      >
        下一页
      </button>
    </footer>

    <VEmptyState
      v-if="!authStore.isAuthenticated"
      :compact="!page"
      tone="pink"
      title="请先登录"
      description="登录后可查看系统通知与设备告警"
    />
    <VEmptyState
      v-else-if="authStore.isAuthenticated && !displayNotifications.length && !(page && (remoteLoading || remoteError))"
      :compact="!page"
      tone="pink"
      icon="🔔"
      :title="activeSource === 'all' ? '暂无通知' : '该分类暂无通知'"
      :description="
        activeSource === 'all' ? '告警规则触发或系统事件将显示在此' : '切换其他分类或等待新消息'
      "
    />
  </div>
</template>

<script setup>
/**
 * @file NotificationCenter.vue
 * @module widgets/system
 * @description 通知中心部件：展示系统通知列表，支持按来源/类型筛选、分页加载、
 *              标为已读与跳转设置；通过 inject 获取通知中心上下文。
 * @dependencies
 *  - vue: computed/inject/watch 响应式与依赖注入
 *  - vue-router: RouterLink 路由跳转
 *  - @lucide/vue: ChevronRight / X 图标
 *  - @/components/common/ApiQueryState.vue: 查询状态容器
 *  - @/components/common/base/VirtualList.vue: 虚拟列表
 *  - @/components/common/base/VEmptyState.vue: 空态组件
 *  - @/utils/registry/settings-route.util: 设置页路由常量
 *  - @/composables/widget/useNotificationCenter: 通知中心数据 composable
 *  - @/composables/widget/notification-center.context: 通知中心上下文注入键
 *  - @homeos/shared: 通知来源标签
 *  - @/composables/ui/hub-viewport.internals: 固定页码分页
 */
import { computed, inject, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRight, X } from '@lucide/vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import VirtualList from '@/components/common/base/VirtualList.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'
import { useNotificationCenter } from '@/composables/widget/useNotificationCenter'
import { NOTIFICATION_CENTER_KEY } from '@/composables/widget/notification-center.context'
import { notificationSourceLabel } from '@homeos/shared'
import { useFixedPagePagination } from '@/composables/ui/hub-viewport.internals'
import './styles/notification-center.css'

const PAGE_SIZE = 7

const props = defineProps({
  popover: { type: Boolean, default: false },
  drawer: { type: Boolean, default: false },
  page: { type: Boolean, default: false },
})

const injected = inject(NOTIFICATION_CENTER_KEY, null)
const state = injected && typeof injected === 'object' ? injected : useNotificationCenter()

const {
  authStore,
  sourceFilters,
  dndSettings,
  remoteLoading,
  remoteError,
  activeSource,
  focusedIndex,
  listRef,
  displayNotifications: displayNotificationsRaw,
  filterCounts,
  unreadCount: unreadCountRaw,
  lanPushReady,
  setFilterRef,
  onListKeydown,
  onFilterKeydown,
  onNotificationClick,
  dismiss,
  markAllRead,
  clearAll,
  fetchRemote,
  levelIcon,
  levelColor,
  resolveNotificationLink,
} = state

/** inject/HMR 可能短暂缺字段；模板与 computed 统一走兜底 */
const displayNotifications = computed(() => {
  if (!displayNotificationsRaw) return []
  return Array.isArray(displayNotificationsRaw)
    ? displayNotificationsRaw
    : (displayNotificationsRaw.value ?? [])
})
const unreadCount = computed(() => {
  if (unreadCountRaw == null) return 0
  return typeof unreadCountRaw === 'number' ? unreadCountRaw : (unreadCountRaw.value ?? 0)
})

const notificationCount = computed(() => displayNotifications.value.length)

const { currentPage, totalPages, canPrev, canNext, prevPage, nextPage, resetPage, sliceItems } =
  useFixedPagePagination({
    itemCount: notificationCount,
    perPage: PAGE_SIZE,
  })

const pagedNotifications = computed(() => {
  const list = displayNotifications.value
  return props.page ? sliceItems(list) : list
})

watch(activeSource, () => {
  if (props.page) resetPage()
})

const variantClass = computed(() => {
  if (props.page) return 'nc-root--page'
  if (props.drawer) return 'nc-root--drawer'
  if (props.popover) return 'nc-root--popover'
  return 'widget-glass-card'
})

const showInlineHeader = computed(() => !props.page && (props.popover || props.drawer))

const itemHeight = computed(() => (props.page ? 72 : 56))
const itemGap = computed(() => (props.page ? 8 : 4))

function itemClasses(n, index) {
  return [
    'nc-item',
    `nc-item--${n.level || 'info'}`,
    {
      'nc-item--unread': !n.read,
      'nc-item--clickable': !!resolveNotificationLink(n),
      'nc-item--focused': focusedIndex === index,
      'nc-item--page': props.page,
    },
  ]
}

defineExpose({ unreadCount })
</script>
