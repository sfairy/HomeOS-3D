/**
 * 卡片名称的**横向滚动窗口**（0.8.9 `installLibraryNameScroll`）。
 *
 * 为什么不是省略号：资产卡片的宽度只有一百多像素，中文模型名普遍超过它。
 * 截断让用户无法区分「3D打印机-lite」与「3D打印机」，而卡片又没法加宽
 * （两列布局是面板宽度决定的）。上游的做法是**悬停时横向滚动**：
 *
 * - 名称容器 `overflow: hidden`，内层 `width: max-content` 单行不换行；
 * - 悬停/聚焦时若内容溢出，按溢出量播放一段往复动画（首尾各有停顿）；
 * - 离开/失焦立即取消，避免多个卡片同时滚动。
 *
 * 无障碍：卡片的 `title` 与 `aria-label` 都写完整名称 —— 滚动只是视觉补偿，
 * 读屏与提示框始终拿到全名。
 */

/** 单次往返的最短时长（毫秒，上游 `max(1200, overflow*14+600)`）。 */
const SCROLL_MIN_MS = 1_200
/** 每像素溢出对应的额外时长（毫秒/像素，上游 `overflow * 14`）。 */
const SCROLL_PER_PIXEL_MS = 14
/** 动画里首尾停顿的固定开销（毫秒）。 */
const SCROLL_PAUSE_MS = 600

type AnimationHandle = { cancel: () => void }

/**
 * 给一批卡片装上滚动窗口。
 *
 * 幂等：已经装过的卡片（`data-name-scroll` 标记）会被跳过 —— 列表每次刷新都重建卡片，
 * 但局部刷新时可能重复调用，重复绑监听会让滚动速度成倍。
 */
export function installAssetNameScroll(
  cards: readonly HTMLElement[],
  options: { reducedMotion?: () => boolean } = {},
): void {
  const prefersReduced = options.reducedMotion ?? defaultReducedMotion
  const runningByCard = new Map<HTMLElement, AnimationHandle>()

  const stop = (card: HTMLElement) => {
    runningByCard.get(card)?.cancel()
    runningByCard.delete(card)
  }

  for (const card of cards) {
    const windowElement = card.querySelector<HTMLElement>('.asset-name-window')
    const textElement = card.querySelector<HTMLElement>('.asset-name-text')
    if (!windowElement || !textElement || card.dataset.nameScroll === '1') continue
    card.dataset.nameScroll = '1'

    const start = () => {
      stop(card)
      // 尊重「减少动态效果」：偏好开启时完全不动，用户仍可通过 title 看全名。
      if (prefersReduced() || card.hidden) return
      const overflow = textElement.scrollWidth - windowElement.clientWidth
      // 不溢出就没必要动；`<= 1` 的容差吸收亚像素取整。
      if (overflow <= 1 || typeof textElement.animate !== 'function') return
      runningByCard.set(
        card,
        textElement.animate(
          [
            { transform: 'translateX(0)', offset: 0 },
            { transform: 'translateX(0)', offset: 0.08 },
            { transform: `translateX(-${overflow}px)`, offset: 0.74 },
            { transform: `translateX(-${overflow}px)`, offset: 0.87 },
            { transform: 'translateX(0)', offset: 1 },
          ],
          {
            duration: Math.max(SCROLL_MIN_MS, overflow * SCROLL_PER_PIXEL_MS + SCROLL_PAUSE_MS),
            iterations: Infinity,
            easing: 'ease-in-out',
          },
        ) as unknown as AnimationHandle,
      )
    }

    card.addEventListener('pointerenter', start)
    card.addEventListener('focus', start)
    card.addEventListener('pointerleave', () => stop(card))
    card.addEventListener('blur', () => stop(card))
  }
}

function defaultReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
