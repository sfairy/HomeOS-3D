/**
 * 统计报表对比服务（Requirement E6）
 *
 * 所属模块：state-store / event-log
 * 职责：
 *  - 提供「本周 vs 上周、本月 vs 上月」周期对比序列（按天分桶，零值补全）
 *  - 提供设备 / 房间横向对比（当前周期 Top 实体的双周期总量）
 *  - 数据源按 metric 选择：
 *    - events       → EventLog 事件计数（复用 eventLogAccessSql 实施实体级 ACL）
 *    - energy       → EventLog 中能耗计量实体的累计读数差分（stateDiff 末段为累计值，
 *                     按实体取每日末次读数做 LAG 差分，负差视为 0 以容忍表底重置）
 *    - environment  → EnvironmentRecord 按天均值（temperature / humidity / iaq）
 * 依赖：PrismaService、./util 的 ACL SQL 片段、@homeos/shared 的 isEntityAllowed
 * @remarks 能耗不直接使用 EnergyHourlyBaseline（hour×dow 模式基线不随时间周期变化，
 *          无法表达「本周 vs 上周」的实测差异），故从 EventLog 累计读数差分计算。
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../shared/prisma/service';
import { isEntityAllowed } from '@homeos/shared';
import { eventLogAccessSql } from './util';

type ReportMetric = 'energy' | 'environment' | 'events' | 'device';
type ReportGranularity = 'week' | 'month';
type EnvReportField = 'temperature' | 'humidity' | 'iaq';

interface ReportPeriodBoundary {
  start: Date;
  end: Date;
  label: string;
}

interface ReportSeriesPoint {
  date: string;
  label: string;
  value: number | null;
}

interface ReportCompareRow {
  key: string;
  current: number;
  previous: number | null;
  delta: number;
  deltaPct: number | null;
}

interface ReportInsights {
  peakDay: { date: string; label: string; value: number } | null;
  avgPerDay: number | null;
  activeDays: number;
  topRiser: ReportCompareRow | null;
  topFaller: ReportCompareRow | null;
}

const BY_ENTITY_LIMIT = 20;

interface ReportCompareInput {
  metric: ReportMetric;
  granularity: ReportGranularity;
  /** 可选实体过滤（events / energy 生效；environment 忽略，按房间对比） */
  entityIds?: string[];
  /** environment 指标的子字段，默认 temperature */
  field?: EnvReportField;
  /** JWT 实体级 ACL（null = 无限制） */
  restrictions: string[] | null;
}

const DAY_MS = 86_400_000;

/** 本地时区零点（与 PG date_trunc('day') 语义对齐，Docker 部署下均为 UTC） */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 本周周一零点（周一为一周起点） */
function mondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  return startOfDay(new Date(d.getTime() - diff * DAY_MS));
}

