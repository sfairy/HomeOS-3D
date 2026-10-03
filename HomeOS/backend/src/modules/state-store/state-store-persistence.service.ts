/**
 * 状态存储 Redis 持久化端口（单一 debounce / pipeline 出口）
 *
 * 所属模块：state-store
 * 职责：合并原两套并行 Redis 写入——
 *  - shadow:entity:*（L2 影子缓存：增量 set/del + 全量 MSET 快照 + keyset 维护 + follower 恢复）
 *  - timeline:entity:* / timeline:all / stream:ha_events（事件时间线 + WS 断线补发流）
 * 为单一缓冲 + 单一 debounce 定时器 + 单一 pipeline 出口，消除两套并行 flush 的重复调度与写放大。
 *
 * 行为保持要点（与拆分前一致）：
 *  - shadow 增量写失败：批次回灌重新调度（L2 为权威缓存，不可丢）
 *  - timeline 写失败：仅告警丢弃（辅助查询缓存，允许丢失）
 *  - 全量持久化 persistAllToRedis / 恢复 restoreFromRedis 等路径语义不变
 *  - timeline 仅在 EventLog 落库成功后入队（PG 优先，避免「Redis 有、PG 无」漂移）
 *
 * 依赖：RedisService（客户端）、AppConfigService（stateStore/ops 配置）、HaWsLeaderService（仅 leader 写）
 */
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { HaEntity } from '../../shared/types';
import { getErrorMessage } from '../../common/utils';
import { RedisService } from '../../shared/redis/service';
import { AppConfigService } from '../../shared/app-config/service';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';
import type { Redis } from 'ioredis';
import {
  SHADOW_KEY_PREFIX,
  SHADOW_KEYS_SET,
  SHADOW_SNAPSHOT_META_KEY,
  entityShadowKey,
} from './internals';

/** Redis timeline 增量缓冲条目（PG 落库成功后由 EventLogService 入队） */
interface TimelinePendingEntry {
  entityId: string;
  oldS: string;
  newS: string;
  timestamp: number;
  snapshot: string;
}

@Injectable()
/**
 * StateStorePersistenceService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class StateStorePersistenceService
 */
export class StateStorePersistenceService implements OnModuleDestroy {
  private readonly logger = new Logger(StateStorePersistenceService.name);

  /** P-15：已持久化的 Redis shadow key 集合，避免 SCAN */
  private trackedKeys = new Set<string>();

  /** 增量 Redis 写入缓冲（debounce + pipeline） */
  private shadowPending = new Map<string, { op: 'set' | 'del'; entity?: HaEntity }>();

