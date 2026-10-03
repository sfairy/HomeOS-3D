<template>
  <!-- OrchestratorTemplateLibrary 模板库：展示和管理自动化/场景模板，支持搜索和标签筛选 -->
  <OrchestratorTemplatePanel
    v-if="hasTemplates"
    :title="title"
    :count-label="countLabel"
    :storage-key="storageKey"
    :collapsible="collapsible"
    :default-collapsed="defaultCollapsed"
    panel-class="wr-tpl-panel--library"
    @expanded="$emit('expanded')"
  >
    <OrchestratorTemplateToolbar
      ref="toolbarRef"
      :query="query"
      :active-tag="activeTag"
      :filter-tags="filterTags"
      :result-meta="resultMeta"
      :search-placeholder="searchPlaceholder"
      @update:query="query = $event"
      @update:active-tag="activeTag = $event"
      @clear-query="clearQuery"
    />
    <!-- 模板列表：流式布局，紧凑模式 -->
    <div class="wr-tpl-list wr-tpl-list--flow wr-tpl-list--compact">
      <template v-for="group in groupedResults" :key="group.id">
        <div v-if="group.label" class="wr-tpl-group-head">{{ group.label }}</div>
        <OrchestratorTemplateItem
          v-for="tpl in group.templates"
          :key="`${group.id}-${tpl.id}`"
          compact
          :name="tpl.name"
          :description="tpl.description"
          :tags="tpl.tags"
          :domains="tpl.domains"
          :source-label="showSourceLabel ? tpl._groupLabel : ''"
          :placeholder-count="tpl.placeholderCount"
          :disabled="isInstalling(tpl)"
          :action-label="tpl._actionLabel || actionLabel"
          @install="$emit('install', tpl)"
        />
      </template>
      <!-- 空状态提示 -->
      <p v-if="!filteredTemplates.length" class="wr-tpl-empty">
        {{ emptyText }}
      </p>
    </div>
  </OrchestratorTemplatePanel>
</template>

<script setup>
/**
 * OrchestratorTemplateLibrary - 联动器模板库组件
 * 功能特性：
 * - 展示模板库列表，支持分组显示
 * - 支持关键词搜索和标签筛选
 * - 支持模板安装
 * - 可折叠面板
 * - 记忆折叠状态到 localStorage
 * 依赖：
 * - useTemplateLibraryFilter: 模板筛选逻辑
 */
import { computed, ref, toRef, watch } from 'vue'
import OrchestratorTemplateItem from '@/components/dashboard/OrchestratorTemplateItem.vue'
import OrchestratorTemplatePanel from '@/components/dashboard/OrchestratorTemplatePanel.vue'
import OrchestratorTemplateToolbar from '@/components/dashboard/OrchestratorTemplateToolbar.vue'
import { useTemplateLibraryFilter } from '@/composables/orchestrator/useTemplateLibraryFilter'
import { isOrchestratorTemplateInstalling } from '@/utils/orchestrator/template-installing.util'

/** 组件 Props 定义 */
const props = defineProps({
  /** 面板标题 */
  title: { type: String, default: '模板库' },
  /** 模板数组 */
  templates: { type: Array, default: () => [] },
  /** 模板分组配置 */
  groups: { type: Array, default: undefined },
  /** 正在安装的模板 ID */
  installingId: { type: String, default: null },
  /** 正在安装的二级模板 ID（如 blueprint filename） */
  installingSecondaryId: { type: String, default: null },
  /** 操作按钮文本 */
  actionLabel: { type: String, default: '安装' },
  /** 面板是否可折叠 */
  collapsible: { type: Boolean, default: true },
  /** 默认是否折叠 */
  defaultCollapsed: { type: Boolean, default: true },
  /** localStorage 存储 key，用于记忆折叠状态 */
  storageKey: { type: String, default: 'homeos_orch_tpl_library' },
  /** 搜索框 placeholder */
  searchPlaceholder: { type: String, default: '搜索模板名称、描述或标签…' },
})

defineEmits(['install', 'expanded'])

const toolbarRef = ref(null)

const templatesRef = toRef(props, 'templates')
const groupsRef = toRef(props, 'groups')

const {
  query,
  activeTag,
  filterTags,
  filteredTemplates,
  groupedResults,
  resultMeta,
  clearQuery,
  resetFilters,
} = useTemplateLibraryFilter(templatesRef, groupsRef)

watch(
  () => props.storageKey,
  () => resetFilters(),
)

/** 是否有可用模板 */
const hasTemplates = computed(() => {
  if (props.groups?.length) {
    return props.groups.some((g) => g.templates?.length)
  }
  return (props.templates?.length ?? 0) > 0
})

/** 结果数量标签文本 */
const countLabel = computed(() => resultMeta.value || '')

/** 是否显示来源标签（搜索且有多分组时） */
const showSourceLabel = computed(
  () => Boolean(query.value.trim()) && (props.groups?.length ?? 0) > 1,
)

/** 空状态文本（根据是否有搜索条件变化） */
const emptyText = computed(() => {
  if (query.value.trim() || activeTag.value) return '没有匹配的模板，试试其他关键词或标签'
  return '没有匹配该标签的模板'
})

/** 判断模板是否正在安装中（支持 blueprint 等特殊分组；两侧非空才匹配，避免 '' === ''） */
function isInstalling(tpl) {
  return isOrchestratorTemplateInstalling(tpl, {
    installingId: props.installingId,
    installingSecondaryId: props.installingSecondaryId,
  })
}

// 暴露方法给父组件调用
defineExpose({
  /** 聚焦搜索框 */
  focusSearch() {
    toolbarRef.value?.focus()
  },
})
</script>
