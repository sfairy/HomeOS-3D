/**
 * @file SettingsCard.vue
 * @module common/page-shell
 * @description 通用卡片容器（原 settings/shared/layout/SettingsCard.vue）
 *  职责：
 *    - 通过 full / elevated / flat / nested / static 等变体切换容器样式；
 *    - 关闭 inheritAttrs，由 $attrs 显式绑定到根节点；
 *    - 默认插槽透传业务内容。
 *  依赖：vue computed。
 */
<template>
  <section :class="cardClasses" v-bind="$attrs">
    <slot />
  </section>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 SettingsCard 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed } from 'vue'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  /** 额外的自定义 class */
  extraClass: { type: String, default: '' },
  /** 是否铺满父级宽度 */
  full: { type: Boolean, default: false },
  /** 是否浮起（更明显的阴影/边框） */
  elevated: { type: Boolean, default: false },
  /** 无边框透明底，适合已有 PageHeader 的 Hub 页 */
  flat: { type: Boolean, default: false },
  /** 卡片内子区块，仅浅底无边框 */
  nested: { type: Boolean, default: false },
  /** 禁用 hover 上浮（表单容器） */
  static: { type: Boolean, default: false },
})

/** 根据各变体 prop 组合最终的 class 列表 */
const cardClasses = computed(() => [
  'settings-card hos-panel h-auto shrink-0',
  !props.flat && !props.nested && (props.static ? 'hos-panel--default' : 'hos-panel--glass hos-panel--interactive'),
  props.flat && 'settings-card--flat hos-panel--flat',
  props.nested && 'settings-card--nested hos-panel--nested',
  props.static && 'settings-card--static',
  props.full && 'settings-card--full',
  props.elevated && 'settings-card--elevated',
  props.extraClass,
])
</script>
