/**
 * @module entity-idb-cache
 * @description IndexedDB 实体快照缓存（加速首屏、离线回显）。
 *
 * 职责：
 * - 管理 IndexedDB 数据库（homeos_entity_cache）的打开、升级与修复。
 * - 按用户 + 角色 + ACL 生成隔离键，保证不同用户缓存互不污染。
 * - 提供快照的读取、写入、清除接口，支持过期判定。
 *
 * 依赖：
 * - `frontend-config`：缓存开关与过期配置。
 * - `logger`：日志输出。
 *
 * 数据库名与 README 一致：homeos_entity_cache。
 */
import type {
  EntityCacheAccessUser,
  EntityCacheSnapshot,
  HaEntityState,
} from '@/types/entity-store'
import { getFrontendConfig } from '@/utils/config/frontend-config'
import { logger } from '@/utils/core/logger'

const DB_NAME = 'homeos_entity_cache'
const DB_VERSION = 2
const STORE_NAME = 'snapshots'
/** 分片键分隔符：缓存隔离键与分片域之间的连接符（读取时按此前缀过滤分片键） */
const SHARD_SEP = '::shard::'

let dbPromise: Promise<IDBDatabase> | null = null

/**
 * 判断实体缓存功能是否开启。
 *
 * @returns 配置未显式关闭（entityCacheEnabled !== false）时返回 true。
 */
export function isEntityCacheEnabled(): boolean {
  const cfg = getFrontendConfig()
  return cfg.entityCacheEnabled !== false
}

function getEntityCacheMaxAgeMs(): number {
  const cfg = getFrontendConfig()
  return cfg.entityCacheMaxAgeMs ?? 24 * 60 * 60 * 1000
}

/** getEntityCacheSaveDebounceMs：函数，按签名入参返回处理结果。 */
export function getEntityCacheSaveDebounceMs(): number {
  const cfg = getFrontendConfig()
  return cfg.entityCacheSaveDebounceMs ?? 10_000
}

/**
 * 按用户 + 角色 + ACL 生成缓存隔离键。
 *
 * 格式：`{username}|{role}|{restrictions排序后逗号拼接}`，
 * 保证不同用户 / 角色 / 权限的缓存互不污染。
 *
 * @param username 用户名。
 * @param accessUser 访问用户信息（含角色与限制）。
 * @returns 缓存隔离键字符串。
 */
export function buildEntityCacheKey(
  username: string | null | undefined,
  accessUser: EntityCacheAccessUser | null | undefined,
): string {
  const user = username || 'anonymous'
  const role = accessUser?.role || 'admin'
  const restrictions = Array.isArray(accessUser?.restrictions)
    ? [...accessUser.restrictions].sort().join(',')
    : ''
  return `${user}|${role}|${restrictions}`
}

function resetDbPromise(): void {
  dbPromise = null
}

/**
 * 构造某缓存隔离键下指定域的分片键。
 * 分片键 = `{cacheKey}::shard::{domain}`，同一用户的缓存按域拆分存储。
 *
 * @param cacheKey 缓存隔离键。
 * @param domain 实体域（如 light / sensor）。
 * @returns 分片键字符串。
 */
function buildShardKey(cacheKey: string, domain: string): string {
  return `${cacheKey}${SHARD_SEP}${domain}`
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    // 其他标签页持有连接时会一直阻塞，3s 超时拒绝，避免该 Promise 永不落定
    const blockedTimer = setTimeout(() => {
      reject(new Error('IndexedDB 删除被其他标签页阻塞超时（3s）'))
    }, 3000)
    req.onsuccess = () => {
      clearTimeout(blockedTimer)
      resolve(undefined)
    }
    req.onerror = () => {
      clearTimeout(blockedTimer)
      reject(req.error)
    }
    req.onblocked = () => {
      logger.warn('IndexedDB 结构修复被阻塞,请关闭其他 HomeOS 标签页后刷新')
    }
  })
}

function ensureObjectStore(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME)
  }
}

/**
 * 打开数据库；若已有库缺少 object store（历史空库），自动删除并重建。
 *
 * 处理 onupgradeneeded 以创建 store；处理 onversionchange 以关闭旧连接。
 * 同版本空库不会触发 upgrade，此时先删除再重开。
 *
 * @param recreating 是否处于重建流程（避免无限递归）。
 * @returns Promise<IDBDatabase>。
 */
function openDb(recreating = false): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB 不可用'))
  }
  if (dbPromise && !recreating) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      ensureObjectStore(req.result)
    }

    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        db.close()
        resetDbPromise()
      }

      if (db.objectStoreNames.contains(STORE_NAME)) {
        resolve(db)
        return
      }

      // 同版本空库不会触发 upgrade，删除后重开
      db.close()
      resetDbPromise()
      deleteDatabase()
        .then(() => openDb(true))
        .then(resolve)
        .catch((e) => {
          // 删除失败（如被其他标签页阻塞超时）后重置 dbPromise，避免后续读写永久复用失败态
          resetDbPromise()
          reject(e)
        })
    }

    req.onerror = () => {
      resetDbPromise()
      reject(req.error)
    }
  })

  return dbPromise
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function withStore<T>(
  mode: 'readonly' | 'readwrite',
  fn: (store: IDBObjectStore) => T | Promise<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const store = tx.objectStore(STORE_NAME)
        Promise.resolve(fn(store))
          .then((result) => {
            tx.oncomplete = () => resolve(result)
            tx.onerror = () => reject(tx.error)
            tx.onabort = () => reject(tx.error || new Error('IndexedDB 事务已中止'))
          })
          .catch((e) => {
            try {
              tx.abort()
            } catch {
              /* 忽略 */
            }
            reject(e)
          })
      }),
  )
}

