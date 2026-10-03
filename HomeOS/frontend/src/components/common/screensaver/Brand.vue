/**
 * @file Brand.vue
 * @module common/screensaver
 * @description 屏保顶部品牌标题区
 *  职责：显示站点名称（siteTitle）。
 *  依赖：无外部依赖。
 */
<template>
  <header class="ss-brand ss-fade-0">
    <h1 class="ss-brand-text">{{ siteTitle }}</h1>
  </header>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 Brand 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
defineProps({
  /** 站点名称（屏保标题文案） */
  siteTitle: { type: String, required: true },
})
</script>
