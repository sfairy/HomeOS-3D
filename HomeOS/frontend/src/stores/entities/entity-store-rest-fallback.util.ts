/**
 * @file entity-store-rest-fallback.util.ts
 * @module frontend/src/stores
 * 实体 store REST 回退与增量同步（从 entity-store-support.ts 拆回）。
 *
 * 职责：
 * - fetchAllEntitiesViaRest：分页拉取全量实体（cursor 翻页，最多 50 轮保护）
 * - fetchEntitiesFallback：WS 同步失败时通过 REST 全量回退；复用在途 Promise 避免并发拉取
 * - fetchEntitiesChangedSince：REST 增量同步（页面恢复可见时拉取离线期间变更）
 * - bindVisibilityFallbackHandler：注册页面可见性回调，恢复可见时优先增量同步，失败则全量回退
 *
 * 关键依赖：
 * - @/services/api/entities：fetchEntitiesChanged（增量同步接口）
 * - @/utils/entity/state-listener：setStateListenerVisibilityHandler（注册可见性回调）
 * - @/utils/entity/sync-failure.util：handleEntityFallbackFailure（统一失败处理 + stale 标记）
 *
 * 实现说明：
 * - restFetchInFlight 用于并发去重：在途期间复用同一 Promise，避免重复发请求
 * - 增量同步通过 socketTrack.lastSocketEventAt / lastEventId 作为 since 参数
 */
import type { EntityRestFallbackDeps, HaEntityState } from '@/types/entity-store'
import { setStateListenerVisibilityHandler } from '@/utils/entity/state-listener'
import { handleEntityFallbackFailure } from '@/utils/entity/sync-failure.util'
import { fetchEntitiesChanged } from '@/services/api/entities'

// ── entity-store-rest-fallback.util ──
/**
 * 实体 store REST 回退与增量同步（从 entities.store 抽离）
 * @param deps 依赖注入对象（apiClient / connected / 各种 ref / shouldAcceptEntitySnapshot 等）
 * @returns fetchAllEntitiesViaRest / fetchEntitiesFallback / fetchEntitiesChangedSince / bindVisibilityFallbackHandler
 */
export function createEntityRestFallbackHelpers(deps: EntityRestFallbackDeps) {
  // 当前在途的 REST 全量拉取 Promise（并发去重）
  let restFetchInFlight: Promise<HaEntityState[]> | null = null

  /**
   * 通过 REST 分页拉取全量实体。
   * - 在途期间复用同一 Promise，避免重复请求
   * - cursor 翻页，最多 50 轮保护（防止 nextCursor 异常导致死循环）
   * @returns 合并后的全量实体列表
   */
  async function fetchAllEntitiesViaRest(): Promise<HaEntityState[]> {
    if (restFetchInFlight) return restFetchInFlight

    restFetchInFlight = (async () => {
      const batchSize = deps.initStatesBatchSize()
      const merged: HaEntityState[] = []
      let cursor: string | undefined = undefined
      for (let guard = 0; guard < 50; guard++) {
        const params: Record<string, unknown> = { limit: batchSize }
        if (cursor) params.cursor = cursor
        const { data } = await deps.apiClient.get('/entities', { params, timeout: 60000 })
        const batch = data?.entities as HaEntityState[] | undefined
        if (!batch?.length) break
        for (let i = 0; i < batch.length; i++) merged.push(batch[i])
        if (!data?.nextCursor) break
        cursor = String(data.nextCursor)
      }
      return merged
    })().finally(() => {
      restFetchInFlight = null
    })

    return restFetchInFlight
  }

  /**
   * REST 全量回退（WS 同步失败 / 页面恢复可见 fallback 路径）。
   * - 未登录时直接跳过
   * - 经 shouldAcceptEntitySnapshot 决策是否接受（防缩小快照污染）
   * - 接受后调用 initStates 写入、清除 stale、标记 connected
   * - 失败时调用 handleEntityFallbackFailure 统一处理（含 stale 标记）
   * @param reason 触发原因（用于日志）
   * @param options quiet / force
   * @returns 是否回退成功（totalCount > 0）
   */
  async function fetchEntitiesFallback(
    reason: string,
    { quiet = false, force = false }: { quiet?: boolean; force?: boolean } = {},
  ): Promise<boolean> {
    if (deps.isAuthenticated && !deps.isAuthenticated()) {
      if (!quiet) deps.logger.debug(`跳过 REST 实体回退(未登录): ${reason}`)
      return false
    }
    try {
      const list = await fetchAllEntitiesViaRest()
      if (list?.length) {
        const incomingVisible = deps.countVisibleEntities(list)
        if (!deps.shouldAcceptEntitySnapshot(incomingVisible, { force, quiet, reason })) {
          return deps.totalCount.value > 0
        }
        deps.initStates(list, { force, reason, quiet: false, fromCache: false })
        deps.entitiesStale.value = false
        deps.setConnected(true)
        if (!quiet) {
          deps.logger.info(`REST 回退加载 ${deps.totalCount.value} 个实体(${reason})`)
        }
        return deps.totalCount.value > 0
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      deps.logger.warn('REST 实体回退失败', msg)
      handleEntityFallbackFailure(reason, e, { entitiesStale: deps.entitiesStale })
    }
    return false
  }

  /**
   * REST 增量同步：拉取离线期间的实体变更。
   * - 未连接时直接返回 false
   * - 通过 socketTrack.lastSocketEventAt / lastEventId 作为 since 参数
   * - 成功后逐条 ingestEntitySnapshot（含可见性过滤），并更新 socketTrack
   * @returns 是否成功（失败时由调用方决定是否走全量回退）
   */
  async function fetchEntitiesChangedSince(): Promise<boolean> {
    if (!deps.connected.value) return false
    try {
      const { data } = await fetchEntitiesChanged({
        since: deps.socketTrack.lastSocketEventAt || Date.now() - 60_000,
        lastEventId: deps.socketTrack.lastEventId || 0,
      })
      const list = (data?.entities || []) as HaEntityState[]
      if (list.length) {
        for (let i = 0; i < list.length; i++) {
          const ent = list[i]
          if (ent?.entity_id && deps.entityVisible(ent.entity_id)) {
            deps.ingestEntitySnapshot(ent)
          }
        }
        if (data.lastEventId) deps.socketTrack.lastEventId = Number(data.lastEventId)
        deps.socketTrack.lastSocketEventAt = Date.now()
        deps.scheduleRebuildDerived()
        deps.schedulePersistEntityCache()
        deps.logger.info(`REST 增量同步 ${list.length} 条实体(页面恢复可见)`)
      }
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      deps.logger.debug('REST 增量同步失败', msg)
      return false
    }
  }

  /**
   * 注册页面可见性回调：恢复可见时优先增量同步，失败则全量回退。
   * - 未登录时直接跳过
   * - 先 ensureWsConnected，若已连接则尝试增量同步
   * - 增量同步失败时调用 fetchEntitiesFallback（quiet 模式）
   */
  function bindVisibilityFallbackHandler(): void {
    setStateListenerVisibilityHandler(async () => {
      if (deps.isAuthenticated && !deps.isAuthenticated()) return
      deps.ensureWsConnected?.()
      if (deps.connected.value) {
        const ok = await fetchEntitiesChangedSince()
        if (ok) return
      }
      void fetchEntitiesFallback('页面恢复可见', { quiet: true })
    })
  }

  return {
    fetchAllEntitiesViaRest,
    fetchEntitiesFallback,
    fetchEntitiesChangedSince,
    bindVisibilityFallbackHandler,
  }
}
