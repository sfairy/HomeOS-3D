/**
 * @file ListPageMetrics.vue
 * @module common/list-page
 * @description 列表页指标网格
 *  职责：以「数值 + 标签」形式展示一组统计单元，支持按 tone 切换单元强调色。
 *  依赖：无外部依赖。
 */
<template>
  <div class="lp-metrics" role="list">
    <div
      v-for="cell in cells"
      :key="cell.key || cell.label"
      class="lp-metrics__item"
      :class="cell.tone && `lp-metrics__item--${cell.tone}`"
      role="listitem"
    >
      <span class="lp-metrics__value">{{ cell.value }}</span>
      <span class="lp-metrics__label">{{ cell.label }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * 职责：实现 ListPageMetrics 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
defineProps({
  /** 指标单元数组，每项含 key/label/value/tone 字段 */
  cells: {
    type: Array,
    default: () => [],
  },
})
</script>
