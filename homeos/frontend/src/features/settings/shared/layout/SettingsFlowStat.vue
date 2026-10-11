<!--
  设置流程统计卡片。展示带数值和标签的统计指标，支持多种色调与默认插槽。
-->
<template>
  <div class="hub-stat settings-flow-stat" :class="tone ? `settings-flow-stat--${tone}` : undefined">
    <span class="hub-stat__val" :class="valTone ? `settings-flow-stat-val--${valTone}` : undefined">
      <slot>{{ value }}</slot>
    </span>
    <span class="hub-stat__lbl">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
/** 统计卡片色调类型 */
export type FlowStatTone =
  | 'accent'
  | 'secondary'
  | 'emerald'
  | 'amber'
  | 'sky'
  | 'rose'
  | 'violet'

defineProps<{
  label: string
  value?: string | number
  tone?: FlowStatTone
  valTone?: FlowStatTone
}>()
</script>
