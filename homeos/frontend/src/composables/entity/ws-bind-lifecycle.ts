/**
 * @file ws-bind-lifecycle.ts
 * @module frontend/src/composables/entity
 */
/** entity WebSocket：连接 / 断线 / 重连生命周期 */
import type { EntitySocketHandlerContext, EntitySocketSyncState } from '@/shared/types/entity-store'
import { refreshEntitySocketAuth } from '@/composables/entity/socket.util'
import { clearEntitySocketSyncTimers } from '@/shared/entity/utils/ws-sync'
import type { Socket } from 'socket.io-client'

export function bindEntitySocketLifecycle(
  socket: Socket,
  ctx: EntitySocketHandlerContext,
  sync: EntitySocketSyncState,
): void {
  const {
    logger,
    getInitialStatesWaitMs,
    getPreloadPromise,
    refs,
    track,
    actions,
  } = ctx

  const clearSyncTimers = () => clearEntitySocketSyncTimers(sync)

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
}
