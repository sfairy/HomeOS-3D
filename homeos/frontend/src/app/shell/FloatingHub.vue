<template>
  <div ref="rootRef" class="afh-root">
    <FloatingHubWidgetShell v-for="widget in enabledWidgets" :key="widget.id" :widget="widget" />

    <!--
      `:key` 不能省。弹窗组件在 setup 里把 props.entityId 解析成能源类别，并据此选定
      数据源（sourceKey）、字段解析器与单位标签，这些只在 setup 时求值一次。没有 key 时
      从电力部件点到燃气部件，Vue 会复用同一个实例 —— 标签跟着 computed 变成 m³，
      数字却仍在读电力账户（实测：燃气卡显示「用量(m³)」，Y 轴写 kWh，数值是电费年度用量）。
    -->
    <component
      :is="activePopupComponent"
      v-if="activePopupId"
      :key="activePopupEntityId"
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
import { FloatingHubContextKey } from '@/kernel/types/floating-hub'
import { useFloatingHub } from '@/app/shell/floating-hub/useFloatingHub'
import FloatingHubWidgetShell from '@/app/shell/floating-hub/FloatingHubWidgetShell.vue'
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