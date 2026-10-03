/**
 * 所属模块：backend/modules/ha-connector
 * 职责：
 *  - 指数退避重连+领导切换感知；
 * 关键依赖：
 *  - shared/redis leader-election；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { EntityStateCacheReader, EntityStateCacheWriter } from '../../shared/ha/entity-state-cache.interface';
import type { HaStateIngressCoalesceService } from '../../shared/ha/state-ingress-coalesce.service';
import type { EventBusService } from '../../shared/redis/event-bus.service';
import type { HaReconnectingEvent, HaEntity } from '../../shared/types';
import { HA_EVENTS } from '../../shared/types';
import { getErrorMessage } from '../../common/utils';
import { HA_WS_RECONNECT_INITIAL_MS } from './types';
import type { HaRestClientService } from './ha-rest-client.service';
import type { HaWsLeaderService } from './ha-ws-leader.service';
import { computeReconnectDelayMs } from './ha-ws-protocol.util';
import type { Logger } from '@nestjs/common';

type HaConnectorWsDisconnectPollCallbacks = {
  logger: Logger;
  eventBus: EventBusService;
  restClient: HaRestClientService;
  entityCacheReader: EntityStateCacheReader;
  entityCacheWriter: EntityStateCacheWriter;
  ingressCoalesce: HaStateIngressCoalesceService;
  haLeader: HaWsLeaderService;
  getHaCfg: () => {
    disconnectRestPollEnabled: boolean;
    disconnectRestPollIntervalMs: number;
    disconnectRestPollInitialDelayMs: number;
    disconnectRestPollTimeoutMs: number;
  };
  isConnected: () => boolean;
  isDestroyed: () => boolean;
};

/** 参与变更指纹的关键 attributes（亮度/温度/开合等），避免仅属性变化时漏补 */
const FINGERPRINT_ATTR_KEYS = [
  'brightness',
  'color_temp',
  'rgb_color',
  'current_temperature',
  'temperature',
  'current_position',
  'percentage',
  'volume_level',
  'fan_mode',
  'hvac_action',
] as const;

/** HA WS 断连期间 REST 补同步轮询 */
export class HaConnectorWsDisconnectPoll {
  private disconnectPollInitialTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectPollTimer: ReturnType<typeof setInterval> | null = null;
  private disconnectPollRunning = false;
  /** 上次轮询的状态指纹：无任何实体更新时跳过 diff 与扇出，避免大实例每轮全量比对 */
  private lastPollFingerprint: string | null = null;

  constructor(private readonly callbacks: HaConnectorWsDisconnectPollCallbacks) {}

  start(): void {
    this.stop();
    this.lastPollFingerprint = null;
    const cfg = this.callbacks.getHaCfg();
    if (!cfg.disconnectRestPollEnabled || !this.callbacks.haLeader.isHaWsLeader()) return;

    const tick = () => void this.run();
    this.disconnectPollInitialTimer = setTimeout(() => {
      this.disconnectPollInitialTimer = null;
      void tick();
      this.disconnectPollTimer = setInterval(tick, cfg.disconnectRestPollIntervalMs);
    }, cfg.disconnectRestPollInitialDelayMs);
    this.callbacks.logger.log(
      `HA WS 断连:${cfg.disconnectRestPollInitialDelayMs / 1000}s 后启动 REST 补同步(间隔 ${cfg.disconnectRestPollIntervalMs / 1000}s)`,
    );
  }

  stop(): void {
    if (this.disconnectPollInitialTimer) {
      clearTimeout(this.disconnectPollInitialTimer);
      this.disconnectPollInitialTimer = null;
    }
    if (this.disconnectPollTimer) {
      clearInterval(this.disconnectPollTimer);
      this.disconnectPollTimer = null;
    }
  }

  /**
   * 计算全量状态的轻量变更指纹。
   * 基于 last_updated + state + 少量关键 attributes（亮度/温度/开合等），
   * 避免仅属性变化时漏补；仍不做全量 attributes 深比较。
   *
   * 实现为 FNV-1a 增量滚动 hash：逐字段混入，O(1) 额外内存；
   * 原实现每次轮询拼接全量指纹长字符串，大实例（2000+ 实体）在断连轮询
   * 期间每秒产生数百 KB 临时字符串，GC 压力明显。
   */
  private fingerprintStates(states: HaEntity[]): string {
    if (!states.length) return '0';
    let h = 0x811c9dc5; // FNV-1a 32-bit offset basis
    const mix = (v: string) => {
      for (let i = 0; i < v.length; i++) {
        h ^= v.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      h ^= 0xff; // 字段分隔，避免 "ab"+"c" 与 "a"+"bc" 结构性碰撞
      h = Math.imul(h, 0x01000193) >>> 0;
    };
    mix(String(states.length));
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      mix(s.entity_id ?? '');
      mix(s.last_updated ?? '');
      mix(s.state ?? '');
      const attrs = s.attributes as Record<string, unknown> | undefined;
      if (attrs) {
        for (const key of FINGERPRINT_ATTR_KEYS) {
          const v = attrs[key];
          if (v != null) mix(String(v));
        }
      }
    }
    return h.toString(36);
  }

