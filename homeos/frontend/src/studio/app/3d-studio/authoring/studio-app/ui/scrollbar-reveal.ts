/**
 * 侧栏内滚区的滚动条：默认透明，真正滚动时才显形。
 *
 * CSS 那头只提供「透明 / 显形」两态（`.is-scrolling`），切到显形态必须由真实滚动事件驱动：
 * `::-webkit-scrollbar-thumb` 没有「正在滚动」这类状态伪类，纯 CSS 做不到。
 *
 * `scroll` 事件不冒泡，但在 document 的**捕获**阶段能收到每个元素自己的滚动，
 * 所以这里只挂一个全局监听，就不用给每个滚动容器单独接线、也不必随容器重建重挂。
 * 挂载是模块级单例（`installed`），重复进入绘制页不会叠加监听。
 */

/** 只有侧栏这几个容器需要「隐藏 → 滚动显形」，别处的滚动条保持原样。 */
const SCROLL_HOSTS = ':is(#asset-grid, .placed-items-list, #light-layer-panel, .floor-list)'

/**
 * 滚动停下多久后收起滑块。
 * 太短会在惯性滚动 / 滚轮连滚的间隙里闪烁，太长又像「一直显示」，0.8s 与系统浮层条接近。
 */
const HIDE_DELAY_MS = 800

let installed = false

export function installScrollbarReveal(): void {
  const documentNode = globalThis.document
  if (installed || !documentNode) return
  installed = true
  /** 每个容器各有一条收起定时器：连滚时重置，避免上一个定时器提前把新的显形态摘掉。 */
  const hideTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>()

  documentNode.addEventListener(
    'scroll',
    (event) => {
      const target = event.target as Element | null
      if (!target?.matches?.(SCROLL_HOSTS)) return
      target.classList.add('is-scrolling')
      const pending = hideTimers.get(target)
      if (pending !== undefined) clearTimeout(pending)
      hideTimers.set(
        target,
        setTimeout(() => {
          hideTimers.delete(target)
          target.classList.remove('is-scrolling')
        }, HIDE_DELAY_MS),
      )
    },
    { capture: true, passive: true },
  )
}
