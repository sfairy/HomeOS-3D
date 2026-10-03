/**
 * @file intelligence-baseline.service.ts
 * @module awareness
 * @description 离线基线聚合服务。定时（Cron 每 6 小时）从 EventLog 与 timeline 学习
 * 房间活跃度、能耗小时均值、功率均值与离家模式灯光概率，写入
 * ActivityBaseline / EnergyHourlyBaseline / AwayPatternBucket 表，
 * 供习惯推荐与智能顾问查询使用。活跃度/离家模式按 EventLog.domain 过滤并在库内聚合。
 *
 * 依赖：
 * - PrismaService：EventLog / 基线表读写。
 * - RedisService：timeline 有序集合读取（energy/power 快照）。
 * - AppConfigService：intelligence.baselineAggregateEnabled 开关。
 * - stats.util：bucketHourDow / mean 等聚合工具。
 */
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@generated/prisma';
import { AppConfigService } from '../../shared/app-config/service';
import { isMaintenancePassRunning } from '../../common/database/maintenance.lock';
import { PrismaService } from '../../shared/prisma/service';
import { RedisService } from '../../shared/redis/service';
import { bucketHourDow, mean } from '../../common/utils/stats.util';
import { isPowerSensor } from '../../common/utils/power-sensor.util';
import { parseTimelineSnapshot } from '../../common/utils/timeline-snapshot.util';
import { getErrorMessage } from '../../common/utils';
import { DistributedLockService } from '../../common/resilience/distributed-lock.service';
import { API_ERROR } from '../../common/errors/api-error-messages';
import { StateStoreService } from '../state-store/service';

/**
 * 离线基线聚合 — EventLog / timeline → ActivityBaseline / EnergyHourlyBaseline / AwayPatternBucket
 */
@Injectable()
export class IntelligenceBaselineService {
  private readonly logger = new Logger(IntelligenceBaselineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly appConfig: AppConfigService,
    private readonly lock: DistributedLockService,
    private readonly stateStore: StateStoreService,
  ) {}

  /** 错开整点保留清理：每 6 小时于 :45 执行；多副本经分布式锁互斥 */
  @Cron('45 */6 * * *')
  async aggregateAll() {
    if (!this.appConfig.get('intelligence')?.baselineAggregateEnabled) return;
    if (isMaintenancePassRunning()) {
      this.logger.debug('跳过基线聚合:数据库保留清理正在进行');
      return;
    }
    try {
      await this.lock.runExclusive(
        'intelligence-baseline',
        async () => {
          // 串行执行，避免与 retention 清理叠加时占满连接池/IO
          await this.aggregateActivityBaseline();
          await this.aggregateEnergyHourlyBaseline();
          await this.aggregatePowerHourlyBaseline();
          await this.aggregateAwayPatterns();
        },
        30 * 60_000,
      );
    } catch (err) {
      if (err instanceof ConflictException) {
        const msg = String((err as ConflictException).message || '');
        this.logger.debug(
          msg.includes(API_ERROR.LOCK_REDIS_UNAVAILABLE)
            ? '跳过基线聚合:多副本下 Redis 锁不可用'
            : '跳过基线聚合:其他实例持有锁',
        );
        return;
      }
      this.logger.warn(`基线聚合失败: ${(err as Error).message}`);
    }
  }

/**
   * 判断实体是否为活跃度来源：light.* 或 ID 含 motion/occupancy。
   * SQL 已按 domain + ILIKE 预筛；此处兜底防止异常 entityId。
   *
   * @param entityId 实体 ID。
   * @returns 是否参与活跃度统计。
   */
  private isActivityEntity(entityId: string): boolean {
    if (entityId.startsWith('light.')) return true;
    const lower = entityId.toLowerCase();
    if (/motion|occupancy|presence|mmwave|pir|radar/.test(lower)) return true;
    const deviceClass = String(
      this.stateStore.getById(entityId)?.attributes?.device_class || '',
    ).toLowerCase();
    return deviceClass === 'motion' || deviceClass === 'occupancy' || deviceClass === 'presence';
  }

