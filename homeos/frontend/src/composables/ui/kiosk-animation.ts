/** 独立于 echarts 的轻量模块：仅依据 layout.store 的性能模式返回动画开关。 */
import { useLayoutStore } from '@/stores/layout.store'

/**
 * 判断当前是否为墙屏 / 平板看板性能模式（high / medium）。
 * 在该模式下关闭图表动画以降低 CPU 占用；store 不可用时默认返回 true（保守策略）。
 *
 * @returns true 表示应关闭动画
 */
function isKioskChartProfile(): boolean {
  try {
    const layout = useLayoutStore()
    const mode = layout.layoutConfig?.performanceMode
    return mode === 'high' || mode === 'medium'
  } catch {
    return true
  }
}

/**
 * 根据性能模式返回动画选项。
 *
 * @returns 墙屏模式返回 { animation: false, animationDuration: 0 }；
 *   非墙屏模式返回 { animation: true, animationDuration: 600, animationEasing: 'cubicOut' }
 */
export function getKioskAnimationOptions() {
  if (!isKioskChartProfile()) {
    return { animation: true, animationDuration: 600, animationEasing: 'cubicOut' as const }
  }
  return { animation: false, animationDuration: 0 }
}
