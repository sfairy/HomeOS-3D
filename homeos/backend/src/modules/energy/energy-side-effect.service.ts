/**
 * 事件日志能源副作用服务
 *
 * 职责：EventLog createMany 成功后按序执行的能源类副作用——
 *  1. 增量维护 EnergyCandidateEntity 候选表（能耗排名/基线查询的精确 ID 白名单，只增不删）
 *  2. 增量维护能耗日/月聚合表（EnergyUsageDaily / EnergyUsageMonthly，
 *     Redis 不可用时趋势查询的回退数据源）
 *
 * 调用时序：由 EventLogService.flush() 在 createMany 成功后、Redis timeline 入队前同步 await，
 * 保持「PG 落库 → 副作用 → 时间线」顺序与失败回灌行为不变；
 * 副作用自身失败仅告警，不影响事件写入主流程。
 */
import { Injectable, Logger } from '@nestjs/common';
import { Prisma as PrismaNs } from '../../generated/prisma/client';
import { PrismaService } from '../../shared/prisma/service';
import { getErrorMessage } from '../../common/utils';
import { businessDayKey, businessMonthKey } from '../../common/utils/local-date.util';
import { extractEventLogState, isEnergyMeterEntity } from '../state-store/event-log/util';
import {
  isCumulativeEnergyMeter,
  readingToKwh,
} from './meter.util';

