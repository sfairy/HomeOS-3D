/**
 * @file VEmptyState.vue
 * @module components/common/base
 * @description 通用空状态占位组件。支持图标、标题、描述与操作区插槽，
 *  可按 tone 切换配色主题（sky/violet/emerald/amber/rose/indigo/neutral）。
 *  依赖：vue computed。
 */
<template>
  <div
    :class="['v-empty', compact && 'v-empty--compact', resolvedTone && `v-empty--${resolvedTone}`]"
    role="group"
  >
    <!-- 图标区：优先渲染 Lucide 图标组件（iconComponent），否则渲染 emoji/字符（icon） -->
    <div v-if="iconComponent || icon" class="v-empty__icon" aria-hidden="true">
      <component :is="iconComponent" v-if="iconComponent" class="v-empty__icon-svg" />
      <template v-else>{{ icon }}</template>
    </div>
    <!-- 标题与描述：放入 aria-live 区域，屏幕阅读器可感知内容变化；
         容器自身为 group，避免将内部的交互按钮暴露为 status 朗读 -->
    <div v-if="title || description" aria-live="polite">
      <p v-if="title" class="v-empty__title">{{ title }}</p>
      <p v-if="description" class="v-empty__desc">{{ description }}</p>
    </div>
    <!-- 操作区插槽：放置按钮等交互元素 -->
    <div v-if="$slots.action" class="v-empty__action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 VEmptyState 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed } from 'vue'

const props = defineProps({
  /** 图标内容（emoji 或字符），为空则不渲染图标区 */
  icon: { type: String, default: '' },
  /** 图标组件（如 Lucide 图标）；与 icon 同时传入时优先使用本项 */
  iconComponent: { type: [Object, Function], default: null },
  /** 标题文本 */
  title: { type: String, default: '' },
  /** 描述文本 */
  description: { type: String, default: '' },
  /** 是否使用紧凑布局（减小间距） */
  compact: { type: Boolean, default: false },
  /** 色调：sky | violet | emerald | amber | rose | indigo | neutral */
  tone: { type: String, default: 'sky' },
})

// 解析色调：空值或 'default' 统一回退为 'sky'
const resolvedTone = computed(() => {
  const t = props.tone?.trim()
  if (!t || t === 'default') return 'sky'
  return t
})
</script>

<style scoped src="./styles/VEmptyState.css"></style>