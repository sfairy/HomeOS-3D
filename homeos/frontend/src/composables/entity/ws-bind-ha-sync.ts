/**
 * @file ws-bind-ha-sync.ts
 * @module frontend/src/composables/entity
 */
/** entity WebSocket：HA 状态 / 全量同步 / 增量补发 */
import type { EntitySocketHandlerContext, EntitySocketSyncState, HaEntityState } from '@/shared/types/entity-store'
import { handleEntityFallbackFailure } from '@/shared/entity/utils/sync-failure.util'
import {
  clearEntitySocketSyncTimers,
  scheduleIncrementalEnd,
  waitForPendingChunkApplies,
} from '@/shared/entity/utils/ws-sync'
import { WS_CLIENT_EVENTS } from '@homeos/shared'
import type { Socket } from 'socket.io-client'

function filterDeltaBeforeFullSync(
  changes: Record<string, unknown>[],
  sync: EntitySocketSyncState,
  logger: EntitySocketHandlerContext['logger'],
): Record<string, unknown>[] {
  if (sync.initialStatesReceived || !changes.length) return changes
  const full: Record<string, unknown>[] = []
  let dropped = 0
  for (const change of changes) {
    if ((change as { _delta?: boolean })?._delta) dropped++
    else full.push(change)
  }
  if (dropped > 0) {
    // 设计内的自愈：这些 delta 的变更时刻不晚于随后到达的全量快照，快照会覆盖其效果，
    // 丢弃是安全的。后端侧已避免向未就绪客户端广播增量（见 gateway._baseline_ready），
    // 此处仅作兜底，降级 debug 以免产生误导性告警。
    logger.debug?.(`全量同步完成前丢弃 ${dropped} 条 delta 增量(本地缺少实体基线)`)
  }
  return full
}

