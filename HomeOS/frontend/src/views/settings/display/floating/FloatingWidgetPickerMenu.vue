<!--
组件：FloatingWidgetPickerMenu.vue
所属模块：frontend / src / views / settings / display / floating
职责：悬浮 Widget 选择菜单。按分组渲染 WidgetPickerList，选中类型后向上抛出 select 事件。
关键依赖：
  - WidgetPickerList：Widget 选项列表（variant=floating）
数据来源：父级透传的 groups（分组 + items）
-->
<template>
  <template v-for="group in groups" :key="group.label">
    <div class="settings-popout-group-head">{{ group.label }}</div>
    <WidgetPickerList
      :widgets="group.items"
      variant="floating"
      @select="(type) => emit('select', type)"
    />
  </template>
</template>

<script setup>
import WidgetPickerList from '../widgets/WidgetPickerList.vue'

// 入参：Widget 分组列表（每组含 label 与 items）
defineProps({
  groups: { type: Array, required: true },
})

// 对外事件：选中某个 Widget 类型
const emit = defineEmits(['select'])
</script>
