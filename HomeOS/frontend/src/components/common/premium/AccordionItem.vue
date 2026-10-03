<template>
  <!-- PremiumAccordionItem 高级版手风琴项：可展开/收起的高级功能介绍项 -->
  <section :class="['premium-acc', isOpen && 'premium-acc--open', itemClass]">
    <button type="button" class="premium-acc-trigger" @click="toggle(id)">
      <span class="premium-acc-trigger-main">
        <span v-if="icon || $slots.icon" :class="['premium-acc-icon', iconToneClass]">
          <slot name="icon">
            <component :is="icon" class="w-3.5 h-3.5" />
          </slot>
        </span>
        <span class="premium-acc-label">{{ label }}</span>
        <span v-if="badge" class="premium-acc-badge">{{ badge }}</span>
        <span v-if="meta" class="premium-acc-meta">{{ meta }}</span>
      </span>
      <ChevronDown class="premium-acc-chevron" />
    </button>
    <div v-show="isOpen" class="premium-acc-panel">
      <div class="premium-acc-panel-inner">
        <slot />
      </div>
    </div>
  </section>
</template>

<script setup>
/**
 * PremiumAccordionItem - 高级版手风琴项组件
 * 功能特性：
 * - 可展开/收起的内容面板
 * - 标题和描述展示
 * - 支持图标
 * - 平滑过渡动画
 * 用于高级版功能介绍页面
 */
import { computed, inject } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { PREMIUM_ACC_KEY } from './accordion-context'

const props = defineProps({
  /** 子项唯一 id，与 Accordion 容器的 modelValue 对应 */
  id: { type: String, required: true },
  /** 触发器展示的标签文案 */
  label: { type: String, required: true },
  /** 触发器图标组件（也可用 #icon 插槽自定义） */
  icon: { type: [Object, Function], default: null },
  /** 图标色调：blue/violet/cyan/amber/green/red/purple */
  iconTone: {
    type: String,
    default: 'blue',
    validator: (v) => ['blue', 'violet', 'cyan', 'amber', 'green', 'red', 'purple'].includes(v),
  },
  /** 触发器右侧的徽标文案 */
  badge: { type: String, default: '' },
  /** 触发器右侧的次要信息文案 */
  meta: { type: String, default: '' },
  /** 根节点自定义 class */
  itemClass: { type: String, default: '' },
})

// 从父级 Accordion 容器注入上下文；缺失时抛错以提示使用方式
const ctx = inject(PREMIUM_ACC_KEY)
if (!ctx) throw new Error('PremiumAccordionItem 必须在 PremiumAccordion 内使用')

const { openId, toggle } = ctx

/** 当前项是否展开：比较注入的 openId 与自身 id */
const isOpen = computed(() => openId.value === props.id)
/** 图标色调 class：根据 iconTone 派生 */
const iconToneClass = computed(() => `premium-acc-icon--${props.iconTone}`)
</script>
