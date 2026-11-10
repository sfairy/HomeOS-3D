/**
 * 视口整页等比缩放 composable。
 *
 * 以设计稿宽高为基准，把画布按 contain 等比铺满当前窗口（两个方向都铺满，不留黑边），
 * 再通过 `transform: scale()` 呈现。缩放数学见 `shared/utils/layout/canvas-layout.util.ts`，
 * 这里只负责响应式接线、DOM 测量与全局量发布。
 */
import { readLocalStorage, writeLocalStorage } from '@/shared/utils/core/local-storage.util'

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getConfigSection, configEpoch } from '@/shared/utils/config/frontend-config'
import { logger } from '@/shared/utils/core/logger'
import {
  buildCanvasVars,
  computeViewportLayout,
  isPhoneViewport,
  resolveDesignMetrics,
  type CanvasLayout,
} from '@/shared/utils/layout/canvas-layout.util'

// 可读性警戒线 / 放大上限：设置页提示用，不参与缩放计算
export { MAX_UPSCALE, MIN_SCALE } from '@/shared/utils/layout/canvas-layout.util'

// localStorage 存储键：是否开启等比缩放
const STORAGE_KEY = 'homeos_viewport_scaling'

/** 模块级共享状态，供弹窗定位、锁屏与布局统一读取 */
export const currentScale = ref(1)

/** 生效的设计稿基准宽度（未乘缩放比）。设置页展示与屏保复用。 */
export const activeDesignWidth = ref(1366)

/** 生效的设计稿基准高度（未乘缩放比）。 */
export const activeDesignHeight = ref(1024)

/**
 * 生效的画布宽度（CSS px，未乘缩放比），也是**布局断点的基准**。
 *
 * 缩放模式下 = 画布宽（可能大于设计宽）；流式模式下 = 视口宽（没有画布）。
 * 与 CSS 侧 `@container hos-canvas` 的解析结果一一对应：缩放时容器是 `.app-shell`
 * （宽 = 画布宽），流式时 `.app-shell` 不声明 container，查询落到 `body`（宽 = 视口宽）。
 */
export const activeCanvasWidth = ref(1366)

/** 生效的画布高度（CSS px，未乘缩放比）。 */
export const activeCanvasHeight = ref(1024)

/**
 * 当前缩放比是否低于可读性警戒线（`MIN_SCALE`）。
 *
 * 注意：这**不表示**内容超出视口 —— 画布永远铺满视口；它只说明字号被压得比较小。
 * 布局侧若要判断侧栏是否可见，不能用这个标记。
 */
export const currentScaleClamped = ref(false)

// 是否开启等比缩放（初始化时从 localStorage 读取）
/** 用户的缩放偏好（未经手机视口降级）。 */
export const scalingEnabled = ref(readStoredScaling())

/**
 * 从 localStorage 读取缩放偏好；未存储时默认关闭整页等比缩放。
 *
 * @returns 是否开启等比缩放
 */
function readStoredScaling() {
  try {
    const stored = readLocalStorage(STORAGE_KEY)
    if (stored !== null) return stored === 'true'
    return false
  } catch {
    return false
  }
}

/**
 * 将缩放偏好写入 localStorage 并广播自定义事件，供其他模块同步状态。
 *
 * @param value 是否开启等比缩放
 */
function writeStoredScaling(value: boolean) {
  try {
    writeLocalStorage(STORAGE_KEY, String(value))
    window.dispatchEvent(new CustomEvent('homeos-scaling-change', { detail: value }))
  } catch (err) {
    logger.error('缩放偏好保存失败', err)
  }
}

/**
 * resize 结束后继续冻结 transform 过渡的时间。
 * 拖拽窗口期间画布每帧跟随（无过渡），松手后这段时间内仍不缓动，
 * 避免「尺寸已经对了，画布再滑一下」的尾帧错位。
 */
const RESIZE_SETTLE_MS = 160

/**
 * 锁屏布局：与 ScaledViewport 共用缩放系数，避免平板等比缩放时时钟/日期错位或过小。
 *
 * 开启缩放时使用 scaled 模式（与主壳一致）；否则使用 fluid 模式（按 fit 等比缩小并居中）。
 *
 * @param vw 视口宽度
 * @param vh 视口高度
 * @param designW 设计稿宽度
 * @param designH 设计稿高度
 * @returns 锁屏布局参数（含 layoutMode/shellScale/shellW/canvasW/offset 等）
 */
