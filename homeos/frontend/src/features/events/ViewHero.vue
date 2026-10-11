<!--
  事件历史页顶部「英雄区」——标题、副标题、刷新与跳转按钮、汇总指标条。
-->
<script setup>
import { History } from '@lucide/vue'
import ListPageHero from '@/components/page-shell/ListPageHero.vue'
import ListPageMetrics from '@/components/page-shell/ListPageMetrics.vue'
import { SETTINGS_ROUTES } from '@/shared/utils/registry/settings-route.util'

defineProps({
  pageHint: { type: String, required: true },
  stats: { type: [Object, null], default: null },
  summaryMetrics: { type: Array, required: true },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['reload'])
</script>

<template>
  <ListPageHero :title="'事件历史'" :hint="pageHint" tone="cyan">
    <template #icon>
      <History class="w-5 h-5" />
    </template>
    <template #aside>
      <router-link
        :to="{ path: '/settings', query: { tab: 'connection', section: 'entities' } }"
        class="list-page__link-btn"
      >
        {{ '记录筛选' }}
      </router-link>
      <router-link :to="SETTINGS_ROUTES.diagnostics()" class="list-page__link-btn">
        {{ '运维诊断' }}
      </router-link>
      <button
        type="button"
        class="list-page__btn list-page__btn--primary"
        :disabled="loading"
        @click="emit('reload')"
      >
        {{ loading ? '刷新中…' : '刷新' }}
      </button>
    </template>
    <template v-if="stats" #stats>
      <ListPageMetrics :cells="summaryMetrics" />
    </template>
  </ListPageHero>
</template>
