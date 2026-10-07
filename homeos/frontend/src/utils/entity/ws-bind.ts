/**
 * @file entity-ws-bind.ts
 * @module frontend/src/utils
 */
/** entity WebSocket: 将 Socket.IO 生命周期 / HA 状态 / 实体分块 / 领域事件绑定到 entities store */
import { useEarthquakeStore } from '@/stores/earthquake.store'
import type { EarthquakeAlertPayload } from '@/types/earthquake'
import type { EntitySocketHandlerContext, EntitySocketSyncState, HaEntityState } from '@/types/entity-store'
import { refreshEnergyFromSocket } from '@/utils/bridge/store-bridge'
import { isEarthquakeAlertEnabled } from '@/utils/earthquake/util'
import { refreshEntitySocketAuth } from '@/utils/entity/socket.util'
import { handleEntityFallbackFailure } from '@/utils/entity/sync-failure.util'
import { notificationLevelToToastType, shouldSkipNotificationToast } from '@/utils/notification/ws-sync.util'
import { isEewSimulationEventId, WS_CLIENT_EVENTS } from '@homeos/shared'
import type { Socket } from 'socket.io-client'
import {
  clearEntitySocketSyncTimers,
  scheduleIncrementalEnd,
  waitForPendingChunkApplies,
} from '@/utils/entity/ws-sync'

// ── entity-ws-bind.util ──

/**
 * baseline 保护：全量同步（initial_states / REST 回退）完成前，delta（_delta=true）条目
 * 依赖客户端本地已有完整实体，直接 merge 会得到残缺实体（丢失 friendly_name 等未变更属性）。
 * 该窗口内丢弃 delta 条目，仅保留携带完整 old/new_state 的非 delta 条目；
 * 全量同步随后到达即补齐基线，故丢弃的增量不会造成数据缺失。
 */
function filterDeltaBeforeFullSync(
  changes: Record<string, unknown>[],
  sync: EntitySocketSyncState,
  logger: EntitySocketHandlerContext['logger'],
): Record<string, unknown>[] {
  if (sync.initialStatesReceived || !changes.length) return changes
  const full: Record<string, unknown>[] = []
  let dropped = 0
  for (const c of changes) {
    if ((c as { _delta?: boolean })?._delta) dropped++
    else full.push(c)
  }
  if (dropped > 0) {
    // 设计内的自愈：这些 delta 的变更时刻不晚于随后到达的全量快照，快照会覆盖其效果，
    // 丢弃是安全的。后端侧已避免向未就绪客户端广播增量（见 gateway._baseline_ready），
    // 此处仅作兜底，降级 debug 以免产生误导性告警。
    logger.debug?.(`全量同步完成前丢弃 ${dropped} 条 delta 增量(本地缺少实体基线)`)
  }
  return full
}

