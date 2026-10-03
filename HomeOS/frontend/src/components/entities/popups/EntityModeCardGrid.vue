/** * 实体模式选择卡片网格 * 以图标卡片形式展示并切换设备运行模式 */
<template>
  <div :class="['flex justify-center gap-2.5 mb-4', columns === 1 ? 'flex-col items-center' : '']">
    <button
      v-for="mode in modes"
      :key="mode.key"
      :class="['mode-card', mode.active ? 'mode-card--active' : '']"
      @click.stop="$emit('select', mode.key)"
    >
      <component :is="mode.icon" :class="['w-5 h-5 mb-1', mode.iconClass || '']" />
      <span class="text-xs font-bold tracking-wider leading-normal">{{ mode.label }}</span>
    </button>
  </div>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 EntityModeCardGrid 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
defineProps({
  modes: { type: Array, default: () => [] },
  columns: { type: Number, default: 2 },
})
defineEmits(['select'])
</script>
