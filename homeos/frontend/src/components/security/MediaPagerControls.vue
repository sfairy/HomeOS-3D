/**
 * @file MediaPagerControls.vue
 * @module components/security
 * @description 门禁事件媒体预览的上一张/下一张热区按钮组。
 *  覆盖在预览画面左右两侧，支持点击与键盘（Enter/Space）翻页。
 *  依赖：@lucide/vue 图标。
 */
<template>
  <button
    type="button"
    :class="[
      'absolute inset-y-0 left-0 flex items-center justify-center cursor-pointer bg-gradient-to-r from-black/25 to-transparent opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white/60',
      widthClass,
    ]"
    :aria-label="'上一个事件'"
    tabindex="0"
    @click="go(-1)"
    @keydown.enter.prevent="go(-1)"
    @keydown.space.prevent="go(-1)"
  >
    <ChevronLeft class="w-6 h-6 text-white/70 drop-shadow" />
  </button>
  <button
    type="button"
    :class="[
      'absolute inset-y-0 right-0 flex items-center justify-center cursor-pointer bg-gradient-to-l from-black/25 to-transparent opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white/60',
      widthClass,
    ]"
    :aria-label="'下一个事件'"
    tabindex="0"
    @click="go(1)"
    @keydown.enter.prevent="go(1)"
    @keydown.space.prevent="go(1)"
  >
    <ChevronRight class="w-6 h-6 text-white/70 drop-shadow" />
  </button>
</template>

<script setup>
/**
 * 职责：实现 MediaPagerControls 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { ChevronLeft, ChevronRight } from '@lucide/vue'

const props = defineProps({
  /** 当前索引（v-model） */
  modelValue: { type: Number, default: 0 },
  /** 总条数（用于下一张越界钳制） */
  total: { type: Number, default: 0 },
  /** 热区宽度类名（主预览 w-[15%]，全屏 w-[20%]） */
  widthClass: { type: String, default: 'w-[15%]' },
})

const emit = defineEmits(['update:modelValue'])

function go(step) {
  const idx = props.modelValue
  emit('update:modelValue', step < 0 ? Math.max(0, idx - 1) : Math.min(props.total - 1, idx + 1))
}
</script>
