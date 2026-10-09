<!--
组件：EventsViewHero.vue
所属模块：frontend / src / views
职责：事件历史页顶部「英雄区」——标题、副标题、刷新与跳转按钮、汇总指标条。
数据来源：父级透传 pageHint / stats / summaryMetrics / loading。
Props：
  - pageHint：副标题文案（含时间窗口与总数提示）。
  - stats：后端统计对象，仅在存在时渲染 metrics 条。
  - summaryMetrics：ListPageMetrics 渲染的指标单元格数组。
  - loading：刷新按钮加载态，禁用按钮并显示「刷新中…」。
Emits：
  - reload：点击「刷新」按钮时抛出，由父级重新拉取事件列表。
关键交互：
  - 「记录筛选」跳转到设置→连接→实体页；
  - 「运维诊断」跳转到 SETTINGS_ROUTES.diagnostics()；
  - 「刷新」按钮触发 reload 事件。
-->
<script setup>
/**
 * 职责：渲染 views/ViewHero 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { History } from '@lucide/vue'
import ListPageHero from '@/components/page-shell/ListPageHero.vue'
import ListPageMetrics from '@/components/page-shell/ListPageMetrics.vue'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

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
