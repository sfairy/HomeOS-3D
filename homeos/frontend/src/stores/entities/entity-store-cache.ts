/**
 * IndexedDB 实体缓存读写（从 entities.store 抽离）
 *
 * 职责：
 * - markEntityCacheDirty：标记脏实体（按 entity_id 增量收集）
 * - schedulePersistEntityCache：调度持久化（requestIdleCallback 优先，setTimeout 兜底）
 *   含 30s 最小写入间隔节流，防止高频状态推送导致 IDB 写放大
 * - persistEntityCacheNow：立即持久化（页面隐藏 / 即将卸载时强制调用）
 *   按 dirty 占比选择「增量分片写」或「全量分片写」
 * - hydrateFromEntityCache：从 IDB 恢复到内存，含懒加载分流（priority 立即 + deferred idle 补全）
 * - cancelPersistCacheTimer / isPersistCacheDirty：定时器与脏标志管理
 *
 * 关键依赖：
 * - @/utils/entity/idb-cache：IDB 分片读写、缓存 key 构造、特性开关
 * - @/utils/entity/sync-priority.util：按布局配置对实体做优先级分流
 * - @homeos/shared：getEntityDomain（按域分组分片）
 *
 * 实现说明：
 * - 用脏实体占比 0.8 作为「增量 / 全量」分片写入切换阈值
 * - 乐观态实体（_optimistic=true）不写入缓存
 */
import { toRaw, type Ref } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import {
  buildEntityCacheKey,
  clearEntityCache,
  getEntityCacheSaveDebounceMs,
  isEntityCacheEnabled,
  loadEntityCache,
  saveEntityCacheShards,
} from '@/utils/entity/idb-cache'
import { partitionEntitiesForCacheHydrate } from '@/utils/entity/sync-priority.util'
import type { EntitiesMap, HaEntityState } from '@/types/entity-store'
import type { UILayoutConfig } from '@/types/layout'

/** 懒加载最小实体数：缓存总数 ≥ 此值且 deferred 非空时启用懒加载分流 */
const CACHE_LAZY_HYDRATE_MIN = 400
/** 全量分片写入阈值：dirty 实体占比 ≥ 该值时改为整库全量分片写入（否则只写有变更的域分片） */
const FULL_SNAPSHOT_DIRTY_RATIO = 0.8
/** 缓存持久化最小写入间隔（毫秒）：防止高频状态推送导致 IDB 频繁写放大 */
const MIN_PERSIST_INTERVAL_MS = 30_000

interface EntityCacheInitOptions {
  fromCache?: boolean
  force?: boolean
  deferredRemainder?: HaEntityState[]
}

interface EntityCacheDeps {
  entities: EntitiesMap
  entitiesCacheHydrated: Ref<boolean>
  entitiesCacheSavedAt: Ref<number | null>
  currentEntityCacheKey: () => string
  initStates: (list: HaEntityState[], opts?: EntityCacheInitOptions) => void
  getLayoutConfig?: () => UILayoutConfig | undefined
  logger: {
    debug: (message: string, ...args: unknown[]) => void
    info: (message: string, ...args: unknown[]) => void
  }
}

/** 持久化定时器句柄：null 表示无；-1 表示使用 requestIdleCallback 占位 */
type PersistTimer = ReturnType<typeof setTimeout> | null | -1

/**
 * 创建实体缓存读写助手集合
 * @param deps 依赖注入对象（entities / 当前缓存 key / initStates / 布局配置 / logger）
 * @returns 持久化、读取、定时器与脏标志管理函数
 */
