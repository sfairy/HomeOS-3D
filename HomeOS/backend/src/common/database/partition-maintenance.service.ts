/**
 * 大表按月分区维护服务
 *
 * 所属模块：backend/src/common/database
 * 职责：
 *  - 断言 EventLog 为原生 RANGE 分区表（init 必含 PARTITION BY；否则报错）；
 *  - 周期任务确保「上个月 ~ 未来 2 个月」的 EventLog_YYYYMM 分区存在；
 *  - 按 EventLog 独立保留天数 DROP 完全过期的整月分区（分区上界早于保留截止），
 *    月内部分过期数据仍由 DatabaseRetentionService 行级清理兜底。
 *
 * 设计：
 *  - 所有 DDL 幂等（存在性检查 / IF NOT EXISTS / 仅清理明确过期的分区），失败仅告警不中断主流程；
 *  - 分区命名固定为 EventLog_YYYYMM，与 init migration 保持一致。
 *
 * DI 角色：@Injectable 单例，在 PrismaModule（全局模块）注册。
 */
import { ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BusinessException, ErrorCode } from '../utils/business-exception';
import { PrismaService } from '../../shared/prisma/service';
import { DatabaseRetentionService } from './retention.service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { DistributedLockService } from '../resilience/distributed-lock.service';
import { API_ERROR } from '../errors/api-error-messages';
import {
  beginMaintenancePass,
  endMaintenancePass,
  DB_MAINTENANCE_LOCK_KEY,
} from './maintenance.lock';

const PARTITIONED_TABLE = 'EventLog';
const PARTITION_PREFIX = 'EventLog_';
const PARTITION_REGEX = /^EventLog_(\d{4})(\d{2})$/;
/** 维护周期：6 小时（未来分区创建 + 过期整月分区清理） */
const MAINTENANCE_INTERVAL_MS = 6 * 3_600_000;
/** 未来分区覆盖范围：上个月 ~ 之后 2 个月 */
const LOOKAHEAD_MONTHS = 2;

