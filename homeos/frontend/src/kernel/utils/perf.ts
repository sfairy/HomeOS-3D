import { ref } from 'vue'
import { type FrontendSection } from '@/kernel/types/frontend-config'
import { getFrontendConfig, getLargeEntityThreshold, getWorkerDerivedThreshold, onConfigChange } from '@/kernel/config/frontend-config'
import { getPollSchedulerStats, schedulePoll, readLocalStorageFlag, writeLocalStorage } from '@/kernel/utils/core'
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

/**
 * 按实体规模与设备能力自动调节前端性能参数
 */

type AdaptiveConfigKey = 'rebuildDebounceMs' | 'rebuildChunkSize'
type AdaptiveConfigBaseline = Pick<FrontendSection, AdaptiveConfigKey>
type SmartPerfTickHandler = (payload: { lowStreak: number; highStreak: number }) => void

let lastAppliedCount = 0
let adaptiveConfigBaseline: AdaptiveConfigBaseline | null = null

const ADAPTIVE_KEYS: readonly AdaptiveConfigKey[] = ['rebuildDebounceMs', 'rebuildChunkSize']

const adaptiveTier = ref('high')

let fpsMonitorStarted = false
let slowFrameStreak = 0
let fastFrameStreak = 0
let smartLowStreak = 0
let smartHighStreak = 0
let smartPerfTickHandler: SmartPerfTickHandler | null = null

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

function updateAdaptiveTier(tier: string, _reason: string): void {
  adaptiveTier.value = tier
  // 自动降档只影响本终端渲染，绝不写进共享布局（否则会被当成未保存的更改并落库）
  setAutoPerformanceMode(tier)
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
    tips.push('超大规模：保持 wsPush.coldEntityOnDemand，并将 latencyProfile 设为 realtime 以压低关键域延迟')
  }
  if (entityCount >= largeEntityThreshold) {
    tips.push('可在「系统诊断」启动基线采样，对比 derivedRebuilds / wsBatchCount / listenerCount')
  }
  return tips
}

export function resolvePerfShellClass(userMode: string | undefined): string {
  const saved = normalizePerfMode(userMode)
  const effective = resolveEffectivePerformanceMode(saved)
  if (effective === 'high') return 'perf-high'
  // 用户自己选的档位是「保存的意图」，直接给静态 class；
  // 自动降档是临时状态，给 perf-adaptive 前缀，便于样式/排查区分来源。
  const auto = getAutoPerformanceMode()
  if (auto && effective === auto && effective !== saved) {
    return `perf-adaptive perf-${effective}`
  }
  return `perf-${effective}`
}

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

export { adaptiveTier }

onConfigChange(() => {
  lastAppliedCount = 0
  adaptiveConfigBaseline = null
})

/** 性能基线采样模块（诊断面板 / 手动导出）。 */

/** 性能基线采样数据结构。各字段为采样窗口内累计 / 缓存的指标值。 */
interface PerfBaselineSamples {
  fps: number[]
  heapMb: number[]
  derivedRebuilds: number
  wsBatchCount: number
  listenerCountMax: number
  recordedAt: string | null
}

/** 采样数据单例，模块级持有，采样期间持续写入。 */
const samples: PerfBaselineSamples = {
  fps: [],
  heapMb: [],
  derivedRebuilds: 0,
  wsBatchCount: 0,
  listenerCountMax: 0,
  recordedAt: null,
}

let sampling = false // 是否正在采样（为 true 时 recordFpsSample / tick 才会写入）
let sampleCancel: (() => void) | null = null // 堆内存采样轮询任务的取消函数（经全局调度器 1s 触发一次）
let lastDerivedRebuilds = 0 // 上次记录的派生重建数，用于计算增量
let lastWsBatchCount = 0 // 上次记录的 WebSocket 批次数，用于计算增量

/** 读取当前 JS 堆已用内存（MB）。不支持 performance.memory 时返回 null。 */
function readHeapMb() {
  const mem = performance.memory
  if (!mem?.usedJSHeapSize) return null
  return Math.round(mem.usedJSHeapSize / 1024 / 1024)
}

