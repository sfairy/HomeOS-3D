/**
 * @file screensaver-layout.internals.ts
 * @module frontend/src/composables/ui
 */
import { ref, computed, type Ref } from 'vue'
import { getConfigSection } from '@/shared/utils/config/frontend-config'
import { computeScreensaverLayout, readViewportBox } from '@/composables/ui/useScaling'
import { resolveDesignMetrics } from '@/shared/utils/layout/canvas-layout.util'
import { screensaverBackgroundIdle } from '@/shared/utils/ui/screensaver-background-idle.util'
import { SS_DEFAULTS } from './screensaver.defaults'
import type { useLayoutStore } from '@/stores/layout.store'

type LayoutStore = ReturnType<typeof useLayoutStore>

/** 屏保视口 / 配置 tick 与 CSS 布局样式 */
export function createScreensaverLayoutState(layoutStore: LayoutStore) {
  const cfgTick = ref(0)
  const scalingTick = ref(0)
  /** 屏保与主壳共用同一视口基准（安全区内容盒），避免异形屏上锁屏比主界面多出一圈 */
  const initialBox = readViewportBox()
  const viewportW = ref(
    initialBox ? Math.round(initialBox.width) : typeof window !== 'undefined' ? window.innerWidth : 1366,
  )
  const viewportH = ref(
    initialBox ? Math.round(initialBox.height) : typeof window !== 'undefined' ? window.innerHeight : 1024,
  )
  const burnInOffset = ref({ x: 0, y: 0 })

  const ssCfg = computed(() => {
    cfgTick.value
    scalingTick.value
    return { ...SS_DEFAULTS, ...getConfigSection('screensaver') }
  })

  const layoutMetrics = computed(() => {
    scalingTick.value
    // 设计基准统一走 resolveDesignMetrics：与主壳 / 设置页预览同一条 fallback 链，
    // 避免「锁屏按 1366 算、主壳按配置算」导致两套画布尺寸对不齐。
    const metrics = resolveDesignMetrics({
      pageMaxWidth: layoutStore.layoutConfig.pageMaxWidth,
      ui: getConfigSection('ui'),
    })
    return computeScreensaverLayout(viewportW.value, viewportH.value, metrics.width, metrics.height)
  })

  const ssStyle = createSsStyle(ssCfg, layoutMetrics, viewportW, viewportH, burnInOffset)
  const { overlayClass, overlayDimStyle, shellStyle, contentShellStyle } = createOverlayShellStyles(
    ssCfg,
    layoutMetrics,
  )

  let resizeRaf: number | null = null
  function onViewportResize() {
    if (resizeRaf) return
    resizeRaf = requestAnimationFrame(() => {
      const box = readViewportBox()
      viewportW.value = Math.round(box?.width ?? window.innerWidth)
      viewportH.value = Math.round(box?.height ?? window.innerHeight)
      resizeRaf = null
    })
  }
  function onScalingChange() {
    scalingTick.value++
  }
  function bumpCfgTick() {
    cfgTick.value++
  }

  return {
    cfgTick,
    scalingTick,
    viewportW,
    viewportH,
    burnInOffset,
    ssCfg,
    layoutMetrics,
    ssStyle,
    overlayClass,
    overlayDimStyle,
    shellStyle,
    contentShellStyle,
    onViewportResize,
    onScalingChange,
    bumpCfgTick,
  }
}

function createOverlayShellStyles(
  ssCfg: Ref<Record<string, unknown>>,
  layoutMetrics: Ref<{
    layoutMode?: string
    shellW?: number
    shellH?: number
    shellScale?: number
    canvasW: number
    canvasH: number
    designW: number
    designH: number
  }>,
) {
  const overlayClass = computed(() => {
    const c = ssCfg.value
    return {
      instant: c.instantEnter !== false,
      instantLeave: c.instantLeave !== false,
    }
  })
  const overlayDimStyle = computed(() => {
    void screensaverBackgroundIdle.value
    const b = Number(ssCfg.value.brightness)
    if (screensaverBackgroundIdle.value && b > 0 && b < 1) {
      return { '--ss-dim-opacity': String(Math.min(1, Math.max(0, 1 - b))) }
    }
    return { '--ss-dim-opacity': '0' }
  })
  const shellStyle = computed(() => {
    const L = layoutMetrics.value
    if (L.layoutMode === 'scaled') {
      return {
        width: `${L.shellW}px`,
        height: `${L.shellH}px`,
        transform: `scale(${L.shellScale})`,
        transformOrigin: 'center center',
      }
    }
    return {
      width: `${L.canvasW}px`,
      height: `${L.canvasH}px`,
    }
  })
  const contentShellStyle = computed(() => {
    const L = layoutMetrics.value
    if (L.layoutMode === 'scaled') {
      // 内容盒必须等于画布盒（canvasW × canvasH），而不是设计基准：
      // 画布两个方向都按视口铺满后，竖屏/宽屏下的画布比设计稿更长或更宽，
      // 若内容盒仍按 designW × designH，锁屏只会占据画布中间一条，
      // 上下（或左右）留空 —— 就是「锁屏没随设备自适应」。
      return {
        width: `${L.canvasW}px`,
        height: `${L.canvasH}px`,
      }
    }
    return {
      width: '100%',
      height: '100%',
    }
  })
  return { overlayClass, overlayDimStyle, shellStyle, contentShellStyle }
}

function createSsStyle(
  ssCfg: Ref<Record<string, unknown>>,
  layoutMetrics: Ref<{ canvasW: number; canvasH: number; designW: number; designH: number; fit?: number }>,
  viewportW: Ref<number>,
  viewportH: Ref<number>,
  burnInOffset: Ref<{ x: number; y: number }>,
) {
  return computed(() => {
    const c = ssCfg.value
    const L = layoutMetrics.value
    const vw = viewportW.value
    const vh = viewportH.value
    const vmin = Math.min(vw, vh)
    const canvasW = L.canvasW
    const canvasH = L.canvasH
    const userScale = Number(c.scale) || 1
    const brandTop = ((Number(c.brandTopVh) || 5) / 100) * canvasH
    const contentShift = ((Number(c.contentShiftVh) || 0) / 100) * canvasH
    return {
      '--ss-scale': userScale,
      '--ss-fit': String(L.fit ?? 1),
      '--ss-design-w': `${L.designW}px`,
      '--ss-design-h': `${L.designH}px`,
      '--ss-canvas-w': `${canvasW}px`,
      '--ss-canvas-h': `${canvasH}px`,
      '--ss-vw': `${vw}px`,
      '--ss-vh': `${vh}px`,
      '--ss-vmin': `${vmin}px`,
      '--ss-time-pct': Number(c.timeSizeVw) || 24,
      '--ss-sep-pct': Number(c.sepSizeVw) || 17,
      '--ss-sec-pct': Number(c.secSizeVw) || 7,
      '--ss-meta-pct': Number(c.metaSizeVw) || 3,
      '--ss-sub-meta-pct': Number(c.subMetaSizeVw) || 2,
      '--ss-brand-px': `${Number(c.brandSizePx) || 26}px`,
      '--ss-wx-temp-pct': Number(c.weatherTempSizeVw) || 22,
      '--ss-wx-icon-pct': Number(c.weatherIconSizeVw) || 10,
      '--ss-wx-stats-px': `${Number(c.weatherStatsSizePx) || 15}px`,
      '--ss-brand-top': `${brandTop}px`,
      '--ss-content-shift': `${contentShift}px`,
      '--ss-burnin-x': `${burnInOffset.value.x}px`,
      '--ss-burnin-y': `${burnInOffset.value.y}px`,
    }
  })
}
