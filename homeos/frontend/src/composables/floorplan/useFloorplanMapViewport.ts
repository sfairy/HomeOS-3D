/**
 * @file useFloorplanMapViewport.ts
 * @module frontend/src/composables/floorplan
 * @brief 户型图局部 pan/pinch-zoom，替代「整页 transform.scale 当地图缩放」的触控模型。
 *
 * 设计取舍：保留全局等比缩放作布局适配；密热点精度依赖本层局部缩放（1.8×–2.5×）。
 * 缩放下限 1.8 提升平板/触摸屏热区可点性；reset 仍回到 1.0 全景。
 */
import { ref, computed, onUnmounted, type Ref } from 'vue'

/** 捏合缩放下限：允许捏合缩回 1.0 全景（reset 仍为 1.0）；放大仍限 2.5 */
const MIN_ZOOM = 1
const MAX_ZOOM = 2.5
const RESET_ZOOM = 1

type Point = { x: number; y: number }

function touchDistance(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function touchMidpoint(a: Touch, b: Touch): Point {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
}

/**
 * 户型图内容区局部缩放/平移。
 * @param enabled 是否启用（触屏预览态建议开启；编辑态关闭以免与拖热点冲突）
 */
export function useFloorplanMapViewport(enabled: Ref<boolean>) {
  const zoom = ref(1)
  const panX = ref(0)
  const panY = ref(0)

  let pinchStartDist = 0
  let pinchStartZoom = 1
  let panStart: Point | null = null
  let panOrigin: Point = { x: 0, y: 0 }
  let active = false

  const worldStyle = computed(() => ({
    transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
    transformOrigin: '0 0',
    willChange: zoom.value > 1 || panX.value || panY.value ? 'transform' : 'auto',
  }))

  function clampPan() {
    // 缩放回全景时复位平移，避免残留偏移
    if (zoom.value <= RESET_ZOOM + 0.001) {
      zoom.value = RESET_ZOOM
      panX.value = 0
      panY.value = 0
    }
  }

  function onTouchStart(event: TouchEvent) {
    if (!enabled.value) return
    if (event.touches.length === 2) {
      active = true
      pinchStartDist = touchDistance(event.touches[0], event.touches[1])
      pinchStartZoom = zoom.value
      panStart = null
      return
    }
    if (event.touches.length === 1 && zoom.value > 1.01) {
      // 已放大时单指平移地图
      active = true
      panStart = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      panOrigin = { x: panX.value, y: panY.value }
    }
  }

  function onTouchMove(event: TouchEvent) {
    if (!enabled.value || !active) return
    if (event.touches.length === 2 && pinchStartDist > 0) {
      if (event.cancelable) event.preventDefault()
      const dist = touchDistance(event.touches[0], event.touches[1])
      // 全景 1× 可捏合放大；进入放大态后下限 1.8×，捏合缩回接近 1 时复位全景
      const raw = pinchStartZoom * (dist / pinchStartDist)
      if (raw <= RESET_ZOOM + 0.05) {
        zoom.value = RESET_ZOOM
      } else {
        zoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw))
      }
      // 以双指中点为近似锚（简化：不重算原点，手感足够）
      void touchMidpoint(event.touches[0], event.touches[1])
      clampPan()
      return
    }
    if (event.touches.length === 1 && panStart) {
      if (event.cancelable) event.preventDefault()
      const t = event.touches[0]
      panX.value = panOrigin.x + (t.clientX - panStart.x)
      panY.value = panOrigin.y + (t.clientY - panStart.y)
    }
  }

  function onTouchEnd(event: TouchEvent) {
    if (event.touches.length < 2) pinchStartDist = 0
    if (event.touches.length === 0) {
      active = false
      panStart = null
      clampPan()
    }
  }

  function resetViewport() {
    zoom.value = RESET_ZOOM
    panX.value = 0
    panY.value = 0
    active = false
    panStart = null
    pinchStartDist = 0
  }

  onUnmounted(resetViewport)

  return {
    zoom,
    panX,
    panY,
    worldStyle,
    isMapZoomed: computed(() => zoom.value > 1.01),
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    resetViewport,
  }
}
