/**
 * Socket.IO 客户端写缓冲背压检测与全量重同步建议。
 *
 * 所属模块：ws-push
 * 职责：
 * - 探测 Engine.IO websocket 传输的写缓冲长度，超过阈值则判定为背压。
 * - 失败时 fail-open（拿不到 writeBuffer 不误报为背压），曾观测到后又消失则按周期采样告警。
 * - 对背压客户端发出 resync_suggested 信号，触发前端走全量重同步。
 *
 * 关键依赖：gateway.config（阈值常量）、@homeos/shared（WS_CLIENT_EVENTS.RESYNC_SUGGESTED）。
 */
import { WS_PUSH_BACKPRESSURE_WRITE_BUFFER } from './gateway.config';
import { WS_CLIENT_EVENTS } from '@homeos/shared';
import { Logger } from '@nestjs/common';
import { type Socket } from 'socket.io';

const logger = new Logger('WsBackpressure');
// 仅在确实拿到过写缓冲后，才对“字段缺失”发出告警，
// 避免握手早期 transport 尚未就绪时误报为 API 失配。
let observedWriteBuffer = false;
/** 上次因 writeBuffer 不可读而告警的时间戳；用于周期采样，避免刷屏又避免只告一次后永久静默 */
let lastMissingApiWarnAt = 0;
const MISSING_API_WARN_INTERVAL_MS = 60_000;

/** 从 Engine.IO 连接的已知位置探测写缓冲数组（兼容字段位移） */
function resolveWriteBuffer(socket: Socket): unknown[] | null {
  const conn = socket.conn as unknown as {
    transport?: { name?: string; writeBuffer?: unknown[] };
    writeBuffer?: unknown[];
  };
  if (conn?.transport?.name !== 'websocket') return null;
  if (Array.isArray(conn.writeBuffer)) return conn.writeBuffer;
  if (Array.isArray(conn.transport?.writeBuffer)) return conn.transport.writeBuffer;
  return null;
}

/**
 * 检测 Socket.IO 客户端是否真正积压。
 * 仅依据写缓冲长度判断，且仅对 websocket 传输生效——
 * polling 传输在两次轮询之间 `transport.writable` 正常为 false，
 * 不能作为积压信号（否则会误触发全量重同步风暴）。
 * 采用 fail-open 策略：拿不到内部写缓冲时返回 false（绝不误报），
 * 但若曾观测到该字段后又消失，每 N 秒采样告警一次，便于发现 Engine.IO 升级导致的检测失效。
 */
export function isSocketBackpressured(socket: Socket): boolean {
  const conn = socket.conn as unknown as { transport?: { name?: string } };
  if (conn?.transport?.name !== 'websocket') return false;

  const buf = resolveWriteBuffer(socket);
  if (!buf) {
    if (observedWriteBuffer) {
      const now = Date.now();
      if (now - lastMissingApiWarnAt >= MISSING_API_WARN_INTERVAL_MS) {
        lastMissingApiWarnAt = now;
        logger.warn(
          '无法读取 Engine.IO writeBuffer,背压检测已降级为不生效(可能因 socket.io/engine.io 升级导致内部字段变更);请对照 docs/socketio-upgrade-checklist.md',
        );
      }
    }
    return false;
  }
  observedWriteBuffer = true;
  return buf.length > WS_PUSH_BACKPRESSURE_WRITE_BUFFER;
}

/** 向积压客户端发出全量重同步建议（非 volatile，保证送达） */
export function emitResyncSuggested(socket: Socket): void {
  socket.emit(WS_CLIENT_EVENTS.RESYNC_SUGGESTED, {
    type: 'resync_suggested',
    reason: 'backpressure',
    timestamp: new Date().toISOString(),
  });
}
