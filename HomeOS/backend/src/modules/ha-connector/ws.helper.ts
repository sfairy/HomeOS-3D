/**
 * 所属模块：backend/modules/ha-connector
 * 职责：
 *  - WS 通用辅助（重连事件/错误归一化/ready）；
 * 关键依赖：
 *  - ws EventEmitter；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import WebSocket from 'ws';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { BusinessException, ErrorCode, getErrorMessage } from '../../common/utils';
import type { HaConnectorWsLifecycleDeps, HaConnectorWsLifecycleState } from './ws-lifecycle.types';
import { createHaConnectorWsLifecycleState } from './ws-lifecycle.types';
import type { HaConnectedEvent, HaEntity } from '../../shared/types';
import { HA_EVENTS } from '../../shared/types';
import type { HaWsPendingResult } from './types';
import { connectHaWebSocket, isHaWsExpectedLanFailover } from './ha-ws-connection.util';
import { HaConnectorWsHeartbeat } from './ha-ws-heartbeat.helper';
import { HaConnectorWsDisconnectPoll, HaConnectorWsReconnect } from './ha-ws-reconnect.helper';
import { HaConnectorWsBootstrap } from './ha-ws-bootstrap.helper';
import { HaConnectorWsMessageRouting } from './ha-ws-routing.helper';


/** HA WebSocket 连接生命周期：认证、bootstrap、重连、断连 REST 补同步 */
export class HaConnectorWsLifecycle {
  private readonly state: HaConnectorWsLifecycleState;
  private readonly heartbeat: HaConnectorWsHeartbeat;
  private readonly disconnectPoll: HaConnectorWsDisconnectPoll;
  private readonly reconnect: HaConnectorWsReconnect;
  private readonly bootstrap: HaConnectorWsBootstrap;
  private readonly messageRouting: HaConnectorWsMessageRouting;

