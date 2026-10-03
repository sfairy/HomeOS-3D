/**
 * Widget Hub 头部组件
 *
 * 所属模块：frontend/widgets/shared
 * 职责：展示 Hub 的图标、标题、元信息与 Tab 子导航，
 *       支持徽章（badge）计数与主题色 accent 样式覆盖，
 *       通过 v-model 与父组件双向同步当前激活 Tab。
 * 依赖：
 *   - vue 的 computed（派生 hasBrandRow / accentStyle）与 useSlots（判断插槽存在性）
 *   - 由父组件传入 tabs/title/meta/accent 等 props
 */
<template>
  <!-- 头部根元素：根据是否存在品牌行与 stacked 模式切换布局类 -->
  <header
    class="widget-hub-head"
    :class="{
      'widget-hub-head--tabs-only': !hasBrandRow,
      'widget-hub-head--stacked': stacked,
    }"
    :style="accentStyle"
  >
    <!-- 品牌行：仅在存在标题/元信息/图标插槽/动作插槽时渲染 -->
    <div v-if="hasBrandRow" class="widget-hub-head__row">
      <div class="widget-hub-head__left">
        <!-- 图标插槽：由 HubPanelLayout 透传的动态图标 -->
        <slot name="icon" />
        <!-- 标题：仅当 title 非空时渲染 -->
        <h3 v-if="title" class="widget-hub-head__title">{{ title }}</h3>
        <!-- 元信息文本：仅当 meta 字符串非空时渲染 -->
        <span v-if="meta" class="widget-hub-head__meta">{{ meta }}</span>
        <!-- 元信息插槽：供父组件插入自定义元信息内容 -->
        <slot name="meta" />
      </div>
      <!-- 动作插槽：右上角操作区（如设置按钮） -->
      <slot name="actions" />
    </div>
    <!-- Tab 子导航：仅当 tabs 非空时渲染，遵循 ARIA tablist 语义 -->
    <nav v-if="tabs.length" class="widget-hub-subnav" role="tablist">
      <!-- 遍历 tabs 渲染每个 Tab 按钮 -->
      <button
        v-for="tab in tabs"
        :key="tabId(tab)"
        type="button"
        role="tab"
        :aria-selected="modelValue === tabId(tab)"
        :class="[
          'widget-hub-subnav__btn',
          modelValue === tabId(tab) && 'widget-hub-subnav__btn--active',
        ]"
        :style="tabButtonStyle(tab, modelValue === tabId(tab))"
        :data-tab="tabId(tab)"
        @click="$emit('update:modelValue', tabId(tab))"
      >
        {{ tab.label }}
        <!-- 徽章：仅当 badge 有非空非零值时显示 -->
        <span
          v-if="tab.badge != null && tab.badge !== '' && tab.badge !== 0"
          class="widget-hub-subnav__badge"
          >{{ tab.badge }}</span
        >
      </button>
    </nav>
  </header>
</template>

<script setup>
/**
 * @file WidgetHubHeader.vue
 * @module widgets/shared
 * @description 通用 Hub 头部组件：展示标题、元信息、图标与 tab 切换按钮组，
 *              支持 v-model 双向绑定激活 tab，支持 stacked 上下排列布局。
 * @dependencies
 *  - vue: computed/useSlots 响应式与插槽
 */
import { computed, useSlots } from 'vue'

/**
 * 组件 Props 定义
 * @property {string} title - 标题文案，默认空字符串
 * @property {string} meta - 元信息文案，默认空字符串
 * @property {Array} tabs - Tab 列表，每项含 key/id/label/badge/accent 字段，默认空数组
 * @property {string} modelValue - 当前激活 Tab 的 key（v-model 绑定值），默认空字符串
 * @property {string} accent - 主题色（CSS 颜色值），用于覆盖 --hub-accent CSS 变量，默认空字符串
 * @property {boolean} stacked - 标题与 Tab 上下排列（元信息较多或 Tab 很多时使用），默认 false
 */
const props = defineProps({
  title: { type: String, default: '' },
  meta: { type: String, default: '' },
  tabs: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
  accent: { type: String, default: '' },
  /** 标题与 Tab 上下排列（元信息较多或 Tab 很多时使用） */
  stacked: { type: Boolean, default: false },
})

// 对外抛出 update:modelValue 事件，配合 v-model 实现双向绑定
defineEmits(['update:modelValue'])

// 获取插槽对象，用于判断具名插槽是否被父组件填充
const slots = useSlots()

/**
 * 是否渲染品牌行（标题行）。
 * 当 title/meta 文案非空，或 icon/meta/actions 任一插槽被填充时为 true。
 * @returns {boolean} 是否存在品牌行内容
 */
const hasBrandRow = computed(
  () =>
    Boolean(props.title) ||
    Boolean(props.meta) ||
    Boolean(slots.icon) ||
    Boolean(slots.meta) ||
    Boolean(slots.actions),
)

/**
 * 从 Tab 对象提取唯一标识。
 * 优先使用 key，其次 id，均为空时返回空字符串。
 * @param {Object} tab - Tab 配置对象
 * @returns {string} Tab 的唯一 key
 */
function tabId(tab) {
  return tab?.key ?? tab?.id ?? ''
}

/**
 * 主题色 CSS 变量样式对象。
 * 当 accent 非空时，设置 --hub-accent CSS 变量供子元素继承；
 * 否则返回空对象，使用 CSS 默认主题色。
 * @returns {Object} 行内样式对象
 */
const accentStyle = computed(() => (props.accent ? { '--hub-accent': props.accent } : {}))

/**
 * 计算单个 Tab 按钮的行内样式。
 * 当该 Tab 处于激活态且自带 accent 时，覆盖 --hub-accent 实现每 Tab 独立配色；
 * 非激活或无 accent 时返回 undefined，沿用父级样式。
 * @param {Object} tab - Tab 配置对象
 * @param {boolean} active - 当前 Tab 是否激活
 * @returns {Object|undefined} 行内样式对象或 undefined
 */
function tabButtonStyle(tab, active) {
  if (active && tab?.accent) return { '--hub-accent': tab.accent }
  return undefined
}
</script>