export function bindEntitySocketHandlers(
  socket: Socket,
  ctx: EntitySocketHandlerContext,
  sync: EntitySocketSyncState,
): void {
  // 将 Socket.IO 生命周期、HA 状态、实体分块与领域事件统一绑定到 entities store
  const {
    logger,
    getInitialStatesWaitMs,
    getPreloadPromise,
    refs,
    entities,
    track,
    actions,
    listeners,
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

  socket.on('connect', () => {
    logger.info('WebSocket 已连接到 HomeOS 后端')
    sync.initialStatesReceived = false
    if (refs.totalCount.value > 0) {
      // 已有缓存：短暂标记重连中；收到 initial_states / REST 回退成功后清除
      refs.reconnecting.value = true
      refs.loading.value = false
    } else if (refs.reconnecting.value) {
      refs.loading.value = true
    }

    clearSyncTimers()
    sync.restFallbackTimer = setTimeout(async () => {
      if (sync.initialStatesReceived) return
      const preload = getPreloadPromise()
      if (preload) {
        await preload
        if (sync.initialStatesReceived) {
          actions.clearHaDisconnectDebounce()
          actions.setConnected(true)
          return
        }
      }
      // 后端 waitForHaEntitySync 最长约 90s；8s 内 REST 常拿到更小的未就绪快照，
      // 与 IndexedDB 缓存冲突并误报「拒绝缩小快照」。有可用缓存时继续等 WS。
      if (refs.totalCount.value > 0 && socket.connected && !refs.entitiesStale.value) {
        logger.info(
          `已有 ${refs.totalCount.value} 个实体缓存,继续等待 WebSocket initial_states(跳过过早 REST 回退)`,
        )
        return
      }
      const ok = await actions.fetchEntitiesFallback('未收到 initial_states', {
        force: refs.entitiesStale.value,
      })
      if (ok) {
        sync.initialStatesReceived = true
        // REST 已补齐实体时勿一直挂着「正在重新连接 Home Assistant」
        actions.clearHaDisconnectDebounce()
        actions.setConnected(true)
      }
    }, getInitialStatesWaitMs())
  })

  socket.on('disconnect', (reason: Socket.DisconnectReason) => {
    logger.info('WebSocket 已断开 HomeOS 后端连接:', reason)
    clearSyncTimers()
    if (refs.totalCount.value > 0) {
      refs.loading.value = false
    }
    // 会话失效只由 HTTP 401 处理。WS 断线（含后端重启的 io server disconnect）
    // 绝不能清登录态，否则会在登录后立刻被踢回登录页。
    if (reason === 'io server disconnect') {
      logger.warn('服务端主动断开 WebSocket,尝试重连(不登出)')
      refs.reconnecting.value = true
      actions.setConnected(false)
      refreshEntitySocketAuth(socket, track.lastSocketEventAt, track.lastEventId)
      socket.connect()
      return
    }
    actions.setConnected(false)
    actions.startHaDisconnectDebounce()
  })

  socket.on('connect_error', (err: Error) => {
    logger.error('WebSocket 连接错误:', err.message)
    if (refs.totalCount.value > 0) {
      refs.loading.value = false
    }
    // 认证失败同样不在此登出：由后续 HTTP 请求 401 统一处理，避免误踢
    actions.setConnected(false)
    if (refs.totalCount.value > 0) {
      actions.startHaDisconnectDebounce()
    }
  })

  socket.io.on('reconnect_attempt', (attempt: number) => {
    logger.info(`WebSocket 重连尝试 (第 ${attempt} 次)...`)
    refs.reconnecting.value = true
    refreshEntitySocketAuth(socket, track.lastSocketEventAt, track.lastEventId)
  })

  socket.io.on('reconnect', () => {
    logger.info('WebSocket 已重新连接到 HomeOS 后端')
    // 有本地缓存时仅短暂展示重连态；避免 socket.io 抖动把横幅钉死
    if (refs.totalCount.value === 0) {
      refs.reconnecting.value = true
      refs.loading.value = true
    } else {
      refs.reconnecting.value = true
      refs.loading.value = false
      // 「已恢复」必须等全量同步完成：initial_states 到达或 REST 回退成功后才会收起横幅。
      // 4s 兜底仅处理「服务端已推完但事件漏记」的边角；未收到全量前保持重连横幅，
      // 避免用户在实体状态未对齐窗口内看到误导性的「已连接」。
      setTimeout(() => {
        if (socket.connected && refs.totalCount.value > 0 && sync.initialStatesReceived) {
          actions.clearHaDisconnectDebounce()
          actions.setConnected(true)
        }
      }, 4_000)
    }
    actions.refreshNotificationsFromSocket?.()
    actions.refreshEventLogFromSocket?.()
  })

  socket.on(WS_CLIENT_EVENTS.HA_STATUS, (data: { status?: string }) => {
    logger.info('HA 连接状态:', data.status)
    if (data.status === 'connected') {
      actions.clearHaDisconnectDebounce()
      actions.setConnected(true)
      refs.entitiesStale.value = false
      if (refs.totalCount.value > 0) {
        refs.loading.value = false
      }
    } else if (data.status === 'disconnected') {
      actions.setConnected(false)
      actions.startHaDisconnectDebounce()
    } else if (data.status === 'reconnecting') {
      refs.reconnecting.value = true
      actions.setConnected(false)
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

  socket.on(
    'redis_status',
    (data: {
      status: EntitySocketHandlerContext['refs']['redisStatus']['value']
      error?: string
    }) => {
      refs.redisStatus.value = data.status
      if (data.status === 'error') {
        logger.warn('Redis 连接异常:', data.error)
      }
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

  /** 模式事件派发：按下标遍历（允许监听器内增删同列表），单条异常不阻断其余 */
  const dispatchToModeListeners = (
    arr: Array<(payload: unknown) => void>,
    data: unknown,
    label: string,
  ) => {
    for (let i = 0; i < arr.length; i++) {
      try {
        arr[i](data)
      } catch (e) {
        logger.error(`${label} 监听器错误:`, e)
      }
    }
  }

  socket.on(WS_CLIENT_EVENTS.HOME_MODE, (data: unknown) => {
    dispatchToModeListeners(listeners.homeModeListeners, data, 'home_mode')
  })

  socket.on(WS_CLIENT_EVENTS.NOTIFICATION, (data: Record<string, unknown>) => {
    actions.addRemoteNotification(data)
    if (shouldSkipNotificationToast(data)) return
    const message = String(data.message || '').trim()
    if (!message) return
    void actions.appNotify(message, notificationLevelToToastType(data.level))
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_MODE, (data: { mode?: string; zones?: string[] }) => {
    actions.applySecurityModeFromSocket?.(data)
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_ZONES, () => {
    actions.refreshSecurityPanelFromSocket()
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_EMERGENCY, () => {
    actions.refreshSecurityPanelFromSocket()
  })

  socket.on(WS_CLIENT_EVENTS.SECURITY_EMERGENCY_COMPLETED, (data: { failed?: number }) => {
    actions.refreshSecurityPanelFromSocket()
    if (data?.failed && data.failed > 0) {
      actions.appNotify(`紧急联动完成，${data.failed} 项失败`, 'warning')
    }
  })

  socket.on(WS_CLIENT_EVENTS.TTS_SPEAK, (data: { message?: string; success?: boolean; detail?: string }) => {
    if (!data?.message) return
    if (data.success === false) {
      const detail = data.detail || data.message || '未知错误'
      logger.warn(`TTS 播报未成功: ${detail}`)
      void actions.appNotify(`自动播报失败：${detail}`, 'error')
    }
  })

  // 领域事件监听（自动化 / 安防 / 在场 / 能源 / Frigate / 房间占用）
  // payload 字段以后端 ws-push-domain-events.helper.ts 为准；后端为 Record<string,unknown>
  // 的事件此处用合理的最小可选字段类型，访问均带兜底，避免使用 any。

  socket.on(
    'automation_executed',
    (data: { automationId?: string; name?: string; success?: boolean; timestamp?: string }) => {
      const name = data?.name || data?.automationId || '自动化'
      logger.info(`自动化已执行: ${name}`)
      if (data?.success === false) {
        void actions.appNotify(`自动化「${name}」执行失败`, 'warning')
      } else {
        void actions.appNotify(`自动化「${name}」已执行`, 'info')
      }
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.SECURITY_ALARM,
    (data: {
      entityId?: string
      friendlyName?: string
      zones?: string[]
      zoneNames?: string
      mode?: string
      type?: string
      actionFailures?: string[]
      timestamp?: string
    }) => {
      const target = data?.friendlyName || data?.zoneNames || data?.entityId || '安防区域'
      const typeLabel =
        data?.type === 'smoke'
          ? '烟雾告警'
          : data?.type === 'gas_leak'
            ? '燃气泄漏'
            : data?.type === 'water_leak'
              ? '漏水告警'
              : data?.mode === 'safety'
                ? '安全传感器告警'
                : '安防告警'
      logger.warn(`${typeLabel}: ${target}(模式 ${data?.mode || 'unknown'})`)
      actions.refreshSecurityPanelFromSocket()
      // 持久化通知已由 notification 通道推送并弹 toast，此处仅刷新安防面板
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.PRESENCE_CHANGED,
    (data: { memberId?: string; name?: string; atHome?: boolean; timestamp?: string }) => {
      const name = data?.name || data?.memberId || '成员'
      const status = data?.atHome ? '已到家' : '已离家'
      logger.info(`在场状态变化: ${name} ${status}`)
      void actions.appNotify(`${name}${status}`, 'info')
    },
  )

  socket.on(WS_CLIENT_EVENTS.PRESENCE_ALL_LEFT, (data: { lastMember?: string; timestamp?: string }) => {
    logger.info(`所有成员均已离家(最后一位: ${data?.lastMember || '未知'})`)
    void actions.appNotify('所有成员均已离家', 'info')
  })

  socket.on(
    WS_CLIENT_EVENTS.ENERGY_ANOMALY,
    (data: {
      friendlyName?: string
      current?: number
      average?: number
      message?: string
      entityId?: string
    }) => {
      const name = data?.friendlyName || data?.entityId || '设备'
      const cur = typeof data?.current === 'number' ? `${data.current}W` : ''
      const detail = data?.message || (cur ? `${name} 当前功耗 ${cur}` : name)
      logger.warn(`能源异常: ${detail}`)
      refreshEnergyFromSocket(data?.entityId)
      // 持久化通知已由 notification 通道推送并弹 toast，此处仅刷新能源 UI
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.FRIGATE_DETECTION,
    (data: { camera?: string; label?: string; message?: string; entityId?: string }) => {
      const target = data?.camera || data?.label || data?.message || data?.entityId || '摄像头'
      logger.info(`Frigate 检测: ${target}`)
      // 人物高置信度检测会同步触发 security.alarm → notification，避免双 toast
      if (String(data?.label || '').toLowerCase() === 'person') return
      void actions.appNotify(`检测到活动：${target}`, 'info')
    },
  )

  socket.on(WS_CLIENT_EVENTS.ROOM_PRESENCE, (data: { room?: string; occupied?: boolean; sensor?: string }) => {
    const room = data?.room || data?.sensor || '房间'
    const status = data?.occupied ? '有人' : '无人'
    logger.info(`房间占用变化: ${room} ${status}`)
    void actions.appNotify(`${room}${status}`, 'info')
  })

  socket.on(
    WS_CLIENT_EVENTS.EARTHQUAKE_ALERT,
    (data: {
      eventId?: string
      latitude?: number
      longitude?: number
      originTime?: number
      magnitude?: number
      depth?: number
      epicenter?: string
      distance?: number
      countdown?: number
      localIntensity?: number
      maxIntensity?: string
      alertKind?: string
      source?: string
      timestamp?: string
    }) => {
      const eventId = String(data?.eventId || '').trim()
      if (!eventId) return
      // 模拟演练与后端一致：即使未启用 EEW 也允许弹出，便于验证全屏链路
      if (!isEarthquakeAlertEnabled() && !isEewSimulationEventId(eventId)) return
      const store = useEarthquakeStore()
      if (store.isEventDismissed(eventId)) return
      store.triggerAlert({
        eventId,
        latitude: Number(data.latitude ?? 0),
        longitude: Number(data.longitude ?? 0),
        originTime: Number(data.originTime ?? Date.now()),
        magnitude: Number(data.magnitude ?? 0),
        depth: Number(data.depth ?? 0),
        epicenter: String(data.epicenter ?? '未知震中'),
        distance: Number(data.distance ?? 0),
        countdown: Number(data.countdown ?? 0),
        localIntensity: Number(data.localIntensity ?? 0),
        maxIntensity: data.maxIntensity,
        alertKind: data.alertKind === 'confirmation' ? 'confirmation' : 'early',
        source: data.source as EarthquakeAlertPayload['source'] | undefined,
        timestamp: data.timestamp,
      })
    },
  )

  socket.on(
    WS_CLIENT_EVENTS.EARTHQUAKE_CONFIRMATION,
    (data: {
      eventId?: string
      latitude?: number
      longitude?: number
      originTime?: number
      magnitude?: number
      depth?: number
      epicenter?: string
      distance?: number
      countdown?: number
      localIntensity?: number
      maxIntensity?: string
      source?: string
      timestamp?: string
    }) => {
      const eventId = String(data?.eventId || '').trim()
      if (!eventId) return
      if (!isEarthquakeAlertEnabled() && !isEewSimulationEventId(eventId)) return
      const store = useEarthquakeStore()
      store.triggerConfirmation({
        eventId,
        latitude: Number(data.latitude ?? 0),
        longitude: Number(data.longitude ?? 0),
        originTime: Number(data.originTime ?? Date.now()),
        magnitude: Number(data.magnitude ?? 0),
        depth: Number(data.depth ?? 0),
        epicenter: String(data.epicenter ?? '未知震中'),
        distance: Number(data.distance ?? 0),
        countdown: Number(data.countdown ?? 0),
        localIntensity: Number(data.localIntensity ?? 0),
        maxIntensity: data.maxIntensity,
        alertKind: 'confirmation',
        source: data.source as EarthquakeAlertPayload['source'] | undefined,
        timestamp: data.timestamp,
      })
    },
  )
}
