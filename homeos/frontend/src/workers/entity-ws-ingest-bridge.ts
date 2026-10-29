/**
 * WS 批次规范化 Worker 主线程桥：大批次 delta 合并 + old_state 拷贝移入 Worker，减轻主线程阻塞。
 * 只有 delta 进 Worker；非 delta（断线补发的整包实体状态）原样透传，不白付结构化克隆。
 */
import type { EntitiesMap } from '@/shared/types/entity-store'
import {
  mergeNormalizedDeltas,
  normalizeWsBatchChangesSync,
  splitDeltaChanges,
  type NormalizedWsBatchItem,
  type WsDeltaChange,
} from '@/shared/entity/utils/state-delta.util'
import { logger } from '@/shared/utils/core/logger'

/** 达到该条数才走 Worker；更小批次主线程同步更快（避免 postMessage 开销） */
const WORKER_THRESHOLD = 24
/** Worker 常规超时（含结构化克隆往返）；过短会在主线程繁忙 / 属性肥大时误判 */
const WORKER_TIMEOUT_MS = 3000
/** 首次调用含 Worker 脚本加载，给更长宽限 */
const WORKER_COLD_TIMEOUT_MS = 8000
/** 按条数追加超时，上限封顶 */
const WORKER_TIMEOUT_PER_ITEM_MS = 20
const WORKER_TIMEOUT_MAX_MS = 12_000
/** 超时后等待迟到回传的宽限窗口：主线程长任务会让回传消息排在超时定时器之后 */
const WORKER_TIMEOUT_GRACE_MS = 1500
/** 连续超时后停用 Worker，避免反复告警与无效往返 */
const WORKER_FAIL_STREAK_LIMIT = 3
/** 连续失败降级后，周期性重试 Worker 的间隔（毫秒） */
const WORKER_RETRY_INTERVAL_MS = 30_000

let worker: Worker | null = null
let workerApi: {
  normalizeBatch: (
    changes: WsDeltaChange[],
    snapshots: Record<string, unknown>,
  ) => Promise<NormalizedWsBatchItem[]>
} | null = null
let workerFailed = false
let workerWarmed = false
let failStreak = 0
let lastTimeoutDebugAt = 0
/** 连续失败降级后的下一次重试时间戳 */
let workerRetryAt = 0

/**
 * 当前 Worker 实例的脚本级故障原因（脚本 404 / 模块求值失败 / 消息反序列化失败）。
 *
 * 这类故障不会从 ``new Worker`` 抛出，只会异步触发 ``error`` / ``messageerror`` 事件；
 * 不监听就只能等超时，日志里还会误报成「Ingest Worker 超时」——真实原因是脚本压根没跑起来
 * （dev 下 dist 重建会删掉旧 hash 的 worker chunk，已打开的页面必然 404）。
 */
let workerFaultReason: string | null = null
/** 当前 Worker 实例的故障信号：脚本级故障时立刻 reject，让在途批次不必等满超时 */
let workerFaultSignal: Promise<never> | null = null
let rejectWorkerFault: ((err: Error) => void) | null = null

/** 立刻把当前 Worker 判为不可用：终止实例并按重试窗口降级，本批交给主线程 */
function markWorkerUnusable(): void {
  workerFailed = true
  workerRetryAt = Date.now() + WORKER_RETRY_INTERVAL_MS
  try {
    worker?.terminate()
  } catch {
    /* ignore */
  }
  worker = null
  workerApi = null
  workerWarmed = false
}

/**
 * 懒加载并复用 entity-ws-ingest.worker。
 * 降级状态下按 WORKER_RETRY_INTERVAL_MS 周期重试重建，避免一次失败后永久停用；
 * 环境不支持 Worker 或初始化异常时回退主线程并安排下次重试。
 */
async function ensureIngestWorker(): Promise<typeof workerApi> {
  if (workerApi) return workerApi
  // 降级后周期性重试：到达重试窗口即清空失败计数并尝试重建 Worker
  if (workerFailed) {
    if (Date.now() < workerRetryAt) return null
    workerFailed = false
    failStreak = 0
  }
  if (typeof Worker === 'undefined') {
    workerFailed = true
    workerRetryAt = Date.now() + WORKER_RETRY_INTERVAL_MS
    return null
  }
  try {
    const { wrap } = await import('comlink')
    // 新实例先用一次全新信号：上一次的故障 reject 已被上一批消费，不能复用
    workerFaultReason = null
    workerFaultSignal = new Promise<never>((_, reject) => {
      rejectWorkerFault = reject
    })
    // 无人等待时 fault 也会 reject（例如故障发生在两批之间），这里先兜住避免 unhandled rejection
    workerFaultSignal.catch(() => undefined)
    const created = new Worker(new URL('./entity-ws-ingest.worker', import.meta.url), {
      type: 'module',
    })
    // 先登记实例再挂监听：脚本 404 时 error 事件可能在下一 tick 就到达，
    // markWorkerUnusable 需要能 terminate 到这个实例
    worker = created
    created.addEventListener('error', (event) => {
      workerFaultReason =
        event.message ||
        'Ingest Worker 脚本加载失败（多为 dist 重建后旧 hash 被删除，刷新页面即可）'
      rejectWorkerFault?.(new Error(workerFaultReason))
      markWorkerUnusable()
    })
    created.addEventListener('messageerror', () => {
      workerFaultReason = 'Ingest Worker 消息无法反序列化（回传值含不可克隆结构）'
      rejectWorkerFault?.(new Error(workerFaultReason))
      markWorkerUnusable()
    })
    workerApi = wrap(created)
    return workerApi
  } catch (err) {
    workerFailed = true
    workerRetryAt = Date.now() + WORKER_RETRY_INTERVAL_MS
    logger.warn('[实体 WS 摄入] worker 初始化失败,回退主线程,稍后自动重试', err)
    return null
  }
}

