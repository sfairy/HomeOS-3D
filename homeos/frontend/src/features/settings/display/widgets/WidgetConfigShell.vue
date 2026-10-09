<!--
  组件文件：WidgetConfigShell.vue
  所属模块：frontend/src/features/settings/display/widgets
  组件职责：小部件配置面板的通用外壳容器（小组件级纯展示壳），统一渲染图标球体、
    标题小标题、描述文本与头操作插槽/body 插槽/footer 插槽，并支持多种主题色 tone 与
    flat 扁平化模式。
  主要 props / emits：
    - props title / description / eyebrow：标题、描述、小标题文案
    - props tone：主题色 purple/sky/amber/emerald/rose
    - props flat：是否去除阴影的扁平化模式
    - props icon：图标组件
  依赖关系：无 store 与 composable；仅依赖 slot 分发与 props 传入。
  注意事项：无自身 emits；所有交互由内部插槽组件触发上级事件。
-->
<script setup>
/**
 * 职责：渲染 views/WidgetConfigShell 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
defineProps({
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  eyebrow: { type: String, default: '微件配置' },
  tone: {
    type: String,
    default: 'purple',
    validator: (v) => ['purple', 'sky', 'amber', 'emerald', 'rose'].includes(v),
  },
  flat: { type: Boolean, default: false },
  icon: { type: [Object, Function], default: null },
})
</script>

<template>
  <div
    :class="[
      'widget-config-shell',
      `widget-config-shell--${tone}`,
      flat && 'widget-config-shell--flat',
    ]"
  >
    <header v-if="title || description || icon" class="widget-config-shell__head">
      <div class="widget-config-shell__head-main">
        <div v-if="icon" class="widget-config-shell__orb" aria-hidden="true">
          <component :is="icon" class="widget-config-shell__orb-icon" />
        </div>
        <div class="min-w-0">
          <p v-if="eyebrow" class="widget-config-shell__eyebrow">{{ eyebrow }}</p>
          <h4 v-if="title" class="widget-config-shell__title">{{ title }}</h4>
          <p v-if="description" class="widget-config-shell__desc">{{ description }}</p>
        </div>
      </div>
      <slot name="head-actions" />
    </header>

    <div class="widget-config-shell__body">
      <slot />
    </div>

    <slot name="footer" />
  </div>
</template>
<style src="../styles/layout-panels.css"></style>
