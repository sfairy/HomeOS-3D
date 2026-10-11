<!--
  设置 Hub 子导航。横向 Tab 按钮列表，支持图标、emoji 与徽章，按 accent 着色激活项。
-->
<template>
  <nav :class="['settings-hub-subnav', navClass]">
    <button
      v-for="sec in sections"
      :key="sec.id"
      type="button"
      class="settings-hub-subnav__btn"
      :class="{ 'settings-hub-subnav__btn--active': modelValue === sec.id }"
      :style="sec.accent ? { '--hub-accent': sec.accent } : undefined"
      @click="$emit('update:modelValue', sec.id)"
    >
      <span v-if="sec.emoji" class="settings-hub-subnav__emoji">{{ sec.emoji }}</span>
      <component v-else-if="sec.icon" :is="sec.icon" class="w-3.5 h-3.5 shrink-0" />
      <span>{{ sec.label }}</span>
      <span v-if="sec.badge != null && sec.badge !== ''" class="settings-hub-subnav__badge">{{
        sec.badge
      }}</span>
    </button>
  </nav>
</template>

<script setup>
defineProps({
  modelValue: { type: String, required: true },
  sections: { type: Array, required: true },
  navClass: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>
