<!--
  小部件配置面板底部统一操作栏（Footer 级小组件），左侧显示草稿提示与脏态
  标记，右侧提供可选取消按钮与固定保存按钮；允许通过 slot 插入额外操作（如全屏编辑入口）。
  注意事项：默认不显示取消按钮（showCancel=false），需要时由父组件传参开启。
-->
<script setup>
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
