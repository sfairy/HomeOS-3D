<!--
组件：SecurityAuditLogPanel.vue
所属模块：frontend / src / views / security
职责：安防「审计日志」面板。按筛选维度展示安全事件流，支持分页与刷新；
      支持 embedded 模式嵌入其它面板（隐藏头部并改用紧凑刷新按钮）。
关键依赖：
  - useFixedPagePagination composable：固定页容量的分页切片逻辑
  - securityEventCssKey：将事件 css 标记转换为样式后缀
  - ApiQueryState / VEmptyState：加载/错误/空态展示
数据来源：父级透传的 displayedSecEvents（已筛选事件）、secEventFilters / secEventIconMap
-->
<template>
  <section
    :class="[
      'sec-dash-panel',
      'hos-panel',
      embedded ? 'hos-panel--flat' : 'hos-panel--default',
      'sec-dash-panel--audit',
      embedded && 'sec-dash-panel--audit-embed',
    ]"
  >
    <header v-if="!embedded" class="sec-dash-panel-head">
      <div class="sec-dash-panel-title">
        <Bell class="w-4 h-4 opacity-50" />
        <span>{{ '审计日志' }}</span>
        <span class="sec-dash-badge">{{ displayedSecEvents.length }}</span>
      </div>
      <button
        type="button"
        class="sec-dash-icon-btn"
        :disabled="secAuditLoading"
        :aria-label="secAuditLoading ? '刷新中' : '刷新审计日志'"
        @click="$emit('refresh')"
      >
        <RefreshCw :class="['w-3.5 h-3.5', secAuditLoading && 'animate-spin']" />
      </button>
    </header>

    <div :class="['sec-dash-audit-filters', embedded && 'sec-dash-audit-filters--embed']">
      <button
        v-if="secEventFilter?.startsWith('zone:')"
        type="button"
        class="sec-dash-tool sec-dash-tool--clear"
        @click="secEventFilter = 'all'"
      >
        {{ '全部' }}
      </button>
      <button
        v-for="f in secEventFilters"
        :key="f.key"
        type="button"
        :class="['sec-dash-tool', secEventFilter === f.key && 'sec-dash-tool--on']"
        @click="secEventFilter = f.key"
      >
        {{ f.label }}
      </button>
      <button
        v-if="embedded"
        type="button"
        class="sec-dash-icon-btn sec-dash-audit-filters__refresh"
        :disabled="secAuditLoading"
        :aria-label="secAuditLoading ? '刷新中' : '刷新'"
        @click="$emit('refresh')"
      >
        <RefreshCw :class="['w-3.5 h-3.5', secAuditLoading && 'animate-spin']" />
      </button>
    </div>

    <div class="sec-dash-audit-scroll">
      <ApiQueryState
        :loading="secAuditLoading"
        :error="secAuditError"
        tone="neutral"
        error-title="审计日志加载失败"
        @retry="$emit('refresh')"
      >
        <div class="sec-dash-audit-fill">
          <VEmptyState
            v-if="displayedSecEvents.length === 0"
            icon=""
            compact
            tone="neutral"
            :title="'暂无记录'"
          />
          <ul
            v-else
            class="sec-dash-audit-list sec-dash-audit-list--paged"
            :style="pagedListStyle"
          >
            <li
              v-for="evt in pagedEvents"
              :key="evt.id"
              :class="[
                'sec-dash-audit-item',
                evt.css && `sec-event-item--${securityEventCssKey(evt.css)}`,
              ]"
            >
              <component
                :is="evt.icon || secEventIconMap[evt.iconKey] || Bell"
                class="w-3.5 h-3.5 shrink-0 opacity-70"
              />
              <span class="sec-dash-audit-text" :title="evt.label">{{ evt.label }}</span>
              <time class="sec-dash-audit-time">{{ evt.time }}</time>
            </li>
          </ul>
        </div>
      </ApiQueryState>
    </div>

    <footer v-if="!secAuditLoading && auditTotalPages > 1" class="sec-dash-audit-pager">
      <button type="button" class="list-page__btn" :disabled="!auditCanPrev" @click="auditPrevPage">
        {{ '上一页' }}
      </button>
      <span class="list-page__muted">
        {{ auditPageLabel }}（共 {{ displayedSecEvents.length }} 条）
      </span>
      <button type="button" class="list-page__btn" :disabled="!auditCanNext" @click="auditNextPage">
        {{ '下一页' }}
      </button>
    </footer>
  </section>
</template>

<script setup>
import { computed, watch } from 'vue'
import { Bell, RefreshCw } from '@lucide/vue'
import { securityEventCssKey } from '@/utils/security/event-display.util'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import { useFixedPagePagination } from '@/composables/ui/hub-viewport.internals'

// 单页固定展示的事件条数；同时用于 CSS 网格行高均分
const AUDIT_PAGE_SIZE = 8
// 列表行间距，配合 CSS 变量 --audit-row-gap 实现固定行高布局
const AUDIT_ROW_GAP = 6

// 入参：是否嵌入模式、待展示事件、加载/错误态、筛选选项与图标映射
const props = defineProps({
  embedded: Boolean,
  displayedSecEvents: { type: Array, default: () => [] },
  secAuditLoading: Boolean,
  secAuditError: { type: String, default: '' },
  secEventFilters: { type: Array, default: () => [] },
  secEventIconMap: { type: Object, default: () => ({}) },
})

// 双向绑定：当前事件筛选维度（all / zone:* / linkage 等）
const secEventFilter = defineModel('secEventFilter', { type: String, default: 'all' })

// 对外事件：请求父级重新拉取审计日志
defineEmits(['refresh'])

const auditCount = computed(() => props.displayedSecEvents.length)

// 复用通用分页 composable，避免重写上一页/下一页/页码计算逻辑
const {
  totalPages: auditTotalPages,
  canPrev: auditCanPrev,
  canNext: auditCanNext,
  pageLabel: auditPageLabel,
  prevPage: auditPrevPage,
  nextPage: auditNextPage,
  resetPage: auditResetPage,
  sliceItems: sliceAuditEvents,
} = useFixedPagePagination({
  itemCount: auditCount,
  perPage: AUDIT_PAGE_SIZE,
})

const pagedEvents = computed(() => sliceAuditEvents(props.displayedSecEvents))

const pagedListStyle = computed(() => ({
  // 固定按页容量均分行高；条目不足时留在顶部，避免 1 条被 1fr 拉满整块居中
  '--audit-rows': String(AUDIT_PAGE_SIZE),
  '--audit-row-gap': `${AUDIT_ROW_GAP}px`,
}))

// 切换筛选维度后回到第一页，避免停留在不存在的页码
watch(secEventFilter, () => auditResetPage())
</script>

<style scoped src="./styles/AuditLogPanel.css"></style>
