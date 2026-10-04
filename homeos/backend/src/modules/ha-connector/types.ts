/**
 * 职责：
 *  - 连接器类型与常量；
 * 关键依赖：
 *  - -；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * HA WebSocket 连接器共享类型（从 ha-connector.service 抽取）。
 *
 * 被 ha-connector.service、ha-connector-ws.helper 等模块共享。
 */

/** HA WebSocket 待处理请求：关联 Promise 的 resolve/reject 与超时定时器 */
export interface HaWsPendingResult {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
}

/**
 * HA WebSocket 入站消息结构。
 * 覆盖认证响应（auth_required/auth_ok/auth_invalid）、result 响应、event 推送等 HA WebSocket 协议消息。
 */
export interface HaWsMessage {
  id?: number;
  type: string;
  success?: boolean;
  error?: { code: string; message: string };
  result?: unknown;
  ha_version?: string;
  event?: {
    event_type: string;
    time_fired?: string;
    data?: {
      entity_id: string;
      old_state?: Record<string, unknown> | null;
      new_state?: Record<string, unknown> | null;
    };
  };
  [key: string]: unknown;
}

/** 重连退避：初始 1s，最大 30s */
export const HA_WS_RECONNECT_INITIAL_MS = 1000;
export const HA_WS_RECONNECT_MAX_MS = 30_000;

/**
 * HA WS 应用层 ping 间隔与 pong 超时（毫秒）。
 * 远程 HA / 事件洪峰下 pong 可能被推迟，超时过短会误杀连接。
 */
export const HA_WS_PING_INTERVAL_MS = 45_000;
export const HA_WS_PONG_TIMEOUT_MS = 25_000;
/** 连续未响应次数达到该值才主动断开 */
export const HA_WS_HEARTBEAT_MAX_MISSES = 3;
/** WebSocket 握手超时（远程反代较慢时避免无限卡在 CONNECTING） */
export const HA_WS_HANDSHAKE_TIMEOUT_MS = 30_000;
/**
 * 局域网建连看门狗超时。
 * Bun/Node 下 ws 的 handshakeTimeout 对「TCP 尚未连上」的阶段不生效，
 * 不可达地址会一直挂到操作系统级 TCP 建连超时（macOS 约 75s）。
 * 已配置外网时用此短超时快速放弃局域网并 failover，避免启动后 HA 长时间不可用。
 */
export const HA_WS_LAN_CONNECT_TIMEOUT_MS = 5_000;