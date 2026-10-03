/**
 * 所属模块：backend/modules/ha-connector
 * 职责：
 *  - WS 消息按entity_id/类型路由；
 * 关键依赖：
 *  - shared/ha state-pipeline；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import WebSocket from 'ws';
import type { HaStateIngressCoalesceService } from '../../shared/ha/state-ingress-coalesce.service';
import type { EventBusService } from '../../shared/redis/event-bus.service';
import type { HaStateChangeEvent } from '../../shared/types';
import { HA_EVENTS } from '../../shared/types';
import { getErrorMessage } from '../../common/utils';
import type { HaConfigService } from './ha-config.service';
import type { HaConnectorCommandQueue } from './command-queue.helper';
import type { HaConnectorWsLifecycleState } from './ws-lifecycle.types';
import type { HaWsMessage } from './types';
import { parseHaAutomationTriggeredEvent, parseHaStateChangedEvent, resolveHaWsPendingResult } from './ha-ws-protocol.util';
import {
  addHaWsDeferredDropped,
  recordHaSyncLatency,
} from '../../common/observability/ha-sync-latency.util';
import { HaWsDeferredEventQueue } from './ha-ws-message-queue.util';
import { classifyHaWsIngressText } from './ha-ws-control-message.util';
import { haWsSourceLabel, isHaWsExpectedLanFailover } from './ha-ws-connection.util';
import type { Logger } from '@nestjs/common';

type DeferredRawFrame = { text: string; receivedAt: number };

/** WebSocket 关闭原因英文常见文案 → 中文（保留未知原文） */
function localizeWsCloseReason(raw?: string): string {
  const text = (raw || '').trim();
  if (!text) return '未知';
  const map: Record<string, string> = {
    'Connection ended': '连接已结束',
    'connection ended': '连接已结束',
    unknown: '未知',
  };
  return map[text] || text;
}

type HaConnectorWsMessageRoutingCallbacks = {
  logger: Logger;
  config: HaConfigService;
  eventBus: EventBusService;
  ingressCoalesce: HaStateIngressCoalesceService;
  commandQueue: HaConnectorCommandQueue;
  invalidateEntityRegistryCache: () => void;
  onEntityRegistryUpdated: () => Promise<void>;
  sendWsMessage: (payload: Record<string, unknown>) => void;
  handlePong: (msgId: number) => boolean;
  onAuthOkBootstrap: () => Promise<void>;
  onAuthInvalid: () => void;
  stopDisconnectRestPoll: () => void;
  startDisconnectRestPoll: () => void;
  stopHeartbeat: () => void;
  markHeartbeatAlive: () => void;
  scheduleReconnect: () => void;
  isDestroyed: () => boolean;
  isHaWsLeader: () => boolean;
  getIntentionalReconnect: () => boolean;
  resetReconnectOnAuthOk: () => void;
  isEntitySyncable: (entityId: string) => boolean;
};

/** HA WebSocket 入站消息路由：认证、result、event */
export class HaConnectorWsMessageRouting {
  /** 仅 event：延期 JSON.parse + 路由；result 同步，避免 pending 超时 */
  private readonly deferredRaw = new HaWsDeferredEventQueue<DeferredRawFrame>(
    (frame) => this.handleDeferredRaw(frame),
    (dropped) => {
      addHaWsDeferredDropped(dropped);
      this.callbacks.logger.warn(`HA WS 事件队列过载,丢弃最旧 ${dropped} 条以保护心跳`);
    },
  );

  constructor(
    private readonly state: HaConnectorWsLifecycleState,
    private readonly callbacks: HaConnectorWsMessageRoutingCallbacks,
  ) {}

