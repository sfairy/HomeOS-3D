<!--
组件：SettingsPendingSaveAction.vue
所属模块：frontend / src / views / settings / shared
职责：设置页未保存修改操作条。展示待保存项数与文案，提供保存/取消按钮，保存中禁用并切换文案。
Props：
  - pending：待保存修改数（为 0 时隐藏）
  - saving：是否保存中
  - saveText / savingText / cancelText：按钮文案
  - pendingLabel：待保存项描述
Emits：
  - save / cancel
关键依赖：computed（计算是否显示）
数据来源：父级透传的 pending / saving
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