  /** Redis timeline 增量缓冲（与 shadow 共用同一 debounce 定时器与 pipeline 出口） */
  private timelinePending: TimelinePendingEntry[] = [];

  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly redisService: RedisService,
    private readonly appConfig: AppConfigService,
    private readonly haLeader: HaWsLeaderService,
  ) {}

  private get stateCfg() {
    return this.appConfig.get('stateStore');
  }

  private get redisWriteBatch() {
    return this.stateCfg.redisWriteBatch;
  }

  private get redisIncrementalFlushMs() {
    return this.stateCfg.redisIncrementalFlushMs ?? 100;
  }

  private get timelineMax() {
    return this.appConfig.get('ops').eventLogTimelineMax;
  }

  getRedis(): Redis | null {
    return this.redisService.getClient();
  }

  isRedisReady(): boolean {
    return this.redisService.isReady();
  }

  getTrackedKeysCount(): number {
    return this.trackedKeys.size;
  }

  /** 当前待写 Redis 命令条数（shadow 增量 + timeline 增量，诊断用） */
  getRedisPendingCount(): number {
    return this.shadowPending.size + this.timelinePending.length;
  }

  onModuleDestroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    void this.flush();
  }

  /** P-15：增量清理过期 key（仅用于首次恢复时的 SCAN，日常不调用） */
  async scanShadowKeys(): Promise<string[]> {
    const redis = this.getRedis();
    if (!redis) return [];
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(
        cursor,
        'MATCH',
        `${SHADOW_KEY_PREFIX}*`,
        'COUNT',
        1000,
      );
      cursor = next;
      if (batch.length) keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }

  /**
   * Follower / 重启恢复：从 Redis shadow 加载实体到 L1 store。
   * @param haSynced 是否已完成 HA 同步（已同步则跳过）
   * @param onEntity 每个实体的回调，返回 false 表示跳过（如不在同步白名单或已存在）
   * @remarks 优先从 SHADOW_KEYS_SET 读取键列表，为空时回退 SCAN。
   */
  async restoreFromRedis(
    haSynced: boolean,
    onEntity: (entity: HaEntity) => boolean,
  ): Promise<void> {
    const redis = this.getRedis();
    if (!redis || haSynced) return;
    try {
      let keys = await redis.smembers(SHADOW_KEYS_SET);
      if (!keys.length) {
        keys = await this.scanShadowKeys();
        if (keys.length) {
          const pipeline = redis.pipeline();
          const batch = this.redisWriteBatch;
          for (let i = 0; i < keys.length; i += batch) {
            const chunk = keys.slice(i, i + batch);
            pipeline.sadd(SHADOW_KEYS_SET, ...chunk);
          }
          await pipeline.exec();
        }
      }
      if (keys.length === 0) {
        this.logger.log('Redis 缓存为空.等待 HA 全量同步...');
        return;
      }
      for (const k of keys) this.trackedKeys.add(k);

      const values = await redis.mget(keys);
      let restoredCount = 0;
      for (let i = 0; i < keys.length; i++) {
        const val = values[i];
        if (val) {
          const entity = JSON.parse(val) as HaEntity;
          if (onEntity(entity)) restoredCount++;
        }
      }
      this.logger.log(
        `🔄 从 Redis L2 缓存恢复了 ${restoredCount} 个实体(键 ${keys.length} 个)`,
      );
    } catch (err: unknown) {
      this.logger.error(`从 Redis 恢复失败:${getErrorMessage(err)}`);
    }
  }

  /** 增量 Redis 写入：缓冲后 pipeline 批量 flush。仅 leader 实例执行。 */
  queueShadowWrite(key: string, op: 'set' | 'del', entity?: HaEntity) {
    if (!this.getRedis() || !this.haLeader.isHaWsLeader()) return;
    if (op === 'set' && entity !== undefined) {
      // 只保存实体对象引用，序列化延迟到 flush 批量出口执行，避免高频路径逐事件 JSON.stringify
      this.shadowPending.set(key, { op: 'set', entity });
    } else {
      this.shadowPending.set(key, { op: 'del' });
    }
    this.scheduleFlush();
  }

  /**
   * Redis timeline / stream 增量写入：缓冲后与 shadow 合并到同一 debounce/pipeline 出口。
   * @remarks 由 EventLogService 在 PG 落库成功后调用；快照格式与原实现一致。
   */
  queueTimelineWrite(entityId: string, oldS: string, newS: string, occurredAtMs = Date.now()) {
    if (!this.redisService.isReady()) return;
    const timestamp = Number.isFinite(occurredAtMs) ? occurredAtMs : Date.now();
    this.timelinePending.push({
      entityId,
      oldS,
      newS,
      timestamp,
      snapshot: JSON.stringify({ entity_id: entityId, state: newS, ts: timestamp }),
    });
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.redisIncrementalFlushMs);
  }

  /** 配置热更新：取消进行中的 debounce 并按新间隔重排 */
  rescheduleFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.shadowPending.size > 0 || this.timelinePending.length > 0) {
      this.scheduleFlush();
    }
  }

  /**
   * 执行 Redis 增量写入缓冲的批量 flush（单一 pipeline：shadow + timeline 合并出口）。
   * @remarks 失败时 shadow 批次回灌重新调度（权威 L2 不可丢）；timeline 仅告警丢弃（辅助缓存允许丢失）。
   */
  async flush(): Promise<void> {
    const redis = this.getRedis();
    if (!redis) return;
    if (this.shadowPending.size === 0 && this.timelinePending.length === 0) return;

    const shadowBatch = new Map(this.shadowPending);
    this.shadowPending.clear();
    const timelineBatch = this.timelinePending.splice(0);

    try {
      const pipeline = redis.pipeline();

      for (const [key, entry] of shadowBatch) {
        if (entry.op === 'set' && entry.entity !== undefined) {
          // 批量出口统一序列化：高频路径不再逐事件 JSON.stringify，且同 key 仅序列化最新实体
          pipeline.set(key, JSON.stringify(entry.entity));
          pipeline.sadd(SHADOW_KEYS_SET, key);
          this.trackedKeys.add(key);
        } else {
          pipeline.del(key);
          pipeline.srem(SHADOW_KEYS_SET, key);
          this.trackedKeys.delete(key);
        }
      }

      if (timelineBatch.length > 0) {
        const timelineMax = this.timelineMax;
        const streamMaxLen = 10_000;
        const entityKeys = new Set<string>();
        for (const row of timelineBatch) {
          const entityKey = `timeline:entity:${row.entityId}`;
          entityKeys.add(entityKey);
          pipeline.zadd(entityKey, row.timestamp, row.snapshot);
          pipeline.zadd('timeline:all', row.timestamp, row.snapshot);
          pipeline.xadd(
            'stream:ha_events',
            'MAXLEN',
            '~',
            streamMaxLen,
            '*',
            'entity_id',
            row.entityId,
            'old_state',
            row.oldS,
            'new_state',
            row.newS,
            'ts',
            String(row.timestamp),
          );
        }
        if (timelineMax > 0) {
          for (const key of entityKeys) {
            pipeline.zremrangebyrank(key, 0, -(timelineMax + 1));
          }
          pipeline.zremrangebyrank('timeline:all', 0, -(timelineMax * 5 + 1));
        }
      }

      await pipeline.exec();
    } catch (err: unknown) {
      // 分路径失败语义保持：shadow 回灌重排；timeline 仅告警丢弃
      if (shadowBatch.size > 0) {
        this.logger.warn(`Redis 增量批量写入失败:${getErrorMessage(err)}`);
        for (const [key, entry] of shadowBatch) {
          this.shadowPending.set(key, entry);
        }
        this.scheduleFlush();
      }
      if (timelineBatch.length > 0) {
        this.logger.warn(`Redis 时间线批量写入失败:${getErrorMessage(err)}`);
      }
    }
  }

  /** 清空 timeline 待写缓冲（EventLog 管理员清库时调用）；若仍有 shadow 待写则重排 debounce */
  clearTimelinePending(): void {
    this.timelinePending = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.shadowPending.size > 0) {
      this.scheduleFlush();
    }
  }

  /** P-15：增量全量持久化 — MSET 批量写入，不再 DEL+SCAN */
  /**
   * 全量持久化到 Redis shadow：MSET 批量写入 + 增量 keyset 调整 + 更新 meta。
   * @remarks 关键路径：不再 DEL 全部旧 key 后重写，改为 MSET 覆盖 + 增量清理 staleKeys；
   *          键集合也不再「DEL 整表 + 重建 SADD」，而是与当前 trackedKeys 求差集，
   *          新增 key 仅 SADD、消失的 stale key 仅 SREM（增量调整，不做整删整建），
   *          避免大户型全量同步时的 Redis 压力毛刺。仅 leader 执行。
   */
  async persistAllToRedis(entities: HaEntity[]): Promise<void> {
    const redis = this.getRedis();
    if (!redis || !this.haLeader.isHaWsLeader()) return;
    try {
      const newKeySet = new Set<string>();
      const msetArgs: string[] = [];

      for (const entity of entities) {
        const key = entityShadowKey(entity.entity_id);
        newKeySet.add(key);
        msetArgs.push(key, JSON.stringify(entity));
      }

      // 增量 keyset 调整：与当前 trackedKeys 求差集——
      // 新增 key 仅 SADD、消失的 stale key 仅 SREM，替代「整删整建」的 DEL 后重建
      const addedKeys: string[] = [];
      const staleKeys: string[] = [];
      for (const k of this.trackedKeys) {
        if (!newKeySet.has(k)) staleKeys.push(k);
      }
      for (const k of newKeySet) {
        if (!this.trackedKeys.has(k)) addedKeys.push(k);
      }

      const batch = this.redisWriteBatch;
      for (let i = 0; i < msetArgs.length; i += batch * 2) {
        const chunk = msetArgs.slice(i, i + batch * 2);
        await redis.mset(...chunk);
      }

      for (let i = 0; i < staleKeys.length; i += batch) {
        const chunk = staleKeys.slice(i, i + batch);
        if (chunk.length) {
          await redis.del(...chunk);
          await redis.srem(SHADOW_KEYS_SET, ...chunk);
        }
      }

      // 增量补写键集合：仅 SADD 新增 key，既有 key 不重复 SADD
      // （与增量写缓冲 flush 中的 SADD 语义保持一致）
      for (let i = 0; i < addedKeys.length; i += batch) {
        const chunk = addedKeys.slice(i, i + batch);
        if (chunk.length) await redis.sadd(SHADOW_KEYS_SET, ...chunk);
      }

      this.trackedKeys = newKeySet;

      await redis.set(
        SHADOW_SNAPSHOT_META_KEY,
        JSON.stringify({ count: entities.length, ready: true, at: Date.now() }),
      );

      const written = entities.length;
      const deleted = staleKeys.length;
      if (deleted > 0 || addedKeys.length > 0) {
        this.logger.debug(
          `Redis 全量持久化完成:写入 ${written} 条,新增键 ${addedKeys.length} 条,清理过期 ${deleted} 条`,
        );
      }
    } catch (err: unknown) {
      this.logger.error(`Redis 全量写入失败:${getErrorMessage(err)}`);
    }
  }

  /** Follower：等待 meta 就绪后从 Redis shadow 加载全量快照 */
  /**
   * Follower：等待 meta 就绪后从 Redis shadow 加载全量快照。
   * @param ref 初始状态引用（含期望 count）
   * @returns 加载的实体数组；Redis 不可用或快照为空时返回 null
   * @remarks 最多等待 15s 轮询 SHADOW_SNAPSHOT_META_KEY 的 ready 标记。
   */
  async loadFromRedisShadowRef(ref: { count: number; at?: string }): Promise<HaEntity[] | null> {
    const redis = this.getRedis();
    if (!redis) {
      this.logger.warn('初始状态引用已到达但 Redis 不可用,跳过影子缓存加载');
      return null;
    }
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const metaRaw = await redis.get(SHADOW_SNAPSHOT_META_KEY);
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw) as { ready?: boolean; count?: number };
          if (meta.ready) break;
        } catch {
          /* retry */
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const loaded = await this.loadAllEntitiesFromRedisShadow();
    if (loaded.length === 0) {
      this.logger.warn(`Redis 影子缓存加载为空(期望 ${ref.count} 实体)`);
      return null;
    }
    return loaded;
  }

  /** 从 Redis shadow 加载全部实体（优先 SHADOW_KEYS_SET，回退 SCAN），分批 MGET 读取 */
  async loadAllEntitiesFromRedisShadow(): Promise<HaEntity[]> {
    const redis = this.getRedis();
    if (!redis) return [];
    let keys = await redis.smembers(SHADOW_KEYS_SET);
    if (!keys.length) {
      keys = await this.scanShadowKeys();
      if (keys.length) {
        const pipeline = redis.pipeline();
        const batch = this.redisWriteBatch;
        for (let i = 0; i < keys.length; i += batch) {
          const chunk = keys.slice(i, i + batch);
          pipeline.sadd(SHADOW_KEYS_SET, ...chunk);
        }
        await pipeline.exec();
      }
    }
    if (!keys.length) return [];

    const entities: HaEntity[] = [];
    const batch = this.redisWriteBatch;
    for (let i = 0; i < keys.length; i += batch) {
      const chunk = keys.slice(i, i + batch);
      const values = await redis.mget(...chunk);
      for (let j = 0; j < chunk.length; j++) {
        const raw = values[j];
        if (!raw) continue;
        try {
          entities.push(JSON.parse(raw) as HaEntity);
        } catch {
          /* 跳过损坏项 */
        }
      }
    }
    return entities;
  }
}
