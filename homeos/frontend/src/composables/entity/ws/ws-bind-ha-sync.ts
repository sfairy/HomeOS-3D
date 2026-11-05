/**
 * @file ws-bind-ha-sync.ts
 * @module frontend/src/composables/entity
 */
/** entity WebSocket：HA 状态 / 全量同步 / 增量补发 */
import type { EntitySocketHandlerContext, EntitySocketSyncState, HaEntityState } from '@/shared/types/entity-store'
import { handleEntityFallbackFailure } from '@/shared/entity/utils/sync-failure.util'
import {
  clearEntitySocketSyncTimers,
  incrementalBatchIncomplete,
  resetChunkBaselineTracking,
  scheduleIncrementalEnd,
  waitForPendingChunkApplies,
} from '@/shared/entity/utils/ws-sync'
import { WS_CLIENT_EVENTS } from '@homeos/shared'
import type { Socket } from 'socket.io-client'

/** 暂存 delta 的上限：异常流量下宁可丢掉一部分（下次全量兜底），也不让内存无界增长。 */
const MAX_PENDING_PRE_CHUNK_DELTAS = 2000

/**
 * 全量同步完成前的增量过滤。
 *
 * 只丢弃「本地完全没有该实体」的 delta：这种情况下合并结果只能是
 * ``{state}`` + 少量属性，属于残缺实体，等全量快照更安全。
 * 本地已有该实体（重连前的基线 / IndexedDB 缓存 hydrate）时必须照常应用 ——
 * 服务端在断线重连时只做 ``state_replay`` 增量回放，不会再发 ``initial_states``，
 * 若一律丢弃，实体状态会永久冻结在断线前的快照里（只有整包推送才偶尔落地），
 * 表现为「页面数据不再实时刷新，手动刷新才恢复正常」。
 *
 * 分块同步进行中（``INITIAL_STATES_BEGIN`` 之后、``INITIAL_STATES_END`` 之前）有第三种情况：
 * 实体基线就在**还没落地**的那几个 chunk 里。不能丢，也不能现在合并（会生成半实体），
 * 于是暂存到 ``pendingPreChunkDeltas``，等对应 chunk 落地后再合并。
 */
function filterDeltaBeforeFullSync(
  changes: Record<string, unknown>[],
  sync: EntitySocketSyncState,
  entities: Record<string, unknown>,
  logger: EntitySocketHandlerContext['logger'],
): Record<string, unknown>[] {
  if (sync.initialStatesReceived || !changes.length) return changes
  const chunkedEntityIds = sync.chunkedEntityIds
  const applicable: Record<string, unknown>[] = []
  let dropped = 0
  let buffered = 0
  for (const change of changes) {
    const item = change as { _delta?: boolean; entity_id?: string }
    if (!item?._delta) {
      applicable.push(change)
      continue
    }
    const entityId = String(item.entity_id || '')
    // 本地已有基线，或分块同步里该实体的 chunk 已经落地：delta 可安全合并
    if (entityId && (entities[entityId] || chunkedEntityIds?.has(entityId))) {
      applicable.push(change)
      continue
    }
    // 该实体属于本批分块、但基线还没到：暂存，等 chunk 落地后再合并（比丢弃更省一次整表）
    if (entityId && chunkedEntityIds) {
      const pending = (sync.pendingPreChunkDeltas ??= [])
      if (pending.length < MAX_PENDING_PRE_CHUNK_DELTAS) {
        pending.push(change)
        buffered++
        continue
      }
    }
    dropped++
  }
  if (dropped > 0) {
    // 后端侧已避免向未就绪客户端广播增量（见 gateway._baseline_ready），此处仅作兜底，
    // 降级 debug 以免产生误导性告警。
    logger.debug?.(`全量同步完成前丢弃 ${dropped} 条 delta 增量(本地缺少该实体基线)`)
  }
  if (buffered > 0) {
    logger.debug?.(`全量分块同步中暂存 ${buffered} 条 delta 增量(等对应 chunk 落地)`)
  }
  return applicable
}

