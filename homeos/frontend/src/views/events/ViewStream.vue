<!--
组件：EventsViewStream.vue
所属模块：frontend / src / views
职责：事件历史页「事件流」子视图——卡片化展示实体状态变更事件，含降级横幅、
      空态、加载/错误态与上下页分页。
数据来源：
  - 事件列表来自父级透传 props.events（由后端分页接口返回）；
  - HA 连接降级状态来自 useHaDegrade + useEntitiesStore（重连/断连/过期标志）。
Props：
  - loading / clearing / error：列表加载中、清除中、错误文案。
  - isAdmin：是否管理员，控制「清除记录」按钮显隐。
  - events：当前页事件数组；entityFilter / domainFilter 当前筛选条件。
  - resultSummary / page / totalPages / total：结果摘要与分页信息。
  - entityDisplayName / hasFriendlyName / formatCount：实体显示相关函数。
Emits：
  - clear-all：管理员清除全部记录。
  - retry：加载失败后重试。
  - clear-filter / clear-domain-filter：清空实体/域筛选。
  - go-page：跳转到指定页码。
关键交互：
  - 卡片点击跳转到设备详情；降级时优先展示 HaDegradeBanner 区分「离线」与「无事件」；
  - 分页器在 totalPages > 1 时显示。
-->
<script setup>
/**
 * 职责：渲染 views/ViewStream 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import ApiQueryState from '@/components/common/ApiQueryState.vue'
import HaDegradeBanner from '@/components/common/HaDegradeBanner.vue'
import VEmptyState from '@/components/common/base/VEmptyState.vue'
import { formatDetailedDateTimeOrDash } from '@/utils/format/locale-format.util'
import { getDomainLabel } from '@/utils/device/domain-labels.util'
import { displayEventState, entityDomain, entityObjectId } from '@/utils/events/events-display.util'
import { displayEntityStateLabel } from '@/constants/entity-state-labels'
import { useEntitiesStore } from '@/stores/entities.store'
import { useHaDegrade } from '@/composables/ui/useHaDegrade'

defineProps({
  loading: { type: Boolean, default: false },
  clearing: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  error: { type: String, default: '' },
  events: { type: Array, required: true },
  entityFilter: { type: String, default: '' },
  domainFilter: { type: String, default: '' },
  resultSummary: { type: String, required: true },
  page: { type: Number, required: true },
  totalPages: { type: Number, required: true },
  total: { type: Number, required: true },
  entityDisplayName: { type: Function, required: true },
  hasFriendlyName: { type: Function, required: true },
  formatCount: { type: Function, required: true },
})

const emit = defineEmits(['clear-all', 'retry', 'clear-filter', 'clear-domain-filter', 'go-page'])

const entitiesStore = useEntitiesStore()

/** HA 连接降级：断连/重连/数据过期时展示横幅，与「暂无事件」空态区分 */
const { connectionDegraded, retryHaConnection } = useHaDegrade()

const degradeText = computed(() => {
  if (entitiesStore.reconnecting) return '正在重新连接 Home Assistant，事件流可能无法实时刷新'
  if (!entitiesStore.connected) return 'HA 已断连，事件列表来自最后缓存；恢复连接后请刷新页面'
  if (entitiesStore.entitiesStale) return '实体数据可能已过期，事件流可能不是最新状态'
  return '部分数据源不可用'
})
</script>

<template>
  <section class="events-view__stream">
    <div class="events-view__stream-glow" aria-hidden="true" />

    <header class="events-view__stream-head">
      <div>
        <h2 class="events-view__stream-title">变更事件流</h2>
        <p class="events-view__stream-sub">
          {{ resultSummary }} · 第 {{ page }}/{{ totalPages }} 页
        </p>
      </div>
      <button
        v-if="isAdmin"
        type="button"
        class="list-page__link-btn events-view__clear-btn"
        :disabled="loading || clearing"
        @click="emit('clear-all')"
      >
        {{ clearing ? '清除中…' : '清除记录' }}
      </button>
    </header>

    <!-- HA 连接降级横幅：区分「离线/重连」与「无事件」 -->
    <HaDegradeBanner
      v-if="connectionDegraded"
      class="shrink-0"
      title="事件数据降级"
      :text="degradeText"
      @retry="retryHaConnection"
    />

    <div class="events-view__stream-body">
      <ApiQueryState
        :loading="loading"
        :error="error"
        tone="indigo"
        error-title="事件加载失败"
        @retry="emit('retry')"
      >
        <div v-if="events.length" class="events-view__cards">
          <article
            v-for="evt in events"
            :key="evt.id"
            class="events-view__card"
            :data-domain="entityDomain(evt.entityId)"
          >
            <div class="events-view__card-accent" aria-hidden="true" />

            <div class="events-view__card-main">
              <div class="events-view__card-top">
                <div class="events-view__card-identity">
                  <span
                    class="events-view__card-name"
                    :class="!hasFriendlyName(evt.entityId) && 'events-view__card-name--fallback'"
                    :title="entityDisplayName(evt.entityId)"
                  >
                    {{ entityDisplayName(evt.entityId) }}
                  </span>
                  <router-link
                    :to="`/device?id=${encodeURIComponent(evt.entityId)}`"
                    class="events-view__card-entity"
                    :title="evt.entityId"
                  >
                    <span class="list-page__domain" :data-domain="entityDomain(evt.entityId)">
                      {{ getDomainLabel(entityDomain(evt.entityId)) }}
                    </span>
                    <span class="events-view__card-entity-id">{{
                      entityObjectId(evt.entityId)
                    }}</span>
                  </router-link>
                </div>
                <time
                  class="events-view__card-time"
                  :title="formatDetailedDateTimeOrDash(evt.createdAt)"
                >
                  {{ formatDetailedDateTimeOrDash(evt.createdAt) }}
                </time>
              </div>

              <div class="events-view__card-states">
                <code
                  v-if="evt.attrText || evt.state"
                  class="events-view__state events-view__state--new"
                >
                  {{ displayEventState(evt) }}
                </code>
                <code v-if="evt.attrText" class="events-view__state events-view__state--old"
                  >属性变更</code
                >
                <code v-else-if="evt.oldState" class="events-view__state events-view__state--old">
                  {{ displayEntityStateLabel(evt.entityId, evt.oldState) }}
                </code>
              </div>
            </div>
          </article>
        </div>

        <VEmptyState
          v-else
          tone="indigo"
          :title="entityFilter || domainFilter ? '暂无匹配事件' : '暂无事件'"
          :description="
            entityFilter || domainFilter
              ? '尝试扩大时间范围或清除筛选'
              : '该时间范围内无实体状态变更日志条目'
          "
        >
          <template v-if="entityFilter || domainFilter" #action>
            <button type="button" class="list-page__btn" @click="emit('clear-filter')">
              {{ '清除筛选' }}
            </button>
          </template>
        </VEmptyState>
      </ApiQueryState>
    </div>

    <footer v-if="totalPages > 1" class="events-view__pager">
      <button
        type="button"
        class="list-page__btn"
        :disabled="page <= 1 || loading"
        @click="emit('go-page', page - 1)"
      >
        上一页
      </button>
      <span class="list-page__muted">
        {{ page }} / {{ totalPages }}（共 {{ formatCount(total) }} 条）
      </span>
      <button
        type="button"
        class="list-page__btn"
        :disabled="page >= totalPages || loading"
        @click="emit('go-page', page + 1)"
      >
        下一页
      </button>
    </footer>
  </section>
</template>
