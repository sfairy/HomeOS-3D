/**
 * 所属模块：backend/modules/notification
 * 职责：
 *  - 渠道/类型7日发送量统计；
 * 关键依赖：
 *  - shared/prisma；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { normalizeNotificationSource, buildNotificationSourceDbFilter } from '@homeos/shared';
import { Prisma } from '../../generated/prisma/client';
import { parseJsonArray } from '../../common/utils/json-field.util';
import type { AlertLevel, Notification } from './service';

/** 数据库 Notification 行结构（用于类型映射） */
type NotificationRow = {
  id: string;
  level: string;
  message: string;
  entityId: string | null;
  source: string;
  read: boolean;
  createdAt: Date;
  deliveredAt: Date | null;
  deliveryChannels: unknown;
};

/**
 * 将数据库行映射为对外暴露的 Notification 视图。
 * deliveryChannels 解析为数组，解析失败时回退为空数组。
 * @param r 数据库行
 * @returns 通知视图对象
 */
export function mapNotificationRow(r: NotificationRow): Notification {
  const deliveryChannels = parseJsonArray<string>(r.deliveryChannels);
  return {
    id: r.id,
    level: r.level as AlertLevel,
    message: r.message,
    entityId: r.entityId || undefined,
    source: r.source,
    read: r.read,
    createdAt: r.createdAt.toISOString(),
    deliveredAt: r.deliveredAt?.toISOString(),
    deliveryChannels,
  };
}

/** 通知来源聚合行 */
type NotificationSourceRow = { source: string; count: number };
/** 通知级别聚合行 */
type NotificationLevelRow = { level: string; count: number };
/** 通知时间序列聚合行 */
type NotificationTimeRow = { bucket: Date | string; count: number };

/**
 * 根据时间窗口决定时间序列粒度。
 * 48 小时以内按小时聚合，超过则按天聚合。
 * @param windowHours 时间窗口（小时）
 * @returns 'hour' 或 'day'
 */
export function resolveNotificationTimeGranularity(windowHours: number): 'hour' | 'day' {
  return windowHours <= 48 ? 'hour' : 'day';
}

/**
 * 将原始聚合行构建为完整的时间序列（补齐空桶）。
 * 按粒度（小时/天）对齐桶边界，缺失的桶补 0。
 * @param rows 数据库聚合行
 * @param windowHours 时间窗口（小时）
 * @param nowMs 当前时间戳（可注入用于测试）
 * @returns 时间序列数组，每项含 ts / count / label
 */
function buildNotificationTimeSeries(
  rows: NotificationTimeRow[],
  windowHours: number,
  nowMs = Date.now(),
): Array<{ label: string; count: number; ts: number }> {
  const granularity = resolveNotificationTimeGranularity(windowHours);
  const bucketMs = granularity === 'hour' ? 3600_000 : 86_400_000;
  const windowMs = windowHours * 3600_000;
  const start = Math.floor((nowMs - windowMs) / bucketMs) * bucketMs;
  const end = Math.floor(nowMs / bucketMs) * bucketMs;
  const map = new Map<number, number>();

  for (let ts = start; ts <= end; ts += bucketMs) map.set(ts, 0);

  for (const row of rows) {
    const raw = row.bucket instanceof Date ? row.bucket.getTime() : new Date(row.bucket).getTime();
    if (!Number.isFinite(raw)) continue;
    const key = Math.floor(raw / bucketMs) * bucketMs;
    if (!map.has(key)) map.set(key, 0);
    map.set(key, (map.get(key) || 0) + Number(row.count) || 0);
  }

  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, count]) => ({
      ts,
      count,
      label: formatNotificationTimeLabel(ts, granularity),
    }));
}

/**
 * 格式化时间序列桶标签。
 * 小时粒度显示 "HH:00"，天粒度显示 "M/D"。
 */
