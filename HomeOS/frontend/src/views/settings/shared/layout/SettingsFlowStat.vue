<!--
组件：SettingsFlowStat.vue
所属模块：frontend / src / views / settings / shared / layout
职责：设置流程统计卡片。展示带数值和标签的统计指标，支持多种色调与默认插槽。
Props：
  - label：统计项标签文本
  - value：统计数值（可选，也可通过 slot 传入）
  - tone：卡片整体色调
  - valTone：数值单独色调
导出类型：
  - FlowStatTone：色调类型（accent / secondary / emerald / amber / sky / rose / violet）
关键依赖：无外部依赖，纯展示组件
数据来源：父级透传的 props 与默认插槽
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
