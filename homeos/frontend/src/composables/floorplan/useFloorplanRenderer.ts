/**
 * 户型图热点渲染策略：dom / auto / canvas
 *
 * 职责：根据热点数量与配置模式，决定是否启用 Canvas2D 绘制、批量订阅与视口裁剪。
 *
 * - dom：标准 DOM 热点；热点数达批量阈值时仍走单 listener 批量订阅
 * - auto：≥20 热点时 Canvas2D 绘制 + 批量订阅 + 视口裁剪
 * - canvas：强制 Canvas2D 绘制 + 批量订阅 + 视口裁剪
 *
 * 依赖：vue、frontend-config。
 */
import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { configEpoch, getMaxStateListeners } from '@/utils/config/frontend-config'
/** auto 模式启用 Canvas 与性能优化的热点数阈值（覆盖常见 15–35 热点家庭） */
const FLOORPLAN_RENDERER_AUTO_THRESHOLD = 20
/** 为其它页面/组件预留的监听器余量 */
const BATCH_LISTENER_HEADROOM = 10
/**
 * 热点数达到此值时启用批量订阅（单 listener），避免每热点独立注册。
 *
 * 取值 = min(AUTO_THRESHOLD, max(12, 最大监听器数 - 预留余量))，
 * 既要避免单 listener 过载，也要在监听器配额紧张时尽早切换到批量模式。
 *
 * @returns 批量订阅阈值
 */
function getBatchSubscriptionWidgetThreshold() {
  return Math.min(
    FLOORPLAN_RENDERER_AUTO_THRESHOLD,
    Math.max(12, getMaxStateListeners() - BATCH_LISTENER_HEADROOM),
  )
}
/**
 * 根据模式与热点数解析渲染策略。
 *
 * @param mode 渲染模式：'dom' | 'auto' | 'canvas'，空值视为 'auto'（与 defaults 一致）
 * @param widgetCount 热点数量
 * @returns 渲染策略描述对象（mode / useBatchSubscription / useViewportCull / useCanvasDraw）
 */
function resolveFloorplanRenderer(
  mode: string | null | undefined,
  widgetCount: number | null | undefined,
) {
  const m = mode || 'auto'
  const count = Math.max(0, widgetCount || 0)
  const useBatchSubscription = count >= getBatchSubscriptionWidgetThreshold()
  if (count === 0) {
    return {
      mode: m === 'canvas' ? 'canvas' : m === 'dom' ? 'dom' : 'auto',
      useBatchSubscription: false,
      useViewportCull: false,
      useCanvasDraw: false,
    }
  }
  if (m === 'dom') {
    // dom 模式：仅按阈值决定是否批量订阅，不启用 Canvas / 视口裁剪
    return {
      mode: 'dom',
      useBatchSubscription,
      useViewportCull: false,
      useCanvasDraw: false,
    }
  }
  if (m === 'canvas') {
    // canvas 模式：强制启用全部性能优化
    return {
      mode: 'canvas',
      useBatchSubscription: true,
      useViewportCull: true,
      useCanvasDraw: true,
    }
  }
  // auto 模式：达到阈值才启用 Canvas 与视口裁剪
  const perfOn = count >= FLOORPLAN_RENDERER_AUTO_THRESHOLD
  return {
    mode: 'auto',
    useBatchSubscription,
    useViewportCull: perfOn,
    useCanvasDraw: perfOn,
  }
}
/**
 * 户型图渲染策略 composable，返回响应式的策略描述。
 *
 * 调用场景：FloorplanCanvas 中根据热点数与布局配置选择渲染路径。
 *
 * @param widgetCountRef 热点数量（响应式引用或 getter）
 * @param layoutModeRef 布局渲染模式（响应式引用或 getter）
 * @returns 渲染策略 computed
 */
export function useFloorplanRenderer(
  widgetCountRef: MaybeRefOrGetter<number>,
  layoutModeRef: MaybeRefOrGetter<string | null | undefined>,
) {
  return computed(() => {
    // 读取 configEpoch 以便配置变更时重新计算
    void configEpoch.value
    const count = Number(unref(widgetCountRef) ?? 0)
    const layoutMode = unref(layoutModeRef) as string | null | undefined
    return resolveFloorplanRenderer(layoutMode, count)
  })
}