/**
 * 轻量前端 RUM 采集。
 *
 * 后端契约：`POST /api/v1/logs/public-metrics`，body 是**单条**样本
 * `{ page, name, value }`。优先 `navigator.sendBeacon`（Blob application/json），
 * 回退 `fetch(..., { keepalive: true })`；同源校验 / 限流由后端处理，前端失败静默。
 *
 * 指标白名单（与后端严格对齐）：lcp / cls / inp / fcp / ttfb / longtask / error / ws_reconnect。
 * 隐私：`page` 只取 pathname（去掉 query/hash）并归一化动态 id 段；不上报 UA、Cookie 或用户数据。
 *
 * 开关：`?client-metrics=0|1` 显式覆盖；默认生产开启、开发关闭（避免本地噪声）。
 * 采样：`?client-metrics-rate=0.2` > `VITE_CLIENT_METRICS_SAMPLE_RATE` > 默认 1；
 * 低端设备未显式配置时降到 0.5（契约允许）。
 */

const METRICS_ENDPOINT = '/api/v1/logs/public-metrics'
const FLUSH_INTERVAL_MS = 10_000
const SETTLE_METRICS_DELAY_MS = 12_000
const MAX_QUEUE_LENGTH = 96

type ClientMetricName = 'lcp' | 'cls' | 'inp' | 'fcp' | 'ttfb' | 'longtask' | 'error' | 'ws_reconnect'

type ClientMetricSample = { name: ClientMetricName; value: number }

let metricsStarted = false
let metricsEnabled = false
let metricsQueue: ClientMetricSample[] = []
const activeObservers: PerformanceObserver[] = []
const finalMetricValues = new Map<ClientMetricName, number>()
let finalMetricsSettled = false
let cumulativeLayoutShift = 0
let interactionMaxDurationMs = 0

function readUrlParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name)
  } catch {
    return null
  }
}

function isLowEndDevice(): boolean {
  try {
    const memoryGb = Number(navigator.deviceMemory)
    const logicalCores = Number(navigator.hardwareConcurrency)
    if (Number.isFinite(memoryGb) && memoryGb > 0 && memoryGb <= 4) return true
    if (Number.isFinite(logicalCores) && logicalCores > 0 && logicalCores <= 4) return true
    return false
  } catch {
    return false
  }
}

function resolveMetricsEnabled(): boolean {
  const flag = String(readUrlParam('client-metrics') || '').toLowerCase()
  if (flag === '0' || flag === 'false' || flag === 'off') return false
  if (flag === '1' || flag === 'true' || flag === 'on') return true
  return !import.meta.env.DEV
}

function resolveSampleRate(): number {
  const forcedRate = Number(readUrlParam('client-metrics-rate'))
  if (Number.isFinite(forcedRate) && forcedRate >= 0 && forcedRate <= 1) return forcedRate
  const envRate = Number(import.meta.env.VITE_CLIENT_METRICS_SAMPLE_RATE)
  if (Number.isFinite(envRate) && envRate >= 0 && envRate <= 1) return envRate
  return isLowEndDevice() ? 0.5 : 1
}

/** 归一化上报路径：去掉 query/hash，把长 hex/纯数字 id 段折叠成 :id，避免 PII 与高基数。 */
function normalizeMetricPath(): string {
  try {
    const pathname = String(window.location.pathname || '/')
    return (
      pathname
        .replace(/\/[0-9a-f]{8,}(?=\/|$)/gi, '/:id')
        .replace(/\/\d{3,}(?=\/|$)/g, '/:id')
        .slice(0, 120) || '/'
    )
  } catch {
    return '/'
  }
}

function enqueueMetric(name: ClientMetricName, value: number): void {
  if (!metricsEnabled || typeof value !== 'number' || !Number.isFinite(value)) return
  if (metricsQueue.length >= MAX_QUEUE_LENGTH) metricsQueue.shift()
  metricsQueue.push({ name, value: Math.round(value * 1000) / 1000 })
}

