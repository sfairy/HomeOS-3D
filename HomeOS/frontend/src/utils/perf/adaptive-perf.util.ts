/**
 * 按实体规模与设备能力自动调节前端性能参数
 */
import { ref, readonly } from 'vue'
import type { FrontendSection } from '@/types/frontend-config'
import {
  getFrontendConfig,
  getLargeEntityThreshold,
  getWorkerDerivedThreshold,
  onConfigChange,
} from '@/utils/config/frontend-config'
import { registerAdaptiveFpsTick, startFpsScheduler, bindFpsSchedulerVisibilityPause } from '@/utils/perf/fps-scheduler.util'

type AdaptiveConfigKey = 'rebuildDebounceMs' | 'rebuildChunkSize'
type AdaptiveConfigBaseline = Pick<FrontendSection, AdaptiveConfigKey>
type SmartPerfTickHandler = (payload: { lowStreak: number; highStreak: number }) => void

let lastAppliedCount = 0
let adaptiveConfigBaseline: AdaptiveConfigBaseline | null = null

const ADAPTIVE_KEYS: readonly AdaptiveConfigKey[] = ['rebuildDebounceMs', 'rebuildChunkSize']

const adaptiveTier = ref('high')
const adaptiveReason = ref<string>('')

let fpsMonitorStarted = false
let slowFrameStreak = 0
let fastFrameStreak = 0
let smartLowStreak = 0
let smartHighStreak = 0
let smartPerfTickHandler: SmartPerfTickHandler | null = null

/** registerSmartPerfTick：函数，按签名入参返回处理结果。 */
export function registerSmartPerfTick(handler: SmartPerfTickHandler): void {
  smartPerfTickHandler = handler
}

/**
 * @returns {{ tier: 'high'|'medium'|'low', reason: string, deviceMemory: number|null, cores: number }}
 */
export function probeDeviceProfile() {
  const cores = navigator.hardwareConcurrency || 4
  const mem = typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null
  let tier = 'high'
  const reasons: string[] = []

  if (mem != null && mem <= 4) {
    tier = 'medium'
    reasons.push(`deviceMemory=${mem}GB`)
  }
  if (cores <= 4) {
    tier = tier === 'high' ? 'medium' : 'low'
    reasons.push(`cores=${cores}`)
  }
  if (/Mobi|Android/i.test(navigator.userAgent) && cores <= 6) {
    tier = tier === 'high' ? 'medium' : tier
    reasons.push('mobile-tablet')
  }

  return { tier, reason: reasons.join(', ') || 'capable', deviceMemory: mem, cores }
}

function updateAdaptiveTier(tier: string, reason: string): void {
  adaptiveTier.value = tier
  adaptiveReason.value = reason
}

/**
 * @returns {{ applied: boolean, suggestions: string[] }}
 */
export function applyAdaptiveFrontendPerf(entityCount: number) {
  if (!entityCount || entityCount === lastAppliedCount) {
    return { applied: false, suggestions: buildPerfSuggestions(entityCount) }
  }

  const cfg = getFrontendConfig()
  const largeEntityThreshold = getLargeEntityThreshold()
  const xlargeEntityThreshold = getWorkerDerivedThreshold()

  if (entityCount < largeEntityThreshold) {
    if (lastAppliedCount >= largeEntityThreshold && adaptiveConfigBaseline) {
      for (const key of ADAPTIVE_KEYS) {
        const baseline = adaptiveConfigBaseline[key]
        if (baseline != null) {
          cfg[key] = baseline
        }
      }
      adaptiveConfigBaseline = null
    }
    lastAppliedCount = entityCount
    return { applied: true, suggestions: buildPerfSuggestions(entityCount) }
  }

  lastAppliedCount = entityCount

  if (!adaptiveConfigBaseline) {
    adaptiveConfigBaseline = {} as AdaptiveConfigBaseline
    for (const key of ADAPTIVE_KEYS) {
      adaptiveConfigBaseline[key] = cfg[key]
    }
  }

  // 分级降级策略：按实体规模收紧派生索引重建的防抖与分块参数
  // - large 级（超过大实体阈值）：防抖 80ms 合并相邻变更，分块 600 条避免单任务阻塞主线程
  // - xlarge 级（超过 Worker 阈值）：进一步放大到防抖 180ms / 分块 1000 条，以实时性换流畅度
  const tier = entityCount >= xlargeEntityThreshold ? 'xlarge' : 'large'
  const targets: AdaptiveConfigBaseline =
    tier === 'xlarge'
      ? { rebuildDebounceMs: 180, rebuildChunkSize: 1000 } // 毫秒/条：超大实体规模目标
      : { rebuildDebounceMs: 80, rebuildChunkSize: 600 } // 毫秒/条：大实体规模目标

  let applied = false
  for (const key of ADAPTIVE_KEYS) {
    const value = targets[key]
    if ((cfg[key] ?? 0) < value) {
      cfg[key] = value
      applied = true
    }
  }

  if (entityCount >= xlargeEntityThreshold) {
    const profile = probeDeviceProfile()
    if (profile.tier !== 'high') {
      updateAdaptiveTier(profile.tier, profile.reason)
    }
  }

  return { applied, suggestions: buildPerfSuggestions(entityCount) }
}

