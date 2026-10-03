/**
 * WebSocket 客户端连接生命周期 Helper：鉴权、首推、断线重放、错峰重推。
 *
 * 所属模块：ws-push
 * 职责：
 * - 处理 Socket.IO 客户端握手：商业授权校验、Cookie JWT 鉴权、订阅分组、用户房间归集。
 * - 完成 initial_states 推送：等 HA 同步 → 区域补全 → 按权限过滤 → 分块/单条自适应。
 * - HA 全量就绪后向所有在线客户端错峰重推；支持断线期间增量变化的增量重推（resyncChanges）。
 * - 客户端重连时按 since/lastEventId 走 state_replay 补发遗漏的 state_changed 增量。
 *
 * 关键依赖：StateStoreService、HaConnectorService、EntityAreaEnrichmentService、
 * RedisService、JwtService、PrismaService、TokenVersionCacheService、SessionRevocationService、
 * AppConfigService、WsPushStateBroadcastHelper。
 */
import { getErrorMessage } from '../../common/utils';
import type { AppConfigService } from '../../shared/app-config/service';
import { sortEntitiesBySyncPriority } from '@homeos/shared';
import type { PrismaService } from '../../shared/prisma/service';
import type { RedisService } from '../../shared/redis/service';
import type { SessionRevocationService } from '../../common/http-security/session-revocation.service';
import type { TokenVersionCacheService } from '../../common/http-security/token-version-cache.service';
import type { HaEntity, HaStateChangeEvent } from '../../shared/types';
import type { HaConnectorService } from '../ha-connector/service';
import type { EntityAreaEnrichmentService } from '../state-store/entity-area-enrichment.service';
import type { StateStoreService } from '../state-store/service';
import type { JwtUserLike } from '@homeos/shared';
import {
  filterEntitiesByAccess,
  isEntityAllowed,
  resolveEntityRestrictions,
  WS_CLIENT_EVENTS,
} from '@homeos/shared';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { Server, type Socket } from 'socket.io';
import { extractAuthTokenFromCookie, resolveWsUserFromToken } from './auth.util';
import { buildRedisWsStatusPayload, parseStateReplayParams, shouldReplayState, toWsStateChangePayload } from './delta.util';
import { assignClientSubscription, isEntityVisibleToClient, resolveUserRoomKey } from './subscription.util';
import type { WsPushStateBroadcastHelper } from './state-broadcast.helper';

interface WsPushConnectionDeps {
  logger: Logger;
  getServer: () => Server;
  stateStore: StateStoreService;
  haConnector: HaConnectorService;
  entityAreaEnrichment: EntityAreaEnrichmentService;
  redisService: RedisService;
  config: ConfigService;
  jwtService: JwtService;
  prisma: PrismaService;
  tokenVersionCache: TokenVersionCacheService;
  sessionRevocation: SessionRevocationService;
  appConfig: AppConfigService;
  stateBroadcast: WsPushStateBroadcastHelper;
  /** 商业授权：未激活时拒绝 WS（与 HTTP LicenseGuard 对齐） */
  isLicenseAccessAllowed: () => boolean;
  getClientCount: () => number;
  setClientCount: (count: number) => void;
}

/** WebSocket 连接握手、首包推送与断线重放 */
export class WsPushConnectionHelper {
  constructor(private readonly deps: WsPushConnectionDeps) {}

  /** 当前 wsPush 配置快照（每次读取均从 AppConfigService 取最新值） */
  private get wsCfg() {
    return this.deps.appConfig.get('wsPush');
  }

