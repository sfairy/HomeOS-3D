<!--
  组件文件：HotspotReadingIcon.vue
  所属模块：frontend/src/components/floorplan
  组件职责：平面图热点徽章读数图标（SVG 小图标），在 BadgeWidget 的温度 / 湿度 / 光照等数值前展示对应的 SVG 图形，
    使户型图上热点读数更直观，纯展示无交互、无 emits。
  Props: kind（字符串：temperature / humidity 等类型）。
  依赖：@/utils/floorplan/floorplan-badge-reading-icon.util 按 kind 解析 SVG path；Vue computed 做响应式计算。
-->
<template>
  <!-- 徽章读数图标：在数值前展示温度/湿度的小图标，纯展示无交互 -->
  <svg
    class="hotspot__reading-icon"
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="path" fill="currentColor" />
  </svg>
</template>

<script setup lang="ts">
/**
 * @file HotspotReadingIcon.vue
 * @module floorplan
 *
 * 热点徽章读数图标
 *
 * 职责：
 * - 在 BadgeWidget 数值前展示温度 / 湿度的小图标（SVG path）
 * - 根据 kind 属性从工具函数解析对应 path
 *
 * 依赖：
 * - vue：computed
 * - @/utils/floorplan/floorplan-badge-reading-icon.util：图标 path 解析
 */
import { computed } from 'vue'
import { resolveBadgeReadingIconPath } from '@/utils/floorplan/badge-reading-icon.util'

// 图标类型：temperature（温度）/ humidity（湿度）
const props = defineProps<{
  kind: 'temperature' | 'humidity'
}>()

// 根据 kind 解析 SVG path 字符串；无匹配时返回空字符串
const path = computed(() => resolveBadgeReadingIconPath(props.kind) || '')
</script>