import { onMounted, onUnmounted, ref } from 'vue'
/**
 * 视口尺寸档位（viewport tier）
 * ---------------------------------------------------------------
 * 为什么需要它：壳层历史上只用 window.innerWidth 做一次性判断
 * （见 composables/ui/useMainLayoutNavMenu.ts 的 capBarItemsForViewport），
 * 既没有统一的档位语义，也没法让 CSS 直接消费。大屏 / 平板 / 分屏三档的
 * 字号、留白、导航收纳本应共用一套断点，这里把它收敛成一个真源。
 *
 * 用法：
 *   useViewportTier()            // 在壳层 setup 里调用一次，写 <html data-viewport-tier>
 *   tierFromWidth(w)             // 纯函数，供非组件逻辑（如测试、工具函数）复用
 *
 * CSS 侧：
 *   html[data-viewport-tier='compact'] .xxx { ... }
 *   --hos-viewport-tier / --hos-viewport-w 也一并暴露给样式表。
 */

/** 视口档位 */
type ViewportTier = 'compact' | 'standard' | 'wide' | 'ultra'

/** 断点上限（含）：compact ≤1024 < standard ≤1440 < wide ≤1920 < ultra */
const VIEWPORT_TIER_MAX: Record<Exclude<ViewportTier, 'ultra'>, number> = {
  compact: 1024,
  standard: 1440,
  wide: 1920,
}

/**
 * 按宽度解析档位。
 *
 * @param width CSS 像素宽度（一般取 window.innerWidth）
 * @returns 档位名
 */
function tierFromWidth(width: number): ViewportTier {
  if (!Number.isFinite(width) || width <= 0) return 'standard'
  if (width <= VIEWPORT_TIER_MAX.compact) return 'compact'
  if (width <= VIEWPORT_TIER_MAX.standard) return 'standard'
  if (width <= VIEWPORT_TIER_MAX.wide) return 'wide'
  return 'ultra'
}

/**
 * 订阅视口档位并同步到 <html> 上。
 *
 * 用 ResizeObserver 而不是仅 resize 事件：分屏、平板旋转、浏览器缩放都能触发，
 * 且能拿到「容器变化」而不是只靠 window 事件（window 事件在部分内嵌 WebView 里会漏）。
 *
 * @returns 当前档位 ref（只读消费用）
 */
export function useViewportTier() {
  const tier = ref<ViewportTier>('standard')
  let observer: ResizeObserver | null = null

  function apply(width: number) {
    const next = tierFromWidth(width)
    if (next === tier.value && document.documentElement.dataset.viewportTier === next) return
    tier.value = next
    const el = document.documentElement
    el.dataset.viewportTier = next
    el.style.setProperty('--hos-viewport-tier', String(el.clientWidth || width))
    el.style.setProperty('--hos-viewport-w', String(Math.round(width)))
  }

  onMounted(() => {
    apply(window.innerWidth)
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect
        if (rect?.width) apply(rect.width)
      })
      observer.observe(document.documentElement)
    } else {
      window.addEventListener('resize', onResize, { passive: true })
    }
  })

  function onResize() {
    apply(window.innerWidth)
  }

  onUnmounted(() => {
    observer?.disconnect()
    observer = null
    window.removeEventListener('resize', onResize)
  })

  return { tier }
}