/**
 * 记录一帧 FPS 采样值。仅在采样开启且 fps 为有效数值时写入；环形缓冲上限 120 条。
 * @param fps 当前帧率。
 */
export function recordFpsSample(fps: number) {
  if (!sampling || !Number.isFinite(fps)) return
  samples.fps.push(fps)
  if (samples.fps.length > 120) samples.fps.shift() // FPS 环形缓冲上限：120 条 ≈ 采样 2 秒（60fps）
}

/**
 * 累计派生重建数与 WebSocket 批次数增量，并更新监听器峰值。
 * 仅在采样开启且传入 perfStats 时生效；增量按"当前值 - 上次值"计算并钳到非负。
 * @param perfStats 运行时统计，含 derivedRebuilds / wsBatchCount / listenerCount。
 */
export function tickPerfBaselineCounters(
  perfStats:
    | {
        derivedRebuilds?: number
        wsBatchCount?: number
        listenerCount?: number
      }
    | null
    | undefined,
) {
  if (!sampling || !perfStats) return
  const dr = perfStats.derivedRebuilds ?? 0
  const wb = perfStats.wsBatchCount ?? 0
  samples.derivedRebuilds += Math.max(0, dr - lastDerivedRebuilds)
  samples.wsBatchCount += Math.max(0, wb - lastWsBatchCount)
  const lc = perfStats.listenerCount ?? 0
  if (lc > samples.listenerCountMax) samples.listenerCountMax = lc
  lastDerivedRebuilds = dr
  lastWsBatchCount = wb
}

/**
 * 开始性能基线采样。若已在采样则直接返回当前快照。
 * 副作用：重置所有采样数据、记录起始时间、启动 1s 堆内存采样定时器。
 * @returns 采样启动后的初始快照。
 */
export function startPerfBaselineSampling() {
  if (sampling) return getPerfBaselineSnapshot()
  sampling = true
  samples.fps = []
  samples.heapMb = []
  samples.derivedRebuilds = 0
  samples.wsBatchCount = 0
  samples.listenerCountMax = 0
  samples.recordedAt = new Date().toISOString()
  lastDerivedRebuilds = 0
  lastWsBatchCount = 0

  // 堆内存采样经全局调度器每秒采集（诊断采样需连续数据，页面隐藏时不中断，visibilityAware:false）
  sampleCancel = schedulePoll(
    'perf:baseline-heap',
    () => {
      const heap = readHeapMb()
      if (heap != null) {
        samples.heapMb.push(heap)
        if (samples.heapMb.length > 60) samples.heapMb.shift() // 堆内存环形缓冲上限：60 条 × 1s = 1 分钟采样
      }
    },
    1000, // 毫秒：每秒一次堆内存采样
    { visibilityAware: false },
  )

  return getPerfBaselineSnapshot()
}

/**
 * 停止性能基线采样并清理轮询任务。
 * @returns 停止时的最终快照。
 */
export function stopPerfBaselineSampling() {
  sampling = false
  if (sampleCancel) {
    sampleCancel()
    sampleCancel = null
  }
  return getPerfBaselineSnapshot()
}

/** 查询当前是否正在采样。 */
export function isPerfBaselineSampling() {
  return sampling
}

