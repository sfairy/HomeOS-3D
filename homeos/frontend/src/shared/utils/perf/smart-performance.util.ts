/**
 * FPS 智能档位：连续低于 45fps 自动 medium，高于 55fps 持续 30s 恢复
 *
 * 只写运行时自动档位，不写 `layoutConfig.performanceMode`：
 * 布局是多终端共享的，把本机帧率逼出来的档位存进去会同步给其它设备，
 * 并让「未保存的更改」检测把自动降档当成用户编辑。
 */
import { registerSmartPerfTick } from '@/shared/utils/perf/adaptive-perf.util'
import { isPerformanceModeUserSet } from '@/shared/utils/perf/tablet-default-perf.util'
import {
  clearAutoPerformanceMode,
  getAutoPerformanceMode,
  setAutoPerformanceMode,
} from '@/shared/utils/perf/runtime-perf-mode.util'

let teardown: (() => void) | null = null
let autoDowngraded = false

type LayoutConfigForSmartPerf = {
  smartPerformanceMode?: boolean
  performanceMode?: string
  glassEffect?: string
}

let getLayoutConfig: (() => LayoutConfigForSmartPerf | null) | null = null

function onSmartPerfTick({ lowStreak, highStreak }: { lowStreak: number; highStreak: number }) {
  const layout = getLayoutConfig?.()
  if (!layout?.smartPerformanceMode || isPerformanceModeUserSet()) return

  if (lowStreak >= 135 && (layout.performanceMode || 'high') === 'high') {
    setAutoPerformanceMode('medium')
    autoDowngraded = true
    return
  }

  if (autoDowngraded && highStreak >= 1800 && getAutoPerformanceMode() === 'medium') {
    clearAutoPerformanceMode()
    autoDowngraded = false
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
    teardown = null
  }
  return teardown
}