  /**
   * 从 EventLog motion/light 事件学习房间活跃度。
   *
   * 按 room × hour × dow 分桶统计事件数，并与已有基线做增量平均
   * （activityScore 加权融合 sampleCount）。
   *
   * @param days 学习窗口天数，默认 14。
   * 副作用：批量 upsert 到 ActivityBaseline 表。
   */
  async aggregateActivityBaseline(days = 14) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await this.prisma.$queryRaw<
      Array<{ entityId: string; hour: number; dow: number; cnt: bigint }>
    >`
      SELECT
        "entityId",
        EXTRACT(HOUR FROM "createdAt")::int AS hour,
        EXTRACT(DOW FROM "createdAt")::int AS dow,
        COUNT(*)::bigint AS cnt
      FROM "EventLog"
      WHERE "createdAt" >= ${since}
        AND "domain" IN ('light', 'binary_sensor', 'sensor')
      GROUP BY 1, 2, 3
    `;
    const buckets = new Map<string, number>();
    for (const r of rows) {
      if (!this.isActivityEntity(r.entityId)) continue;
      const room = this.inferRoom(r.entityId);
      if (!room) continue;
      const key = `${room}|${r.hour}|${r.dow}`;
      buckets.set(key, (buckets.get(key) || 0) + Number(r.cnt));
    }
    const existingRows = buckets.size
      ? await this.prisma.activityBaseline.findMany({
          where: {
            OR: [...buckets.keys()].map((key) => {
              const [room, hourStr, dowStr] = key.split('|');
              return { room, hour: Number(hourStr), dow: Number(dowStr) };
            }),
          },
        })
      : [];
    const existingMap = new Map(
      existingRows.map((row) => [`${row.room}|${row.hour}|${row.dow}`, row]),
    );
    const now = new Date();
    const entries: Array<{
      room: string;
      hour: number;
      dow: number;
      activityScore: number;
      sampleCount: number;
    }> = [];
    for (const [key, count] of buckets) {
      const [room, hourStr, dowStr] = key.split('|');
      const hour = Number(hourStr);
      const dow = Number(dowStr);
      const existing = existingMap.get(key);
      const sampleCount = (existing?.sampleCount || 0) + 1;
      const activityScore = existing
        ? (existing.activityScore * existing.sampleCount + count) / sampleCount
        : count;
      entries.push({ room, hour, dow, activityScore, sampleCount });
    }
    await this.batchUpsertActivityBaseline(entries, now);
  }

/**
   * 分批执行 Prisma 事务，避免单次事务过大。
   *
   * @param ops Prisma Promise 数组。
   * @param batchSize 每批大小，默认 50。
   */
  private async runBatchedTransactions<T>(ops: Array<Prisma.PrismaPromise<T>>, batchSize = 50) {
    for (let i = 0; i < ops.length; i += batchSize) {
      await this.prisma.$transaction(ops.slice(i, i + batchSize));
    }
  }

