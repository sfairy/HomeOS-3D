/**
 * @file AnchoredPopupShell.vue
 * @module components/entities/popups
 *
 * 锚定弹窗外壳（底层承载组件）
 *
 * 职责：
 * - 提供两种渲染模式：
 *   1) centered 模式（由上层通过 provide('entityPopupCentered') 注入）：直接内联渲染，不 Teleport
 *   2) 默认模式：Teleport 到 #teleport-target，依据锚点坐标定位
 * - 计算并应用锚点定位样式（useEntityPopupAnchor）、箭头样式与 wrapper/inner 类名
 * - 阻断点击/触摸事件的冒泡，避免误触发背景关闭；支持滑动关闭指令 v-swipe-close
 * - 通过 useKeepAliveGate 感知 keep-alive 场景，必要时禁用 Teleport 以避免被缓存
 *
 * 依赖：
 * - vue: computed / inject / useAttrs
 * - @lucide/vue: X（关闭按钮图标）
 * - @/composables/entity/useEntityPopupAnchor: 锚点定位计算
 * - @/composables/ui/useKeepAliveGate: keep-alive 门控
 *
 * 设计说明：
 * - inheritAttrs 关闭，手动透传非 class/style 的 attrs 到 wrapper，避免落到根元素
 * - pointerOnInner 控制锚点箭头/指针挂载位置（媒体弹窗挂在 inner，普通弹窗挂在 wrapper）
 */
<template>
  <!-- centered 模式：内联渲染，不经过 Teleport -->
  <div
    v-if="centered"
    ref="shellRef"
    role="dialog"
    :aria-modal="trapFocus ? 'true' : undefined"
    :aria-label="ariaLabel || undefined"
    :class="innerClasses"
    :style="innerStyle"
    @click.stop
    @mousedown.stop
    @mouseup.stop
    @touchstart.stop.passive
    @touchend.stop
    v-swipe-close="innerSwipeClose ? () => $emit('close') : undefined"
  >
    <!-- 可选关闭按钮：仅在传入 closeClass 时渲染 -->
    <button
      v-if="closeClass"
      type="button"
      :class="closeClass"
      :aria-label="'关闭'"
      @click="$emit('close')"
    >
      <X class="w-4 h-4" />
    </button>
    <slot />
  </div>
  <!-- 默认模式：Teleport 到全局挂载点，按锚点定位 -->
  <Teleport v-else :to="teleportTarget" :disabled="teleportDisabled">
    <div
      ref="shellRef"
      role="dialog"
      :aria-modal="trapFocus ? 'true' : undefined"
      :aria-label="ariaLabel || undefined"
      :class="wrapperClasses"
      v-bind="passthroughAttrs"
      :style="wrapperStyle"
      @click.stop
      @mousedown.stop
      @mouseup.stop
      @touchstart.stop.passive
      @touchend.stop
      v-swipe-close="() => $emit('close')"
    >
      <!-- 锚点箭头：仅在 fixed 锚点模式下渲染到 wrapper -->
      <div v-if="useAnchor" class="popup-arrow" :style="arrowStyle" />
      <div
        :class="innerClasses"
        :style="innerStyle"
        v-swipe-close="innerSwipeClose ? () => $emit('close') : undefined"
      >
        <!-- 可选关闭按钮：仅在传入 closeClass 时渲染 -->
        <button
          v-if="closeClass"
          type="button"
          :class="closeClass"
          :aria-label="'关闭'"
          @click="$emit('close')"
        >
          <X class="w-4 h-4" />
        </button>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
