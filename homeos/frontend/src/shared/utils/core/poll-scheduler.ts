/**
 * @module core/poll-scheduler
 * @description 全局小组件轮询调度器与共享请求缓存。
 *
 * 设计要点：
 *  - 单一 1s 刻度定时器驱动所有注册的轮询任务，页面隐藏时暂停（visibilityAware 任务）；
 *  - visibilityAware:false 的任务（会话刷新、上报心跳等后台常驻服务）页面隐藏时仍按周期运行；
 *  - 注册时按序号分批错峰（8 槽 × 350ms），避免同一刻度集中触发；
 *  - sharedFetch 提供「同 key 去重 + TTL 内存缓存」，避免短时间内重复请求。
 *
 * 依赖：浏览器 document（visibilitychange）。
 */
/** 单个轮询任务定义 */
interface PollJob {
  fn: () => void
  intervalMs: number
  lastRun: number
  /** 是否感知页面可见性：true 时页面隐藏暂停；false 时后台常驻运行 */
  visibilityAware: boolean
}

/** sharedFetch 缓存条目 */
interface SharedCacheEntry {
  at: number
  data: unknown
}

/** 已注册的轮询任务表（key -> job） */
const jobs = new Map<string, PollJob>()
/** 全局刻度定时器句柄 */
let tickTimer: ReturnType<typeof setInterval> | null = null
/** 任务序号，用于错峰分配 */
let jobSeq = 0
/** 刻度间隔（毫秒），最小 1000 */
let tickMs = 1000

/**
 * 调整刻度间隔（最小 1000ms）。已在运行时重启定时器以应用新间隔。
 * @param ms 新的刻度间隔
 */
export function setPollTickMs(ms: number): void {
  const next = Math.max(1000, Number(ms) || 1000)
  if (next === tickMs) return
  tickMs = next
  if (tickTimer) {
    stopTick()
    ensureTick()
  }
}

/** 当前页面是否隐藏（隐藏时暂停轮询以节省资源） */
function pageHidden() {
  return typeof document !== 'undefined' && document.hidden
}

/** 执行所有到期任务；页面隐藏时跳过 visibilityAware 任务（后台常驻任务不受影响） */
function runDue() {
  const hidden = pageHidden()
  const now = Date.now()
  for (const job of jobs.values()) {
    // 页面隐藏时仅暂停感知可见性的任务；后台常驻任务（如会话刷新）继续按周期运行
    if (hidden && job.visibilityAware) continue
    if (now - job.lastRun < job.intervalMs) continue
    job.lastRun = now
    try {
      job.fn()
    } catch {
      /* 单任务失败不影响调度器，避免拖垮其他任务 */
    }
  }
}

/** 确保刻度定时器运行（无任务时不启动） */
function ensureTick() {
  if (tickTimer || jobs.size === 0) return
  tickTimer = setInterval(runDue, tickMs)
}

/** 停止刻度定时器 */
function stopTick() {
  if (!tickTimer) return
  clearInterval(tickTimer)
  tickTimer = null
}

// 页面从隐藏恢复可见时立即跑一次，保证数据及时刷新
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!pageHidden()) runDue()
  })
}

/**
 * 注册一个轮询任务。
 * @param key 任务唯一标识（同 key 会覆盖旧任务）
 * @param fn 任务回调
 * @param intervalMs 轮询间隔（最小 1000ms）
 * @param opts.visibilityAware 是否感知页面可见性，默认 true：
 *   - true：页面隐藏时该任务暂停（UI 时钟、倒计时等）；
 *   - false：页面隐藏时仍按周期运行（会话刷新、上报心跳等后台常驻服务）。
 * @param opts.runImmediately 是否错峰后立即执行一次，默认 true；
 *   设为 false 时跳过首跑（调用方已显式触发时避免双发）。
 * @returns 取消订阅函数（调用后移除该任务）
 */
