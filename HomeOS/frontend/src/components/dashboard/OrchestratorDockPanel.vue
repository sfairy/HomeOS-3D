<template>
  <!-- 可折叠 Dock 面板：可作 section / footer / aside 等任意 tag 渲染，支持持久化折叠状态 -->
  <component
    :is="tag"
    :class="['wr-dock', collapsed && collapsible && 'wr-dock--collapsed', panelClass]"
  >
    <!-- 折叠状态下的标题栏按钮：点击展开/收起，aria-expanded 反映当前状态 -->
    <button
      v-if="collapsible"
      type="button"
      class="wr-dock__toggle"
      :aria-expanded="!collapsed"
      :aria-label="collapsed ? `展开${title}` : `收起${title}`"
      @click="toggle"
    >
      <ChevronDown :class="['wr-dock__chev', !collapsed && 'wr-dock__chev--open']" />
      <span class="wr-dock__title">{{ title }}</span>
      <span v-if="summary" class="wr-dock__summary">{{ summary }}</span>
      <span class="wr-dock__spacer" />
      <!-- 右侧附加动作插槽（如刷新按钮） -->
      <slot name="toggle-actions" />
    </button>
    <!-- 主体内容：折叠态时隐藏 -->
    <div v-show="!collapsible || !collapsed" class="wr-dock__body">
      <slot />
    </div>
  </component>
</template>

<script setup>
/**
 * OrchestratorDockPanel.vue
 *
 * 所属模块：dashboard / Orchestrator（联动编排器）
 * 职责：通用可折叠 Dock 面板容器。支持自定义标签（section/footer/aside 等），
 *      折叠状态通过 useOrchestratorDockCollapse 持久化到 localStorage。
 * 依赖：vue、@lucide/vue（ChevronDown 图标）、useOrchestratorDockCollapse 组合式函数。
 */
import { computed, watch } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { useOrchestratorDockCollapse } from '@/composables/orchestrator/useOrchestratorDockCollapse'

/**
 * 组件 Props
 * @property {string}   title            - 面板标题（用于 aria-label 与显示）
 * @property {string}   summary          - 摘要文案（折叠时展示）
 * @property {boolean}  collapsible      - 是否允许折叠
 * @property {boolean}  defaultCollapsed - 默认是否折叠（仅在无 storageKey 时生效）
 * @property {string}   storageKey       - 折叠状态持久化的 localStorage 键
 * @property {string}   tag              - 渲染的 HTML 标签（默认 div）
 * @property {string|string[]|object} panelClass - 追加到根容器的 class
 */
const props = defineProps({
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  collapsible: { type: Boolean, default: false },
  defaultCollapsed: { type: Boolean, default: false },
  storageKey: { type: String, default: '' },
  tag: { type: String, default: 'div' },
  panelClass: { type: [String, Array, Object], default: '' },
})

// 仅取一次 storageKey 作为持久化键；空字符串视为不持久化
const storageKeyRef = computed(() => props.storageKey || null)
const { collapsed, toggle, setCollapsed } = useOrchestratorDockCollapse(
  storageKeyRef.value,
  props.defaultCollapsed,
)

// 当无 storageKey 时，defaultCollapsed 变化也要同步给 collapsed（受控模式）
watch(
  () => props.defaultCollapsed,
  (value) => {
    if (!props.storageKey) setCollapsed(value)
  },
)

// 暴露给父组件：可外部读取/控制折叠状态
defineExpose({ collapsed, toggle })
</script>