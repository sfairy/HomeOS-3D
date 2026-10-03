/**
 * 联动器 HA 同步状态缓存工具
 *
 * 职责：
 * - 为单条 / 批量同步状态查询提供内存缓存（5s TTL）与并发去重。
 * - 失败时返回 unknown 占位，避免 UI 误判为已同步。
 *
 * 依赖：@/services/api/index 的 apiGet。
 *
 * 注意：API prefix 与 id 为配置值，不翻译。
 */
import { apiGet } from '@/services/api/index'

/** 缓存 TTL：5 秒，避免短时间大量重复请求 */
const CACHE_TTL_MS = 5000
/** 单条同步状态缓存：key=prefix:id，value={ data, at } */
const cache = new Map<string, { data: unknown; at: number }>()
/** 进行中的请求：key=prefix:id / prefix:bulk:ids，value=Promise */
const inflight = new Map<string, Promise<unknown>>()

/** 单条 sync-status API 路径 */
function syncStatusPath(apiPrefix: string, id: string) {
  return `/${apiPrefix}/${id}/sync-status`
}

/** 批量 sync-status API 路径 */
function bulkSyncStatusPath(apiPrefix: string) {
  return `/${apiPrefix}/sync/statuses`
}

/** 缓存键：prefix 与 id 用 ':' 分隔 */
function cacheKey(apiPrefix: string, id: string) {
  return `${apiPrefix}:${id}`
}

/** 拉取失败时的占位：UI 显示「未知」，禁止当成已同步 */
const ORCHESTRATOR_SYNC_UNKNOWN = { unknown: true as const }

/** 写入单条缓存 */
function writeCache(apiPrefix: string, id: string, data: unknown) {
  cache.set(cacheKey(apiPrefix, id), { data, at: Date.now() })
}

/**
 * 拉取单条 sync-status（内存缓存 + 并发去重）。
 *
 * - 缓存命中且未过期时直接返回。
 * - 同 key 进行中请求复用 Promise。
 * - 失败回退 ORCHESTRATOR_SYNC_UNKNOWN。
 */
async function fetchOrchestratorSyncStatus(apiPrefix: string, id: string) {
  const key = cacheKey(apiPrefix, id)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.data
  }
  if (inflight.has(key)) {
    return inflight.get(key)
  }
  const promise = apiGet(syncStatusPath(apiPrefix, id))
    .then((r) => {
      const data = r.data || {}
      writeCache(apiPrefix, id, data)
      return data
    })
    .catch(() => ({ ...ORCHESTRATOR_SYNC_UNKNOWN }))
    .finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

/**
 * 批量拉取 sync-status（写入单条缓存）。
 *
 * - 先用缓存填补可命中条目，未命中进入 pending。
 * - pending 走批量接口；批量失败时回退到逐条拉取。
 * - 同批 ids 复用同一 inflight Promise。
 */
export async function fetchOrchestratorBulkSyncStatuses(apiPrefix: string, ids: string[]) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))]
  if (uniqueIds.length === 0) return {}

  const pending: string[] = []
  const result: Record<string, unknown> = {}
  for (const id of uniqueIds) {
    const hit = cache.get(cacheKey(apiPrefix, id))
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      result[id] = hit.data
    } else {
      pending.push(id)
    }
  }
  if (pending.length === 0) return result

  const bulkKey = `${apiPrefix}:bulk:${pending.join(',')}`
  if (inflight.has(bulkKey)) {
    const bulkData = (await inflight.get(bulkKey)) as Record<string, unknown>
    return { ...result, ...bulkData }
  }

  const promise = apiGet(bulkSyncStatusPath(apiPrefix), { params: { ids: pending.join(',') } })
    .then((r) => {
      const statuses = (r.data as { statuses?: Record<string, unknown> })?.statuses || {}
      for (const [id, data] of Object.entries(statuses)) {
        writeCache(apiPrefix, id, data || {})
        result[id] = data || {}
      }
      for (const id of pending) {
        if (!result[id]) result[id] = { ...ORCHESTRATOR_SYNC_UNKNOWN }
      }
      return result
    })
    .catch(async () => {
      const fallback: Record<string, unknown> = {}
      await Promise.all(
        pending.map(async (id) => {
          fallback[id] = await fetchOrchestratorSyncStatus(apiPrefix, id)
        }),
      )
      return fallback
    })
    .finally(() => inflight.delete(bulkKey))

  inflight.set(bulkKey, promise)
  const bulkData = await promise
  return { ...result, ...(bulkData as Record<string, unknown>) }
}

/** 失效指定 API prefix 下所有缓存（前缀匹配，批量删除） */
export function invalidateOrchestratorSyncPrefix(apiPrefix: string) {
  const prefix = `${apiPrefix}:`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}
