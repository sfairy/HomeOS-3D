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
 *
 * ## 为什么 LCP / CLS / INP / FCP / TTFB 用 `web-vitals` 而不是自己算
 *
 * 这五个指标的定义都有反直觉的规范细节，手写版本在本仓库里出过三个**会误导优化决策**的错：
 *
 * - **CLS**：`Σ shift.value` 是错的。规范是「会话窗口」（连续偏移间隔 < 1s，窗口总长 ≤ 5s）
 *   的**最大**窗口和。直接累加会**只增不减**：长驻看板跑一天后 CLS 远超 PageSpeed 显示值，
 *   且永远落进后端 `le=1.0` 以上的桶，让 `/metrics` 的均值失去意义。
 * - **INP**：`max(duration)` 是错的。规范是交互延迟（按 `interactionId` 归组）的高分位，
 *   而不是「最慢的那一次事件」。一次首帧期间的卡顿点击会让 INP 永久停在几百毫秒。
 * - **LCP**：必须取 `renderTime || loadTime`、在首次输入时停止观测、并处理 bfcache /
 *   prerender 的 `activationStart`。手写版只读 `startTime` 且不停止观测。
 *
 * 这些数字是本仓库判断「优化有没有生效」的唯一信号 —— 一个定义错误的仪表比没有仪表更糟。
 * `web-vitals` 是 Chrome 团队维护的参考实现（Apache-2.0，约 2KB gzip），本文件只保留
 * 上报链路（采样 / 归一化 / beacon / 批量 flush）与 `longtask` / `error` / `ws_reconnect`
 * 这三项它不提供的指标。
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

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
let flushIntervalHandle: ReturnType<typeof setInterval> | null = null

/** `web-vitals` 的指标名是缩写大写，后端白名单是小写 —— 只在这里做一次映射。 */
const VITAL_NAME_BY_METRIC: Record<Metric['name'], ClientMetricName> = {
  LCP: 'lcp',
  CLS: 'cls',
  INP: 'inp',
  FCP: 'fcp',
  TTFB: 'ttfb',
}

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

/** 页面隐藏 / 卸载时把「会话终值」一次性发出（每个指标只发一次，与后端累加口径一致）。 */
function flushFinalMetrics(): void {
  if (!metricsEnabled || finalMetricsSettled) return
  finalMetricsSettled = true
  for (const [name, value] of finalMetricValues) enqueueMetric(name, value)
  finalMetricValues.clear()
  flushMetricSamples()
}

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

/**
 * 订阅五项 Web Vitals。
 *
 * `reportAllChanges` 让回调在数值演进过程中持续更新（我们只 `Map.set`，不额外上报），
 * 收尾时 `flushFinalMetrics` 发的是**当前最完整**的值 —— 这样不依赖「谁的
 * visibilitychange 监听先注册」，也不会因为回调只在隐藏时触发一次而漏掉终值。
 */
function observeWebVitals(): void {
  const report = (metric: Metric) => recordFinalMetric(VITAL_NAME_BY_METRIC[metric.name], metric.value)
  const alwaysReport = { reportAllChanges: true }
  try {
    onLCP(report, alwaysReport)
    onCLS(report, alwaysReport)
    onINP(report, alwaysReport)
    onFCP(report)
    onTTFB(report)
  } catch {
    /* 不支持的中标环境静默：RUM 不能影响业务 */
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
    observeWebVitals()
    // 长任务不在 Web Vitals 定义里，但仍是有用的卡顿信号（后端按时间桶聚合）。
    observePerformance('longtask', (entries) => {
      for (const entry of entries) if (entry.duration >= 50) enqueueMetric('longtask', entry.duration)
    })
    bindGlobalSignalListeners()
    document.addEventListener('visibilitychange', () => {
      document.visibilityState === 'hidden' && flushFinalMetrics()
    })
    window.addEventListener('pagehide', () => {
      flushFinalMetrics()
      if (flushIntervalHandle !== null) clearInterval(flushIntervalHandle)
      flushIntervalHandle = null
      for (const observer of activeObservers.splice(0)) observer.disconnect()
    })
    flushIntervalHandle = setInterval(flushMetricSamples, FLUSH_INTERVAL_MS)
    // 长驻页面（看板/大屏）可能一直不触发 pagehide：12s 后先结算一次终值。
    window.setTimeout(flushFinalMetrics, SETTLE_METRICS_DELAY_MS)
  } catch {
    /* RUM 初始化失败静默：不能影响首屏 */
  }
}
