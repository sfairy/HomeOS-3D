<!--
  通知中心「消息流」面板。展示通知列表标题、结果摘要以及「全部已读 / 清空」
  操作入口，列表主体由 NotificationCenter 组件负责渲染。
-->
<script setup>
import NotificationCenter from '@/components/widgets/system/NotificationCenter.vue'

defineProps({
  resultSummary: { type: String, required: true },

  unreadCount: { type: Number, default: 0 },

  canClear: { type: Boolean, default: false },
})

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
