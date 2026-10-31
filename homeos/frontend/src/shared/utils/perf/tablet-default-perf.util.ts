/**
 * 平板 / 低端设备默认性能档位（用户手动选择后不再覆盖）
 *
 * 注意：这里只调整**当前终端**的自动降档，不写入布局配置。
 * 布局是多终端共享的，把设备档位写进去会同步给其它设备，还会被当成未保存的更改
 * 弹「全局布局有 1 项未保存的更改」。渲染侧统一读 `resolveEffectivePerformanceMode`。
 */
import { readLocalStorageFlag, writeLocalStorage } from '@/shared/utils/core/local-storage.util'

/**
 * 平板首次启动默认性能档位（用户手动选择后不再覆盖）
 */
import { probeDeviceProfile } from '@/shared/utils/perf/adaptive-perf.util'
import {
  clearAutoPerformanceMode,
  setAutoPerformanceMode,
} from '@/shared/utils/perf/runtime-perf-mode.util'
import { getWorkerDerivedThreshold } from '@/shared/utils/config/frontend-config'

const USER_SET_KEY = 'homeos:performanceMode:userSet'

export function isPerformanceModeUserSet() {
  try {
    return readLocalStorageFlag(USER_SET_KEY)
  } catch {
    return false
  }
}

export function markPerformanceModeUserSet() {
  try {
    writeLocalStorage(USER_SET_KEY, '1')
  } catch {
    /* 忽略 */
  }
}

/**
 * 按设备能力 / 实体规模应用默认档位（只影响运行时，不写布局）。
 *
 * @param _layoutConfig 保留入参以兼容既有调用点（不再就地修改）
 * @param entityCount 实体总数：达到 worker 派生阈值且设备非 high 时再降一档
 * @returns 是否应用了自动降档
 */
export function applyTabletDefaultPerformanceMode(
  _layoutConfig: { performanceMode?: string } | null | undefined,
  entityCount = 0,
): boolean {
  // 用户已在设置页显式选过档位：清掉自动降档，避免把用户选择压回去
  if (isPerformanceModeUserSet()) {
    clearAutoPerformanceMode()
    return false
  }

  const profile = probeDeviceProfile()
  if (entityCount >= getWorkerDerivedThreshold() && profile.tier !== 'high') {
    setAutoPerformanceMode('medium')
    return true
  }
  if (profile.tier === 'high') {
    clearAutoPerformanceMode()
    return false
  }

  setAutoPerformanceMode(profile.tier)
  return true
}
