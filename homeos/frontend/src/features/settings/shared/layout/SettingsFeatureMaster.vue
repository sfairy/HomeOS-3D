<!--
组件：SettingsFeatureMaster.vue
所属模块：frontend / src / views / settings / shared / layout
职责：设置页功能总开关条。位于 FlowBand 下方，展示功能图标、标题、提示文案与 #actions 插槽（开关/按钮），
      按色调（tone）与激活态（active）高亮。勿放入 SettingsFlowBand 内。
Props：
  - title：功能标题
  - hint：提示文案
  - icon：功能图标组件
  - active：开启态高亮（勿命名为 on，会与 Vue 事件对象冲突）
  - tone：色调（sky / rose / amber / info / accent / emerald）
关键依赖：vue 的 Component 类型
数据来源：父级透传的 props 与 #actions 插槽
-->
<template>
  <div
    class="settings-feature-master"
    :class="[
      `settings-feature-master--${tone}`,
      active && 'settings-feature-master--on',
    ]"
  >
    <div class="settings-feature-master__main">
      <div v-if="icon || $slots.icon" class="settings-feature-master__icon" aria-hidden="true">
        <slot name="icon">
          <component :is="icon" class="settings-feature-master__icon-svg" />
        </slot>
      </div>
      <div class="settings-feature-master__copy">
        <p class="settings-feature-master__title">{{ title }}</p>
        <p v-if="hint || $slots.hint" class="settings-feature-master__hint">
          <slot name="hint">{{ hint }}</slot>
        </p>
      </div>
    </div>
    <div v-if="$slots.actions" class="settings-feature-master__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    title: string
    hint?: string
    icon?: Component
    /** 开启态高亮（勿命名为 on，会与 Vue 事件对象冲突） */
    active?: boolean
    tone?: 'sky' | 'rose' | 'amber' | 'info' | 'accent' | 'emerald'
  }>(),
  {
    active: false,
    tone: 'sky',
  },
)
</script>

<style src="../styles/settings-feature-master.css"></style>
