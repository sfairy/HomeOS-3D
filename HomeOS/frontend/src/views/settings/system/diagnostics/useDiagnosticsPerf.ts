/**
 * 文件：useDiagnosticsPerf.ts
 * 所属模块：frontend / src / views / settings / system / diagnostics
 * 职责：诊断性能 composable。采集前端 FPS/内存、自适应性能档位、WS 订阅域与最大监听数，
 *       提供性能基线采样启停与指标复制。
 * 关键依赖：
 *   - vue 的 ref / computed / watch / onUnmounted
 *   - useEntitiesStore / useLayoutStore：实体与布局状态
 *   - startFrontendPerfMonitor / stopFrontendPerfMonitor：前端性能监控
 *   - adaptiveTier：自适应性能档位
 *   - fps-scheduler.util：FPS 调度器
 *   - startPerfBaselineSampling：性能基线采样
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useLayoutStore } from '@/stores/layout.store'
import {
  fps,
  memoryMb,
  startFrontendPerfMonitor,
  stopFrontendPerfMonitor,
} from '@/utils/perf/frontend-perf-monitor.util'
import { adaptiveTier } from '@/utils/perf/adaptive-perf.util'
import {
  isFpsSchedulerRunning,
  isDiagnosticsFpsSamplingActive,
} from '@/utils/perf/fps-scheduler.util'
import { getActiveSubscribeDomains } from '@/utils/entity/ws-subscription'
import { getMaxStateListeners } from '@/utils/config/frontend-config'
import { copyTextWithNotify } from '@/services/notify'
import {
  startPerfBaselineSampling,
  stopPerfBaselineSampling,
  isPerfBaselineSampling,
  getPerfBaselineSnapshot,
  exportPerfBaselineJson,
  tickPerfBaselineCounters,
  recordFpsSample,
} from '@/utils/perf/baseline.util'

const PERF_MODE_LABELS: Record<string, string> = {
  high: '华丽',
  medium: '均衡',
  low: '省电',
  auto: '自适应',
}

function perfModeLabel(mode: string): string {
  return PERF_MODE_LABELS[mode] || mode
}

/** useDiagnosticsPerf：函数，按签名入参返回处理结果。 */
export function useDiagnosticsPerf() {
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const entitiesStore = useEntitiesStore()

  const frontendFps = computed(() => fps.value || '—')
  const baselineSampling = ref(isPerfBaselineSampling())
  const baselineSnapshot = ref(isPerfBaselineSampling() ? getPerfBaselineSnapshot() : null)
  /** 采样中定时刷新，驱动预览响应式更新 */
  const baselineTick = ref(0)
  let baselinePreviewTimer: ReturnType<typeof setInterval> | null = null

  const canCopyBaseline = computed(
    () => baselineSampling.value || Boolean(baselineSnapshot.value?.recordedAt),
  )

  const baselinePreview = computed(() => {
    void baselineTick.value
    return baselineSampling.value ? getPerfBaselineSnapshot() : baselineSnapshot.value
  })

  function stopBaselinePreviewTimer() {
    if (baselinePreviewTimer) {
      clearInterval(baselinePreviewTimer)
      baselinePreviewTimer = null
    }
  }

  function startBaselinePreviewTimer() {
    stopBaselinePreviewTimer()
    baselinePreviewTimer = setInterval(() => {
      baselineTick.value += 1
    }, 500)
  }

  function toggleBaselineSampling() {
    if (baselineSampling.value) {
      stopBaselinePreviewTimer()
      baselineSnapshot.value = stopPerfBaselineSampling()
      baselineSampling.value = false
      chrome.notify('基线采样已停止，可复制 JSON 保存结果', 'success')
    } else {
      baselineSnapshot.value = startPerfBaselineSampling()
      baselineSampling.value = true
      startBaselinePreviewTimer()
      chrome.notify('基线采样已开始，请保持页面运行约 30 秒', 'info')
    }
  }

  async function copyBaselineJson() {
    if (!canCopyBaseline.value) {
      chrome.notify('请先开始基线采样', 'warning')
      return
    }
    if (baselineSampling.value) {
      baselineSnapshot.value = getPerfBaselineSnapshot()
    }
    await copyTextWithNotify(exportPerfBaselineJson(), {
      successMessage: '基线 JSON 已成功复制',
      errorMessage: '复制失败，请检查浏览器剪贴板权限',
    })
  }

  const frontendMemoryLabel = computed(() =>
    memoryMb.value != null ? `${memoryMb.value} MB` : '不可用',
  )

  /** 依赖 perfStats / fps，避免静态快照不刷新 */
  const listenerStatsLabel = computed(() => {
    void entitiesStore.perfStats
    void fps.value
    const s = entitiesStore.getStateListenerStats()
    const limit = getMaxStateListeners()
    return `${s.total}/${limit}（全局 ${s.global} · 索引 ${s.indexed} · 桶 ${s.indexBuckets}）`
  })

  const subscribeDomainsLabel = computed(() => {
    void entitiesStore.perfStats
    const domains = getActiveSubscribeDomains()
    if (!domains?.length) return '全部 domain'
    return domains.length > 8
      ? `${domains.slice(0, 8).join(', ')}…+${domains.length - 8}`
      : domains.join(', ')
  })

  const fpsSchedulerLabel = computed(() => {
    void fps.value
    void baselineTick.value
    const parts = []
    if (isFpsSchedulerRunning()) parts.push('rAF 运行')
    if (isDiagnosticsFpsSamplingActive()) parts.push('诊断采样')
    return parts.length ? parts.join(' · ') : '未启动'
  })

  const perfHeroMetrics = computed(() => {
    const fpsNum = Number(fps.value)
    let fpsAccent = 'var(--module-accent-template)'
    if (Number.isFinite(fpsNum)) {
      if (fpsNum >= 55) fpsAccent = 'var(--module-accent-admin-sub)'
      else if (fpsNum >= 45) fpsAccent = 'var(--set-warn, #fbbf24)'
      else fpsAccent = 'var(--set-danger, #f87171)'
    }
    const userMode = layoutStore.layoutConfig.performanceMode || 'high'
    const adaptive =
      adaptiveTier.value !== 'high'
        ? `自适应 ${perfModeLabel(adaptiveTier.value)}`
        : null
    return [
      { label: 'FPS', value: frontendFps.value, accent: fpsAccent },
      { label: 'JS 堆内存', value: frontendMemoryLabel.value, accent: 'var(--module-accent-events)' },
      {
        label: '性能档位',
        value: perfModeLabel(userMode),
        sub: adaptive,
        accent: 'var(--module-accent-devices)',
      },
    ]
  })

  let stopFpsWatch: (() => void) | null = null
  let stopPerfStatsWatch: (() => void) | null = null

  function startPerfMonitoring() {
    startFrontendPerfMonitor()
    stopFpsWatch = watch(fps, (v) => {
      if (v) recordFpsSample(v)
    })
    stopPerfStatsWatch = watch(
      () => entitiesStore.perfStats,
      (s) => tickPerfBaselineCounters(s),
      { deep: true },
    )
    if (baselineSampling.value) startBaselinePreviewTimer()
  }

  function stopPerfMonitoring() {
    stopFrontendPerfMonitor()
    stopFpsWatch?.()
    stopPerfStatsWatch?.()
    stopFpsWatch = null
    stopPerfStatsWatch = null
    stopBaselinePreviewTimer()
    if (baselineSampling.value) {
      stopPerfBaselineSampling()
      baselineSampling.value = false
    }
  }

  onUnmounted(() => {
    stopBaselinePreviewTimer()
  })

  return {
    frontendFps,
    baselineSampling,
    baselineSnapshot,
    canCopyBaseline,
    baselinePreview,
    toggleBaselineSampling,
    copyBaselineJson,
    frontendMemoryLabel,
    listenerStatsLabel,
    subscribeDomainsLabel,
    fpsSchedulerLabel,
    perfHeroMetrics,
    startPerfMonitoring,
    stopPerfMonitoring,
  }
}
