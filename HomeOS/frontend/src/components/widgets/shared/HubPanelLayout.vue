/**
 * Widget Hub 面板布局组件
 *
 * 所属模块：frontend/widgets/shared
 * 职责：渲染 Hub 容器的标题栏（含图标、Tab 子导航），
 *       通过 useHubTabs 组合式函数管理可见 Tab 列表与当前激活 Tab，
 *       并以具名插槽（默认插槽）将当前激活 Tab 透传给业务子组件。
 * 依赖：
 *   - vue 的 watch（监听 activeTab 变化并抛出 tab-change 事件）
 *   - @/composables/widget/useHubTabs（Tab 状态管理）
 *   - ./WidgetHubHeader.vue（头部视觉组件）
 */
<template>
  <!-- Hub 根容器：包裹头部与业务插槽内容 -->
  <div class="widget-hub-root">
    <!-- 头部组件：双向绑定 activeTab，向下传递标题、主题色与 Tab 列表 -->
    <WidgetHubHeader v-model="activeTab" :title="title" :accent="accent" :tabs="hubTabs">
      <!-- 图标插槽：由父组件传入动态图标组件，颜色随主题色变化 -->
      <template #icon>
        <component :is="iconComponent" class="w-3.5 h-3.5" :style="{ color: accent }" />
      </template>
    </WidgetHubHeader>
    <!-- 默认插槽：将当前激活 Tab 透传给业务子组件 -->
    <slot :active-tab="activeTab" />
  </div>
</template>

<script setup>
/**
 * @file HubPanelLayout.vue
 * @module widgets/shared
 * @description Hub 面板通用外壳布局：复用 WidgetHubHeader 头部 + 插槽内容区，
 *              通过 useHubTabs 维护 tab 持久化与切换，供各业务 Hub 面板复用。
 * @dependencies
 *  - vue: watch 监听
 *  - @/composables/widget/useHubTabs: Hub tab 持久化 composable
 *  - ./WidgetHubHeader.vue: 通用 Hub 头部
 */
import { watch } from 'vue'
import { useHubTabs } from '@/composables/widget/useHubTabs'
import WidgetHubHeader from './WidgetHubHeader.vue'

/**
 * 组件 Props 定义
 * @property {string} title - Hub 标题文案（必填）
 * @property {string} accent - 主题色（CSS 颜色值，必填）
 * @property {Object|Function|String} iconComponent - 头部图标组件（必填）
 * @property {string} hubType - Hub 业务类型标识，用于 useHubTabs 区分配置（必填）
 * @property {Array} allTabs - 全量 Tab 列表（必填，结构由 useHubTabs 约定）
 * @property {string} defaultTab - 默认激活 Tab 的 key，默认空字符串
 * @property {number} tabSelectToken - 外部重复选择令牌，默认 0
 * @property {Object} config - Hub 配置对象，影响 Tab 可见性，默认空对象
 */
const props = defineProps({
  title: { type: String, required: true },
  accent: { type: String, required: true },
  iconComponent: { type: [Object, Function, String], required: true },
  hubType: { type: String, required: true },
  allTabs: { type: Array, required: true },
  defaultTab: { type: String, default: '' },
  tabSelectToken: { type: Number, default: 0 },
  config: { type: Object, default: () => ({}) },
})

// 对外抛出 tab-change 事件，便于父组件感知 Tab 切换
const emit = defineEmits(['tab-change'])

/**
 * 通过 useHubTabs 获取当前 Hub 类型下的可见 Tab 列表与激活 Tab 状态。
 * - hubTabs: 经过 config 过滤后的可见 Tab 数组
 * - activeTab: 当前激活 Tab 的 key，支持双向绑定
 */
const { hubTabs, activeTab } = useHubTabs({
  hubType: props.hubType,
  config: () => props.config,
  defaultTabProp: () => props.defaultTab,
  tabSelectToken: () => props.tabSelectToken,
  allTabs: props.allTabs,
})

// 监听激活 Tab 变化，向父组件抛出 tab-change 事件
watch(activeTab, (tab) => emit('tab-change', tab))
</script>
