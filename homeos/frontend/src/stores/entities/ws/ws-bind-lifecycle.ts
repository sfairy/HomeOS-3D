/**
 * @file ws-bind-lifecycle.ts
 * @module frontend/src/composables/entity
 */
/** entity WebSocket：连接 / 断线 / 重连生命周期 */
import type { EntitySocketHandlerContext, EntitySocketSyncState } from '@/shared/types/entity-store'
import { refreshEntitySocketAuth } from './socket.util'
import { clearEntitySocketSyncTimers } from '@/shared/entity/utils/ws-sync'
import type { Socket } from 'socket.io-client'

export function bindEntitySocketLifecycle(
  socket: Socket,
  ctx: EntitySocketHandlerContext,
  sync: EntitySocketSyncState,
): void {
  const { logger, getInitialStatesWaitMs, getPreloadPromise, refs, track, actions } = ctx

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * 服务端主动断开（``io server disconnect``）后的重连计数。
   *
   * 该分支下 socket.io **不会**自动重连，必须手工 ``socket.connect()``；原实现立刻重连、
   * 不设上限，于是后端滚动重启 / 反复拒绝握手时会变成一条**同步忙循环**：连上→被踢→
   * 立刻连上，浏览器与后端都被拖住，控制台每秒刷屏。这里按指数退避（上限 30s）重试。
   */
  let serverDisconnectAttempt = 0
  let serverReconnectTimer: ReturnType<typeof setTimeout> | null = null
  const clearSyncTimers = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (serverReconnectTimer !== null) {
      clearTimeout(serverReconnectTimer)
      serverReconnectTimer = null
    }
    clearEntitySocketSyncTimers(sync)
  }

  /**
   * 本页是否已有一份可信基线：已完成过一次 WS 全量同步（而不是只靠 IndexedDB 缓存 hydrate）。
   * 缓存可能是几小时前的（服务端 since 只回放最近 60s），因此不能凭缓存宣称「已同步」。
   */
  const hasTrustedBaseline = () => refs.totalCount.value > 0 && !refs.entitiesCacheHydrated.value

  socket.on('connect', () => {
    logger.info('WebSocket 已连接到 HomeOS 后端')
    // 连接恢复即清零退避，避免一次长时间抖动把后续重连永久钉在 30s。
    serverDisconnectAttempt = 0
    // 断线重连时服务端只做 state_replay 增量回放，不会再发 initial_states。
    // 这里若把「已收到全量」无条件重置为 false，之后所有 delta 增量都会被
    // filterDeltaBeforeFullSync 丢掉，实体状态永久冻结在断线前的快照，
    // 只有手动刷新页面才恢复。已有可信基线时保留该标记。
    sync.initialStatesReceived = hasTrustedBaseline()
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
        logger.info(`已有 ${refs.totalCount.value} 个实体缓存,继续等待 WebSocket initial_states(跳过过早 REST 回退)`)
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
    // 后端通道断了就无从得知 HA 状态：标记未知，避免沿用旧的「已连接/重连中」去误报
    refs.haStatus.value = 'unknown'
    // 会话失效只由 HTTP 401 处理。WS 断线（含后端重启的 io server disconnect）
    // 绝不能清登录态，否则会在登录后立刻被踢回登录页。
    if (reason === 'io server disconnect') {
      logger.warn('服务端主动断开 WebSocket,尝试重连(不登出)')
      refs.reconnecting.value = true
      actions.setConnected(false)
      refreshEntitySocketAuth(socket, track.lastSocketEventAt, track.lastEventId)
      // 指数退避：1s、2s、4s … 上限 30s。没有上限的立即重连会让后端限流/重启期间变成
      // 忙循环（socket.io 在该分支不会自动重连，所有重试都来自这里）。
      const attempt = (serverDisconnectAttempt += 1)
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt - 1, 5))
      clearSyncTimers()
      serverReconnectTimer = setTimeout(() => {
        serverReconnectTimer = null
        if (socket.connected) {
          serverDisconnectAttempt = 0
          return
        }
        logger.info(`服务端主动断开后重连 (第 ${attempt} 次, 等待 ${delay}ms)`)
        socket.connect()
      }, delay)
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

  // Manager 级监听必须可卸载：同 URL 的 io() 会复用 Manager，只 socket.removeAllListeners
  // 会让 reconnect_* 回调叠乘，放大鉴权刷新 / 横幅 / REST 回退风暴。
  const onManagerReconnectAttempt = (attempt: number) => {
    logger.info(`WebSocket 重连尝试 (第 ${attempt} 次)...`)
    refs.reconnecting.value = true
    refreshEntitySocketAuth(socket, track.lastSocketEventAt, track.lastEventId)
  }
  const onManagerReconnect = () => {
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
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        if (socket.connected && refs.totalCount.value > 0 && sync.initialStatesReceived) {
          actions.clearHaDisconnectDebounce()
          actions.setConnected(true)
        }
      }, 4_000)
    }
    actions.refreshNotificationsFromSocket?.()
    actions.refreshEventLogFromSocket?.()
  }
  socket.io.on('reconnect_attempt', onManagerReconnectAttempt)
  socket.io.on('reconnect', onManagerReconnect)
}
