/**
 * @file VSkeleton.vue
 * @module components/common/base
 * @description 通用骨架屏原子组件。支持 title/text/card 等多种形态、自定义宽高、
 *  脉冲动画与无障碍标签，供 VPanelSkeleton 等组合使用或单独作为加载占位。
 */
<template>
  <div
    class="v-skeleton"
    :class="[`v-skeleton--${variant}`, { 'v-skeleton--pulse': pulse }]"
    :style="sizeStyle"
    role="status"
    :aria-label="ariaLabel || '加载中…'"
  />
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 VSkeleton 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed } from 'vue'

const props = defineProps({
  /** 骨架形态：title 标题 / text 文本行 / card 卡片 */
  variant: { type: String, default: 'text' },
  /** 宽度：数字按像素，字符串原样使用 */
  width: { type: [String, Number], default: null },
  /** 高度：数字按像素，字符串原样使用 */
  height: { type: [String, Number], default: null },
  /** 是否启用脉冲动画 */
  pulse: { type: Boolean, default: true },
  /** 无障碍标签 */
  ariaLabel: { type: String, default: '' },
})

// 将宽高 prop 转换为内联样式对象
const sizeStyle = computed(() => {
  const s = {}
  if (props.width != null)
    s.width = typeof props.width === 'number' ? `${props.width}px` : props.width
  if (props.height != null)
    s.height = typeof props.height === 'number' ? `${props.height}px` : props.height
  return s
})
</script>

<style scoped src="./styles/VSkeleton.css"></style>