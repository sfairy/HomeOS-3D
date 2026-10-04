/**
 * WolfX EEW WebSocket 客户端。
 *
 * 职责：
 *  - 维护与 WolfX 全部 EEW 源的 WebSocket 长连接。
 *  - 自动重连（指数退避，最大 30 秒间隔）。
 *  - 60 秒心跳保活，主节点活跃标记同步。
 *  - 将收到的 JSON 消息回调给上层（EarthquakeService）处理。
 *
 * 依赖：ws 库、NestJS Logger。通过 WolfxWsClientOptions 注入回调与连接条件。
 */
import { getErrorMessage } from '../../common/utils';
import { Logger } from '@nestjs/common';
import WebSocket from 'ws';

/** WolfX EEW WebSocket 地址（聚合全部 EEW 源） */
const WOLFX_WS_URL = 'wss://ws-api.wolfx.jp/all_eew';

/**
 * WolfX WebSocket 客户端配置。
 * 通过回调与条件函数解耦客户端与上层服务。
 */
interface WolfxWsClientOptions {
  /** 日志记录器 */
  logger: Logger;
  /** 消息回调，每条 JSON 消息触发 */
  onMessage: (msg: Record<string, unknown>) => void;
  /** 主节点活跃标记刷新回调（连接成功与心跳时调用） */
  touchLeaderActive: () => void | Promise<void>;
  /** 连接条件判断，返回 false 时跳过连接/重连 */
  canConnect: () => boolean;
}

/**
 * WolfX EEW WebSocket 客户端。
 *
 * 生命周期：
 *  - connect()：建立连接，失败时按指数退避调度重连。
 *  - on 'open'：重置重连延迟、启动心跳、刷新主节点标记。
 *  - on 'message'：解析 JSON 并回调 onMessage；心跳 pong 忽略。
 *  - on 'close'：停止心跳、调度重连（除非已销毁）。
 *  - markDestroyed()：标记销毁，停止重连与心跳，关闭连接。
 */
export class WolfxWsClient {
  /** WebSocket 实例 */
  private ws: WebSocket | null = null;
  /** 重连定时器 */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** 当前重连延迟（毫秒），指数退避 */
  private reconnectDelay = 1000;
  /** 最大重连延迟（毫秒） */
  private readonly maxReconnectDelay = 30_000;
  /** 是否已销毁（销毁后不再重连） */
  private destroyed = false;
  /** 心跳定时器 */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** 最后活动时间戳（收到消息或心跳） */
  private lastActivityAt = 0;
  /** 连接建立时间戳 */
  private connectedAt = 0;

  /** @param opts 客户端配置（日志、回调、连接条件） */
  constructor(private readonly opts: WolfxWsClientOptions) {}

  /** 标记客户端已销毁，停止重连与心跳，关闭当前连接 */
  markDestroyed() {
    this.destroyed = true;
    this.cleanup();
  }

  /**
   * 建立 WebSocket 连接。
   * 若已销毁或 canConnect() 返回 false，则跳过。
   * 创建失败时调度重连。
   */
  connect() {
    if (this.destroyed || !this.opts.canConnect()) return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.cleanupWsOnly();
    this.opts.logger.log(`正在连接 Wolfx EEW WebSocket:${WOLFX_WS_URL}`);
    try {
      this.ws = new WebSocket(WOLFX_WS_URL);
      this.setupEventHandlers();
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      this.opts.logger.error(`创建 Wolfx WebSocket 失败:${msg}`);
      this.scheduleReconnect();
    }
  }

  /** 主动断开连接并取消待重连定时器（不标记销毁，可再次 connect） */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupWsOnly();
  }

  /** 清理全部资源：停止心跳、取消重连、关闭连接 */
  cleanup() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupWsOnly();
  }

  isConnected() {
    return this.ws != null && this.ws.readyState === WebSocket.OPEN;
  }

  sendPing() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send('ping');
    }
  }

  getConnectionStatus() {
    const readyState = this.ws?.readyState ?? WebSocket.CLOSED;
    const stateLabels: Record<number, string> = {
      [WebSocket.CONNECTING]: 'connecting',
      [WebSocket.OPEN]: 'open',
      [WebSocket.CLOSING]: 'closing',
      [WebSocket.CLOSED]: 'closed',
    };
    return {
      connected: this.isConnected(),
      readyState,
      state: stateLabels[readyState] ?? 'unknown',
      connectedAt: this.connectedAt || null,
      lastActivityAt: this.lastActivityAt || null,
      reconnectDelayMs: this.reconnectTimer ? this.reconnectDelay : 0,
    };
  }

  private setupEventHandlers() {
    if (!this.ws) return;

    this.ws.on('open', () => {
      this.opts.logger.log('🔗 Wolfx EEW WebSocket 已连接');
      this.reconnectDelay = 1000;
      this.connectedAt = Date.now();
      this.lastActivityAt = Date.now();
      this.startHeartbeat();
      void this.opts.touchLeaderActive();
    });

    this.ws.on('message', (data) => {
      this.lastActivityAt = Date.now();
      const raw = data.toString().trim();
      if (!raw || raw === 'pong') return;
      try {
        const msg = JSON.parse(raw) as Record<string, unknown>;
        this.opts.onMessage(msg);
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        this.opts.logger.error(`解析 Wolfx 消息失败:${message}`);
      }
    });

    this.ws.on('close', (code, reason) => {
      this.stopHeartbeat();
      this.opts.logger.warn(`Wolfx WebSocket 已关闭:code=${code} reason=${reason?.toString() || '未知'}`);
      if (!this.destroyed) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.opts.logger.error(`Wolfx WebSocket 错误:${err.message}`);
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('ping');
          void this.opts.touchLeaderActive();
        } catch (err: unknown) {
          const msg = getErrorMessage(err);
          this.opts.logger.warn(`心跳发送失败:${msg}`);
        }
      }
    }, 60_000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer || !this.opts.canConnect()) return;
    this.opts.logger.warn(`${this.reconnectDelay / 1000}s 后重连 Wolfx...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.cleanupWsOnly();
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  private cleanupWsOnly() {
    if (!this.ws) return;
    this.ws.removeAllListeners('open');
    this.ws.removeAllListeners('message');
    this.ws.removeAllListeners('close');
    this.ws.removeAllListeners('error');
    this.ws.on('error', () => {});
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      try {
        this.ws.terminate();
      } catch {
        /* 忽略 */
      }
    }
    this.ws = null;
  }
}
