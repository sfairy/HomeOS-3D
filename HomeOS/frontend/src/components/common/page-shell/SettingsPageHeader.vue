/**
 * @file SettingsPageHeader.vue
 * @module common/page-shell
 * @description 页面顶部 Hero 头部（原 settings/shared/layout/SettingsPageHeader.vue）
 *  职责：
 *    - 默认单行布局：图标 + 标题 · 描述，不再两行占高；
 *    - 支持 eyebrow 眉标、actions 操作插槽；
 *    - 图标可由 props.icon 直接传入，或按 iconKey / tab 从注册表解析。
 *  依赖：vue computed，utils/registry/settings-header-icons。
 */
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
/**
 * 所属模块：frontend/components
 * 职责：实现 SettingsPageHeader 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed } from 'vue'
import {
  SETTINGS_HEADER_ICONS,
  SETTINGS_TAB_HEADER_ICONS,
} from '@/utils/registry/settings-header-icons'

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
