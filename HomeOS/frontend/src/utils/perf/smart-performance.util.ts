/**
 * FPS 智能档位：连续低于 45fps 自动 medium，高于 55fps 持续 30s 恢复 high
 */
import { registerSmartPerfTick } from '@/utils/perf/adaptive-perf.util'
import { isPerformanceModeUserSet } from '@/utils/perf/tablet-default-perf.util'
import { applyGlassEffectDocument } from '@/utils/ui/glass-effect.util'

let teardown: (() => void) | null = null
let autoDowngraded = false
let savedMode: string | null = null

type LayoutConfigForSmartPerf = {
  smartPerformanceMode?: boolean
  performanceMode?: string
  glassEffect?: string
}

let getLayoutConfig: (() => LayoutConfigForSmartPerf | null) | null = null

function onSmartPerfTick({ lowStreak, highStreak }: { lowStreak: number; highStreak: number }) {
  const layout = getLayoutConfig?.()
  if (!layout?.smartPerformanceMode || isPerformanceModeUserSet()) return

  if (lowStreak >= 135 && layout.performanceMode === 'high') {
    savedMode = 'high'
    layout.performanceMode = 'medium'
    autoDowngraded = true
    applyGlassEffectDocument(layout.glassEffect, layout.performanceMode)
    return
  }

  if (autoDowngraded && highStreak >= 1800 && layout.performanceMode === 'medium') {
    layout.performanceMode = savedMode || 'high'
    autoDowngraded = false
    applyGlassEffectDocument(layout.glassEffect, layout.performanceMode)
  }
}

/**
 * @param {() => object} layoutConfigGetter
 * @returns {() => void}
 */
export function setupSmartPerformanceMode(
  layoutConfigGetter: () => LayoutConfigForSmartPerf | null,
) {
  teardown?.()
  getLayoutConfig = layoutConfigGetter
  registerSmartPerfTick(onSmartPerfTick)
  teardown = () => {
    registerSmartPerfTick(null as unknown as Parameters<typeof registerSmartPerfTick>[0])
    getLayoutConfig = null
    autoDowngraded = false
    savedMode = null
    teardown = null
  }
  return teardown
}
