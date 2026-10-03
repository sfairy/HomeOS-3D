/**
 * 事件日志查询与统计服务
 *
 * 所属模块：state-store / event-log
 * 职责：
 *  - 提供事件历史查询（分页 + 时间窗口 + 实体/域过滤）
 *  - 提供时间线部件查询（按实体列表查近期变更）
 *  - 提供事件统计（按域 / 实体 / 时间分桶聚合，原始 SQL）
 *  - 管理保留策略元数据与全量清理
 * 依赖：PrismaService、DatabaseRetentionService、AppConfigService、RedisService
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseRetentionService } from '../../../common/database/retention.service';
import { PrismaService } from '../../../shared/prisma/service';
import { RedisService } from '../../../shared/redis/service';
import {
  clampEventLogQueryHours,
  buildEventLogPublicMeta,
} from '../../../common/database/event-log-retention.util';
import {
  buildEventLogStats,
  resolveEventLogTimeGranularity,
  mapEventLogHistoryRow,
  eventLogAccessSql,
  filterEntityIdsByAccess,
  mergeEventLogWhere,
  clearEventLogRedisTimeline,
  deleteAllEventLogsInBatches,
} from './util';
import {
  AppConfigService,
  APP_CONFIG_UPDATED,
} from '../../../shared/app-config/service';

/**
 * 事件日志查询与统计（与缓冲写入解耦，便于拆分 God Service）
 *
 * DI 角色：@Injectable，由 StateStoreModule 提供。统计与计数结果带 TTL 缓存（120s），
 * 配置热更新（other / ops）时自动失效。查询按 JWT restrictions 实施实体级 ACL。
 */
@Injectable()
export class EventLogQueryService {
  private readonly logger = new Logger(EventLogQueryService.name);
  private statsCache: {
    hours: number;
    restrictionsKey: string;
    entityKey: string;
    domainKey: string;
    data: ReturnType<typeof buildEventLogStats>;
    at: number;
  } | null = null;
  private static readonly STATS_CACHE_MS = 120_000;
  private readonly countCache = new Map<string, { total: number; at: number }>();
  private static readonly COUNT_CACHE_MS = 120_000;
  private static readonly COUNT_CACHE_MAX = 64;

  constructor(
    private readonly prisma: PrismaService,
    private readonly retention: DatabaseRetentionService,
    private readonly appConfig: AppConfigService,
    private readonly redisService: RedisService,
  ) {}

  private get timelineMax() {
    return this.appConfig.get('ops').eventLogTimelineMax;
  }

  /** 获取事件日志保留天数（委托 DatabaseRetentionService 解析） */
  getRetentionDays(): number {
    return this.retention.resolveRetentionDays();
  }

  /** 返回查询元数据（保留天数、时间线窗口与上限），供前端展示与参数校验 */
  getQueryMeta() {
    return buildEventLogPublicMeta(this.getRetentionDays(), {
      eventLogTimelineMax: this.timelineMax,
      eventLogTimelineHours: this.appConfig.get('ops').eventLogTimelineHours,
      eventLogOverlayHours: this.appConfig.get('ops').eventLogOverlayHours,
    });
  }

  private clampQueryHours(hours: number, fallback: number): number {
    return clampEventLogQueryHours(hours, this.getRetentionDays(), fallback);
  }

  /** 失效统计与计数缓存（数据变更或配置更新时调用） */
  invalidateCaches() {
    this.statsCache = null;
    this.countCache.clear();
  }

  @OnEvent(APP_CONFIG_UPDATED)
  onAppConfigUpdated(keys: string[]) {
    if (keys.includes('other') || keys.includes('ops')) {
      this.invalidateCaches();
    }
  }

  /** 手动触发全库历史清理（委托 DatabaseRetentionService.runCleanup） */
  async forceClean() {
    this.invalidateCaches();
    return this.retention.runCleanup();
  }

  /** 清空全部 EventLog（管理员手动清理，不可恢复） */
  async clearAllRecords() {
    this.invalidateCaches();
    const raw = this.appConfig.get('ops').retentionDeleteBatchSize;
    const batchSize = Number.isFinite(raw) && raw > 0 ? raw : 800;
    const deleted = await deleteAllEventLogsInBatches(
      (take) =>
        this.prisma.eventLog.findMany({
          select: { id: true },
          take,
          orderBy: { id: 'asc' },
        }),
      (ids) => this.prisma.eventLog.deleteMany({ where: { id: { in: ids } } }),
      batchSize,
    );

    let redisKeysRemoved = 0;
    const client = this.redisService.getClient();
    if (client) {
      try {
        redisKeysRemoved = await clearEventLogRedisTimeline(client);
      } catch (err) {
        this.logger.warn(`事件日志 Redis 时间线清理失败: ${(err as Error).message}`);
      }
    }

    return { deleted, redisKeysRemoved };
  }

