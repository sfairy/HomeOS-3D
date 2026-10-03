/**
 * 文件：useRuntimeLogs.ts
 * 所属模块：frontend / src / views / settings / system / diagnostics
 * 职责：后端运行日志 composable。首拉 + SSE 实时推送；SSE 失败时降级为增量轮询。
 *       提供日志列表、级别过滤、容量与丢弃统计、清空与导出。
 * 关键依赖：
 *   - vue 的 computed / onUnmounted / ref / watch
 *   - fetchRuntimeLogs / openRuntimeLogsStream / clearRuntimeLogs：日志 API
 *   - extractErrorMessage：错误消息
 *   - useChromeStore：notify
 *   - schedulePoll：可见性调度轮询
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  clearRuntimeLogs,
  fetchRuntimeLogs,
  openRuntimeLogsStream,
  type RuntimeLogEntry,
  type RuntimeLogLevel,
  type RuntimeLogsResponse,
} from '@/services/api/system'
import { extractErrorMessage } from '@/utils/core/error-message'
import { useChromeStore } from '@/stores/chrome.store'
import { schedulePoll } from '@/utils/core/poll-scheduler'

const POLL_MS = 4000
const MAX_CLIENT_LINES = 1500

const LEVEL_OPTIONS: Array<{ id: string; label: string; levels?: RuntimeLogLevel[] }> = [
  { id: 'all', label: '全部' },
  { id: 'error', label: '错误', levels: ['error'] },
  { id: 'warn', label: '警告+', levels: ['error', 'warn'] },
  { id: 'log', label: '日志+', levels: ['error', 'warn', 'log'] },
]

type RuntimeLogLiveMode = 'sse' | 'poll' | 'off'

/** useRuntimeLogs：函数，按签名入参返回处理结果。 */
export function useRuntimeLogs(active: () => boolean) {
  const chrome = useChromeStore()
  const items = ref<RuntimeLogEntry[]>([])
  const loading = ref(false)
  const loadError = ref('')
  const live = ref(true)
  const liveMode = ref<RuntimeLogLiveMode>('off')
  const levelFilter = ref('all')
  const query = ref('')
  const capacity = ref(0)
  const buffered = ref(0)
  const dropped = ref(0)
  const newestId = ref(0)
  let pollCancel: (() => void) | null = null
  let stream: EventSource | null = null
  let inFlight = false
  let streamFailCount = 0

  const levelParam = computed(() => {
    const opt = LEVEL_OPTIONS.find((o) => o.id === levelFilter.value)
    return opt?.levels?.join(',')
  })

  function applyMeta(meta: Partial<RuntimeLogsResponse>) {
    if (typeof meta.capacity === 'number') capacity.value = meta.capacity
    if (typeof meta.buffered === 'number') buffered.value = meta.buffered
    if (typeof meta.dropped === 'number') dropped.value = meta.dropped
    if (typeof meta.newestId === 'number' && meta.newestId > newestId.value) {
      newestId.value = meta.newestId
    }
  }

  function mergeItems(incoming: RuntimeLogEntry[], mode: 'replace' | 'append') {
    if (mode === 'replace') {
      items.value = incoming
    } else if (incoming.length) {
      const seen = new Set(items.value.map((e) => e.id))
      const next = items.value.slice()
      for (const row of incoming) {
        if (!seen.has(row.id)) next.push(row)
      }
      items.value = next.length > MAX_CLIENT_LINES ? next.slice(-MAX_CLIENT_LINES) : next
    }
    const last = items.value[items.value.length - 1]
    if (last?.id) newestId.value = Math.max(newestId.value, last.id)
  }

  async function fetchLogs(opts?: { incremental?: boolean }) {
    if (inFlight) return
    inFlight = true
    const incremental = Boolean(opts?.incremental && newestId.value > 0)
    if (!incremental) loading.value = true
    try {
      const { data } = await fetchRuntimeLogs({
        limit: incremental ? 200 : 400,
        level: levelParam.value,
        q: query.value.trim() || undefined,
        afterId: incremental ? newestId.value : undefined,
      })
      applyMeta(data)
      mergeItems(data.items || [], incremental ? 'append' : 'replace')
      loadError.value = ''
    } catch (e) {
      loadError.value = extractErrorMessage(e)
      if (!incremental) items.value = []
    } finally {
      loading.value = false
      inFlight = false
    }
  }

  function stopPoll() {
    if (pollCancel) {
      pollCancel()
      pollCancel = null
    }
  }

  function stopStream() {
    if (stream) {
      stream.close()
      stream = null
    }
  }

  function stopLive() {
    stopPoll()
    stopStream()
    liveMode.value = 'off'
  }

  function startPoll() {
    stopPoll()
    if (!live.value || !active()) return
    liveMode.value = 'poll'
    // 经全局调度器轮询：页面隐藏时自动暂停，恢复可见时立即刷新
    pollCancel = schedulePoll(
      'runtime-logs:poll',
      () => {
        if (!live.value || !active()) return
        void fetchLogs({ incremental: true })
      },
      POLL_MS,
    )
  }

  function startStream() {
    stopStream()
    if (!live.value || !active()) return
    if (typeof EventSource === 'undefined') {
      startPoll()
      return
    }

    stream = openRuntimeLogsStream({
      level: levelParam.value,
      q: query.value.trim() || undefined,
      afterId: newestId.value > 0 ? newestId.value : undefined,
    })
    liveMode.value = 'sse'

    stream.addEventListener('log', (ev) => {
      try {
        const row = JSON.parse((ev as MessageEvent).data) as RuntimeLogEntry
        if (!row?.id) return
        mergeItems([row], 'append')
        streamFailCount = 0
      } catch {
        // 忽略格式异常的 SSE 日志行
      }
    })

    stream.addEventListener('meta', (ev) => {
      try {
        applyMeta(JSON.parse((ev as MessageEvent).data) as RuntimeLogsResponse)
      } catch {
        // 忽略 meta/ping 解析失败
      }
    })

    stream.addEventListener('ping', (ev) => {
      try {
        applyMeta(JSON.parse((ev as MessageEvent).data) as RuntimeLogsResponse)
        streamFailCount = 0
      } catch {
        // 忽略 meta/ping 解析失败
      }
    })

    stream.onerror = () => {
      streamFailCount += 1
      stopStream()
      // 连续失败时降级轮询，避免 EventSource 自动重连风暴
      if (live.value && active()) {
        if (streamFailCount >= 2) {
          startPoll()
        } else {
          // 短暂后重试 SSE
          setTimeout(() => {
            if (live.value && active() && !stream && liveMode.value !== 'poll') startStream()
          }, 1500)
        }
      }
    }
  }

  function startLive() {
    stopLive()
    if (!live.value || !active()) return
    streamFailCount = 0
    startStream()
  }

  async function refresh() {
    newestId.value = 0
    const wantLive = live.value && active()
    stopLive()
    await fetchLogs({ incremental: false })
    if (wantLive && live.value && active()) startLive()
  }

  async function clearLogs() {
    const ok = await chrome.confirm('确定清空当前进程内的运行日志缓冲？', '清空运行日志')
    if (!ok) return
    try {
      await clearRuntimeLogs()
      items.value = []
      newestId.value = 0
      buffered.value = 0
      chrome.notify('运行日志已清空', 'success')
    } catch (e) {
      chrome.notify(extractErrorMessage(e), 'error')
    }
  }

  watch(
    () => [active(), live.value] as const,
    ([isActive, isLive]) => {
      if (!isActive) {
        stopLive()
        return
      }
      void (async () => {
        newestId.value = 0
        stopLive()
        await fetchLogs({ incremental: false })
        if (isLive && live.value && active()) startLive()
      })()
    },
    { immediate: true },
  )

  let queryTimer: ReturnType<typeof setTimeout> | null = null

  watch(levelFilter, () => {
    if (!active()) return
    void refresh()
  })

  watch(query, () => {
    if (!active()) return
    if (queryTimer) clearTimeout(queryTimer)
    queryTimer = setTimeout(() => {
      void refresh()
    }, 320)
  })

  onUnmounted(() => {
    stopLive()
    if (queryTimer) clearTimeout(queryTimer)
  })

  return {
    items,
    loading,
    loadError,
    live,
    liveMode,
    levelFilter,
    query,
    capacity,
    buffered,
    dropped,
    levelOptions: LEVEL_OPTIONS,
    refresh,
    clearLogs,
  }
}
