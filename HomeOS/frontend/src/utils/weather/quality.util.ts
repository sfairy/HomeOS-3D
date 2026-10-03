/**
 * 天气背景渲染质量档位
 */
import { probeDeviceProfile } from '@/utils/perf/adaptive-perf.util'
import { getWorkerDerivedThreshold } from '@/utils/config/frontend-config'

/** @typedef {'full' | 'lite' | 'static' | 'off'} WeatherQuality */

/**
 * @param opts.performanceMode 布局性能档位
 * @param opts.entityCount 实体数量（auto 档位用）
 * @param opts.fpsTier 自适应 FPS 档位
 * @param opts.forceAnimated 开发调试预览：绕过 medium→static / low→off
 * @returns WeatherQuality
 */
export function resolveWeatherQuality(
  opts: {
    performanceMode?: string
    entityCount?: number
    fpsTier?: string
    forceAnimated?: boolean
  } = {},
) {
  const mode = opts.performanceMode || 'high'
  if (opts.forceAnimated) {
    if (mode === 'low') return 'lite'
    if (mode === 'medium') return 'lite'
    if (opts.fpsTier === 'low') return 'lite'
    return 'full'
  }
  if (mode === 'low') return 'off'
  if (mode === 'medium') return 'static'

  // 高性能档也先探设备档：RK3588（8 核）会被误判为高性能而默认跑满全屏特效，
  // 弱设备直接关动画；持续低帧时降为静态（而非仍保留动画的 lite），保住墙屏帧预算
  if (mode === 'high') {
    const profile = probeDeviceProfile()
    if (profile.tier === 'low') return 'off'
    if (opts.fpsTier === 'low') return 'static'
    return 'full'
  }

  const entityCount = opts.entityCount ?? 0
  const fpsTier = opts.fpsTier || 'high'
  const profile = probeDeviceProfile()

  if (entityCount >= getWorkerDerivedThreshold() && fpsTier === 'low') return 'lite'
  if (fpsTier === 'low') return 'lite'
  if (profile.tier === 'low') return 'lite'

  return 'full'
}