export function computeScreensaverLayout(vw: number, vh: number, designW: number, designH: number) {
  const scalingOn = scalingEnabled.value
  if (scalingOn) {
    // 开启缩放：与主壳共用 computeViewportLayout，保证锁屏与主页缩放一致。
    // 画布两个方向都按视口铺满，所以 canvasW/canvasH 必须原样交给内容盒，
    // 否则竖屏下锁屏只占中间一条、上下留空。
    const layout = computeViewportLayout(vw, vh, designW, designH)
    return {
      layoutMode: 'scaled',
      designW: layout.designW,
      designH: layout.designH,
      shellScale: layout.scale,
      shellW: layout.shellW,
      shellH: layout.shellH,
      canvasW: layout.canvasW,
      canvasH: layout.canvasH,
      renderedW: layout.canvasW * layout.scale,
      renderedH: layout.canvasH * layout.scale,
      offsetX: 0,
      offsetY: 0,
    }
  }
  // 未开启缩放：按 fit 系数等比缩小内容并居中，fit 不超过 1 避免放大
  const fit = Math.min(vw / designW, vh / designH, 1)
  const canvasW = designW * fit
  const canvasH = designH * fit
  return {
    layoutMode: 'fluid',
    designW,
    designH,
    shellScale: 1,
    shellW: canvasW,
    shellH: canvasH,
    canvasW,
    canvasH,
    renderedW: canvasW,
    renderedH: canvasH,
    offsetX: (vw - canvasW) / 2,
    offsetY: (vh - canvasH) / 2,
    fit,
  }
}

/**
 * 等比缩放画布标记的持有计数。
 *
 * 画布是一块按设计基准等比铺满的虚拟桌面，但 CSS 的 `@media` 断点读的是**真实窗口宽度**：
 * 1280px 的笔记本窗口会让更宽的画布套用「平板/手机」规则，看起来就是「缩放后显示不全」。
 *
 * 这里给 `<html>` 打一个 `hos-canvas-scaled` 标记，供还需要按「是否缩放」本身分支的样式使用
 * （布局断点已改为 `@container hos-canvas`，不再依赖窗口宽度）。
 * 用引用计数是因为同一时刻可能有多个壳（主布局 / 独立全屏页）同时存在。
 */
let scaledCanvasHolders = 0

/**
 * 声明「当前有一个缩放画布在渲染」，返回释放函数。
 * 首次持有给 `<html>` 加类，最后一个释放时移除。
 *
 * @returns 释放函数（可重复调用，只有第一次生效）
 */
export function holdScaledCanvasFlag(): () => void {
  if (typeof document === 'undefined') return () => {}
  scaledCanvasHolders++
  document.documentElement.classList.add('hos-canvas-scaled')
  let released = false
  return () => {
    if (released) return
    released = true
    scaledCanvasHolders = Math.max(0, scaledCanvasHolders - 1)
    if (scaledCanvasHolders === 0) document.documentElement.classList.remove('hos-canvas-scaled')
  }
}

/**
 * 把计算样式里的长度读成数字，读不出（空值 / `auto`）时按 0 处理。
 *
 * 抽成函数是因为四个方向都要用：写在 `readViewportBox` 里会退化成四个 `|| 0`，
 * 直接把那个函数的圈复杂度顶到棘轮线以上。
 *
 * @param value `getComputedStyle` 给出的 padding 字面量
 * @returns 像素值，无法解析时为 0
 */
function paddingPx(value: string) {
  return Number.parseFloat(value) || 0
}

