/**
 * 状态广播 Helper：批量缓冲与推送 HA 状态变更（Hot Path 即时 + 批推）。
 *
 * 职责：
 * - 三档缓冲：关键域（critical，~4ms）/ 钉选传感器（pinned，~16ms）/ 普通（sensor，~常规间隔）。
 * - 按订阅分组签名缓存 visiblePayloads，避免对每个 socket 重复过滤；同组多 socket 复用同一 packet。
 * - 背压检测：socket 写缓冲超阈值时改发 resync_suggested，关键/钉选仍走可靠 emit。
 * - 模块销毁 / 配置变更时刷出缓冲并重排定时器，避免热重载丢最后一批增量。
 *
 * 关键依赖：AppConfigService（wsPush 配置）、backpressure.util、delta.util、subscription.util、
 * ha-sync-latency.util（延迟采样）。
 */
import type { AppConfigService } from '../../shared/app-config/service';
import type { HaStateChangeEvent } from '../../shared/types';
import { WS_PUSH_CRITICAL_DOMAINS } from './gateway.config';
import type { JwtUserLike } from '@homeos/shared';
import { getEntityDomain, isEntityAllowed, WS_CLIENT_EVENTS } from '@homeos/shared';
import { Server, type Socket } from 'socket.io';
import { isSocketBackpressured, emitResyncSuggested } from './backpressure.util';
import { toWsStateChangePayload } from './delta.util';
import { isEntityVisibleToClient } from './subscription.util';
import { recordHaSyncLatency } from '../../common/observability/ha-sync-latency.util';

const DEFAULT_CRITICAL_DOMAINS = [...WS_PUSH_CRITICAL_DOMAINS];

interface WsPushStateBroadcastDeps {
  getServer: () => Server;
  appConfig: AppConfigService;
}

/** 批量缓冲与广播 HA 状态变更（Hot Path + 批推） */
export class WsPushStateBroadcastHelper {
  private stateBuffer: HaStateChangeEvent[] = [];
  private stateFlushTimer: NodeJS.Timeout | null = null;
  /** 关键域缓冲 */
  private criticalBuffer: HaStateChangeEvent[] = [];
  private criticalFlushTimer: NodeJS.Timeout | null = null;
  /** 钉选传感器短窗口缓冲 */
  private pinnedSensorBuffer: HaStateChangeEvent[] = [];
  private pinnedSensorFlushTimer: NodeJS.Timeout | null = null;
  /** 关键域 Set 缓存：isCriticalEntity 在每事件热路径调用，避免逐事件 new Set */
  private criticalDomainsCache: Set<string> | null = null;

  constructor(private readonly deps: WsPushStateBroadcastDeps) {}

  /** 模块销毁时先刷出缓冲再清理定时器，避免热重载丢最后一批增量 */
  dispose(): void {
    this.flushStateBuffer();
    this.flushCriticalBuffer();
    this.flushPinnedSensorBuffer();
  }

  /** 当前 wsPush 配置快照（每次读取均从 AppConfigService 取最新值） */
  private get wsCfg() {
    return this.deps.appConfig.get('wsPush');
  }

  /** 获取关键域 Set（缓存，配置变更时由 rescheduleStateFlushTimer 失效） */
  getCriticalDomains(): Set<string> {
    if (this.criticalDomainsCache) return this.criticalDomainsCache;
    const configured = this.wsCfg.criticalDomains;
    const list =
      Array.isArray(configured) && configured.length > 0 ? configured : DEFAULT_CRITICAL_DOMAINS;
    this.criticalDomainsCache = new Set(list);
    return this.criticalDomainsCache;
  }

  /** 判定实体所属域是否在关键域集合中（每事件热路径调用，依赖 Set 缓存） */
  private isCriticalEntity(entityId: string): boolean {
    const domain = getEntityDomain(entityId);
    return this.getCriticalDomains().has(domain);
  }

  /** 任意已连接客户端将 entity 钉选时，走短窗口 */
  private isPinnedByAnyClient(entityId: string): boolean {
    const server = this.deps.getServer();
    for (const socket of server.sockets.sockets.values()) {
      const pinned = socket.data?.pinnedEntityIds as Set<string> | null | undefined;
      if (pinned?.has(entityId)) return true;
    }
    return false;
  }

