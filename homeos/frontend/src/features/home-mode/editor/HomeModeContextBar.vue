<script setup>
import { computed } from 'vue'

const props = defineProps({
  contextLoadWarnings: { type: Array, default: () => [] },
  contextPills: { type: Array, required: true },
  embedded: { type: Boolean, default: false },
})

/** 嵌入设置页时默认折叠，把纵向空间留给编辑区 */
const isDefaultCollapsed = computed(() => props.embedded)
// DockPanel 摘要文本：将各 pill 的「标签 值」用 · 拼接
const dockSummary = computed(() =>
  props.contextPills.map((pill) => `${pill.label} ${pill.value}`).join(' · '),
)
const emit = defineEmits(['pill-click'])

// 点击带 section 的 pill 时向上透传 section 标识，用于跳转到对应分区
function onPillClick(pill) {
  if (pill.section) emit('pill-click', pill.section)
}
</script>

<template>
  <div v-if="contextLoadWarnings.length" class="px-6 py-2 shrink-0">
    <div class="settings-inline-hint settings-inline-hint--amber text-xs">
      <span>{{ '部分上下文加载失败：' }}{{ contextLoadWarnings.join('、') }}</span>
    </div>
  </div>

  <details
    v-if="embedded"
    class="hm-context-dock"
    :open="!isDefaultCollapsed"
  >
    <summary class="hm-context-dock__summary">{{ '上下文概览' }} · {{ dockSummary }}</summary>
    <div class="hm-context-pills px-6 py-3 shrink-0">
      <div
        v-for="pill in contextPills"
        :key="pill.id"
        :class="[
          'hm-context-pill',
          pill.tone && `hm-context-pill--${pill.tone}`,
          pill.section && 'hm-context-pill--clickable',
        ]"
        :role="pill.section ? 'button' : undefined"
        :tabindex="pill.section ? 0 : undefined"
        @click="onPillClick(pill)"
        @keydown.enter.prevent="onPillClick(pill)"
        @keydown.space.prevent="onPillClick(pill)"
      >
        <div class="hm-context-pill__icon">
          <component :is="pill.icon" class="w-3.5 h-3.5" />
        </div>
        <div class="hm-context-pill__body">
          <span class="hm-context-pill__label">{{ pill.label }}</span>
          <span class="hm-context-pill__val">{{ pill.value }}</span>
        </div>
      </div>
    </div>
  </details>

  <div v-else class="hm-context-pills px-6 py-3 shrink-0">
    <div
      v-for="pill in contextPills"
      :key="pill.id"
      :class="[
        'hm-context-pill',
        pill.tone && `hm-context-pill--${pill.tone}`,
        pill.section && 'hm-context-pill--clickable',
      ]"
      :role="pill.section ? 'button' : undefined"
      :tabindex="pill.section ? 0 : undefined"
      @click="onPillClick(pill)"
      @keydown.enter.prevent="onPillClick(pill)"
      @keydown.space.prevent="onPillClick(pill)"
    >
      <div class="hm-context-pill__icon">
        <component :is="pill.icon" class="w-3.5 h-3.5" />
      </div>
      <div class="hm-context-pill__body">
        <span class="hm-context-pill__label">{{ pill.label }}</span>
        <span class="hm-context-pill__val">{{ pill.value }}</span>
      </div>
    </div>
  </div>
</template>
