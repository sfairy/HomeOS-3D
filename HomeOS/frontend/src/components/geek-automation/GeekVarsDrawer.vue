<!--
  GeekVarsDrawer.vue
  职责：geek-builder 系列编辑器共用的「变量管理抽屉」外壳组件（窄栏模式）。
       标题与副标题固定，主体内容由默认 slot 注入，可选 #footer。
  所属模块：geek-automation（被自动化/场景/脚本的 VarsDrawer 复用）。
  关键依赖：GeekOverlayDrawer（实际抽屉实现，未启用 wide 模式）。
  Props：
    - open：抽屉开关。
    - ariaLabel：无障碍标签。
    - title/subtitle：标题与副标题。
    - drawerClass/bodyClass：抽屉壳与主体的附加 class。
  Emits：close —— 关闭抽屉。
  Slots：默认（变量管理主体，通常为变量列表与声明表单）/ footer（底部栏）。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekVarsDrawer 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * Geek builder 变量抽屉壳（窄栏）；内容由默认 slot 注入，可选 #footer
 */
import GeekOverlayDrawer from '@/components/geek-automation/GeekOverlayDrawer.vue'

defineProps({
  open: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '变量管理' },
  title: { type: String, default: '变量' },
  subtitle: { type: String, default: '' },
  drawerClass: { type: [String, Array, Object], default: '' },
  bodyClass: { type: [String, Array, Object], default: '' },
})

const emit = defineEmits(['close'])
</script>

<template>
  <GeekOverlayDrawer
    :open="open"
    :aria-label="ariaLabel"
    :title="title"
    :subtitle="subtitle"
    :drawer-class="drawerClass"
    :body-class="bodyClass"
    @close="emit('close')"
  >
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </GeekOverlayDrawer>
</template>
