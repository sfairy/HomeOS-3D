/** 实体 store REST 回退与增量同步（从 entity-store-support.ts 拆回）。 */
import type { EntityRestFallbackDeps, HaEntityState } from '@/shared/types/entity-store'
import { setStateListenerVisibilityHandler } from '@/shared/entity/utils/state-listener'
import { handleEntityFallbackFailure } from '@/shared/entity/utils/sync-failure.util'
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
   * - 优先 cursor 翻页；服务端在「未传 page 的页模式」响应里不含 nextCursor，
   *   此时按 total/totalPages 续翻，否则 706 个实体只会拿回第一页（400 条）导致
   *   REST 回退把实体表截断（灯光/离线计数错乱，直到 WS 全量快照或手动刷新才恢复）
   * - 最多 50 轮保护（防止 nextCursor / totalPages 异常导致死循环）
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
        else if (guard > 0) params.page = guard + 1
        const { data } = await deps.apiClient.get('/entities', { params, timeout: 60000 })
        const batch = data?.entities as HaEntityState[] | undefined
        if (!batch?.length) break
        for (let i = 0; i < batch.length; i++) merged.push(batch[i])
        if (data?.nextCursor) {
          cursor = String(data.nextCursor)
          continue
        }
        // 页模式（无 nextCursor）：按 total 续翻，避免只取到第一页
        const total = Number(data?.total ?? 0)
        const totalPages = Number(data?.totalPages ?? 1)
        if (total > 0 && merged.length < total && guard + 1 < totalPages) continue
        break
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