  /**
   * 过滤本批次对指定客户端可见的 payload。
   * 同时校验用户访问权限（isEntityAllowed）与订阅可见性（isEntityVisibleToClient）。
   */
  private filterVisiblePayloads<T>(
    changes: HaStateChangeEvent[],
    payloads: T[],
    user: JwtUserLike,
    subscribed: Set<string> | null | undefined,
    pinned: Set<string> | null | undefined,
    criticalDomains: Set<string>,
    coldOnDemand: boolean,
  ): T[] {
    const visiblePayloads: T[] = [];
    for (let i = 0; i < changes.length; i++) {
      const event = changes[i];
      const domainOk = isEntityVisibleToClient(
        event.entity_id,
        subscribed,
        pinned,
        criticalDomains,
        coldOnDemand,
      );
      if (isEntityAllowed(event.entity_id, user) && domainOk) {
        visiblePayloads.push(payloads[i]);
      }
    }
    return visiblePayloads;
  }

  /** 单事件 Hot Path 入口：转批量接口处理 */
  applyStateChangedHot(event: HaStateChangeEvent) {
    this.applyStateChangedHotBatch([event]);
  }

  /** Hot Path 批量：合并 ingress flush，减少 WS 定时器调度 */
  applyStateChangedHotBatch(events: HaStateChangeEvent[]) {
    if (!events.length) return;
    const critical: HaStateChangeEvent[] = [];
    const pinnedSensors: HaStateChangeEvent[] = [];
    const profile = this.wsCfg.latencyProfile ?? 'realtime';
    const usePinnedFastPath = profile === 'realtime' || profile === 'balanced';

    for (const event of events) {
      if (this.isCriticalEntity(event.entity_id)) {
        critical.push(event);
      } else if (usePinnedFastPath && this.isPinnedByAnyClient(event.entity_id)) {
        pinnedSensors.push(event);
      } else {
        this.stateBuffer.push(event);
      }
    }

    if (critical.length) {
      this.criticalBuffer.push(...critical);
      if (this.criticalBuffer.length >= this.wsCfg.stateBatchMax) {
        this.flushCriticalBuffer();
      } else if (!this.criticalFlushTimer) {
        const ms = this.wsCfg.criticalFlushIntervalMs ?? 4;
        if (ms <= 0) {
          this.flushCriticalBuffer();
        } else {
          this.criticalFlushTimer = setTimeout(() => this.flushCriticalBuffer(), ms);
        }
      }
    }

    if (pinnedSensors.length) {
      this.pinnedSensorBuffer.push(...pinnedSensors);
      if (this.pinnedSensorBuffer.length >= this.wsCfg.stateBatchMax) {
        this.flushPinnedSensorBuffer();
      } else if (!this.pinnedSensorFlushTimer) {
        const ms = this.wsCfg.pinnedSensorFlushIntervalMs ?? 16;
        if (ms <= 0) {
          this.flushPinnedSensorBuffer();
        } else {
          this.pinnedSensorFlushTimer = setTimeout(() => this.flushPinnedSensorBuffer(), ms);
        }
      }
    }

    const interval = this.wsCfg.sensorFlushIntervalMs ?? this.wsCfg.stateFlushIntervalMs;
    if (this.stateBuffer.length >= this.wsCfg.stateBatchMax) {
      this.flushStateBuffer();
    } else if (!this.stateFlushTimer && this.stateBuffer.length > 0) {
      this.stateFlushTimer = setTimeout(() => this.flushStateBuffer(), interval);
    }
  }

  /** 刷出普通传感器缓冲：清定时器并按 reliable=false 走 volatile emit */
  private flushStateBuffer() {
    if (this.stateFlushTimer) {
      clearTimeout(this.stateFlushTimer);
      this.stateFlushTimer = null;
    }
    if (this.stateBuffer.length === 0) return;
    const raw = this.stateBuffer.splice(0);
    this.emitChangesBatch(raw, { reliable: false });
  }

  /** 刷出关键域缓冲：可靠 emit，确保关键实体变化必达 */
  private flushCriticalBuffer() {
    if (this.criticalFlushTimer) {
      clearTimeout(this.criticalFlushTimer);
      this.criticalFlushTimer = null;
    }
    if (this.criticalBuffer.length === 0) return;
    const raw = this.criticalBuffer.splice(0);
    this.emitChangesBatch(raw, { reliable: true });
  }

