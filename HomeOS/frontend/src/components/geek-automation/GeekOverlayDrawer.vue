<!--
  GeekOverlayDrawer.vue
  职责：geek-builder 系列编辑器共用的「覆盖层抽屉底座」组件。
       提供标题区 / 侧栏 / 主体 / 底栏组合，打开时启用焦点陷阱与 Escape 关闭，保证键盘可访问性。
  所属模块：geek-automation（被 Vars/Manage/Settings/Yaml/Wide/Templates 等抽屉复用）。
  关键依赖：useFocusTrap（焦点陷阱，限制 Tab 范围）。
  Props：
    - open：抽屉开关。
    - ariaLabel：无障碍标签。
    - title/subtitle：标题与副标题。
    - wide：是否宽抽屉模式。
    - drawerClass/bodyClass：抽屉壳与主体的附加 class。
  Emits：close —— 关闭抽屉（点击遮罩 / 点 ✕ / 按 Escape 均触发）。
  Slots：head-actions（标题区右侧动作按钮）/ side（侧栏）/ 默认（主体）/ footer（底部栏）。
-->
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 GeekOverlayDrawer 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
/**
 * Geek builder 共用覆盖层抽屉底座：标题区 / 侧栏 / 主体 / 底栏由 props 与 slot 组合
 * 打开时启用焦点陷阱与 Escape 关闭，保证键盘可访问性
 */
import { computed, ref, useSlots } from 'vue'
import { useFocusTrap } from '@/composables/ui/useFocusTrap'

const props = defineProps({
  open: { type: Boolean, default: false },
  ariaLabel: { type: String, default: '详情' },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  wide: { type: Boolean, default: false },
  drawerClass: { type: [String, Array, Object], default: '' },
  bodyClass: { type: [String, Array, Object], default: '' },
})

const emit = defineEmits(['close'])
const slots = useSlots()
const panelRef = ref(null)
const trapActive = computed(() => props.open)
useFocusTrap(panelRef, trapActive)

// 遮罩层键盘事件：Escape 关闭抽屉
function onOverlayKeydown(ev) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <div
    v-if="open"
    class="geek-builder__vars-overlay"
    role="presentation"
    @click.self="emit('close')"
    @keydown="onOverlayKeydown"
  >
    <aside
      ref="panelRef"
      class="geek-builder__vars-drawer"
      :class="[wide ? 'geek-builder__vars-drawer--wide' : null, drawerClass]"
      role="dialog"
      aria-modal="true"
      :aria-label="ariaLabel"
      tabindex="-1"
    >
      <header class="geek-builder__vars-drawer-head">
        <div>
          <strong>{{ title }}</strong>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <div v-if="slots['head-actions']" class="geek-builder__yaml-head-actions">
          <slot name="head-actions" />
          <button
            type="button"
            class="geek-builder__vars-close"
            :aria-label="'关闭'"
            @click="emit('close')"
          >
            {{ '✕' }}
          </button>
        </div>
        <button
          v-else
          type="button"
          class="geek-builder__vars-close"
          :aria-label="'关闭'"
          @click="emit('close')"
        >
          {{ '✕' }}
        </button>
      </header>
      <div class="geek-builder__vars-body" :class="bodyClass">
        <div v-if="slots.side" class="geek-builder__manage-side">
          <slot name="side" />
        </div>
        <slot />
      </div>
      <slot name="footer" />
    </aside>
  </div>
</template>
