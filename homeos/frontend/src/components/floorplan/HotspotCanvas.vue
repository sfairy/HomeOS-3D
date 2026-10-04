<template>
  <!-- 热点 Canvas2D 绘制层：高性能路径下用 Canvas 绘制图标/圆点/标签，并处理交互 -->
  <canvas
    ref="canvasRef"
    class="floorplan-hotspot-canvas"
    @click="onCanvasClick"
    @mousedown="onPointerDown"
    @mouseup="onPointerUp"
    @mousemove="onPointerMove"
    @touchstart.passive="onTouchStart"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
  />
</template>

<script setup>
/**
 * @file FloorplanHotspotCanvas.vue
 * @module floorplan
 *
 * 户型图热点 Canvas2D 层（图标/标签/圆点与 DOM HotspotNode parity）
 *
 * 职责：
 * - 在 Canvas2D 上批量绘制热点（图标/圆点/标签/长按进度/调光 HUD）
 * - 提供 hitTest 命中检测，将指针/触摸事件映射到具体 widget
 * - 通过 ResizeObserver 自适应父容器尺寸，按 devicePixelRatio 处理高分屏
 * - 集成屏保后台空闲逻辑：后台时延迟绘制，恢复时立即重绘
 * - 通过 usePausableStateListener 订阅可见实体的状态变化触发重绘
 *
 * 性能要点：
 * - drawRaf 节流：合并同一帧内的多次 scheduleDraw
 * - drawDeferred：屏保后台时标记脏，恢复后补绘
 * - visibleIds 为空时绘制全部热点（视口裁剪关闭）
 *
 * 依赖：
 * - vue：ref / computed / watch / onMounted / onUnmounted / nextTick / inject
 * - @/composables/entity/usePausableStateListener：可见实体状态变化触发重绘
 * - @/composables/floorplan/useFloorplanEntityBatch：批量 display 注入键
 * - @/utils/entity/entity-projection-display.util：实体展示投影
 * - @/utils/floorplan/floorplan-hotspot-canvas.util：绘制/命中/预加载工具
 * - @/utils/floorplan/floorplan-hotspot-layout.util：热点锚点解析
 * - @/utils/ui/screensaver-background-idle.util：屏保后台空闲监听
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick, inject } from 'vue'
import { usePausableStateListener } from '@/composables/entity/usePausableStateListener'
import { FLOORPLAN_DISPLAY_KEY } from '@/composables/floorplan/useFloorplanEntityBatch'
import { resolveEntityForDisplay } from '@/utils/entity/projection-display.util'
import {
  drawHotspot,
  hitTestHotspots,
  preloadHotspotImages,
} from '@/utils/floorplan/hotspot-canvas.util'
import { buildWidgetDisplayState } from '@/utils/floorplan/widget.util'
import { resolveHotspotAnchorPct } from '@/utils/floorplan/hotspot-layout.util'
import {
  isScreensaverBackgroundIdle,
  onScreensaverBackgroundIdle,
  registerScreensaverFlushDraw,
} from '@/utils/ui/screensaver-background-idle.util'

// 组件 props
const props = defineProps({
  // 热点部件列表
  widgets: { type: Array, default: () => [] },
  // 可见热点 ID 集合（视口裁剪；空集合表示全部可见）
  visibleIds: { type: Object, default: () => new Set() },
  // 是否编辑模式（编辑模式不处理交互，交给 DOM HotspotNode）
  isEditMode: { type: Boolean, default: false },
  // 长按中的部件 ID
  longPressWidgetId: { type: String, default: null },
  // 长按进度（0-1，用于绘制径向进度条）
  longPressProgress: { type: Number, default: 0 },
  // 调光 HUD 数据（widgetId + pct）
  dimHud: { type: Object, default: null },
  /** 活跃弹窗实体 ID（视口裁剪时仍订阅/重绘） */
  activePopupId: { type: String, default: null },
  /** 布局级热点锚点约定（icon / column） */
  anchorConvention: { type: String, default: undefined },
  /** true：不绘制，仅 hitTest（保留兼容） */
  interactionOnly: { type: Boolean, default: false },
})

