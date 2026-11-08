/**
 * 画布尺寸与其对应的布局档位（JS 侧的 `@container hos-canvas`）。
 *
 * 为什么需要：CSS 断点已经改由画布宽度决策（见 scaled-viewport.css 的 `.app-shell`），
 * 但仍有若干处 JS 用 `window.innerWidth` 或 `matchMedia('(max-width: 900px)')` 判断紧凑档
 * ——那些读的是真实窗口宽度，与画布宽度不是一回事（1280 窗口 + 1366 基准 → 画布 1638）。
 * 结果就是「CSS 认为宽敞、JS 认为紧凑」，例如顶栏 Tab 被错收进「更多」、设置页侧栏
 * 误判为覆盖式抽屉。统一从这里读，才与 CSS 同源。
 */
import { computed } from 'vue'
import { activeCanvasHeight, activeCanvasWidth, currentScale } from '@/composables/ui/useScaling'

/**
 * 与 CSS 侧断点刻度对齐的档位阈值（@container hos-canvas）。
 *
 * 只用 `uiux-breakpoints` 契约里的统一刻度，不要另起魔法数字。
 */
export const CANVAS_BREAKPOINT = {
  phone: 640,
  tablet: 768,
  compact: 900,
  wide: 1100,
  desktop: 1280,
  large: 1440,
} as const

/**
 * 读取画布尺寸与常用档位判定。
 *
 * 返回的宽度是「画布宽度」（缩放模式）或「外壳宽度」（流式模式），
 * 与 `@container hos-canvas` 的查询基准完全一致，可直接用于 v-if / 计算属性。
 *
 * @returns 画布宽高、缩放比与档位布尔值
 */
export function useCanvasMetrics() {
  const canvasWidth = computed(() => activeCanvasWidth.value)
  const canvasHeight = computed(() => activeCanvasHeight.value)
  const scale = computed(() => currentScale.value)

  /** 是否紧凑档（画布宽 ≤ 900）：设置页侧栏折叠、横向滚动导航等在此档切换 */
  const isCompact = computed(() => canvasWidth.value <= CANVAS_BREAKPOINT.compact)
  /** 是否窄屏档（画布宽 ≤ 1100）：首页/日志类页面开始单列 */
  const isNarrow = computed(() => canvasWidth.value <= CANVAS_BREAKPOINT.wide)
  /** 是否平板档（画布宽 ≤ 1280） */
  const isTablet = computed(() => canvasWidth.value <= CANVAS_BREAKPOINT.desktop)
  /** 是否手机档（画布宽 ≤ 640） */
  const isPhone = computed(() => canvasWidth.value <= CANVAS_BREAKPOINT.phone)

  return { canvasWidth, canvasHeight, scale, isCompact, isNarrow, isTablet, isPhone }
}