export function bindEntitySocketHaSync(
  socket: Socket,
  ctx: EntitySocketHandlerContext,
  sync: EntitySocketSyncState,
): void {
  const { logger, refs, entities, track, actions } = ctx

  const clearSyncTimers = () => clearEntitySocketSyncTimers(sync)

  /**
   * 合并分块批次中因「基线还没到」而暂存的 delta。
   *
   * 只放行基线已经落地（或整批已结束）的条目，其余继续挂着 —— 现在合并会生成半实体。
   * 返回真正提交的条数。
   */
  const flushPendingPreChunkDeltas = (): number => {
    const pending = sync.pendingPreChunkDeltas
    if (!pending?.length) return 0
    if (sync.initialStatesReceived) {
      sync.pendingPreChunkDeltas = []
      actions.updateStatesBatch(pending)
      return pending.length
    }
    const chunkedEntityIds = sync.chunkedEntityIds
    if (!chunkedEntityIds?.size) return 0
    const ready: Record<string, unknown>[] = []
    const rest: Record<string, unknown>[] = []
    for (const change of pending) {
      const entityId = String((change as { entity_id?: string })?.entity_id || '')
      if (entityId && chunkedEntityIds.has(entityId)) ready.push(change)
      else rest.push(change)
    }
    sync.pendingPreChunkDeltas = rest
    if (ready.length) actions.updateStatesBatch(ready)
    return ready.length
  }

  /** 一轮全量同步结束（成功或降级）：解除基线门禁，并放行 / 丢弃暂存的 delta。 */
  const completeFullSync = (options: { flushPending: boolean }): void => {
    sync.initialStatesReceived = true
    if (options.flushPending) flushPendingPreChunkDeltas()
    else sync.pendingPreChunkDeltas = []
    resetChunkBaselineTracking(sync)
  }

  /** WS 降级统一处理：REST 回退成功则标记已收到全量，失败走 sync-failure 兜底 */
  const runFallbackAndMarkSynced = (reason: string) =>
    actions
      .fetchEntitiesFallback(reason, { force: true })
      .then((ok: boolean) => {
        // REST 整包快照是权威数据：暂存 delta 已被它覆盖或更旧，直接丢弃。
        if (ok) completeFullSync({ flushPending: false })
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
    // ``replay_truncated`` 的语义是「你的游标不可信」（环形缓冲已淘汰，或游标来自上一个
    // 进程）—— 增量必然有洞，只有整包快照能收敛。走软重同步会拿同一个坏游标再试一次。
    if (data?.reason === 'replay_truncated') {
      void actions.fetchEntitiesFallback?.('增量游标失效，强制全量', { force: true })
      return
    }
    // 其余（背压 / 增量过大）：优先增量 / 服务端 resync；冷却内不全量连环 REST
    // （由 fetchEntitiesFallback 内部去重）。
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
      if (refs.lastQueueDropAt) refs.lastQueueDropAt.value = data?.timestamp || new Date().toISOString()
      const dropped = data?.count ?? 1
      logger.warn(`HA 实时状态积压丢弃: ${dropped} 条 (${data?.reason || '未知'})`)
      // 语义：这条事件表示「状态推送积压，本端漏掉了一些**状态**更新」，
      // 不是「控制指令下发失败」。旧文案（「N 条控制指令未能下发，请重试」）会让用户
      // 在设备其实已经执行成功时重复操作；这里只需要把状态重新对齐。
      // 同理不做乐观态回滚：指令确实发出去了，回滚反而会把正确的结果抹掉。
      void actions.appNotify?.(`实时状态积压，已丢弃 ${dropped} 条更新，正在重新对齐实体状态`, 'warning')
      refs.entitiesStale.value = true
      // 优先增量对齐（服务端有 since 游标，代价很小），失败再退回整表。
      void (async () => {
        const soft = await actions.requestSoftResync?.('HA 状态队列积压')
        if (soft) return
        void actions.fetchEntitiesFallback?.('HA 状态队列积压', { force: true, quiet: true })
      })()
    },
  )

  socket.on(WS_CLIENT_EVENTS.INITIAL_STATES, (data: { entities?: HaEntityState[]; count?: number }) => {
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
    // 整包快照是权威数据：分块批次与暂存 delta 全部作废。
    completeFullSync({ flushPending: false })
  })

  socket.on(WS_CLIENT_EVENTS.INITIAL_STATES_BEGIN, (data: { count?: number }) => {
    // 注意：这里**不能**把 ``initialStatesReceived`` 置真。分块只是全量快照的切片，
    // 一个 chunk 都没落地之前本地还没有基线，置真会让紧随其后的 delta 直接合并成
    // 半实体（只有 state、没有属性），并且再没有任何推送会把它补全。
    clearSyncTimers()
    sync.incrementalExpected = data?.count ?? 0
    sync.incrementalReceivedCount = 0
    sync.pendingChunkApplies = 0
    sync.incrementalEndScheduled = false
    resetChunkBaselineTracking(sync)
    sync.incrementalToken = actions.beginIncrementalInitialStates?.(sync.incrementalExpected) ?? null
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
      // 先登记本块覆盖的实体 id：紧随其后的 delta 只要命中这里就能安全合并
      // （否则会被 filterDeltaBeforeFullSync 暂存到 chunk 落地之后）。
      const chunkedEntityIds = (sync.chunkedEntityIds ??= new Set<string>())
      for (const chunkEntity of list) {
        const chunkEntityId = String(chunkEntity?.entity_id || '')
        if (chunkEntityId) chunkedEntityIds.add(chunkEntityId)
      }
      sync.pendingChunkApplies++
      const apply = () => {
        try {
          actions.mergeInitialStatesChunk?.(list, token, expected)
          // chunk 落地后再放行之前暂存的 delta：此时基线已就绪，合并结果不会是半实体。
          flushPendingPreChunkDeltas()
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
        if (incrementalBatchIncomplete(expected, received)) {
          if (sync.pendingChunkApplies > 0) {
            logger.warn(`分块渐进同步 apply 超时(仍 pending ${sync.pendingChunkApplies}),改用 REST 回退`)
          } else {
            logger.warn(`分块渐进同步不完整 ${received}/${expected},改用 REST 回退`)
          }
          sync.incrementalToken = null
          sync.incrementalExpected = 0
          sync.incrementalReceivedCount = 0
          sync.pendingChunkApplies = 0
          // 回退到 REST 整包：暂存 delta 会被快照覆盖，先丢掉（成功后再解除门禁）。
          sync.pendingPreChunkDeltas = []
          resetChunkBaselineTracking(sync)
          runFallbackAndMarkSynced('WebSocket 分块渐进不完整')
          refs.loading.value = false
          return
        }
        finishIncremental(endSnapshot.token, expected)
        sync.incrementalToken = null
        sync.incrementalExpected = 0
        sync.incrementalReceivedCount = 0
        sync.pendingChunkApplies = 0
        // 整批收齐：暂存的 delta 现在都能安全合并（它们的基线已在上面落地）。
        completeFullSync({ flushPending: true })
        actions.clearHaDisconnectDebounce()
        actions.setConnected(true)
        refs.loading.value = false
        if (expected > 0 && visible > 0 && visible < expected * 0.9 && received >= expected * 0.9) {
          logger.debug?.(`分块同步已收齐 ${received}/${expected}，可见实体 ${visible}（权限/域过滤）`)
        }
      })
      return
    }

    // 没有增量批次可收尾（例如服务端只发了 initial_states_end）：按空批结束本次同步。
    // 分块实体一律走 mergeInitialStatesChunk 增量合并，这里不再保留整批缓冲。
    logger.info(`已通过 WebSocket 分块同步 ${expected} 个实体`)
    refs.entitiesStale.value = false
    refs.entitiesCacheHydrated.value = false
    actions.clearHaDisconnectDebounce()
    actions.setConnected(true)
    actions.initStates([], { force: true, reason: 'WebSocket initial_states_end' })
    refs.loading.value = false
    completeFullSync({ flushPending: true })
  })

  socket.on(
    WS_CLIENT_EVENTS.ENTITY_CATALOG_CHANGED,
    (data: { operation?: string; counts?: Record<string, number>; timestamp?: string }) => {
      const operation = String(data?.operation || 'updated')
      logger.info(`实体目录已变更(${operation})`, data?.counts || {})
      // 目录（有哪些实体 / 叫什么 / 属于哪个设备）与状态是两条数据流：
      // 只靠状态增量的话，新设备永远进不了选择器，删掉的实体也留在列表里。
      // 这里做一次轻量校准：优先增量（新实体会带新的 last_updated），失败再退回整表。
      void actions.refreshEntityCatalog?.(`实体目录变更(${operation})`).catch(() => false)
      // 墙屏 / 编辑器目录来自各自的一次性快照，用一个全局事件让它们同样校准一次。
      try {
        window.dispatchEvent(
          new CustomEvent('hb-entity-catalog-changed', {
            detail: { operation, counts: data?.counts || {} },
          }),
        )
      } catch {
        /* CustomEvent 不可用（非浏览器环境）：忽略 */
      }
    },
  )

  socket.on(WS_CLIENT_EVENTS.SYNC_ERROR, (data: { message?: string; code?: string }) => {
    logger.warn('WebSocket 全量同步失败,将使用 REST 回退', data?.message || data?.code)
    runFallbackAndMarkSynced('WebSocket sync_error')
  })

  socket.on(
    WS_CLIENT_EVENTS.STATE_REPLAY,
    (data: {
      changes?: Record<string, unknown>[]
      entities?: HaEntityState[]
      lastEventId?: number
      count?: number
    }) => {
      // state_replay 是服务端对「本地已有基线」的权威补齐：只要回放返回 replayed，
      // 服务端就不会再发 initial_states。因此收到回放（哪怕 0 条变更）即视为同步完成，
      // 否则 initialStatesReceived 永远为 false、entitiesCacheHydrated 永远为 true，
      // 连带的后果是：实体缓存不再持久化、增量被基线门禁拦掉、
      // 重连横幅卡在「正在重新连接」，只有手动刷新页面才恢复。
      // 回放是服务端对本进程历史的权威补齐：暂存 delta 可能比回放还旧，直接作废。
      completeFullSync({ flushPending: false })
      refs.entitiesCacheHydrated.value = false
      refs.entitiesStale.value = false
      clearSyncTimers()
      if (refs.totalCount.value > 0) refs.loading.value = false
      // 回放游标即使本轮 0 条变更也要推进：否则下次重连仍从旧游标回放，
      // 环形缓冲淘汰后会退化成「建议重同步」的整包 REST 拉取。
      if (data?.lastEventId) track.lastEventId = data.lastEventId
      track.lastSocketEventAt = Date.now()
      const changes = data?.changes
      if (Array.isArray(changes) && changes.length) {
        // baseline 保护：与 state_changed_batch 一致，仅丢弃本地缺实体的 delta 条目
        const applicable = filterDeltaBeforeFullSync(changes, sync, entities, logger)
        if (applicable.length) {
          actions.updateStatesBatch(applicable)
        }
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
        // baseline 保护：全量同步完成前只丢弃缺实体的 delta，避免 merge 到残缺基线上产生残缺实体
        const applicable = filterDeltaBeforeFullSync(changes, sync, entities, logger)
        if (!applicable.length) return
        refs.entitiesStale.value = false
        actions.updateStatesBatch(applicable)
      }
    },
  )
}