// 向父组件发射的事件
const emit = defineEmits([
  'hotspot-click',
  'hotspot-pointer-down',
  'hotspot-pointer-up',
  'hotspot-wheel',
  'hotspot-touch-move',
])

// Canvas 元素引用
const canvasRef = ref(null)
// 批量 display 注入（性能路径下由父组件统一构建，避免每热点独立计算）
const batchDisplays = inject(FLOORPLAN_DISPLAY_KEY, null)
// ResizeObserver 实例（onMounted 中创建）
let ro = null
// 当前触摸命中的 widget（touchstart 到 touchend 期间保持）
let activeTouchWidget = null
// 当前 devicePixelRatio（高分屏适配，上限 2 避免过度绘制）
let canvasDpr = 1
// requestAnimationFrame 句柄（合并同帧重绘）
let drawRaf = 0
// 屏保后台期间的脏标记（恢复后补绘）
let drawDeferred = false
// 屏保空闲监听取消函数
let unsubScreensaverIdle = null
// 屏保 flush 绘制取消函数
let unsubScreensaverFlush = null

/**
 * 规范化可见 ID 集合
 * 兼容 Set 与 Ref<Set> 两种传入形式
 * @returns {Set} 可见 ID 集合
 */
const resolvedVisibleIds = computed(() => {
  const v = props.visibleIds
  if (v instanceof Set) return v
  if (v && typeof v === 'object' && 'value' in v && v.value instanceof Set) return v.value
  return new Set()
})
/**
 * 解析需要监听状态变化的实体 ID 列表
 * - 可见集合为空时监听全部部件
 * - 始终包含活跃弹窗 ID（视口裁剪时仍需重绘）
 * @returns {string[]} 实体 ID 列表
 */
function resolveListenerEntityIds() {
  const visible = resolvedVisibleIds.value
  const widgets = props.widgets || []
  const list = visible.size === 0 ? widgets.map((w) => w.id) : [...visible]
  const pinned = props.activePopupId
  if (pinned && !list.includes(pinned)) list.push(pinned)
  return list
}

/**
 * 调度重绘（requestAnimationFrame 节流）
 * 屏保后台时仅标记脏，不立即绘制
 */
function scheduleDraw() {
  if (isScreensaverBackgroundIdle()) {
    drawDeferred = true
    return
  }
  if (drawRaf) return
  drawRaf = requestAnimationFrame(() => {
    drawRaf = 0
    draw()
  })
}

// 订阅可见实体的状态变化，触发重绘
usePausableStateListener(scheduleDraw, {
  entityIds: resolveListenerEntityIds,
})

/**
 * hitTest 用的可见性判断（可见集合为空时全部可见）
 * @param {string} widgetId - 部件 ID
 * @returns {boolean} 是否可见
 */
function isWidgetVisibleForHit(widgetId) {
  const visible = resolvedVisibleIds.value
  if (visible.size === 0) return true
  return visible.has(widgetId)
}

/**
 * 获取部件的展示状态
 * 优先使用批量 display（性能路径），回退到独立构建
 * @param {Object} widget - 部件实例
 * @returns {Object} 展示状态对象
 */
function getDisplay(widget) {
  const fromBatch = batchDisplays?.value?.get(widget.id)
  if (fromBatch) return fromBatch
  return buildWidgetDisplayState(widget, resolveEntityForDisplay(widget.id))
}

/**
 * 主绘制函数：清空画布并按可见性逐个绘制热点
 * 坐标系：layoutW/layoutH 为父容器布局尺寸，乘以 canvasDpr 映射到画布像素
 */
