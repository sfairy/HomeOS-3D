<template>
  <!-- 楼层切换器：多楼层时显示，支持垂直/水平布局与拖拽移动 -->
  <div
    v-if="layoutStore.layoutConfig.floors.length > 1"
    ref="containerRef"
    :class="[
      'floor-switcher shadow-2xl',
      isHorizontal ? 'floor-switcher--h' : 'floor-switcher--v',
      isDragging ? 'is-dragging' : '',
      isLocked ? 'is-locked' : '',
    ]"
    :style="switcherStyle"
  >
    <!-- 拖拽手柄区域（仅解锁状态显示），绑定鼠标/触摸拖拽起始 -->
    <div
      v-if="!isLocked"
      class="floor-switcher__header"
      @mousedown="onDragStart"
      @touchstart="onDragStart"
      :title="'拖拽以移动 (已解锁)'"
    >
      <svg
        class="w-3.5 h-3.5 fs-icon-violet flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="9" cy="12" r="1" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="9" cy="6" r="1" />
        <circle cx="15" cy="6" r="1" />
        <circle cx="9" cy="18" r="1" />
        <circle cx="15" cy="18" r="1" />
      </svg>
      <span v-if="!isHorizontal" class="floor-switcher__title">{{ '楼层' }}</span>
    </div>
    <div v-else class="pt-1" />
    <!-- 楼层按钮列表 -->
    <div class="floor-switcher__list">
      <button
        v-for="floor in layoutStore.layoutConfig.floors"
        :key="floor.id"
        :class="[
          'floor-btn',
          layoutStore.layoutConfig.activeFloorId === floor.id ? 'floor-btn--active' : '',
        ]"
        @click="switchFloor(floor.id)"
      >
        <span class="floor-btn__name">{{ floor.name }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * @file FloorSwitcher.vue
 * @module floorplan
 *
 * 楼层切换器组件
 *
 * 当项目配置了多个楼层（floors）时，在平面图右上角显示楼层切换按钮组。
 * 支持垂直布局（右侧居中）和水平布局（顶部横排）两种方向。
 *
 * 核心功能：
 * - 多楼层一键切换（仅切换浏览，不标记未保存，避免虚假"未保存"拦截）
 * - 支持锁定/解锁模式：锁定后仅可点击切换；解锁后可通过拖拽移动位置
 * - 拖拽时自动写回 floorSwitcherConfig.left/top 持久化位置
 * - 方向可在配置中切换（vertical/horizontal）
 * - 按钮大小可配置（btnSize）
 *
 * 位置控制：
 * - 默认 CSS 定位在右侧垂直居中（top:50%; right:16px; translateY(-50%)）
 * - 拖拽后覆盖为 absolute 定位的 left/top 绝对坐标
 *
 * 依赖：
 * - vue：ref / computed / onMounted / onUnmounted
 * - @/stores/layout.store：布局 Store（floors / activeFloorId / floorSwitcherConfig）
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useLayoutStore } from '@/stores/layout.store'

// UI 全局 Store
const layoutStore = useLayoutStore()
// 切换器容器引用（用于拖拽时读取 offsetLeft/Top 与 offsetWidth/Height）
const containerRef = ref(null)
// 当前是否处于拖拽中
const isDragging = ref(false)

// 拖拽起始位置记录（模块级变量，避免响应式开销）
let startX = 0,
  startY = 0,
  origLeft = 0,
  origTop = 0

/**
 * 楼层切换器配置（从 UI 配置中读取，含默认值回退）
 */
const config = computed(
  () =>
    layoutStore.layoutConfig.floorSwitcherConfig ?? {
      left: -1,
      top: -1,
      direction: 'vertical',
      btnSize: 44,
      isLocked: true,
    },
)

// 是否已设置过位置（left/top 均 >= 0 表示用户拖拽过）
const positionSet = computed(() => config.value.left >= 0 && config.value.top >= 0)
// 是否锁定（锁定后不可拖拽，仅可点击切换）
const isLocked = computed(() => config.value.isLocked ?? true)
// 是否水平布局
const isHorizontal = computed(() => config.value.direction === 'horizontal')

