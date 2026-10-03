<!--
组件：SmartServicesLoadError.vue
所属模块：frontend / src / views / settings / interact / smart-services
职责：智能服务加载错误提示。在区段数据加载失败时展示错误标题、描述与重试按钮。
Props：
  - title：错误标题（必填）
  - message：错误描述
  - retryText：重试按钮文案，默认「重试」
  - onRetry：重试回调，为空时不显示按钮
关键依赖：
  - AlertCircle：错误图标
  - settings-premium-empty 样式：空态布局
数据来源：父级透传的 props
-->
<template>
  <div class="mt-4 settings-premium-empty settings-premium-empty--rose smart-svc-state">
    <AlertCircle class="settings-premium-empty__icon" />
    <p class="settings-premium-empty__title">{{ title }}</p>
    <p class="settings-premium-empty__desc">{{ message }}</p>
    <div v-if="onRetry" class="settings-premium-empty__actions">
      <button
        type="button"
        class="settings-premium-empty__btn settings-premium-empty__btn--accent"
        @click="onRetry"
      >
        {{ retryText }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { AlertCircle } from '@lucide/vue'

defineProps({
  title: { type: String, required: true },
  message: { type: String, default: '' },
  retryText: { type: String, default: '重试' },
  onRetry: { type: Function, default: null },
})
</script>
