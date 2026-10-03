/**
 * 平板首次启动默认性能档位（用户手动选择后不再覆盖）
 */
import { readLocalStorageFlag, writeLocalStorage } from '@/utils/core/local-storage.util'

/**
 * 平板首次启动默认性能档位（用户手动选择后不再覆盖）
 */
import { probeDeviceProfile } from '@/utils/perf/adaptive-perf.util'
import { getWorkerDerivedThreshold } from '@/utils/config/frontend-config'

const USER_SET_KEY = 'homeos:performanceMode:userSet'

/** isPerformanceModeUserSet：函数，按签名入参返回处理结果。 */
export function isPerformanceModeUserSet() {
  try {
    return readLocalStorageFlag(USER_SET_KEY)
  } catch {
    return false
  }
}

/** markPerformanceModeUserSet：函数，按签名入参返回处理结果。 */
export function markPerformanceModeUserSet() {
  try {
    writeLocalStorage(USER_SET_KEY, '1')
  } catch {
    /* 忽略 */
  }
}

/**
 * @param {{ performanceMode?: string }} layoutConfig
 * @param {number} [entityCount=0]
 * @returns {boolean} 是否应用了默认档位
 */
export function applyTabletDefaultPerformanceMode(
  layoutConfig: { performanceMode?: string } | null | undefined,
  entityCount = 0,
): boolean {
  if (!layoutConfig || isPerformanceModeUserSet()) return false

  const profile = probeDeviceProfile()
  if (entityCount >= getWorkerDerivedThreshold() && profile.tier !== 'high') {
    layoutConfig.performanceMode = 'medium'
    return true
  }
  if (profile.tier === 'high') return false

  layoutConfig.performanceMode = profile.tier
  return true
}
