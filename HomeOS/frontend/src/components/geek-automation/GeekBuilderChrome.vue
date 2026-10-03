<!--
  GeekBuilderChrome.vue
  职责：geek-builder 系列编辑器（自动化/场景/脚本/模板）共享的顶栏外壳组件。
       承载名称输入 + 通用动作按钮（管理 / 设置 / 保存 / YAML / 关闭），
       并通过三个插槽供各域自定义按钮（actions-before / actions-mid / actions-after）。
  所属模块：geek-automation（被自动化、场景、脚本、模板 Builder 复用）。
  Props：
    - namePlaceholder：名称输入框 placeholder。
    - manageActive/settingsActive/yamlActive：对应按钮高亮态。
    - saving/saveDisabled/saveLabel：保存按钮的状态与文案。
    - dismissLabel/dismissTitle：退出按钮文案与悬停提示。
    - showSettings：是否显示设置按钮。
    - nameClass：名称输入框附加 class。
  v-model：name —— 双向绑定当前编辑器对象名称。
  Emits：manage / settings / save / yaml / dismiss。
  Slots：main（标题区扩展）、actions-before / actions-mid / actions-after（按钮簇扩展）。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekBuilderChrome 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * Geek builder 顶栏壳：名称 + 通用动作簇；域按钮放入 #actions-before / #actions-mid / #actions-after
 */
defineProps({
  namePlaceholder: { type: String, default: '名称' },
  manageActive: { type: Boolean, default: false },
  settingsActive: { type: Boolean, default: false },
  yamlActive: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  saveDisabled: { type: Boolean, default: false },
  saveLabel: { type: String, default: '' },
  dismissLabel: { type: String, default: '关闭' },
  dismissTitle: { type: String, default: '' },
  showSettings: { type: Boolean, default: true },
  nameClass: { type: String, default: '' },
})

const name = defineModel('name', { type: String, default: '' })

defineEmits(['manage', 'settings', 'save', 'yaml', 'dismiss'])
</script>

<template>
  <header class="geek-builder__chrome">
    <div class="geek-builder__chrome-main">
      <input
        v-model="name"
        class="geek-builder__name"
        :class="nameClass"
        type="text"
        :placeholder="namePlaceholder"
        autocomplete="off"
      />
      <slot name="main" />
    </div>
    <div class="geek-builder__actions">
      <slot name="actions-before" />
      <button
        type="button"
        class="list-page__btn"
        :class="manageActive && 'is-active'"
        @click="$emit('manage')"
      >
        {{ '管理' }}
      </button>
      <button
        v-if="showSettings"
        type="button"
        class="list-page__btn"
        :class="settingsActive && 'is-active'"
        @click="$emit('settings')"
      >
        {{ '设置' }}
      </button>
      <slot name="actions-mid" />
      <button
        type="button"
        class="list-page__btn list-page__btn--primary"
        :disabled="saveDisabled || saving"
        @click="$emit('save')"
      >
        {{ saveLabel || (saving ? '保存中…' : '保存') }}
      </button>
      <button
        type="button"
        class="list-page__btn"
        :class="yamlActive && 'is-active'"
        @click="$emit('yaml')"
      >
        {{ 'YAML' }}
      </button>
      <slot name="actions-after" />
      <button
        type="button"
        class="list-page__link-btn"
        :title="dismissTitle || dismissLabel"
        @click="$emit('dismiss')"
      >
        {{ dismissLabel }}
      </button>
    </div>
  </header>
</template>
