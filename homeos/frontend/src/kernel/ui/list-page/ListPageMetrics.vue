/**
 * 列表页指标网格
 * 以「数值 + 标签」形式展示一组统计单元，支持按 tone 切换单元强调色。
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
defineProps({
  /** 指标单元数组，每项含 key/label/value/tone 字段 */
  cells: {
    type: Array,
    default: () => [],
  },
})
</script>
