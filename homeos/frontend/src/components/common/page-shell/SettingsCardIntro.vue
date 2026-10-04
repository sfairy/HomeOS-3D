/**
 * @file SettingsCardIntro.vue
 * @module common/page-shell
 * @description 卡片引言区（原 settings/shared/layout/SettingsCardIntro.vue）
 *  职责：
 *    - 统一渲染图标球、眉标、标题、描述；
 *    - 提供 desc / actions 两个具名插槽；
 *    - 通过 bordered 控制是否带底部分隔。
 *  依赖：vue，外部传入的 icon 组件。
 */
<template>
  <div :class="['settings-card-intro', bordered && 'settings-card-intro--bordered', extraClass]">
    <div :class="['settings-icon-orb shrink-0', orbClass]">
      <component :is="icon" :class="['w-6 h-6', iconClass]" />
    </div>
    <div class="settings-card-intro__body min-w-0">
      <p v-if="eyebrow" class="settings-card-intro__eyebrow">{{ eyebrow }}</p>
      <h3 v-if="title" class="settings-card-intro__title">{{ title }}</h3>
      <p v-if="description" class="settings-card-intro__desc" :title="description">
        {{ description }}
      </p>
      <slot name="desc" />
    </div>
    <div v-if="$slots.actions" class="settings-card-intro__actions shrink-0">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
/**
 * 职责：实现 SettingsCardIntro 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
defineProps({
  /** 头部图标组件或渲染函数 */
  icon: { type: [Object, Function], required: true },
  /** 标题文案 */
  title: { type: String, default: '' },
  /** 描述文案 */
  description: { type: String, default: '' },
  /** 眉标文案（标题上方小字） */
  eyebrow: { type: String, default: '' },
  /** 图标自定义 class */
  iconClass: { type: String, default: '' },
  /** 图标球自定义 class */
  orbClass: { type: String, default: 'bg-white/[0.04] border border-white/[0.06]' },
  /** 容器自定义 class */
  extraClass: { type: String, default: '' },
  /** 是否带底部分隔线 */
  bordered: { type: Boolean, default: false },
})
</script>