/** EventLog 批量行（能源副作用仅消费 entityId / oldState / newState / createdAt） */
interface EnergySideEffectBatchRow {
  entityId: string;
  oldState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * 计算电表两次状态间的 kWh 正向增量。
 * 仅累计正向增量（new >= old），忽略电表清零/重置导致的负跳变；
 * 非累计电量（功率等）或任一状态缺失/不可解析时返回 0。
 * 单位经 readingToKwh 归一（Wh → kWh）。
 */
function computeMeterDelta(oldState: unknown, newState: unknown): number {
  const oldRaw = extractEventLogState(oldState);
  const newRaw = extractEventLogState(newState);
  if (oldRaw == null || newRaw == null) return 0;
  const oldVal = parseFloat(oldRaw);
  const newVal = parseFloat(newRaw);
  if (!Number.isFinite(oldVal) || !Number.isFinite(newVal)) return 0;

  const newAttrs =
    newState && typeof newState === 'object' && !Array.isArray(newState)
      ? ((newState as { attributes?: Record<string, unknown> }).attributes ?? null)
      : null;
  const oldAttrs =
    oldState && typeof oldState === 'object' && !Array.isArray(oldState)
      ? ((oldState as { attributes?: Record<string, unknown> }).attributes ?? null)
      : null;
  const attrs = newAttrs || oldAttrs;
  if (attrs && !isCumulativeEnergyMeter(attrs)) return 0;

  const oldKwh = readingToKwh(oldVal, attrs);
  const newKwh = readingToKwh(newVal, attrs);
  return newKwh >= oldKwh ? newKwh - oldKwh : 0;
}

/**
 * EventLog 写入链上的能源副作用消费者。
 * 非独立事件订阅者：仍由 EventLogService 在 createMany 成功后同步调用，
 * 保证「事件先落 PG、聚合后写、时间线再入队」的顺序语义与失败回灌行为。
 */
@Injectable()
export class EnergySideEffectService {
  private readonly logger = new Logger(EnergySideEffectService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 按序执行全部能源副作用（候选表维护 → 日/月聚合）。
   * @param batch 本批已成功写入 EventLog 的事件。
   */
  async apply(batch: EnergySideEffectBatchRow[]): Promise<void> {
    await this.upsertEnergyCandidates(batch);
    await this.upsertEnergyUsageAggregates(batch);
  }

  /**
   * 增量维护 EnergyCandidateEntity 候选表：将本批事件中识别为能耗计量的实体 ID
   * 批量 INSERT ... ON CONFLICT DO NOTHING（只增不删，表体量极小，数千行量级）。
   * 失败仅告警，不影响事件日志写入主流程。
   *
   * @param batch 本批已成功写入 EventLog 的事件（仅使用 entityId）。
   */
  private async upsertEnergyCandidates(batch: EnergySideEffectBatchRow[]) {
    const energyIds = Array.from(
      new Set(
        batch
          .filter((row) => isEnergyMeterEntity(row.entityId))
          .map((row) => row.entityId),
      ),
    );
    if (!energyIds.length) return;
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "EnergyCandidateEntity" ("entityId", "firstSeenAt", "updatedAt")
        VALUES ${PrismaNs.join(energyIds.map((id) => PrismaNs.sql`(${id}, now(), now())`), ', ')}
        ON CONFLICT ("entityId") DO NOTHING
      `;
    } catch (err: unknown) {
      this.logger.warn(`能源计量候选实体维护失败: ${getErrorMessage(err)}`);
    }
  }

  /**
   * 增量维护能耗日/月聚合表（EnergyUsageDaily / EnergyUsageMonthly）：
   * 对本批事件中能源计量实体的状态跳变计算正向 kWh 增量，按（entityId, 天/月）分组累加。
   * 聚合表是趋势查询在 Redis 不可用时的回退数据源；失败仅告警，不影响事件写入主流程。
   *
   * @param batch 本批已成功写入 EventLog 的事件（含 oldState/newState 序列化对象）。
   */
  private async upsertEnergyUsageAggregates(batch: EnergySideEffectBatchRow[]) {
    // 按事件发生时刻（HA last_changed）归入上海时区日/月键，避免缓冲延迟跨日错账
    const dayByKey = new Map<string, { entityId: string; day: string; kwh: number; count: number }>();
    const monthByKey = new Map<
      string,
      { entityId: string; month: string; kwh: number; count: number }
    >();

    for (const row of batch) {
      if (!isEnergyMeterEntity(row.entityId)) continue;
      if (!row.oldState || !row.newState) continue;
      const delta = computeMeterDelta(row.oldState, row.newState);
      if (delta <= 0) continue;
      const day = businessDayKey(row.createdAt);
      const month = businessMonthKey(row.createdAt);
      const dayMapKey = `${row.entityId}\0${day}`;
      const dayCur = dayByKey.get(dayMapKey) || {
        entityId: row.entityId,
        day,
        kwh: 0,
        count: 0,
      };
      dayCur.kwh += delta;
      dayCur.count += 1;
      dayByKey.set(dayMapKey, dayCur);
      const monthMapKey = `${row.entityId}\0${month}`;
      const monthCur = monthByKey.get(monthMapKey) || {
        entityId: row.entityId,
        month,
        kwh: 0,
        count: 0,
      };
      monthCur.kwh += delta;
      monthCur.count += 1;
      monthByKey.set(monthMapKey, monthCur);
    }
    if (dayByKey.size === 0 && monthByKey.size === 0) return;

    try {
      const tasks: Array<Promise<number>> = [];
      if (dayByKey.size > 0) {
        tasks.push(
          this.prisma.$executeRaw`
            INSERT INTO "EnergyUsageDaily" ("entityId", "day", "kwh", "sampleCount", "updatedAt")
            VALUES ${PrismaNs.join(
              [...dayByKey.values()].map(
                (v) => PrismaNs.sql`(${v.entityId}, ${v.day}, ${v.kwh}, ${v.count}, now())`,
              ),
              ', ',
            )}
            ON CONFLICT ("entityId", "day") DO UPDATE SET
              "kwh" = "EnergyUsageDaily"."kwh" + EXCLUDED."kwh",
              "sampleCount" = "EnergyUsageDaily"."sampleCount" + EXCLUDED."sampleCount",
              "updatedAt" = now()
          `,
        );
      }
      if (monthByKey.size > 0) {
        tasks.push(
          this.prisma.$executeRaw`
            INSERT INTO "EnergyUsageMonthly" ("entityId", "month", "kwh", "sampleCount", "updatedAt")
            VALUES ${PrismaNs.join(
              [...monthByKey.values()].map(
                (v) =>
                  PrismaNs.sql`(${v.entityId}, ${v.month}, ${v.kwh}, ${v.count}, now())`,
              ),
              ', ',
            )}
            ON CONFLICT ("entityId", "month") DO UPDATE SET
              "kwh" = "EnergyUsageMonthly"."kwh" + EXCLUDED."kwh",
              "sampleCount" = "EnergyUsageMonthly"."sampleCount" + EXCLUDED."sampleCount",
              "updatedAt" = now()
          `,
        );
      }
      await Promise.all(tasks);
    } catch (err: unknown) {
      this.logger.warn(`能耗日/月聚合维护失败: ${getErrorMessage(err)}`);
    }
  }
}
