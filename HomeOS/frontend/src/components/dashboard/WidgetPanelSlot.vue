<!--
  WidgetPanelSlot.vue
  所属模块：dashboard（仪表板部件面板可见性插槽容器）
  职责：按 widgetType 绑定 IntersectionObserver，向子插槽传递 panel-visible 标志，
        让内部部件（如媒体迷你控制器）感知自身是否可见以决定暂停/恢复加载。
  依赖：vue、useWidgetPanelVisibility、PANEL_VISIBILITY_WIDGET_TYPES。
-->
<template>
  <div
    ref="rootRef"
    :class="wrapperClass"
    :style="wrapperStyle"
    :data-panel-widget-id="widgetId || undefined"
  >
    <slot :panel-visible="isVisible" />
  </div>
</template>

<script setup>
/**
 * WidgetPanelSlot.vue
 *
 * 所属模块：dashboard（仪表板部件面板可见性插槽容器）
 * 职责：按 widgetType 绑定 IntersectionObserver，向子插槽传递 panel-visible 标志，
 *      让内部部件（如媒体迷你控制器）感知自身是否可见以决定暂停/恢复加载。
 *      仅 PANEL_VISIBILITY_WIDGET_TYPES 集合中的类型才会启用可见性追踪。
 * 依赖：vue、useWidgetPanelVisibility、PANEL_VISIBILITY_WIDGET_TYPES。
 */
import { ref, watch } from 'vue'
import {
  useWidgetPanelVisibility,
  PANEL_VISIBILITY_WIDGET_TYPES,
} from '@/composables/ui/useWidgetPanelVisibility'

/**
 * 组件 Props
 * @property {string}                 widgetType  - 部件类型（决定是否启用可见性追踪）
 * @property {string}                 widgetId    - 部件 id（写入 data-panel-widget-id）
 * @property {string|string[]|object}  wrapperClass - 包裹层 class
 * @property {string|object}           wrapperStyle - 包裹层 style
 */
const props = defineProps({
  widgetType: { type: String, required: true },
  widgetId: { type: String, default: '' },
  wrapperClass: { type: [String, Array, Object], default: '' },
  wrapperStyle: { type: [String, Object], default: undefined },
})

// 根容器 DOM 引用
const rootRef = ref(null)
// 仅对需要追踪可见性的部件类型启用 IntersectionObserver
const trackVisibility = PANEL_VISIBILITY_WIDGET_TYPES.has(props.widgetType)
const { isVisible, bind } = useWidgetPanelVisibility(null, { enabled: trackVisibility })

// 根容器挂载/更新时绑定到 IntersectionObserver（post flush 确保 DOM 已就绪）
watch(rootRef, (el) => bind(el), { flush: 'post' })
</script>