@Injectable()
/** 大表按月分区维护服务：确保未来分区存在并清理过期整月分区 */
export class PartitionMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PartitionMaintenanceService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly retention: DatabaseRetentionService,
    private readonly jobs: JobRegistryService,
    private readonly lock: DistributedLockService,
  ) {}

  async onModuleInit() {
    await this.runMaintenance().catch((err: unknown) => {
      this.logger.warn(`分区维护首次执行失败: ${(err as Error).message}`);
    });
    this.timer = setInterval(() => {
      void this.jobs
        .run(
          'partition-maintenance',
          { description: 'EventLog 分区维护（创建/清理）', intervalMs: MAINTENANCE_INTERVAL_MS },
          () => this.runMaintenance(),
        )
        .catch((err: unknown) => {
          this.logger.warn(`分区维护周期执行失败: ${(err as Error).message}`);
        });
    }, MAINTENANCE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 完整维护流程：确保未来分区存在 + 清理过期整月分区。
   * EventLog 非分区表视为部署错误（须重建库并 migrate deploy）。
   * 多副本通过分布式锁互斥，锁忙或 Redis fail-closed 时跳过。
   */
  async runMaintenance(): Promise<{ ensured: number; dropped: number }> {
    try {
      return await this.lock.runExclusive(
        DB_MAINTENANCE_LOCK_KEY,
        async () => {
          beginMaintenancePass();
          try {
            await this.assertPartitioned();
            const ensured = await this.ensureFuturePartitions();
            const dropped = await this.pruneExpiredPartitions();
            if (ensured > 0 || dropped > 0) {
              this.logger.log(`EventLog 分区维护完成: 创建 ${ensured} 个,清理 ${dropped} 个`);
            }
            return { ensured, dropped };
          } finally {
            endMaintenancePass();
          }
        },
        10 * 60_000,
      );
    } catch (err) {
      if (err instanceof ConflictException) {
        const msg = String((err as ConflictException).message || '');
        this.logger.debug(
          msg.includes(API_ERROR.LOCK_REDIS_UNAVAILABLE)
            ? '跳过分区维护:多副本下 Redis 锁不可用'
            : '跳过分区维护:其他实例持有锁',
        );
        return { ensured: 0, dropped: 0 };
      }
      throw err;
    }
  }

  /** 断言父表为原生分区表；否则抛错（禁止静默跳过） */
  private async assertPartitioned(): Promise<void> {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, number>>>(
      `SELECT 1 AS found
       FROM pg_partitioned_table pt
       JOIN pg_class c ON c.oid = pt.partrelid
       WHERE c.relname = $1`,
      PARTITIONED_TABLE,
    );
    if (rows.length === 0) {
      throw new BusinessException(
        ErrorCode.CONFIG_ERROR,
        'EventLog 不是 RANGE 分区表：请清空数据卷后重新 prisma migrate deploy（单条 init baseline）',
      );
    }
  }

  /** 确保 [上个月, 未来 2 个月] 分区存在，返回新建数量 */
  private async ensureFuturePartitions(): Promise<number> {
    const now = new Date();
    const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    let ensured = 0;
    for (let offset = -1; offset <= LOOKAHEAD_MONTHS; offset++) {
      const d = new Date(base);
      d.setUTCMonth(now.getUTCMonth() + offset);
      const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      ensured += await this.ensurePartition(ym);
    }
    return ensured;
  }

  /** 创建单个 YYYYMM 分区（已存在则跳过），返回 0/1 */
  private async ensurePartition(ym: string): Promise<number> {
    const year = ym.slice(0, 4);
    const month = ym.slice(4);
    // 分区下界 = 本月 1 日 00:00；上界 = 下月 1 日 00:00
    const next = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10), 1));
    const start = `${year}-${month}-01 00:00:00`;
    const end = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00`;
    try {
      await this.prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "${PARTITION_PREFIX}${ym}" PARTITION OF "${PARTITIONED_TABLE}" FOR VALUES FROM ('${start}') TO ('${end}')`,
      );
      return 1;
    } catch (err: unknown) {
      this.logger.warn(`创建分区 ${PARTITION_PREFIX}${ym} 失败: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * 清理完全过期的整月分区：
   * 分区上界（下月 1 日 00:00 UTC）≤ 保留截止（now - retentionDays）时，
   * 该分区内所有行的 createdAt 必然早于保留截止，可安全 DROP TABLE。
   * 仅匹配 EventLog_YYYYMM 命名，避免误删其他对象。
   */
  private async pruneExpiredPartitions(): Promise<number> {
    const retentionDays = this.retention.resolveRetentionDaysFor('eventLog');
    const cutoff = Date.now() - retentionDays * 86_400_000;
    let dropped = 0;
    let partitions: Array<{ relname: string }> = [];
    try {
      partitions = await this.prisma.$queryRawUnsafe<Array<{ relname: string }>>(
        `SELECT c.relname AS relname
         FROM pg_inherits i
         JOIN pg_class c ON c.oid = i.inhrelid
         JOIN pg_class p ON p.oid = i.inhparent
         WHERE p.relname = $1
         ORDER BY c.relname ASC`,
        PARTITIONED_TABLE,
      );
    } catch (err: unknown) {
      this.logger.warn(`分区清单扫描失败: ${(err as Error).message}`);
      return 0;
    }
    for (const { relname } of partitions) {
      const match = PARTITION_REGEX.exec(relname);
      if (!match) continue;
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const monthUpperBound = Date.UTC(year, month, 1); // 该分区上界（下月 1 日）
      if (monthUpperBound > cutoff) continue;
      try {
        await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${relname}"`);
        dropped += 1;
        this.logger.log(`DROP 过期分区 ${relname}(上界 ${new Date(monthUpperBound).toISOString()} ≤ 保留截止 ${new Date(cutoff).toISOString()})`);
      } catch (err: unknown) {
        this.logger.warn(`DROP 分区 ${relname} 失败: ${(err as Error).message}`);
      }
    }
    return dropped;
  }
}
