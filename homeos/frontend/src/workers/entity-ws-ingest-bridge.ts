/**
 * WS 批次规范化 Worker 主线程桥：大批次 delta 合并 + old_state 拷贝移入 Worker，减轻主线程阻塞。
 *
 * 关键依赖：comlink（Worker RPC wrap）、@/utils/entity/state-delta.util（同步规范化实现与回退路径）、
 *   @/types/entity-store（EntitiesMap）、@/utils/core/logger（降级 / 重试告警）。
 *
 * 消息协议（comlink RPC，无 postMessage 显式事件）：
 * - 出站调用 api.normalizeBatch(changes, snapshots) -> NormalizedWsBatchItem[]
 *     仅在批次大小 ≥ WORKER_THRESHOLD 时走 Worker；小批次直接同步更快；
 * - 超时 / 失败策略：偶发超时回退主线程同步实现，连续失败达阈值后停用 Worker 并按周期重试。
 */
import type { EntitiesMap } from '@/types/entity-store'
import {
  normalizeWsBatchChangesSync,
  type NormalizedWsBatchItem,
  type WsDeltaChange,
} from '@/utils/entity/state-delta.util'
import { logger } from '@/utils/core/logger'

/** 达到该条数才走 Worker；更小批次主线程同步更快（避免 postMessage 开销） */
const WORKER_THRESHOLD = 24
/** Worker 常规超时（含结构化克隆往返）；过短会在主线程繁忙 / 属性肥大时误判 */
const WORKER_TIMEOUT_MS = 3000
/** 首次调用含 Worker 脚本加载，给更长宽限 */
const WORKER_COLD_TIMEOUT_MS = 8000
/** 按条数追加超时，上限封顶 */
const WORKER_TIMEOUT_PER_ITEM_MS = 20
const WORKER_TIMEOUT_MAX_MS = 12_000
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
    worker = new Worker(new URL('./entity-ws-ingest.worker', import.meta.url), {
      type: 'module',
    })
    workerApi = wrap(worker)
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

/** Promise 与超时计时器竞速：超时则 reject，promise 先 settle 时清理计时器。 */
function raceWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer)
    }),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Ingest Worker 超时')), ms)
    }),
  ])
}

/**
 * 记录 Worker 回退原因：偶发超时（未达连续失败阈值）按 15s 节流打 debug，
 * 达到阈值后升级为 warn，便于排查反复降级。
 */
function noteWorkerFallback(err: unknown, streak: number) {
  // 偶发超时仅 debug（已回退主线程，功能不受损）；连续失败才 WARN
  if (streak < WORKER_FAIL_STREAK_LIMIT) {
    const now = Date.now()
    if (now - lastTimeoutDebugAt < 15_000) return
    lastTimeoutDebugAt = now
    logger.debug('[实体 WS 摄入] worker 规范化超时,本批回退主线程', err)
    return
  }
  logger.warn('[实体 WS 摄入] worker 规范化失败,回退主线程', err)
}

/** 规范化 WS 批次；小批次同步，大批次走 Worker */
export async function normalizeWsBatchChanges(
  changes: WsDeltaChange[],
  entities: EntitiesMap,
): Promise<NormalizedWsBatchItem[]> {
  if (!changes?.length) return []
  if (changes.length < WORKER_THRESHOLD) {
    return normalizeWsBatchChangesSync(changes, entities)
  }

  const api = await ensureIngestWorker()
  if (!api) return normalizeWsBatchChangesSync(changes, entities)

  const snapshots = collectSnapshots(changes, entities)
  const timeoutMs = resolveWorkerTimeoutMs(changes.length)
  try {
    const result = await raceWithTimeout(api.normalizeBatch(changes, snapshots), timeoutMs)
    if (Array.isArray(result)) {
      workerWarmed = true
      failStreak = 0
      return result
    }
  } catch (err) {
    failStreak += 1
    noteWorkerFallback(err, failStreak)
    if (failStreak >= WORKER_FAIL_STREAK_LIMIT) {
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
      logger.warn(
        `[实体 WS 摄入] worker 连续超时 ${failStreak} 次,本批回退主线程,` +
          `${WORKER_RETRY_INTERVAL_MS / 1000}s 后自动重试 worker`,
      )
    }
  }

  return normalizeWsBatchChangesSync(changes, entities)
}
