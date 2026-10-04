/**
 * 职责：
 *  - WS 启动辅助（鉴权握手+订阅+初始同步）；
 * 关键依赖：
 *  - ha-ws-protocol.util；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { EntityStateCacheReader, EntityStateCacheWriter } from '../../shared/ha/entity-state-cache.interface';
import type { HaStateIngressCoalesceService } from '../../shared/ha/state-ingress-coalesce.service';
import type { EventBusService } from '../../shared/redis/event-bus.service';
import type { HaEntity } from '../../shared/types';
import { HA_EVENTS } from '../../shared/types';
import { getErrorMessage, BusinessException, ErrorCode } from '../../common/utils';
import { API_ERROR } from '../../common/errors/api-error-messages';
import type { HaConnectorWsLifecycleState } from './ws-lifecycle.types';
import type { Logger } from '@nestjs/common';

type HaConnectorWsBootstrapCallbacks = {
  logger: Logger;
  eventBus: EventBusService;
  entityCacheReader: EntityStateCacheReader;
  entityCacheWriter: EntityStateCacheWriter;
  ingressCoalesce: HaStateIngressCoalesceService;
  ensureEntityRegistryLoaded: () => Promise<void>;
  sendWsMessage: (payload: Record<string, unknown>) => void;
  startHeartbeat: () => void;
  scheduleReconnect: () => void;
  /** live 订阅成功后再广播 CONNECTED，避免注册表拉取抢占 HA WS */
  emitConnected: () => void | Promise<void>;
  /** 订阅就绪后再 flush 断连队列，避免命令在 live 之前发出 */
  flushCommandQueue: () => void;
  isDestroyed: () => boolean;
  isHaWsLeader: () => boolean;
  isWsAlive: () => boolean;
  markInitialStatesReady: () => void;
  purgeNonSyncableFromCache: () => void;
};

/** HA WS 认证后 bootstrap：订阅、快照、缓冲回放 */
export class HaConnectorWsBootstrap {
  /** 同一次认证会话内的原地重试次数（防止无限递归） */
  private inlineRetryCount = 0;
  private static readonly MAX_INLINE_RETRIES = 2;

  constructor(
    private readonly state: HaConnectorWsLifecycleState,
    private readonly callbacks: HaConnectorWsBootstrapCallbacks,
  ) {}

  /** 新认证会话开始时重置原地重试计数 */
  resetInlineRetries(): void {
    this.inlineRetryCount = 0;
  }

  async runAfterAuth(): Promise<void> {
    let keepBootstrapBuffer = false;
    try {
      // 原地重试时保留等待窗口内已捕获的 state_changed，避免清空后丢事件
      if (this.inlineRetryCount === 0) {
        this.state.bootstrapEventBuffer = [];
      }
      this.state.capturingBootstrapEvents = true;
      const subscribeStartedAt = new Date().toISOString();
      await this.subscribeToStateChangesOnce(3);

      // subscribe 成功后立即 live：停止缓冲、回放间隙事件、启动心跳
      this.state.capturingBootstrapEvents = false;
      this.reconcileBufferedEvents(subscribeStartedAt);
      this.state.bootstrapEventBuffer = [];
      this.callbacks.startHeartbeat();
      this.inlineRetryCount = 0;
      this.callbacks.flushCommandQueue();
      this.callbacks.logger.log('HA WS 已订阅 state_changed,实时推送已启用(全量状态异步拉取中)');
      await this.callbacks.emitConnected();

      // 注册表 / 次要订阅 / 全量快照均不阻塞 live；失败不拆连接
      void this.callbacks.ensureEntityRegistryLoaded().catch((err: unknown) => {
        this.callbacks.logger.warn(`实体注册表后台加载失败: ${getErrorMessage(err)}`);
      });
      await Promise.allSettled([
        this.subscribeToEntityRegistryUpdatesOnce(3),
        this.subscribeToAutomationTriggeredOnce(3),
      ]);
      void this.reconcileInitialStatesWithRetry();
    } catch (err: unknown) {
      this.callbacks.logger.error(`HA 启动引导失败: ${getErrorMessage(err)}`);
      if (this.callbacks.isDestroyed() || !this.callbacks.isHaWsLeader()) return;
      // WS 仍存活时原地再试订阅，避免 cleanup→重连→再挤爆 HA 的死循环
      if (
        this.callbacks.isWsAlive() &&
        this.state.authenticated &&
        this.inlineRetryCount < HaConnectorWsBootstrap.MAX_INLINE_RETRIES
      ) {
        this.inlineRetryCount++;
        keepBootstrapBuffer = true;
        this.state.capturingBootstrapEvents = true;
        this.callbacks.logger.warn(
          `订阅失败但 HA WS 仍存活,3s 后原地重试引导(${this.inlineRetryCount}/${HaConnectorWsBootstrap.MAX_INLINE_RETRIES})...`,
        );
        await new Promise((r) => setTimeout(r, 3_000));
        if (
          !this.callbacks.isDestroyed() &&
          this.callbacks.isHaWsLeader() &&
          this.callbacks.isWsAlive() &&
          this.state.authenticated
        ) {
          void this.runAfterAuth();
        }
        return;
      }
      this.inlineRetryCount = 0;
      this.callbacks.scheduleReconnect();
    } finally {
      if (!keepBootstrapBuffer) {
        this.state.capturingBootstrapEvents = false;
        this.state.bootstrapEventBuffer = [];
      }
    }
  }

