/**
 * 设备侧 ECharts 容器就绪检测与懒加载初始化（与 DeviceAnalyticsPanel 等手写逻辑对齐）。
 */
import type { ECharts } from 'echarts/core'

export function chartDomReady(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false
  const { clientWidth, clientHeight } = el
  return clientWidth > 0 && clientHeight > 0
}

/**
 * 容器就绪时在动态 import 后幂等 getOrInitChart；await 期间可通过 isActive 放弃初始化。
 */
export async function ensureDeviceChartOnElement(
  el: HTMLElement | null,
  instance: ECharts | null,
  isActive?: () => boolean,
): Promise<ECharts | null> {
  if (!chartDomReady(el)) return instance
  if (instance) return instance
  const mod = await import('@/utils/chart/echarts')
  if (isActive && !isActive()) return null
  if (!chartDomReady(el)) return null
  return mod.getOrInitChart(el)
}
