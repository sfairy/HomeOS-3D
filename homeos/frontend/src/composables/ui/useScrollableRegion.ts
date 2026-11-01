/**
 * 可滚动容器的键盘可达性：**只在真正溢出时**给容器挂上 `tabindex="0"`。
 *
 * 背景（审计 H-I02 · axe `scrollable-region-focusable` · serious）：
 * `.list-page__panel-body`、`.power-panel__body` 这类 `overflow: auto` 的容器内容一多，
 * 鼠标滚轮能滚、触屏能滑，但纯键盘用户**没有任何办法**把焦点放进去再按空格/方向键滚动 ——
 * 焦点根本进不去，内容等于被吞掉。
 *
 * 关键取舍：`tabindex` 不能无脑常驻。一个 8px 溢出、键盘用户根本不需要滚的容器，
 * 常驻 `tabindex="0"` 只是往 Tab 序列里塞了一个没有任何作用的停靠点，
 * 反而拉长到主内容的路径。所以这里按「是否真的溢出」动态开关。
 */

import { nextTick, onMounted, onScopeDispose, ref, watch, type Ref } from 'vue'

/** 溢出判定容差：亚像素取整会让 scrollHeight 比 clientHeight 大 1px。 */
const OVERFLOW_TOLERANCE_PX = 2

export interface ScrollableRegionOptions {
  /**
   * 内容变化的观察源（如列表长度、`v-for` 的数据数组）。
   * 传了就会在内容变化后重新测量一次 —— 数据是异步来的，挂载时量不到高度是常态。
   */
  contentKey?: Ref<unknown> | (() => unknown)
  /** 只关心纵向（默认）还是纵向 + 横向溢出。列表页一般是纵向。 */
  axis?: 'vertical' | 'both'
}

export interface ScrollableRegionReturn {
  /** 绑到容器上的 ref。 */
  regionRef: Ref<HTMLElement | null>
  /** 容器当前是否溢出，直接用于 `v-bind` 语义属性。 */
  isScrollable: Ref<boolean>
  /** 手动重测（例如父级展开/收起后调用）。 */
  measure: () => void
}

/**
 * @param options 见 {@link ScrollableRegionOptions}
 * @returns 容器 ref、溢出状态、手动测量函数
 */
export function useScrollableRegion(options: ScrollableRegionOptions = {}): ScrollableRegionReturn {
  const { contentKey, axis = 'vertical' } = options
  const regionRef = ref<HTMLElement | null>(null)
  const isScrollable = ref(false)

  let resizeObserver: ResizeObserver | null = null
  /** 被观察的子节点（内容高度变化不会改容器尺寸，ResizeObserver 看不到）。 */
  let mutationObserver: MutationObserver | null = null

  function measure(): void {
    const el = regionRef.value
    if (!el) {
      isScrollable.value = false
      return
    }
    const vertical = el.scrollHeight - el.clientHeight > OVERFLOW_TOLERANCE_PX
    const horizontal = axis === 'both' && el.scrollWidth - el.clientWidth > OVERFLOW_TOLERANCE_PX
    isScrollable.value = vertical || horizontal
  }

  function refresh(): void {
    // post 阶段：等 v-for / v-if 把新节点写进 DOM 再量，否则量到的还是旧高度。
    nextTick(measure)
  }

  function attach(el: HTMLElement | null): void {
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    resizeObserver = null
    mutationObserver = null
    if (!el) return

    if (typeof ResizeObserver !== 'undefined') {
      // 容器自身尺寸变化（窗口缩放、侧栏折叠）：会改变 clientHeight。
      resizeObserver = new ResizeObserver(() => measure())
      resizeObserver.observe(el)
    }
    if (typeof MutationObserver !== 'undefined') {
      // 容器尺寸不变但内容变多（异步列表追加）：ResizeObserver 对此无感，得盯子树。
      // `characterData: true` 是为了覆盖「同一行文本变长撑高」的场景。
      mutationObserver = new MutationObserver(() => measure())
      mutationObserver.observe(el, { childList: true, subtree: true, characterData: true })
    }
  }

  // 容器换节点（Teleport / v-if 重建）时重新挂观察器。
  watch(regionRef, (el) => attach(el), { flush: 'post' })

  if (contentKey) {
    watch(contentKey, refresh, { flush: 'post' })
  }

  onMounted(() => {
    attach(regionRef.value)
    refresh()
  })

  onScopeDispose(() => {
    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    resizeObserver = null
    mutationObserver = null
  })

  return { regionRef, isScrollable, measure }
}
