/** 实体 WebSocket（Socket.IO）连接构建工具 */
import msgpackParser from 'socket.io-msgpack-parser'
import type { Socket } from 'socket.io-client'
import { getActivePinia } from 'pinia'
import { useLayoutStore } from '@/stores/layout.store'
import {
  getActiveSubscribeDomains,
  collectWsPinnedEntityIds,
} from '@/shared/entity/utils/ws-subscription'
import { resolveActivePopupEntityId } from '@/composables/entity/active-popup-entity'

/** 构建前端 Socket.IO 连接参数（从 entities.store 抽离） */
export function buildEntitySocketUrl(): string | undefined {
  const direct = import.meta.env.VITE_BACKEND_URL?.trim()
  if (direct) return direct
  // 开发环境默认走 Vite 同源代理（/socket.io → 127.0.0.1:8801），避免直连 localhost:8801 在 Windows/IPv6 下失败
  return undefined
}

/**
 * 构建握手 auth：since/lastEventId 增量游标 + 订阅域 + pinned 实体 ID
 *
 * @param lastSocketEventAt - 上次收到事件的时间戳；缺失时回退当前时间减 60s。
 * @param lastEventId - 上次收到的事件序号；缺失时回退 0。
 * @param hasBaseline - 本地是否已有完整基线（发生过一次成功同步）。
 *   服务端据此决定「只发增量回放」还是「必须发全量快照」：首次打开页面时为 false，
 *   否则服务端会以为我们已经持有全部实体，只补 60s 的增量。
 * @returns Socket.IO auth 对象；Pinia 未就绪时跳过 pinned（后续 update_subscription 补发）。
 */
export function buildEntitySocketAuth(
  lastSocketEventAt: number | null | undefined,
  lastEventId: number | null | undefined,
  hasBaseline = false,
): Record<string, unknown> {
  const auth: Record<string, unknown> = {
    since: lastSocketEventAt || Date.now() - 60_000,
    lastEventId: lastEventId || 0,
    hasBaseline: Boolean(hasBaseline),
  }
  const domains = getActiveSubscribeDomains()
  if (domains?.length) {
    auth.subscribeDomains = domains
  }
  try {
    const pinia = getActivePinia()
    if (pinia) {
      const layout = useLayoutStore(pinia)
      const pinned = collectWsPinnedEntityIds(layout.layoutConfig, resolveActivePopupEntityId())
      if (pinned.length) auth.pinnedEntityIds = pinned
    }
  } catch {
    /* Pinia 未就绪时跳过 pinned，后续 update_subscription 补发 */
  }
  return auth
}

/** 重连前刷新握手游标，使服务端 state_replay 更精确 */
export function refreshEntitySocketAuth(
  socket: Socket | null | undefined,
  lastSocketEventAt: number | null | undefined,
  lastEventId: number | null | undefined,
): void {
  if (!socket) return
  // 能走到重连说明此前至少同步过一次；时间为 0（从未收到事件）时仍按「无基线」处理。
  const hasBaseline = Boolean(lastSocketEventAt && lastSocketEventAt > 0)
  socket.auth = buildEntitySocketAuth(lastSocketEventAt, lastEventId, hasBaseline)
}

/** 构建 Socket.IO 连接 options：withCredentials + msgpack + polling 优先 + 无限重连 */
export function buildEntitySocketOptions(auth: Record<string, unknown>) {
  return {
    withCredentials: true,
    auth,
    parser: msgpackParser,
    // polling 优先：先经 HTTP 握手（后端不可达时 Vite 代理回 503 → 安静的 connect_error），
    // 会话建立后再升级到 WebSocket。若 websocket 优先，后端重启/未就绪时每次重连都会
    // 触发浏览器级「WebSocket is closed before the connection is established」报错。
    transports: ['polling', 'websocket'] as ('polling' | 'websocket')[],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.3,
  }
}
