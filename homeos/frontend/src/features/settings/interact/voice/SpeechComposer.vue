<!--
  语音合成模板编辑器。提供预设话术选择、自定义模板编辑、变量插入与播报预览，
  供语音命令、告警规则、每日问候等场景复用。
-->
<template>
  <div class="vsc-root" :class="{ 'vsc-root--compact': compact }">
    <div v-if="presets.length" class="vsc-presets">
      <button
        v-for="p in presets"
        :key="p.id"
        type="button"
        class="vsc-preset"
        :class="{ 'vsc-preset--active': activePreset === p.id }"
        @click="selectPreset(p.id)"
      >
        <span class="vsc-preset__label">{{ p.label }}</span>
        <span v-if="p.desc" class="vsc-preset__desc">{{ p.desc }}</span>
      </button>
    </div>

    <div
      v-if="activePreset === 'custom' || activePreset === 'fixed' || showCustomField"
      class="vsc-custom"
    >
      <label class="settings-form-label mb-1">{{ customLabel }}</label>
      <textarea
        :value="customText"
        class="vsc-textarea"
        :rows="compact ? 2 : 3"
        :placeholder="customPlaceholder"
        @input="$emit('update:customText', $event.target.value)"
      />
      <div v-if="showVarChips && varChips.length" class="vsc-chips">
        <span class="vsc-chips__label">{{ '插入：' }}</span>
        <button
          v-for="chip in varChips"
          :key="chip.key"
          type="button"
          class="vsc-chip"
          @click="insertVar(chip.key)"
        >
          {{ chip.label }}
        </button>
      </div>
    </div>

    <div v-if="previewText" class="vsc-preview">
      <Volume2 class="vsc-preview__icon" />
      <div class="min-w-0">
        <span class="vsc-preview__eyebrow">{{ '播报预览' }}</span>
        <p class="vsc-preview__text">{{ previewText }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Volume2 } from '@lucide/vue'
import { applyTemplatePreview } from '@/shared/voice/utils/speech.util'

const props = defineProps({
  presets: { type: Array, default: () => [] },
  activePreset: { type: String, default: 'default' },
  customText: { type: String, default: '' },
  previewTemplate: { type: String, default: '' },
  previewVars: { type: Object, default: () => ({}) },
  defaultPreview: { type: String, default: '' },
  customLabel: { type: String, default: '' },
  customPlaceholder: { type: String, default: '' },
  showVarChips: { type: Boolean, default: false },
  varChips: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false },
  showCustomField: { type: Boolean, default: false },
})

const emit = defineEmits(['update:activePreset', 'update:customText', 'insert-var'])

const previewText = computed(() => {
  if (props.activePreset === 'default' && props.defaultPreview) return props.defaultPreview
  const tpl = props.previewTemplate
  if (!tpl) return props.defaultPreview || ''
  return applyTemplatePreview(tpl, props.previewVars) || props.defaultPreview || tpl
})

function selectPreset(id) {
  emit('update:activePreset', id)
}

function insertVar(key) {
  emit('insert-var', key)
}
</script>

<style scoped src="./styles/SpeechComposer.css"></style>
