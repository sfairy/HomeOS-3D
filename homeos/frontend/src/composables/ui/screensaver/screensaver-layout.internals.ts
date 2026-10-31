/**
 * @file screensaver-layout.internals.ts
 * @module frontend/src/composables/ui
 */
import { ref, computed, type Ref } from 'vue'
import { getConfigSection } from '@/shared/utils/config/frontend-config'
import {
  activeDesignWidth,
  activeDesignHeight,
  computeScreensaverLayout,
} from '@/composables/ui/useScaling'
import { screensaverBackgroundIdle } from '@/shared/utils/ui/screensaver-background-idle.util'
import { SS_DEFAULTS } from './screensaver.defaults'
import type { useLayoutStore } from '@/stores/layout.store'

type LayoutStore = ReturnType<typeof useLayoutStore>

/** 屏保视口 / 配置 tick 与 CSS 布局样式 */
export function createScreensaverLayoutState(layoutStore: LayoutStore) {
  const cfgTick = ref(0)
  const scalingTick = ref(0)
  const viewportW = ref(typeof window !== 'undefined' ? window.innerWidth : 1366)
  const viewportH = ref(typeof window !== 'undefined' ? window.innerHeight : 1024)
  const burnInOffset = ref({ x: 0, y: 0 })

  const ssCfg = computed(() => {
    cfgTick.value
    scalingTick.value
    return { ...SS_DEFAULTS, ...getConfigSection('screensaver') }
  })

  const layoutMetrics = computed(() => {
    scalingTick.value
    const ui = getConfigSection('ui')
    const designW =
      activeDesignWidth.value || layoutStore.layoutConfig.pageMaxWidth || ui.scaleBaseWidth || 1366
    const designH = activeDesignHeight.value || ui.scaleBaseHeight || 1024
    return computeScreensaverLayout(viewportW.value, viewportH.value, designW, designH)
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
      viewportW.value = window.innerWidth
      viewportH.value = window.innerHeight
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

function createOverlayShellStyles(ssCfg: Ref<Record<string, unknown>>, layoutMetrics: Ref<{
  layoutMode?: string
  shellW?: number
  shellH?: number
  shellScale?: number
  canvasW: number
  canvasH: number
  designW: number
  designH: number
}>) {
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
      return {
        width: `${L.designW}px`,
        height: `${L.designH}px`,
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
