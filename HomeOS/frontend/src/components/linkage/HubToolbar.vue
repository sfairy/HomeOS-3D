<template>
  <!-- LinkageHubToolbar 联动中心工具栏：联动中心页面的顶部操作工具栏 -->
  <div class="linkage-hub__toolbar-row">
    <ListPageOrchestratorFilterBar
      class="linkage-hub__filter-bar"
      :search-query="searchQuery"
      :search-placeholder="searchPlaceholder"
      :search-options="searchOptions"
      :source-filter="sourceFilter"
      :placeholder-filter="placeholderFilter"
      :health-filter="healthFilter"
      :enabled-filter="enabledFilter"
      :source-filters="sourceFilters"
      :placeholder-filters="placeholderFilters"
      :health-filters="healthFilters"
      :enabled-filters="enabledFilters"
      :show-enabled-filter="showEnabledFilter"
      :show-source-filter="showSourceFilter"
      :show-placeholder-filter="showPlaceholderFilter"
      @update:search-query="emit('update:searchQuery', $event)"
      @select-search="emit('select-search', $event)"
      @update:source-filter="emit('update:sourceFilter', $event)"
      @update:placeholder-filter="emit('update:placeholderFilter', $event)"
      @update:health-filter="emit('update:healthFilter', $event)"
      @update:enabled-filter="emit('update:enabledFilter', $event)"
    />
    <div class="linkage-hub__toolbar-actions">
      <div
        v-if="showTrackToggle"
        class="linkage-hub__track-toggle"
        role="tablist"
        :aria-label="'数据源'"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="track === 'homeos'"
          class="linkage-hub__track-btn"
          :class="{ 'linkage-hub__track-btn--active': track === 'homeos' }"
          @click="emit('update:track', 'homeos')"
        >
          {{ 'HomeOS' }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="track === 'ha'"
          class="linkage-hub__track-btn"
          :class="{ 'linkage-hub__track-btn--active': track === 'ha' }"
          @click="emit('update:track', 'ha')"
        >
          {{ 'HA' }}
        </button>
      </div>
      <button
        v-if="showDemoImport"
        type="button"
        class="list-page__btn"
        :disabled="importingDemo"
        @click="emit('import-demo')"
      >
        <Loader2 v-if="importingDemo" class="w-4 h-4 animate-spin" />
        {{ '示例' }}
      </button>
      <button
        v-if="showCreate"
        type="button"
        class="list-page__btn list-page__btn--primary linkage-hub__create-btn"
        @click="emit('create')"
      >
        <Plus class="w-4 h-4" />
        {{ createLabel }}
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * LinkageHubToolbar - 联动中心工具栏组件
 * 功能特性：
 * - 新建按钮
 * - 筛选/搜索
 * - 视图切换
 * - 用于联动中心页面顶部
 */
import { Plus, Loader2 } from '@lucide/vue'
import ListPageOrchestratorFilterBar from '@/components/common/list-page/ListPageOrchestratorFilterBar.vue'

defineProps({
  searchQuery: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '搜索…' },
  searchOptions: { type: Array, default: () => [] },
  sourceFilter: { type: String, default: 'all' },
  placeholderFilter: { type: String, default: 'all' },
  healthFilter: { type: String, default: 'all' },
  enabledFilter: { type: String, default: 'all' },
  sourceFilters: { type: Array, default: () => [] },
  placeholderFilters: { type: Array, default: () => [] },
  healthFilters: { type: Array, default: () => [] },
  enabledFilters: { type: Array, default: () => [] },
  showEnabledFilter: { type: Boolean, default: false },
  showSourceFilter: { type: Boolean, default: true },
  showPlaceholderFilter: { type: Boolean, default: true },
  track: { type: String, default: 'homeos' },
  showTrackToggle: { type: Boolean, default: true },
  showDemoImport: { type: Boolean, default: false },
  importingDemo: { type: Boolean, default: false },
  createLabel: { type: String, default: '新建' },
  showCreate: { type: Boolean, default: true },
})

const emit = defineEmits([
  'update:searchQuery',
  'select-search',
  'update:sourceFilter',
  'update:placeholderFilter',
  'update:healthFilter',
  'update:enabledFilter',
  'update:track',
  'create',
  'import-demo',
])
</script>
