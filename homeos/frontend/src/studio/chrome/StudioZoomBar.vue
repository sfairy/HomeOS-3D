<script setup lang="ts">
import { Minus, Plus, Maximize2 } from '@lucide/vue'

const props = defineProps<{
  zoom: number
}>()

const emit = defineEmits<{
  'update:zoom': [number]
  fit: []
}>()

function onMinus() {
  emit('update:zoom', Math.max(0.25, Math.round((props.zoom - 0.1) * 100) / 100))
}

function onPlus() {
  emit('update:zoom', Math.min(3, Math.round((props.zoom + 0.1) * 100) / 100))
}
</script>

<template>
  <div class="sc-zoom-bar" role="group" aria-label="画布缩放">
    <button type="button" class="sc-btn sc-btn--icon" title="缩小" @click="onMinus">
      <Minus class="w-3.5 h-3.5" />
    </button>
    <span class="sc-zoom-bar__label">{{ Math.round(zoom * 100) }}%</span>
    <button type="button" class="sc-btn sc-btn--icon" title="放大" @click="onPlus">
      <Plus class="w-3.5 h-3.5" />
    </button>
    <button type="button" class="sc-btn sc-btn--icon" title="适应窗口" @click="emit('fit')">
      <Maximize2 class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
