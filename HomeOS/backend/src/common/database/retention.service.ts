/**
 * 数据库历史保留清理服务
 *
 * 所属模块：backend/src/common/database
 * 职责：周期性（默认每小时）扫描数据库，按各表独立保留天数（retention 配置分区，
 *   缺省回退 other.eventlogRetentionDays）分批删除各业务表（eventLog /
 *   sceneExecution / notification 等 11 张表）的历史记录，清理联动器执行史孤儿与
 *   失效 userId，并同步清理 Redis 时间线与通知冷却数据，防止磁盘与内存膨胀；
   *   每次清理记录「上次清理统计」（时间/删除行数/耗时）并持久化到 RuntimeKv，
 *   供「数据保留」设置面板展示。
 * DI 角色：@Injectable 单例，实现 OnModuleInit/OnModuleDestroy 管理定时器生命周期；
 *   通过 @OnEvent(APP_CONFIG_UPDATED) 监听配置变更动态调整保留天数与调度间隔。
 * 关键依赖：
 *   - PrismaService：实际删除操作 + 清理统计持久化
 *   - AppConfigService：读取 retention.* 按表保留天数、other.eventlogRetentionDays 与 ops.* 调度参数
 *   - RedisService：清理 timeline zset
 *   - NotificationCooldownService：prune 通知冷却
 *   - retention-batch.util：分批删除算法
 *   - orphan-gc.util：软引用孤儿清理
 */
import { ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { pruneSoftReferenceOrphans } from './orphan-gc.util';
import { beginMaintenancePass, endMaintenancePass, DB_MAINTENANCE_LOCK_KEY } from './maintenance.lock';
import { buildRetentionCleanupSteps } from './retention-cleanup.defs';
import { loadRuntimeKv, persistRuntimeKv } from '../../shared/prisma/runtime-kv.util';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import {
  RETENTION_DAYS_MAX,
  RETENTION_TABLE_KEYS,
  RETENTION_TABLE_LABELS,
  RETENTION_TABLE_NAMES,
  type RetentionTableKey,
} from './retention-tables';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService, APP_CONFIG_UPDATED } from '../../shared/app-config/service';
import { resolvePositiveInt } from '../../shared/app-config/config-resolver.util';
import { RedisService } from '../../shared/redis/service';
import { NotificationCooldownService } from '../alert-support/notification-cooldown.service';
import { DistributedLockService } from '../resilience/distributed-lock.service';
import { API_ERROR } from '../errors/api-error-messages';

/**
 * 原子清理一批 timeline 键的过期成员：
 * 对每个键先 TYPE 检查（仅 zset 才清理），返回累计删除成员数。
 * 相比逐键「TYPE + ZREMRANGEBYSCORE」两次往返，单次 eval 即完成整批处理。
 * @remarks ioredis 支持 eval，此处直接通过 getClient() 调用。
 */
const PRUNE_TIMELINE_LUA = `
  local removed = 0
  for i = 1, #KEYS do
    local keyType = redis.call('TYPE', KEYS[i]).ok
    if keyType == 'zset' then
      removed = removed + redis.call('ZREMRANGEBYSCORE', KEYS[i], 0, ARGV[1])
    end
  end
  return removed
`;

/**
 * 单次清理任务的结果。
 * @property retentionDays 实际生效的保留天数
 * @property cutoff        截止时间（早于此时间的数据被删除），ISO 字符串
 * @property deleted       各步骤删除条数，key 为表名 / 资源类型
 * @property total         累计删除条数
 */
type RetentionCleanupResult = {
  retentionDays: number;
  cutoff: string;
  deleted: Record<string, number>;
  total: number;
};

/**
 * 最近一次清理统计（持久化到 RuntimeKv，供「数据保留」设置面板展示）。
 * @property at          清理完成时间（ISO 字符串）
 * @property retentionDays 生效的基准保留天数
 * @property total       累计删除条数
 * @property deleted     各步骤删除条数（表键 + 附属清理键）
 * @property elapsedMs   本次清理耗时（毫秒）
 */
type RetentionCleanupStats = {
  at: string;
  retentionDays: number;
  total: number;
  deleted: Record<string, number>;
  elapsedMs: number;
};

/** 单表保留策略项（GET /system/config/retention 面板展示） */
type RetentionTablePolicy = {
  /** 配置键（对应 retention 分区字段与清理步骤 key） */
  key: RetentionTableKey;
  /** 物理表名（如 "EventLog"） */
  table: string;
  /** 中文显示名 */
  label: string;
  /** 当前生效的保留天数 */
  retentionDays: number;
};