function draw() {
  drawDeferred = false
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  // 重置变换矩阵并清空画布
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  // interactionOnly 模式仅做命中检测，不绘制
  if (props.interactionOnly) return

  const visible = resolvedVisibleIds.value
  const useAll = visible.size === 0
  const widgets = props.widgets || []
  // layoutW/layoutH 取 canvas.parentElement（即 .floorplan-map-world）的 clientWidth/clientHeight，
  // 未被 map-world transform 作用（CSS clientWidth 不包含 transform.scale），
  // 而 Canvas 的 CSS 尺寸也设为 layoutW/layoutH 像素，随后由父容器 .floorplan-map-world
  // 的 translate() scale() 统一做视觉缩放。Canvas 内部绘制坐标系基于
  // layoutW/layoutH × canvasDpr，绘制结果随父容器 transform 同步放大，
  // 与 DOM HotspotNode 的 left/top: xPct%/yPct% 保持一致坐标体系。
  const layoutW = canvas.parentElement?.clientWidth || w / canvasDpr
  const layoutH = canvas.parentElement?.clientHeight || h / canvasDpr
  const drawOpts = {
    longPressWidgetId: props.longPressWidgetId,
    longPressProgress: props.longPressProgress,
    dimHud: props.dimHud,
  }

  // 逐个绘制可见热点
  for (let i = 0; i < widgets.length; i++) {
    const widget = widgets[i]
    if (!useAll && !visible.has(widget.id)) continue
    const display = getDisplay(widget)
    const anchor = resolveHotspotAnchorPct(widget)
    // 百分比锚点 -> 画布像素坐标（含 DPR 缩放）
    const cx = (anchor.xPct / 100) * layoutW * canvasDpr
    const cy = (anchor.yPct / 100) * layoutH * canvasDpr
    drawHotspot(ctx, widget, display, cx, cy, canvasDpr, drawOpts)
  }
}
/**
 * 调整 Canvas 尺寸以适配父容器与高分屏
 * devicePixelRatio 上限 2，避免 4K 屏过度绘制
 *
 * 本函数的 layoutW/layoutH 来源与 draw() 保持一致，是 map-world 布局尺寸（未缩放），
 * Canvas DOM 尺寸设为 layout 像素（CSS 像素），后续由父容器的 worldStyle transform
 * 承担视觉放大（translate + scale），保证与 DOM 热点像素对齐。
 */
function resizeCanvas() {
  const canvas = canvasRef.value
  const parent = canvas?.parentElement
  if (!canvas || !parent) return
  // layoutW/layoutH 来源与 draw() 一致：map-world 布局尺寸（未缩放）
  const layoutW = parent.clientWidth
  const layoutH = parent.clientHeight
  if (layoutW <= 0 || layoutH <= 0) return
  const nextDpr = Math.min(window.devicePixelRatio || 1, 2)
  const nextW = Math.floor(layoutW * nextDpr)
  const nextH = Math.floor(layoutH * nextDpr)
  const cssW = `${layoutW}px`
  const cssH = `${layoutH}px`
  const sizeUnchanged =
    canvas.width === nextW &&
    canvas.height === nextH &&
    canvasDpr === nextDpr &&
    canvas.style.width === cssW &&
    canvas.style.height === cssH
  if (sizeUnchanged) return
  canvasDpr = nextDpr
  canvas.width = nextW
  canvas.height = nextH
  canvas.style.width = cssW
  canvas.style.height = cssH
  draw()
}

/**
 * 命中检测：将视口坐标转换为画布局部坐标后做热点命中
 * @param {number} clientX - 视口 X 坐标
 * @param {number} clientY - 视口 Y 坐标
 * @returns {Object|null} 命中的部件，未命中返回 null
 */
function hitTest(clientX, clientY) {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  // canvas.width 是布局宽度 × DPR，除以 DPR 就是布局 CSS 宽度，与 resizeCanvas & draw 中的 layoutW 来源一致
  const layoutW = canvas.width / canvasDpr
  // scaleFactor = zoom 系数，用于放大命中半宽半高，与视觉一致；除零保护，未布局时回退 1
  const scaleFactor = layoutW > 0 ? rect.width / layoutW : 1
  return hitTestHotspots(
    props.widgets || [],
    clientX - rect.left,
    clientY - rect.top,
    rect.width,
    rect.height,
    isWidgetVisibleForHit,
    scaleFactor,
  )
}

