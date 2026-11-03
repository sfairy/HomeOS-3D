<!-- 设置页管家对话的单条气泡：附件 / 结构化确认 / 复制与重新生成 -->
<template>
  <article
    v-if="message.role === 'user' || !message.streaming || message.text.trim()"
    :class="['agent-chat-bubble', `agent-chat-bubble--${message.role}`]"
  >
    <div
      class="agent-chat-bubble__avatar"
      :class="
        message.role === 'user'
          ? 'agent-chat-bubble__avatar--user'
          : 'agent-chat-bubble__avatar--bot'
      "
    >
      <User v-if="message.role === 'user'" class="w-3.5 h-3.5" />
      <Sparkles v-else class="w-3.5 h-3.5" />
    </div>
    <div class="agent-chat-bubble__main">
      <header class="agent-chat-bubble__head">
        <span class="agent-chat-bubble__name">{{ message.role === 'user' ? '你' : '管家' }}</span>
        <span
          v-if="message.outcome"
          class="agent-chat-bubble__pill"
          :data-tone="chatOutcomeTone(message.outcome)"
        >
          {{ chatOutcomeLabel(message.outcome) }}
        </span>
      </header>
      <div
        class="agent-chat-bubble__body"
        :class="{ 'agent-chat-bubble__body--streaming': message.streaming }"
      >{{ message.text }}</div>
      <div v-if="message.attachments?.length" class="agent-chat-bubble__attachments">
        <a
          v-for="(att, ai) in message.attachments"
          :key="`${att.url}-${ai}`"
          :href="att.url"
          target="_blank"
          rel="noopener noreferrer"
          class="agent-chat-bubble__attachment"
        >
          <img :src="att.url" :alt="att.name || '摄像头快照'" loading="lazy" />
        </a>
      </div>
      <div v-if="message.confirmation && !message.confirmationAnswered" class="agent-chat-bubble__confirm">
        <button
          type="button"
          class="agent-chat-bubble__confirm-btn agent-chat-bubble__confirm-btn--ok"
          :disabled="busy"
          @click="emit('confirm', true)"
        >
          {{ message.confirmation.confirmText }}
        </button>
        <button
          type="button"
          class="agent-chat-bubble__confirm-btn"
          :disabled="busy"
          @click="emit('confirm', false)"
        >
          {{ message.confirmation.cancelText }}
        </button>
      </div>
      <div
        v-if="message.role === 'assistant' && !message.streaming && message.text.trim()"
        class="agent-chat-bubble__actions"
      >
        <button
          type="button"
          class="agent-chat-bubble__action"
          title="复制"
          aria-label="复制回复"
          @click="emit('copy')"
        >
          <Copy class="w-3.5 h-3.5" />
        </button>
        <button
          v-if="!message.attachments?.length"
          type="button"
          class="agent-chat-bubble__action"
          title="重新生成"
          aria-label="重新生成回复"
          :disabled="busy"
          @click="emit('regenerate')"
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </button>
      </div>
      <footer v-if="message.meta" class="agent-chat-bubble__meta">{{ message.meta }}</footer>
    </div>
  </article>
</template>

<script setup lang="ts">
import { Copy, RotateCcw, Sparkles, User } from '@lucide/vue'
import {
  chatOutcomeLabel,
  chatOutcomeTone,
} from '@/features/settings/interact/composables/agent-panel-helpers.internals'
import type { ChatLogEntry } from '@/features/settings/interact/composables/agent-panel-chat.internals'

defineProps<{
  message: ChatLogEntry
  /** 生成中：确认 / 重新生成按钮禁用，避免重复提交 */
  busy: boolean
}>()

const emit = defineEmits<{
  copy: []
  regenerate: []
  confirm: [accepted: boolean]
}>()
</script>
