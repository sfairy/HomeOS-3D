<!--
  组件文件：ListPageOrchestratorFilterBar.vue
  所属模块：frontend/src/components/common/list-page
  组件职责：编排器列表页顶部分段筛选工具条。左侧 SearchableSelect 搜索框（关键词与下拉选项），
    右侧按启用/来源/占位符（实体）/同步状态四组分段按钮，每组展示可选列表与激活高亮；
    各筛选变化后通过 v-model 风格事件直接回写父级对应状态。
  主要 props / emits：
    - props.searchQuery/searchPlaceholder/searchOptions：搜索绑定与候选；
      props.sourceFilter/placeholderFilter/healthFilter/enabledFilter：四个筛选当前值；
      props.sourceFilters/placeholderFilters/healthFilters/enabledFilters：四组可选（key/label 数组）；
      props.showEnabledFilter/showSourceFilter/showPlaceholderFilter：显隐开关。
    - emits：update:searchQuery（搜索更新）、select-search（搜索下拉选中）、
      update:sourceFilter / update:placeholderFilter / update:healthFilter / update:enabledFilter。
  依赖关系：common/base/SearchableSelect 搜索选择组件；无额外 stores 或 composables。
-->
<template>
  <div class="list-page__filter-toolbar">
    <div class="list-page__search-wrap list-page__filter-toolbar-search">
      <SearchableSelect
        :model-value="searchQuery"
        variant="list-page"
        :options="searchOptions"
        :placeholder="searchPlaceholder"
        :empty-text="'无匹配项'"
        :clear-aria="'清除搜索'"
        :toggle-aria="'展开列表'"
        @update:model-value="emit('update:searchQuery', $event)"
        @select="emit('select-search', $event)"
      />
    </div>

    <div v-if="showEnabledFilter" class="list-page__filter-group">
      <span class="list-page__filter-group-label">{{ '启用' }}</span>
      <div class="list-page__filter-segment" role="group" :aria-label="'启用状态'">
        <button
          v-for="f in enabledFilters"
          :key="f.key"
          type="button"
          class="list-page__segment-btn"
          :class="segmentClass(enabledFilter, f.key)"
          :aria-pressed="enabledFilter === f.key"
          @click="setEnabledFilter(f.key)"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <div v-if="showSourceFilter" class="list-page__filter-group">
      <span class="list-page__filter-group-label">{{ '来源' }}</span>
      <div class="list-page__filter-segment" role="group" :aria-label="'来源'">
        <button
          v-for="f in sourceFilters"
          :key="f.key"
          type="button"
          class="list-page__segment-btn"
          :class="segmentClass(sourceFilter, f.key)"
          :aria-pressed="sourceFilter === f.key"
          @click="setSourceFilter(f.key)"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <div v-if="showPlaceholderFilter" class="list-page__filter-group">
      <span class="list-page__filter-group-label">{{ '实体' }}</span>
      <div class="list-page__filter-segment" role="group" :aria-label="'占位符'">
        <button
          v-for="f in placeholderFilters"
          :key="f.key"
          type="button"
          class="list-page__segment-btn"
          :class="segmentClass(placeholderFilter, f.key)"
          :aria-pressed="placeholderFilter === f.key"
          @click="setPlaceholderFilter(f.key)"
        >
          {{ f.label }}
        </button>
      </div>
    </div>

    <div class="list-page__filter-group">
      <span class="list-page__filter-group-label">{{ '状态' }}</span>
      <div class="list-page__filter-segment" role="group" :aria-label="'同步状态'">
        <button
          v-for="f in healthFilters"
          :key="f.key"
          type="button"
          class="list-page__segment-btn"
          :class="segmentClass(healthFilter, f.key)"
          :aria-pressed="healthFilter === f.key"
          @click="setHealthFilter(f.key)"
        >
          {{ f.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * @file ListPageOrchestratorFilterBar.vue
 * @module common/list-page
 * @description 编排器列表页的筛选工具条
 *  职责：
 *    - 顶部搜索框（基于 SearchableSelect，支持输入与下拉选择）；
 *    - 多组分段筛选器：来源 / 占位符（实体）/ 同步状态 / 启用状态；
 *    - 通过 v-model 风格事件回写各筛选状态。
 *  依赖：common/base/SearchableSelect。
 */
import SearchableSelect from '@/components/common/base/SearchableSelect.vue'

const props = defineProps({
  /** 搜索关键词（双向绑定） */
  searchQuery: { type: String, default: '' },
  /** 搜索框占位文本 */
  searchPlaceholder: { type: String, default: '' },
  /** 搜索下拉可选项目 */
  searchOptions: { type: Array, default: () => [] },
  /** 当前来源筛选值 */
  sourceFilter: { type: String, default: 'all' },
  /** 当前占位符筛选值 */
  placeholderFilter: { type: String, default: 'all' },
  /** 当前同步状态筛选值 */
  healthFilter: { type: String, default: 'all' },
  /** 当前启用状态筛选值 */
  enabledFilter: { type: String, default: 'all' },
  /** 来源筛选可选项目 */
  sourceFilters: { type: Array, default: () => [] },
  /** 占位符筛选可选项目 */
  placeholderFilters: { type: Array, default: () => [] },
  /** 同步状态筛选可选项目 */
  healthFilters: { type: Array, default: () => [] },
  /** 启用状态筛选可选项目 */
  enabledFilters: { type: Array, default: () => [] },
  /** 是否显示启用状态筛选组 */
  showEnabledFilter: { type: Boolean, default: false },
  /** 是否显示来源筛选组 */
  showSourceFilter: { type: Boolean, default: true },
  /** 是否显示占位符筛选组 */
  showPlaceholderFilter: { type: Boolean, default: true },
})

const emit = defineEmits([
  'update:searchQuery',
  'select-search',
  'update:sourceFilter',
  'update:placeholderFilter',
  'update:healthFilter',
  'update:enabledFilter',
])

/**
 * 生成分段按钮的 class：激活时高亮，非 all 项额外加 accent 样式
 * @param {string} active 当前激活的 key
 * @param {string} key 当前按钮的 key
 * @returns {Object} class 对象
 */
function segmentClass(active, key) {
  return {
    'list-page__segment-btn--on': active === key,
    'list-page__segment-btn--accent': active === key && key !== 'all',
  }
}

/** 切换启用状态筛选：相同值不重复 emit */
function setEnabledFilter(key) {
  if (props.enabledFilter === key) return
  emit('update:enabledFilter', key)
}

/** 切换来源筛选：相同值不重复 emit */
function setSourceFilter(key) {
  if (props.sourceFilter === key) return
  emit('update:sourceFilter', key)
}

/** 切换占位符筛选：相同值不重复 emit */
function setPlaceholderFilter(key) {
  if (props.placeholderFilter === key) return
  emit('update:placeholderFilter', key)
}

/** 切换同步状态筛选：相同值不重复 emit */
function setHealthFilter(key) {
  if (props.healthFilter === key) return
  emit('update:healthFilter', key)
}
</script>
