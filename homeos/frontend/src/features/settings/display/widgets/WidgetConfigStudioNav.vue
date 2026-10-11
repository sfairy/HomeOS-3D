<!--
  小部件配置内部的分区导航条（字段级小组件），以按钮形式横向排列多个配置
  分区，并根据 tone 值着色；支持 v-model 双向绑定当前激活分区 ID。
  注意事项：仅作导航用，分区内容切换由父组件通过 v-if 判断 modelValue 值渲染。
-->
<script setup>
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
