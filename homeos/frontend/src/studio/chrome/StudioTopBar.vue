<!--
  Studio / Editor 共用顶栏：返回、标题、保存态、主操作槽位。
  消费 hos token（via studio-chrome.css）。
-->
<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, Keyboard, PanelLeft, PanelRight } from '@lucide/vue'

const props = defineProps<{
  title: string
  eyebrow?: string
  backLabel?: string
  dirty?: boolean
  saveState?: string
  showLeftToggle?: boolean
  showRightToggle?: boolean
  leftCollapsed?: boolean
  rightCollapsed?: boolean
}>()

const emit = defineEmits<{
  back: []
  toggleLeft: []
  toggleRight: []
  shortcuts: []
}>()

const saveLabel = computed(() => {
  if (props.saveState === 'saving') return '保存中…'
  if (props.dirty || props.saveState === 'dirty') return '未保存'
  if (props.saveState === 'saved') return '已保存'
  if (props.saveState === 'error') return '保存失败'
  return '就绪'
})

const saveClass = computed(() => {
  if (props.saveState === 'saving') return 'sc-save-badge--saving'
  if (props.dirty || props.saveState === 'dirty') return 'sc-save-badge--dirty'
  return ''
})
</script>

<template>
  <header class="sc-topbar">
    <div class="sc-topbar__brand">
      <img
        src="/static/assets/icons/homeos-mark-white-orange.svg"
        alt=""
        width="36"
        height="28"
      />
      <div class="sc-topbar__brand-text">
        <p v-if="eyebrow" class="sc-topbar__eyebrow">{{ eyebrow }}</p>
        <h1 class="sc-topbar__title">{{ title }}</h1>
      </div>
    </div>

    <div class="sc-topbar__nav">
      <button type="button" class="sc-btn sc-btn--ghost" @click="emit('back')">
        <ArrowLeft class="w-3.5 h-3.5" />
        {{ backLabel || '返回' }}
      </button>
      <button
        v-if="showLeftToggle"
        type="button"
        class="sc-btn sc-btn--icon"
        :class="{ 'sc-btn--active': !leftCollapsed }"
        :aria-pressed="!leftCollapsed"
        title="切换左侧面板"
        @click="emit('toggleLeft')"
      >
        <PanelLeft class="w-3.5 h-3.5" />
      </button>
      <button
        v-if="showRightToggle"
        type="button"
        class="sc-btn sc-btn--icon"
        :class="{ 'sc-btn--active': !rightCollapsed }"
        :aria-pressed="!rightCollapsed"
        title="切换右侧面板"
        @click="emit('toggleRight')"
      >
        <PanelRight class="w-3.5 h-3.5" />
      </button>
    </div>

    <div class="sc-topbar__center">
      <slot name="center" />
    </div>

    <div class="sc-topbar__actions">
      <span class="sc-save-badge" :class="saveClass">
        <i class="sc-save-badge__dot" aria-hidden="true" />
        {{ saveLabel }}
      </span>
      <button
        type="button"
        class="sc-btn sc-btn--icon"
        title="快捷键"
        @click="emit('shortcuts')"
      >
        <Keyboard class="w-3.5 h-3.5" />
      </button>
      <slot name="actions" />
    </div>
  </header>
</template>