/**
   * 批量 upsert ActivityBaseline 记录。
   *
   * @param entries 待写入的 room/hour/dow/score/sampleCount 条目。
   * @param updatedAt 更新时间戳。
   */
  private async batchUpsertActivityBaseline(
    entries: Array<{
      room: string;
      hour: number;
      dow: number;
      activityScore: number;
      sampleCount: number;
    }>,
    updatedAt: Date,
  ) {
    const ops = entries.map((entry) =>
      this.prisma.activityBaseline.upsert({
        where: { room_hour_dow: { room: entry.room, hour: entry.hour, dow: entry.dow } },
        create: {
          room: entry.room,
          hour: entry.hour,
          dow: entry.dow,
          activityScore: entry.activityScore,
          sampleCount: entry.sampleCount,
          updatedAt,
        },
        update: {
          activityScore: entry.activityScore,
          sampleCount: entry.sampleCount,
          updatedAt,
        },
      }),
    );
    await this.runBatchedTransactions(ops);
  }

  /**
   * 从 timeline 学习 entity hour×dow 平均 kWh 增量。
   *
   * 流程：
   * 1. 从 EventLog 找出近 14 天有事件的 sensor.* 实体（含 energy/power_meter）。
   * 2. 从 Redis timeline 读取快照，计算相邻状态差值作为增量。
   * 3. 按 hour×dow 分桶求均值后 upsert。
   *
   * 副作用：批量 upsert 到 EnergyHourlyBaseline 表。
   */
  async aggregateEnergyHourlyBaseline() {
    if (!this.redis.isReady()) return;
    const sinceMs = Date.now() - 14 * 86400000;
    const since = new Date(sinceMs);
    // 能源计量候选实体白名单 → 精确 ID + 时间窗走 [entityId, createdAt] 索引，
    // 替代原 contains 前导通配全窗口扫描；候选表不可用时跳过本轮
    let candidateIds: string[] = [];
    try {
      const candidates = await this.prisma.$queryRaw<Array<{ entityId: string }>>`
        SELECT "entityId" FROM "EnergyCandidateEntity"
      `;
      candidateIds = candidates.map((r) => r.entityId);
    } catch (err: unknown) {
      this.logger.warn(
        `能源候选表不可用,跳过能耗基线聚合: ${getErrorMessage(err)}`,
      );
      return;
    }
    const candidateRows = candidateIds.length
      ? await this.prisma.eventLog.findMany({
          where: {
            createdAt: { gte: since },
            entityId: { in: candidateIds },
          },
          select: { entityId: true },
          distinct: ['entityId'],
          take: 100,
        })
      : [];
    const entityIds = candidateRows.map((r) => r.entityId);
    if (!entityIds.length) return;

    const keys = entityIds.map((id) => `timeline:entity:${id}`);
    const batches = await this.redis.mzRangeByScore(keys, sinceMs, Date.now(), 5000);
    const now = new Date();
    for (let i = 0; i < entityIds.length; i++) {
      const entityId = entityIds[i];
      const raw = batches[i] || [];
      const byBucket = new Map<string, number[]>();
      let prev: number | null = null;
      for (const item of raw) {
        try {
          const snap = parseTimelineSnapshot(item);
          if (!snap) continue;
          const val = parseFloat(snap.state);
          if (!Number.isFinite(val)) continue;
          const d = new Date(snap.ts);
          const { hour, dow } = bucketHourDow(d);
          const delta = prev != null && val >= prev ? val - prev : 0;
          prev = val;
          if (delta <= 0) continue;
          const bk = `${hour}|${dow}`;
          let deltas = byBucket.get(bk);
          if (!deltas) {
            deltas = [];
            byBucket.set(bk, deltas);
          }
          deltas.push(delta);
        } catch {
          /* 跳过 */
        }
      }
      const entries: Array<{
        entityId: string;
        hour: number;
        dow: number;
        avgKwh: number;
        sampleCount: number;
      }> = [];
      for (const [bk, deltas] of byBucket) {
        const [hourStr, dowStr] = bk.split('|');
        const hour = Number(hourStr);
        const dow = Number(dowStr);
        entries.push({
          entityId,
          hour,
          dow,
          avgKwh: mean(deltas),
          sampleCount: deltas.length,
        });
      }
      await this.batchUpsertEnergyHourlyBaseline(entries, now);
    }
  }

  /**
   * 从 timeline 学习功率传感器 hour×dow 平均功率（W）。
   *
   * 复用 EnergyHourlyBaseline 表存储功率均值（avgKwh 字段语义切换为 W）。
   * 仅对 EnergyBaseline 中已存在的功率传感器执行，避免重复扫描。
   *
   * 副作用：批量 upsert 到 EnergyHourlyBaseline 表。
   */
  async aggregatePowerHourlyBaseline() {
    if (!this.redis.isReady()) return;
    const since = Date.now() - 14 * 86400000;
    const rows = await this.prisma.energyBaseline.findMany({
      select: { entityId: true },
      take: 2000,
    });
    const entityIds = rows.map((r) => r.entityId).filter((id) => isPowerSensor(id));
    if (!entityIds.length) return;

    const keys = entityIds.map((id) => `timeline:entity:${id}`);
    const batches = await this.redis.mzRangeByScore(keys, since, Date.now(), 5000);
    const now = new Date();
    for (let i = 0; i < entityIds.length; i++) {
      const entityId = entityIds[i];
      const raw = batches[i] || [];
      const byBucket = new Map<string, number[]>();
      for (const item of raw) {
        try {
          const snap = parseTimelineSnapshot(item);
          if (!snap) continue;
          const val = parseFloat(snap.state);
          if (!Number.isFinite(val)) continue;
          const { hour, dow } = bucketHourDow(new Date(snap.ts));
          const bk = `${hour}|${dow}`;
          let values = byBucket.get(bk);
          if (!values) {
            values = [];
            byBucket.set(bk, values);
          }
          values.push(val);
        } catch {
          /* 跳过 */
        }
      }
      const entries: Array<{
        entityId: string;
        hour: number;
        dow: number;
        avgKwh: number;
        sampleCount: number;
      }> = [];
      for (const [bk, values] of byBucket) {
        if (values.length < 3) continue;
        const [hourStr, dowStr] = bk.split('|');
        const hour = Number(hourStr);
        const dow = Number(dowStr);
        entries.push({
          entityId,
          hour,
          dow,
          avgKwh: mean(values),
          sampleCount: values.length,
        });
      }
      await this.batchUpsertEnergyHourlyBaseline(entries, now);
    }
  }

