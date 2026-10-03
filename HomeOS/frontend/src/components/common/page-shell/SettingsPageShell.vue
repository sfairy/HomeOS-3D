/**
 * @file SettingsPageShell.vue
 * @module common/page-shell
 * @description 页面壳层通用组件（原 settings/shared/layout/SettingsPageShell.vue）
 *  职责：
 *    - 统一渲染顶部 Hero 头部、子导航、tabs、主体与底部移动端保存条；
 *    - 标题/描述可由 props 显式传入，或按 tab 从 settings-nav 注册表解析；
 *    - 通过 activeTab 控制显隐（非当前 tab 时 v-show 隐藏以保留状态）；
 *    - 主体支持滚动容器（scrollBody）或舞台布局（stage）；
 *    - 宽屏栏数布局由 layout 控制（stack/single/triple）。
 *  依赖：vue computed/useSlots，page-shell/SettingsPageHeader，utils/registry/settings-nav.util。
 */
<template>
  <div
    v-show="active"
    :class="[
      'settings-page',
      'settings-page--flush',
      'hos-fade-up',
      compact && 'settings-page--compact',
      pageClass,
    ]"
    :style="{ '--page-accent': accent }"
  >
    <div v-if="ambient" class="settings-page-ambient" aria-hidden="true" />

    <div v-if="hasHeaderBlock" class="settings-page-inset settings-page-inset--top">
      <slot name="header">
        <SettingsPageHeader
          v-if="displayTitle"
          :icon-key="iconKey"
          :icon="icon"
          :tab="tab"
          :title="displayTitle"
          :description="displayDescription"
          :accent="accent"
          :compact="true"
          :eyebrow="eyebrow"
          wrapper-class="settings-hero--inline"
        >
          <template v-if="$slots.actions" #actions>
            <slot name="actions" />
          </template>
        </SettingsPageHeader>
      </slot>
      <slot name="below-header" />
    </div>

    <div v-if="slots.subnav" class="settings-page-inset settings-page-inset--subnav">
      <slot name="subnav" />
    </div>

    <slot name="rail" />

    <slot name="tabs" />

    <div v-if="scrollBody" :class="['settings-page-inset settings-page-inset--scroll', bodyClass]">
      <div :class="stackClasses">
        <slot />
      </div>
    </div>
    <div v-else :class="['settings-page__stage', bodyClass]">
      <slot />
    </div>

    <slot name="overlay" />

    <div v-if="$slots['mobile-save']" class="settings-page-mobile-save">
      <slot name="mobile-save" />
    </div>
  </div>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 SettingsPageShell 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed, useSlots } from 'vue'
import SettingsPageHeader from '@/components/common/page-shell/SettingsPageHeader.vue'
import { pageTitle, pageDescription } from '@/utils/registry/settings-nav.util'

const props = defineProps({
  /** 当前激活的 tab 标识（用于控制本页显隐） */
  activeTab: { type: String, default: '' },
  /** 本页对应的 tab 标识 */
  tab: { type: String, required: true },
  /** 显式标题（覆盖注册表默认值） */
  title: { type: String, default: '' },
  /** 显式描述（覆盖注册表默认值） */
  description: { type: String, default: '' },
  /** 眉标文案 */
  eyebrow: { type: String, default: '' },
  /** 图标注册表 key */
  iconKey: { type: String, default: '' },
  /** 直接传入的图标组件 */
  icon: { type: [Object, Function], default: null },
  /** 强调色 */
  accent: { type: String, default: '#0A84FF' },
  /** 整体紧凑布局 */
  compact: { type: Boolean, default: false },
  /** 头部紧凑布局 */
  headerCompact: { type: Boolean, default: false },
  /** 页面根节点自定义 class */
  pageClass: { type: String, default: '' },
  /** 主体容器自定义 class */
  bodyClass: { type: String, default: '' },
  /** 主体是否走滚动容器布局 */
  scrollBody: { type: Boolean, default: true },
  /** stack | single | triple — 宽屏栏数布局 */
  layout: { type: String, default: 'stack' },
  /** 是否展示氛围装饰 */
  ambient: { type: Boolean, default: true },
})

const slots = useSlots()
/** 当前 tab 是否激活（决定 v-show 显隐） */
const active = computed(() => props.activeTab === props.tab)
/** 实际展示的标题：优先 props，否则查注册表 */
const displayTitle = computed(() => props.title || pageTitle(props.tab))
/** 实际展示的描述：优先 props，否则查注册表 */
const displayDescription = computed(() => props.description || pageDescription(props.tab))
/** 是否存在头部块：标题存在或任一头部插槽被使用 */
const hasHeaderBlock = computed(() =>
  Boolean(displayTitle.value || slots.header || slots['below-header'] || slots.actions),
)
/** 主体 stack 容器的 class：根据 compact 与 layout 组合 */
const stackClasses = computed(() => [
  'settings-page-stack',
  'page-enter-stagger',
  props.compact && 'settings-page-stack--compact',
  props.layout === 'single' && 'settings-page-stack--single',
  props.layout === 'triple' && 'settings-page-stack--triple',
])
</script>
