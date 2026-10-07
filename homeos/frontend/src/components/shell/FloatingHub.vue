<template>
  <!-- 浮动控制中心根容器：承载所有启用部件 + 活跃弹窗 -->
  <div ref="rootRef" class="afh-root">
    <!-- 遍历启用的部件，由 WidgetShell 统一渲染外壳与拖拽 -->
    <FloatingHubWidgetShell v-for="widget in enabledWidgets" :key="widget.id" :widget="widget" />

    <!-- 活跃弹窗（如实体详情）：动态组件，关闭时置空 activePopupId -->
    <component
      :is="activePopupComponent"
      v-if="activePopupId"
      :entity-id="activePopupEntityId"
      :x-pct="activePopupX"
      :y-pct="activePopupY"
      :anchor-x="activePopupAnchor?.anchorX"
      :anchor-y="activePopupAnchor?.anchorY"
      @close="activePopupId = null"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @file FloatingHub.vue
 * @module floorplan
 *
 * 浮动控制中心（AFH - Always Floating Hub）
 *
 * 在平面图上自由浮动的多功能控制面板。
 *
 * 支持的部件类型：
 * - entity / clock / temp / humidity / battery / power / html：内联指标芯片
 * - securityPanel：全屋安防布撤防面板
 * - homeEnvironment：居家环境（空气质量 / 健康）
 * - climateHub：气候中心（空调控制 / 趋势）
 * - lockHub：门锁中心
 * - scheduleHub：日程中心
 * - energyDashboard / careHub / smartAdvisor / securityPanel：业务面板
 *
 * 编辑模式（isAfhLocked = false）下可拖拽调整位置。
 * 配置保存在每层楼的 floatingWidgets 数组中。
 *
 * 职责：
 * - 通过 useFloatingHub 组合式函数获取上下文与启用部件列表
 * - provide 上下文给子部件，避免 prop drilling
 * - 渲染活跃弹窗（实体点击后弹出详情）
 *
 * 依赖：
 * - vue：provide / ref
 * - FloatingHubContextKey：上下文注入键
 * - @/composables/shell/useFloatingHub：浮动中心核心逻辑
 * - FloatingHubWidgetShell：单部件外壳
 * - ./floating-hub/index.css：样式
 */
import { provide, ref } from 'vue'
import { FloatingHubContextKey } from '@/components/shell/floating-hub/context'
import { useFloatingHub } from '@/composables/shell/useFloatingHub'
import FloatingHubWidgetShell from '@/components/shell/floating-hub/FloatingHubWidgetShell.vue'
import './floating-hub/index.css'

// 根容器引用，传入组合式函数用于事件绑定与定位
const rootRef = ref<HTMLElement | null>(null)
// 解构浮动中心核心状态：上下文、启用部件、活跃弹窗相关字段
const {
  context,
  enabledWidgets,
  activePopupId,
  activePopupEntityId,
  activePopupX,
  activePopupY,
  activePopupAnchor,
  activePopupComponent,
} = useFloatingHub(rootRef)

// 向子部件提供上下文
provide(FloatingHubContextKey, context)
</script>