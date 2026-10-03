/**
 * 所属模块：backend/modules/ha-connector
 * 职责：
 *  - WS 心跳+RTT采样（给ha-sync-latency指标）；
 * 关键依赖：
 *  - ha-sync-latency.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import WebSocket from 'ws';
import {
  HA_WS_PING_INTERVAL_MS,
  HA_WS_PONG_TIMEOUT_MS,
  HA_WS_HEARTBEAT_MAX_MISSES,
} from './types';
import type { Logger } from '@nestjs/common';

type HaWsHeartbeatCfg = {
  wsPingIntervalMs: number;
  wsPongTimeoutMs: number;
  wsHeartbeatMaxMisses: number;
};

type HaConnectorWsHeartbeatCallbacks = {
  logger: Logger;
  isConnected: () => boolean;
  getWs: () => WebSocket | null;
  nextMessageId: () => number;
  sendWsMessage: (payload: Record<string, unknown>) => void;
  onTimeout: () => void;
  getHeartbeatCfg?: () => Partial<HaWsHeartbeatCfg>;
};

/** HA WebSocket 应用层 ping/pong 心跳 */
export class HaConnectorWsHeartbeat {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatPongTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatPingId: number | null = null;
  private missCount = 0;
  private lastAliveAt = 0;

  constructor(private readonly callbacks: HaConnectorWsHeartbeatCallbacks) {}

  private cfg(): HaWsHeartbeatCfg {
    const c = this.callbacks.getHeartbeatCfg?.() ?? {};
    return {
      wsPingIntervalMs: c.wsPingIntervalMs ?? HA_WS_PING_INTERVAL_MS,
      wsPongTimeoutMs: c.wsPongTimeoutMs ?? HA_WS_PONG_TIMEOUT_MS,
      wsHeartbeatMaxMisses: c.wsHeartbeatMaxMisses ?? HA_WS_HEARTBEAT_MAX_MISSES,
    };
  }

  /** 任意入站流量（含 state_changed）视为连接存活，并取消等待中的 ping */
  markAlive(): void {
    this.lastAliveAt = Date.now();
    if (this.heartbeatPingId !== null) {
      this.clearPongTimer();
      this.heartbeatPingId = null;
      this.missCount = 0;
    }
  }

  handlePong(msgId: number): boolean {
    if (this.heartbeatPingId === null) return false;
    if (Number(msgId) !== Number(this.heartbeatPingId)) return false;
    this.clearPongTimer();
    this.heartbeatPingId = null;
    this.missCount = 0;
    this.markAlive();
    return true;
  }

  start(): void {
    this.stop();
    this.missCount = 0;
    this.markAlive();
    const { wsPingIntervalMs } = this.cfg();
    this.heartbeatTimer = setInterval(() => this.sendPing(), wsPingIntervalMs);
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearPongTimer();
    this.heartbeatPingId = null;
    this.missCount = 0;
  }

  private clearPongTimer(): void {
    if (this.heartbeatPongTimer) {
      clearTimeout(this.heartbeatPongTimer);
      this.heartbeatPongTimer = null;
    }
  }

  private sendPing(): void {
    const { isConnected, getWs, nextMessageId, sendWsMessage } = this.callbacks;
    const ws = getWs();
    if (!isConnected() || !ws || ws.readyState !== WebSocket.OPEN) return;

    const { wsPingIntervalMs, wsPongTimeoutMs } = this.cfg();

    if (this.lastAliveAt > 0 && Date.now() - this.lastAliveAt < wsPingIntervalMs) {
      this.missCount = 0;
      return;
    }

    if (this.heartbeatPingId !== null) {
      this.registerMiss('上一轮 ping 未在间隔内收到 pong');
      return;
    }

    const id = nextMessageId();
    this.heartbeatPingId = id;
    try {
      sendWsMessage({ id, type: 'ping' });
    } catch {
      this.heartbeatPingId = null;
      return;
    }
    this.heartbeatPongTimer = setTimeout(() => {
      // 长同步任务（如备份 stringify）结束后 timers 往往先于 WS I/O 回调；
      // 先 setImmediate 让出一拍，优先消化已入站的 pong，避免误判超时。
      setImmediate(() => {
        if (this.heartbeatPingId === null) return;
        this.registerMiss(`pong 超时 ${wsPongTimeoutMs}ms`);
      });
    }, wsPongTimeoutMs);
  }

  private registerMiss(reason: string): void {
    this.clearPongTimer();
    this.heartbeatPingId = null;
    this.missCount += 1;
    const { logger, onTimeout } = this.callbacks;
    const maxMisses = this.cfg().wsHeartbeatMaxMisses;
    if (this.missCount < maxMisses) {
      logger.warn(`HA WebSocket 心跳未响应(${this.missCount}/${maxMisses}):${reason}`);
      return;
    }
    logger.warn(
      `HA WebSocket 心跳连续 ${this.missCount} 次未响应,主动断开以触发重连(${reason})`,
    );
    onTimeout();
  }

  onTimeout(): void {
    this.clearPongTimer();
    this.heartbeatPingId = null;
    this.missCount = 0;
    this.stop();
    const ws = this.callbacks.getWs();
    if (ws) {
      try {
        ws.terminate();
      } catch {
        /* 忽略 */
      }
    }
  }
}
