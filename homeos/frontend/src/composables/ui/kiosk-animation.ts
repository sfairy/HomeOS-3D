/** 独立于 echarts 的轻量模块：仅依据「生效性能档位」返回动画开关。 */
import { useLayoutStore } from '@/stores/layout.store'
import { resolveEffectivePerformanceMode } from '@/shared/utils/perf/runtime-perf-mode.util'

/**
 * 图表动画只在「华丽模式」开启。
 *
 * 原先这里按「是否墙屏」判断，把 high / medium 都算作看板模式关掉动画，却漏了 low，
 * 结果低功耗档反而开动画 —— 档位越高越省，语义正好反了。现在按档位单调收口：
 * high 完整动效，medium / low 都关闭。store 不可用时按关闭处理（保守策略）。
 * 自动降档同样算数：本机被降到 medium/low 时不再跑图表动画。
 *
 * @returns true 表示开启图表动画
 */
function isChartAnimationEnabled(): boolean {
  try {
    return (
      resolveEffectivePerformanceMode(useLayoutStore().layoutConfig?.performanceMode) === 'high'
    )
  } catch {
    return false
  }
}

/**
 * 根据性能模式返回图表动画选项。
 *
 * @returns 华丽模式（high）返回带动画；均衡 / 低功耗返回关闭动画。
 */
export function getKioskAnimationOptions() {
  if (isChartAnimationEnabled()) {
    return { animation: true, animationDuration: 600, animationEasing: 'cubicOut' as const }
  }
  return { animation: false, animationDuration: 0 }
}
