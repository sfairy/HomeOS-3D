/**
 * 职责：
 *  - WS 原始连接建立+心跳+onclose路由；
 * 关键依赖：
 *  - ws；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import WebSocket from 'ws';
import type { EventBusService } from '../../shared/redis/event-bus.service';
import { HA_EVENTS } from '../../shared/types';
import { getErrorMessage } from '../../common/utils';
import type { HaConfigService } from './ha-config.service';
import type { HaConnectorWsLifecycleState } from './ws-lifecycle.types';
import { HA_WS_HANDSHAKE_TIMEOUT_MS, HA_WS_LAN_CONNECT_TIMEOUT_MS } from './types';
import type { Logger } from '@nestjs/common';

type HaWsActiveSource = 'primary' | 'fallback';

/** 当前 WebSocket 走局域网还是外网 */
export function haWsSourceLabel(source: HaWsActiveSource | undefined): string {
  return source === 'fallback' ? '外网' : '局域网';
}

/**
 * 局域网失败且已配置外网：属预期切换，不应打 ERROR。
 * 外网失败、或未配置备用时仍按错误处理。
 */
export function isHaWsExpectedLanFailover(state: {
  activeSource?: HaWsActiveSource;
  hasFallback?: boolean;
}): boolean {
  return state.activeSource !== 'fallback' && !!state.hasFallback;
}

type HaConnectorWsConnectionCallbacks = {
  logger: Logger;
  config: HaConfigService;
  eventBus: EventBusService;
  setupEventHandlers: () => void;
  scheduleReconnect: () => void;
  /** 当前重连次数（用于周期探测局域网） */
  getReconnectAttempt?: () => number;
};

/** 安全丢弃旧套接字，避免监听器残留导致重连风暴 */
function disposeSocket(ws: WebSocket | null | undefined): void {
  if (!ws) return;
  try {
    ws.removeAllListeners('open');
    ws.removeAllListeners('message');
    ws.removeAllListeners('close');
    ws.removeAllListeners('error');
    ws.on('error', () => {});
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
  } catch {
    /* 忽略 */
  }
}

/** HA WebSocket 连接建立（doConnect） */
export async function connectHaWebSocket(
  state: HaConnectorWsLifecycleState,
  callbacks: HaConnectorWsConnectionCallbacks,
): Promise<void> {
  const runtime = await callbacks.config.getRuntimeConfig({
    reconnectAttempt: callbacks.getReconnectAttempt?.() ?? 0,
  });
  const { haUrl, token, activeSource, haUrlFallback } = runtime;
  if (!haUrl || !token) {
    callbacks.logger.warn('HA 未配置,正在待机...');
    callbacks.eventBus.emit(HA_EVENTS.DISCONNECTED, { reason: 'unconfigured' });
    return;
  }

  state.currentHaUrl = haUrl;
  state.currentHaToken = token;
  state.activeSource = activeSource;
  state.hasFallback = !!haUrlFallback;
  const wsUrl = haUrl.replace(/\/$/, '').replace(/^http/, 'ws') + '/api/websocket';
  const sourceLabel = haWsSourceLabel(activeSource);
  callbacks.logger.log(`正在连接 HA WebSocket(${sourceLabel}):${wsUrl}`);
  if (activeSource === 'primary' && haUrlFallback) {
    callbacks.logger.debug(`已配置外网:${haUrlFallback}`);
  }

  // 建连前丢弃残留套接字，防止旧 close 回调与新连接交错
  disposeSocket(state.ws);
  state.ws = null;
  state.connected = false;
  state.authenticated = false;

  // 建连看门狗：ws 的 handshakeTimeout 只覆盖已完成 TCP 连接的握手阶段，
  // 对「TCP 尚未连上」不生效（Bun/Node 下会一直挂到操作系统级 TCP 建连超时，
  // 不可达的 macOS 约 75s）。探局域网且已配置外网时用短超时，快速 failover 到外网。
  const lanProbe = activeSource === 'primary' && !!haUrlFallback;
  const connectTimeoutMs = lanProbe ? HA_WS_LAN_CONNECT_TIMEOUT_MS : HA_WS_HANDSHAKE_TIMEOUT_MS;

  try {
    const ws = new WebSocket(wsUrl, {
      handshakeTimeout: HA_WS_HANDSHAKE_TIMEOUT_MS,
      perMessageDeflate: false,
    });
    state.ws = ws;
    callbacks.setupEventHandlers();

    const connectGuard = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) return;
      callbacks.logger.log(
        `HA WebSocket 建连超时(${connectTimeoutMs}ms,${sourceLabel}),中止本次连接以便快速切换`,
      );
      // CONNECTING 阶段 terminate 会 destroy 底层请求并触发 close → scheduleReconnect；
      // 再显式调度一次兜底（scheduleReconnect 以 reconnectTimer 去重，重复调用无副作用）。
      try {
        ws.terminate();
      } catch {
        /* 忽略：close / 显式调度已覆盖重连 */
      }
      callbacks.scheduleReconnect();
    }, connectTimeoutMs);
    const clearConnectGuard = () => clearTimeout(connectGuard);
    ws.once('open', clearConnectGuard);
    ws.once('close', clearConnectGuard);
  } catch (err: unknown) {
    const detail = getErrorMessage(err);
    if (isHaWsExpectedLanFailover(state)) {
      callbacks.logger.log(`局域网 WebSocket 不可达(已配置外网):${detail}`);
    } else {
      callbacks.logger.error(
        `创建 WebSocket 失败(${haWsSourceLabel(state.activeSource)}):${detail}`,
      );
    }
    callbacks.scheduleReconnect();
  }
}
