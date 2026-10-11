<!--
  设置页未保存修改操作条。展示待保存项数与文案，提供保存/取消按钮，保存中禁用并切换文案。
-->
<template>
  <span v-if="pending > 0" class="config-actions__pending">{{ pendingLabel }}</span>
  <button
    v-if="pending > 0"
    type="button"
    class="settings-btn-ghost"
    :disabled="saving"
    @click="emit('cancel')"
  >
    {{ cancelText }}
  </button>
  <button
    v-if="pending > 0"
    type="button"
    class="settings-btn-primary"
    :disabled="saving"
    @click="emit('save')"
  >
    {{ saving ? savingText : saveText }}
  </button>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  pending: { type: Number, default: 0 },
  saving: { type: Boolean, default: false },
  saveText: { type: String, default: '保存' },
  savingText: { type: String, default: '保存中…' },
  cancelText: { type: String, default: '取消修改' },
  pendingLabel: { type: String, default: '' },
})

const emit = defineEmits(['save', 'cancel'])

const pendingLabel = computed(
  () => props.pendingLabel || '{n} 项已修改'.replace('{n}', String(props.pending)),
)
</script>
