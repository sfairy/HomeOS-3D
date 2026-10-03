/**
 * 组件：LoadErrorBanner.vue
 *
 * 所属模块：frontend / src / views / settings / automate / linkage
 * 职责：联动配置加载失败时的错误横幅。展示错误信息并提供重试按钮。
 * 关键依赖：无
 * 数据来源：父级透传的 error / loading
 */
<script setup>
/**
 * 所属模块：frontend/views
 * 职责：渲染 views/LoadErrorBanner 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import { AlertCircle } from '@lucide/vue'

// 入参：错误信息文案、是否加载中（重试按钮禁用态）
defineProps({
  error: { type: String, default: '' },
  loading: { type: Boolean, default: false },
})

// 对外事件：重试加载
defineEmits(['retry'])
</script>

<template>
  <div class="settings-premium-empty settings-premium-empty--amber mb-4">
    <AlertCircle class="settings-premium-empty__icon" />
    <p class="settings-premium-empty__title">{{ '联动配置加载失败' }}</p>
    <p class="settings-premium-empty__desc">{{ error }}</p>
    <div class="settings-premium-empty__actions">
      <button
        type="button"
        class="settings-premium-empty__btn settings-premium-empty__btn--accent"
        :disabled="loading"
        @click="$emit('retry')"
      >
        {{ '重试' }}
      </button>
    </div>
  </div>
</template>
