/**
 * @file Accordion.vue
 * @module common/premium
 * @description Premium 手风琴容器
 *  职责：
 *    - 管理子项展开/折叠状态（同一时刻仅一个展开）；
 *    - 支持 v-model 双向绑定当前展开项 id；
 *    - 通过 allowCollapse 控制是否允许全部折叠（无展开项）；
 *    - 通过 provide 向后代 AccordionItem 注入 openId 与 toggle 方法。
 *  依赖：vue provide/ref/watch，./accordion-context 的 PREMIUM_ACC_KEY。
 */
<template>
  <div class="premium-acc-stack" :class="stackClass">
    <slot />
  </div>
</template>

<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 Accordion 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { provide, ref, watch } from 'vue'
import { PREMIUM_ACC_KEY } from './accordion-context'

const props = defineProps({
  /** 当前展开项 id（v-model 绑定；undefined 时使用 defaultOpen） */
  modelValue: { type: [String, null], default: undefined },
  /** 默认展开项 id（仅在 modelValue 为 undefined 时生效） */
  defaultOpen: { type: String, default: null },
  /** 是否允许全部折叠（再次点击已展开项时是否收起） */
  allowCollapse: { type: Boolean, default: true },
  /** stack 容器自定义 class */
  stackClass: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue'])

/** 当前展开项 id（null 表示全部折叠） */
const openId = ref(props.modelValue ?? props.defaultOpen ?? null)

// 同步外部 modelValue 变化到内部状态（仅当外部传入非 undefined 时）
watch(
  () => props.modelValue,
  (v) => {
    if (v !== undefined) openId.value = v
  },
)

/**
 * 切换指定项的展开状态
 * 已展开且 allowCollapse 时收起；否则展开该项
 * @param {string} id 子项 id
 */
function toggle(id) {
  const next = openId.value === id ? (props.allowCollapse ? null : id) : id
  openId.value = next
  emit('update:modelValue', next)
}

// 通过 provide 向后代 AccordionItem 注入上下文
provide(PREMIUM_ACC_KEY, { openId, toggle })
</script>
