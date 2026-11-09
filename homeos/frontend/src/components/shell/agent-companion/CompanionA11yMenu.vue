<!-- U04：键盘可达 Tips / Voice / Chat（指针手势仍走原路径） -->
<template>
  <div
    v-if="menuOpen"
    id="companion-a11y-menu"
    class="companion-a11y-menu"
    role="menu"
    aria-label="智能管家操作"
    @keydown="onMenuKeydown"
  >
    <button
      v-for="(item, index) in menuItems"
      :key="item.id"
      type="button"
      class="companion-a11y-menu__item"
      role="menuitem"
      :tabindex="menuIndex === index ? 0 : -1"
      @click="runMenuAction(item.id)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useCompanionA11yMenu } from './useCompanionA11yMenu'
import './companion-a11y-menu.css'

const props = defineProps<{
  canOpen: boolean
  chatOpen: boolean
  isListening: boolean
}>()

const emit = defineEmits<{
  tips: []
  voice: []
  chat: []
}>()

const {
  menuOpen,
  menuIndex,
  menuItems,
  menuAriaLabel,
  menuHint,
  closeA11yMenu,
  runMenuAction,
  onTriggerKeydown,
  onMenuKeydown,
} = useCompanionA11yMenu({
  getTrigger: () => document.querySelector<HTMLElement>('.companion-trigger[role="button"]'),
  canOpen: () => props.canOpen,
  chatOpen: () => props.chatOpen,
  isListening: () => props.isListening,
  onTips: () => emit('tips'),
  onVoice: () => emit('voice'),
  onChat: () => emit('chat'),
})

defineExpose({
  menuOpen,
  menuAriaLabel,
  menuHint,
  closeA11yMenu,
  onTriggerKeydown,
})
</script>