  /**
   * 客户端握手入口：完成商业授权/JWT 鉴权 → 订阅分组 → 推送 HA/Redis 状态 → 等待 HA 同步 → 推送 initial_states。
   * 鉴权失败或授权未激活时立即 disconnect(true)，不计入在线计数。
   * 支持 since/lastEventId 走 state_replay 补发增量变化，避免重连漏数据。
   */
  async handleConnection(client: Socket): Promise<void> {
    if (!this.deps.isLicenseAccessAllowed()) {
      this.deps.logger.warn(`客户端 ${client.id} 商业授权未激活,拒绝 WebSocket 连接`);
      client.disconnect(true);
      return;
    }

    const token = extractAuthTokenFromCookie(client.handshake.headers.cookie);
    if (!token) {
      this.deps.logger.warn(`客户端 ${client.id} 未携带认证Cookie,拒绝连接`);
      client.disconnect(true);
      return;
    }
    let user: JwtUserLike;
    try {
      user = await resolveWsUserFromToken(
        token,
        this.deps.jwtService,
        this.deps.prisma,
        this.deps.tokenVersionCache,
        this.deps.sessionRevocation,
      );
    } catch (err: unknown) {
      const errMsg = getErrorMessage(err);
      this.deps.logger.warn(`客户端 ${client.id} Token 无效,拒绝连接: ${errMsg}`);
      client.disconnect(true);
      return;
    }

    client.data.user = user;
    client.join(resolveUserRoomKey(user, client.id));
    assignClientSubscription(
      client,
      client.handshake.auth?.subscribeDomains ?? client.handshake.query?.subscribeDomains,
      client.handshake.auth?.pinnedEntityIds ?? client.handshake.query?.pinnedEntityIds,
    );
    this.deps.setClientCount(this.deps.getClientCount() + 1);
    this.deps.logger.debug(`客户端已连接:${client.id}(总计:${this.deps.getClientCount()})`);

    // 先推 HA 状态，避免客户端在等 HA 全量时误以为掉线并过早 REST
    const haStatusEarly = this.deps.haConnector.getStatusSnapshot();
    client.emit(WS_CLIENT_EVENTS.HA_STATUS, {
      type: 'ha_status',
      status: haStatusEarly.connected ? 'connected' : 'disconnected',
      ha_version: haStatusEarly.ha_version,
      timestamp: new Date().toISOString(),
    });

    await this.waitForHaEntitySync();
    await this.deps.stateStore.recoverInitialStatesIfNeeded();
    await this.deps.entityAreaEnrichment.ensureLoaded();

    const sinceRaw = client.handshake.auth?.since ?? client.handshake.query?.since;
    const lastEventIdRaw =
      client.handshake.auth?.lastEventId ?? client.handshake.query?.lastEventId;
    const { sinceMs, lastEventId } = parseStateReplayParams(sinceRaw, lastEventIdRaw);

    const entities = this.deps.entityAreaEnrichment.enrichEntitiesSync(
      filterEntitiesByAccess(this.sortEntitiesForInitialPush(this.deps.stateStore.getAll()), user),
    );
    try {
      const push = client.data as {
        initialStatesEmitting?: boolean;
        initialStatesEmitted?: boolean;
      };
      if (push.initialStatesEmitted || push.initialStatesEmitting) {
        this.deps.logger.debug(`握手阶段跳过重复 initial_states(${client.id})`);
      } else {
        await this.emitInitialStates(client, entities);
      }
    } catch (e: unknown) {
      const errMsg = getErrorMessage(e);
      this.deps.logger.error(`initial_states 推送失败(${entities.length} 实体): ${errMsg}`);
      client.emit(WS_CLIENT_EVENTS.SYNC_ERROR, {
        type: 'sync_error',
        code: 'initial_states_failed',
        count: entities.length,
        message: errMsg,
      });
    }

    if (shouldReplayState(sinceMs, lastEventId)) {
      const replay = this.deps.stateStore.getRecentChangesSince(sinceMs, lastEventId);
      const replayChanges = replay
        .filter((c) => isEntityAllowed(c.entity_id, user))
        .filter((c) => this.isChangeVisibleToClient(client, c.entity_id))
        .map((c) =>
          toWsStateChangePayload({
            entity_id: c.entity_id,
            old_state: null,
            new_state: c.new_state,
            changed_at: new Date(c.at).toISOString(),
          }),
        );
      if (replayChanges.length > 0) {
        client.emit(WS_CLIENT_EVENTS.STATE_REPLAY, {
          type: 'state_replay',
          changes: replayChanges,
          count: replayChanges.length,
          lastEventId: this.deps.stateStore.getLatestChangeId(),
          timestamp: new Date().toISOString(),
        });
        this.deps.logger.debug(
          `已向 ${client.id} 补发 ${replayChanges.length} 条增量状态(delta)`,
        );
      }
    }

    const haStatus = this.deps.haConnector.getStatusSnapshot();
    client.emit(WS_CLIENT_EVENTS.HA_STATUS, {
      type: 'ha_status',
      status: haStatus.connected ? 'connected' : 'disconnected',
      ha_version: haStatus.ha_version,
      timestamp: new Date().toISOString(),
    });

    const redisConfigured = Boolean(this.deps.config.get('REDIS_URL'));
    client.emit(
      'redis_status',
      buildRedisWsStatusPayload(redisConfigured, this.deps.redisService.isReady()),
    );
  }

  /** 客户端断连回调：仅对握手成功的客户端递减计数，避免早期拒绝导致的负数计数 */
  handleDisconnect(client: Socket): void {
    // 仅对握手成功（已认证）的连接递减，避免早期 disconnect(true) 导致计数为负
    if (client.data?.user) {
      this.deps.setClientCount(Math.max(0, this.deps.getClientCount() - 1));
    }
    this.deps.logger.log(`客户端已断开:${client.id}(总计:${this.deps.getClientCount()})`);
  }