  private async run(): Promise<void> {
    const { isConnected, isDestroyed, haLeader, logger } = this.callbacks;
    if (isConnected() || isDestroyed()) {
      this.stop();
      return;
    }
    if (!haLeader.isHaWsLeader() || this.disconnectPollRunning) return;

    this.disconnectPollRunning = true;
    try {
      const states = await this.callbacks.restClient.fetchAllStates(
        this.callbacks.getHaCfg().disconnectRestPollTimeoutMs,
      );
      if (isConnected() || isDestroyed()) return;
      if (!states.length) return;

      // 变更过滤：与上次轮询指纹一致说明无任何实体更新，直接跳过 diff 与扇出
      const fingerprint = this.fingerprintStates(states);
      if (fingerprint === this.lastPollFingerprint) return;
      this.lastPollFingerprint = fingerprint;

      const { full, changes } = this.callbacks.entityCacheWriter.applyRestPollStates(states);
      if (full) {
        this.callbacks.eventBus.emit(HA_EVENTS.INITIAL_STATES, {
          _syncPlan: true,
          entities: this.callbacks.entityCacheReader.getAll(),
        });
        logger.log(`HA 断连 REST 全量补同步 ${this.callbacks.entityCacheReader.getCount()} 实体`);
        return;
      }

      if (changes.length === 0) return;

      for (const change of changes) {
        this.callbacks.ingressCoalesce.enqueue(change);
      }
      logger.debug(`HA 断连 REST 增量补同步 ${changes.length} 条变更`);
    } catch (err: unknown) {
      logger.debug(`HA 断连 REST 补同步失败: ${getErrorMessage(err)}`);
    } finally {
      this.disconnectPollRunning = false;
    }
  }
}

type HaConnectorWsReconnectCallbacks = {
  logger: Logger;
  eventBus: EventBusService;
  haLeader: HaWsLeaderService;
  getHaCfg: () => { reconnectBaseMs: number; maxReconnectDelayMs: number };
  isDestroyed: () => boolean;
  connect: () => Promise<void>;
  cleanup: (opts?: { rejectCommands?: boolean }) => void;
  invalidateConfigCache: () => void;
  notifyConnectFailure?: () => void;
  /** 局域网失败且已配置外网时，重连提示降为普通日志 */
  isExpectedLanFailover?: () => boolean;
};

/** HA WebSocket 重连退避与 auth_invalid 有限重试 */
export class HaConnectorWsReconnect {
  private reconnectCount = 0;
  private reconnectDelay = HA_WS_RECONNECT_INITIAL_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private authInvalidPaused = false;
  private authInvalidAttempts = 0;
  private authProbeTimer: NodeJS.Timeout | null = null;
  private static readonly AUTH_INVALID_MAX_ATTEMPTS = 5;
  /** auth_invalid 暂停后低频探测 Token 是否已更新的间隔（毫秒） */
  private static readonly AUTH_INVALID_PROBE_INTERVAL_MS = 5 * 60_000;

  constructor(private readonly callbacks: HaConnectorWsReconnectCallbacks) {}

  getReconnectCount(): number {
    return this.reconnectCount;
  }

  getReconnectDelay(): number {
    return this.reconnectDelay;
  }

  setReconnectDelay(ms: number): void {
    this.reconnectDelay = ms;
  }

  isAuthInvalidPaused(): boolean {
    return this.authInvalidPaused;
  }

  resetAuthInvalidOnEnable(): void {
    this.authInvalidPaused = false;
    this.authInvalidAttempts = 0;
    this.stopAuthInvalidProbe();
  }

  resetOnAuthOk(): void {
    this.reconnectDelay = this.callbacks.getHaCfg().reconnectBaseMs;
    this.reconnectCount = 0;
    this.authInvalidAttempts = 0;
    this.authInvalidPaused = false;
    this.stopAuthInvalidProbe();
  }

  resetDelayFromConfig(): void {
    this.reconnectDelay = this.callbacks.getHaCfg().reconnectBaseMs;
  }

  clearAuthInvalidOnConfigUpdate(): void {
    this.authInvalidPaused = false;
    this.authInvalidAttempts = 0;
    this.stopAuthInvalidProbe();
  }

  clearTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopAuthInvalidProbe();
  }

  /** 启动 auth_invalid 暂停后的低频探测：Token 更新后自动恢复连接，无需人工重启 */
  private startAuthInvalidProbe(): void {
    this.stopAuthInvalidProbe();
    this.authProbeTimer = setInterval(() => {
      void this.authInvalidProbeTick();
    }, HaConnectorWsReconnect.AUTH_INVALID_PROBE_INTERVAL_MS);
    this.callbacks.logger.log(
      `HA 认证失败已暂停自动重连,每 ${HaConnectorWsReconnect.AUTH_INVALID_PROBE_INTERVAL_MS / 60_000} 分钟低频探测 Token 是否已更新`,
    );
  }

  private stopAuthInvalidProbe(): void {
    if (this.authProbeTimer) {
      clearInterval(this.authProbeTimer);
      this.authProbeTimer = null;
    }
  }

  /**
   * 探测回调：临时解除暂停执行一次连接。
   * 失败会再次走 onAuthInvalid（重新暂停并继续周期探测）；
   * 成功后 onAuthOk 清空暂停并停掉探测。
   */
  private async authInvalidProbeTick(): Promise<void> {
    const { isDestroyed, haLeader, connect } = this.callbacks;
    if (isDestroyed() || !haLeader.isHaWsLeader() || !this.authInvalidPaused) {
      this.stopAuthInvalidProbe();
      return;
    }
    // 每次探测重置失败计数：探测失败后重新走有限重试（最多 5 次）再暂停，避免永久静默
    this.authInvalidAttempts = 0;
    this.authInvalidPaused = false;
    try {
      await connect();
    } catch (err: unknown) {
      this.callbacks.logger.warn(`HA 认证恢复探测连接失败:${getErrorMessage(err)}`);
      if (!isDestroyed() && haLeader.isHaWsLeader()) {
        this.authInvalidPaused = true;
      }
    }
  }

  schedule(): void {
    const { isDestroyed, haLeader, logger, eventBus, getHaCfg, connect, cleanup, notifyConnectFailure } =
      this.callbacks;
    if (isDestroyed() || this.reconnectTimer || !haLeader.isHaWsLeader()) return;
    if (this.authInvalidPaused) return;
    notifyConnectFailure?.();
    this.reconnectCount++;
    const delay = computeReconnectDelayMs(
      this.reconnectCount - 1,
      getHaCfg().reconnectBaseMs,
      getHaCfg().maxReconnectDelayMs,
    );
    this.reconnectDelay = delay;
    const lanFailover = this.callbacks.isExpectedLanFailover?.() === true;
    if (lanFailover) {
      logger.log(`局域网未连通,将在 ${delay / 1000}s 后重试...(第 ${this.reconnectCount} 次)`);
    } else {
      logger.warn(`将在 ${delay / 1000}s 后重连...(第 ${this.reconnectCount} 次)`);
    }
    eventBus.emit(HA_EVENTS.RECONNECTING, {
      attempt: this.reconnectCount,
      delay,
    } satisfies HaReconnectingEvent);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      cleanup({ rejectCommands: false });
      void connect().catch((err: unknown) => {
        const detail = getErrorMessage(err);
        if (this.callbacks.isExpectedLanFailover?.()) {
          logger.log(`局域网重连未成功(已配置外网):${detail}`);
        } else {
          logger.error(`重连失败:${detail}`);
        }
        this.schedule();
      });
    }, delay);
  }

  onAuthInvalid(): void {
    const { logger, eventBus, invalidateConfigCache, cleanup, isDestroyed, haLeader, connect } =
      this.callbacks;
    this.authInvalidAttempts++;
    logger.error(`HA 认证失败(第 ${this.authInvalidAttempts} 次),请检查 HA_TOKEN`);
    invalidateConfigCache();
    cleanup();
    eventBus.emit(HA_EVENTS.DISCONNECTED, {
      reason: 'auth_invalid',
      attempts: this.authInvalidAttempts,
    });

    if (this.authInvalidAttempts >= HaConnectorWsReconnect.AUTH_INVALID_MAX_ATTEMPTS) {
      this.authInvalidPaused = true;
      this.startAuthInvalidProbe();
      logger.error(`HA 认证连续失败 ${this.authInvalidAttempts} 次,暂停重连并低频探测 Token 更新`);
      return;
    }

    const delay = Math.min(
      60_000,
      this.callbacks.getHaCfg().reconnectBaseMs * 2 ** (this.authInvalidAttempts - 1),
    );
    logger.warn(`将在 ${delay / 1000}s 后重试 HA 认证...`);
    this.clearTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (isDestroyed() || !haLeader.isHaWsLeader()) return;
      void connect().catch((err: unknown) => {
        logger.error(`认证重试连接失败:${getErrorMessage(err)}`);
      });
    }, delay);
  }
}