function buildPerfSuggestions(entityCount: number): string[] {
  if (!entityCount) return []
  const largeEntityThreshold = getLargeEntityThreshold()
  const xlargeEntityThreshold = getWorkerDerivedThreshold()
  const tips: string[] = []
  if (entityCount >= largeEntityThreshold) {
    tips.push('实体数较多：已自动抬高 rebuildDebounceMs（可在专家配置覆盖）')
    tips.push('墙面板硬件受限时，建议在「基础设置」将性能模式设为 medium 或 low')
    tips.push(
      '实体数≥2000：确认「冷实体按需 WS」(wsPush.coldEntityOnDemand) 已开启，非可见实体不推、列表页 REST 按需补全',
    )
  }
  if (entityCount >= xlargeEntityThreshold) {
    tips.push('超大规模安装：建议确认 Redis maxmemory ≥ 512MB')
    tips.push('超大规模：保持 wsPush.coldEntityOnDemand，并将 latencyProfile 设为 realtime 以压低关键域延迟')
  }
  if (entityCount >= largeEntityThreshold) {
    tips.push('可在「系统诊断」启动基线采样，对比 derivedRebuilds / wsBatchCount / listenerCount')
  }
  return tips
}

/** resolvePerfShellClass：函数，按签名入参返回处理结果。 */
export function resolvePerfShellClass(userMode: string | undefined): string {
  const mode = userMode || 'high'
  if (mode === 'low' || mode === 'medium') return `perf-${mode}`
  if (adaptiveTier.value === 'medium' || adaptiveTier.value === 'low') {
    return `perf-adaptive perf-${adaptiveTier.value}`
  }
  return 'perf-high'
}

/** startFpsAdaptiveMonitor：函数，按签名入参返回处理结果。 */
export function startFpsAdaptiveMonitor() {
  if (fpsMonitorStarted || typeof requestAnimationFrame !== 'function') return
  fpsMonitorStarted = true

  registerAdaptiveFpsTick((delta) => {
    if (delta > 22.2) {
      smartLowStreak++
      smartHighStreak = 0
    } else if (delta < 18.2) {
      smartHighStreak++
      smartLowStreak = 0
    } else {
      smartLowStreak = Math.max(0, smartLowStreak - 1)
      smartHighStreak = Math.max(0, smartHighStreak - 1)
    }
    smartPerfTickHandler?.({ lowStreak: smartLowStreak, highStreak: smartHighStreak })

    if (delta > 20) {
      slowFrameStreak++
      fastFrameStreak = 0
    } else if (delta < 18) {
      fastFrameStreak++
      slowFrameStreak = 0
    }
    if (slowFrameStreak >= 90 && adaptiveTier.value === 'high') {
      updateAdaptiveTier('medium', 'FPS<50 持续约 5s')
    }
    if (fastFrameStreak >= 180 && adaptiveTier.value !== 'high') {
      updateAdaptiveTier('high', '')
    }
  })
  // 页面隐藏时暂停 rAF 调度，避免后台空转
  bindFpsSchedulerVisibilityPause()
  startFpsScheduler()
}

/** useAdaptivePerfState：函数，按签名入参返回处理结果。 */
export function useAdaptivePerfState() {
  return {
    adaptiveTier: readonly(adaptiveTier),
    adaptiveReason: readonly(adaptiveReason),
  }
}

export { adaptiveTier }

onConfigChange(() => {
  lastAppliedCount = 0
  adaptiveConfigBaseline = null
})
