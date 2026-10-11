<template>
  <!-- 面板型部件容器：通过 <component :is> 动态渲染具体面板（如安防/气候/门锁中心） -->
  <div class="afh-content afh-content--panel afh-content--hub-panel">
    <component
      :is="getFloatingPanelComponent(widget.type)"
      v-bind="getFloatingPanelProps(widget)"
    />
  </div>
</template>

<script setup lang="ts">
/** 浮动控制中心 - 面板型部件渲染器 */
import { getFloatingPanelComponent, getFloatingPanelProps } from '@/components/widgets/widget-registry'
import type { FloatingWidget } from '@/shared/types/layout'

// 部件实例（含 type 与 config）
defineProps<{
  widget: FloatingWidget
}>()
</script>