/** 计算数值数组平均值，保留一位小数；空数组返回 null。 */
function avg(nums: number[]) {
  if (!nums.length) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

/** 计算数值数组最小值；空数组返回 null。 */
function min(nums: number[]) {
  if (!nums.length) return null
  return Math.min(...nums)
}

/**
 * 生成当前性能基线快照，含 FPS 平均/最小值、堆内存平均/峰值、
 * 派生重建增量、WebSocket 批次增量、监听器峰值及轮询调度器统计。
 * @returns 基线快照对象。
 */
export function getPerfBaselineSnapshot() {
  const poll = getPollSchedulerStats()
  return {
    recordedAt: samples.recordedAt,
    sampling,
    fps: { avg: avg(samples.fps), min: min(samples.fps), samples: samples.fps.length },
    heapMb: {
      avg: avg(samples.heapMb),
      max: samples.heapMb.length ? Math.max(...samples.heapMb) : null,
    },
    derivedRebuildsDelta: samples.derivedRebuilds,
    wsBatchCountDelta: samples.wsBatchCount,
    listenerCountMax: samples.listenerCountMax,
    pollScheduler: poll,
  }
}

/** 将当前基线快照序列化为美化后的 JSON 字符串，便于导出与分享。 */
export function exportPerfBaselineJson() {
  return JSON.stringify(getPerfBaselineSnapshot(), null, 2)
}

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

/**
 * 统一 FPS rAF 调度器：adaptive tier 监控 + 可选诊断采样 + 动画 tick（单 rAF 循环）
 *
 * 自适应监控只在「有人在用」时测帧：启动后与每次用户输入后的 ACTIVE_WINDOW_MS 内出帧，
 * 窗口过了就停。墙面平板 7×24 静置时这条空转的 rAF 会让整机每秒唤醒 60 次，而静置画面
 * 掉帧本来也没人看得到。诊断采样是显式开关，开着时不受窗口限制。
 */

type AdaptiveFpsTick = (deltaMs: number, ts: number) => void
type DiagnosticsFpsTick = (ts: number) => void

const ACTIVE_WINDOW_MS = 5000
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const

let schedulerStarted = false
let schedulerPaused = false
let lastFrameTs = 0
let activeUntil = 0

let adaptiveTick: AdaptiveFpsTick | null = null

let diagnosticsTick: DiagnosticsFpsTick | null = null
let diagnosticsActive = false

let visibilityBound = false
let activityBound = false

function tick(ts: number): void {
  if (schedulerPaused || (!diagnosticsActive && performance.now() > activeUntil)) {
    schedulerStarted = false
    return
  }
  if (lastFrameTs) {
    const delta = ts - lastFrameTs
    adaptiveTick?.(delta, ts)
  }
  if (diagnosticsActive && diagnosticsTick) {
    diagnosticsTick(ts)
  }
  lastFrameTs = ts
  requestAnimationFrame(tick)
}

function ensureSchedulerRunning() {
  if (schedulerStarted || schedulerPaused || typeof requestAnimationFrame !== 'function') return
  schedulerStarted = true
  lastFrameTs = 0
  requestAnimationFrame(tick)
}

function markActive() {
  activeUntil = performance.now() + ACTIVE_WINDOW_MS
  ensureSchedulerRunning()
}

function bindActivityWake() {
  if (activityBound || typeof window === 'undefined') return
  activityBound = true
  // activityBound 保证只注册一次；调度器是模块级单例，监听无归属对象可挂。
  for (const type of ACTIVITY_EVENTS) window.addEventListener(type, markActive, { capture: true, passive: true })
}

export function registerAdaptiveFpsTick(fn: AdaptiveFpsTick): void {
  adaptiveTick = fn
  markActive()
}

export function registerDiagnosticsFpsTick(fn: DiagnosticsFpsTick): void {
  diagnosticsTick = fn
}

export function startDiagnosticsFpsSampling() {
  diagnosticsActive = true
  ensureSchedulerRunning()
}

export function stopDiagnosticsFpsSampling() {
  diagnosticsActive = false
}

export function startFpsScheduler() {
  bindActivityWake()
  markActive()
}

export function isFpsSchedulerRunning() {
  return schedulerStarted
}

export function isDiagnosticsFpsSamplingActive() {
  return diagnosticsActive
}

export function pauseFpsScheduler(): void {
  schedulerPaused = true
}

export function resumeFpsScheduler(): void {
  schedulerPaused = false
  markActive()
}

/**
 * 页面隐藏时暂停全局 rAF 调度器，回到前台时恢复：
 * 后台标签页 rAF 被浏览器节流但仍低频触发，常驻调度持续空转浪费 CPU。
 * 复用 screensaver 的 pause/resume 通道，visibilitychange 仅作额外暂停源。
 */
export function bindFpsSchedulerVisibilityPause(): void {
  if (visibilityBound || typeof document === 'undefined') return
  visibilityBound = true
  // visibilityBound 保证只注册一次；调度器是模块级单例，监听无归属对象可挂。
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseFpsScheduler()
    else resumeFpsScheduler()
  })
}