  /** 按查询窗口小时数做 cache key（避免 since=Date.now()-N 每次毫秒不同导致缓存永失效） */
  private countCacheKey(
    windowHours: number,
    entityId?: string,
    restrictionsKey = '*',
    domain?: string,
  ) {
    return `${windowHours}|${entityId ?? ''}|${restrictionsKey}|${domain ?? ''}`;
  }

  private mergeHistoryFilters(
    since: Date,
    restrictions: string[] | null,
    entityId?: string,
    domain?: string,
  ) {
    const where = mergeEventLogWhere({ createdAt: { gte: since } }, restrictions);
    const filters: Array<Record<string, unknown>> = [where];
    if (entityId) filters.push({ entityId });
    if (domain) filters.push({ domain });
    if (filters.length === 1) return where;
    return { AND: filters };
  }

  private restrictionsCacheKey(restrictions: string[] | null | undefined): string {
    if (restrictions === null || restrictions === undefined) return '*';
    if (!restrictions.length) return '_none_';
    return [...restrictions].sort().join(',');
  }

  private pruneCountCache() {
    if (this.countCache.size <= EventLogQueryService.COUNT_CACHE_MAX) return;
    const now = Date.now();
    for (const [key, entry] of this.countCache) {
      if (now - entry.at > EventLogQueryService.COUNT_CACHE_MS) this.countCache.delete(key);
    }
  }

  /** 带缓存的计数查询（120s TTL，按 windowHours/entity/restrictions/domain 分隔，LRU 上限 64 条） */
  private async countSince(
    windowHours: number,
    since: Date,
    entityId?: string,
    restrictions: string[] | null = null,
    domain?: string,
  ): Promise<number> {
    const restrictionsKey = this.restrictionsCacheKey(restrictions);
    const key = this.countCacheKey(windowHours, entityId, restrictionsKey, domain);
    const hit = this.countCache.get(key);
    const now = Date.now();
    if (hit && now - hit.at < EventLogQueryService.COUNT_CACHE_MS) return hit.total;

    const where = this.mergeHistoryFilters(since, restrictions, entityId, domain);
    const total = await this.prisma.eventLog.count({ where });
    this.countCache.set(key, { total, at: now });
    this.pruneCountCache();
    return total;
  }

