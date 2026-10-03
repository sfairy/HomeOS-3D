<!--
  GeekYamlPreviewDrawer.vue
  职责：geek-builder 系列编辑器共用的「YAML 预览抽屉」组件。
       宽模式（wide）；从当前画布实时编译并展示 YAML 文本，提供复制按钮。
       YAML 内容以 v-html 渲染（调用方传入已高亮处理的 HTML 字符串）。
  所属模块：geek-automation（被自动化/场景/脚本/模板的 YamlPreviewDrawer 复用）。
  关键依赖：GeekOverlayDrawer（实际抽屉实现，强制 wide 模式）。
  Props：
    - open：抽屉开关。
    - subtitle：副标题，默认「由当前画布实时编译」。
    - yamlHtml：已高亮处理的 YAML HTML 字符串。
  Emits：
    - close：关闭抽屉。
    - copy：点击「复制」按钮时触发，由调用方执行实际复制并反馈。
  Slots：head-actions 内置「复制」按钮（无需外部注入）。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekYamlPreviewDrawer 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * Geek builder 共用 YAML 预览抽屉
 */
import GeekOverlayDrawer from '@/components/geek-automation/GeekOverlayDrawer.vue'

defineProps({
  open: { type: Boolean, default: false },
  subtitle: { type: String, default: '由当前画布实时编译' },
  yamlHtml: { type: String, default: '' },
})

const emit = defineEmits(['close', 'copy'])
</script>

<template>
  <GeekOverlayDrawer
    :open="open"
    wide
    aria-label="YAML 预览"
    :title="'YAML 预览'"
    :subtitle="subtitle"
    drawer-class="geek-builder__yaml-drawer"
    body-class="geek-builder__yaml-body"
    @close="emit('close')"
  >
    <template #head-actions>
      <button type="button" class="list-page__btn list-page__btn--primary" @click="emit('copy')">
        {{ '复制' }}
      </button>
    </template>
    <pre class="geek-builder__yaml-code" v-html="yamlHtml"></pre>
  </GeekOverlayDrawer>
</template>