/** 最近一次清理统计在 RuntimeKv 中的存储 id */
const RETENTION_STATS_STORAGE_ID = 'retention-last-cleanup';

/**
 * 数据库保留策略清理服务。
 *
 * DI 容器中以单例形式存在；构造时仅注入依赖，真正初始化在 onModuleInit 中完成，
 * 以确保 AppConfigService 已加载完毕。定时器分两层：
 *   - firstDelayTimer：首次延迟执行，避免启动峰值
 *   - cleanupTimer：周期性 setInterval，由 cleanupIntervalMs() 决定
 */
@Injectable()
export class DatabaseRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseRetentionService.name);
  /** 周期性清理定时器 */
  private cleanupTimer: NodeJS.Timeout | null = null;
  /** 首次延迟定时器 */
  private firstDelayTimer: NodeJS.Timeout | null = null;
  /** 当前生效的保留天数，由 resolveRetentionDays() 计算后缓存 */
  private retentionDays = 7;
  /** 最近一次清理统计（内存缓存 + RuntimeKv 持久化） */
  private lastCleanupStats: RetentionCleanupStats | null = null;
  /** 当前清理轮次可取消；关机时 abort 打断分批删除 */
  private cleanupAbort: AbortController | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly redisService: RedisService,
    private readonly cooldownService: NotificationCooldownService,
    private readonly jobs: JobRegistryService,
    private readonly lock: DistributedLockService,
  ) {}

  /** 读取 ops 配置分区（运维调度相关参数） */
  private getOps() {
    return this.appConfig.get('ops');
  }

  /**
   * 计算周期性清理的间隔毫秒数。
   * 默认 1 小时；retentionCleanupIntervalHours<=0 时退回 1 小时兜底。
   */
  private cleanupIntervalMs(): number {
    const hours = this.getOps().retentionCleanupIntervalHours;
    return (hours > 0 ? hours : 1) * 3_600_000;
  }

  /**
   * 计算首次延迟毫秒数。
   * 默认 15s；retentionFirstDelaySec<=0 时退回 15s 兜底，避免启动即清理影响冷启动性能。
   */
  private firstDelayMs(): number {
    const sec = this.getOps().retentionFirstDelaySec;
    return (sec > 0 ? sec : 15) * 1000;
  }

  /**
   * 解析当前生效的基准保留天数（事件日志口径）。
   * 优先级：retention.eventLog（按表独立配置）> other.eventlogRetentionDays > env > 默认 7 天
   * @returns 正整数天数
   */
  resolveRetentionDays(): number {
    // 优先级：retention.eventLog > other.eventlogRetentionDays > env > 默认 7 天
    const retentionCfg = this.appConfig.get('retention');
    if (retentionCfg && typeof retentionCfg.eventLog === 'number' && retentionCfg.eventLog > 0) {
      return Math.min(Math.floor(retentionCfg.eventLog), RETENTION_DAYS_MAX);
    }
    return resolvePositiveInt(
      this.appConfig.get('other').eventlogRetentionDays,
      ['DATA_RETENTION_DAYS', 'EVENTLOG_RETENTION_DAYS'],
      7,
    );
  }

  /**
   * 解析指定业务表的保留天数（按表独立配置，供各清理步骤使用）。
   * 优先级：retention.<key> > 基准保留天数（resolveRetentionDays）> 默认 7 天。
   * @param key 表配置键（与 RETENTION_TABLE_KEYS 对应）
   * @returns 1~365 之间的正整数天数
   */
  resolveRetentionDaysFor(key: RetentionTableKey): number {
    const days = resolvePositiveInt(this.appConfig.get('retention')?.[key], [], this.resolveRetentionDays());
    // 限幅：上限 365 天，避免极端配置拖累存储
    return Math.min(Math.max(days, 1), RETENTION_DAYS_MAX);
  }

  /**
   * 按保留天数计算清理截止时间点 = now - days。
   * 早于此时间点的数据将被删除。
   * @param days 保留天数
   */
  cutoffForDays(days: number): Date {
    // 86_400_000 = 24 * 3600 * 1000 毫秒
    return new Date(Date.now() - days * 86_400_000);
  }

  /**
   * 计算清理截止时间点 = now - 基准保留天数。
   * 早于此时间点的数据将被删除。
   */
  getCutoffDate(): Date {
    return this.cutoffForDays(this.retentionDays);
  }

  /**
   * 监听 AppConfig 更新事件，动态调整保留天数与调度。
   * @param keys 变更的配置分区列表
   */
  @OnEvent(APP_CONFIG_UPDATED)
  onConfigUpdated(keys: string[]) {
    if (keys.includes('other')) {
      // 保留天数变更：更新缓存值
      this.retentionDays = this.resolveRetentionDays();
      this.logger.log(`数据库历史保留策略已更新: ${this.retentionDays} 天`);
    }
    if (keys.includes('retention')) {
      // 按表独立保留天数变更：各清理步骤在运行时按表解析，无需重建调度
      this.retentionDays = this.resolveRetentionDays();
      this.logger.log('数据保留策略已更新(按表独立保留期,下一轮清理生效)');
    }
    if (keys.includes('ops')) {
      // 调度参数变更：需重启定时器以应用新间隔
      this.restartCleanupSchedule();
    }
  }

  /**
   * 重启清理调度：清除旧定时器，按新参数重建首延与周期定时器。
   * 调用场景：onConfigUpdated(ops) 与 onModuleInit。
   */
  private restartCleanupSchedule() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.firstDelayTimer) {
      clearTimeout(this.firstDelayTimer);
      this.firstDelayTimer = null;
    }
    // 首次延迟执行：避开冷启动峰值
    this.firstDelayTimer = setTimeout(() => {
      void this.jobs.run(
        'data-retention',
        { description: '数据库历史保留清理', intervalMs: this.cleanupIntervalMs() },
        () => this.runCleanup(),
      );
    }, this.firstDelayMs());
    // 之后按固定周期执行
    this.cleanupTimer = setInterval(() => {
      void this.jobs.run(
        'data-retention',
        { description: '数据库历史保留清理', intervalMs: this.cleanupIntervalMs() },
        () => this.runCleanup(),
      );
    }, this.cleanupIntervalMs());
    this.logger.log(
      `数据库清理调度已更新: 首次 ${this.firstDelayMs() / 1000}s 后,之后每 ${this.cleanupIntervalMs() / 3_600_000} 小时`,
    );
  }

  /**
   * NestJS 生命周期钩子：模块初始化时计算保留天数、加载上次清理统计并启动调度。
   */
  async onModuleInit() {
    this.retentionDays = this.resolveRetentionDays();
    // 加载上次清理统计（RuntimeKv 快照；缺失/异常时保持 null）
    this.lastCleanupStats = await loadRuntimeKv<RetentionCleanupStats>(
      this.prisma,
      RETENTION_STATS_STORAGE_ID,
    );
    this.logger.log(
      `数据库历史保留: ${this.retentionDays} 天,每 ${this.cleanupIntervalMs() / 3_600_000} 小时清理一次`,
    );
    this.restartCleanupSchedule();
  }

  /**
   * NestJS 生命周期钩子：模块销毁时清理定时器，避免句柄泄漏。
   */
  onModuleDestroy() {
    this.cleanupAbort?.abort();
    this.cleanupAbort = null;
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.firstDelayTimer) {
      clearTimeout(this.firstDelayTimer);
      this.firstDelayTimer = null;
    }
  }
  /**
   * 执行一次完整的清理流程：
   *   1. 计算 cutoff；
   *   2. 按批次删除 11 张表的历史数据（每张表独立 try/catch，单表失败不影响其他表）；
   *   3. 调用 cooldownService.pruneExpired 清理过期通知冷却；
   *   4. Redis 就绪时清理 timeline zset；
   *   5. 记录并持久化本次清理统计。
   *
   * @returns RetentionCleanupResult
   */
  async runCleanup(): Promise<RetentionCleanupResult> {
    try {
      return await this.lock.runExclusive(
        DB_MAINTENANCE_LOCK_KEY,
        async () => {
          beginMaintenancePass();
          try {
            return await this.runCleanupInner();
          } finally {
            endMaintenancePass();
          }
        },
        30 * 60_000,
      );
    } catch (err) {
      if (err instanceof ConflictException) {
        const msg = String((err as ConflictException).message || '');
        this.logger.debug(
          msg.includes(API_ERROR.LOCK_REDIS_UNAVAILABLE)
            ? '跳过保留清理:多副本下 Redis 锁不可用'
            : '跳过保留清理:其他实例持有锁',
        );
        const cutoff = this.getCutoffDate();
        return {
          retentionDays: this.resolveRetentionDays(),
          cutoff: cutoff.toISOString(),
          deleted: {},
          total: 0,
        };
      }
      throw err;
    }
  }

  private async runCleanupInner(): Promise<RetentionCleanupResult> {
    const startedAt = Date.now();
    const cutoff = this.getCutoffDate();
    const deleted: Record<string, number> = {};

    // 单批大小可调，默认 800；非法值兜底
    const raw = this.getOps().retentionDeleteBatchSize;
    const batchSize = Number.isFinite(raw) && raw > 0 ? raw : 800;

    this.cleanupAbort?.abort();
    this.cleanupAbort = new AbortController();
    const signal = this.cleanupAbort.signal;

    // 11 个清理步骤：表驱动生成（retention-cleanup.defs）
    const steps = buildRetentionCleanupSteps(this.prisma, batchSize, cutoff, signal);

    // 顺序执行各步骤；单步失败仅 warn，不中断后续步骤；截止时间按表独立保留天数计算
    for (const step of steps) {
      if (signal.aborted) {
        this.logger.warn('保留清理被中止(进程退出或新一轮抢占)');
        break;
      }
      try {
        const result = await step.run(
          this.cutoffForDays(this.resolveRetentionDaysFor(step.retentionKey)),
        );
        // 仅记录有删除的步骤，避免 deleted 中充斥 0 值
        if (result.count > 0) deleted[step.key] = result.count;
      } catch (err) {
        this.logger.warn(`清理 ${step.key} 失败: ${(err as Error).message}`);
      }
    }

    // 汇总删除总数
    const total = Object.values(deleted).reduce((sum, n) => sum + n, 0);
    if (total > 0) {
      this.logger.log(
        `已清理 ${total} 条超 ${this.retentionDays} 天的历史记录: ${JSON.stringify(deleted)}`,
      );
    }

    // EventLog 大批量 DELETE 后：优先 VACUUM ANALYZE；若在事务上下文中失败则回退 ANALYZE
    const eventLogDeleted = deleted.eventLog ?? 0;
    if (eventLogDeleted >= 1000) {
      try {
        await this.prisma.$executeRawUnsafe('VACUUM (ANALYZE) "EventLog"');
        this.logger.log(`EventLog 已 VACUUM ANALYZE(本次删除 ${eventLogDeleted} 行)`);
      } catch (vacuumErr) {
        try {
          await this.prisma.$executeRawUnsafe('ANALYZE "EventLog"');
          this.logger.log(
            `EventLog 已 ANALYZE(VACUUM 不可用: ${(vacuumErr as Error).message};本次删除 ${eventLogDeleted} 行)`,
          );
        } catch (err) {
          this.logger.warn(`EventLog ANALYZE 失败: ${(err as Error).message}`);
        }
      }
    }

    // 软引用孤儿：父 Scene/Automation/Script 已删的执行史；审计表失效 userId 置空（保留审计行）
    try {
      const orphanDeleted = await pruneSoftReferenceOrphans(this.prisma);
      for (const [key, count] of Object.entries(orphanDeleted)) {
        deleted[key] = count;
      }
    } catch (err) {
      this.logger.warn(`孤儿引用清理失败: ${(err as Error).message}`);
    }

    // 通知冷却 prune：与表清理独立，失败仅 warn
    try {
      const pruned = await this.cooldownService.pruneExpired();
      if (pruned > 0) deleted.notificationCooldownPruned = pruned;
    } catch (err) {
      this.logger.warn(`通知冷却 prune 失败: ${(err as Error).message}`);
    }

    // Redis 时间线清理：仅当 Redis 就绪时执行，避免未配置 Redis 时报错
    if (this.redisService.isReady()) {
      try {
        const redisDeleted = await this.pruneRedisTimeline(cutoff.getTime());
        if (redisDeleted > 0) deleted.redisTimeline = redisDeleted;
      } catch (err) {
        this.logger.warn(`Redis 时间线清理失败: ${(err as Error).message}`);
      }
    }

    // 记录并持久化本次清理统计（供「数据保留」设置面板展示；fire-and-forget 写入）
    const elapsedMs = Date.now() - startedAt;
    const stats: RetentionCleanupStats = {
      at: new Date().toISOString(),
      retentionDays: this.retentionDays,
      total,
      deleted,
      elapsedMs,
    };
    this.lastCleanupStats = stats;
    persistRuntimeKv(
      this.logger,
      'retention-last-cleanup',
      this.prisma,
      RETENTION_STATS_STORAGE_ID,
      stats,
    );

    return { retentionDays: this.retentionDays, cutoff: cutoff.toISOString(), deleted, total };
  }

  /** 当前各表保留策略（配置键 / 物理表名 / 中文显示名 / 生效保留天数） */
  getRetentionPolicies(): RetentionTablePolicy[] {
    return RETENTION_TABLE_KEYS.map((key) => ({
      key,
      table: RETENTION_TABLE_NAMES[key],
      label: RETENTION_TABLE_LABELS[key],
      retentionDays: this.resolveRetentionDaysFor(key),
    }));
  }

  /** 最近一次清理统计（无记录时返回 null） */
  getLastCleanupStats(): RetentionCleanupStats | null {
    return this.lastCleanupStats;
  }

  /**
   * 估算各表当前数据量（行数，来自 pg_class.reltuples 统计值，非精确 COUNT）。
   * 单次查询完成，避免对大表做全表 COUNT；失败时返回全 0。
   */
  async estimateTableRows(): Promise<Record<RetentionTableKey, number>> {
    const zero = Object.fromEntries(
      RETENTION_TABLE_KEYS.map((k) => [k, 0]),
    ) as Record<RetentionTableKey, number>;
    try {
      // 表名来自固定常量（RETENTION_TABLE_NAMES），无 SQL 注入风险
      const oidExpr = RETENTION_TABLE_KEYS.map(
        (k) => `to_regclass('"${RETENTION_TABLE_NAMES[k]}"')`,
      ).join(', ');
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ relname: string; estimated_rows: bigint }>
      >(
        `SELECT c.relname AS relname, c.reltuples::bigint AS estimated_rows FROM pg_class c WHERE c.oid IN (${oidExpr})`,
      );
      for (const row of rows) {
        const key = RETENTION_TABLE_KEYS.find((k) => RETENTION_TABLE_NAMES[k] === row.relname);
        const count = Number(row.estimated_rows);
        if (key && count > 0) zero[key] = count;
      }
    } catch (err) {
      // 估算失败不影响主流程：返回全 0
      this.logger.debug(`数据量估算失败: ${(err as Error).message}`);
    }
    return zero;
  }

  /**
   * 按表更新保留天数：写回 SystemConfig（retention 分区），
   * 经 AppConfigService 广播 APP_CONFIG_UPDATED 使本服务热更新，下一轮清理即生效。
   * @param days 表键 → 保留天数（1~365，由调用方负责校验）
   */
  async updateRetentionPolicies(days: Partial<Record<RetentionTableKey, number>>) {
    await this.appConfig.update({ retention: days });
    this.logger.log(`数据保留策略已更新: ${JSON.stringify(days)}`);
    return this.getRetentionPolicies();
  }

  /**
   * 清理 Redis 中的时间线数据：
   *   1. 主键 timeline:all 的过期 zset 成员；
   *   2. SCAN 各实体的 timeline:entity:* 键，逐个 zremrangebyscore 过期成员。
   *
   * 使用 SCAN 而非 KEYS，避免在大库上阻塞 Redis。
   *
   * @param cutoffMs 截止时间戳（毫秒）
   * @returns 累计删除的成员数
   */
  private async pruneRedisTimeline(cutoffMs: number): Promise<number> {
    const client = this.redisService.getClient();
    if (!client) return 0;
    // score 上界取 cutoff-1，保留恰好等于 cutoff 的成员
    const maxScore = cutoffMs - 1;

    // 检查 timeline:all 键的类型
    let allRemoved = 0;
    try {
      const mainType = await client.type('timeline:all');
      if (mainType === 'zset') {
        allRemoved = await client.zremrangebyscore('timeline:all', 0, maxScore);
      } else if (mainType !== 'none') {
        // 键存在但非 zset：可能被误用，跳过清理并 warn
        this.logger.warn(`时间线总键类型为 ${mainType},跳过清理`);
      }
    } catch (err) {
      this.logger.warn(`时间线总键类型检查失败: ${(err as Error).message}`);
    }

    // SCAN 实体 timeline 键（避免 KEYS 阻塞 Redis）
    let entityRemoved = 0;
    let cursor = '0';
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', 'timeline:entity:*', 'COUNT', 200);
      cursor = next;
      if (!keys.length) continue;
      try {
        // Lua 脚本原子完成「类型检查 + 过期成员清理」：整批键仅 1 次往返
        // （原实现每个键先 TYPE 再 ZREMRANGEBYSCORE，每 key ≥2 次往返）
        const removed = await client.eval(PRUNE_TIMELINE_LUA, keys.length, ...keys, maxScore);
        entityRemoved += Number(removed) || 0;
      } catch (err) {
        this.logger.debug(`实体时间线批量清理失败: ${(err as Error).message}`);
      }
    } while (cursor !== '0');
    return allRemoved + entityRemoved;
  }
}
