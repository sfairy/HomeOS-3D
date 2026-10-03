<!--
  GeekSettingsDrawer.vue
  职责：geek-builder 系列编辑器共用的「设置抽屉」外壳组件。
       基于 GeekOverlayDrawer，标题区固定，表单内容由默认 slot 注入。
  所属模块：geek-automation（被自动化、场景、脚本、模板的 SettingsDrawer 复用）。
  关键依赖：GeekOverlayDrawer（实际抽屉实现）。
  Props：
    - open：抽屉开关。
    - ariaLabel：无障碍标签。
    - title/subtitle：标题与副标题。
    - drawerClass/bodyClass：抽屉壳与主体的附加 class。
  Emits：close —— 关闭抽屉。
  Slots：默认（主体表单）/ footer（底部栏）。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekSettingsDrawer 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * Geek builder 共用设置抽屉壳：标题区固定，表单内容由默认 slot 注入
 */
import GeekOverlayDrawer from '@/components/geek-automation/GeekOverlayDrawer.vue'

defineProps({
  open: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '设置' },
  title: { type: String, default: '设置' },
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
    :drawer-class="['geek-builder__settings-drawer', drawerClass]"
    :body-class="['geek-builder__settings-body', bodyClass]"
    @close="emit('close')"
  >
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </GeekOverlayDrawer>
</template>
