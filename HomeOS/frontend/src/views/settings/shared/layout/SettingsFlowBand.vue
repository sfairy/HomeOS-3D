<!--
组件：SettingsFlowBand.vue
所属模块：frontend / src / views / settings / shared / layout
职责：设置页流程概览条。横向展示数据流步骤（输入 → 匹配 → 执行 → 输出），支持折叠/展开、
      摘要文案与 #stats 插槽（统计指标）。可折叠时收起为单行摘要。
Props：
  - steps：SettingsFlowStep[] 流程步骤
  - hint：右侧提示文案
  - bandClass / collapsible / defaultCollapsed / toggleLabel / collapsedSummary / collapsedSummaryTone：外观与折叠配置
导出类型：
  - SettingsFlowStep：流程步骤定义（label / meta / icon / tone）
关键依赖：@lucide/vue 的 ChevronDown（折叠箭头）
数据来源：父级透传的 steps 与 slots.stats
-->
<template>
  <div
    class="settings-flow-band"
    :class="[bandClass, collapsible && 'settings-flow-band--collapsible', collapsed && 'settings-flow-band--collapsed']"
  >
    <button
      v-if="collapsible"
      type="button"
      class="settings-flow-band__toggle"
      :aria-expanded="!collapsed"
      @click="collapsed = !collapsed"
    >
      <span class="settings-flow-band__toggle-main">
        <span class="settings-flow-band__toggle-label">{{ toggleLabel }}</span>
        <span
          v-if="collapsed && collapsedSummary"
          class="settings-flow-band__toggle-summary"
          :class="collapsedSummaryTone && `settings-flow-band__toggle-summary--${collapsedSummaryTone}`"
          :title="collapsedSummary"
        >{{ collapsedSummary }}</span>
      </span>
      <ChevronDown
        class="settings-flow-band__chevron"
        :class="{ 'settings-flow-band__chevron--open': !collapsed }"
      />
    </button>

    <div v-show="!collapsed" class="settings-flow-overview">
      <div class="settings-flow">
        <template v-for="(step, index) in steps" :key="step.id ?? `${step.label}-${index}`">
          <div v-if="index > 0" class="settings-flow__arrow" aria-hidden="true">→</div>
          <div
            class="settings-flow__node"
            :class="step.tone ? `settings-flow__node--${step.tone}` : undefined"
          >
            <component :is="step.icon" class="settings-flow__icon" />
            <span class="settings-flow__label">{{ step.label }}</span>
            <span v-if="step.meta" class="settings-flow__meta" :title="step.meta">{{ step.meta }}</span>
          </div>
        </template>
      </div>

      <div v-if="hasStatsSlot" class="hub-stat-row settings-flow-overview__stats settings-flow-hub">
        <slot name="stats" />
      </div>

      <p v-if="hint" class="settings-flow-band__hint">{{ hint }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useSlots, watch } from 'vue'
import type { Component } from 'vue'
import { ChevronDown } from '@lucide/vue'

/** SettingsFlowStep：类型定义，字段语义见声明。 */
export type SettingsFlowStep = {
  id?: string
  label: string
  meta?: string
  icon: Component
  tone?: 'in' | 'mid' | 'exec' | 'out' | 'sky' | 'accent' | 'secondary' | 'amber' | 'emerald'
}

const props = withDefaults(
  defineProps<{
    steps: SettingsFlowStep[]
    hint?: string
    bandClass?: string
    collapsible?: boolean
    defaultCollapsed?: boolean
    toggleLabel?: string
    collapsedSummary?: string
    collapsedSummaryTone?: 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'
  }>(),
  {
    collapsible: false,
    defaultCollapsed: false,
    toggleLabel: '流程概览',
  },
)

const slots = useSlots()
const hasStatsSlot = computed(() => Boolean(slots.stats))

const collapsed = ref(Boolean(props.defaultCollapsed && props.collapsible))

watch(
  () => props.defaultCollapsed,
  (v) => {
    if (props.collapsible) collapsed.value = Boolean(v)
  },
)

const toggleLabel = computed(() => props.toggleLabel || '流程概览')
</script>

<style src="../styles/settings-flow-band.css"></style>
