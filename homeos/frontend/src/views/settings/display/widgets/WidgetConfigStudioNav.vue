<!--
  组件文件：WidgetConfigStudioNav.vue
  所属模块：frontend/src/views/settings/display/widgets
  组件职责：小部件配置内部的分区导航条（字段级小组件），以按钮形式横向排列多个配置
    分区，并根据 tone 值着色；支持 v-model 双向绑定当前激活分区 ID。
  主要 props / emits：
    - props sections：分区对象数组（id/label/icon/tone）
    - props modelValue：当前激活分区 ID
    - emit update:modelValue：点击分区按钮触发，payload 为 section.id
  依赖关系：纯 UI 子组件，无 store 与外部 API。
  注意事项：仅作导航用，分区内容切换由父组件通过 v-if 判断 modelValue 值渲染。
-->
<script setup>
/**
 * 职责：渲染 views/WidgetConfigStudioNav 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
defineProps({
  sections: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <div class="widget-segment-nav" role="tablist" :aria-label="'配置分区'">
    <button
      v-for="section in sections"
      :key="section.id"
      type="button"
      role="tab"
      :class="[
        'widget-segment-nav__item',
        `widget-segment-nav__item--${section.tone}`,
        modelValue === section.id && 'widget-segment-nav__item--active',
      ]"
      :aria-selected="modelValue === section.id"
      @click="$emit('update:modelValue', section.id)"
    >
      <component :is="section.icon" class="widget-segment-nav__icon" aria-hidden="true" />
      <span class="widget-segment-nav__label">{{ section.label }}</span>
    </button>
  </div>
</template>
<style src="../styles/layout-panels.css"></style>
