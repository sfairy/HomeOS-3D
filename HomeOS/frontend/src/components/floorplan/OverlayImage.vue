<template>
  <!-- 叠加图层：根据实体开关状态切换 active 类，实现淡入/淡出 -->
  <img
    :src="widget.overlayImage ?? ''"
    :class="['overlay-image', { active: isActive }]"
    :alt="widget.id"
    draggable="false"
  />
</template>

<script setup>
/**
 * @file FloorplanOverlayImage.vue
 * @module floorplan
 *
 * 平面图部件叠加图层
 *
 * 职责：
 * - 渲染部件的 overlayImage 图片（如灯具点亮后的光晕图）
 * - 根据实体开关状态（isOn）切换 active 类，实现淡入 / 淡出效果
 * - 当实体关闭时不移除 DOM，仅通过 CSS 透明度隐藏，避免重排
 *
 * 依赖：
 * - vue：computed
 * - @/composables/entity/useEntityProjection：实体快照订阅（驱动重算）
 * - @/stores/entities.store：实体 Store（derivedEpoch 触发响应式更新）
 * - @/utils/floorplan/floorplan-widget.util：buildWidgetDisplayState 构建展示状态
 * - @/utils/entity/entity-projection-display.util：resolveEntityForDisplay 解析展示用实体
 */
import { computed } from 'vue'
import { useEntityProjection } from '@/composables/entity/useEntityProjection'
import { useEntitiesStore } from '@/stores/entities.store'
import { buildWidgetDisplayState } from '@/utils/floorplan/widget.util'
import { resolveEntityForDisplay } from '@/utils/entity/projection-display.util'

// 部件配置对象（含 overlayImage 路径与实体 ID）
const props = defineProps({
  widget: { type: Object, required: true },
})

// 实体 Store：通过访问 derivedEpoch 建立响应式依赖，确保派生数据更新时重算
const entitiesStore = useEntitiesStore()
// 实体投影快照：订阅 widget.id 的状态变化
const entitySnap = useEntityProjection(() => props.widget.id)

// 当前叠加图是否激活（实体处于开启状态）
// 故意访问 derivedEpoch 与 entitySnap.value 以建立响应式追踪
const isActive = computed(() => {
  void entitiesStore.derivedEpoch
  void entitySnap.value
  return buildWidgetDisplayState(props.widget, resolveEntityForDisplay(props.widget.id)).isOn
})
</script>

<style scoped src="./styles/floorplan-canvas.css"></style>