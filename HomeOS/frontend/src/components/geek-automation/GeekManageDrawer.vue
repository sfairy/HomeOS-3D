<!--
  GeekManageDrawer.vue
  职责：geek-builder 系列编辑器共用的「管理抽屉」外壳组件。
       基于 GeekOverlayDrawer，承载 title/subtitle/side/footer/默认插槽，由领域填充具体内容。
  所属模块：geek-automation（被自动化、场景、脚本、模板的 ManageDrawer 复用）。
  关键依赖：GeekOverlayDrawer（实际抽屉实现）。
  Props：
    - open：抽屉开关。
    - ariaLabel：无障碍标签。
    - title/subtitle：抽屉标题与副标题。
    - drawerClass/bodyClass：抽屉壳与主体的附加 class。
  Emits：close —— 关闭抽屉。
  Slots：side（左侧栏）/ footer（底部栏）/ 默认（主体内容）。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekManageDrawer 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * Geek builder 共用管理抽屉壳：侧栏与主体内容由 slot 注入
 */
import GeekOverlayDrawer from '@/components/geek-automation/GeekOverlayDrawer.vue'

defineProps({
  open: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '管理' },
  title: { type: String, default: '管理' },
  subtitle: { type: String, default: '' },
  drawerClass: { type: [String, Array, Object], default: '' },
  bodyClass: { type: [String, Array, Object], default: '' },
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
    :drawer-class="['geek-builder__manage', drawerClass]"
    :body-class="['geek-builder__manage-body', bodyClass]"
    @close="emit('close')"
  >
    <template v-if="$slots.side" #side>
      <slot name="side" />
    </template>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </GeekOverlayDrawer>
</template>