function formatDayLabel(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatShortLabel(date: string): string {
  const parts = date.split('-');
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : date;
}

/** 生成周期内的日标签序列（含边界日），用于零值 / 空值补全 */
function buildDayLabels(start: Date, end: Date): string[] {
  const labels: string[] = [];
  const cursor = startOfDay(start);
  const last = startOfDay(end);
  const maxDays = 62;
  while (cursor.getTime() <= last.getTime() && labels.length < maxDays) {
    labels.push(formatDayLabel(cursor));
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  return labels;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 汇总与单实体对比行：previous 为空表示上周期无数据（如环境房间缺失） */
function buildCompareRow(
  key: string,
  current: number,
  previous: number | null,
  round: (n: number) => number = round2,
): ReportCompareRow {
  const cur = round(current);
  const prev = previous == null ? null : round(previous);
  const delta = round(cur - (prev ?? 0));
  let deltaPct: number | null = null;
  if (prev != null) {
    deltaPct = prev !== 0 ? round1((delta / prev) * 100) : cur !== 0 ? null : 0;
  }
  return { key, current: cur, previous: prev, delta, deltaPct };
}

/** 计算对比周期（当前周期截止 now，上一周期取等长窗口） */
function buildComparisonPeriods(
  granularity: ReportGranularity,
  now = new Date(),
): { current: ReportPeriodBoundary; previous: ReportPeriodBoundary } {
  if (granularity === 'week') {
    const currentStart = mondayOf(now);
    const span = now.getTime() - currentStart.getTime();
    return {
      current: { start: currentStart, end: now, label: '本周' },
      previous: {
        start: new Date(currentStart.getTime() - 7 * DAY_MS),
        end: new Date(currentStart.getTime() - 7 * DAY_MS + span),
        label: '上周',
      },
    };
  }
  const currentStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const span = now.getTime() - currentStart.getTime();
  const previousStart = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  return {
    current: { start: currentStart, end: now, label: '本月' },
    previous: { start: previousStart, end: new Date(previousStart.getTime() + span), label: '上月' },
  };
}

type EnergyRow = { entityId: string; date: string; delta: number };
type EventRow = { date: string; count: number };
type EnvRow = { date: string; avg: number | null };
type EnvRoomRow = { room: string; avg: number | null };
type EntityCountRow = { entityId: string; count: number };
type DeviceSeriesRow = { date: string; runtimeMs: number };

@Injectable()
/**
 * ReportCompareService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class ReportCompareService
 */
export class ReportCompareService {
  constructor(private readonly prisma: PrismaService) {}

  /** 主入口：聚合两个对比周期的按天序列、汇总与横向对比 */
  async compare(input: ReportCompareInput) {
    const metric: ReportMetric = input.metric || 'events';
    const granularity: ReportGranularity = input.granularity || 'week';
    const field: EnvReportField =
      metric === 'environment'
        ? input.field === 'humidity' || input.field === 'iaq'
          ? input.field
          : 'temperature'
        : 'temperature';
    const periods = buildComparisonPeriods(granularity);

    if (metric === 'environment') {
      return this.buildEnvironmentReport(periods, granularity, field);
    }
    if (metric === 'energy') {
      return this.buildEnergyReport(periods, granularity, input.entityIds, input.restrictions);
    }
    if (metric === 'device') {
      return this.buildDeviceReport(periods, granularity, input.entityIds, input.restrictions);
    }
    return this.buildEventsReport(periods, granularity, input.entityIds, input.restrictions);
  }

  // ── events：EventLog 计数 ──
  private async buildEventsReport(
    periods: { current: ReportPeriodBoundary; previous: ReportPeriodBoundary },
    granularity: ReportGranularity,
    entityIds: string[] | undefined,
    restrictions: string[] | null,
  ) {
    const accessSql = eventLogAccessSql(restrictions);
    const [curRows, prevRows] = await Promise.all([
      this.aggregateEventSeries(periods.current, entityIds, accessSql),
      this.aggregateEventSeries(periods.previous, entityIds, accessSql),
    ]);
    const [curEntities, prevEntities] = await Promise.all([
      this.aggregateEventByEntity(periods.current, entityIds, accessSql, BY_ENTITY_LIMIT),
      this.aggregateEventByEntity(periods.previous, entityIds, accessSql, BY_ENTITY_LIMIT),
    ]);
    const prevEntityMap = new Map(prevEntities.map((r) => [r.entityId, r.count]));
    const byEntity = curEntities.map((r) =>
      buildCompareRow(r.entityId, r.count, prevEntityMap.get(r.entityId) ?? 0, (n) => Math.round(n)),
    );
    return this.assembleResponse(
      'events',
      granularity,
      undefined,
      '次',
      periods,
      curRows,
      prevRows,
      byEntity,
    );
  }

  private async aggregateEventSeries(
    period: ReportPeriodBoundary,
    entityIds: string[] | undefined,
    accessSql: Prisma.Sql,
  ): Promise<ReportSeriesPoint[]> {
    const entitySql = entityIds?.length
      ? Prisma.sql`AND "entityId" IN (${Prisma.join(entityIds.map((id) => Prisma.sql`${id}`), ', ')})`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<EventRow[]>`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM "EventLog"
      WHERE "createdAt" >= ${period.start} AND "createdAt" < ${period.end}
      ${entitySql}
      ${accessSql}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    const map = new Map(rows.map((r) => [r.date, Number(r.count) || 0]));
    return buildDayLabels(period.start, period.end).map((date) => ({
      date,
      label: formatShortLabel(date),
      value: map.get(date) ?? 0,
    }));
  }

  private async aggregateEventByEntity(
    period: ReportPeriodBoundary,
    entityIds: string[] | undefined,
    accessSql: Prisma.Sql,
    limit: number,
  ): Promise<EntityCountRow[]> {
    const entitySql = entityIds?.length
      ? Prisma.sql`AND "entityId" IN (${Prisma.join(entityIds.map((id) => Prisma.sql`${id}`), ', ')})`
      : Prisma.empty;
    return this.prisma.$queryRaw<EntityCountRow[]>`
      SELECT "entityId", COUNT(*)::int AS count
      FROM "EventLog"
      WHERE "createdAt" >= ${period.start} AND "createdAt" < ${period.end}
      ${entitySql}
      ${accessSql}
      GROUP BY "entityId"
      ORDER BY count DESC
      LIMIT ${limit}
    `;
  }

  // ── energy：EventLog 累计读数差分 ──
  private async buildEnergyReport(
    periods: { current: ReportPeriodBoundary; previous: ReportPeriodBoundary },
    granularity: ReportGranularity,
    entityIds: string[] | undefined,
    restrictions: string[] | null,
  ) {
    const ids = await this.resolveEnergyEntityIds(entityIds, restrictions);
    if (!ids.length) {
      const empty = buildDayLabels(periods.current.start, periods.current.end).map((date) => ({
        date,
        label: formatShortLabel(date),
        value: 0,
      }));
      const emptyPrev = buildDayLabels(periods.previous.start, periods.previous.end).map((date) => ({
        date,
        label: formatShortLabel(date),
        value: 0,
      }));
      return this.assembleResponse(
        'energy',
        granularity,
        undefined,
        'kWh',
        periods,
        empty,
        emptyPrev,
        [],
      );
    }
    const [curRows, prevRows] = await Promise.all([
      this.readEnergyDeltas(periods.current, ids),
      this.readEnergyDeltas(periods.previous, ids),
    ]);
    const curSeries = this.toEnergySeries(curRows, periods.current);
    const prevSeries = this.toEnergySeries(prevRows, periods.previous);
    const byEntity = this.buildEnergyByEntity(curRows, prevRows, periods);
    return this.assembleResponse(
      'energy',
      granularity,
      undefined,
      'kWh',
      periods,
      curSeries,
      prevSeries,
      byEntity,
    );
  }

  /** 解析能耗计量实体：候选白名单 ∩ 请求过滤 ∩ ACL */
  private async resolveEnergyEntityIds(
    entityIds: string[] | undefined,
    restrictions: string[] | null,
  ): Promise<string[]> {
    const candidates = await this.prisma.$queryRaw<Array<{ entityId: string }>>`
      SELECT "entityId" FROM "EnergyCandidateEntity"
    `;
    let ids = candidates.map((r) => r.entityId);
    if (entityIds?.length) {
      const wanted = new Set(entityIds);
      ids = ids.filter((id) => wanted.has(id));
    }
    if (restrictions !== null) {
      ids = ids.filter((id) => isEntityAllowed(id, restrictions));
    }
    return ids;
  }

  /** 读取周期内每日末次读数，LAG 差分得到每日增量（窗口向前预取 7 天以覆盖读数间隔） */
  private async readEnergyDeltas(period: ReportPeriodBoundary, ids: string[]): Promise<EnergyRow[]> {
    const windowStart = new Date(period.start.getTime() - 7 * DAY_MS);
    const idSql = Prisma.join(ids.map((id) => Prisma.sql`${id}`), ', ');
    const rows = await this.prisma.$queryRaw<EnergyRow[]>`
      WITH day_last AS (
        SELECT DISTINCT ON ("entityId", day) "entityId", day, val
        FROM (
          SELECT "entityId", "createdAt",
                 date_trunc('day', "createdAt") AS day,
                 (split_part("stateDiff", '→', 2))::double precision AS val
          FROM "EventLog"
          WHERE "createdAt" >= ${windowStart} AND "createdAt" < ${period.end}
            AND "entityId" IN (${idSql})
            AND "stateDiff" IS NOT NULL
            AND "stateDiff" LIKE '%→%'
            AND "stateDiff" NOT LIKE 'attr:%'
            AND (split_part("stateDiff", '→', 2)) ~ '^[0-9]+(\.[0-9]+)?$'
        ) t
        ORDER BY "entityId", day, "createdAt" DESC
      )
      SELECT "entityId",
             to_char(day, 'YYYY-MM-DD') AS date,
             GREATEST(val - LAG(val) OVER (PARTITION BY "entityId" ORDER BY day), 0)::double precision AS delta
      FROM day_last
      ORDER BY "entityId", day ASC
    `;
    return rows.map((r) => ({ entityId: r.entityId, date: r.date, delta: Number(r.delta) || 0 }));
  }

  private toEnergySeries(
    rows: EnergyRow[],
    period: ReportPeriodBoundary,
  ): ReportSeriesPoint[] {
    const firstDay = formatDayLabel(period.start);
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.date < firstDay) continue;
      map.set(r.date, (map.get(r.date) || 0) + r.delta);
    }
    return buildDayLabels(period.start, period.end).map((date) => ({
      date,
      label: formatShortLabel(date),
      value: round2(map.get(date) ?? 0),
    }));
  }

  private buildEnergyByEntity(
    curRows: EnergyRow[],
    prevRows: EnergyRow[],
    periods: { current: ReportPeriodBoundary; previous: ReportPeriodBoundary },
  ): ReportCompareRow[] {
    const sumByEntity = (rows: EnergyRow[], period: ReportPeriodBoundary) => {
      const firstDay = formatDayLabel(period.start);
      const map = new Map<string, number>();
      for (const r of rows) {
        if (r.date < firstDay) continue;
        map.set(r.entityId, (map.get(r.entityId) || 0) + r.delta);
      }
      return map;
    };
    const cur = sumByEntity(curRows, periods.current);
    const prev = sumByEntity(prevRows, periods.previous);
    return [...cur.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, BY_ENTITY_LIMIT)
      .map(([entityId, value]) => buildCompareRow(entityId, value, prev.get(entityId) ?? 0));
  }

  // ── environment：EnvironmentRecord 按天均值 ──
  private async buildEnvironmentReport(
    periods: { current: ReportPeriodBoundary; previous: ReportPeriodBoundary },
    granularity: ReportGranularity,
    field: EnvReportField,
  ) {
    const unit = field === 'humidity' ? '%' : field === 'iaq' ? '分' : '℃';
    const [curSeries, prevSeries] = await Promise.all([
      this.aggregateEnvironmentSeries(periods.current, field),
      this.aggregateEnvironmentSeries(periods.previous, field),
    ]);
    const [curRooms, prevRooms] = await Promise.all([
      this.aggregateEnvironmentByRoom(periods.current, field),
      this.aggregateEnvironmentByRoom(periods.previous, field),
    ]);
    const prevRoomMap = new Map(prevRooms.map((r) => [r.room, r.avg]));
    const byEntity = curRooms.map((r) =>
      buildCompareRow(r.room, r.avg ?? 0, prevRoomMap.get(r.room) ?? null, round1),
    );
    return this.assembleResponse(
      'environment',
      granularity,
      field,
      unit,
      periods,
      curSeries,
      prevSeries,
      byEntity,
    );
  }

  private envColumnSql(field: EnvReportField): Prisma.Sql {
    if (field === 'humidity') return Prisma.sql`"humidity"`;
    if (field === 'iaq') return Prisma.sql`"iaqScore"`;
    return Prisma.sql`"temperature"`;
  }

  private async aggregateEnvironmentSeries(
    period: ReportPeriodBoundary,
    field: EnvReportField,
  ): Promise<ReportSeriesPoint[]> {
    const col = this.envColumnSql(field);
    const rows = await this.prisma.$queryRaw<EnvRow[]>`
      SELECT to_char(date_trunc('day', "recordedAt"), 'YYYY-MM-DD') AS date,
             AVG(${col})::double precision AS avg
      FROM "EnvironmentRecord"
      WHERE "recordedAt" >= ${period.start} AND "recordedAt" < ${period.end}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    const map = new Map(rows.map((r) => [r.date, r.avg == null ? null : round1(Number(r.avg))]));
    return buildDayLabels(period.start, period.end).map((date) => ({
      date,
      label: formatShortLabel(date),
      value: map.has(date) ? map.get(date) ?? null : null,
    }));
  }

  private async aggregateEnvironmentByRoom(
    period: ReportPeriodBoundary,
    field: EnvReportField,
  ): Promise<EnvRoomRow[]> {
    const col = this.envColumnSql(field);
    return this.prisma.$queryRaw<EnvRoomRow[]>`
      SELECT "room", AVG(${col})::double precision AS avg
      FROM "EnvironmentRecord"
      WHERE "recordedAt" >= ${period.start} AND "recordedAt" < ${period.end}
      GROUP BY "room"
      ORDER BY avg DESC
      LIMIT ${BY_ENTITY_LIMIT}
    `;
  }

  // ── device：DeviceUsageStat 按天聚合（onCount / totalRuntimeMs） ──
  private async buildDeviceReport(
    periods: { current: ReportPeriodBoundary; previous: ReportPeriodBoundary },
    granularity: ReportGranularity,
    entityIds: string[] | undefined,
    restrictions: string[] | null,
  ) {
    const ids = await this.resolveDeviceEntityIds(periods, entityIds, restrictions);
    const emptySeries = (period: ReportPeriodBoundary) =>
      buildDayLabels(period.start, period.end).map((date) => ({
        date,
        label: formatShortLabel(date),
        value: 0,
      }));
    if (ids !== null && ids.length === 0) {
      return this.assembleResponse(
        'device',
        granularity,
        undefined,
        '小时',
        periods,
        emptySeries(periods.current),
        emptySeries(periods.previous),
        [],
      );
    }
    const [curRows, prevRows] = await Promise.all([
      this.aggregateDeviceSeries(periods.current, ids),
      this.aggregateDeviceSeries(periods.previous, ids),
    ]);
    const toHoursSeries = (rows: DeviceSeriesRow[], period: ReportPeriodBoundary) => {
      const map = new Map(rows.map((r) => [r.date, round2(Number(r.runtimeMs) / 3_600_000)]));
      return buildDayLabels(period.start, period.end).map((date) => ({
        date,
        label: formatShortLabel(date),
        value: map.get(date) ?? 0,
      }));
    };
    const [curEntities, prevEntities] = await Promise.all([
      this.aggregateDeviceByEntity(periods.current, ids),
      this.aggregateDeviceByEntity(periods.previous, ids),
    ]);
    const prevEntityMap = new Map(prevEntities.map((r) => [r.entityId, Number(r.runtimeMs)]));
    const byEntity = curEntities.map((r) =>
      buildCompareRow(r.entityId, Number(r.runtimeMs) / 3_600_000, prevEntityMap.get(r.entityId) ?? 0),
    );
    return this.assembleResponse(
      'device',
      granularity,
      undefined,
      '小时',
      periods,
      toHoursSeries(curRows, periods.current),
      toHoursSeries(prevRows, periods.previous),
      byEntity,
    );
  }

  /**
   * 解析设备使用统计实体：ACL 限制或显式过滤时拉取周期内 distinct 实体再应用层过滤；
   * 返回 null 表示不过滤（全部实体）。
   */
  private async resolveDeviceEntityIds(
    periods: { current: ReportPeriodBoundary; previous: ReportPeriodBoundary },
    entityIds: string[] | undefined,
    restrictions: string[] | null,
  ): Promise<string[] | null> {
    if (restrictions === null && !entityIds?.length) return null;
    const startDay = formatDayLabel(periods.current.start);
    const endDay = formatDayLabel(periods.current.end);
    const rows = await this.prisma.$queryRaw<Array<{ entityId: string }>>`
      SELECT DISTINCT "entityId" FROM "DeviceUsageStat"
      WHERE day >= ${startDay} AND day <= ${endDay}
    `;
    let ids = rows.map((r) => r.entityId);
    if (entityIds?.length) {
      const wanted = new Set(entityIds);
      ids = ids.filter((id) => wanted.has(id));
    }
    if (restrictions !== null) {
      ids = ids.filter((id) => isEntityAllowed(id, restrictions));
    }
    return ids;
  }

  private async aggregateDeviceSeries(
    period: ReportPeriodBoundary,
    ids: string[] | null,
  ): Promise<DeviceSeriesRow[]> {
    const startDay = formatDayLabel(period.start);
    const endDay = formatDayLabel(period.end);
    const idSql = ids
      ? Prisma.sql`AND "entityId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}`), ', ')})`
      : Prisma.empty;
    return this.prisma.$queryRaw<DeviceSeriesRow[]>`
      SELECT day AS date, SUM("totalRuntimeMs")::double precision AS runtimeMs
      FROM "DeviceUsageStat"
      WHERE day >= ${startDay} AND day <= ${endDay}
      ${idSql}
      GROUP BY day
      ORDER BY day ASC
    `;
  }

  private async aggregateDeviceByEntity(
    period: ReportPeriodBoundary,
    ids: string[] | null,
  ): Promise<Array<{ entityId: string; runtimeMs: number }>> {
    const startDay = formatDayLabel(period.start);
    const endDay = formatDayLabel(period.end);
    const idSql = ids
      ? Prisma.sql`AND "entityId" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}`), ', ')})`
      : Prisma.empty;
    return this.prisma.$queryRaw<Array<{ entityId: string; runtimeMs: number }>>`
      SELECT "entityId", SUM("totalRuntimeMs")::double precision AS runtimeMs
      FROM "DeviceUsageStat"
      WHERE day >= ${startDay} AND day <= ${endDay}
      ${idSql}
      GROUP BY "entityId"
      ORDER BY runtimeMs DESC
      LIMIT ${BY_ENTITY_LIMIT}
    `;
  }

  /** 由当前序列与横向对比派生洞察：峰值日、日均、有效天数、涨跌 Top */
  private buildInsights(
    metric: ReportMetric,
    curSeries: ReportSeriesPoint[],
    byEntity: ReportCompareRow[],
  ): ReportInsights {
    const avgRound =
      metric === 'events' ? (n: number) => Math.round(n) : metric === 'environment' ? round1 : round2;
    let peakDay: ReportInsights['peakDay'] = null;
    let sum = 0;
    let activeDays = 0;
    for (const p of curSeries) {
      if (p.value == null || !Number.isFinite(p.value)) continue;
      const countsAsActive = metric === 'environment' || p.value !== 0;
      if (countsAsActive) activeDays += 1;
      sum += p.value;
      if (peakDay == null || p.value > peakDay.value) {
        peakDay = { date: p.date, label: p.label, value: p.value };
      }
    }
    const avgPerDay = activeDays > 0 ? avgRound(sum / activeDays) : null;
    if (peakDay) peakDay = { ...peakDay, value: avgRound(peakDay.value) };

    const withPct = byEntity.filter((r) => r.deltaPct != null);
    let topRiser: ReportCompareRow | null = null;
    let topFaller: ReportCompareRow | null = null;
    for (const row of withPct) {
      const pct = row.deltaPct as number;
      if (topRiser == null || pct > (topRiser.deltaPct as number)) topRiser = row;
      if (topFaller == null || pct < (topFaller.deltaPct as number)) topFaller = row;
    }
    return { peakDay, avgPerDay, activeDays, topRiser, topFaller };
  }

  // ── 响应组装 ──
  private assembleResponse(
    metric: ReportMetric,
    granularity: ReportGranularity,
    field: EnvReportField | undefined,
    unit: string,
    periods: { current: ReportPeriodBoundary; previous: ReportPeriodBoundary },
    curSeries: ReportSeriesPoint[],
    prevSeries: ReportSeriesPoint[],
    byEntity: ReportCompareRow[],
  ) {
    // 汇总口径：events / energy 用周期总量（求和），environment 用周期均值（平均值）
    const sumOf = (points: ReportSeriesPoint[]) =>
      points.reduce((acc, p) => acc + (p.value ?? 0), 0);
    const meanOf = (points: ReportSeriesPoint[]) => {
      const values = points
        .map((p) => p.value)
        .filter((v): v is number => v != null && Number.isFinite(v));
      if (!values.length) return null;
      return values.reduce((a, b) => a + b, 0) / values.length;
    };
    const currentTotal =
      metric === 'environment' ? meanOf(curSeries) ?? 0 : sumOf(curSeries);
    const previousTotal =
      metric === 'environment' ? meanOf(prevSeries) : sumOf(prevSeries);
    const totals = buildCompareRow(
      'total',
      currentTotal,
      previousTotal,
      metric === 'events' ? (n) => Math.round(n) : round2,
    );
    return {
      metric,
      granularity,
      field: metric === 'environment' ? field : undefined,
      unit,
      periods: {
        current: {
          start: periods.current.start.toISOString(),
          end: periods.current.end.toISOString(),
          label: periods.current.label,
        },
        previous: {
          start: periods.previous.start.toISOString(),
          end: periods.previous.end.toISOString(),
          label: periods.previous.label,
        },
      },
      series: { current: curSeries, previous: prevSeries },
      totals,
      byEntity,
      insights: this.buildInsights(metric, curSeries, byEntity),
    };
  }
}
