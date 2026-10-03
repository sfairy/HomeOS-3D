<!--
  @file DeviceAttrsPanel.vue
  @module 设备详情/实体属性面板
  @description 设备详情「属性」页：全量搜索过滤 + 分页展示（默认 40 条）。
-->
<template>
  <div class="device-detail-tab device-attrs-tab">
    <div
      class="dev-card premium-glass-surface premium-glass-surface--elevated premium-backdrop device-detail-tab__card device-attrs-tab__card"
    >
      <div class="dev-card__header device-attrs-tab__header">
        <div class="dev-card__title-row">
          <FileJson class="w-4 h-4 dap-icon-warn" />
          <span class="dev-card__title">{{ '实体属性' }}</span>
          <span class="device-attrs-tab__count">{{ countLabel }}</span>
          <span v-if="hasMore" class="device-attrs-tab__hint">{{
            `已显示 ${visibleEntries.length} / ${filteredEntries.length}`
          }}</span>
        </div>
        <div class="device-attrs-tab__search-wrap">
          <Search class="device-attrs-tab__search-icon w-3.5 h-3.5" />
          <input
            v-model="query"
            type="search"
            class="device-attrs-tab__search"
            :placeholder="'搜索名称、key 或值…'"
          />
        </div>
      </div>

      <div class="device-attrs-tab__scroll">
        <div v-if="visibleEntries.length" class="device-attrs-tab__list">
          <div v-for="row in visibleEntries" :key="row.key" class="device-attrs-tab__row">
            <div class="device-attrs-tab__meta">
              <span class="device-attrs-tab__key-zh">{{ labelFor(row.key).primary }}</span>
              <code
                v-if="labelFor(row.key).secondary"
                class="device-attrs-tab__key-en"
                :title="row.key"
                >{{ labelFor(row.key).secondary }}</code
              >
            </div>
            <div class="device-attrs-tab__val">
              <pre v-if="row.isObject" class="device-attrs-tab__json">{{ row.value }}</pre>
              <div v-else-if="row.chips?.length" class="device-attrs-tab__chips">
                <span
                  v-for="(chip, i) in row.chips"
                  :key="`${row.key}-${i}`"
                  class="device-attrs-tab__chip"
                  >{{ chip }}</span
                >
              </div>
              <span v-else class="device-attrs-tab__text">{{ row.value }}</span>
            </div>
          </div>
        </div>
        <div v-else class="dev-state-block device-detail-tab__fallback">{{
          query.trim() ? '无匹配属性' : '暂无属性'
        }}</div>
        <button
          v-if="hasMore"
          type="button"
          class="device-attrs-tab__more"
          @click="pageSize += PAGE_STEP"
        >
          {{ `加载更多（剩余 ${filteredEntries.length - visibleEntries.length}）` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FileJson, Search } from '@lucide/vue'
import {
  formatEntityAttrLabel,
  matchesEntityAttrSearch,
} from '@/utils/device/entity-attr-labels.util'

type DeviceAttrEntry = {
  key: string
  value: string
  isObject: boolean
  chips?: string[]
}

const PAGE_STEP = 40

const props = defineProps<{
  entries: DeviceAttrEntry[]
  totalCount: number
}>()

const query = ref('')
const pageSize = ref(PAGE_STEP)

watch(query, () => {
  pageSize.value = PAGE_STEP
})

function labelFor(key: string) {
  return formatEntityAttrLabel(key)
}

const filteredEntries = computed(() => {
  const q = query.value.trim()
  if (!q) return props.entries
  return props.entries.filter((e) => matchesEntityAttrSearch(e.key, e.value, q))
})

const visibleEntries = computed(() => filteredEntries.value.slice(0, pageSize.value))

const hasMore = computed(() => visibleEntries.value.length < filteredEntries.value.length)

const countLabel = computed(() => {
  const filtered = filteredEntries.value.length
  const total = props.entries.length || props.totalCount
  if (query.value.trim()) return `${filtered} / ${total}`
  return `${filtered} 项`
})
</script>

<style scoped>
.dap-icon-warn {
  color: var(--set-warn, #fcd34d);
}

.device-attrs-tab__more {
  display: block;
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--set-border, #334155) 80%, transparent);
  background: color-mix(in srgb, var(--set-surface, #1e293b) 70%, transparent);
  color: var(--set-muted, #94a3b8);
  font-size: 0.75rem;
  cursor: pointer;
}

.device-attrs-tab__more:hover {
  color: var(--set-fg, #e2e8f0);
  border-color: color-mix(in srgb, var(--set-accent, #38bdf8) 40%, transparent);
}
</style>