/**
 * 读取当前视口的「安全区内容盒」尺寸。
 *
 * 不用 visualViewport：它会把软键盘、双指缩放也当成尺寸变化，导致整页反复重排；
 * 也不含 `env(safe-area-inset-*)`（安全区只写在 `.viewport-frame` 的 padding 上），
 * 直接用它会让缩放后的画布超出异形屏可用区域并被裁掉。壳层 clientWidth/Height 是
 * 布局视口尺寸，减去 padding 即安全区内的可用画布尺寸。
 *
 * 导出给屏保等「不在 .viewport-frame 里但需要同一视口基准」的模块复用，
 * 避免各处分别读 innerWidth / visualViewport 导致安全区与滚动条算法不一致。
 *
 * @returns 可用内容盒尺寸；无 DOM / 量不到正尺寸时返回 null
 */
export function readViewportBox(): { width: number; height: number } | null {
  const frame = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.viewport-frame')
  if (!frame) return null
  const style = getComputedStyle(frame)
  const width = frame.clientWidth - paddingPx(style.paddingLeft) - paddingPx(style.paddingRight)
  const height = frame.clientHeight - paddingPx(style.paddingTop) - paddingPx(style.paddingBottom)
  // 隐藏 / 折叠时任一边会是 0 甚至负数；取 min 一次判掉，省掉一个 `||`。
  if (Math.min(width, height) <= 0) return null
  return { width, height }
}

/**
 * 壳层不可用时的视口尺寸兜底：优先 visualViewport（移动端横屏/软键盘更准），
 * 否则退回 window 尺寸。
 *
 * @returns 视口宽高（已取整）
 */
function readWindowSize() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  }
}

/**
 * 视口整页等比缩放 composable。
 *
 * 以设计稿宽高为内容区，扩展画布 + `transform: scale()`，让画布在两个方向上都精确铺满
 * 当前窗口（不留黑边、不裁切、不变形）。
 *
 * @param pageMaxWidth 页面最大宽度 ref（可空，缺省取配置 scaleBaseWidth）
 * @param options.forceScaling 强制开启（独立全屏页用）
 * @param options.publishGlobals 是否把布局结果发布到模块级全局量。**只应由渲染
 *   `.viewport-frame` 的主壳传 true**，其余旁路实例只消费不发布，否则全局量会随挂载顺序被覆盖。
 * @returns scalingEnabled/scale/isResizing/vw/vh/shellStyle/contentStyle 等响应式状态
 */