export function unregisterDiagnosticsFpsTick() {
  diagnosticsTick = null
  diagnosticsActive = false
}

/**
 * 前端运行时性能采样（Diagnostics 面板，经 fps-scheduler 单 rAF 驱动）
 */

const fps = ref(0)
const memoryMb = ref<number | null>(null)
let frameCount = 0
let lastSampleTs = 0
let started = false

function sampleMemory() {
  const mem = performance.memory
  if (mem?.usedJSHeapSize) {
    memoryMb.value = Math.round(mem.usedJSHeapSize / 1024 / 1024)
  }
}

function onDiagnosticsTick(ts: number) {
  frameCount++
  if (!lastSampleTs) lastSampleTs = ts
  if (ts - lastSampleTs >= 1000) {
    fps.value = Math.round((frameCount * 1000) / (ts - lastSampleTs))
    recordFpsSample(fps.value)
    frameCount = 0
    lastSampleTs = ts
    sampleMemory()
  }
}

export function startFrontendPerfMonitor() {
  if (started) return
  started = true
  sampleMemory()
  registerDiagnosticsFpsTick(onDiagnosticsTick)
  startDiagnosticsFpsSampling()
}

export function stopFrontendPerfMonitor() {
  if (!started) return
  started = false
  stopDiagnosticsFpsSampling()
  unregisterDiagnosticsFpsTick()
  frameCount = 0
  lastSampleTs = 0
}

export { fps, memoryMb }

/**
 * B22 + RUM 的懒加载启动器。
 *
 * main.ts 只保留一个动态 import（首屏入口 chunk 不为采集/守卫付字节）；真正需要同步导入的
 * 依赖都收在这里。启动失败一律静默：采集与守卫都不是应用启动的必要条件。
 */

export function startPerfInstrumentation(): void {
  try {
    installGlobalWebglContextLossGuard()
    startClientMetrics()
  } catch {
    /* 采集/守卫初始化失败不应影响应用启动 */
  }
}

/**
 * 运行时性能档位（自动降档）
 * ---------------------------------------------------------------
 * 设备能力 / 帧率回落 / 实体规模带来的降档属于**当前终端的运行时状态**，
 * 不能写进 `layoutConfig.performanceMode`：
 *  - 布局配置是多终端共享的，写进去会把平板/低端机的档位同步给所有设备；
 *  - 深 watch 会把它标成「未保存的更改」，用户在设置页什么都没改也会被
 *    离开确认拦住（「全局布局有 1 项未保存的更改」），点保存还会真的落库。
 *
 * 因此自动降档单独放在这里，只影响渲染（壳层 class / 毛玻璃 / 时钟 / 图表动画），
 * 用户手动选择的档位仍然只在设置页保存时写入布局。
 */

type PerfMode = 'high' | 'medium' | 'low'

const RANK: Record<PerfMode, number> = { low: 1, medium: 2, high: 3 }

/** 归一化性能档位：未知值按 high（默认档）处理 */
export function normalizePerfMode(value: unknown): PerfMode {
  return value === 'low' || value === 'medium' ? value : 'high'
}

/** 自动降档结果；null 表示没有自动降档，按用户保存的档位运行 */
const autoPerformanceMode = ref<PerfMode | null>(null)

/** 供模板 / watch 订阅自动档位（只读语义，写入请走 set/clear） */
export const autoPerformanceModeRef = autoPerformanceMode

/** 当前自动降档档位（null = 未降档） */
export function getAutoPerformanceMode(): PerfMode | null {
  return autoPerformanceMode.value
}

/**
 * 设置自动降档，只降不升：多个来源（设备能力 / FPS / 实体规模）同时报告时取最低档。
 * 传 `high` 或空值等价于清除自动降档。
 */
export function setAutoPerformanceMode(mode: unknown): void {
  const next = normalizePerfMode(mode)
  if (next === 'high') {
    clearAutoPerformanceMode()
    return
  }
  const current = autoPerformanceMode.value
  if (current && RANK[current] <= RANK[next]) return
  autoPerformanceMode.value = next
}

/** 清除自动降档（用户手动选档 / 帧率恢复后调用） */
export function clearAutoPerformanceMode(): void {
  if (autoPerformanceMode.value === null) return
  autoPerformanceMode.value = null
}

