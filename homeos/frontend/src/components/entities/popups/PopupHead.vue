/** * 实体弹窗头部区域 * 含图标、标题、副标题/状态行与操作按钮插槽 */
<template>
  <div class="popup-head">
    <div class="popup-head-left">
      <div v-if="showIcon" class="popup-head-icon">
        <slot name="icon">
          <component v-if="icon" :is="icon" class="w-4 h-4" />
        </slot>
      </div>
      <div class="min-w-0">
        <div class="popup-title">{{ title }}</div>
        <div v-if="$slots.status" class="popup-subtitle popup-subtitle--status">
          <slot name="status" />
        </div>
        <div v-else-if="subtitle" class="popup-subtitle">{{ subtitle }}</div>
        <div v-else-if="eyebrow" class="popup-eyebrow">{{ eyebrow }}</div>
      </div>
    </div>
    <div v-if="$slots.actions" class="popup-head-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
import { computed, useSlots } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  eyebrow: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
})

const slots = useSlots()
const showIcon = computed(() => !!(props.icon || slots.icon))
</script>