<script setup>
/**
 * 所属模块：frontend/components
 * 职责：实现 AnchoredPopupShell 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed, inject, onBeforeUnmount, onMounted, ref, useAttrs } from 'vue'
import { X } from '@lucide/vue'
import { useEntityPopupAnchor } from '@/composables/entity/useEntityPopupAnchor'
import { useKeepAliveGate } from '@/composables/ui/useKeepAliveGate'
import { useShellTeleportTarget } from '@/composables/ui/useShellTeleportTarget'

// 关闭 inheritAttrs，attrs 由 passthroughAttrs 手动透传到 wrapper
defineOptions({ inheritAttrs: false })

const attrs = useAttrs()
const { teleportDisabled: keepAliveTeleportDisabled } = useKeepAliveGate()
const { teleportTarget, shellTeleportPending } = useShellTeleportTarget()
const teleportDisabled = computed(
  () => keepAliveTeleportDisabled.value || shellTeleportPending.value,
)

const props = defineProps({
  // 锚点百分比横坐标（0-100），用于百分比定位模式
  xPct: { type: [Number, String], default: 50 },
  // 锚点百分比纵坐标（0-100），用于百分比定位模式
  yPct: { type: [Number, String], default: 50 },
  // 固定像素锚点横坐标，非 null 时启用 fixed 锚点模式
  anchorX: { type: Number, default: null },
  // 固定像素锚点纵坐标，非 null 时启用 fixed 锚点模式
  anchorY: { type: Number, default: null },
  // 弹窗宽度（像素），用于边界翻转计算
  width: { type: Number, required: true },
  // 弹窗高度（像素），用于边界翻转计算
  height: { type: Number, required: true },
  // 弹窗与视口边缘的最小间距
  margin: { type: Number, default: 16 },
  // inner 容器的自定义类名
  innerClass: { type: [String, Array], default: '' },
  // 关闭按钮类名，为空则不渲染关闭按钮
  closeClass: { type: String, default: '' },
  // inner 区域是否独立启用滑动关闭（媒体弹窗内部滚动时为 false）
  innerSwipeClose: { type: Boolean, default: false },
  /** 百分比锚点时箭头挂在 inner（媒体弹窗）；fixed 锚点始终用 wrapper 上的 .popup-arrow */
  pointerOnInner: { type: Boolean, default: false },
  // inner 容器的内联样式
  innerStyle: { type: Object, default: () => ({}) },
  /** 可访问性：弹窗语义标签（读屏播报） */
  ariaLabel: { type: String, default: '' },
  /** 可访问性：启用焦点陷阱与 Escape 关闭（默认开启） */
  trapFocus: { type: Boolean, default: true },
})

const emit = defineEmits(['close'])

// 上层可通过 provide('entityPopupCentered', true) 切换为居中内联模式
const centered = inject('entityPopupCentered', false)

// 计算锚点定位：useAnchor 标识是否使用 fixed 锚点；anchorStyle 为 wrapper 定位样式；
// popupClass 为根据方位/翻转结果附加的类名集合；arrowStyle 为箭头位置样式
const { useAnchor, anchorStyle, popupClass, arrowStyle } = useEntityPopupAnchor(
  props,
  () => props.width,
  () => props.height,
  props.margin,
)

/**
 * wrapper 容器类名集合
 * 合并：基础类 + 透传 class + 指针目标类 + fixed 锚点类 + 方位类
 * @returns {string[]}
 */
const wrapperClasses = computed(() => {
  const classes = ['popup-anchored', 'popup-wrapper']
  if (attrs.class) classes.push(attrs.class)
  // 非媒体弹窗（pointerOnInner=false）时，wrapper 承载指针/箭头目标
  if (!props.pointerOnInner) classes.push('popup-pointer-target')
  if (useAnchor.value) classes.push('popup-wrapper--fixed')
  classes.push(...popupClass.value)
  return classes
})

/**
 * inner 容器类名集合
 * 媒体弹窗在百分比模式下将指针目标挂到 inner
 * @returns {string[]}
 */
const innerClasses = computed(() => {
  const classes = [props.innerClass]
  if (props.pointerOnInner && !useAnchor.value) classes.push('popup-pointer-target')
  return classes
})

/**
 * 透传给 wrapper 的属性集合
 * 剔除 class 与 style（class 已并入 wrapperClasses，style 由 wrapperStyle 接管）
 * @returns {Object}
 */
const passthroughAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

// wrapper 定位样式直接取锚点计算结果
const wrapperStyle = computed(() => anchorStyle.value)

// ──────── 弹窗可访问性：焦点陷阱 + Escape 关闭 ────────
const shellRef = ref(null)
/** 弹窗打开前的活动元素，关闭时恢复焦点 */
let previousFocus = null

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

function handleShellKeydown(e) {
  if (e.key === 'Escape' && props.trapFocus) {
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key !== 'Tab' || !props.trapFocus) return
  const root = shellRef.value
  if (!root) return
  const focusables = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
  if (focusables.length === 0) {
    e.preventDefault()
    return
  }
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  const root = shellRef.value
  if (!root || !props.trapFocus) return
  previousFocus = document.activeElement
  // 允许整体接收焦点（focus()），但不进入 Tab 序列
  root.setAttribute('tabindex', '-1')
  root.addEventListener('keydown', handleShellKeydown)
  // 延迟聚焦，避免打断上层渲染动画/自动聚焦逻辑
  requestAnimationFrame(() => {
    if (root.isConnected && !root.contains(document.activeElement)) {
      root.focus({ preventScroll: true })
    }
  })
})

onBeforeUnmount(() => {
  const root = shellRef.value
  root?.removeEventListener('keydown', handleShellKeydown)
  if (previousFocus && document.contains(previousFocus)) {
    previousFocus.focus({ preventScroll: true })
  }
  previousFocus = null
})
</script>

<style scoped>
@import '@/assets/styles/anchored-popup-shells.css';
</style>