/**
 * 当前终端实际生效的档位 = 用户保存档位与自动降档里更低的那个。
 * 自动降档永远不高于用户选择，避免「自动」把用户显式选的低档抬高。
 */
export function resolveEffectivePerformanceMode(saved?: string | null): PerfMode {
  const base = normalizePerfMode(saved)
  const auto = autoPerformanceMode.value
  if (!auto) return base
  return RANK[auto] < RANK[base] ? auto : base
}

/**
 * FPS 智能档位：连续低于 45fps 自动 medium，高于 55fps 持续 30s 恢复
 *
 * 只写运行时自动档位，不写 `layoutConfig.performanceMode`：
 * 布局是多终端共享的，把本机帧率逼出来的档位存进去会同步给其它设备，
 * 并让「未保存的更改」检测把自动降档当成用户编辑。
 */

let teardown: (() => void) | null = null
let autoDowngraded = false

type LayoutConfigForSmartPerf = {
  smartPerformanceMode?: boolean
  performanceMode?: string
  glassEffect?: string
}

let getLayoutConfig: (() => LayoutConfigForSmartPerf | null) | null = null

function onSmartPerfTick({ lowStreak, highStreak }: { lowStreak: number; highStreak: number }) {
  const layout = getLayoutConfig?.()
  if (!layout?.smartPerformanceMode || isPerformanceModeUserSet()) return

  if (lowStreak >= 135 && (layout.performanceMode || 'high') === 'high') {
    setAutoPerformanceMode('medium')
    autoDowngraded = true
    return
  }

  if (autoDowngraded && highStreak >= 1800 && getAutoPerformanceMode() === 'medium') {
    clearAutoPerformanceMode()
    autoDowngraded = false
  }
}

/**
 * @param {() => object} layoutConfigGetter
 * @returns {() => void}
 */
export function setupSmartPerformanceMode(layoutConfigGetter: () => LayoutConfigForSmartPerf | null) {
  teardown?.()
  getLayoutConfig = layoutConfigGetter
  registerSmartPerfTick(onSmartPerfTick)
  teardown = () => {
    registerSmartPerfTick(null as unknown as Parameters<typeof registerSmartPerfTick>[0])
    getLayoutConfig = null
    autoDowngraded = false
    teardown = null
  }
  return teardown
}

/**
 * 平板 / 低端设备默认性能档位（用户手动选择后不再覆盖）
 *
 * 注意：这里只调整**当前终端**的自动降档，不写入布局配置。
 * 布局是多终端共享的，把设备档位写进去会同步给其它设备，还会被当成未保存的更改
 * 弹「全局布局有 1 项未保存的更改」。渲染侧统一读 `resolveEffectivePerformanceMode`。
 */

/**
 * 平板首次启动默认性能档位（用户手动选择后不再覆盖）
 */

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

/**
 * WebGL 可用性预检（0.8.6）。
 *
 * 为什么要在建渲染器之前先问一次：浏览器可能整体把 GL 关掉了。Edge 在 GPU 进程连续
 * 崩溃后会以 `--use-gl=disabled` 重启 GPU 进程（报错里能看到 `GL_VENDOR = Disabled`、
 * `BindToCurrentSequence failed`），这种状态下 `new WebGLRenderer()` 必然失败。three
 * 每次失败都会往控制台打两条同样的报文，而 `createStudioRenderer` 的三级降级会重试
 * 三次 —— 一次页面加载刷六条，还拿不到「是浏览器禁用 GL、还是只不支持 antialias」这个
 * 关键区分，排查时反而被噪音盖住。
 *
 * 这里用一张 1×1 的离屏 canvas 先问一次，问完立刻 `loseContext()` 归还，免得预检
 * 自己占住一个上下文名额。成功结果按页面缓存（同一页面内没必要反复问）；失败**不缓存**
 * —— GPU 进程崩溃后浏览器可能重启它，SPA 内重新进工作室时应该允许再试一次。
 *
 * `?webgl-probe=0` 可关闭预检，回到「先建渲染器、失败再降级」的旧行为。
 */