  /** 刷出钉选传感器缓冲：可靠推送，避免背压下假「断同步」 */
  private flushPinnedSensorBuffer() {
    if (this.pinnedSensorFlushTimer) {
      clearTimeout(this.pinnedSensorFlushTimer);
      this.pinnedSensorFlushTimer = null;
    }
    if (this.pinnedSensorBuffer.length === 0) return;
    const raw = this.pinnedSensorBuffer.splice(0);
    // 钉选传感器：可靠推送，避免背压下假「断同步」
    this.emitChangesBatch(raw, { reliable: true });
  }

  /** 配置变更后按新间隔重排 critical / pinned / sensor 批推定时器 */
  rescheduleStateFlushTimer() {
    // wsPush 配置可能改了 criticalDomains，失效缓存使下次热路径按新配置重建
    this.criticalDomainsCache = null;
    if (this.stateFlushTimer) {
      clearTimeout(this.stateFlushTimer);
      this.stateFlushTimer = null;
      if (this.stateBuffer.length > 0) {
        const interval = this.wsCfg.sensorFlushIntervalMs ?? this.wsCfg.stateFlushIntervalMs;
        this.stateFlushTimer = setTimeout(() => this.flushStateBuffer(), interval);
      }
    }
    if (this.criticalFlushTimer) {
      clearTimeout(this.criticalFlushTimer);
      this.criticalFlushTimer = null;
      if (this.criticalBuffer.length > 0) {
        const ms = this.wsCfg.criticalFlushIntervalMs ?? 4;
        this.criticalFlushTimer =
          ms <= 0
            ? null
            : setTimeout(() => this.flushCriticalBuffer(), ms);
        if (ms <= 0) this.flushCriticalBuffer();
      }
    }
    if (this.pinnedSensorFlushTimer) {
      clearTimeout(this.pinnedSensorFlushTimer);
      this.pinnedSensorFlushTimer = null;
      if (this.pinnedSensorBuffer.length > 0) {
        const ms = this.wsCfg.pinnedSensorFlushIntervalMs ?? 16;
        this.pinnedSensorFlushTimer =
          ms <= 0
            ? null
            : setTimeout(() => this.flushPinnedSensorBuffer(), ms);
        if (ms <= 0) this.flushPinnedSensorBuffer();
      }
    }
  }

  /**
   * 同批次内按 entity_id 合并多次事件，保留最新 new_state 与最早 old_state，
   * 减少同一实体多次变化时的推送次数与 payload 大小。
   */
  private coalesceBatchByEntity(raw: HaStateChangeEvent[]): HaStateChangeEvent[] {
    const merged = new Map<string, HaStateChangeEvent>();
    for (const event of raw) {
      const prev = merged.get(event.entity_id);
      if (!prev) {
        merged.set(event.entity_id, event);
        continue;
      }
      merged.set(event.entity_id, {
        entity_id: event.entity_id,
        old_state: prev.old_state ?? event.old_state,
        new_state: event.new_state,
        changed_at: event.changed_at,
        pipeline_ts: prev.pipeline_ts ?? event.pipeline_ts,
      });
    }
    return Array.from(merged.values());
  }

  /**
   * 计算订阅分组签名：role + restrictions + domains + pinnedKey。
   * 同签名客户端复用同一 packet，避免对每个 socket 重复过滤与构造。
   * 签名缓存在 socket.data.subscriptionGroupSig，配置变更时由 gateway 失效。
   */
  private getGroupSignature(
    socket: Socket,
    user: JwtUserLike,
    subscribed: Set<string> | null | undefined,
    pinned: Set<string> | null | undefined,
    coldOnDemand: boolean,
  ): string {
    const cached = socket.data?.subscriptionGroupSig as string | undefined;
    if (typeof cached === 'string') return cached;
    const restrictions = user.restrictions?.length ? [...user.restrictions].sort().join(',') : '';
    const domains = subscribed?.size ? [...subscribed].sort().join(',') : '*';
    const pinnedKey = coldOnDemand && pinned?.size ? [...pinned].sort().join(',') : '';
    const key = `${user.role || 'user'}|${restrictions}|${domains}|${pinnedKey}`;
    if (socket.data) socket.data.subscriptionGroupSig = key;
    return key;
  }

