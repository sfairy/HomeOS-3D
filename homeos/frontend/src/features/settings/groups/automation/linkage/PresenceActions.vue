<script setup>
import { RefreshCw, Save } from '@lucide/vue'

/**
 * 人员判定的「刷新 / 保存」按钮组。
 *
 * 抽出来的原因：`PresenceSection` 的完整头部与嵌入态工具条各有一份逐字相同的两按钮块
 * （含 `:disabled` 绑定、aria-label 与「保存中…」文案）。按钮态分散在两处时，加一个
 * `:disabled` 或改一次文案都可能只落到其中一边。
 */
defineProps({
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
})

defineEmits(['refresh', 'save'])
</script>

<template>
  <div class="linkage-presence-actions">
    <button
      type="button"
      class="settings-btn-ghost linkage-presence-actions__refresh"
      :disabled="loading"
      :aria-label="'刷新人员状态'"
      @click="$emit('refresh')"
    >
      <RefreshCw class="w-3.5 h-3.5" />
    </button>
    <button
      type="button"
      class="settings-btn-accent linkage-presence-actions__save"
      :disabled="saving"
      @click="$emit('save')"
    >
      <Save class="w-3.5 h-3.5" />
      {{ saving ? '保存中…' : '保存' }}
    </button>
  </div>
</template>
