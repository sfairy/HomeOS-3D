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
/**
 * 职责：实现 PopupHead 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
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
