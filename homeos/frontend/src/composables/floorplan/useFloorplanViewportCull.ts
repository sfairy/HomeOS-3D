/**
 * 户型图热点视口裁剪：大规模楼层减少 DOM / useEntity 订阅
 *
 * 职责：当楼层热点数量超过阈值时，仅保留当前视口范围内的热点 id，
 *   减少 DOM 节点与实体订阅数量，提升大规模楼层渲染性能。
 *
 * 依赖：vue。
 */
import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/** 视口裁剪启用的热点数下限：低于此值不做裁剪（开销不划算） */
type CullWidget = { id: string; xPct: number; yPct: number }

const CULL_THRESHOLD = 12
/** 视口边缘外扩余量比例，避免热点紧贴边缘时被误裁 */
const VIEWPORT_MARGIN = 0.18
/**
 * 户型图视口裁剪 composable。
 *
 * 调用场景：FloorplanCanvas 中根据容器尺寸与热点坐标计算可见集合。
 *
 * @param containerRef 容器 DOM 引用
 * @param widgetsRef 热点列表（含 id 与百分比坐标）
 * @param cullEnabledRef 是否启用裁剪开关
 * @param mapViewport 地图视口状态（局部 pan/zoom），可选
 * @returns visibleIds（可见 id 集合）、isWidgetVisible（单个可见性判断）、scheduleRecompute（重算调度）
 */
export function useFloorplanViewportCull(
  containerRef: Ref<HTMLElement | null | undefined>,
  widgetsRef: Ref<CullWidget[] | null | undefined>,
  cullEnabledRef?: Ref<boolean | undefined>,
  mapViewport?: { zoom: Ref<number>; panX: Ref<number>; panY: Ref<number> },
) {
  /** 当前视口内可见的热点 id 集合 */
  const visibleIds = ref(new Set<string>())
  /** 裁剪是否生效：开关未显式关闭即视为启用 */
  function cullActive() {
    return cullEnabledRef?.value !== false
  }
  /** 重新计算可见集合 */
  function recompute() {
    const widgets = widgetsRef.value || []
    // 未启用裁剪或热点数过少：全部可见
    if (!cullActive() || widgets.length < CULL_THRESHOLD) {
      visibleIds.value = new Set(widgets.map((w) => w.id))
      return
    }
    const el = containerRef.value
    if (!el) {
      visibleIds.value = new Set(widgets.map((w) => w.id))
      return
    }
    const rect = el.getBoundingClientRect()
    // 边缘外扩余量（像素），保证进入视口附近的热点提前渲染
    const mx = rect.width * VIEWPORT_MARGIN
    const my = rect.height * VIEWPORT_MARGIN
    const zoom = mapViewport?.zoom.value ?? 1
    const panX = mapViewport?.panX.value ?? 0
    const panY = mapViewport?.panY.value ?? 0
    const useMapTransform = mapViewport && (zoom !== 1 || panX !== 0 || panY !== 0)
    const next = new Set<string>()
    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i]
      let x: number
      let y: number
      if (useMapTransform) {
        // 坐标换算推导：
        // .floorplan-map-world 作为 wrapper 直接子元素，
        // CSS transform = translate(panX, panY) scale(zoom) transformOrigin 0 0，
        // 因此热点的百分比坐标先映射到 map-world 布局像素（0..rect.width/height），
        // 再被 scale 和 translate，最后加上 wrapper 的视口位置 rect.left/top。
        x = rect.left + panX + (w.xPct / 100) * rect.width * zoom
        y = rect.top + panY + (w.yPct / 100) * rect.height * zoom
      } else {
        // 无局部缩放/平移：直接百分比 → 视口像素（桌面零回归路径）
        x = rect.left + (w.xPct / 100) * rect.width
        y = rect.top + (w.yPct / 100) * rect.height
      }
      if (
        x >= rect.left - mx &&
        x <= rect.right + mx &&
        y >= rect.top - my &&
        y <= rect.bottom + my
      ) {
        next.add(w.id)
      }
    }
    // 兜底：若计算后全部不可见（如容器尚未布局），回退为全部可见，避免空白
    visibleIds.value = next.size > 0 ? next : new Set(widgets.map((w) => w.id))
  }
  let ro: ResizeObserver | null = null
  let rafId = 0
  /** 通过 rAF 调度一次重算，避免短时间内频繁计算 */
  function scheduleRecompute() {
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      recompute()
    })
  }
  onMounted(() => {
    recompute()
    const el = containerRef.value
    // 监听容器尺寸变化触发重算
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleRecompute)
      ro.observe(el)
    }
    // 监听窗口尺寸 / 滚动事件触发重算（capture 用于捕获子元素滚动）
    window.addEventListener('resize', scheduleRecompute, { passive: true })
    window.addEventListener('scroll', scheduleRecompute, { passive: true, capture: true })
  })
  onUnmounted(() => {
    if (rafId) cancelAnimationFrame(rafId)
    ro?.disconnect()
    window.removeEventListener('resize', scheduleRecompute)
    window.removeEventListener('scroll', scheduleRecompute, true)
  })
  /**
   * 判断单个热点是否可见。
   * @param widgetId 热点 id
   * @returns 是否可见
   */
  function isWidgetVisible(widgetId: string) {
    if (!cullActive()) return true
    const widgets = widgetsRef.value || []
    if (widgets.length < CULL_THRESHOLD) return true
    if (visibleIds.value.size === 0) return true
    return visibleIds.value.has(widgetId)
  }
  return { visibleIds, isWidgetVisible, scheduleRecompute }
}