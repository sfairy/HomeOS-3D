/**
 * 实体 WebSocket（Socket.IO）连接构建工具
 *
 * 职责：
 * - 构建前端实体同步 Socket.IO 连接所需的 URL / auth / options。
 * - 重连前刷新握手游标（since / lastEventId），使服务端 state_replay 增量补发更精确。
 * - 注入订阅域与 pinned 实体 ID，减少无关节点流量。
 *
 * 依赖：
 * - socket.io-client / socket.io-msgpack-parser 传输层。
 * - pinia + layout.store 提供布局配置（用于 pinned 实体）。
 * - @/utils/entity/ws-subscription 提供订阅域与 pinned 收集。
 *
 * 注意：
 * - transports 固定 polling 优先：先经 HTTP 握手再升级 WebSocket，
 *   避免后端未就绪时浏览器级 WebSocket 报错噪音。
 */
import msgpackParser from 'socket.io-msgpack-parser'
import type { Socket } from 'socket.io-client'
import { getActivePinia } from 'pinia'
import { useLayoutStore } from '@/stores/layout.store'
import {
  getActiveSubscribeDomains,
  collectWsPinnedEntityIds,
} from '@/utils/entity/ws-subscription'

/** 构建前端 Socket.IO 连接参数（从 entities.store 抽离） */
export function buildEntitySocketUrl(): string | undefined {
  const direct = import.meta.env.VITE_BACKEND_URL?.trim()
  if (direct) return direct
  // 开发环境默认走 Vite 同源代理（/socket.io → 127.0.0.1:8501），避免直连 localhost:8501 在 Windows/IPv6 下失败
  return undefined
}

/**
 * 构建握手 auth：since/lastEventId 增量游标 + 订阅域 + pinned 实体 ID
 *
 * @param lastSocketEventAt - 上次收到事件的时间戳；缺失时回退当前时间减 60s。
 * @param lastEventId - 上次收到的事件序号；缺失时回退 0。
 * @returns Socket.IO auth 对象；Pinia 未就绪时跳过 pinned（后续 update_subscription 补发）。
 */
export function buildEntitySocketAuth(
  lastSocketEventAt: number | null | undefined,
  lastEventId: number | null | undefined,
): Record<string, unknown> {
  const auth: Record<string, unknown> = {
    since: lastSocketEventAt || Date.now() - 60_000,
    lastEventId: lastEventId || 0,
  }
  const domains = getActiveSubscribeDomains()
  if (domains?.length) {
    auth.subscribeDomains = domains
  }
  try {
    const pinia = getActivePinia()
    if (pinia) {
      const layout = useLayoutStore(pinia)
      const pinned = collectWsPinnedEntityIds(layout.layoutConfig, layout.activeFloorplanPopupId)
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
  socket.auth = buildEntitySocketAuth(lastSocketEventAt, lastEventId)
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
