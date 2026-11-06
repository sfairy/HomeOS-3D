/** - 以设计稿宽高为内容区，通过 transform: scale() 实现整页等比缩放铺满视口； */
import { readLocalStorage, writeLocalStorage } from '@/shared/utils/core/local-storage.util'

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getConfigSection, configEpoch } from '@/shared/utils/config/frontend-config'
import { logger } from '@/shared/utils/core/logger'
// 设计稿基准宽度（取 ui 配置 scaleBaseWidth，缺省 1366）
const baseWidth = () => getConfigSection('ui').scaleBaseWidth ?? 1366
// 设计稿基准高度（取 ui 配置 scaleBaseHeight，缺省 1024）
const baseHeight = () => getConfigSection('ui').scaleBaseHeight ?? 1024
// localStorage 存储键：是否开启等比缩放
const STORAGE_KEY = 'homeos_viewport_scaling'
/** 模块级共享状态，供弹窗定位、锁屏与布局统一读取 */
export const currentScale = ref(1)
/** activeDesignWidth：响应式常量（ref / computed），取值语义见定义。 */
export const activeDesignWidth = ref(1366)
/** activeDesignHeight：响应式常量（ref / computed），取值语义见定义。 */
export const activeDesignHeight = ref(1024)
/**
 * 当前缩放比是否低于可读性警戒线（`MIN_SCALE`）。
 *
 * 注意：这**不表示**内容超出视口 —— 「始终完整显示」策略下画布永远在视口内；
 * 它只说明字号被压得比较小。布局侧若要判断侧栏是否可见，不能用这个标记。
 */
export const currentScaleClamped = ref(false)
// 是否开启等比缩放（初始化时从 localStorage 或视口判定读取）
/** scalingEnabled：响应式常量（ref / computed），取值语义见定义。 */
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
 * 可读性警戒线（**不再是缩放下限**）。
 *
 * 缩放策略是「始终完整显示」：画布永远按窗口实际比例缩放到刚好铺满，不出现滚动。
 * 代价是窗口很窄时字号会很小 —— 低于这条线时正文 12px 会被压到 8.6px 以下，
 * 属于「能看全但不好读」的区间，因此仅用于设置页提示，不参与缩放计算。
 *
 * 早期版本把它当成下限（低于此值就改成可滚动），结果是 1000px 左右的笔记本窗口
 * 一开启缩放就必须横向滚动，右侧按钮被推到屏幕外，也就是「缩放后显示不全」。
 */
export const MIN_SCALE = 0.72

/**
 * 整页等比缩放的上限。
 *
 * 策略：允许适度放大，但不超过 1.5 倍。
 * 为什么不再卡在 1：`requiredScale` 本身已经是 contain（不超出视口），卡 1 只会让
 * 1920×1200 这类大屏留下 118px 的左右黑边，与「铺满视口」的目标矛盾；
 * 而放任放大到 2～3 倍会让字号/间距脱离设计基准。1.5 是「填满大屏」与
 * 「保持设计比例」之间的折中，超过这个倍数改用更宽的列（见 effectiveContentWidth）。
 */
const MAX_UPSCALE = 1.5

/**
 * resize 结束后继续冻结 transform 过渡的时间。
 * 拖拽窗口期间画布每帧跟随（无过渡），松手后这段时间内仍不缓动，
 * 避免「尺寸已经对了，画布再滑一下」的尾帧错位。
 */
const RESIZE_SETTLE_MS = 160

/** `computeViewportLayout` 的结果：画布尺寸、shell 尺寸与缩放系数 */
interface ViewportLayout {
  scale: number
  requiredScale: number
  belowReadable: boolean
  shellW: number
  shellH: number
  contentW: number
  contentH: number
}

/**
 * viewport-fit contain：完整显示内容区，扩展 shell 使缩放后精确铺满视口（无外部留边）。
 *
 * 缩放系数 = `min(requiredScale, MAX_UPSCALE)`，**没有下限**：
 * 画布永远完整落在视口内（不滚动），窗口越小字越小。
 * 只拦「过度放大」——大屏上适度放大消除黑边，再大改用更宽的布局列
 * （见 effectiveContentWidth），而不是继续放大字号。
 *
 * 高度方向**不做等比锁定**：画布高度 = `max(设计高度, 视口高度 / 缩放比)`。
 * 视口比设计稿更高（平板竖屏、窄高窗口）时，缩放比本来就由宽度决定，
 * 此时若仍按设计高度渲染，画布会缩成中间一条、上下留大片空白 ——
 * 也就是「高度没随设备自适应」。拉长到 vh / scale 后画布在两个方向都精确铺满，
 * 面板用 flex 自然吃掉多出来的纵向空间，字号与缩放比不受影响。
 *
 * @param vw 视口宽度
 * @param vh 视口高度
 * @param contentW 内容区（设计稿）宽度
 * @param contentH 内容区（设计稿）高度
 * @returns 画布尺寸、shell 尺寸与缩放系数
 */