/** 失败时给用户看的话：只讲可执行的动作，不复述浏览器内部报错。 */
export const WEBGL_UNAVAILABLE_MESSAGE =
  '当前浏览器无法创建 3D 画面：WebGL 已被禁用（常见于浏览器关闭了「使用图形加速」，或 GPU 进程崩溃后被降级）。请开启浏览器图形加速并重启浏览器；仍不行请改用 Chrome / Safari。'

type WebglProbeApi = 'webgl2' | 'webgl'

export interface WebglAvailability {
  available: boolean
  /** 探测拿到的最高版本；不可用时为 null。 */
  api: WebglProbeApi | null
  renderer: string
  vendor: string
  /** SwiftShader / llvmpipe 之类的软件光栅化：能画但很慢，质量档应主动降级。 */
  isSoftware: boolean
}

type ProbeContext = WebGLRenderingContext | WebGL2RenderingContext

const SOFTWARE_RENDERER_PATTERN = /swiftshader|llvmpipe|softpipe|software|microsoft basic|angle \(google/i

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  depth: true,
  failIfMajorPerformanceCaveat: false,
  powerPreference: 'default',
  preserveDrawingBuffer: false,
  stencil: false,
}

let cachedAvailability: WebglAvailability | null = null
let probeContextsInFlight = false

function isProbeDisabled(): boolean {
  try {
    const flag = String(new URLSearchParams(window.location.search).get('webgl-probe') || '').toLowerCase()
    return flag === '0' || flag === 'false' || flag === 'off'
  } catch {
    return false
  }
}

function readString(gl: ProbeContext, parameter: number): string {
  try {
    return String(gl.getParameter(parameter) ?? '')
  } catch {
    return ''
  }
}

function releaseProbeContext(gl: ProbeContext): void {
  try {
    const loseContextExtension = gl.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null
    loseContextExtension?.loseContext?.()
  } catch {
    /* 归还失败没有补救手段：预检上下文本身只有 1×1，等 GC 即可 */
  }
}

function createProbeCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    canvas.style.display = 'none'
    return canvas
  } catch {
    return null
  }
}

function tryContext(canvas: HTMLCanvasElement, api: WebglProbeApi): ProbeContext | null {
  try {
    return (canvas.getContext(api, CONTEXT_ATTRIBUTES) as ProbeContext | null) ?? null
  } catch {
    return null
  }
}

function unavailable(): WebglAvailability {
  return { available: false, api: null, renderer: '', vendor: '', isSoftware: false }
}

/**
 * 探测一次 WebGL。成功结果按页面缓存，失败不缓存（见文件头注释）。
 *
 * 本函数从不同时创建两个探针上下文（`probeContextsInFlight` 只防同一帧重入），
 * 也不参与渲染器创建 —— 它只是把「浏览器到底给不给 GL」这件事变成一个布尔值。
 */
export function probeWebglAvailability(): WebglAvailability {
  if (cachedAvailability) return cachedAvailability
  if (probeContextsInFlight) return unavailable()
  if (isProbeDisabled()) return { available: true, api: 'webgl2', renderer: '', vendor: '', isSoftware: false }

  probeContextsInFlight = true
  try {
    const canvas = createProbeCanvas()
    if (!canvas) return unavailable()
    let api: WebglProbeApi | null = null
    let gl = tryContext(canvas, 'webgl2')
    if (gl) api = 'webgl2'
    else {
      gl = tryContext(canvas, 'webgl')
      if (gl) api = 'webgl'
    }
    if (!gl || !api) return unavailable()
    const renderer = readString(gl, gl.RENDERER)
    const vendor = readString(gl, gl.VENDOR)
    const availability: WebglAvailability = {
      available: true,
      api,
      renderer,
      vendor,
      isSoftware: SOFTWARE_RENDERER_PATTERN.test(`${renderer} ${vendor}`),
    }
    // 只缓存成功：失败多半是临时的（GPU 进程重启后可能又好了），不该被一次探测钉死。
    cachedAvailability = availability
    releaseProbeContext(gl)
    return availability
  } finally {
    probeContextsInFlight = false
  }
}