  setupEventHandlers(): void {
    const ws = this.state.ws;
    if (!ws) return;
    this.deferredRaw.clear();

    ws.on('open', () =>
      this.callbacks.logger.log(
        `WebSocket 连接已建立(${haWsSourceLabel(this.state.activeSource)}),等待认证...`,
      ),
    );

    ws.on('message', (data: WebSocket.RawData) => {
      // 任意入站帧都刷新存活；parse 前先 mark，避免大体量 JSON 拖死心跳判定
      this.callbacks.markHeartbeatAlive();
      const text = data.toString();
      const kind = classifyHaWsIngressText(text);
      if (kind === 'control-sync') {
        let msg: HaWsMessage;
        try {
          msg = JSON.parse(text) as HaWsMessage;
        } catch (err: unknown) {
          this.callbacks.logger.error(`解析控制消息失败:${getErrorMessage(err)}`);
          return;
        }
        if (msg.type === 'pong' && this.callbacks.handlePong(Number(msg.id ?? -1))) {
          return;
        }
        this.handleMessage(msg);
        return;
      }
      // 大 result 优先、不可丢；普通 event 可过载丢弃
      this.deferredRaw.enqueue(
        { text, receivedAt: Date.now() },
        { priority: kind === 'result-defer' },
      );
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.deferredRaw.clear();
      const wasConnected = this.state.connected;
      const reasonText = localizeWsCloseReason(reason?.toString());
      this.state.connected = false;
      this.state.authenticated = false;
      this.callbacks.stopHeartbeat();
      const sourceLabel = haWsSourceLabel(this.state.activeSource);
      const lanFailover = isHaWsExpectedLanFailover(this.state);
      if (wasConnected) {
        if (lanFailover) {
          this.callbacks.logger.log(
            `局域网 WebSocket 不可达(已配置外网):${code} ${reasonText}`,
          );
        } else {
          this.callbacks.logger.warn(`WebSocket 已关闭(${sourceLabel}):${code} ${reasonText}`);
        }
        this.callbacks.eventBus.emit(HA_EVENTS.DISCONNECTED, {
          reason: reasonText,
        });
        this.callbacks.startDisconnectRestPoll();
      } else {
        // 1002 + Expected 101：握手未升到 WebSocket，多为反代/CDN 未放行或偶发失败
        const hint =
          code === 1002 || /Expected 101/i.test(reasonText)
            ? '（握手失败：请确认反代已开启 WebSocket，或远程 HA 网络抖动）'
            : '';
        if (lanFailover) {
          this.callbacks.logger.log(
            `局域网 WebSocket 不可达(已配置外网):${code} ${reasonText}${hint}`,
          );
        } else {
          this.callbacks.logger.warn(
            `WebSocket 在认证前关闭(${sourceLabel}):${code} ${reasonText}${hint}`,
          );
        }
      }
      if (
        !this.callbacks.isDestroyed() &&
        this.callbacks.isHaWsLeader() &&
        !this.callbacks.getIntentionalReconnect()
      ) {
        this.callbacks.scheduleReconnect();
      }
    });

    ws.on('error', (err: Error) => {
      if (isHaWsExpectedLanFailover(this.state)) {
        // close 会给出用户可见提示；此处仅保留排障细节
        this.callbacks.logger.debug(`局域网 WebSocket 错误(已配置外网):${err.message}`);
        return;
      }
      this.callbacks.logger.error(
        `WebSocket 错误(${haWsSourceLabel(this.state.activeSource)}):${err.message}`,
      );
    });
  }

  private handleDeferredRaw(frame: DeferredRawFrame): void {
    recordHaSyncLatency('ha_deferred_dwell', Math.max(0, Date.now() - frame.receivedAt));
    let msg: HaWsMessage;
    try {
      msg = JSON.parse(frame.text) as HaWsMessage;
    } catch (err: unknown) {
      this.callbacks.logger.error(`解析延迟消息失败:${getErrorMessage(err)}`);
      return;
    }
    if (msg.type === 'event') {
      this.handleEvent(msg, frame.receivedAt);
      return;
    }
    // 启发式漏检的控制面消息仍可安全落入同步处理路径
    this.handleMessage(msg);
  }

  handleMessage(msg: HaWsMessage): void {
    // markAlive / pong 已在 message 回调入口处理；此处保留兼容直接调用
    this.callbacks.markHeartbeatAlive();
    if (msg.type === 'pong' && this.callbacks.handlePong(Number(msg.id ?? -1))) {
      return;
    }
    switch (msg.type) {
      case 'auth_required':
        // 同步回 auth：勿 await getConfig（缓存过期会查 DB，延迟期间 HA/代理可能先关连接）
        this.authenticate();
        break;
      case 'auth_ok':
        this.onAuthOk(msg);
        break;
      case 'auth_invalid':
        this.callbacks.onAuthInvalid();
        break;
      case 'result':
        this.handleResult(msg);
        break;
      case 'event':
        this.handleEvent(msg, Date.now());
        break;
    }
  }

