/**
 * @file VPanelSkeleton.vue
 * @module components/common/base
 * @description 面板骨架屏组件。在面板内容加载完成前展示标题、文本与卡片的占位骨架，
 *  由多个 VSkeleton 组合而成，提供与最终布局一致的加载态视觉。
 *  依赖：VSkeleton 子组件。
 */
<template>
  <div class="v-panel-skeleton" role="status" :aria-label="ariaLabel || '加载中…'">
    <!-- 标题占位 -->
    <VSkeleton variant="title" width="42%" />
    <!-- 文本行占位 -->
    <VSkeleton variant="text" />
    <VSkeleton variant="text" width="72%" />
    <!-- 主体卡片占位 -->
    <VSkeleton variant="card" :height="bodyHeight" />
  </div>
</template>

<script setup>
/**
 * 职责：实现 VPanelSkeleton 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import VSkeleton from './VSkeleton.vue'
defineProps({
  /** 主体卡片高度（数字按像素，字符串原样使用） */
  bodyHeight: { type: [String, Number], default: 72 },
  /** 无障碍标签，默认"加载中…" */
  ariaLabel: { type: String, default: '' },
})
</script>

<style scoped>
.v-panel-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 4px 0;
}
</style>