function formatNotificationTimeLabel(ts: number, granularity: 'hour' | 'day'): string {
  const d = new Date(ts);
  if (granularity === 'hour') {
    return `${String(d.getHours()).padStart(2, '0')}:00`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 构建 Prisma where 条件用于按来源过滤通知。
 * 支持精确匹配、前缀匹配与 OR 组合（由 buildNotificationSourceDbFilter 解析）。
 * @param filterKey 来源过滤键
 * @returns Prisma where 条件，无匹配时返回 undefined
 */
export function prismaNotificationSourceWhere(
  filterKey: string,
): Prisma.NotificationWhereInput | undefined {
  const spec = buildNotificationSourceDbFilter(filterKey);
  if (!spec) return undefined;
  if (spec.kind === 'exact') return { source: spec.value };
  if (spec.kind === 'startsWith') return { source: { startsWith: spec.value } };
  if (spec.kind === 'or') {
    return {
      OR: spec.clauses.map((clause) => {
        if (clause.exact) return { source: clause.exact };
        if (clause.startsWith) return { source: { startsWith: clause.startsWith } };
        return { source: '__invalid__' };
      }),
    };
  }
  return undefined;
}

/**
 * 构建原生 SQL 片段用于按来源过滤通知（用于 $queryRaw 时间序列查询）。
 * @param filterKey 来源过滤键
 * @returns Prisma.Sql 片段，无匹配时返回 Prisma.empty
 */
export function prismaNotificationSourceSql(filterKey: string): Prisma.Sql {
  const spec = buildNotificationSourceDbFilter(filterKey);
  if (!spec) return Prisma.empty;
  if (spec.kind === 'exact') return Prisma.sql`AND "source" = ${spec.value}`;
  if (spec.kind === 'startsWith') {
    return Prisma.sql`AND "source" LIKE ${`${spec.value}%`}`;
  }
  if (spec.kind === 'or') {
    const parts = spec.clauses.map((clause) => {
      if (clause.exact) return Prisma.sql`"source" = ${clause.exact}`;
      if (clause.startsWith) return Prisma.sql`"source" LIKE ${`${clause.startsWith}%`}`;
      return Prisma.sql`FALSE`;
    });
    return Prisma.sql`AND (${Prisma.join(parts, ' OR ')})`;
  }
  return Prisma.empty;
}

/**
 * 构建完整的通知统计结果。
 * 聚合来源、级别、时间序列，计算投递率与已读率。
 * @param input 原始聚合数据
 * @returns 统计结果对象
 */
export function buildNotificationStats(input: {
  sourceRows: NotificationSourceRow[];
  levelRows: NotificationLevelRow[];
  timeRows: NotificationTimeRow[];
  total: number;
  unread: number;
  delivered: number;
  windowHours: number;
}) {
  const bySourceRaw: Record<string, number> = {};
  for (const row of input.sourceRows) {
    const key = normalizeNotificationSource(row.source);
    bySourceRaw[key] = (bySourceRaw[key] || 0) + row.count;
  }

  const byLevel: Record<string, number> = {};
  for (const row of input.levelRows) {
    byLevel[row.level] = (row.level in byLevel ? byLevel[row.level] : 0) + row.count;
  }

  const topSources = Object.entries(bySourceRaw)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    total: input.total,
    unread: input.unread,
    delivered: input.delivered,
    read: Math.max(0, input.total - input.unread),
    windowHours: input.windowHours,
    bySource: bySourceRaw,
    byLevel,
    byTime: buildNotificationTimeSeries(input.timeRows, input.windowHours),
    topSources,
    deliveryRate: input.total ? Math.round((input.delivered / input.total) * 1000) / 10 : 0,
    readRate: input.total
      ? Math.round(((input.total - input.unread) / input.total) * 1000) / 10
      : 0,
  };
}

/**
 * 将统计时间窗口 clamp 到合理范围（1-720 小时）。
 * 非有限数或非正数时回退到 fallback。
 * @param hours 时间窗口（小时）
 * @param fallback 回退值（默认 24）
 */
export function clampNotificationStatsHours(hours: number | undefined, fallback = 24): number {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), 720);
}
