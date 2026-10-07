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
/**
 * @file FloatingHubPanelWidget.vue
 * @module floorplan/floating-hub
 *
 * 浮动控制中心 - 面板型部件渲染器
 *
 * 职责：
 * - 根据 widget.type 从部件注册表（widget-registry）动态解析并渲染对应面板组件
 * - 支持的面板类型：securityPanel / homeEnvironment / climateHub / lockHub /
 *   scheduleHub / energyDashboard / careHub / smartAdvisor 等
 * - 通过 getFloatingPanelProps 将 widget 配置转换为面板组件所需 props
 *
 * 依赖：
 * - @/utils/registry/widget-registry：面板组件注册表与 props 解析
 * - @/types/layout：FloatingWidget 部件类型定义
 */
import { getFloatingPanelComponent, getFloatingPanelProps } from '@/utils/registry/widget-registry'
import type { FloatingWidget } from '@/types/layout'

// 部件实例（含 type 与 config）
defineProps<{
  widget: FloatingWidget
}>()
</script>