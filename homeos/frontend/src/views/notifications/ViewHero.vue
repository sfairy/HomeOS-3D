<!--
组件：NotificationsViewHero.vue
所属模块：frontend / src / views / notifications
职责：通知中心页头（Hero）。展示标题、概要指标，以及「告警规则 / 免打扰 /
      全部已读 / 清空 / 刷新」等操作入口，未读数与可清空状态控制按钮可用性。
关键依赖：
  - ListPageHero / ListPageMetrics：通用列表页头与指标卡组件
  - SETTINGS_ROUTES：跳转告警规则、免打扰子页的路由工具
  - Bell 图标来自 @lucide/vue
数据来源：父级页面透传的概要指标 summaryMetrics 与 unreadCount / canClear / loading 状态
-->
<script setup>
/**
 * 职责：渲染 views/ViewHero 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Bell } from '@lucide/vue'

import ListPageHero from '@/components/page-shell/ListPageHero.vue'

import ListPageMetrics from '@/components/page-shell/ListPageMetrics.vue'

import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

// 入参：页头提示语、概要指标、刷新中状态、未读数、是否可清空（控制按钮可用性）
defineProps({
  pageHint: { type: String, required: true },

  summaryMetrics: { type: Array, required: true },

  loading: { type: Boolean, default: false },

  unreadCount: { type: Number, default: 0 },

  canClear: { type: Boolean, default: false },
})

// 对外事件：刷新列表、全部已读、清空全部通知
const emit = defineEmits(['reload', 'mark-all-read', 'clear-all'])
</script>

<template>
  <ListPageHero :title="'通知中心'" :hint="pageHint" tone="pink">
    <template #icon>
      <Bell class="w-5 h-5" />
    </template>

    <template #aside>
      <router-link :to="SETTINGS_ROUTES.alerts()" class="list-page__link-btn">
        {{ '告警规则' }}
      </router-link>

      <router-link :to="SETTINGS_ROUTES.alerts('dnd')" class="list-page__link-btn">
        {{ '免打扰' }}
      </router-link>

      <button
        type="button"
        class="list-page__link-btn"
        :disabled="unreadCount === 0"
        @click="emit('mark-all-read')"
      >
        {{ '全部已读' }}
      </button>

      <button
        type="button"
        class="list-page__link-btn notifications-view__clear-btn"
        :disabled="!canClear"
        @click="emit('clear-all')"
      >
        {{ '清空' }}
      </button>

      <button
        type="button"
        class="list-page__btn list-page__btn--primary"
        :disabled="loading"
        @click="emit('reload')"
      >
        {{ loading ? '刷新中…' : '刷新' }}
      </button>
    </template>

    <template #stats>
      <ListPageMetrics :cells="summaryMetrics" />
    </template>
  </ListPageHero>
</template>