/** Canvas 点击：编辑模式忽略，否则命中后发射 hotspot-click */
function onCanvasClick(e) {
  if (props.isEditMode) return
  const widget = hitTest(e.clientX, e.clientY)
  if (widget) emit('hotspot-click', widget)
}

/** 鼠标按下：编辑模式忽略，命中后发射 hotspot-pointer-down */
function onPointerDown(e) {
  if (props.isEditMode) return
  const widget = hitTest(e.clientX, e.clientY)
  if (widget) emit('hotspot-pointer-down', widget, e)
}

/** 鼠标抬起：编辑模式忽略，发射 hotspot-pointer-up（含命中结果可能为 null） */
function onPointerUp(e) {
  if (props.isEditMode) return
  emit('hotspot-pointer-up', hitTest(e.clientX, e.clientY), e)
}

/** 鼠标移动：仅左键按下时（buttons===1）发射 hotspot-touch-move（滚轮调光复用） */
function onPointerMove(e) {
  if (props.isEditMode || e.buttons !== 1) return
  const widget = hitTest(e.clientX, e.clientY)
  if (widget) emit('hotspot-touch-move', widget, e)
}

/** 滚轮事件：命中后 preventDefault 并发射 hotspot-wheel（用于调光） */
function onWheel(e) {
  if (props.isEditMode) return
  const widget = hitTest(e.clientX, e.clientY)
  if (widget) {
    if (e.cancelable) e.preventDefault()
    emit('hotspot-wheel', widget, e)
  }
}

/** 触摸开始：记录命中 widget 并发射 hotspot-pointer-down */
function onTouchStart(e) {
  if (props.isEditMode) return
  const t = e.touches?.[0] ?? e.changedTouches?.[0]
  if (!t) return
  activeTouchWidget = hitTest(t.clientX, t.clientY)
  if (activeTouchWidget) emit('hotspot-pointer-down', activeTouchWidget, e)
}

/** 触摸移动：基于 touchstart 命中的 widget 发射 hotspot-touch-move */
function onTouchMove(e) {
  if (props.isEditMode || !activeTouchWidget) return
  const t = e.touches?.[0] ?? e.changedTouches?.[0]
  if (!t) return
  emit('hotspot-touch-move', activeTouchWidget, e)
}

/** 触摸结束：发射 hotspot-pointer-up 并清空命中状态 */
function onTouchEnd(e) {
  if (props.isEditMode) return
  emit('hotspot-pointer-up', activeTouchWidget, e)
  activeTouchWidget = null
}

/**
 * 预加载热点图标图片，完成后重绘
 * 避免首次绘制时图片未加载导致闪烁
 */
function schedulePreload() {
  preloadHotspotImages(props.widgets || [], getDisplay, () => nextTick(draw))
}

/** 热点部件指纹：仅 id/位置/类型 参与，避免拖拽过程中无关字段变更触发整棵深比较 */
function hotspotWidgetsFingerprint() {
  const ws = props.widgets || []
  let fp = String(ws.length)
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]
    fp += `|${w?.id ?? ''}:${w?.xPct ?? ''}:${w?.yPct ?? ''}:${w?.type ?? ''}`
  }
  return fp
}

