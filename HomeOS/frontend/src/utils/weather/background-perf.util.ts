/**
 * 天气背景性能模式解析：根据质量档位、布局配置与硬件能力选择 Canvas 渲染级别。
 */
import { resolveWeatherQuality } from '@/utils/weather/quality.util'

let _autoPerfMode: string | null = null

/** resolveWeatherBackgroundPerformanceMode：函数，按签名入参返回处理结果。 */
export function resolveWeatherBackgroundPerformanceMode(
  props: { quality?: string },
  uiStore: { layoutConfig: { performanceMode?: string } },
  entitiesStore: { totalCount: number },
  adaptiveTier: { value: string },
) {
  const q =
    props.quality ||
    resolveWeatherQuality({
      performanceMode: uiStore.layoutConfig.performanceMode,
      entityCount: entitiesStore.totalCount,
      fpsTier: adaptiveTier.value,
    })
  if (q === 'off') return 'low'
  if (q === 'static') return 'medium'
  if (q === 'lite') return 'medium'
  if (q === 'full') return 'high'
  const userMode = uiStore.layoutConfig.performanceMode
  if (userMode === 'low') return 'low'
  if (userMode === 'medium') return 'medium'
  if (userMode === 'high') return 'high'
  if (!_autoPerfMode) {
    const cores = navigator.hardwareConcurrency || 4
    const isMobile = /Mobi|Android/i.test(navigator.userAgent)
    if (cores <= 2 || isMobile) _autoPerfMode = 'low'
    else if (cores <= 4) _autoPerfMode = 'medium'
    else _autoPerfMode = 'high'
  }
  return _autoPerfMode
}