export function bindEntitySocketHaSync(
  socket: Socket,
  ctx: EntitySocketHandlerContext,
  sync: EntitySocketSyncState,
): void {
  const {
    logger,
    refs,
    entities,
    track,
    actions,
  } = ctx

  const clearSyncTimers = () => clearEntitySocketSyncTimers(sync)

  /** WS 降级统一处理：REST 回退成功则标记已收到全量，失败走 sync-failure 兜底 */
  const runFallbackAndMarkSynced = (reason: string) =>
    actions
      .fetchEntitiesFallback(reason, { force: true })
      .then((ok: boolean) => {
        if (ok) sync.initialStatesReceived = true
      })
      .catch((e: unknown) => handleEntityFallbackFailure(reason, e, refs))

  socket.on(WS_CLIENT_EVENTS.HA_STATUS, (data: { status?: string }) => {
    logger.info('HA 连接状态:', data.status)
    const status = data.status
    if (status === 'connected' || status === 'disconnected' || status === 'reconnecting') {
      refs.haStatus.value = status
    }
    if (status === 'connected') {
      actions.clearHaDisconnectDebounce()
      actions.setConnected(true)
      refs.entitiesStale.value = false
      if (refs.totalCount.value > 0) {
        refs.loading.value = false
      }
    } else if (status === 'disconnected') {
      actions.setConnected(false)
      actions.startHaDisconnectDebounce()
      // 推送可能被 socket 抖动吞掉：降级持续时补一次主动核对，避免横幅永久卡在重连
      actions.scheduleHaStatusProbe?.()
    } else if (status === 'reconnecting') {
      refs.reconnecting.value = true
      actions.setConnected(false)
      actions.scheduleHaStatusProbe?.()
    }
  })

  socket.on(WS_CLIENT_EVENTS.ENTITIES_STALE, () => {
    refs.entitiesStale.value = true
    logger.warn('实体数据已标记为陈旧,等待 HA 重连同步...')
    actions.onEntitiesStale?.()
  })

  let lastResyncAt = 0
  socket.on(WS_CLIENT_EVENTS.RESYNC_SUGGESTED, (data: { reason?: string }) => {
    // 节流：至少间隔 30s，避免极端情况下的重同步风暴
    const now = Date.now()
    if (now - lastResyncAt < 30_000) return
    lastResyncAt = now
    logger.warn('服务端建议重同步:', data?.reason || 'backpressure')
    refs.entitiesStale.value = true
    const rolled = actions.rollbackAllOptimistic?.() ?? 0
    if (rolled > 0) logger.info(`背压重同步前已回滚 ${rolled} 条乐观更新`)
    // 优先增量 / 服务端 resync；冷却内不全量连环 REST（由 fetchEntitiesFallback 内部去重）。
    void (async () => {
      const soft = await actions.requestSoftResync?.('服务端背压建议重同步')
      if (soft) return
      void actions.fetchEntitiesFallback?.('服务端背压建议重同步', { force: true })
    })()
  })

  socket.on(
    WS_CLIENT_EVENTS.HA_QUEUE_DROPPED,
    (data: { total?: number; timestamp?: string; count?: number; reason?: string }) => {
      const total = Number(data?.total ?? 0)
      if (refs.haQueueDroppedTotal) refs.haQueueDroppedTotal.value = total
      if (refs.lastQueueDropAt)
        refs.lastQueueDropAt.value = data?.timestamp || new Date().toISOString()
      const dropped = data?.count ?? 1
      logger.warn(`HA 命令队列丢弃: ${dropped} 条 (${data?.reason || '未知'})`)
      void actions.appNotify?.(
        `有 ${dropped} 条控制指令未能下发（队列已满或超时），请检查 HA 连接后重试`,
        'warning',
      )
      // 离线队列丢弃后乐观 UI 不再可信：回滚全部预测态并标陈旧触发 REST 对齐
      refs.entitiesStale.value = true
      const rolled = actions.rollbackAllOptimistic?.() ?? 0
      if (rolled > 0) logger.info(`队列丢弃后已回滚 ${rolled} 条乐观更新`)
      void actions.fetchEntitiesFallback?.('HA 命令队列丢弃', { force: true, quiet: true })
    },
  )

  socket.on(WS_CLIENT_EVENTS.INITIAL_STATES, (data: { entities?: HaEntityState[]; count?: number }) => {
    sync.initialStatesReceived = true
    clearSyncTimers()
    if (sync.loadingFallbackTimer) clearTimeout(sync.loadingFallbackTimer)
    const count = data.entities?.length ?? data.count ?? 0
    logger.info(`已通过 WebSocket 同步 ${count} 个实体`)
    refs.entitiesStale.value = false
    refs.entitiesCacheHydrated.value = false
    actions.clearHaDisconnectDebounce()
    actions.setConnected(true)
    actions.initStates(data.entities || [], { force: true, reason: 'WebSocket initial_states' })
    refs.loading.value = false
  })

  socket.on(WS_CLIENT_EVENTS.INITIAL_STATES_BEGIN, (data: { count?: number }) => {
    sync.initialStatesReceived = true
    clearSyncTimers()
    sync.chunkedEntities = null
    sync.incrementalExpected = data?.count ?? 0
    sync.incrementalReceivedCount = 0
    sync.pendingChunkApplies = 0
    sync.incrementalEndScheduled = false
    sync.incrementalToken =
      actions.beginIncrementalInitialStates?.(sync.incrementalExpected) ?? null
    logger.info(`开始分块同步 initial_states(共 ${sync.incrementalExpected || '?'} 个实体)`)
  })

  socket.on(
    WS_CLIENT_EVENTS.INITIAL_STATES_CHUNK,
    (data: { entities?: HaEntityState[]; count?: number; total?: number }) => {
      const list = data?.entities
      if (!Array.isArray(list) || !list.length) return
      // 后端 chunk.count = 本块大小，total = 全量实体数；勿用 count 覆盖 expected
      if (data?.total) sync.incrementalExpected = data.total
      if (!sync.incrementalToken && actions.beginIncrementalInitialStates) {
        sync.incrementalToken = actions.beginIncrementalInitialStates(sync.incrementalExpected)
      }
      sync.incrementalReceivedCount += list.length
      const token = sync.incrementalToken
      const expected = sync.incrementalExpected
      sync.pendingChunkApplies++
      const apply = () => {
        try {
          actions.mergeInitialStatesChunk?.(list, token, expected)
        } finally {
          sync.pendingChunkApplies = Math.max(0, sync.pendingChunkApplies - 1)
        }
      }
      if (list.length > 80 && typeof requestIdleCallback === 'function') {
        requestIdleCallback(apply, { timeout: 48 })
      } else {
        apply()
      }
    },
  )

  socket.on(WS_CLIENT_EVENTS.INITIAL_STATES_END, (data: { count?: number }) => {
    clearSyncTimers()
    if (sync.loadingFallbackTimer) clearTimeout(sync.loadingFallbackTimer)
    const expected = data?.count ?? sync.incrementalExpected ?? 0

    if (sync.incrementalEndScheduled && sync.incrementalToken == null) {
      logger.debug?.('忽略重复的 initial_states_end(本批已完成)')
      return
    }

    if (sync.incrementalToken != null && actions.finishIncrementalInitialStates) {
      const endSnapshot = scheduleIncrementalEnd(sync)
      if (!endSnapshot) {
        logger.debug?.('忽略重复的 initial_states_end(本批已在收尾)')
        return
      }
      const finishIncremental = actions.finishIncrementalInitialStates
      waitForPendingChunkApplies(sync, () => {
        if (endSnapshot.token !== sync.incrementalToken) return
        const received = Math.max(endSnapshot.received, sync.incrementalReceivedCount)
        const visible = refs.totalCount.value
        if (expected > 0 && received < expected * 0.9) {
          if (sync.pendingChunkApplies > 0) {
            logger.warn(
              `分块渐进同步 apply 超时(仍 pending ${sync.pendingChunkApplies}),改用 REST 回退`,
            )
          } else {
            logger.warn(`分块渐进同步不完整 ${received}/${expected},改用 REST 回退`)
          }
          sync.incrementalToken = null
          sync.incrementalExpected = 0
          sync.incrementalReceivedCount = 0
          sync.pendingChunkApplies = 0
          runFallbackAndMarkSynced('WebSocket 分块渐进不完整')
          refs.loading.value = false
          return
        }
        finishIncremental(endSnapshot.token, expected)
        sync.incrementalToken = null
        sync.incrementalExpected = 0
        sync.incrementalReceivedCount = 0
        sync.pendingChunkApplies = 0
        actions.clearHaDisconnectDebounce()
        actions.setConnected(true)
        refs.loading.value = false
        if (expected > 0 && visible > 0 && visible < expected * 0.9 && received >= expected * 0.9) {
          logger.debug?.(
            `分块同步已收齐 ${received}/${expected}，可见实体 ${visible}（权限/域过滤）`,
          )
        }
      })
      return
    }

    const list = sync.chunkedEntities || []
    sync.chunkedEntities = null
    const count = list.length || expected || 0
    if (expected > 0 && list.length > 0 && list.length < expected * 0.9) {
      logger.warn(`分块同步不完整 ${list.length}/${expected},改用 REST 回退`)
      runFallbackAndMarkSynced('WebSocket 分块不完整')
      refs.loading.value = false
      return
    }
    logger.info(`已通过 WebSocket 分块同步 ${count} 个实体`)
    refs.entitiesStale.value = false
    refs.entitiesCacheHydrated.value = false
    actions.clearHaDisconnectDebounce()
    actions.setConnected(true)
    actions.initStates(list, { force: true, reason: 'WebSocket initial_states_end' })
    refs.loading.value = false
  })

  socket.on(WS_CLIENT_EVENTS.SYNC_ERROR, (data: { message?: string; code?: string }) => {
    sync.chunkedEntities = null
    logger.warn('WebSocket 全量同步失败,将使用 REST 回退', data?.message || data?.code)
    runFallbackAndMarkSynced('WebSocket sync_error')
  })

  socket.on(
    WS_CLIENT_EVENTS.STATE_REPLAY,
    (data: {
      changes?: Record<string, unknown>[]
      entities?: HaEntityState[]
      lastEventId?: number
    }) => {
      const changes = data?.changes
      if (Array.isArray(changes) && changes.length) {
        // baseline 保护：与 state_changed_batch 一致，全量同步完成前丢弃 delta 条目
        const applicable = filterDeltaBeforeFullSync(changes, sync, logger)
        if (applicable.length) {
          actions.updateStatesBatch(applicable)
        }
        if (data?.lastEventId) track.lastEventId = data.lastEventId
        track.lastSocketEventAt = Date.now()
        logger.info(`WS 断线补发 ${applicable.length} 条增量状态(delta)`)
        return
      }

      const list = data?.entities || []
      if (list.length) {
        const changes = list
          .filter((ent): ent is typeof ent & { entity_id: string } => {
            const eid = ent?.entity_id
            return typeof eid === 'string' && eid.length > 0 && actions.entityVisible(eid)
          })
          .map((ent) => ({
            entity_id: ent.entity_id,
            new_state: ent,
            old_state: entities[ent.entity_id] ?? null,
          }))
        if (changes.length) {
          void actions.updateStatesBatch(changes)
        }
        if (data?.lastEventId) track.lastEventId = data.lastEventId
        track.lastSocketEventAt = Date.now()
        logger.info(`WS 断线补发 ${changes.length} 条实体状态`)
      }
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.STATE_CHANGED_BATCH,
    (data: { lastEventId?: number; changes?: Record<string, unknown>[] }) => {
      track.lastSocketEventAt = Date.now()
      if (data?.lastEventId) track.lastEventId = data.lastEventId
      const changes = data?.changes || []
      if (changes.length) {
        // baseline 保护：全量同步完成前丢弃 delta，避免 merge 到残缺基线上产生残缺实体
        const applicable = filterDeltaBeforeFullSync(changes, sync, logger)
        if (!applicable.length) return
        refs.entitiesStale.value = false
        actions.updateStatesBatch(applicable)
      }
    },
  )
}