  /** 按 wsPush.criticalDomains 排序实体，关键域在前以加快首屏可见性 */
  sortEntitiesForInitialPush(entities: HaEntity[]): HaEntity[] {
    const cfg = this.deps.appConfig.get('stateStore');
    if (cfg.initialStatesPriorityEnabled === false) return entities;
    const critical = this.deps.appConfig.get('wsPush').criticalDomains;
    return sortEntitiesBySyncPriority(entities, critical);
  }

  /**
   * HA 全量同步完成后向所有在线客户端重推 initial_states。
   * 若 resyncChanges（断线期间变化）量 <= 实体总数 50%，走增量重推（state_changed_batch），
   * 否则回退全量重推，按连接顺序分组（4/批）错峰发送以避免带宽峰值。
   * 内存优化：同权限组复用同一份 enriched 实体引用，避免 N 客户端 × 实体数的内存放大。
   */
  async pushInitialStatesToAllClients(
    entities: HaEntity[],
    resyncChanges?: HaStateChangeEvent[],
  ): Promise<void> {
    const server = this.deps.getServer();
    if (!server?.sockets) return;

    // HA 重连/恢复增量重推：复用 computeResyncDiff 的断线期间变化实体列表，
    // 仅当存在历史基线（resyncChanges 已携带）且变化量未超过实体数 50% 时走增量，
    // 否则（首次连接/无基线/变化量过大）回退全量重推，与既有协议一致。
    const total = entities.length;
    const incremental =
      resyncChanges && total > 0 && resyncChanges.length <= total * 0.5
        ? resyncChanges
        : undefined;

    if (incremental) {
      if (incremental.length === 0) {
        this.deps.logger.debug('HA 重连增量重推:断线期间无实体变化,跳过推送');
        return;
      }
      const timestamp = new Date().toISOString();
      this.deps.logger.log(
        `HA 重连增量重推:${incremental.length}/${total} 实体变化,向 ${this.deps.getClientCount()} 个在线客户端推送`,
      );
      for (const socket of server.sockets.sockets.values()) {
        const user = socket.data?.user as JwtUserLike | undefined;
        if (!user) continue;
        const visible = incremental.filter(
          (c) => isEntityAllowed(c.entity_id, user) && this.isChangeVisibleToClient(socket, c.entity_id),
        );
        if (visible.length === 0) continue;
        socket.emit(WS_CLIENT_EVENTS.STATE_CHANGED_BATCH, {
          type: 'state_changed_batch',
          changes: visible.map((c) => toWsStateChangePayload(c)),
          count: visible.length,
          timestamp,
        });
      }
      return;
    }

    await this.deps.entityAreaEnrichment.ensureLoaded();
    const sorted = this.sortEntitiesForInitialPush(entities);
    this.deps.logger.log(
      `HA 全量状态就绪(${total} 实体),向 ${this.deps.getClientCount()} 个在线客户端错峰重推...`,
    );
    // 错峰/分组推送：HA 重连后多个客户端往往几乎同时请求全量同步，
    // 若同一时刻对每个客户端都推送完整实体列表会造成带宽峰值。
    // 按连接顺序（Map 遍历序即连接序号/到达顺序）分组成批，批内并发、批间错峰间隔，
    // 每个客户端最终都会收到完整 initial_states——错峰仅是调度延迟，不改变数据内容与完整性，
    // 且与现有 delta 模式协议（_delta/changed_attributes/removed_attributes、baseline 校验）保持兼容。
    //
    // 内存优化：同一访问权限组（绝大多数为 admin/无限制 adult）复用同一份 filtered+enriched
    // 数组引用，避免每客户端重复 O(n) 过滤与区域补全造成的内存放大（N 客户端 × 实体数）。
    const INITIAL_PUSH_GROUP_SIZE = 4;
    const INITIAL_PUSH_GROUP_DELAY_MS = 100;
    const payloadCache = new Map<string, ReturnType<StateStoreService['getAll']>>();
    const resolvePayload = (
      clientUser: JwtUserLike | undefined,
    ): ReturnType<StateStoreService['getAll']> => {
      const restrictions = resolveEntityRestrictions(clientUser);
      const key =
        restrictions === null
          ? '*'
          : restrictions.length === 0
            ? '-none-'
            : `r:${restrictions.join('|')}`;
      let cached = payloadCache.get(key);
      if (!cached) {
        cached = this.deps.entityAreaEnrichment.enrichEntitiesSync(
          filterEntitiesByAccess(sorted, clientUser),
        );
        payloadCache.set(key, cached);
      }
      return cached;
    };
    const targets: Array<{
      socket: Socket;
      entities: ReturnType<StateStoreService['getAll']>;
    }> = [];
    for (const socket of server.sockets.sockets.values()) {
      const user = socket.data?.user as JwtUserLike | undefined;
      if (!user) continue;
      targets.push({
        socket,
        entities: resolvePayload(user),
      });
    }
    for (let offset = 0; offset < targets.length; offset += INITIAL_PUSH_GROUP_SIZE) {
      const group = targets.slice(offset, offset + INITIAL_PUSH_GROUP_SIZE);
      // 批内并发推送，任一客户端失败不影响同批其他客户端，保证不漏推
      await Promise.all(
        group.map((t) =>
          this.emitInitialStates(t.socket, t.entities).catch((e: unknown) => {
            const errMsg = getErrorMessage(e);
            this.deps.logger.warn(`向 ${t.socket.id} 重推 initial_states 失败: ${errMsg}`);
          }),
        ),
      );
      // 批间错峰间隔（50-150ms 区间），避免多批同时全量推送造成带宽峰值
      if (offset + INITIAL_PUSH_GROUP_SIZE < targets.length) {
        await new Promise((resolve) => setTimeout(resolve, INITIAL_PUSH_GROUP_DELAY_MS));
      }
    }
  }

