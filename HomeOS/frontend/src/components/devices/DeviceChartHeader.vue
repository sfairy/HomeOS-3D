<!--
  @file DeviceChartHeader.vue
  @module 设备模块/图表通用标题
  @description 图表卡片通用头部组件，统一渲染图标、标题、提示徽标与描述文案。
               作为 DeviceAnalyticsDashboard、DeviceStatsDashboard 等图表容器的标准标题行，
               保持视觉与排版一致。
  @dependencies vue（Component 类型）；无外部状态依赖。
-->
<template>
  <div class="dev-chart-wrap__header-block">
    <div class="dev-chart-wrap__title">
      <component :is="icon" v-if="icon" :class="iconClass" aria-hidden="true" />
      <span>{{ title }}</span>
      <span v-if="hint" class="device-analytics__chart-hint">{{ hint }}</span>
    </div>
    <p v-if="description" class="dev-chart-wrap__desc">{{ description }}</p>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

// 组件属性定义：title 必填，description/hint/icon/iconClass 均可选；
// iconClass 默认附加 info 色调与 3 单位尺寸。
withDefaults(
  defineProps<{
    title: string
    description?: string
    hint?: string
    icon?: Component
    iconClass?: string
  }>(),
  {
    iconClass: 'w-3 h-3 dch-icon-info',
  },
)
</script>

<style scoped>
.dch-icon-info {
  color: var(--set-info, #7dd3fc);
}
</style>
