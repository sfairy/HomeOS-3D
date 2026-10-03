<!--
组件：SettingsSectionHead.vue
所属模块：frontend / src / views / settings / shared / layout
职责：设置区块标题栏。展示图标圆环、眉题、标题、描述与 #actions 插槽，支持边框与 iconKey 图标解析。
Props：
  - title / description / eyebrow：标题/描述/眉题
  - bordered：是否显示底边
  - icon / iconKey / iconClass / orbClass：图标配置
关键依赖：
  - SETTINGS_HEADER_ICONS：按 iconKey 解析图标
数据来源：父级透传的 props
-->
<template>
  <div :class="['settings-section-head', bordered && 'settings-section-head--bordered']">
    <div v-if="resolvedIcon" :class="['settings-icon-orb shrink-0', orbClass]">
      <component :is="resolvedIcon" :class="['w-5 h-5', iconClass]" />
    </div>
    <div class="min-w-0 flex-1">
      <p v-if="eyebrow" class="settings-section-eyebrow">{{ eyebrow }}</p>
      <h2 class="settings-section-title">{{ title }}</h2>
      <p
        v-if="description || $slots.description"
        class="settings-section-desc"
        :title="description || undefined"
      >
        <slot name="description">{{ description }}</slot>
      </p>
    </div>
    <div v-if="$slots.actions || $slots.collapse" class="settings-section-actions shrink-0">
      <div v-if="$slots.collapse" class="settings-section-head__collapse">
        <slot name="collapse" />
      </div>
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { SETTINGS_HEADER_ICONS } from '@/utils/registry/settings-header-icons'

const props = defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  eyebrow: { type: String, default: '' },
  bordered: { type: Boolean, default: false },
  icon: { type: [Object, Function], default: null },
  iconKey: { type: String, default: '' },
  iconClass: { type: String, default: '' },
  orbClass: { type: String, default: 'bg-white/[0.04] border border-white/[0.06]' },
})

const resolvedIcon = computed(
  () => props.icon || (props.iconKey ? SETTINGS_HEADER_ICONS[props.iconKey] : null) || null,
)
</script>