// 部件指纹变化才预加载图标；实体状态由 usePausableStateListener 增量重绘
// 不 watch derivedEpoch：任意传感器推送都会整层 clearRect，平板上可见闪白
watch(
  () => hotspotWidgetsFingerprint(),
  () => {
    schedulePreload()
    scheduleDraw()
  },
)
watch(
  () => [
    resolvedVisibleIds.value.size,
    [...resolvedVisibleIds.value],
    props.longPressWidgetId,
    props.longPressProgress,
    props.dimHud,
    props.activePopupId,
  ],
  scheduleDraw,
)
// 挂载：预加载图标、初始化尺寸、注册 ResizeObserver 与 wheel 监听、订阅屏保
onMounted(() => {
  schedulePreload()
  resizeCanvas()
  ro = new ResizeObserver(resizeCanvas)
  if (canvasRef.value?.parentElement) ro.observe(canvasRef.value.parentElement)
  // wheel / touchmove 需 preventDefault，显式 passive:false（绕过 main.ts 全局被动补丁）
  canvasRef.value?.addEventListener('wheel', onWheel, { passive: false })
  canvasRef.value?.addEventListener('touchmove', onTouchMove, { passive: false })
  // 屏保从后台恢复时补绘
  unsubScreensaverIdle = onScreensaverBackgroundIdle((idle) => {
    if (!idle && drawDeferred) scheduleDraw()
  })
  // 屏保 flush 时立即强制重绘（取消待执行的 raf）
  unsubScreensaverFlush = registerScreensaverFlushDraw(() => {
    if (!drawDeferred) return
    drawDeferred = false
    if (drawRaf) {
      cancelAnimationFrame(drawRaf)
      drawRaf = 0
    }
    draw()
  })
})

// 卸载：清理监听与订阅，避免内存泄漏
onUnmounted(() => {
  unsubScreensaverIdle?.()
  unsubScreensaverFlush?.()
  canvasRef.value?.removeEventListener('wheel', onWheel)
  canvasRef.value?.removeEventListener('touchmove', onTouchMove)
  ro?.disconnect()
})

// 仅开发态调试用：校验 DOM 热点与 Canvas 热点的坐标一致性
// 实现思路（TR-4.1）：对传入 widgetId，取 DOM .hotspot[data-widget-id] 的中心，
// 再换算 Canvas 同 id 热点的布局中心，返回二者在视口坐标下的差值 {dx, dy}。
// 若未找到对应 DOM 元素或 Canvas 未挂载，返回 null。
function checkCoordinateConsistency(widgetId) {
  if (!widgetId) return null
  const canvas = canvasRef.value
  if (!canvas || !canvas.parentElement) return null
  // DOM 热点查找：支持 HotspotNode 与骨架层两种 data-widget-id 写法
  const domEl = document.querySelector(`.hotspot[data-widget-id="${widgetId}"]`)
  if (!domEl) return null
  const domRect = domEl.getBoundingClientRect()
  const domCx = domRect.left + domRect.width / 2
  const domCy = domRect.top + domRect.height / 2
  // Canvas 侧：根据 widget 的 xPct/yPct 锚点换算视口中心
  const widget = (props.widgets || []).find((w) => w.id === widgetId)
  if (!widget) return null
  const anchor = resolveHotspotAnchorPct(widget)
  const mapRect = canvas.parentElement.getBoundingClientRect()
  const layoutW = canvas.parentElement.clientWidth
  const layoutH = canvas.parentElement.clientHeight
  // map-world 内的布局像素坐标（与 DOM 热点 left/top 百分比一致）
  const layoutX = (anchor.xPct / 100) * layoutW
  const layoutY = (anchor.yPct / 100) * layoutH
  // 缩放系数 = map-world 视觉宽度 / 布局宽度（与 DOM 同 transform 作用）
  const scaleX = layoutW > 0 ? mapRect.width / layoutW : 1
  const scaleY = layoutH > 0 ? mapRect.height / layoutH : 1
  const canvasCx = mapRect.left + layoutX * scaleX
  const canvasCy = mapRect.top + layoutY * scaleY
  return {
    dx: domCx - canvasCx,
    dy: domCy - canvasCy,
    dom: { x: domCx, y: domCy },
    canvas: { x: canvasCx, y: canvasCy },
  }
}

// 暴露 draw/hitTest 供父组件诊断或强制刷新
defineExpose({ draw, hitTest, checkCoordinateConsistency })
</script>

<style scoped src="./styles/floorplan-canvas.css"></style>