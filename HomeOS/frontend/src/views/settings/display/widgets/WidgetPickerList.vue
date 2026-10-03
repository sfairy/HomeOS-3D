/** * Widget 选择列表：虚拟滚动展示可选 Widget，支持 sidebar/dashboard/floating 样式变体。 */
<template>
  <VirtualList
    :items="pickerItems"
    :item-height="itemHeight"
    :virtual-threshold="WIDGET_PICKER_VIRTUAL_THRESHOLD"
    container-class="widget-picker-virtual"
    :item-key="(w) => w.type"
  >
    <template #default="{ item: widget }">
      <button type="button" :class="rowClass(widget)" @click="emit('select', widget.type)">
        <component :is="widget.icon" class="w-3.5 h-3.5 opacity-60 shrink-0" />
        {{ widget.displayLabel }}
      </button>
    </template>
  </VirtualList>
</template>

<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/WidgetPickerList 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { computed } from 'vue'
import VirtualList from '@/components/common/base/VirtualList.vue'
import { WIDGET_PICKER_VIRTUAL_THRESHOLD } from '@/utils/widget/profile-filter.util'
import { getWidgetName } from '@/utils/registry/widget-catalog'
const props = defineProps({
  widgets: { type: Array, required: true },
  variant: { type: String, default: 'sidebar' },
  itemHeight: { type: Number, default: 40 },
})

const emit = defineEmits(['select'])

const pickerItems = computed(() =>
  props.widgets.map((w) => ({
    ...w,
    displayLabel: getWidgetName(w.type),
  })),
)

function rowClass() {
  const base =
    'w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-3'
  if (props.variant === 'dashboard') {
    return `${base} wpl-row--dashboard`
  }
  return `${base} wpl-row--floating`
}
</script>

<style scoped src="../../shared/styles/settings-cards.css"></style>
