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
/** 浮动控制中心（AFH - Always Floating Hub） */
import { provide, ref } from 'vue'
import { FloatingHubContextKey } from '@/shared/types/floating-hub'
import { useFloatingHub } from '@/components/shell/floating-hub/useFloatingHub'
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