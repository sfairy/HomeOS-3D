<!--
  组件文件：WidgetConfigFooter.vue
  所属模块：frontend/src/features/settings/display/widgets
  组件职责：小部件配置面板底部统一操作栏（Footer 级小组件），左侧显示草稿提示与脏态
    标记，右侧提供可选取消按钮与固定保存按钮；允许通过 slot 插入额外操作（如全屏编辑入口）。
  主要 props / emits：
    - props saveLabel / dirtyLabel / cancelLabel：自定义按钮文案
    - props layoutHint / showLayoutHint：草稿需二次保存的提示文案与是否显示
    - props dirty：是否显示「有未保存更改」标记
    - props showCancel / cancelDisabled：是否显示取消按钮及是否禁用
    - emit save：点击保存按钮触发
    - emit cancel：点击取消按钮触发
  依赖关系：纯 UI 子组件，无 store 与外部 API。
  注意事项：默认不显示取消按钮（showCancel=false），需要时由父组件传参开启。
-->
<script setup>
/**
 * 职责：渲染 views/WidgetConfigFooter 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { Save } from '@lucide/vue'

defineProps({
  saveLabel: { type: String, default: '保存配置' },
  layoutHint: {
    type: String,
    default: '写入当前编辑态；需点击页头「保存布局」才会持久化。',
  },
  showLayoutHint: { type: Boolean, default: true },
  dirty: { type: Boolean, default: false },
  dirtyLabel: { type: String, default: '有未保存更改' },
  showCancel: { type: Boolean, default: false },
  cancelLabel: { type: String, default: '取消' },
  cancelDisabled: { type: Boolean, default: false },
})

defineEmits(['save', 'cancel'])
</script>

<template>
  <footer class="widget-config-footer">
    <div v-if="showLayoutHint || dirty" class="widget-config-footer__meta">
      <span v-if="dirty" class="widget-config-footer__dirty">{{ dirtyLabel }}</span>
      <p v-if="showLayoutHint" class="widget-config-footer__hint">{{ layoutHint }}</p>
    </div>
    <div class="widget-config-footer__actions">
      <slot />
      <button
        v-if="showCancel"
        type="button"
        class="widget-config-footer__ghost"
        :disabled="cancelDisabled"
        @click="$emit('cancel')"
      >
        <span>{{ cancelLabel }}</span>
      </button>
      <button type="button" class="widget-config-footer__save" @click="$emit('save')">
        <Save class="widget-config-footer__save-icon" aria-hidden="true" />
        <span>{{ saveLabel }}</span>
      </button>
    </div>
  </footer>
</template>
<style src="../styles/layout-panels.css"></style>