function computeViewportLayout(vw: number, vh: number, contentW: number, contentH: number): ViewportLayout {
  // 取宽高比中较小的缩放系数，保证内容完整显示（contain）
  const requiredScale = Math.min(vw / contentW, vh / contentH)
  // 只封顶不抬底：contain 已保证不溢出视口，这里防止超大屏把字号放到脱离设计基准
  const scale = Math.min(requiredScale, MAX_UPSCALE)
  // 只向上拉伸，不压缩：视口比设计稿更矮时仍保留设计高度（横向由 effectiveContentWidth 消化）
  const canvasH = Math.max(contentH, vh / scale)
  return {
    scale,
    // 完整显示所需的原始比例（未封顶），供设置页展示换算过程
    requiredScale,
    // 低于可读性警戒线（仅用于提示「字会偏小」，不影响布局）
    belowReadable: scale < MIN_SCALE,
    // shell 尺寸 = 视口尺寸 / 缩放系数，使 scale(shell) 后恰好铺满视口
    shellW: vw / scale,
    shellH: canvasH,
    contentW,
    contentH: canvasH,
  }
}

/**
 * 画布单位 CSS 变量：`--hos-vw/vh` 是画布逻辑尺寸，`--hos-screen-w/h` 是「一屏可见区域」
 * 换算到画布单位后的值（弹窗/侧栏的 max-height 用它，避免缩放比变化时二次换算）。
 *
 * @param layout 当前视口布局
 * @returns 注入到 `.app-shell` 的内联 CSS 变量
 */
