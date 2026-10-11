<!--
  小部件配置面板的通用外壳容器（小组件级纯展示壳），统一渲染图标球体、
  标题小标题、描述文本与头操作插槽/body 插槽/footer 插槽，并支持多种主题色 tone 与
  flat 扁平化模式。
  注意事项：无自身 emits；所有交互由内部插槽组件触发上级事件。
-->
<script setup>
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
