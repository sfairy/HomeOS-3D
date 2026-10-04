/**
 * @module entity-cold-fetch.util
 * @description 冷实体按需 REST 拉取工具模块。
 *
 * 职责：当 WS 未推送某实体状态时，通过 REST API 按需拉取实体补全缓存。
 * 内部维护 inflight Map 做请求去重；对 404 / batch missing（布局陈旧引用 / 已过滤实体）做负缓存，
 * 避免平面图 ensureVisible 反复打同一缺失 ID。
 *
 * 依赖：`services/api/entities` 提供 REST 拉取接口。
 */
import axios from 'axios'
import { fetchEntity, fetchEntitiesBatchGet } from '@/services/api/entities'
import type { HaEntityState } from '@/types/entity-store'

const inflight = new Map<string, Promise<HaEntityState | null>>()
const batchInflight = new Map<string, Promise<Map<string, HaEntityState>>>()

/** 404 / 明确不存在：短时负缓存，抑制布局陈旧引用刷屏 */
const missingUntil = new Map<string, number>()
/** 负缓存时长（毫秒） */
const MISSING_TTL_MS = 5 * 60 * 1000

/** 是否处于 404 负缓存窗口（布局陈旧引用可据此跳过 ensure） */
export function isColdFetchMissing(entityId: string): boolean {
  const until = missingUntil.get(entityId)
  if (until == null) return false
  if (Date.now() >= until) {
    missingUntil.delete(entityId)
    return false
  }
  return true
}

function isMissingCached(entityId: string): boolean {
  return isColdFetchMissing(entityId)
}

function markMissing(entityId: string): void {
  missingUntil.set(entityId, Date.now() + MISSING_TTL_MS)
}

/** 实体出现在推送/全量同步后清除负缓存（供 store 可选调用） */
export function clearColdFetchMissing(entityId?: string): void {
  if (entityId) {
    missingUntil.delete(entityId)
    return
  }
  missingUntil.clear()
}

function isNotFoundError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404
}

/** 同 key 并发请求复用同一 Promise，settle 后自动移除（单条/批量共用一套去重） */
function dedupeInflight<T>(
  map: Map<string, Promise<T>>,
  key: string,
  create: () => Promise<T>,
): Promise<T> {
  const existing = map.get(key)
  if (existing) return existing
  const promise = create().finally(() => map.delete(key))
  map.set(key, promise)
  return promise
}

/**
 * 按 entity_id 拉取单条实体状态（带请求去重 + 404 负缓存）。
 *
 * @param entityId 实体 ID。
 * @param options 选项；refresh 为 true 时强制刷新 HA 源（并绕过负缓存）。
 * @returns 实体状态；entityId 为空或拉取失败时返回 null。
 */
export async function fetchEntityById(
  entityId: string,
  { refresh = false }: { refresh?: boolean } = {},
): Promise<HaEntityState | null> {
  if (!entityId) return null
  if (!refresh && isMissingCached(entityId)) return null

  const cacheKey = refresh ? `${entityId}:refresh` : entityId
  return dedupeInflight(inflight, cacheKey, () =>
    fetchEntity(entityId, refresh ? { refresh: 'ha' } : undefined)
      .then((res) => {
        const data = (res.data ?? null) as HaEntityState | null
        if (data?.entity_id) missingUntil.delete(entityId)
        return data
      })
      .catch((err: unknown) => {
        if (isNotFoundError(err)) markMissing(entityId)
        return null
      }),
  )
}

/** 与后端 POST /entities/batch/get 上限对齐 */
const BATCH_GET_LIMIT = 100

async function fetchEntitiesByIdsChunk(ids: string[]): Promise<Map<string, HaEntityState>> {
  const result = new Map<string, HaEntityState>()
  if (!ids.length) return result

  const cacheKey = [...ids].sort().join('\0')
  return dedupeInflight(batchInflight, cacheKey, () =>
    fetchEntitiesBatchGet(ids)
      .then((res) => {
        const entities = Array.isArray(res.data?.entities) ? res.data.entities : []
        for (const raw of entities) {
          const ent = raw as HaEntityState
          if (!ent?.entity_id) continue
          missingUntil.delete(ent.entity_id)
          result.set(ent.entity_id, ent)
        }
        for (const id of res.data?.missing || []) markMissing(String(id))
        for (const id of res.data?.forbidden || []) markMissing(String(id))
        for (const id of ids) {
          if (!result.has(id) && !isMissingCached(id)) markMissing(id)
        }
        return result
      })
      .catch(() => {
        // 批量失败时不写负缓存，留给单条路径重试
        return result
      }),
  )
}

/**
 * 批量拉取实体状态（POST /entities/batch/get，缺失不产生 404）。
 *
 * @param entityIds 实体 ID 列表。
 * @returns entity_id → 状态；未找到的 ID 已写入负缓存。
 */
export async function fetchEntitiesByIds(
  entityIds: string[],
): Promise<Map<string, HaEntityState>> {
  const ids = [...new Set(entityIds.filter(Boolean).map(String))].filter(
    (id) => !isMissingCached(id),
  )
  const result = new Map<string, HaEntityState>()
  if (!ids.length) return result

  for (let i = 0; i < ids.length; i += BATCH_GET_LIMIT) {
    const chunk = ids.slice(i, i + BATCH_GET_LIMIT)
    const part = await fetchEntitiesByIdsChunk(chunk)
    for (const [id, ent] of part) result.set(id, ent)
  }
  return result
}
