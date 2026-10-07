/**
 * @file VNotification.vue
 * @module components/common/base
 * @description 全局通知组件。挂载于 ScaledViewport / app-shell 内，与整页等比缩放同步。
 *  从 chrome 读取通知列表并以 toast 形式渲染；点击卡片或关闭按钮移除。
 *  无障碍与交互反馈：按类型拆成 assertive（error/warning）与 polite 两档**常驻** live region，
 *  礼貌级别不再被父区域压成 polite；卡片可聚焦，Enter / Space / Esc 直接关闭；
 *  鼠标悬停与键盘聚焦期间暂停自动关闭计时（计时器由 chrome.store 的 pause/resumeNotification 管理）。
 *  依赖：chrome.store（通知状态）。
 */
<template>
  <!-- 两个**常驻** live region（assertive / polite）。
       为什么不能只用一个 aria-live="polite" 包住全部卡片：live region 的礼貌级别由最近的
       祖先区域决定，把 role="alert" 的卡片塞进 polite 容器，错误提示会被降级为 polite
       （排在当前播报之后才念），与「立即打断」的意图相反。分区域后各档互不覆盖。
       区域常驻是硬要求：内容变化只在**已存在**的 live region 内才会被播报；
       空档零高度，不产生布局跳动。 -->
  <div class="notification-container">
    <div
      v-for="band in notificationBands"
      :key="band.live"
      class="notification-live"
      :aria-live="band.live"
    >
      <TransitionGroup name="toast">
        <!-- 悬停 / 聚焦暂停自动关闭（计时器由 chrome.store 的 pause/resumeNotification 管理）；
             Enter / Space / Esc 直接关闭，读屏用户不必再去找关闭按钮。
             聚焦即暂停也顺带解决了「Tab 落到 3 秒后自己消失的提示上」——焦点在时不会被移除。 -->
        <div
          v-for="notif in band.items"
          :key="notif.id"
          :role="band.live === 'assertive' ? 'alert' : 'status'"
          tabindex="0"
          :class="['notification-item', notif.type]"
          @click="chrome.removeNotification(notif.id)"
          @keydown.enter.prevent="chrome.removeNotification(notif.id)"
          @keydown.space.prevent="chrome.removeNotification(notif.id)"
          @keydown.esc.prevent="chrome.removeNotification(notif.id)"
          @mouseenter="chrome.pauseNotification(notif.id)"
          @mouseleave="chrome.resumeNotification(notif.id)"
          @focusin="chrome.pauseNotification(notif.id)"
          @focusout="chrome.resumeNotification(notif.id)"
        >
          <span class="icon" aria-hidden="true" v-html="getIcon(notif.type)" />
          <span class="message">{{ notif.message }}</span>
          <button
            type="button"
            class="notification-item__close"
            :aria-label="`关闭通知：${notif.message}`"
            @click.stop="chrome.removeNotification(notif.id)"
          >
            ×
          </button>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup>
/**
 * 职责：实现 VNotification 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed } from 'vue'

import { useChromeStore } from '@/stores/chrome.store'

const chrome = useChromeStore()

/** 需要「立刻打断」的提示类型：错误与警告走 assertive 区域。 */
const ASSERTIVE_TYPES = new Set(['error', 'warning'])

/**
 * 把通知按播报礼貌级别分成两档。
 *
 * 分组的唯一目的是让 live region 的礼貌级别可控：`aria-live` 由**最近的祖先区域**决定，
 * 单个 polite 容器里放 role="alert" 卡片是无法提升为 assertive 的。
 * 两档都常驻（见模板注释），只切 items；档内顺序仍是投放顺序（store 用 push）。
 *
 * @returns 两个固定档位：assertive（error / warning）与 polite（其余）
 */
const notificationBands = computed(() => [
  { live: 'assertive', items: chrome.notifications.filter((n) => ASSERTIVE_TYPES.has(n.type)) },
  { live: 'polite', items: chrome.notifications.filter((n) => !ASSERTIVE_TYPES.has(n.type)) },
])

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