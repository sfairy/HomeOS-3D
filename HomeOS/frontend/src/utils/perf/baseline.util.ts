/**
 * 性能基线采样模块（诊断面板 / 手动导出）。
 *
 * 职责：
 * - 在采样窗口内收集 FPS、堆内存、派生重建数、WebSocket 批次数、监听器峰值等运行时指标。
 * - 提供快照查询与 JSON 导出，供诊断面板展示与问题排查使用。
 *
 * 依赖：
 * - poll-scheduler：读取轮询调度器统计信息，纳入基线快照。
 *
 * 注意：perf metric key（fps / heapMb 等）按规则不翻译，保持原样。
 */
import { getPollSchedulerStats, schedulePoll } from '@/utils/core/poll-scheduler'

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
