/** - 默认单行布局：图标 + 标题 · 描述，不再两行占高； */
<template>
  <header
    :class="[
      'premium-head',
      'premium-head--card',
      'premium-head--inline',
      'settings-hero',
      compact && 'premium-head--compact',
      wrapperClass,
    ]"
    :style="{ '--hero-accent': accent, '--head-accent': accent }"
  >
    <div class="premium-head__accent" aria-hidden="true" />
    <div class="premium-head__glow" aria-hidden="true" />
    <div class="premium-head__main">
      <div v-if="resolvedIcon" class="premium-head__orb">
        <component :is="resolvedIcon" class="w-5 h-5" />
      </div>
      <div class="premium-head__text premium-head__text--inline">
        <p v-if="eyebrow" class="premium-head__eyebrow premium-head__eyebrow--inline">{{ eyebrow }}</p>
        <h1 class="premium-head__title">{{ title }}</h1>
        <p
          v-if="description"
          class="premium-head__desc premium-head__desc--inline"
          :title="description"
        >
          {{ description }}
        </p>
      </div>
    </div>
    <div v-if="$slots.actions" class="premium-head__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import {
  SETTINGS_HEADER_ICONS,
  SETTINGS_TAB_HEADER_ICONS,
} from '@/shared/utils/registry/settings-header-icons'
// 设置页页头样式（premium-head）：随设置壳懒加载，不计入首屏 CSS。
import '@/assets/styles/premium-head.css'
// `.settings-shell` 折叠面板样式：只有设置壳会用到。
import '@/assets/styles/premium-accordion.css'

const props = defineProps({
  /** 标题文案 */
  title: { type: String, required: true },
  /** 描述文案（单行省略） */
  description: { type: String, default: '' },
  /** 眉标文案 */
  eyebrow: { type: String, default: '' },
  /** 直接传入的图标组件（优先级最高） */
  icon: { type: [Object, Function], default: null },
  /** 图标注册表 key，用于从 SETTINGS_HEADER_ICONS 解析 */
  iconKey: { type: String, default: '' },
  /** 设置 tab 标识，用于从 SETTINGS_TAB_HEADER_ICONS 解析默认图标 */
  tab: { type: String, default: '' },
  /** 强调色（同时作为 hero-accent 与 head-accent） */
  accent: { type: String, default: '#5fd4ff' },
  /** 是否紧凑布局 */
  compact: { type: Boolean, default: false },
  /** 容器自定义 class */
  wrapperClass: { type: String, default: '' },
})

/** 解析最终图标：优先 props.icon，其次 iconKey，最后按 tab 查表 */
const resolvedIcon = computed(
  () =>
    props.icon ||
    SETTINGS_HEADER_ICONS[props.iconKey] ||
    (props.tab ? SETTINGS_TAB_HEADER_ICONS[props.tab] : null) ||
    null,
)
</script>