function postMetricSample(sample: ClientMetricSample): void {
  try {
    const payload = JSON.stringify({ page: normalizeMetricPath(), name: sample.name, value: sample.value })
    const beaconSent = navigator.sendBeacon?.(METRICS_ENDPOINT, new Blob([payload], { type: 'application/json' }))
    if (beaconSent) return
    void fetch(METRICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* 采集失败静默：不允许影响业务 */
  }
}

function flushMetricSamples(): void {
  if (!metricsEnabled || !metricsQueue.length) return
  const pendingSamples = metricsQueue
  metricsQueue = []
  for (const sample of pendingSamples) postMetricSample(sample)
}

function recordFinalMetric(name: ClientMetricName, value: number): void {
  if (!Number.isFinite(value)) return
  finalMetricValues.set(name, value)
}

/** 页面隐藏 / 卸载时把「会话终值」一次性发出（LCP/CLS/INP/FCP/TTFB 各自只发一次）。 */
function flushFinalMetrics(): void {
  if (!metricsEnabled || finalMetricsSettled) return
  finalMetricsSettled = true
  for (const [name, value] of finalMetricValues) enqueueMetric(name, value)
  finalMetricValues.clear()
  flushMetricSamples()
}

type LayoutShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean }
type EventTimingEntry = PerformanceEntry & { interactionId?: number; duration: number }

function observePerformance(type: string, callback: (entries: PerformanceEntry[]) => void): void {
  try {
    if (typeof PerformanceObserver !== 'function') return
    const observer = new PerformanceObserver((list) => {
      try {
        callback(list.getEntries())
      } catch {
        /* 单条回调失败不影响其余采集 */
      }
    })
    observer.observe({ type, buffered: true })
    activeObservers.push(observer)
  } catch {
    /* 浏览器不支持该 entry 类型时静默跳过 */
  }
}

function collectPaintMetrics(): void {
  try {
    for (const paintEntry of performance.getEntriesByType('paint'))
      paintEntry.name === 'first-contentful-paint' && recordFinalMetric('fcp', paintEntry.startTime)
    const navigationEntry = (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[])[0]
    navigationEntry && recordFinalMetric('ttfb', navigationEntry.responseStart - navigationEntry.startTime)
  } catch {
    /* 无法读取时跳过 */
  }
}

function bindGlobalSignalListeners(): void {
  try {
    // WebGL 上下文丢失由 guard 工具在 window 上派发（lost 不冒泡，采集端按 error 计数）。
    window.addEventListener('homeos:webgl-context-lost', () => enqueueMetric('error', 1))
    window.addEventListener('homeos:ws-reconnect', (event: Event) => {
      const attempt = Number((event as CustomEvent).detail?.attempt)
      enqueueMetric('ws_reconnect', Number.isFinite(attempt) ? attempt : 1)
    })
    window.addEventListener('error', (event) => {
      // 只统计真实脚本错误；资源加载失败（target 是元素）不计入，避免 ×N 噪声。
      if (event instanceof ErrorEvent) enqueueMetric('error', 1)
    })
  } catch {
    /* 忽略绑定失败 */
  }
}

/** 挂载 RUM 采集（幂等；首屏不阻塞，失败静默）。 */
export function startClientMetrics(): void {
  if (metricsStarted) return
  metricsStarted = true
  try {
    if (!resolveMetricsEnabled()) return
    const sampleRate = resolveSampleRate()
    if (!(sampleRate > 0) || Math.random() >= sampleRate) return
    metricsEnabled = true
    collectPaintMetrics()
    observePerformance('largest-contentful-paint', (entries) => {
      const lastEntry = entries[entries.length - 1]
      lastEntry && recordFinalMetric('lcp', lastEntry.startTime)
    })
    observePerformance('layout-shift', (entries) => {
      for (const entry of entries as LayoutShiftEntry[]) if (!entry.hadRecentInput) cumulativeLayoutShift += entry.value
      cumulativeLayoutShift > 0 && recordFinalMetric('cls', cumulativeLayoutShift)
    })
    observePerformance('event', (entries) => {
      for (const entry of entries as EventTimingEntry[])
        if (entry.interactionId && Number.isFinite(entry.duration)) {
          interactionMaxDurationMs = Math.max(interactionMaxDurationMs, entry.duration)
          recordFinalMetric('inp', interactionMaxDurationMs)
        }
    })
    observePerformance('longtask', (entries) => {
      for (const entry of entries) enqueueMetric('longtask', entry.duration)
    })
    bindGlobalSignalListeners()
    document.addEventListener('visibilitychange', () => {
      document.visibilityState === 'hidden' && flushFinalMetrics()
    })
    window.addEventListener('pagehide', () => flushFinalMetrics())
    setInterval(flushMetricSamples, FLUSH_INTERVAL_MS)
    // 长驻页面（看板/大屏）可能一直不触发 pagehide：12s 后先结算一次终值。
    window.setTimeout(flushFinalMetrics, SETTLE_METRICS_DELAY_MS)
  } catch {
    /* RUM 初始化失败静默：不能影响首屏 */
  }
}