  /** 实时推送已就绪后后台拉取全量快照；失败指数退避重试，不触发整链重连 */
  private async reconcileInitialStatesWithRetry(maxAttempts = 5): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (this.callbacks.isDestroyed() || !this.callbacks.isHaWsLeader()) return;
      if (!this.state.connected || !this.state.authenticated) return;
      try {
        await this.fetchAllStatesOnce(120_000);
        return;
      } catch (err: unknown) {
        const delayMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
        this.callbacks.logger.warn(
          `拉取全量状态失败 (${attempt}/${maxAttempts}),${delayMs}ms 后重试:${getErrorMessage(err)}`,
        );
        if (attempt >= maxAttempts) {
          this.callbacks.logger.error(
            '拉取全量状态多次失败:保持实时推送;可稍后手动"刷新实体"补齐快照',
          );
          return;
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  reconcileBufferedEvents(subscribeStartedAt: string): void {
    const buffered = this.state.bootstrapEventBuffer;
    if (!buffered.length) return;

    const subscribeMs = Date.parse(subscribeStartedAt);
    let replayed = 0;
    for (const event of buffered) {
      const eventMs = event.changed_at ? Date.parse(event.changed_at) : NaN;
      if (!Number.isFinite(eventMs) || eventMs < subscribeMs) continue;

      const existing = this.callbacks.entityCacheReader.getById(event.entity_id);
      const snapshotUpdated = existing?.last_updated ? Date.parse(existing.last_updated) : 0;
      if (!Number.isFinite(snapshotUpdated) || eventMs >= snapshotUpdated) {
        this.callbacks.ingressCoalesce.enqueue(event);
        replayed++;
      }
    }
    if (replayed > 0) {
      this.callbacks.logger.debug(`启动引导缓冲回放 ${replayed}/${buffered.length} 条状态变更`);
    }
  }

  fetchAllStatesOnce(timeoutMs: number): Promise<number> {
    const id = this.state.messageId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.state.pendingResults.has(id)) return;
        this.state.pendingResults.delete(id);
        this.callbacks.logger.warn(
          '拉取全量状态超时(大户型可检查 HA 负载或网络),保持未就绪直至重试成功',
        );
        reject(new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.HA_GET_STATES_TIMEOUT));
      }, timeoutMs);

      this.state.pendingResults.set(id, {
        resolve: (result: unknown) => {
          clearTimeout(timeout);
          if (Array.isArray(result)) {
            this.state.lastInitialStates = result as HaEntity[];
            this.callbacks.logger.log(`📦 收到 ${result.length} 个实体初始状态`);
            const syncPlan = this.callbacks.entityCacheWriter.syncInitialStatesFromHa(
              result as HaEntity[],
            );
            this.callbacks.purgeNonSyncableFromCache();
            this.callbacks.eventBus.emit(HA_EVENTS.INITIAL_STATES, syncPlan);
            this.callbacks.markInitialStatesReady();
            resolve(result.length);
          } else {
            this.callbacks.logger.warn('全量状态返回非数组,跳过全量同步');
            reject(
              new BusinessException(
                ErrorCode.EXTERNAL_ERROR,
                API_ERROR.HA_GET_STATES_INVALID_RESPONSE,
              ),
            );
          }
        },
        reject: (err: unknown) => {
          clearTimeout(timeout);
          reject(err);
        },
        timeout,
      });
      this.callbacks.sendWsMessage({ id, type: 'get_states' });
    });
  }

  private subscribeToStateChangesOnce(maxAttempts = 3): Promise<void> {
    const attempt = (left: number): Promise<void> => {
      const id = this.state.messageId++;
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!this.state.pendingResults.has(id)) return;
          this.state.pendingResults.delete(id);
          reject(
            new BusinessException(ErrorCode.EXTERNAL_ERROR, API_ERROR.HA_SUBSCRIBE_EVENTS_TIMEOUT),
          );
        }, 30_000);

        this.state.pendingResults.set(id, {
          resolve: () => {
            clearTimeout(timeout);
            resolve();
          },
          reject: (err: unknown) => {
            clearTimeout(timeout);
            reject(err);
          },
          timeout,
        });
        this.callbacks.sendWsMessage({ id, type: 'subscribe_events', event_type: 'state_changed' });
      }).catch((err: unknown) => {
        if (left <= 1) throw err;
        this.callbacks.logger.warn(
          `subscribe_events 失败,重试 (${maxAttempts - left + 1}/${maxAttempts}): ${getErrorMessage(err)}`,
        );
        return attempt(left - 1);
      });
    };
    return attempt(maxAttempts);
  }

  private subscribeToEntityRegistryUpdatesOnce(maxAttempts = 3): Promise<void> {
    const attempt = (left: number): Promise<void> => {
      const id = this.state.messageId++;
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!this.state.pendingResults.has(id)) return;
          this.state.pendingResults.delete(id);
          reject(
            new BusinessException(
              ErrorCode.EXTERNAL_ERROR,
              API_ERROR.HA_SUBSCRIBE_ENTITY_REGISTRY_TIMEOUT,
            ),
          );
        }, 15_000);

        this.state.pendingResults.set(id, {
          resolve: () => {
            clearTimeout(timeout);
            resolve();
          },
          reject: (err: unknown) => {
            clearTimeout(timeout);
            reject(err);
          },
          timeout,
        });
        this.callbacks.sendWsMessage({
          id,
          type: 'subscribe_events',
          event_type: 'entity_registry_updated',
        });
      }).catch((err: unknown) => {
        if (left <= 1) {
          this.callbacks.logger.warn(
            `entity_registry_updated 订阅失败,隐藏/禁用变更需重连后生效: ${getErrorMessage(err)}`,
          );
          return;
        }
        this.callbacks.logger.warn(
          `entity_registry_updated 订阅重试 (${maxAttempts - left + 1}/${maxAttempts})`,
        );
        return attempt(left - 1);
      });
    };
    return attempt(maxAttempts);
  }

  /**
   * 订阅 HA automation.triggered 事件（runOnHa 自动化执行结果回读）。
   */
  private subscribeToAutomationTriggeredOnce(maxAttempts = 3): Promise<void> {
    const attempt = (left: number): Promise<void> => {
      const id = this.state.messageId++;
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!this.state.pendingResults.has(id)) return;
          this.state.pendingResults.delete(id);
          reject(
            new BusinessException(
              ErrorCode.EXTERNAL_ERROR,
              API_ERROR.HA_SUBSCRIBE_AUTOMATION_TIMEOUT,
            ),
          );
        }, 15_000);

        this.state.pendingResults.set(id, {
          resolve: () => {
            clearTimeout(timeout);
            resolve();
          },
          reject: (err: unknown) => {
            clearTimeout(timeout);
            reject(err);
          },
          timeout,
        });
        this.callbacks.sendWsMessage({
          id,
          type: 'subscribe_events',
          event_type: 'automation.triggered',
        });
      }).catch((err: unknown) => {
        if (left <= 1) {
          this.callbacks.logger.warn(
            `automation.triggered 订阅失败,runOnHa 自动化执行结果回读需重连后生效: ${getErrorMessage(err)}`,
          );
          return;
        }
        this.callbacks.logger.warn(
          `automation.triggered 订阅重试 (${maxAttempts - left + 1}/${maxAttempts})`,
        );
        return attempt(left - 1);
      });
    };
    return attempt(maxAttempts);
  }
}
