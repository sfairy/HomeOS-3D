<template>
  <div class="afh-content afh-content--panel afh-content--hub-panel">
    <component
      :is="getFloatingPanelComponent(widget.type)"
      v-bind="getFloatingPanelProps(widget)"
    />
  </div>
</template>

<script setup lang="ts">
/** 浮动控制中心 - 面板型部件渲染器 */
import { getFloatingPanelComponent, getFloatingPanelProps } from '@/domain/widget/widget-registry'
import type { FloatingWidget } from '@/domain/layout/types'

// 部件实例（含 type 与 config）
defineProps<{
  widget: FloatingWidget
}>()
</script>