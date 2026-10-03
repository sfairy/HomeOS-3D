<!--
  GeekWideDrawer.vue
  职责：geek-builder 系列编辑器共用的「宽抽屉」外壳组件。
       宽模式（wide）；用于试运行、查重等需要更大展示空间的场景。
       默认带 dryrun 风格的抽屉壳/主体 class，可通过 props 覆盖。
  所属模块：geek-automation（被 DryRun / Duplicate 等场景复用）。
  关键依赖：GeekOverlayDrawer（实际抽屉实现，强制 wide 模式）。
  Props：
    - open：抽屉开关。
    - ariaLabel：无障碍标签。
    - title/subtitle：标题与副标题。
    - drawerClass/bodyClass：抽屉壳与主体的附加 class（默认 dryrun 样式）。
  Emits：close —— 关闭抽屉。
  Slots：head-actions（标题区右侧动作按钮）/ 默认（主体）/ footer（底部栏）。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekWideDrawer 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * Geek builder 宽抽屉壳（试运行 / 查重等）；#head-actions 注入标题栏右侧按钮
 */
import GeekOverlayDrawer from '@/components/geek-automation/GeekOverlayDrawer.vue'

defineProps({
  open: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '详情' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  drawerClass: {
    type: [String, Array, Object],
    default: 'geek-builder__dryrun-drawer',
  },
  bodyClass: { type: [String, Array, Object], default: 'geek-builder__dryrun-body' },
})

const emit = defineEmits(['close'])
</script>

<template>
  <GeekOverlayDrawer
    :open="open"
    wide
    :aria-label="ariaLabel"
    :title="title"
    :subtitle="subtitle"
    :drawer-class="drawerClass"
    :body-class="bodyClass"
    @close="emit('close')"
  >
    <template v-if="$slots['head-actions']" #head-actions>
      <slot name="head-actions" />
    </template>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </GeekOverlayDrawer>
</template>
