<script setup lang="ts">
import { useToastStore } from "@store/shared/stores/toast";

const toast = useToastStore();
</script>

<template>
  <div
    id="admin-toast"
    role="status"
    aria-live="polite"
    aria-atomic="false"
    aria-relevant="additions text"
    aria-label="后台通知"
    @mouseenter="toast.pauseAll"
    @mouseleave="toast.resumeAll"
    @focusin="toast.pauseAll"
    @focusout="toast.resumeAll"
  >
    <div
      v-for="item in toast.items"
      :key="item.id"
      class="admin-toast__item"
      :class="`is-${item.tone}`"
    >
      <span class="admin-toast__message">{{ item.message }}</span>
      <button
        type="button"
        class="admin-toast__close"
        :aria-label="`关闭通知：${item.message}`"
        @click="toast.dismiss(item.id)"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  </div>
</template>
