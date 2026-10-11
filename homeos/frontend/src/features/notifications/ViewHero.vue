<!--
  通知中心页头（Hero）。展示标题、概要指标，以及「告警规则 / 免打扰 /
  全部已读 / 清空 / 刷新」等操作入口，未读数与可清空状态控制按钮可用性。
-->
<script setup>
import { Bell } from '@lucide/vue'

import ListPageHero from '@/components/page-shell/ListPageHero.vue'

import ListPageMetrics from '@/components/page-shell/ListPageMetrics.vue'

import { SETTINGS_ROUTES } from '@/shared/utils/registry/settings-route.util'

defineProps({
  pageHint: { type: String, required: true },

  summaryMetrics: { type: Array, required: true },

  loading: { type: Boolean, default: false },

  unreadCount: { type: Number, default: 0 },

  canClear: { type: Boolean, default: false },
})

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
