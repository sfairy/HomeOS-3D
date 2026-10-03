/**
 * WebSocket 升级反代公共件：Cookie 解析、双向转发、待发缓冲桥接。
 *
 * 所属模块：backend/src/common/utils
 * 职责：
 *   - parseCookie：从 HTTP 升级请求 Cookie 头取指定 cookie 值（WS 鉴权用）；
 *   - bridgeClientToUpstream：客户端 ↔ 上游 WS 双向桥接，包含 open 前待发缓冲、
 *     message 双向转发、统一 closeBoth、可选心跳保活；
 *   - 调用方负责创建 upstream WS 与鉴权，本模块只挂事件。
 * 关键依赖：
 *   - ws#WebSocket：WS 服务端实现
 *   - http#IncomingMessage：WS 升级请求类型
 */
/** WebSocket 升级反代公共件：Cookie 解析、双向转发、待发缓冲桥接 */
import type { IncomingMessage } from 'http';
import WebSocket from 'ws';

/**
 * 从 HTTP 升级请求的 Cookie 头取指定名称的值。
 * 用于 WS 握手阶段从 Cookie 中读取 auth_token 等会话标识。
 *
 * @param req  HTTP 升级请求
 * @param name 目标 cookie 名称
 * @returns cookie 值（已 decodeURIComponent）；不存在时返回 null
 */
export function parseCookie(req: IncomingMessage, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/** 单向转发 a → b 的 message 事件，仅在 b 处于 OPEN 状态时发送 */
function relayWsMessages(a: WebSocket, b: WebSocket) {
  a.on('message', (data, isBinary) => {
    if (b.readyState === WebSocket.OPEN) b.send(data, { binary: isBinary });
  });
}

type BridgeClientToUpstreamOptions = {
  clientWs: WebSocket;
  upstream: WebSocket;
  onClose?: (err?: Error) => void;
  /** 若提供则在桥接期间按间隔双向 ping；连续无 pong 则关闭 */
  heartbeatMs?: number;
};

/**
 * 客户端 ↔ 上游：open 前缓冲、双向 message 转发、统一 closeBoth。
 * 调用方负责创建 upstream 与鉴权；本函数只挂事件。
 *
 * 行为细节：
 *   - 上游尚未 open 时，客户端发来的数据先暂存 pendingToUpstream，待 open 后一次性 flush；
 *   - 上游 open 后启动 upstream → client 的反向 message 转发；
 *   - heartbeatMs > 0 时按间隔双向 ping，任一侧连续无 pong 则 closeBoth 关闭两端；
 *   - 任一端 error / close 都触发 closeBoth，保证资源不泄漏。
 *
 * @returns closeBoth 句柄，调用方可主动关闭两端
 */
export function bridgeClientToUpstream(opts: BridgeClientToUpstreamOptions): {
  closeBoth: (err?: Error) => void;
} {
  const { clientWs, upstream, onClose, heartbeatMs } = opts;
  const pendingToUpstream: WebSocket.RawData[] = [];
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const closeBoth = (err?: Error) => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    onClose?.(err);
    try {
      clientWs.close();
    } catch {
      /* 空操作 */
    }
    try {
      upstream.close();
    } catch {
      /* 空操作 */
    }
  };

  clientWs.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    } else {
      pendingToUpstream.push(data);
    }
  });

  upstream.on('open', () => {
    for (const data of pendingToUpstream) upstream.send(data);
    pendingToUpstream.length = 0;
    relayWsMessages(upstream, clientWs);
  });

  // 双向心跳：每轮重置 alive 标记后 ping，下轮检查 pong 是否回写
  if (heartbeatMs && heartbeatMs > 0) {
    let clientAlive = true;
    let upstreamAlive = true;
    clientWs.on('pong', () => {
      clientAlive = true;
    });
    upstream.on('pong', () => {
      upstreamAlive = true;
    });
    heartbeat = setInterval(() => {
      if (!clientAlive || !upstreamAlive) {
        closeBoth();
        return;
      }
      clientAlive = false;
      upstreamAlive = false;
      try {
        if (clientWs.readyState === WebSocket.OPEN) clientWs.ping();
      } catch {
        /* 空操作 */
      }
      try {
        if (upstream.readyState === WebSocket.OPEN) upstream.ping();
      } catch {
        /* 空操作 */
      }
    }, heartbeatMs);
  }

  upstream.on('error', (err) => closeBoth(err));
  clientWs.on('error', (err) => closeBoth(err));
  upstream.on('close', () => closeBoth());
  clientWs.on('close', () => closeBoth());

  return { closeBoth };
}