export function createEntityCacheHelpers(deps: EntityCacheDeps) {
  // 持久化定时器句柄
  let persistCacheTimer: PersistTimer = null
  // 缓存脏标志（true 表示有待写入的变更）
  let persistCacheDirty = false
  // 脏实体 ID 集合（增量分片写入路径使用）
  let dirtyEntityIds = new Set<string>()
  /** 上次缓存持久化成功时间戳，用于最小写入间隔节流（0 表示尚未写入过） */
  let lastPersistAt = 0

  /** 标记指定实体为脏（state_changed 推送时调用） */
  function markEntityCacheDirty(entityId: string) {
    if (entityId) dirtyEntityIds.add(entityId)
    persistCacheDirty = true
  }

  /**
   * 收集本次需持久化的实体数据（按域分组）。
   * 返回 null 表示无数据可写。
   * - 增量路径：dirty 实体占比低于阈值时，仅收集 dirty 实体所属域的当前全量实体，
   *   实现「只写有变更的分片」，显著降低 IDB 写入量；
   *   dirty 域在内存中已无实体时写入空数组，由分片层删除残留记录（保证删除语义正确）。
   * - 全量路径：dirty 占比达到阈值说明几乎全量变化，直接整库按域分组覆盖写更优、语义更一致。
   */
  function collectEntitiesForPersist(): Record<string, HaEntityState[]> | null {
    const raw = toRaw(deps.entities)
    const totalKeys = Object.keys(raw).length
    const dirtyRatio = totalKeys ? dirtyEntityIds.size / totalKeys : 0
    if (dirtyEntityIds.size > 0 && dirtyRatio < FULL_SNAPSHOT_DIRTY_RATIO) {
      const byDomain: Record<string, HaEntityState[]> = {}
      const dirtyDomains = new Set<string>()
      for (const id of dirtyEntityIds) {
        const d = getEntityDomain(id)
        if (d) dirtyDomains.add(d)
      }
      for (const key in raw) {
        const e = raw[key]
        if (!e || e._optimistic) continue
        const domain = getEntityDomain(key)
        if (!dirtyDomains.has(domain)) continue
        ;(byDomain[domain] ??= []).push(e)
      }
      // dirty 域中内存已无实体的域：写入空数组以删除残留分片
      for (const d of dirtyDomains) {
        if (byDomain[d] === undefined) byDomain[d] = []
      }
      return byDomain
    }
    // 全量路径：整库按域分组
    const byDomain: Record<string, HaEntityState[]> = {}
    for (const key in raw) {
      const e = raw[key]
      if (!e || e._optimistic) continue
      const domain = getEntityDomain(key)
      ;(byDomain[domain] ??= []).push(e)
    }
    return Object.keys(byDomain).length ? byDomain : null
  }

  /**
   * 立即持久化实体缓存到 IDB。
   * 失败时仅记录调试日志，不抛出异常（缓存写入失败不阻塞主流程）。
   * 成功后清空 dirtyEntityIds 并更新 entitiesCacheSavedAt / lastPersistAt。
   */
  async function persistEntityCacheNow() {
    if (!isEntityCacheEnabled()) return
    try {
      const byDomain = collectEntitiesForPersist()
      if (!byDomain) return
      // 分片增量写入：仅重写有变更的域分片（或全量路径下重写全部分片）
      const ok = await saveEntityCacheShards(deps.currentEntityCacheKey(), byDomain)
      if (ok) {
        deps.entitiesCacheSavedAt.value = Date.now()
        lastPersistAt = Date.now()
        dirtyEntityIds.clear()
      }
    } catch (e) {
      const err = e as { message?: string }
      deps.logger.debug('实体缓存写入失败', err?.message || e)
    }
  }

  /** 取消挂起的持久化定时器并重置脏标志（重连 / 清空场景调用） */
  function cancelPersistCacheTimer() {
    if (persistCacheTimer && persistCacheTimer !== -1) {
      clearTimeout(persistCacheTimer)
    }
    persistCacheTimer = null
    persistCacheDirty = false
  }

  /**
   * 调度一次持久化（30s 最小间隔节流 + requestIdleCallback 优先）。
   * - 已挂起定时器时直接返回（合并多次推送为一次写入）
   * - requestIdleCallback 不可用时回退到 setTimeout + debounce
   * - 距上次成功写入不足 30s 时延后重试，避免高频写
   */
  function schedulePersistEntityCache() {
    if (!isEntityCacheEnabled()) return
    persistCacheDirty = true
    if (persistCacheTimer) return
    const run = () => {
      persistCacheTimer = null
      if (!persistCacheDirty) return
      // 最小写入间隔节流：距上次成功写入不足 MIN_PERSIST_INTERVAL_MS 时延后重试
      // （显式调用 persistEntityCacheNow 的路径不受此限制，如页面隐藏时的最终落盘）
      const remainingWait = lastPersistAt + MIN_PERSIST_INTERVAL_MS - Date.now()
      if (remainingWait > 0) {
        persistCacheTimer = setTimeout(run, remainingWait)
        return
      }
      persistCacheDirty = false
      persistEntityCacheNow().catch((e) => {
        const err = e as { message?: string }
        deps.logger.debug('实体缓存定时写入失败', err?.message || e)
      })
    }
    if (typeof requestIdleCallback === 'function') {
      persistCacheTimer = -1
      requestIdleCallback(run, { timeout: 2500 })
    } else {
      persistCacheTimer = setTimeout(run, getEntityCacheSaveDebounceMs())
    }
  }

  /**
   * 从 IDB 缓存恢复实体到内存。
   * - 缓存大小 ≥ CACHE_LAZY_HYDRATE_MIN 且 deferred 非空时启用懒加载分流：
   *   priority 立即 hydrate + deferred 通过 initStates 的 deferredRemainder 参数 idle 补全
   * - 否则一次性全量 hydrate
   * @returns 是否成功恢复（缓存未启用 / 无数据 / 异常时返回 false）
   */
  async function hydrateFromEntityCache(): Promise<boolean> {
    if (!isEntityCacheEnabled()) return false
    try {
      const snapshot = await loadEntityCache(deps.currentEntityCacheKey())
      if (!snapshot?.entities?.length) return false

      const layoutConfig = deps.getLayoutConfig?.()
      const { priority, deferred } = partitionEntitiesForCacheHydrate(
        snapshot.entities,
        layoutConfig,
      )
      const useLazy =
        deferred.length > 0 &&
        priority.length < snapshot.entities.length &&
        snapshot.entities.length >= CACHE_LAZY_HYDRATE_MIN

      if (useLazy) {
        deps.initStates(priority, { fromCache: true, force: true, deferredRemainder: deferred })
        deps.entitiesCacheSavedAt.value = snapshot.savedAt
        deps.logger.info(
          `IndexedDB 优先恢复 ${priority.length} 个实体,${deferred.length} 个 idle 补全`,
        )
        return true
      }

      deps.initStates(snapshot.entities, { fromCache: true })
      deps.entitiesCacheSavedAt.value = snapshot.savedAt
      deps.logger.info(`已从 IndexedDB 恢复 ${snapshot.entities.length} 个实体`)
      return true
    } catch (e) {
      const err = e as { message?: string }
      deps.logger.debug('实体缓存读取失败', err?.message || e)
      return false
    }
  }

  /** 当前是否有待写入的脏变更 */
  function isPersistCacheDirty() {
    return persistCacheDirty
  }

  return {
    buildEntityCacheKey,
    clearEntityCache,
    cancelPersistCacheTimer,
    persistEntityCacheNow,
    schedulePersistEntityCache,
    hydrateFromEntityCache,
    isPersistCacheDirty,
    markEntityCacheDirty,
  }
}