export function useScaling(
  pageMaxWidth: { value?: number } | null | undefined,
  options?: { forceScaling?: { value: boolean }; publishGlobals?: boolean },
) {
  // 视口宽高（初始化取 window 尺寸，SSR 安全降级）
  const vw = ref(typeof window !== 'undefined' ? window.innerWidth : 1366)
  const vh = ref(typeof window !== 'undefined' ? window.innerHeight : 1024)
  // 设计稿宽高：pageMaxWidth > ui.scaleBaseWidth，高度取 ui.scaleBaseHeight；读取 configEpoch 触发响应
  const designMetrics = computed(() => {
    configEpoch.value
    return resolveDesignMetrics({
      pageMaxWidth: pageMaxWidth?.value,
      ui: getConfigSection('ui'),
    })
  })
  const designWidth = computed(() => designMetrics.value.width)
  const designHeight = computed(() => designMetrics.value.height)

  let resizeRaf: number | null = null
  let resizeEndTimer: ReturnType<typeof setTimeout> | null = null
  let frameObserver: ResizeObserver | null = null
  /** 同步视口尺寸：优先取壳层可用内容盒，回退 visualViewport / window 尺寸 */
  function syncViewportSize() {
    const box = readViewportBox() ?? readWindowSize()
    vw.value = Math.round(box.width)
    vh.value = Math.round(box.height)
  }
  /**
   * resize 处理：rAF 立即跟随，不用防抖延迟。
   *
   * 旧实现是 120ms 防抖后才改尺寸，加上 `.app-shell` 常驻的 0.15s transform 过渡，
   * 拖拽窗口时画布会「停住 → 松手 → 再缓动 150ms」，视觉上明显滞后。
   * 现在每帧同步尺寸（量与计算都很轻），并把 `isResizing` 保持到最后一帧之后
   * END 时间，期间由 CSS 关掉 transform 过渡，避免「尺寸已变、画布还在缓动」的错位；
   * 弹窗定位走 DOM 实测 scale，不会读到缓动中的旧值。
   */
  function onResize() {
    isResizing.value = true
    if (resizeEndTimer) clearTimeout(resizeEndTimer)
    resizeEndTimer = setTimeout(() => {
      resizeEndTimer = null
      isResizing.value = false
    }, RESIZE_SETTLE_MS)
    if (resizeRaf !== null) return
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null
      syncViewportSize()
    })
  }
  /** 横屏切换/visualViewport 即时同步（不节流，避免横屏延迟） */
  function onViewportImmediate() {
    if (resizeRaf !== null) {
      cancelAnimationFrame(resizeRaf)
      resizeRaf = null
    }
    syncViewportSize()
  }
  /** 监听 homeos-scaling-change 自定义事件，同步 scalingEnabled */
  function onScalingChange(e: Event) {
    scalingEnabled.value = !!(e as CustomEvent).detail
  }
  /** 同步模块级共享全局变量，供弹窗定位/锁屏/断点档位等模块读取 */
  function syncScaleGlobals(layout: CanvasLayout | null, designW: number, designH: number) {
    activeDesignWidth.value = designW
    activeDesignHeight.value = designH
    if (!layout) {
      // 流式：没有缩放画布，断点基准退化为视口尺寸
      // —— 与 CSS 侧一致（此时 .app-shell 不声明 container，查询落到 body 的同名容器）。
      currentScale.value = 1
      currentScaleClamped.value = false
      activeCanvasWidth.value = vw.value
      activeCanvasHeight.value = vh.value
      return
    }
    currentScale.value = layout.scale
    currentScaleClamped.value = layout.belowReadable
    activeCanvasWidth.value = layout.canvasW
    activeCanvasHeight.value = layout.canvasH
  }

  /**
   * 手机视口自动退回流体布局：390px 宽把 1366 画布压到 ×0.2855，正文 12px 只剩 3.4px，
   * 「能看全但完全不可读」。此时保留用户的缩放偏好（不清 localStorage），只是不生效，
   * 用户换回平板/桌面后自动恢复。
   */
  const phoneViewport = computed(() => isPhoneViewport(vw.value, vh.value))
  /**
   * 低于 MIN_SCALE 只提示、不降级：缩放默认关闭，开启是用户的显式选择，设置页已就字号偏小给出警告。
   * 若在这里强制退回流式，1366×768 笔记本、1024×768 平板横屏等常见窗口会出现
   * 「按钮显示已开启、页面却没缩放」，且阈值附近拖动窗口会在两套布局间来回跳。
   */
  const scalingOn = computed(() => !!options?.forceScaling?.value || (scalingEnabled.value && !phoneViewport.value))
  /** 是否发布模块级全局量：默认 false，只有主壳显式开启（单一 owner） */
  const publishGlobals = options?.publishGlobals === true
  // 当前画布布局：未开启缩放时返回 null
  const viewportLayout = computed(() => {
    if (!scalingOn.value) return null
    return computeViewportLayout(vw.value, vh.value, designWidth.value, designHeight.value)
  })
  // 布局/设计尺寸/缩放开关变化时同步全局共享变量。
  // 只有「真正渲染 .viewport-frame 的主壳」才发布：设置面板、右栏等旁路实例也会 new 一份
  // useScaling 拿 vw/vh，如果它们也写全局量，就会按自己的挂载顺序覆盖主壳的基准，
  // 弹窗定位（回退到 currentScale 时）与贴栏停靠判断会读到错的坐标系。
  if (publishGlobals) {
    watch(
      [viewportLayout, designWidth, designHeight, vw, vh],
      () => {
        syncScaleGlobals(viewportLayout.value, designWidth.value, designHeight.value)
      },
      { immediate: true },
    )
  }
  // 当前缩放系数（未开启缩放时为 1）
  const scale = computed(() => viewportLayout.value?.scale ?? 1)
  /**
   * 缩放系数是否低于可读性警戒线（**仅用于提示，不再触发滚动**）。
   *
   * 画布总在视口内，窗口很窄时只是字变小；这个标记供设置页提醒「正文会被压到 8px 以下」。
   */
  const scaleClamped = computed(() => viewportLayout.value?.belowReadable ?? false)
  // 是否正在 resize 节流中（供 UI 添加过渡动画）
  const isResizing = ref(false)
  // shell 容器样式：未开启缩放时 100% 占满；否则按画布尺寸 + scale 变换
  const shellStyle = computed(() => {
    const layout = viewportLayout.value
    if (!scalingOn.value || !layout) {
      return { width: '100%', height: '100%' }
    }
    return {
      width: `${layout.shellW}px`,
      height: `${layout.shellH}px`,
      transform: `scale(${layout.scale})`,
      transformOrigin: 'center center',
      flexShrink: '0',
    }
  })
  /** 画布舞台：始终 display:contents（不产生布局影响，也没有滚动分支）。 */
  const stageStyle = { display: 'contents' }
  // 内容区样式：固定为画布尺寸，由 shell 的 scale 缩放
  const contentStyle = computed(() => {
    const layout = viewportLayout.value
    if (!scalingOn.value || !layout) return {}
    return {
      width: `${layout.contentW}px`,
      height: `${layout.contentH}px`,
      flexShrink: '0',
    }
  })
  /**
   * 画布单位变量：`--hos-vw / --hos-vh` = 画布宽/高（CSS px，未乘缩放比），
   * `--hos-screen-w / --hos-screen-h` = 一屏可见区域。
   *
   * 为什么需要：画布内的 `100vh / 100vw` 取的是**真实视口**，不是画布。
   * 缩放开启后两者会分叉（例如 390×844 窗口里画布是 1366×2956），
   * 于是 `max-height: 88vh` 在画布单位里变成 743px 而不是 2601px，
   * 弹窗/面板会明显偏小，位置也会偏。画布单位始终等于画布尺寸，
   * 弹窗按它算出的边距与画布边缘严格对应，再随整页一起等比缩放。
   *
   * 只在开启缩放时注入，未开启时组件用 `var(--hos-vh, 100vh)` 自然回退到原行为。
   */
  const canvasVars = computed(() => {
    const layout = viewportLayout.value
    return layout ? buildCanvasVars(layout) : {}
  })
  // 缩放开关变化时持久化到 localStorage
  watch(scalingEnabled, (enabled) => writeStoredScaling(enabled))

  onMounted(() => {
    scalingEnabled.value = readStoredScaling()
    syncViewportSize()
    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('orientationchange', onViewportImmediate)
    window.visualViewport?.addEventListener('resize', onViewportImmediate)
    window.addEventListener('homeos-scaling-change', onScalingChange)
    // 壳层尺寸变化但窗口尺寸没变（安全区变化、分屏/画中画、全屏子元素、字体延迟加载等）
    // 只靠 window.resize 会漏掉。ResizeObserver 直接盯壳层内容盒，命中即按同一个 resize 路径处理。
    if (typeof ResizeObserver !== 'undefined') {
      const frame = document.querySelector<HTMLElement>('.viewport-frame')
      if (frame) {
        frameObserver = new ResizeObserver(() => onResize())
        frameObserver.observe(frame)
      }
    }
  })
  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onViewportImmediate)
    window.visualViewport?.removeEventListener('resize', onViewportImmediate)
    window.removeEventListener('homeos-scaling-change', onScalingChange)
    frameObserver?.disconnect()
    frameObserver = null
    if (resizeRaf !== null) cancelAnimationFrame(resizeRaf)
    resizeRaf = null
    if (resizeEndTimer) clearTimeout(resizeEndTimer)
    resizeEndTimer = null
  })
  return {
    scalingEnabled,
    scalingOn,
    phoneViewport,
    scale,
    scaleClamped,
    isResizing,
    vw,
    vh,
    shellStyle,
    stageStyle,
    contentStyle,
    canvasVars,
    toggleScaling: () => {
      scalingEnabled.value = !scalingEnabled.value
    },
    activeDesignWidth: designWidth,
    activeDesignHeight: designHeight,
    // 与 syncScaleGlobals 同源：流式模式下没有画布，断点基准就是视口尺寸
    activeCanvasWidth: computed(() => viewportLayout.value?.canvasW ?? vw.value),
    activeCanvasHeight: computed(() => viewportLayout.value?.canvasH ?? vh.value),
    DESIGN_WIDTH: designWidth,
    DESIGN_HEIGHT: designHeight,
  }
}
