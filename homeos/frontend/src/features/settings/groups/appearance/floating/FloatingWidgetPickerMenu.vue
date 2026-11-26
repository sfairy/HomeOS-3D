<!--
  悬浮 Widget 选择菜单。按分组渲染 WidgetPickerList，选中类型后向上抛出 select 事件。
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

defineProps({
  groups: { type: Array, required: true },
})

const emit = defineEmits(['select'])
</script>