/** 失败文案；预检没跑（`?webgl-probe=0`）时也能直接用。 */
export function webglUnavailableMessage(): string {
  return WEBGL_UNAVAILABLE_MESSAGE
}

/**
 * WebGL 上下文丢失 / 恢复守卫（B22）。
 *
 * 舞台渲染器已有自恢复实现（authoring 的 bindFrameDriver），这里补齐两类缺口：
 * 1. 独立小渲染器（窗型预览等）：丢失时 `preventDefault()`（不阻止默认行为浏览器就
 *    不会发 restored），暂停自己的渲染循环并给出可恢复提示；恢复后重绘。
 * 2. 全局兜底：`webglcontextlost` 不冒泡，只能在 capture 阶段监听；同时向 RUM 派发
 *    事件（采集端把 lost 计为 error），便于线上判断上下文丢失频率。
 *
 * `?webgl-guard=0` 可整体关闭本守卫回退旧行为。
 */

const CONTEXT_LOST_EVENT = 'homeos:webgl-context-lost'
const CONTEXT_RESTORED_EVENT = 'homeos:webgl-context-restored'

let globalGuardInstalled = false

function isGuardEnabled(): boolean {
  try {
    const flag = String(new URLSearchParams(window.location.search).get('webgl-guard') || '').toLowerCase()
    return flag !== '0' && flag !== 'false' && flag !== 'off'
  } catch {
    return true
  }
}

function dispatchContextEvent(eventName: string, label: string): void {
  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail: { label } }))
  } catch {
    /* 事件派发失败不影响恢复流程 */
  }
}

export type WebglContextLossGuardOptions = {
  label: string
  onLost?: () => void
  onRestored?: () => void
}

type GuardedRenderer = { domElement?: EventTarget | null }

/** 给单个渲染器挂丢失/恢复监听；返回解绑函数（renderer dispose 时调用）。 */
export function installWebglContextLossGuard(
  renderer: GuardedRenderer | null | undefined,
  options: WebglContextLossGuardOptions,
): () => void {
  const canvas = renderer?.domElement
  if (!isGuardEnabled() || !canvas?.addEventListener) return () => {}
  const handleLost = (event: Event) => {
    // 必须阻止默认行为，否则浏览器不会触发 webglcontextrestored。
    event.preventDefault()
    try {
      options.onLost?.()
    } catch {
      /* 暂停失败也要派发事件给 RUM */
    }
    dispatchContextEvent(CONTEXT_LOST_EVENT, options.label)
  }
  const handleRestored = () => {
    try {
      options.onRestored?.()
    } catch {
      /* 恢复回调失败仍要通知全局 */
    }
    dispatchContextEvent(CONTEXT_RESTORED_EVENT, options.label)
  }
  canvas.addEventListener('webglcontextlost', handleLost, false)
  canvas.addEventListener('webglcontextrestored', handleRestored, false)
  return () => {
    try {
      canvas.removeEventListener('webglcontextlost', handleLost, false)
      canvas.removeEventListener('webglcontextrestored', handleRestored, false)
    } catch {
      /* 元素已移除时忽略 */
    }
  }
}

/**
 * 全局兜底监听（capture 阶段）：只派发事件给 RUM，不接管任何渲染器的恢复逻辑
 * （舞台的恢复仍由它自己的 bindFrameDriver 负责，避免双重恢复）。
 */
export function installGlobalWebglContextLossGuard(): () => void {
  if (typeof window === 'undefined' || !isGuardEnabled() || globalGuardInstalled) return () => {}
  globalGuardInstalled = true
  const handleLost = (event: Event) => {
    try {
      event.preventDefault()
    } catch {
      /* 忽略 */
    }
    dispatchContextEvent(CONTEXT_LOST_EVENT, 'global')
  }
  const handleRestored = () => dispatchContextEvent(CONTEXT_RESTORED_EVENT, 'global')
  window.addEventListener('webglcontextlost', handleLost, true)
  window.addEventListener('webglcontextrestored', handleRestored, true)
  return () => {
    window.removeEventListener('webglcontextlost', handleLost, true)
    window.removeEventListener('webglcontextrestored', handleRestored, true)
  }
}
