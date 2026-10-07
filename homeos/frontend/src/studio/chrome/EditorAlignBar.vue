<script setup lang="ts">
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceBetween,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceBetween,
} from '@lucide/vue'
import { useStudioEditorStore } from '@/stores/studio-editor.store'

const editorStore = useStudioEditorStore()

const actions = [
  { mode: 'left', title: '左对齐', icon: AlignHorizontalJustifyStart },
  { mode: 'center', title: '水平居中', icon: AlignHorizontalJustifyCenter },
  { mode: 'right', title: '右对齐', icon: AlignHorizontalJustifyEnd },
  { mode: 'top', title: '顶对齐', icon: AlignVerticalJustifyStart },
  { mode: 'middle', title: '垂直居中', icon: AlignVerticalJustifyCenter },
  { mode: 'bottom', title: '底对齐', icon: AlignVerticalJustifyEnd },
  { mode: 'distribute-x', title: '水平分布', icon: AlignHorizontalSpaceBetween },
  { mode: 'distribute-y', title: '垂直分布', icon: AlignVerticalSpaceBetween },
] as const
</script>

<template>
  <div
    class="sc-align-bar"
    role="toolbar"
    aria-label="对齐与分布"
    :hidden="editorStore.facade.selection.ids.length < 2"
  >
    <button
      v-for="action in actions"
      :key="action.mode"
      type="button"
      class="sc-btn sc-btn--icon"
      :title="action.title"
      :disabled="
        (action.mode === 'distribute-x' || action.mode === 'distribute-y') &&
        editorStore.facade.selection.ids.length < 3
      "
      @click="editorStore.command({ type: 'align', mode: action.mode })"
    >
      <component :is="action.icon" class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