/**
 * 动态计算组件定位样式
 * 未拖拽过（left<0）时使用默认 CSS 定位，
 * 拖拽过后切换为 absolute 的 left/top 绝对定位。
 */
const switcherStyle = computed(() => {
  const style = { '--btn-size': `${config.value.btnSize ?? 44}px` }
  if (positionSet.value) {
    style.left = `${config.value.left}px`
    style.top = `${config.value.top}px`
    style.right = 'auto'
    style.transform = 'none'
  }
  return style
})

/**
 * 切换到指定楼层
 * @param {string} id - 目标楼层 ID
 */
function switchFloor(id) {
  // 仅切换楼层不应视为"未保存编辑"，交由 store 抑制脏标记
  layoutStore.setActiveFloor(id)
}
/**
 * 开始拖拽（仅解锁状态有效）
 * 记录起始坐标用于计算偏移量
 * @param {MouseEvent|TouchEvent} e - 触发事件（鼠标或触摸）
 */
function onDragStart(e) {
  if (isLocked.value) return
  isDragging.value = true
  const el = containerRef.value
  if (!el) return
  const parent = el.parentElement
  if (!parent) return
  // 首次拖拽时先记录当前位置（offsetLeft/Top 为未缩放布局坐标，与写回坐标系一致）
  if (!positionSet.value) {
    config.value.left = Math.round(el.offsetLeft)
    config.value.top = Math.round(el.offsetTop)
  }
  const point = 'touches' in e ? e.touches[0] : e
  startX = point.clientX
  startY = point.clientY
  origLeft = config.value.left
  origTop = config.value.top
  e.preventDefault()
}

/**
 * 拖拽移动中，实时更新位置（限制在父容器范围内）
 * @param {MouseEvent|TouchEvent} e - 触发事件
 */
function onDragMove(e) {
  if (!isDragging.value) return
  const el = containerRef.value
  if (!el) return
  const parent = el.parentElement
  if (!parent) return
  const parentRect = parent.getBoundingClientRect()
  // 父容器可能处于 transform:scale() 中：getBoundingClientRect 是缩放后尺寸，
  // clientWidth/Height 是未缩放布局尺寸，二者比值即累计缩放系数。
  // 指针位移（视口 px）需除以缩放系数，换算到 left/top 所用的未缩放坐标系。
  const scaleX = parent.clientWidth > 0 ? parentRect.width / parent.clientWidth : 1
  const scaleY = parent.clientHeight > 0 ? parentRect.height / parent.clientHeight : 1
  const point = 'touches' in e ? e.touches[0] : e
  const dx = (point.clientX - startX) / (scaleX || 1)
  const dy = (point.clientY - startY) / (scaleY || 1)
  // 限制在父容器范围内（全部使用未缩放坐标）
  const maxLeft = Math.max(0, parent.clientWidth - el.offsetWidth)
  const maxTop = Math.max(0, parent.clientHeight - el.offsetHeight)
  const newLeft = Math.max(0, Math.min(origLeft + dx, maxLeft))
  const newTop = Math.max(0, Math.min(origTop + dy, maxTop))
  if (layoutStore.layoutConfig.floorSwitcherConfig) {
    layoutStore.layoutConfig.floorSwitcherConfig.left = Math.round(newLeft)
    layoutStore.layoutConfig.floorSwitcherConfig.top = Math.round(newTop)
  }
}

/**
 * 拖拽结束，保存位置到服务端
 */
function onDragEnd() {
  if (isDragging.value) {
    isDragging.value = false
    layoutStore.layoutDirty = true
  }
}

// 全局监听拖拽移动与结束事件（拖拽可能超出组件边界，需在 window 上监听）
onMounted(() => {
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
  window.addEventListener('touchmove', onDragMove, { passive: false })
  window.addEventListener('touchend', onDragEnd)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  window.removeEventListener('touchmove', onDragMove)
  window.removeEventListener('touchend', onDragEnd)
})
</script>

<style scoped src="./styles/FloorSwitcher.css"></style>