/**
 * 从待规范化变化列表中收集相关实体快照：仅取首次出现且实体表存在的项，
 * 避免把整个 entities 表结构化克隆到 Worker（降低 postMessage 开销）。
 */
function collectSnapshots(changes: WsDeltaChange[], entities: EntitiesMap): EntitiesMap {
  const snapshots: EntitiesMap = {}
  for (let i = 0; i < changes.length; i++) {
    const id = changes[i]?.entity_id
    if (!id || snapshots[id]) continue
    const existing = entities[id]
    if (existing) snapshots[id] = existing
  }
  return snapshots
}

/**
 * 按批次大小动态计算 Worker 超时：冷启动（未预热）给更长宽限，之后按条数追加，
 * 总时长不超过 WORKER_TIMEOUT_MAX_MS。
 */
function resolveWorkerTimeoutMs(batchSize: number): number {
  const base = workerWarmed ? WORKER_TIMEOUT_MS : WORKER_COLD_TIMEOUT_MS
  return Math.min(WORKER_TIMEOUT_MAX_MS, base + Math.max(0, batchSize) * WORKER_TIMEOUT_PER_ITEM_MS)
}

/** Promise 与超时计时器 / Worker 故障信号竞速：任一先结束即清理计时器。 */
function raceWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fault?: Promise<never> | null,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const contenders: Promise<T>[] = [
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Ingest Worker 超时')), ms)
    }),
  ]
  if (fault) contenders.push(fault)
  return Promise.race(contenders).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/** 宽限窗口内等一个在途请求落地：超时或抛错都收敛为 null，绝不向外抛 */
function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const settled = promise.then(
    (value) => value as T | null,
    () => null,
  )
  const grace = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([settled, grace]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * 记录 Worker 回退原因：偶发超时（未达连续失败阈值）按 15s 节流打 debug，
 * 达到阈值后升级为 warn，便于排查反复降级。附带批次规模便于定位是真的算不动还是被拖住。
 */
function noteWorkerFallback(
  err: unknown,
  streak: number,
  meta: { batchSize: number; deltaCount: number; timeoutMs: number },
) {
  // 偶发超时仅 debug（已回退主线程，功能不受损）；连续失败才 WARN
  if (streak < WORKER_FAIL_STREAK_LIMIT) {
    const now = Date.now()
    if (now - lastTimeoutDebugAt < 15_000) return
    lastTimeoutDebugAt = now
    logger.debug('[实体 WS 摄入] worker 规范化超时,本批回退主线程', err, meta)
    return
  }
  logger.warn('[实体 WS 摄入] worker 规范化失败,回退主线程', err, meta)
}

/** 规范化 WS 批次；小批次同步，大批次走 Worker（只送 delta，非 delta 原样透传） */
export async function normalizeWsBatchChanges(
  changes: WsDeltaChange[],
  entities: EntitiesMap,
): Promise<NormalizedWsBatchItem[]> {
  if (!changes?.length) return []
  const { deltas, positions } = splitDeltaChanges(changes)
  // 只有 delta 需要合并：非 delta 走 Worker 只是原样克隆往返，纯亏
  if (deltas.length < WORKER_THRESHOLD) {
    return normalizeWsBatchChangesSync(changes, entities)
  }

  const api = await ensureIngestWorker()
  if (!api) return normalizeWsBatchChangesSync(changes, entities)

  const snapshots = collectSnapshots(deltas, entities)
  const timeoutMs = resolveWorkerTimeoutMs(deltas.length)
  const meta = { batchSize: changes.length, deltaCount: deltas.length, timeoutMs }
  const pending = api.normalizeBatch(deltas, snapshots)
  try {
    const result = await raceWithTimeout(pending, timeoutMs, workerFaultSignal)
    const merged = Array.isArray(result)
      ? mergeNormalizedDeltas(changes, positions, result)
      : null
    if (merged) {
      workerWarmed = true
      failStreak = 0
      return merged
    }
  } catch (err) {
    // 脚本级故障已由 markWorkerUnusable 立即降级，不计入超时次数（否则会误报「连续超时 3 次」）
    if (workerFaultReason) {
      logger.warn('[实体 WS 摄入] worker 不可用,本批回退主线程', workerFaultReason)
      workerFaultReason = null
      return normalizeWsBatchChangesSync(changes, entities)
    }
    // 超时只说明「没在窗口内回来」：主线程自身被长任务占住时 Worker 往往早就算完，
    // 只是回传消息排在超时定时器之后。宽限窗口内等到结果就照用，不算 Worker 故障、
    // 也不在已经卡住的主线程上再同步重算一遍。
    const late = await settleWithin(pending, WORKER_TIMEOUT_GRACE_MS)
    const lateMerged = Array.isArray(late)
      ? mergeNormalizedDeltas(changes, positions, late)
      : null
    if (lateMerged) {
      workerWarmed = true
      failStreak = 0
      logger.debug('[实体 WS 摄入] worker 回传迟于超时窗口,已采用迟到结果', meta)
      return lateMerged
    }
    failStreak += 1
    noteWorkerFallback(err, failStreak, meta)
    if (failStreak >= WORKER_FAIL_STREAK_LIMIT) {
      markWorkerUnusable()
      logger.warn(
        `[实体 WS 摄入] worker 连续超时 ${failStreak} 次,本批回退主线程,` +
          `${WORKER_RETRY_INTERVAL_MS / 1000}s 后自动重试 worker`,
      )
    }
  }

  return normalizeWsBatchChangesSync(changes, entities)
}