  /** 等待 HA 首次 get_states 写入 state-store，避免只推送 Redis 旧缓存（数十条） */
  async waitForHaEntitySync(timeoutMs = this.wsCfg.haSyncWaitMs): Promise<void> {
    if (this.deps.stateStore.isHaSynced()) return;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.deps.stateStore.isHaSynced()) return;
      if (this.deps.haConnector.isInitialStatesReady()) {
        await this.deps.stateStore.recoverInitialStatesIfNeeded();
        if (this.deps.stateStore.isHaSynced()) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await this.deps.stateStore.recoverInitialStatesIfNeeded();
    if (!this.deps.stateStore.isHaSynced()) {
      this.deps.logger.warn(
        `等待 HA 全量同步超时(${timeoutMs}ms),将推送当前缓存 ${this.deps.stateStore.getCount()} 条实体`,
      );
    }
  }

  /** 大规模实例分块推送，小规模仍发单条 initial_states 保持兼容 */
  async emitInitialStates(
    client: Socket,
    entities: ReturnType<StateStoreService['getAll']>,
  ): Promise<void> {
    const push = client.data as {
      initialStatesEmitting?: boolean;
      initialStatesEmitted?: boolean;
    };
    if (push.initialStatesEmitting) {
      this.deps.logger.debug(`跳过重叠的 initial_states 推送: ${client.id}`);
      return;
    }
    push.initialStatesEmitting = true;

    try {
      const CHUNK_SIZE = this.wsCfg.replayChunkSize;
      const timestamp = new Date().toISOString();
      const total = entities.length;

      if (total <= CHUNK_SIZE) {
        client.emit(WS_CLIENT_EVENTS.INITIAL_STATES, {
          type: 'initial_states' as const,
          entities,
          count: total,
          timestamp,
        });
        this.deps.logger.debug(`已向 ${client.id} 推送 initial_states(${total} 实体)`);
        push.initialStatesEmitted = true;
        return;
      }

      client.emit(WS_CLIENT_EVENTS.INITIAL_STATES_BEGIN, {
        type: 'initial_states_begin' as const,
        count: total,
        chunkSize: CHUNK_SIZE,
        timestamp,
      });

      for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
        const chunk = entities.slice(offset, offset + CHUNK_SIZE);
        client.emit(WS_CLIENT_EVENTS.INITIAL_STATES_CHUNK, {
          type: 'initial_states_chunk' as const,
          offset,
          count: chunk.length,
          total,
          entities: chunk,
        });
        await new Promise((resolve) => setImmediate(resolve));
      }

      client.emit(WS_CLIENT_EVENTS.INITIAL_STATES_END, {
        type: 'initial_states_end' as const,
        count: total,
        timestamp,
      });
      push.initialStatesEmitted = true;
      this.deps.logger.debug(
        `已向 ${client.id} 分块推送 initial_states(${total} 实体,${Math.ceil(total / CHUNK_SIZE)} 块)`,
      );
    } finally {
      push.initialStatesEmitting = false;
    }
  }

  /** 判定实体对当前客户端是否可见：综合订阅域、pin 列表、关键域、冷实体按需推送配置 */
  private isChangeVisibleToClient(client: Socket, entityId: string): boolean {
    const subscribed = client.data?.subscribedDomains as Set<string> | null | undefined;
    const pinned = client.data?.pinnedEntityIds as Set<string> | null | undefined;
    const coldOnDemand = this.deps.appConfig.get('wsPush').coldEntityOnDemand ?? true;
    return isEntityVisibleToClient(
      entityId,
      subscribed,
      pinned,
      this.deps.stateBroadcast.getCriticalDomains(),
      coldOnDemand,
    );
  }
}