/**
 * 读取缓存快照；过期或缺失返回 null。
 *
 * 按域分片读取并合并重建全量实体。
 *
 * @param cacheKey 缓存隔离键。
 * @param maxAgeMs 最大过期时长（毫秒），默认取配置值。
 * @returns 缓存快照；过期或缺失时返回 null。
 */
export async function loadEntityCache(
  cacheKey: string,
  maxAgeMs: number = getEntityCacheMaxAgeMs(),
): Promise<EntityCacheSnapshot | null> {
  if (!cacheKey || !isEntityCacheEnabled()) return null
  try {
    const snapshot = await withStore('readonly', async (store) => {
      const allKeys = (await idbRequest(store.getAllKeys())) as IDBValidKey[]
      const shardKeys = allKeys.filter(
        (k): k is string => typeof k === 'string' && k.startsWith(cacheKey + SHARD_SEP),
      )
      if (!shardKeys.length) return undefined
      // 合并全部分片重建全量实体（分片间实体互不重叠，直接按 entity_id 覆盖合并）
      const entityMap = new Map<string, HaEntityState>()
      let latestSavedAt = 0
      for (let i = 0; i < shardKeys.length; i++) {
        const rec = (await idbRequest(store.get(shardKeys[i]))) as EntityCacheSnapshot | undefined
        if (rec?.savedAt && rec.savedAt > latestSavedAt) latestSavedAt = rec.savedAt
        const list = rec?.entities
        if (!list?.length) continue
        for (let j = 0; j < list.length; j++) {
          const e = list[j]
          if (e?.entity_id) entityMap.set(e.entity_id, e)
        }
      }
      return { entities: [...entityMap.values()], savedAt: latestSavedAt }
    })
    if (!snapshot?.entities?.length || !snapshot.savedAt) return null
    if (maxAgeMs > 0 && Date.now() - snapshot.savedAt > maxAgeMs) {
      await clearEntityCache(cacheKey)
      return null
    }
    return { entities: snapshot.entities, savedAt: snapshot.savedAt }
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e)
    logger.warn('读取实体 IndexedDB 缓存失败', detail)
    return null
  }
}

/**
 * 分片增量写入 IndexedDB（Task 23：IndexedDB 分片）。
 * 仅重写传入的分片（按域分组），未涉及的域分片保持不变，
 * 显著降低高频状态推送下的 IDB 写入量（由原先 30s 整库重写降为只写变更域）。
 *
 * 约定：分片值为空数组时删除该分片（该域实体已全部移除）。
 *
 * @param cacheKey 缓存隔离键。
 * @param shards 按域分组的实体表（domain -> 该域当前全量实体）。
 * @returns 写入成功返回 true，否则返回 false。
 */
export async function saveEntityCacheShards(
  cacheKey: string,
  shards: Record<string, HaEntityState[]>,
): Promise<boolean> {
  if (!cacheKey || !isEntityCacheEnabled()) return false
  const domains = Object.keys(shards)
  if (!domains.length) return false
  try {
    const now = Date.now()
    await withStore('readwrite', async (store) => {
      for (let i = 0; i < domains.length; i++) {
        const shardKey = buildShardKey(cacheKey, domains[i])
        const list = shards[domains[i]] || []
        if (!list.length) {
          // 空分片：删除残留记录（该域实体已全部移除）
          await idbRequest(store.delete(shardKey))
        } else {
          await idbRequest(store.put({ savedAt: now, entities: list }, shardKey))
        }
      }
    })
    return true
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e)
    logger.warn('写入实体 IndexedDB 分片缓存失败', detail)
    return false
  }
}

/**
 * 删除指定键的快照（含其全部分片），或未指定键时清空全部快照。
 *
 * @param cacheKey 可选的缓存隔离键；省略时清空全部。
 * @returns 清除成功返回 true，否则返回 false。
 */
export async function clearEntityCache(cacheKey?: string): Promise<boolean> {
  try {
    await withStore('readwrite', async (store) => {
      if (cacheKey) {
        // 删除该缓存键下的全部分片
        const allKeys = (await idbRequest(store.getAllKeys())) as IDBValidKey[]
        for (let i = 0; i < allKeys.length; i++) {
          const k = allKeys[i]
          if (typeof k === 'string' && k.startsWith(cacheKey + SHARD_SEP)) {
            await idbRequest(store.delete(k))
          }
        }
      } else {
        await idbRequest(store.clear())
      }
    })
    return true
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e)
    logger.warn('清除实体 IndexedDB 缓存失败', detail)
    return false
  }
}