  constructor(private readonly deps: HaConnectorWsLifecycleDeps) {
    this.state = createHaConnectorWsLifecycleState();

    this.heartbeat = new HaConnectorWsHeartbeat({
      logger: deps.logger,
      isConnected: () => this.isConnected(),
      getWs: () => this.state.ws,
      nextMessageId: () => this.nextMessageId(),
      sendWsMessage: (payload) => this.sendWsMessage(payload),
      onTimeout: () => this.heartbeat.onTimeout(),
      getHeartbeatCfg: () => {
        const cfg = deps.getHaCfg();
        return {
          wsPingIntervalMs: cfg.wsPingIntervalMs,
          wsPongTimeoutMs: cfg.wsPongTimeoutMs,
          wsHeartbeatMaxMisses: cfg.wsHeartbeatMaxMisses,
        };
      },
    });

    this.disconnectPoll = new HaConnectorWsDisconnectPoll({
      logger: deps.logger,
      eventBus: deps.eventBus,
      restClient: deps.restClient,
      entityCacheReader: deps.entityCacheReader,
      entityCacheWriter: deps.entityCacheWriter,
      ingressCoalesce: deps.ingressCoalesce,
      haLeader: deps.haLeader,
      getHaCfg: () => deps.getHaCfg(),
      isConnected: () => this.isConnected(),
      isDestroyed: () => this.state.destroyed,
    });

    this.reconnect = new HaConnectorWsReconnect({
      logger: deps.logger,
      eventBus: deps.eventBus,
      haLeader: deps.haLeader,
      getHaCfg: () => deps.getHaCfg(),
      isDestroyed: () => this.state.destroyed,
      connect: () => this.connect(),
      cleanup: (opts) => this.cleanup(opts),
      invalidateConfigCache: () => deps.config.invalidateCache(),
      notifyConnectFailure: () => deps.config.notifyConnectFailure(),
      isExpectedLanFailover: () => isHaWsExpectedLanFailover(this.state),
    });

    this.bootstrap = new HaConnectorWsBootstrap(this.state, {
      logger: deps.logger,
      eventBus: deps.eventBus,
      entityCacheReader: deps.entityCacheReader,
      entityCacheWriter: deps.entityCacheWriter,
      ingressCoalesce: deps.ingressCoalesce,
      ensureEntityRegistryLoaded: () => deps.ensureEntityRegistryLoaded(),
      sendWsMessage: (payload) => this.sendWsMessage(payload),
      startHeartbeat: () => this.heartbeat.start(),
      scheduleReconnect: () => this.reconnect.schedule(),
      emitConnected: async () => {
        const c = await deps.config.getConfig();
        deps.eventBus.emit(HA_EVENTS.CONNECTED, {
          ha_version: this.state.haVersion,
          ha_url: c.haUrl,
        } satisfies HaConnectedEvent);
      },
      flushCommandQueue: () => deps.commandQueue.flush(),
      isDestroyed: () => this.state.destroyed,
      isHaWsLeader: () => deps.haLeader.isHaWsLeader(),
      isWsAlive: () =>
        !!this.state.ws &&
        (this.state.ws.readyState === WebSocket.OPEN ||
          this.state.ws.readyState === WebSocket.CONNECTING),
      markInitialStatesReady: () => this.markInitialStatesReady(),
      purgeNonSyncableFromCache: () => deps.purgeNonSyncableFromCache(),
    });

    this.messageRouting = new HaConnectorWsMessageRouting(this.state, {
      logger: deps.logger,
      config: deps.config,
      eventBus: deps.eventBus,
      ingressCoalesce: deps.ingressCoalesce,
      commandQueue: deps.commandQueue,
      invalidateEntityRegistryCache: () => deps.invalidateEntityRegistryCache(),
      onEntityRegistryUpdated: () => deps.onEntityRegistryUpdated(),
      isEntitySyncable: (entityId) => deps.isEntitySyncable(entityId),
      sendWsMessage: (payload) => this.sendWsMessage(payload),
      handlePong: (msgId) => this.heartbeat.handlePong(msgId),
      onAuthOkBootstrap: () => {
        this.bootstrap.resetInlineRetries();
        return this.bootstrap.runAfterAuth();
      },
      onAuthInvalid: () => this.reconnect.onAuthInvalid(),
      stopDisconnectRestPoll: () => this.disconnectPoll.stop(),
      startDisconnectRestPoll: () => this.disconnectPoll.start(),
      stopHeartbeat: () => this.heartbeat.stop(),
      markHeartbeatAlive: () => this.heartbeat.markAlive(),
      scheduleReconnect: () => this.reconnect.schedule(),
      isDestroyed: () => this.state.destroyed,
      isHaWsLeader: () => deps.haLeader.isHaWsLeader(),
      getIntentionalReconnect: () => deps.getIntentionalReconnect(),
      resetReconnectOnAuthOk: () => {
        this.reconnect.resetOnAuthOk();
        deps.config.notifyConnectSuccess(this.state.currentHaUrl);
        deps.restClient.invalidateCache();
      },
    });
  }

  getDestroyed(): boolean {
    return this.state.destroyed;
  }

  setDestroyed(value: boolean): void {
    this.state.destroyed = value;
    if (value === false) {
      this.reconnect.resetAuthInvalidOnEnable();
    }
  }

  setReconnectDelay(ms: number): void {
    this.reconnect.setReconnectDelay(ms);
  }

  isConnected(): boolean {
    return this.state.connected && !!this.state.ws;
  }

  getWs(): WebSocket | null {
    return this.state.ws;
  }

  nextMessageId(): number {
    return this.state.messageId++;
  }

  getStatusFields(): {
    connected: boolean;
    ha_url: string;
    ha_version: string;
    last_connected_at: string;
    reconnect_count: number;
  } {
    return {
      connected: this.state.connected,
      ha_url: this.state.currentHaUrl,
      ha_version: this.state.haVersion,
      last_connected_at: this.state.lastConnectedAt,
      reconnect_count: this.reconnect.getReconnectCount(),
    };
  }

