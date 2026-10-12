/**
 * 浮动组件 单部件外壳
 * 承载 entity/clock/metric/panel 等类型部件，编辑模式下支持拖拽
 */
<template>
  <!-- 单部件外壳：承载具体部件内容，编辑模式下可拖拽调整位置 -->
  <div
    :data-afh-id="widget.id"
    :class="[
      'afh-widget animate-afh-in',
      `afh-theme-${hub.getWidgetTheme(widget)}`,
      shouldTintAfhWidget(widget) ? 'afh-widget--tinted' : '',
      widget.type === 'entity' && hasEntityCustomColors(widget.config)
        ? 'afh-widget--custom-color'
        : '',
      hub.layoutStore.layoutConfig.isAfhLocked === false ? 'is-edit-mode' : '',
      isDragging ? 'is-dragging' : '',
      hub.isFloatingPanelType(widget.type) ? 'afh-widget--panel' : '',
    ]"
    :style="hub.getWidgetStyle(widget)"
    @click.stop
    @mousedown.stop
  >
    <!-- 编辑模式拖拽手柄：仅 isAfhLocked === false 时显示，绑定拖拽起始事件 -->
    <div
      v-if="hub.layoutStore.layoutConfig.isAfhLocked === false"
      class="afh-edit-overlay"
      @mousedown.stop="hub.onDragStart(widget, $event)"
      @touchstart.stop="hub.onDragStart(widget, $event)"
    >
      <div class="afh-drag-handle" aria-hidden="true">
        <Grip class="w-4 h-4" />
      </div>
    </div>

    <!-- 根据部件类型分发到具体渲染器 -->
    <FloatingHubEntityWidget v-if="widget.type === 'entity'" :widget="widget" />
    <FloatingHubClockWidget v-else-if="widget.type === 'clock'" />
    <FloatingHubMetricWidget v-else-if="isMetricType(widget.type)" :widget="widget" />
    <FloatingHubPanelWidget v-else-if="hub.isFloatingPanelType(widget.type)" :widget="widget" />
  </div>
</template>

<script setup lang="ts">
/**
 * 浮动控制中心 - 单部件外壳
 * - 作为每个浮动部件的统一外壳，承载主题/样式/拖拽/动画
 * - 根据 widget.type 分发到 Entity / Clock / Metric / Panel 具体渲染器
 * - 编辑模式（isAfhLocked === false）下显示拖拽手柄，支持鼠标与触摸拖拽
 * - 通过 hasEntityCustomColors 判断实体部件是否使用自定义颜色配置
 */
import { computed, inject, unref } from 'vue'
import { Grip } from '@lucide/vue'
import { FloatingHubContextKey } from '@/shared/types/floating-hub'
import FloatingHubEntityWidget from '@/components/shell/floating-hub/FloatingHubEntityWidget.vue'
import FloatingHubClockWidget from '@/components/shell/floating-hub/FloatingHubClockWidget.vue'
import FloatingHubMetricWidget from '@/components/shell/floating-hub/FloatingHubMetricWidget.vue'
import FloatingHubPanelWidget from '@/components/shell/floating-hub/FloatingHubPanelWidget.vue'
import type { FloatingWidget } from '@/shared/types/layout'
import { hasEntityCustomColors, shouldTintAfhWidget } from '@/shared/entity/utils/floating-entity-colors.util'
import { canonicalizeWidgetType } from '@/shared/utils/registry/widget-catalog'

// 部件实例
const props = defineProps<{
  widget: FloatingWidget
}>()

// 注入父组件上下文（非空断言：FloatingHub 父组件必定 provide）
const hub = inject(FloatingHubContextKey)!

// 当前部件是否处于拖拽中：比对全局 draggingId 与本部件 id
const isDragging = computed(() => unref(hub.draggingId) === props.widget.id)

// 指标型部件类型集合（温度/湿度/空气质量/电池/功率/自定义 HTML）
const METRIC_TYPES = new Set(['temp', 'humidity', 'aqi', 'battery', 'power', 'customHtml'])

/**
 * 判断部件类型是否属于指标型
 * @param type - 部件类型字符串
 * @returns 是 / 否
 */
function isMetricType(type: string) {
  return METRIC_TYPES.has(canonicalizeWidgetType(type))
}
</script>