  /**
   * 收到 auth_required 后立即用建连时缓存的 token 回认证。
   * 不走异步 getConfig，避免慢连后缓存失效再查 DB，导致未完成认证就被对端断开，
   * 进而 sendWsMessage 抛出未捕获的 SERVICE_UNAVAILABLE。
   */
  private authenticate(): void {
    const token = this.state.currentHaToken;
    if (!token) {
      this.callbacks.logger.error('HA_TOKEN 未设置!');
      return;
    }
    const ws = this.state.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      this.callbacks.logger.warn('收到 auth_required 时 WebSocket 已不可用,等待重连');
      return;
    }
    try {
      ws.send(JSON.stringify({ type: 'auth', access_token: token }));
    } catch (err: unknown) {
      this.callbacks.logger.warn(`发送 HA 认证消息失败:${getErrorMessage(err)}`);
    }
  }

  private onAuthOk(msg: HaWsMessage): void {
    this.state.authenticated = true;
    this.state.connected = true;
    this.state.haVersion = msg.ha_version ?? '';
    this.state.lastConnectedAt = new Date().toISOString();
    this.callbacks.resetReconnectOnAuthOk();
    this.state.initialStatesReady = false;
    this.state.lastInitialStates = null;
    this.callbacks.invalidateEntityRegistryCache();
    this.callbacks.logger.log(
      `✅ 已连接到 HA ${this.state.haVersion}(${haWsSourceLabel(this.state.activeSource)})`,
    );
    this.callbacks.stopDisconnectRestPoll();

    // CONNECTED 延后到 bootstrap 完成 state_changed 订阅后再广播，
    // 避免 CONNECTED 监听方抢跑注册表请求挤死 subscribe_events。
    void this.callbacks.onAuthOkBootstrap();
  }

  private handleResult(msg: HaWsMessage): void {
    resolveHaWsPendingResult(msg, this.state.pendingResults, getErrorMessage);
  }

  private handleEvent(msg: HaWsMessage, receivedAt = Date.now()): void {
    if (msg.id !== undefined && this.state.eventSubscriptions.has(msg.id)) {
      const raw = msg.event;
      if (raw && typeof raw === 'object') {
        const handler = this.state.eventSubscriptions.get(msg.id);
        if (handler) handler(raw as Record<string, unknown>);
      }
      return;
    }
    const payload = parseHaStateChangedEvent(msg);
    if (payload) {
      const t0 = Date.now();
      const event = {
        ...(payload as HaStateChangeEvent),
        pipeline_ts: receivedAt,
      } satisfies HaStateChangeEvent;
      // 注册表就绪后丢弃禁用/隐藏，避免 coalesce / Hot Path 空转
      if (event.new_state && !this.callbacks.isEntitySyncable(event.entity_id)) {
        recordHaSyncLatency('ha_receive', Date.now() - t0);
        return;
      }
      if (this.state.capturingBootstrapEvents) {
        this.state.bootstrapEventBuffer.push(event);
        recordHaSyncLatency('ha_receive', Date.now() - t0);
        return;
      }
      this.callbacks.ingressCoalesce.enqueue(event);
      recordHaSyncLatency('ha_receive', Date.now() - t0);
      return;
    }
    if (msg.event?.event_type === 'entity_registry_updated') {
      void this.callbacks.onEntityRegistryUpdated().catch((err: unknown) => {
        this.callbacks.logger.warn(`实体注册表更新事件处理失败: ${getErrorMessage(err)}`);
      });
      return;
    }
    // runOnHa 自动化执行结果回读：HA 每次触发自动化都会广播 automation.triggered，
    // 仅在 HA WS Leader 收到，直接经事件总线分发供 automation 模块写入执行历史
    const automationTriggered = parseHaAutomationTriggeredEvent(msg);
    if (automationTriggered) {
      this.callbacks.eventBus.emit(HA_EVENTS.AUTOMATION_TRIGGERED, automationTriggered);
    }
  }
}