export function schedulePoll(
  key: string,
  fn: () => void,
  intervalMs: number,
  opts?: { visibilityAware?: boolean; runImmediately?: boolean },
): () => void {
  const ms = Math.max(1000, Number(intervalMs) || 60_000)
  // 是否感知页面可见性（默认 true：页面隐藏时暂停该任务）
  const visibilityAware = opts?.visibilityAware !== false
  const runImmediately = opts?.runImmediately !== false
  // 错峰：按序号取模 8 槽，每槽错开 350ms，避免集中触发
  const stagger = (jobSeq++ % 8) * 350
  // 跳过首跑时把 lastRun 设为「刚跑过」，等满一个 interval 再触发
  jobs.set(key, {
    fn,
    intervalMs: ms,
    lastRun: runImmediately ? Date.now() + stagger - ms : Date.now(),
    visibilityAware,
  })
  ensureTick()
  // 首次触发：可见时（或后台常驻任务不受隐藏限制）按错峰时间立即执行一次
  if (runImmediately && (!pageHidden() || !visibilityAware)) {
    setTimeout(() => {
      if (jobs.has(key) && (!pageHidden() || !visibilityAware)) fn()
    }, stagger)
  }
  return () => {
    jobs.delete(key)
    if (jobs.size === 0) stopTick()
  }
}

/** 获取调度器运行状态（用于调试 / 监控） */
export function getPollSchedulerStats() {
  return { activeJobs: jobs.size, ticking: !!tickTimer, hidden: pageHidden(), tickMs }
}

/** sharedFetch 进行中的 Promise 表（同 key 去重） */
const sharedInflight = new Map<string, Promise<unknown>>()
/** sharedFetch 内存缓存表 */
const sharedCache = new Map<string, SharedCacheEntry>()
/** 缓存最大条目数，超出后清理旧条目 */
const MAX_CACHE_ENTRIES = 100
/** 缓存清理定时器句柄 */
let cacheCleanupTimer: ReturnType<typeof setTimeout> | null = null

/** 清理过期（>60s）与超量缓存条目；若仍有残留则继续调度下一轮清理 */
function cleanupExpiredCache() {
  const now = Date.now()
  let deleted = 0
  for (const [key, entry] of sharedCache) {
    if (now - entry.at > 60_000) {
      sharedCache.delete(key)
      deleted++
    }
  }
  if (sharedCache.size > MAX_CACHE_ENTRIES) {
    let count = 0
    for (const key of sharedCache.keys()) {
      sharedCache.delete(key)
      deleted++
      count++
      if (count >= sharedCache.size - MAX_CACHE_ENTRIES) break
    }
  }
  if (deleted > 0 && sharedCache.size > 0) {
    scheduleCacheCleanup()
  } else {
    cacheCleanupTimer = null
  }
}

/** 安排一次缓存清理（30s 后执行，已存在则跳过） */
function scheduleCacheCleanup() {
  if (cacheCleanupTimer) return
  cacheCleanupTimer = setTimeout(cleanupExpiredCache, 30_000)
}

/**
 * 清除 sharedFetch 内存缓存（配置保存后避免读到旧快照）。
 * @param key 指定 key 时只清该条；不传则清空全部
 */
export function invalidateSharedFetch(key?: string): void {
  if (key) {
    sharedCache.delete(key)
    sharedInflight.delete(key)
    return
  }
  sharedCache.clear()
  sharedInflight.clear()
}

/** 按前缀清除 sharedFetch 缓存（如 IAQ map 变更后失效全部 iaq key） */
export function invalidateSharedFetchPrefix(prefix: string): void {
  if (!prefix) return
  for (const key of sharedCache.keys()) {
    if (key.startsWith(prefix)) sharedCache.delete(key)
  }
  for (const key of sharedInflight.keys()) {
    if (key.startsWith(prefix)) sharedInflight.delete(key)
  }
}

/**
 * 共享 fetch：同 key 请求去重 + TTL 内存缓存。
 * @param key 缓存键
 * @param fetcher 实际请求函数
 * @param ttlMs 缓存存活时间，默认 5000ms
 * @returns 命中缓存则直接返回；否则等待 fetcher 结果并缓存
 */
export async function sharedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 5000,
): Promise<T> {
  const now = Date.now()
  const cached = sharedCache.get(key)
  if (cached && now - cached.at < ttlMs) return cached.data as T

  // 同 key 并发请求复用同一 inflight Promise，避免重复打接口
  let inflight = sharedInflight.get(key)
  if (!inflight) {
    inflight = Promise.resolve()
      .then(fetcher)
      .then((data) => {
        sharedCache.set(key, { at: Date.now(), data })
        sharedInflight.delete(key)
        scheduleCacheCleanup()
        return data
      })
      .catch((err) => {
        sharedInflight.delete(key)
        throw err
      })
    sharedInflight.set(key, inflight)
  }
  return inflight as Promise<T>
}
