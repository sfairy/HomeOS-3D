/**
 * 事件日志服务
 *
 * 职责：
 *  - 监听 HA 实体状态变更事件，批量写入数据库
 *  - 过期清理由 DatabaseRetentionService 统一调度（默认保留 7 天）
 *  - 提供事件历史查询和统计分析（委托 EventLogQueryService）
 *
 * 性能优化：
 * - 内存缓冲：先累积事件到内存，达到阈值或定时后才批量写入
 * - 过滤重复：跳过新旧状态相同的无意义变更
 * - Tier 分级：控制/安防类全量 JSONB，传感器类仅存 diff，低价值高频域可采样或跳过
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { getEntityDomain } from '@homeos/shared';
import type { Prisma } from '../../../generated/prisma/client';
import { parseTimeToMs } from '../../../common/utils/time-parse.util';
import { PrismaService } from '../../../shared/prisma/service';
import { RedisService } from '../../../shared/redis/service';
import {
  HA_EVENTS,
  type HaStateChangeBatchEvent,
  type HaStateChangeEvent,
} from '../../../shared/types';
import { forEachColdBatchEvent } from '../../../shared/ha/cold-batch.util';
import { getErrorMessage } from '../../../common/utils';
import { EventLogQueryService } from './query.service';
import {
  requeueFailedBatch,
  resolveEventLogTier,
  serializeEventLogStates,
  shouldSkipRedisTimeline,
  getChangedControlAttr,
  extractEventLogState,
  buildEventLogRecordFilterFromOps,
  isEventLogRecordable,
} from './util';
import { EnergySideEffectService } from '../../energy/energy-side-effect.service';
import { StateStorePersistenceService } from '../state-store-persistence.service';

import {
  AppConfigService,
  APP_CONFIG_UPDATED,
} from '../../../shared/app-config/service';
import { HaWsLeaderService } from '../../ha-connector/ha-ws-leader.service';
import { HaEntitySyncFilterService } from '../../../shared/ha/entity-sync-filter.service';
import { Interval } from '@nestjs/schedule';

/** 取 HA 事件实际发生时刻（优先 last_changed），供 EventLog.createdAt / 基线分桶对齐 */
function resolveEventOccurredAt(event: HaStateChangeEvent): Date {
  const raw =
    event.new_state?.last_changed ||
    event.new_state?.last_updated ||
    event.old_state?.last_changed ||
    event.old_state?.last_updated;
  if (raw) {
    const ms = parseTimeToMs(raw);
    if (ms !== undefined) return new Date(ms);
  }
  return new Date();
}
/**
 * 事件日志服务
 *
 * 核心职责：
 * 1. 监听 HA 实体状态变更事件，批量写入数据库
 * 2. 过期清理由 DatabaseRetentionService 统一调度（默认保留 7 天）
 * 3. 提供事件历史查询和统计分析
 *
 * 性能优化：
 * - 内存缓冲：先累积事件到内存，达到阈值或定时后才批量写入
 * - 过滤重复：跳过新旧状态相同的无意义变更
 */