  getCurrentCredentials(): { haUrl: string; haToken: string } {
    return { haUrl: this.state.currentHaUrl, haToken: this.state.currentHaToken };
  }

  isInitialStatesReady(): boolean {
    return this.state.initialStatesReady;
  }

  getLastInitialStates(): HaEntity[] | null {
    return this.state.lastInitialStates;
  }

  clearInitialStatesSnapshot(): void {
    this.state.lastInitialStates = null;
  }

  hasInitialStatesSnapshot(): boolean {
    return (this.state.lastInitialStates?.length ?? 0) > 0;
  }

  waitUntilInitialStatesReady(timeoutMs = 120_000): Promise<boolean> {
    if (this.state.initialStatesReady) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        removeWaiter();
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      const wake = () => finish(true);
      const removeWaiter = () => {
        const idx = this.state.initialStatesWaiters.indexOf(wake);
        if (idx >= 0) this.state.initialStatesWaiters.splice(idx, 1);
      };
      this.state.initialStatesWaiters.push(wake);
    });
  }

  waitForInitialStates(timeoutMs = 15_000): Promise<void> {
    if (this.state.initialStatesReady) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        removeWaiter();
        resolve();
      };
      const timer = setTimeout(() => finish(), timeoutMs);
      const wake = () => finish();
      const removeWaiter = () => {
        const idx = this.state.initialStatesWaiters.indexOf(wake);
        if (idx >= 0) this.state.initialStatesWaiters.splice(idx, 1);
      };
      this.state.initialStatesWaiters.push(wake);
    });
  }

  addPendingResult(id: number, result: HaWsPendingResult): void {
    this.state.pendingResults.set(id, result);
  }

  deletePendingResult(id: number): boolean {
    return this.state.pendingResults.delete(id);
  }

  addEventSubscription(id: number, handler: (event: Record<string, unknown>) => void): void {
    this.state.eventSubscriptions.set(id, handler);
  }

  removeEventSubscription(id: number): void {
    this.state.eventSubscriptions.delete(id);
  }

  hasPendingResult(id: number): boolean {
    return this.state.pendingResults.has(id);
  }

  sendWsMessage(payload: Record<string, unknown>): void {
    if (!this.state.ws || this.state.ws.readyState !== WebSocket.OPEN) {
      throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, API_ERROR.HA_WS_NOT_CONNECTED);
    }
    this.state.ws.send(JSON.stringify(payload));
  }

  async requestStateResync(timeoutMs = 120_000): Promise<number> {
    if (!this.state.connected || !this.state.ws) {
      throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, API_ERROR.HA_NOT_CONNECTED);
    }
    this.state.initialStatesReady = false;
    this.state.lastInitialStates = null;
    // 刷新前确保注册表/屏蔽索引就绪，避免过滤开关刚变更时仍用空/旧索引
    await this.deps.ensureEntityRegistryLoaded();
    return this.bootstrap.fetchAllStatesOnce(timeoutMs);
  }

  connect(): Promise<void> {
    if (
      this.state.destroyed ||
      this.reconnect.isAuthInvalidPaused() ||
      !this.deps.haLeader.isHaWsLeader()
    ) {
      return Promise.resolve();
    }
    if (this.state.connectInflight) return this.state.connectInflight;
    this.state.connectInflight = this.doConnect().finally(() => {
      this.state.connectInflight = null;
    });
    return this.state.connectInflight;
  }

  cleanup(opts?: { rejectCommands?: boolean }): void {
    const rejectCommands = opts?.rejectCommands !== false;
    this.heartbeat.stop();
    this.disconnectPoll.stop();
    this.reconnect.clearTimer();
    for (const pending of this.state.pendingResults.values()) {
      clearTimeout(pending.timeout);
      pending.reject(
        new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, API_ERROR.HA_WS_CONNECTION_CLOSED),
      );
    }
    this.state.pendingResults.clear();
    this.state.eventSubscriptions.clear();
    if (rejectCommands) {
      this.deps.commandQueue.rejectAll(API_ERROR.HA_WS_CONNECTION_CLOSED);
    }
    if (this.state.ws) {
      this.state.ws.removeAllListeners('open');
      this.state.ws.removeAllListeners('message');
      this.state.ws.removeAllListeners('close');
      this.state.ws.removeAllListeners('error');
      this.state.ws.on('error', () => {});
      if (
        this.state.ws.readyState === WebSocket.OPEN ||
        this.state.ws.readyState === WebSocket.CONNECTING
      ) {
        try {
          this.state.ws.terminate();
        } catch (e: unknown) {
          const msg = getErrorMessage(e);
          this.deps.logger.debug(`HA WebSocket 终止: ${msg}`);
        }
      }
      this.state.ws = null;
    }
    this.state.connected = false;
    this.state.authenticated = false;
  }

  startDisconnectRestPoll(): void {
    this.disconnectPoll.start();
  }

  stopDisconnectRestPoll(): void {
    this.disconnectPoll.stop();
  }

  onFollowerDisconnect(): void {
    this.state.connected = false;
    this.state.authenticated = false;
  }

  onAppConfigUpdated(keys: string[]): void {
    // profiles 切换会改变激活方案下的 HA 凭证，需与 haConnector 变更同等处理
    if (!keys.includes('haConnector') && !keys.includes('profiles')) return;
    this.reconnect.resetDelayFromConfig();
    if (keys.some((k) => k === 'haConnector' || k === 'ha' || k === 'profiles')) {
      this.reconnect.clearAuthInvalidOnConfigUpdate();
      if (!this.state.connected && !this.state.destroyed && this.deps.haLeader.isHaWsLeader()) {
        void this.connect().catch((err: unknown) => {
          this.deps.logger.warn(
            `HA WebSocket 重连失败: ${getErrorMessage(err)}`,
          );
        });
      }
    }
    if (!this.state.connected && !this.state.destroyed && this.deps.haLeader.isHaWsLeader()) {
      this.disconnectPoll.start();
    } else if (this.state.connected) {
      this.disconnectPoll.stop();
    }
  }

  private async doConnect(): Promise<void> {
    await connectHaWebSocket(this.state, {
      logger: this.deps.logger,
      config: this.deps.config,
      eventBus: this.deps.eventBus,
      setupEventHandlers: () => this.messageRouting.setupEventHandlers(),
      scheduleReconnect: () => this.reconnect.schedule(),
      getReconnectAttempt: () => this.reconnect.getReconnectCount(),
    });
  }

  private markInitialStatesReady(): void {
    if (this.state.initialStatesReady) return;
    this.state.initialStatesReady = true;
    for (const wake of this.state.initialStatesWaiters) wake();
    this.state.initialStatesWaiters.length = 0;
  }
}

/** 通用 HA WebSocket 请求（如 render_template、entity_registry/remove） */
export function sendHaWsRequest<T = unknown>(
  wsLifecycle: HaConnectorWsLifecycle,
  type: string,
  extra?: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<T> {
  if (!wsLifecycle.isConnected()) {
    throw new BusinessException(ErrorCode.SERVICE_UNAVAILABLE, API_ERROR.HA_WS_NOT_CONNECTED);
  }
  const id = wsLifecycle.nextMessageId();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (wsLifecycle.hasPendingResult(id)) {
        wsLifecycle.deletePendingResult(id);
        reject(
          new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.HA_WS_REQUEST_TIMEOUT(type)),
        );
      }
    }, timeoutMs);
    wsLifecycle.addPendingResult(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
      timeout,
    });
    try {
      wsLifecycle.sendWsMessage({ id, type, ...(extra || {}) });
    } catch (e: unknown) {
      clearTimeout(timeout);
      wsLifecycle.deletePendingResult(id);
      reject(e);
    }
  });
}
