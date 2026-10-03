<!--
  组件文件：OrchestratorTemplatePanel.vue
  所属模块：frontend/src/components/dashboard
  组件职责：编排器模板库/模板实体的可折叠面板容器。标题行：可折叠按钮带 ChevronDown 箭头、计数摘要标签 countLabel
    与 head-actions 插槽；主体内容由默认 slot 注入。折叠状态通过 useOrchestratorDockCollapse composable
    基于 storageKey 在 localStorage 持久化（刷新后保持用户偏好）。
  主要 props / slots / emits：
    - props.title / countLabel / panelClass：标题、折叠摘要、追加 class。
    - props.collapsible / defaultCollapsed / storageKey：折叠开关、默认折叠、持久化键。
    - slot default：面板主体内容；slot head-actions：标题右侧操作区。
    - emit expanded：从折叠态切换到展开态时触发，便于父级按需懒加载面板内部。
  依赖关系：vue computed/watch；@lucide/vue ChevronDown；composable useOrchestratorDockCollapse。
-->
<template>
  <div
    class="wr-tpl-panel"
    :class="[panelClass, collapsible && collapsed && 'wr-tpl-panel--collapsed']"
  >
    <div v-if="title" class="wr-tpl-panel__head">
      <button
        v-if="collapsible"
        type="button"
        class="wr-tpl-panel__toggle"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? `展开${title}` : `收起${title}`"
        @click="onToggle"
      >
        <ChevronDown :class="['wr-tpl-panel__chev', !collapsed && 'wr-tpl-panel__chev--open']" />
        <span class="wr-tpl-panel__title">{{ title }}</span>
        <span v-if="collapsed && countLabel" class="wr-tpl-panel__summary">{{ countLabel }}</span>
      </button>
      <span v-else class="wr-tpl-panel__title wr-tpl-panel__title--static">{{ title }}</span>
      <div v-if="$slots['head-actions']" class="wr-tpl-panel__actions">
        <slot name="head-actions" />
      </div>
    </div>
    <div v-show="!collapsible || !collapsed" class="wr-tpl-panel__body">
      <slot />
    </div>
  </div>
</template>

<script setup>
/**
 * OrchestratorTemplatePanel.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：模板库/模板实体的可折叠面板容器。展示标题、计数标签、head-actions 插槽，
 *      主体内容由默认插槽注入。折叠状态通过 useOrchestratorDockCollapse 持久化。
 * 依赖：vue、@lucide/vue（ChevronDown）、useOrchestratorDockCollapse。
 */
import { computed, watch } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { useOrchestratorDockCollapse } from '@/composables/orchestrator/useOrchestratorDockCollapse'

/**
 * 组件 Props
 * @property {string}                   title           - 面板标题
 * @property {string}                   countLabel      - 折叠态摘要文案
 * @property {string|string[]|object}    panelClass      - 追加到根容器的 class
 * @property {boolean}                  collapsible      - 是否允许折叠
 * @property {boolean}                  defaultCollapsed - 默认是否折叠（无 storageKey 时生效）
 * @property {string}                   storageKey       - localStorage 持久化键
 */
const props = defineProps({
  title: { type: String, default: '' },
  countLabel: { type: String, default: '' },
  panelClass: { type: [String, Array, Object], default: '' },
  collapsible: { type: Boolean, default: true },
  defaultCollapsed: { type: Boolean, default: true },
  storageKey: { type: String, default: '' },
})

/** 事件：从折叠态展开时触发 expanded */
const emit = defineEmits(['expanded'])

const independent = useOrchestratorDockCollapse(props.storageKey || null, props.defaultCollapsed)

/** 当前是否折叠 */
const collapsed = computed(() => independent.collapsed.value)

/**
 * 切换折叠：从折叠态展开时向父级 emit expanded
 */
function onToggle() {
  const wasCollapsed = collapsed.value
  independent.toggle()
  if (wasCollapsed) emit('expanded')
}

// 无 storageKey 时，defaultCollapsed 变化同步给 collapsed（受控模式）
watch(
  () => props.defaultCollapsed,
  (value) => {
    if (!props.storageKey) independent.setCollapsed(value)
  },
)

defineExpose({
  collapsed,
  toggle: onToggle,
})
</script>