  /**
   * 批量推送状态变更到所有在线客户端。
   * 流程：coalesceByEntity → toWsStateChangePayload → 按订阅分组（或逐 socket）过滤可见 payload →
   * 按 reliable 标志走 emit / volatile emit；背压时改发 resync_suggested，关键/钉选仍可靠 emit。
   * @param opts.reliable - true 时全部走可靠 emit（关键域/钉选传感器批次）
   */
  private emitChangesBatch(raw: HaStateChangeEvent[], opts?: { reliable?: boolean }) {
    if (raw.length === 0) return;
    const t0 = Date.now();
    const changes = this.coalesceBatchByEntity(raw);
    if (changes.length === 0) return;

    const batchReliable = opts?.reliable === true;
    const server = this.deps.getServer();
    const timestamp = new Date().toISOString();
    const criticalDomains = this.getCriticalDomains();
    const payloads = changes.map((event) => toWsStateChangePayload(event));
    const coldOnDemand = this.deps.appConfig.get('wsPush').coldEntityOnDemand ?? true;
    const roomBatchEmit = this.deps.appConfig.get('wsPush').roomBatchEmit ?? true;

    const emitToSocket = (
      socket: Socket,
      packet: Record<string, unknown>,
      preferReliable: boolean,
    ) => {
      const backpressured = isSocketBackpressured(socket);
      if (backpressured) {
        // 背压：关键/钉选仍尝试可靠 emit；其余发 RESYNC
        if (preferReliable) {
          socket.emit(WS_CLIENT_EVENTS.STATE_CHANGED_BATCH, packet);
        }
        emitResyncSuggested(socket);
        return;
      }
      if (preferReliable) {
        socket.emit(WS_CLIENT_EVENTS.STATE_CHANGED_BATCH, packet);
      } else {
        socket.volatile.emit(WS_CLIENT_EVENTS.STATE_CHANGED_BATCH, packet);
      }
    };

    if (!roomBatchEmit) {
      for (const socket of server.sockets.sockets.values()) {
        const user = socket.data?.user as JwtUserLike | undefined;
        if (!user) continue;
        const subscribed = socket.data?.subscribedDomains as Set<string> | null | undefined;
        const pinned = socket.data?.pinnedEntityIds as Set<string> | null | undefined;
        const visiblePayloads = this.filterVisiblePayloads(
          changes,
          payloads,
          user,
          subscribed,
          pinned,
          criticalDomains,
          coldOnDemand,
        );
        if (visiblePayloads.length === 0) continue;
        // 批次含钉选实体时对该客户端可靠推送
        const hasPinned =
          batchReliable ||
          (pinned != null && changes.some((c) => pinned.has(c.entity_id)));
        emitToSocket(
          socket,
          {
            type: 'state_changed_batch',
            changes: visiblePayloads,
            count: visiblePayloads.length,
            timestamp,
          },
          hasPinned,
        );
      }
      recordHaSyncLatency('ws_emit', Date.now() - t0);
      return;
    }

    const groups = new Map<
      string,
      {
        sockets: Socket[];
        user: JwtUserLike;
        subscribed: Set<string> | null | undefined;
        pinned: Set<string> | null | undefined;
      }
    >();

    for (const socket of server.sockets.sockets.values()) {
      const user = socket.data?.user as JwtUserLike | undefined;
      if (!user) continue;
      const subscribed = socket.data?.subscribedDomains as Set<string> | null | undefined;
      const pinned = socket.data?.pinnedEntityIds as Set<string> | null | undefined;
      const key = this.getGroupSignature(socket, user, subscribed, pinned, coldOnDemand);
      let group = groups.get(key);
      if (!group) {
        group = { sockets: [], user, subscribed, pinned };
        groups.set(key, group);
      }
      group.sockets.push(socket);
    }

    for (const group of groups.values()) {
      const visiblePayloads = this.filterVisiblePayloads(
        changes,
        payloads,
        group.user,
        group.subscribed,
        group.pinned,
        criticalDomains,
        coldOnDemand,
      );
      if (visiblePayloads.length === 0) continue;
      const pinned = group.pinned;
      const hasPinned =
        batchReliable ||
        (pinned != null && changes.some((c) => pinned.has(c.entity_id)));
      const packet = {
        type: 'state_changed_batch',
        changes: visiblePayloads,
        count: visiblePayloads.length,
        timestamp,
      };
      for (const socket of group.sockets) {
        emitToSocket(socket, packet, hasPinned);
      }
    }
    recordHaSyncLatency('ws_emit', Date.now() - t0);
  }
}