@Injectable()
export class EventLogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventLogService.name);
  private buffer: Array<{
    entityId: string;
    oldState: Record<string, unknown> | null;
    newState: Record<string, unknown> | null;
    stateDiff: string;
    /** HA 事件发生时刻（写入 EventLog.createdAt，供基线按小时/星期分桶） */
    createdAt: Date;
    /** PG 写入成功后再刷 Redis；null 表示跳过时间线 */
    redis: { oldS: string; newS: string } | null;
  }> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private droppedEvents = 0;
  /** 用于检测 HA WS Leader 升主后触发 timeline 回填 */
  private wasHaWsLeader = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly appConfig: AppConfigService,
    private readonly haLeader: HaWsLeaderService,
    private readonly entitySyncFilter: HaEntitySyncFilterService,
    private readonly eventLogQuery: EventLogQueryService,
    private readonly energySideEffect: EnergySideEffectService,
    private readonly persistence: StateStorePersistenceService,
  ) {}

  private get ops() {
    return this.appConfig.get('ops');
  }

  private get flushIntervalMs() {
    return this.ops.eventLogFlushIntervalMs;
  }

  private get maxBuffer() {
    return this.ops.eventLogMaxBuffer;
  }

  private get maxRequeueBuffer() {
    return this.ops.eventLogMaxRequeueBuffer;
  }

  private get timelineMax() {
    return this.ops.eventLogTimelineMax;
  }

  private get eventLogTierCfg() {
    const ops = this.ops;
    return {
      enabled: ops.eventLogTierEnabled !== false,
      tierCSampleRate: ops.eventLogTierCSampleRate ?? 0,
      skipSensorTimeline: ops.eventLogSkipSensorTimeline !== false,
    };
  }

  getRetentionDays(): number {
    return this.eventLogQuery.getRetentionDays();
  }

  getQueryMeta() {
    return this.eventLogQuery.getQueryMeta();
  }

  /** 配置热更新：ops 变更时重排 PG flush 定时器；Redis 持久化由 StateStorePersistenceService 统一调度 */
  @OnEvent(APP_CONFIG_UPDATED)
  onAppConfigUpdated(keys: string[]) {
    if (keys.includes('ops')) {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      if (this.buffer.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  /** 模块销毁：清空定时器并同步 flush 剩余缓冲与 Redis 持久化队列，避免数据丢失（带兜底超时） */
  async onModuleDestroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // PG 先落库（成功后入队 timeline），再 flush 共享 Redis 持久化队列；兜底 5s 超时，避免 DB 抖动导致进程退出丢批
    await Promise.race([
      (async () => {
        await this.flush();
        await this.persistence.flush();
      })(),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }

  /** 模块初始化：从 PG 回填近期 Redis 时间线（PG 为权威，Redis 为热缓存） */
  async onModuleInit() {
    this.logger.log('事件日志服务已启动(PG 优先写入;保留策略由 DatabaseRetentionService 统一管理)');
    this.wasHaWsLeader = this.haLeader.isHaWsLeader();
    void this.rebuildRedisTimelineFromPg().catch((err: unknown) => {
      this.logger.warn(`Redis 时间线回填失败: ${getErrorMessage(err)}`);
    });
  }

  /** Leader 升主后回填 Redis timeline（failover 后避免空洞） */
  @Interval(15_000)
  private onLeaderTimelineRebuildTick() {
    const isLeader = this.haLeader.isHaWsLeader();
    if (isLeader && !this.wasHaWsLeader) {
      void this.rebuildRedisTimelineFromPg().catch((err: unknown) => {
        this.logger.warn(`Leader 升主后 Redis 时间线回填失败: ${getErrorMessage(err)}`);
      });
    }
    this.wasHaWsLeader = isLeader;
  }

  /**
   * 监听 HA 状态变更事件
   * 过滤掉状态未实际变化的重复事件，
   * 将事件加入缓冲区，达到阈值或定时后批量写入数据库。
   */
  /** 从 ops 配置构建事件日志记录过滤器（域黑白名单 + 实体屏蔽列表） */
  private get eventLogRecordFilterCfg() {
    return buildEventLogRecordFilterFromOps(this.ops as Record<string, unknown>);
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChange(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
    if (!this.entitySyncFilter.isEntitySyncable(event.entity_id)) return;
    if (!isEventLogRecordable(event.entity_id, this.eventLogRecordFilterCfg)) return;

    const oldS = event.old_state?.state ?? 'null';
    const newS = event.new_state?.state ?? 'null';
    let coldDiffStr = `${oldS}→${newS}`;
    if (oldS === newS) {
      // state 未变：仅当控制类属性变更（如空调调温/风速）时才记录为事件
      const attrChange = getChangedControlAttr(event.entity_id, event.old_state, event.new_state);
      if (!attrChange) return;
      coldDiffStr = `attr:${attrChange}`;
    }

    // 仅 leader 持久化 EventLog / Redis timeline（L1 由 state-store 全实例更新）
    if (!this.haLeader.isHaWsLeader()) return;

    // 将重型 JSON 序列化与缓冲操作移出事件循环热路径，避免阻塞高频状态广播
    setImmediate(() => {
      const tier = resolveEventLogTier(event.entity_id, this.eventLogTierCfg);
      if (tier === 'skip') return;

      // 缓冲区溢出保护：超过上限时丢弃最旧事件，避免内存无限增长
      if (this.buffer.length >= this.maxRequeueBuffer) {
        this.buffer.shift();
        this.droppedEvents++;
        if (this.droppedEvents % 100 === 1) {
          this.logger.error(
            `事件日志缓冲区溢出,已丢弃 ${this.droppedEvents} 条事件(DB 写入持续失败)`,
          );
        }
      }

      const { oldState, newState } = serializeEventLogStates(event, tier);
      const createdAt = resolveEventOccurredAt(event);
      this.buffer.push({
        entityId: event.entity_id,
        oldState,
        newState,
        stateDiff: coldDiffStr,
        createdAt,
        redis: shouldSkipRedisTimeline(event.entity_id, this.eventLogTierCfg)
          ? null
          : { oldS, newS },
      });

      // 缓冲区满载时立即写入
      if (this.buffer.length >= this.maxBuffer) {
        this.flush();
      } else {
        this.scheduleFlush();
      }
    });
    });
  }

  /**
   * 批量写入缓冲区中的事件到数据库（异步非阻塞）。
   * 成功后才将 Redis 时间线写入入队到 StateStorePersistenceService（PG 优先，避免「Redis 有、PG 无」漂移）。
   * 返回 Promise 以支持优雅关闭时 await 完成；调用方不等待时忽略返回值即可。
   */
  private flush(): Promise<void> {
    if (this.buffer.length === 0) return Promise.resolve();
    const batch = this.buffer.splice(0);
    // 使用 setImmediate 确保不阻塞当前事件循环
    return new Promise((resolve) => {
      setImmediate(async () => {
        try {
          await this.prisma.eventLog.createMany({
            data: batch.map((row) => ({
              entityId: row.entityId,
              domain: getEntityDomain(row.entityId) || '',
              oldState: (row.oldState ?? undefined) as Prisma.InputJsonValue | undefined,
              newState: (row.newState ?? undefined) as Prisma.InputJsonValue | undefined,
              stateDiff: row.stateDiff,
              createdAt: row.createdAt,
            })),
          });
          // 能源副作用（候选表 + 日/月聚合）在 PG 落库后、时间线入队前按序执行；失败不影响事件写入主流程
          await this.energySideEffect.apply(batch);
          for (const row of batch) {
            if (row.redis) {
              this.persistence.queueTimelineWrite(
                row.entityId,
                row.redis.oldS,
                row.redis.newS,
                row.createdAt.getTime(),
              );
            }
          }
        } catch (err: unknown) {
          const msg = getErrorMessage(err);
          const requeued = requeueFailedBatch(this.buffer, batch, this.maxRequeueBuffer);
          if (requeued > 0) {
            this.logger.warn(
              `批量写入事件失败: ${msg},已回灌 ${requeued} 条,丢失 ${batch.length - requeued} 条`,
            );
            this.scheduleFlush();
          } else {
            this.droppedEvents += batch.length;
            this.logger.error(
              `事件日志批量写入失败且缓冲区满: ${msg},${batch.length} 条事件永久丢失(累计丢失 ${this.droppedEvents} 条)`,
            );
          }
        } finally {
          resolve();
        }
      });
    });
  }

  /**
   * 用近期 EventLog 回填 Redis timeline（启动或 Redis 空窗后）。
   * 仅写 entity ZSET，不重建 stream（stream 为实时消费辅助）。
   * @remarks 分页惰性回填：按 (createdAt, id) 键集分页，1000 行/批逐批 pipeline，
   *          避免原实现单次 findMany 2 万行 + 单条超大 pipeline 造成的启动峰值；
   *          最多 20 批（与原 2 万行上限对齐），分批间通过 await 自然让出事件循环。
   */
  private async rebuildRedisTimelineFromPg() {
    if (!this.redisService.isReady()) return;
    const client = this.redisService.getClient();
    if (!client) return;

    // retention 按「天」；先前误把天数当小时（7 天只重建 7 小时）
    const retentionDays = Math.min(Math.max(this.getRetentionDays(), 1), 7);
    const since = new Date(Date.now() - retentionDays * 86_400_000);
    const timelineMax = this.timelineMax;
    const BATCH_SIZE = 1000;
    const MAX_BATCHES = 20;
    let cursorRow: { createdAt: Date; id: number } | null = null;
    let total = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const rows: Array<{
        id: number;
        entityId: string;
        newState: Prisma.JsonValue | null;
        createdAt: Date;
      }> = await this.prisma.eventLog.findMany({
        where: {
          createdAt: { gte: since },
          ...(cursorRow
            ? {
                OR: [
                  { createdAt: { gt: cursorRow.createdAt } },
                  { createdAt: cursorRow.createdAt, id: { gt: cursorRow.id } },
                ],
              }
            : {}),
        },
        select: { id: true, entityId: true, newState: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
      });
      if (!rows.length) break;

      const pipeline = client.pipeline();
      const entityKeys = new Set<string>();
      for (const row of rows) {
        const state = extractEventLogState(row.newState);
        if (state == null) continue;
        const ts = row.createdAt.getTime();
        const snapshot = JSON.stringify({ entity_id: row.entityId, state, ts });
        const entityKey = `timeline:entity:${row.entityId}`;
        entityKeys.add(entityKey);
        pipeline.zadd(entityKey, ts, snapshot);
        pipeline.zadd('timeline:all', ts, snapshot);
      }
      if (entityKeys.size > 0) {
        for (const key of entityKeys) {
          pipeline.zremrangebyrank(key, 0, -(timelineMax + 1));
        }
        pipeline.zremrangebyrank('timeline:all', 0, -(timelineMax * 10 + 1));
        await pipeline.exec();
      }

      total += rows.length;
      cursorRow = { createdAt: rows[rows.length - 1].createdAt, id: rows[rows.length - 1].id };
      if (rows.length < BATCH_SIZE) break;
    }
    this.logger.log(`已从 EventLog 回填 Redis 时间线 ${total} 条(近 ${retentionDays} 天)`);
  }

  /**
   * 安排延迟刷新（防抖合并）
   */
  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushIntervalMs);
  }

  /** 手动触发全库历史清理（管理端调用） */
  async forceClean() {
    return this.eventLogQuery.forceClean();
  }

  /** 清空全部 EventLog（管理员，不可恢复） */
  async clearAllRecords() {
    this.buffer = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.persistence.clearTimelinePending();
    return this.eventLogQuery.clearAllRecords();
  }

  /** 事件历史查询（委托 EventLogQueryService） */
  async queryHistory(
    entityId?: string,
    hours: number = 24,
    limit: number = 20,
    page: number = 1,
    restrictions: string[] | null = null,
    domain?: string,
  ) {
    return this.eventLogQuery.queryHistory(entityId, hours, limit, page, restrictions, domain);
  }

  async queryTimelineEvents(
    entityIds: string[],
    hours = 12,
    limit = 60,
    restrictions: string[] | null = null,
    includeFullState = false,
  ) {
    return this.eventLogQuery.queryTimelineEvents(
      entityIds,
      hours,
      limit,
      restrictions,
      includeFullState,
    );
  }

  async getStats(
    hours: number = 24,
    restrictions: string[] | null = null,
    entityId?: string,
    domain?: string,
  ) {
    return this.eventLogQuery.getStats(hours, restrictions, entityId, domain);
  }
}