/**
   * 批量 upsert EnergyHourlyBaseline 记录。
   *
   * @param entries 待写入的 entityId/hour/dow/avgKwh/sampleCount 条目。
   * @param updatedAt 更新时间戳。
   */
  private async batchUpsertEnergyHourlyBaseline(
    entries: Array<{
      entityId: string;
      hour: number;
      dow: number;
      avgKwh: number;
      sampleCount: number;
    }>,
    updatedAt: Date,
  ) {
    const ops = entries.map((entry) =>
      this.prisma.energyHourlyBaseline.upsert({
        where: {
          entityId_hour_dow: { entityId: entry.entityId, hour: entry.hour, dow: entry.dow },
        },
        create: {
          entityId: entry.entityId,
          hour: entry.hour,
          dow: entry.dow,
          avgKwh: entry.avgKwh,
          sampleCount: entry.sampleCount,
          updatedAt,
        },
        update: {
          avgKwh: entry.avgKwh,
          sampleCount: entry.sampleCount,
          updatedAt,
        },
      }),
    );
    await this.runBatchedTransactions(ops);
  }

  /**
   * 从 EventLog light 事件统计离家时段灯光开启概率。
   *
   * 使用 stateDiff（`off→on`）替代 JSONB 抽取，降低 CPU；按 dow × hour 分组。
   *
   * @param days 学习窗口天数，默认 30。
   * 副作用：批量 upsert 到 AwayPatternBucket 表。
   */
  async aggregateAwayPatterns(days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await this.prisma.$queryRaw<
      Array<{
        dow: number;
        hour: number;
        total: bigint;
        on_count: bigint;
      }>
    >`
      SELECT
        EXTRACT(DOW FROM "createdAt")::int AS dow,
        EXTRACT(HOUR FROM "createdAt")::int AS hour,
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (
          WHERE "stateDiff" IS NOT NULL
            AND "stateDiff" NOT LIKE 'attr:%'
            AND split_part("stateDiff", '→', 2) = 'on'
        )::bigint AS on_count
      FROM "EventLog"
      WHERE "createdAt" >= ${since}
        AND "domain" = 'light'
      GROUP BY 1, 2
    `;
    const now = new Date();
    const entries: Array<{ dow: number; hour: number; lightOnProb: number; sampleCount: number }> =
      [];
    for (const row of rows) {
      const total = Number(row.total);
      if (total <= 0) continue;
      const on = Number(row.on_count);
      entries.push({
        dow: row.dow,
        hour: row.hour,
        lightOnProb: on / total,
        sampleCount: total,
      });
    }
    await this.batchUpsertAwayPatterns(entries, now);
  }

/**
   * 批量 upsert AwayPatternBucket 记录。
   *
   * @param entries 待写入的 dow/hour/lightOnProb/sampleCount 条目。
   * @param updatedAt 更新时间戳。
   */
  private async batchUpsertAwayPatterns(
    entries: Array<{ dow: number; hour: number; lightOnProb: number; sampleCount: number }>,
    updatedAt: Date,
  ) {
    const ops = entries.map((entry) =>
      this.prisma.awayPatternBucket.upsert({
        where: { dow_hour: { dow: entry.dow, hour: entry.hour } },
        create: {
          dow: entry.dow,
          hour: entry.hour,
          lightOnProb: entry.lightOnProb,
          sampleCount: entry.sampleCount,
          updatedAt,
        },
        update: {
          lightOnProb: entry.lightOnProb,
          sampleCount: entry.sampleCount,
          updatedAt,
        },
      }),
    );
    await this.runBatchedTransactions(ops);
  }

/**
   * 从实体 ID 推断房间标识（bedroom/living/kitchen/bathroom/study）。
   *
   * 匹配中英文关键词；无法识别时返回 null，该实体不参与房间级统计。
   *
   * @param entityId 实体 ID。
   * @returns 房间标识或 null。
   */
  private inferRoom(entityId: string): string | null {
    const n = entityId.toLowerCase();
    if (/bedroom|主卧|卧室/.test(n)) return 'bedroom';
    if (/living|客厅/.test(n)) return 'living';
    if (/kitchen|厨房/.test(n)) return 'kitchen';
    if (/bathroom|卫浴|卫生间/.test(n)) return 'bathroom';
    if (/study|书房/.test(n)) return 'study';
    return null;
  }

  /**
   * 手动触发全量基线重建（管理员）。
   *
   * 串行执行四类聚合，返回耗时与 Redis 就绪状态。
   *
   * @returns `{ ok, durationMs, redisReady }`。
   */
  async rebuildAll() {
    const startedAt = Date.now();
    await this.aggregateActivityBaseline();
    await this.aggregateEnergyHourlyBaseline();
    await this.aggregatePowerHourlyBaseline();
    await this.aggregateAwayPatterns();
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      redisReady: this.redis.isReady(),
    };
  }
}
