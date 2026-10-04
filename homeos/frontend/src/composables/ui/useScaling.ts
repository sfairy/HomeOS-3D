/**
 * @file useScaling.ts
 * @module composables/ui
 * @description 视口整页等比缩放 composable 与锁屏布局计算。
 *
 * 职责：
 * - 以设计稿宽高为内容区，通过 transform: scale() 实现整页等比缩放铺满视口；
 * - 维护模块级共享状态（currentScale/activeDesignWidth/activeDesignHeight/scalingEnabled），
 *   供弹窗定位、锁屏与布局统一读取；
 * - 提供 computeViewportLayout（contain 模式）与 computeScreensaverLayout（锁屏专用）布局计算；
 * - 监听 resize/orientationchange/visualViewport/scaling-change 事件，节流后同步视口尺寸；
 * - 默认关闭整页等比缩放：户型图等精度场景改由局部 pan/pinch（useFloorplanMapViewport）承担，
 *   避免「整页 scale 当地图缩放」带来的命中模糊与弹层反算。
 *
 * 依赖：
 * - vue（ref/computed/watch/onMounted/onUnmounted）
 * - frontend-config（getConfigSection/configEpoch）
 * - logger（错误日志）
 */
import { readLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getConfigSection, configEpoch } from '@/utils/config/frontend-config'
import { logger } from '@/utils/core/logger'
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
 * viewport-fit contain：完整显示内容区，扩展 shell 使缩放后精确铺满视口（无外部留边）。
 * 限制 scale 上限为 1：只缩小不放大，避免高分辨率屏幕上内容被放大导致布局失调。
 *
 * @param vw 视口宽度
 * @param vh 视口高度
 * @param contentW 内容区（设计稿）宽度
 * @param contentH 内容区（设计稿）高度
 * @returns {{ scale, shellW, shellH, contentW, contentH }}
 */
function computeViewportLayout(vw: number, vh: number, contentW: number, contentH: number) {
  // 取宽高比中较小的缩放系数，保证内容完整显示（contain）
  let scale = Math.min(vw / contentW, vh / contentH)
  // 限制 scale 上限为 1：只缩小不放大
  // 原因：屏幕比设计稿大时，放大内容会导致字体/间距过大，布局失调
  scale = Math.min(scale, 1)
  return {
    scale,
    // shell 尺寸 = 视口尺寸 / 缩放系数，使 scale(shell) 后恰好铺满视口
    shellW: vw / scale,
    shellH: vh / scale,
    contentW,
    contentH,
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
    // 开启缩放：与主壳共用 computeViewportLayout，保证锁屏与主页缩放一致
    const layout = computeViewportLayout(vw, vh, designW, designH)
    return {
      layoutMode: 'scaled',
      designW,
      designH,
      shellScale: layout.scale,
      shellW: layout.shellW,
      shellH: layout.shellH,
      canvasW: designW,
      canvasH: designH,
      renderedW: vw,
      renderedH: vh,
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
 * 视口整页等比缩放 composable。
 *
 * 以设计稿宽高为内容区，扩展 shell + transform: scale() 完整显示并铺满当前窗口。
 *
 * @param pageMaxWidth 页面最大宽度 ref（可空，缺省取配置 scaleBaseWidth）
 * @returns scalingEnabled/scale/isResizing/vw/vh/shellStyle/contentStyle 等响应式状态
 */
export function useScaling(
  pageMaxWidth: { value?: number } | null | undefined,
  options?: { forceScaling?: { value: boolean } },
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
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  /** 同步视口尺寸：优先取 visualViewport（处理移动端地址栏伸缩），回退 window 尺寸 */
  function syncViewportSize() {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    vw.value = Math.round(vv?.width ?? window.innerWidth)
    vh.value = Math.round(vv?.height ?? window.innerHeight)
  }
  /** resize 节流：120ms 防抖后同步尺寸，期间标记 isResizing 供 UI 过渡 */
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer)
    isResizing.value = true
    resizeTimer = setTimeout(() => {
      resizeTimer = null
      isResizing.value = false
      syncViewportSize()
    }, 120)
  }
  /** 横屏切换/visualViewport 即时同步（不节流，避免横屏延迟） */
  function onViewportImmediate() {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = null
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
  // 当前视口布局：未开启缩放时返回 null
  // 超宽屏（≥1920px）最大放大倍数：超过后不再整体放大，而是把横向空间交给布局
  const ULTRAWIDE_MIN_WIDTH = 1920
  const ULTRAWIDE_SCALE_CAP = 1.5
  /** 生效内容宽度：普通屏=设计稿宽；超宽屏=视口宽/放大上限（更宽的列，而非更大的字号） */
  const effectiveContentWidth = computed(() => {
    const baseW = designWidth.value
    if (vw.value < ULTRAWIDE_MIN_WIDTH) return baseW
    return Math.max(baseW, Math.ceil(vw.value / ULTRAWIDE_SCALE_CAP))
  })

  const viewportLayout = computed(() => {
    const contentH = designHeight.value
    if (!scalingOn.value) {
      return null
    }
    return computeViewportLayout(vw.value, vh.value, effectiveContentWidth.value, contentH)
  })
  // 布局/设计尺寸/缩放开关变化时同步全局共享变量
  watch(
    [viewportLayout, effectiveContentWidth, designHeight, scalingOn],
    () => {
      const contentW = effectiveContentWidth.value
      const contentH = designHeight.value
      if (!scalingOn.value || !viewportLayout.value) {
        syncScaleGlobals(1, contentW, contentH)
        return
      }
      syncScaleGlobals(viewportLayout.value.scale, contentW, contentH)
    },
    { immediate: true },
  )
  // 当前缩放系数（未开启缩放时为 1）
  const scale = computed(() => viewportLayout.value?.scale ?? 1)
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
  // 缩放开关变化时持久化到 localStorage
  watch(scalingEnabled, (val) => writeStoredScaling(val))
  onMounted(() => {
    scalingEnabled.value = readStoredScaling()
    syncViewportSize()
    window.addEventListener('resize', onResize, { passive: true })
    window.addEventListener('orientationchange', onViewportImmediate)
    window.visualViewport?.addEventListener('resize', onViewportImmediate)
    window.addEventListener('homeos-scaling-change', onScalingChange)
    scale.value
  })
  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onViewportImmediate)
    window.visualViewport?.removeEventListener('resize', onViewportImmediate)
    window.removeEventListener('homeos-scaling-change', onScalingChange)
    if (resizeTimer) clearTimeout(resizeTimer)
  })
  return {
    scalingEnabled,
    scalingOn,
    scale,
    isResizing,
    vw,
    vh,
    shellStyle,
    contentStyle,
    toggleScaling: () => {
      scalingEnabled.value = !scalingEnabled.value
    },
    activeDesignWidth: designWidth,
    DESIGN_HEIGHT: designHeight,
  }
}