  /**
   * 查询事件历史（分页 + 时间窗口 + 实体/域过滤 + ACL）。
   * @param entityId 可选，按实体过滤
   * @param hours 时间窗口（小时），经 clampQueryHours 约束在保留范围内
   * @param limit/page 分页参数
   * @param restrictions JWT 实体级 ACL
   * @param domain 可选，按域前缀过滤
   * @returns 分页结果（含 total / totalPages / events），events 经 mapEventLogHistoryRow 解析 stateDiff
   */
  async queryHistory(
    entityId?: string,
    hours: number = 24,
    limit: number = 20,
    page: number = 1,
    restrictions: string[] | null = null,
    domain?: string,
  ) {
    const windowHours = this.clampQueryHours(hours, 24);
    const since = new Date(Date.now() - windowHours * 3600000);
    const where = this.mergeHistoryFilters(since, restrictions, entityId, domain);

    const pageSize = Math.min(Math.max(limit, 5), 200);
    const skip = (Math.max(page, 1) - 1) * pageSize;

    const [total, rows] = await Promise.all([
      this.countSince(windowHours, since, entityId, restrictions, domain),
      this.prisma.eventLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          entityId: true,
          stateDiff: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      total,
      page: Math.max(page, 1),
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      events: rows.map(mapEventLogHistoryRow),
    };
  }

  /**
   * 时间线部件：按实体列表查询近期变更。
   * @remarks 默认只回传 stateDiff + 摘要（state / oldState / attrText），不返回完整
   *          oldState/newState JSONB（单次最多 80 行的全量 JSONB 是主要传输开销）；
   *          仅当调用方显式携带 includeFullState=true 时才回传完整 JSONB。
   *          实体列表去重后截取前 30 个，经 ACL 过滤；时间窗口与上限由 meta 约束。
   */
  async queryTimelineEvents(
    entityIds: string[],
    hours = 12,
    limit = 60,
    restrictions: string[] | null = null,
    includeFullState = false,
  ) {
    const allowed = filterEntityIdsByAccess(
      [...new Set(entityIds.map((id) => id.trim()).filter(Boolean))].slice(0, 30),
      restrictions,
    );
    if (!allowed.length) return { events: [] as Array<Record<string, unknown>> };
    const meta = this.getQueryMeta();
    const windowHours = this.clampQueryHours(hours, meta.timelineHours);
    const since = new Date(Date.now() - windowHours * 3600000);
    const maxTake = meta.timelineLimit > 0 ? meta.timelineLimit : 80;
    const take = Math.min(Math.max(limit, 1), maxTake);
    const rows = await this.prisma.eventLog.findMany({
      where: {
        createdAt: { gte: since },
        entityId: { in: allowed },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: includeFullState
        ? {
            id: true,
            entityId: true,
            oldState: true,
            newState: true,
            stateDiff: true,
            createdAt: true,
          }
        : {
            id: true,
            entityId: true,
            stateDiff: true,
            createdAt: true,
          },
    });
    if (includeFullState) return { events: rows };
    // 精简模式：按 stateDiff 解析摘要，复用历史列表行的映射语义（不含完整 JSONB）
    return { events: rows.map(mapEventLogHistoryRow) };
  }

  /**
   * 事件统计：按域 / 实体 / 时间分桶聚合（原始 SQL $queryRaw）。
   * @param hours 时间窗口（小时）
   * @param restrictions JWT 实体级 ACL（通过 eventLogAccessSql 注入 SQL 片段）
   * @param entityId 可选，按实体过滤
   * @param domain 可选，按域前缀过滤
   * @returns 统计结果（total / byDomain / byTime 时间序列 / topEntities）
   * @remarks 关键路径：三组聚合查询并发执行；时间粒度由窗口大小决定（≤48h 按小时，否则按天）。
   *          结果带 120s TTL 缓存，按 (hours, restrictions, entity, domain) 分隔。
   */
  async getStats(
    hours: number = 24,
    restrictions: string[] | null = null,
    entityId?: string,
    domain?: string,
  ) {
    const windowHours = this.clampQueryHours(hours, 24);
    const restrictionsKey = this.restrictionsCacheKey(restrictions);
    const entityKey = entityId?.trim() || '';
    const domainKey = domain?.trim() || '';
    const now = Date.now();
    if (
      this.statsCache &&
      this.statsCache.hours === windowHours &&
      this.statsCache.restrictionsKey === restrictionsKey &&
      this.statsCache.entityKey === entityKey &&
      this.statsCache.domainKey === domainKey &&
      now - this.statsCache.at < EventLogQueryService.STATS_CACHE_MS
    ) {
      return this.statsCache.data;
    }

    const since = new Date(Date.now() - windowHours * 3600000);
    const accessSql = eventLogAccessSql(restrictions);
    const entitySql = entityKey ? Prisma.sql`AND "entityId" = ${entityKey}` : Prisma.empty;
    const domainSql = domainKey ? Prisma.sql`AND "domain" = ${domainKey}` : Prisma.empty;
    // 时间粒度：窗口 ≤48h 按小时分桶，否则按天分桶
    const granularity = resolveEventLogTimeGranularity(windowHours);
    const truncUnit = granularity === 'hour' ? 'hour' : 'day';

    const [domainRows, entityRows, timeRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ domain: string; count: number }>>`
          SELECT "domain" AS domain,
                 COUNT(*)::int AS count
          FROM "EventLog"
          WHERE "createdAt" >= ${since}
          ${entitySql}
          ${domainSql}
          ${accessSql}
          GROUP BY "domain"
          ORDER BY count DESC
        `,
      entityKey || domainKey
        ? this.prisma.$queryRaw<Array<{ entityId: string; count: number }>>`
          SELECT "entityId", COUNT(*)::int AS count
          FROM "EventLog"
          WHERE "createdAt" >= ${since}
          ${entitySql}
          ${domainSql}
          ${accessSql}
          GROUP BY "entityId"
          ORDER BY count DESC
          LIMIT 10
        `
        : this.prisma.$queryRaw<Array<{ entityId: string; count: number }>>`
          SELECT "entityId", COUNT(*)::int AS count
          FROM "EventLog"
          WHERE "createdAt" >= ${since}
          ${accessSql}
          GROUP BY "entityId"
          ORDER BY count DESC
          LIMIT 10
        `,
      this.prisma.$queryRaw<Array<{ bucket: Date; count: number }>>`
          SELECT date_trunc(${truncUnit}, "createdAt") AS bucket, COUNT(*)::int AS count
          FROM "EventLog"
          WHERE "createdAt" >= ${since}
          ${entitySql}
          ${domainSql}
          ${accessSql}
          GROUP BY bucket
          ORDER BY bucket ASC
        `,
    ]);

    const data = buildEventLogStats(domainRows, entityRows, timeRows, windowHours);
    this.statsCache = {
      hours: windowHours,
      restrictionsKey,
      entityKey,
      domainKey,
      data,
      at: Date.now(),
    };
    return data;
  }
}
