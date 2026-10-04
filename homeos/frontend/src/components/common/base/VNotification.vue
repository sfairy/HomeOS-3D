/**
 * @file VNotification.vue
 * @module components/common/base
 * @description 全局通知组件。挂载于 ScaledViewport / app-shell 内，与整页等比缩放同步。
 *  从 chrome 读取通知列表并以 toast 形式渲染，点击任意通知即移除。
 *  依赖：chrome.store（通知状态）。
 */
<template>
  <div class="notification-container" role="region" aria-live="polite" aria-label="通知">
    <TransitionGroup name="toast">
      <div
        v-for="notif in chrome.notifications"
        :key="notif.id"
        role="alert"
        :class="['notification-item', notif.type]"
        @click="chrome.removeNotification(notif.id)"
      >
        <span class="icon" v-html="getIcon(notif.type)" />
        <span class="message">{{ notif.message }}</span>
        <span class="close-hint">×</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
/**
 * 职责：实现 VNotification 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { useChromeStore } from '@/stores/chrome.store'

const chrome = useChromeStore()

/**
 * 根据通知类型返回对应 SVG 图标字符串（通过 v-html 注入）。
 * @param type 通知类型：success / error / warning / 其它(info)
 * @returns SVG 字符串
 */
function getIcon(type) {
  switch (type) {
    case 'success':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
    case 'error':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
    case 'warning':
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
    default:
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
  }
}
</script>

<style scoped src="./styles/VNotification.css"></style>