/**
 * @file VProgressBar.vue
 * @module components/common/base
 * @description 通用进度条组件。支持静态展示与交互式拖拽（slider 模式），
 *  支持多种配色变体、危险/警告态自动发光、键盘控制（方向键/Home/End）与 ARIA 无障碍。
 *  依赖：vue（computed/ref）、progress-bar.util（归一化与填充样式计算）。
 */
<template>
  <div
    :class="[
      'v-progress',
      sizeClass,
      {
        'v-progress--interactive': interactive,
        'v-progress--dragging': dragging,
      },
      trackClass,
    ]"
    :role="interactive ? 'slider' : 'progressbar'"
    :tabindex="interactive ? 0 : undefined"
    :aria-label="ariaLabel"
    :aria-valuenow="Math.round(displayPct)"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :aria-valuetext="ariaValueText"
    @click="onTrackClick"
    @keydown="onKeydown"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div
      class="v-progress__fill"
      :class="[fillClass, { 'v-progress__fill--glow': showGlow }]"
      :style="fillStyle"
    />
  </div>
</template>

<script setup>
/**
 * 职责：实现 VProgressBar 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { computed, ref } from 'vue'
import { normalizeProgressPct, progressFillStyle } from '@/utils/ui/progress-bar.util'

const props = defineProps({
  /** 当前值；默认按 0–100 解释，或通过 min/max 归一化 */
  value: { type: Number, default: 0 },
  /** 阈值类 variant 的颜色判定值（如余额金额） */
  colorValue: { type: Number, default: undefined },
  /** 最小值 */
  min: { type: Number, default: 0 },
  /** 最大值 */
  max: { type: Number, default: 100 },
  /** accent | success | warn | danger | budget | balance | resource | … */
  variant: { type: String, default: 'accent' },
  /** 自定义填充起始色 */
  color: { type: String, default: '' },
  /** 自定义填充结束色（渐变） */
  colorEnd: { type: String, default: '' },
  /** xs=3px sm=4px md=6px lg=8px */
  size: { type: String, default: 'sm' },
  /** 是否启用发光效果 */
  glow: { type: Boolean, default: false },
  /** 危险/警告态自动发光 */
  autoGlow: { type: Boolean, default: false },
  /** 是否启用交互（拖拽/点击 seek） */
  interactive: { type: Boolean, default: false },
  /** 无障碍标签 */
  ariaLabel: { type: String, default: '' },
  /** 无障碍 value text */
  ariaValueText: { type: String, default: '' },
  /** 轨道自定义类名 */
  trackClass: { type: [String, Array, Object], default: '' },
  /** 填充自定义类名 */
  fillClass: { type: [String, Array, Object], default: '' },
})

const emit = defineEmits(['seek', 'seek-start', 'seek-end'])

/** 是否正在拖拽 */
const dragging = ref(false)
/** 拖拽过程中的临时百分比 */
const dragPct = ref(null)
/** 标记刚结束拖拽，用于避免随后触发的 click 重复 seek */
const justDragged = ref(false)

// 展示百分比：拖拽中用临时值，否则按 value/min/max 归一化
const displayPct = computed(() => {
  if (dragging.value && dragPct.value != null) return dragPct.value
  return normalizeProgressPct(props.value, props.min, props.max)
})

const sizeClass = computed(() => `v-progress--${props.size}`)

// 填充样式：颜色、渐变、发光等由工具函数统一计算
const fillStyle = computed(() =>
  progressFillStyle({
    value: dragging.value && dragPct.value != null ? dragPct.value : props.value,
    min: props.min,
    max: props.max,
    variant: props.variant,
    color: props.color || undefined,
    colorEnd: props.colorEnd || undefined,
    colorValue: props.colorValue,
    glow: props.glow,
    autoGlow: props.autoGlow,
  }),
)

const showGlow = computed(() => props.glow || props.autoGlow)

/**
 * 根据指针事件计算轨道上的百分比位置。
 * @param e 指针事件
 * @returns 0–100 的百分比
 */
function pctFromEvent(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  if (!rect.width) return 0
  return Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
}

/**
 * 发射 seek 事件并更新拖拽临时值。
 * @param pct 百分比
 * @param isEnd 是否为结束（松开）阶段，结束时额外发射 seek-end
 */
function emitSeek(pct, isEnd = false) {
  dragPct.value = pct
  emit('seek', pct)
  if (isEnd) emit('seek-end', pct)
}

/**
 * 轨道点击处理：交互模式下点击即跳转，但拖拽中或刚拖拽完时忽略避免重复。
 * @param e 点击事件
 */
function onTrackClick(e) {
  if (!props.interactive || dragging.value || justDragged.value) return
  emitSeek(pctFromEvent(e), true)
}

/**
 * 指针按下：开始拖拽，捕获指针并发射 seek-start。
 * @param e 指针事件
 */
function onPointerDown(e) {
  if (!props.interactive || e.button !== 0) return
  e.currentTarget.setPointerCapture(e.pointerId)
  dragging.value = true
  emit('seek-start')
  emitSeek(pctFromEvent(e))
}

/**
 * 指针移动：拖拽过程中持续发射 seek。
 * @param e 指针事件
 */
function onPointerMove(e) {
  if (!props.interactive || !dragging.value) return
  emitSeek(pctFromEvent(e))
}

/**
 * 指针抬起：结束拖拽，发射 seek-end，并设置 justDragged 避免误触 click。
 * @param e 指针事件
 */
function onPointerUp(e) {
  if (!props.interactive || !dragging.value) return
  dragging.value = false
  emitSeek(pctFromEvent(e), true)
  dragPct.value = null
  // 标记刚结束拖拽，下一帧重置，避免随后的 click 事件重复 seek
  justDragged.value = true
  requestAnimationFrame(() => {
    justDragged.value = false
  })
  try {
    e.currentTarget.releasePointerCapture(e.pointerId)
  } catch {
    /* ignore：指针已释放或未捕获时忽略 */
  }
}

/**
 * 键盘控制：方向键步进（Shift 加速 10）、Home 归零、End 满值。
 * @param e 键盘事件
 */
function onKeydown(e) {
  if (!props.interactive) return
  const step = e.shiftKey ? 10 : 1
  let next = displayPct.value
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next += step
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next -= step
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = 100
  else return
  e.preventDefault()
  emitSeek(Math.min(100, Math.max(0, next)), true)
}
</script>

<style scoped src="./styles/VProgressBar.css"></style>