function buildCanvasVars(layout: ViewportLayout) {
  return {
    '--hos-vw': `${layout.contentW}px`,
    '--hos-vh': `${layout.contentH}px`,
    '--hos-screen-w': `${Math.min(layout.contentW, layout.shellW)}px`,
    '--hos-screen-h': `${Math.min(layout.contentH, layout.shellH)}px`,
  }
}

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
    // 「始终完整显示」策略下 shellW = vw / scale 恒 ≥ designW（scale 是 contain 比），
    // 画布高度则会按视口拉长（竖屏平板），所以这里同样用 layout.contentH，
    // 否则锁屏只在中间一条、上下留空。
    const layout = computeViewportLayout(vw, vh, designW, designH)
    return {
      layoutMode: 'scaled',
      designW,
      designH,
      shellScale: layout.scale,
      shellW: layout.shellW,
      shellH: layout.shellH,
      canvasW: layout.contentW,
      canvasH: layout.contentH,
      renderedW: layout.contentW * layout.scale,
      renderedH: layout.contentH * layout.scale,
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
 * 开启整页等比缩放后，画布是一块固定宽（设计基准，通常 1366~1728）的虚拟桌面，
 * 但 CSS 的 `@media` 断点读的是**真实窗口宽度**：1280px 的笔记本窗口会让 1728 宽的
 * 画布套用「平板/手机」规则（顶栏文字消失、操作区被裁、导航塌成图标+更多），
 * 看起来就是「缩放后显示不全」。
 *
 * 这里给 `<html>` 打一个 `hos-canvas-scaled` 标记，画布内的响应式规则用
 * `html:not(.hos-canvas-scaled)` 门控，从而按画布宽度而非窗口宽度决策。
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
 * 以设计稿宽高为内容区，扩展 shell + transform: scale() 完整显示并铺满当前窗口。
 *
 * @param pageMaxWidth 页面最大宽度 ref（可空，缺省取配置 scaleBaseWidth）
 * @param options.forceScaling 强制开启（独立全屏页用）
 * @param options.publishGlobals 是否把布局结果发布到模块级全局量（currentScale /
 *   activeDesignWidth / activeDesignHeight / currentScaleClamped）。**只应由渲染
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
  // 设计稿宽度：优先取 pageMaxWidth，否则取配置 scaleBaseWidth；读取 configEpoch 触发响应
  const designWidth = computed(() => {
    configEpoch.value
    return pageMaxWidth?.value || baseWidth()
  })
  // 设计稿高度：取配置 scaleBaseHeight；读取 configEpoch 触发响应
  const designHeight = computed(() => {
    configEpoch.value
    return baseHeight()
  })
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
  /** 同步模块级共享全局变量，供弹窗定位/锁屏等模块读取 */
  function syncScaleGlobals(s: number, dw: number, dh: number) {
    currentScale.value = s
    activeDesignWidth.value = dw
    activeDesignHeight.value = dh
  }
  const scalingOn = computed(() => scalingEnabled.value || !!options?.forceScaling?.value)
  /** 是否发布模块级全局量：默认 false，只有主壳显式开启（单一 owner） */
  const publishGlobals = options?.publishGlobals === true
  // 当前视口布局：未开启缩放时返回 null
  // 超宽屏（≥1920px）基准宽：超过这个宽度后不再整体放大，而是把横向空间交给布局
  const ULTRAWIDE_MIN_WIDTH = 1920
  /** 生效内容宽度：普通屏=设计稿宽；超宽屏=视口宽/放大上限（更宽的列，而非更大的字号） */
  const effectiveContentWidth = computed(() => {
    const baseW = designWidth.value
    if (vw.value < ULTRAWIDE_MIN_WIDTH) return baseW
    return Math.max(baseW, Math.ceil(vw.value / MAX_UPSCALE))
  })

  const viewportLayout = computed(() => {
    const contentH = designHeight.value
    if (!scalingOn.value) {
      return null
    }
    return computeViewportLayout(vw.value, vh.value, effectiveContentWidth.value, contentH)
  })
  // 布局/设计尺寸/缩放开关变化时同步全局共享变量。
  // 只有「真正渲染 .viewport-frame 的主壳」才发布：设置面板、右栏等旁路实例也会 new 一份
  // useScaling 拿 vw/vh，如果它们也写全局量，就会按自己的挂载顺序覆盖主壳的基准，
  // 弹窗定位（回退到 currentScale 时）与贴栏停靠判断会读到错的坐标系。
  if (publishGlobals) {
    watch(
      [viewportLayout, effectiveContentWidth, designHeight, scalingOn],
      () => {
        const contentW = effectiveContentWidth.value
        const contentH = designHeight.value
        if (!scalingOn.value || !viewportLayout.value) {
          syncScaleGlobals(1, contentW, contentH)
          currentScaleClamped.value = false
          return
        }
        syncScaleGlobals(viewportLayout.value.scale, contentW, contentH)
        currentScaleClamped.value = viewportLayout.value.belowReadable
      },
      { immediate: true },
    )
  }
  // 当前缩放系数（未开启缩放时为 1）
  const scale = computed(() => viewportLayout.value?.scale ?? 1)
  /**
   * 缩放系数是否低于可读性警戒线（**仅用于提示，不再触发滚动**）。
   *
   * 「始终完整显示」策略下画布总在视口内，窗口很窄时只是字变小；
   * 这个标记供设置页提醒「当前需要 ×0.58 才能看全，正文会被压到 7px 左右」。
   */
  const scaleClamped = computed(() => viewportLayout.value?.belowReadable ?? false)
  // 是否正在 resize 节流中（供 UI 添加过渡动画）
  const isResizing = ref(false)
  // shell 容器样式：未开启缩放时 100% 占满；否则按 shellW/shellH + scale 变换
  const shellStyle = computed(() => {
    if (!scalingOn.value) {
      return { width: '100%', height: '100%' }
    }
    const layout = viewportLayout.value
    if (!layout) return { width: '100%', height: '100%' }
    return {
      width: `${layout.shellW}px`,
      height: `${layout.shellH}px`,
      transform: `scale(${layout.scale})`,
      transformOrigin: 'center center',
      flexShrink: '0',
    }
  })
  /** 画布舞台：始终 display:contents（不再有「触底滚动」分支）。 */
  const stageStyle = { display: 'contents' }
  // 内容区样式：固定为设计稿尺寸，由 shell 的 scale 缩放
  const contentStyle = computed(() => {
    if (!scalingOn.value) return {}
    const layout = viewportLayout.value
    if (!layout) return {}
    return {
      width: `${layout.contentW}px`,
      height: `${layout.contentH}px`,
      flexShrink: '0',
    }
  })
  /**
   * 画布单位变量：`--hos-vw / --hos-vh` = 设计画布的宽/高（CSS px，未乘缩放比）。
   *
   * 为什么需要：画布内的 `100vh / 100vw` 取的是**真实视口**，不是画布。
   * 缩放开启后两者会分叉（例如 390×844 窗口里画布是 1728×1117），
   * 于是 `max-height: 88vh` 在画布单位里变成 743px 而不是 983px，
   * 弹窗/面板会明显偏小，位置也会偏。画布单位始终等于设计稿尺寸，
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
    DESIGN_HEIGHT: designHeight,
  }
}
