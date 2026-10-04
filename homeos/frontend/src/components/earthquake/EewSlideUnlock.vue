/**
 * @file EewSlideUnlock.vue
 * @module components/earthquake
 * @brief 地震预警滑动解锁组件
 *
 * 职责：
 * - 在地震预警覆盖层底部提供"滑动解锁"交互，确认用户已避险后关闭警报
 * - 通过 pointer 事件把拖拽起点与轨道 DOM 透传给父组件（EarthquakeAlertOverlay），
 *   由父组件统一管理拖拽进度与解锁判定，避免在子组件维护冗余状态
 * - 进度可视化由 CSS 变量 --progress 驱动（0~1），配合 fill / glow / handle 表现拖拽反馈
 *
 * 依赖：
 * - @lucide/vue：图标库（ChevronRight / ShieldCheck）
 * - 外部样式 ./styles/EewSlideUnlock.css
 */
<template>
  <!-- 滑动解锁外层容器，承接 $attrs.class 用于父组件布局微调 -->
  <div class="eew-slide-wrap" :class="$attrs.class">
    <!-- 引导文案：仅在用户已避险后操作 -->
    <p class="eew-slide-hint">确认安全后滑动解锁以关闭警报</p>
    <!--
      滑动轨道：
      - dragging / near / ready 三个状态类驱动不同视觉强度
        * near：进度 >= 85%，临近解锁阈值，加强发光
        * ready：进度 >= 98%，几乎到位，触发吸附动画
      - --progress 为 CSS 自定义属性，控制 fill 宽度与 handle 位移
    -->
    <div
      ref="trackEl"
      class="eew-slide-track"
      :class="{
        'eew-slide-track--dragging': dragging,
        'eew-slide-track--near': progress >= 85,
        'eew-slide-track--ready': progress >= 98,
      }"
      :style="{ '--progress': progress / 100 }"
      @pointerdown="onStart"
    >
      <!-- 背景辉光，强化"接近完成"的视觉反馈 -->
      <div class="eew-slide-track__glow" aria-hidden="true" />
      <!-- 已滑动填充条，宽度跟随 --progress -->
      <div class="eew-slide-fill" aria-hidden="true" />
      <!-- 终点处的盾牌图标，提示解锁后的"安全"状态 -->
      <div class="eew-slide-end" aria-hidden="true">
        <ShieldCheck class="eew-slide-end__icon" />
      </div>
      <!--
        可拖拽手柄：
        - 拖拽中（dragging）时高亮，并跟随 --progress 平移
        - ring 提供呼吸光晕，chevron 提示滑动方向
      -->
      <div
        class="eew-slide-handle"
        :class="{ 'eew-slide-handle--active': dragging }"
        aria-hidden="true"
      >
        <span class="eew-slide-handle__ring" />
        <ChevronRight class="eew-slide-chevron" />
      </div>
      <!--
        居中提示文案：
        进度 > 12% 后隐藏，避免与手柄重叠；未开始拖拽时作为引导
      -->
      <span class="eew-slide-label" :class="{ 'eew-slide-label--hidden': progress > 12 }">
        滑动解锁解除警报
      </span>
    </div>
  </div>
</template>

<script setup>
/**
 * 职责：实现 EewSlideUnlock 组件的界面渲染、用户交互与 props/emit 通信。
 * 关键依赖：Vue 3 `<script setup>`、Pinia stores（按需）、类型定义、Lucide 图标与 i18n 标签。
 * 约定：- 所有对外属性统一走 defineProps 泛型，emit 使用 defineEmits<...>()；
  - 不直接操作 DOM，响应式数据变化通过 v-model 或乐观锁写回 store。
 */
import { ref } from 'vue'
import { ChevronRight, ShieldCheck } from '@lucide/vue'

/**
 * Props 定义
 * @property {number} progress   - 当前进度百分比 0~100，由父组件计算
 * @property {boolean} dragging  - 是否处于拖拽中，由父组件维护
 */
defineProps({
  progress: { type: Number, default: 0 },
  dragging: { type: Boolean, default: false },
})

/**
 * 事件定义
 * @event start - 用户按下轨道时触发，参数：(event, trackEl)
 *                把原始事件与轨道 DOM 一起交给父组件，父组件据此绑定全局 pointermove/up
 */
const emit = defineEmits(['start'])

/** 轨道 DOM 引用，随 start 事件一起 emit 给父组件 */
const trackEl = ref(null)

/**
 * pointerdown 回调
 * 仅响应鼠标左键（button === 0）；其他指针类型（touch/pen）直接放行
 * @param {PointerEvent} e - 原生指针事件
 * @returns {void} 鼠标非左键时提前返回，不触发 start
 */
function onStart(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  emit('start', e, trackEl.value)
}
</script>

<style scoped src="./styles/EewSlideUnlock.css"></style>