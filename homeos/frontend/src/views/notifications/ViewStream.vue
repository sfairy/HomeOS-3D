<!--
组件：NotificationsViewStream.vue
所属模块：frontend / src / views / notifications
职责：通知中心「消息流」面板。展示通知列表标题、结果摘要以及「全部已读 / 清空」
      操作入口，列表主体由 NotificationCenter 组件负责渲染。
关键依赖：
  - NotificationCenter：通知列表的渲染与状态切换
数据来源：父级页面透传的 resultSummary 文案与 unreadCount / canClear 状态
-->
<script setup>
/**
 * 职责：渲染 views/ViewStream 页面视图，整合子组件与业务数据。
 * 关键依赖：Vue Router、Pinia 全局状态、页面级子组件与 API services。
 * 约定：- 页面通过 onMounted 拉取数据，卸载时清理副作用；
  - 与子组件通信走 props/emit，不在视图层内直接写业务逻辑。
 */
import NotificationCenter from '@/components/widgets/system/NotificationCenter.vue'

// 入参：列表结果摘要、未读数、是否可清空（控制按钮可用性）
defineProps({
  resultSummary: { type: String, required: true },

  unreadCount: { type: Number, default: 0 },

  canClear: { type: Boolean, default: false },
})

// 对外事件：全部已读、清空全部通知
const emit = defineEmits(['mark-all-read', 'clear-all'])
</script>

<template>
  <section class="notifications-view__stream">
    <div class="notifications-view__stream-glow" aria-hidden="true" />

    <header class="notifications-view__stream-head">
      <div>
        <h2 class="notifications-view__stream-title">通知消息流</h2>

        <p class="notifications-view__stream-sub">{{ resultSummary }}</p>
      </div>

      <div class="notifications-view__stream-actions">
        <button
          type="button"
          class="list-page__link-btn"
          :disabled="unreadCount === 0"
          @click="emit('mark-all-read')"
        >
          {{ '全部已读' }}
        </button>

        <button
          type="button"
          class="list-page__link-btn notifications-view__clear-btn"
          :disabled="!canClear"
          @click="emit('clear-all')"
        >
          {{ '清空' }}
        </button>
      </div>
    </header>

    <div class="notifications-view__stream-body">
      <NotificationCenter page />
    </div>
  </section>
</template>
