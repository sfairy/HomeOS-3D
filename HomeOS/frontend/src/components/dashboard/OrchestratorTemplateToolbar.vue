<template>
  <!-- OrchestratorTemplateToolbar 模板库工具栏：搜索框和标签筛选 -->
  <div class="wr-tpl-toolbar">
    <div class="wr-tpl-search">
      <Search class="wr-tpl-search__icon" aria-hidden="true" />
      <input
        ref="inputRef"
        :value="query"
        type="search"
        class="wr-tpl-search__input"
        :placeholder="searchPlaceholder"
        autocomplete="off"
        spellcheck="false"
        @input="onInput"
        @keydown.esc.prevent="$emit('clear-query')"
      />
      <button
        v-if="query"
        type="button"
        class="wr-tpl-search__clear"
        aria-label="清除搜索"
        @click="$emit('clear-query')"
      >
        ×
      </button>
    </div>
    <div v-if="filterTags.length" class="wr-tpl-filters">
      <button
        type="button"
        class="wr-tpl-filter"
        :class="{ 'wr-tpl-filter--active': !activeTag }"
        @click="$emit('update:activeTag', '')"
      >
        全部
      </button>
      <button
        v-for="tag in filterTags"
        :key="tag"
        type="button"
        class="wr-tpl-filter"
        :class="{ 'wr-tpl-filter--active': activeTag === tag }"
        @click="$emit('update:activeTag', tag)"
      >
        {{ tag }}
      </button>
    </div>
    <div v-if="resultMeta" class="wr-tpl-meta">{{ resultMeta }}</div>
  </div>
</template>

<script setup>
/**
 * OrchestratorTemplateToolbar - 模板库工具栏组件
 * 功能特性：
 * - 搜索输入框
 * - 标签筛选
 * - 显示结果数量
 * - 清除搜索
 * 依赖：vue、@lucide/vue（Search 图标）。
 */
import { ref } from 'vue'
import { Search } from '@lucide/vue'

/**
 * 组件 Props
 * @property {string}   query           - 当前搜索关键词（v-model 双向绑定）
 * @property {string}   activeTag       - 当前激活的筛选标签
 * @property {string[]} filterTags      - 可选的筛选标签列表
 * @property {string}   resultMeta      - 结果数量文案
 * @property {string}   searchPlaceholder - 搜索框 placeholder
 */
defineProps({
  query: { type: String, default: '' },
  activeTag: { type: String, default: '' },
  filterTags: { type: Array, default: () => [] },
  resultMeta: { type: String, default: '' },
  searchPlaceholder: { type: String, default: '搜索模板名称、描述或标签…' },
})

/**
 * 组件事件
 * - update:query：搜索关键词变化
 * - update:activeTag：筛选标签变化
 * - clear-query：清除搜索
 */
const emit = defineEmits(['update:query', 'update:activeTag', 'clear-query'])

const inputRef = ref(null)

/** 搜索输入事件：将 input value 通过 update:query 向父级 emit */
function onInput(event) {
  emit('update:query', event.target.value)
}

// 暴露给父组件：聚焦搜索框
defineExpose({
  focus() {
    inputRef.value?.focus()
  },
})
</script>
