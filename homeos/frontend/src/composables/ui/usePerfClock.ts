/**
 * @file usePerfClock.ts
 * @module composables/ui
 * @description 按性能模式分档、并对齐墙钟整点间隔刷新的时钟 composable。
 *
 * 依赖：
 * - vue（ref/computed/watch/onMounted/onUnmounted）
 * - layout.store（读取 performanceMode 性能档位）
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useLayoutStore } from '@/stores/layout.store'

/**
 * 距下一档墙钟边界的延迟（毫秒）。
 * 例如 interval=1000 时对齐整秒，避免 1.3s 一跳导致秒数跳秒。
 */
function delayUntilAligned(intervalMs: number): number {
  const span = Math.max(1, intervalMs)
  const rem = Date.now() % span
  return rem === 0 ? span : span - rem
}

/**
 * 按性能模式分档刷新的时钟。
 *
 * - high:   1s（显示秒）
 * - medium: 5s
 * - low:    60s（仅时分）
 *
 * 刷新对齐墙钟边界（整秒/整 5 秒/整分），页面隐藏时暂停。
 *
 * @param options autoStart=false 时由调用方手动 start/stop
 *   （如屏保仅在可见时计时）。无论是否 autoStart，卸载时都会自动清理。
 * @param options.forceIntervalMs 覆盖性能档位间隔（屏保显示秒时强制 1s）
 * @returns now 当前时间 ref；perfMode/refreshInterval/showSeconds 计算属性；start/stop 控制
 */
export function usePerfClock({
  autoStart = true,
  forceIntervalMs,
}: {
  autoStart?: boolean
  forceIntervalMs?: number
} = {}) {
  const layoutStore = useLayoutStore()
  const now = ref(new Date())
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let visHandler: (() => void) | null = null

  const perfMode = computed(() => layoutStore.layoutConfig.performanceMode || 'high')
  const refreshInterval = computed(() => {
    if (typeof forceIntervalMs === 'number' && forceIntervalMs > 0) return forceIntervalMs
    if (perfMode.value === 'low') return 60000
    if (perfMode.value === 'medium') return 5000
    return 1000
  })
  const showSeconds = computed(
    () =>
      (typeof forceIntervalMs === 'number' && forceIntervalMs <= 1000) || perfMode.value === 'high',
  )

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function pageHidden() {
    return typeof document !== 'undefined' && document.hidden
  }

  function arm() {
    clearTimer()
    if (!running) return
    const interval = refreshInterval.value
    timer = setTimeout(() => {
      timer = null
      if (!running) return
      if (pageHidden()) return
      now.value = new Date()
      arm()
    }, delayUntilAligned(interval))
  }

  function onVisibility() {
    if (!running) return
    if (pageHidden()) {
      clearTimer()
      return
    }
    now.value = new Date()
    arm()
  }

  function start() {
    running = true
    now.value = new Date()
    arm()
    if (typeof document !== 'undefined' && !visHandler) {
      visHandler = onVisibility
      document.addEventListener('visibilitychange', visHandler)
    }
  }

  function stop() {
    running = false
    clearTimer()
    if (visHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visHandler)
      visHandler = null
    }
  }

  watch(refreshInterval, () => {
    if (running) {
      now.value = new Date()
      arm()
    }
  })

  if (autoStart) onMounted(start)
  onUnmounted(stop)

  return { now, perfMode, refreshInterval, showSeconds, start, stop }
}
