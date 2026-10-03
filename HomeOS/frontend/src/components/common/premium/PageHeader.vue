<template>
  <!-- PremiumPageHeader 高级版页面头部：展示高级版标题、描述和升级按钮 -->
  <header
    class="premium-head premium-head--bar"
    :class="headerClass"
    :style="{ '--head-accent': accent }"
  >
    <div v-if="showGlow" class="premium-head__glow" aria-hidden="true" />
    <div class="premium-head__inner">
      <div class="premium-head__main">
        <div v-if="icon || $slots.icon" class="premium-head__orb">
          <slot name="icon">
            <component :is="icon" class="w-[18px] h-[18px]" />
          </slot>
        </div>
        <div class="premium-head__text">
          <p v-if="eyebrow" class="premium-head__eyebrow">{{ eyebrow }}</p>
          <h2 class="premium-head__title">{{ title }}</h2>
          <p v-if="subtitle" class="premium-head__desc">{{ subtitle }}</p>
        </div>
      </div>
      <div v-if="$slots.actions" class="premium-head__actions">
        <slot name="actions" />
      </div>
      <button
        v-if="closable"
        type="button"
        class="premium-head__close"
        :aria-label="closeLabel"
        @click="$emit('close')"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  </header>
</template>

<script setup>
/**
 * PremiumPageHeader - 高级版页面头部组件
 * 功能特性：
 * - 展示高级版标题和副标题
 * - 展示功能亮点
 * - 升级按钮
 * - 用于高级版相关页面的顶部
 */
import { X } from '@lucide/vue'

defineProps({
  /** 标题文案 */
  title: { type: String, required: true },
  /** 副标题文案 */
  subtitle: { type: String, default: '' },
  /** 眉标文案（标题上方小字） */
  eyebrow: { type: String, default: '' },
  /** 头部图标组件（也可用 #icon 插槽自定义） */
  icon: { type: [Object, Function], default: null },
  /** 强调色 */
  accent: { type: String, default: '#0A84FF' },
  /** 根节点自定义 class */
  headerClass: { type: String, default: '' },
  /** 是否展示 glow 装饰 */
  showGlow: { type: Boolean, default: true },
  /** 是否展示关闭按钮 */
  closable: { type: Boolean, default: false },
  /** 关闭按钮的 aria-label */
  closeLabel: { type: String, default: '关闭' },
})

defineEmits(['close'])
</script>
