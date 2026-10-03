<!--
组件：SpeechComposer.vue
所属模块：frontend / src / views / settings / interact / voice
职责：语音合成模板编辑器。提供预设话术选择、自定义模板编辑、变量插入与播报预览，
      供语音命令、告警规则、每日问候等场景复用。
Props：
  - presets：预设话术列表（id / label / desc）
  - activePreset：当前选中的预设 id
  - customText：自定义模板文本
  - previewTemplate / previewVars：预览模板与变量
  - defaultPreview：默认预览文案
  - customLabel / customPlaceholder：自定义输入标签与占位
  - showVarChips / varChips：是否显示变量插入按钮及变量列表
  - compact：紧凑模式
  - showCustomField：强制显示自定义输入
Emits：
  - update:activePreset：切换预设
  - update:customText：自定义文本变更
  - insert-var：插入变量
关键依赖：
  - applyTemplatePreview：模板变量渲染为预览文本
数据来源：父级透传的 props
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
import { applyTemplatePreview } from '@/utils/voice/speech.util'

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
