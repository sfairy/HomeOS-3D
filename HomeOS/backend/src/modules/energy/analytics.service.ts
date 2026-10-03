/**
 * @file energy-analytics.service.ts
 * @module backend/src/modules
 *
 * 能源分析服务：基于 Redis Sorted Set 时间线数据，提供趋势对比、
 * 设备能耗排名、温度-功率关联分析、分路用电计量、节能估算与日月聚合回退。
 *
 * 数据来源：
 *  - 实时趋势 / 排名 / 关联：Redis `timeline:entity:*` 与 `timeline:all`
 *  - 日 / 月聚合：EnergyUsageDaily / EnergyUsageMonthly（Redis 不可用时回退）
 *  - 节能估算：阶梯电价配置 + 峰谷错峰系数 + 气候敏感系数（实测驱动）
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/service';
import { RedisService } from '../../shared/redis/service';
import { AppConfigService } from '../../shared/app-config/service';
import { isPeakTime } from '../../shared/app-config/pricing-config.util';
import { parseCircuitEntityIds } from './circuit.util';
import { TieredPricingService } from './tiered-pricing.service';
import { businessDayKey, businessMonthKey } from '../../common/utils/local-date.util';
import { parseTimelineSnapshot } from '../../common/utils/timeline-snapshot.util';
import { getErrorMessage } from '../../common/utils';

interface TrendPoint {
  time: string;
  value: number;
}

interface EnergyTrendMeta {
  redisReady: boolean;
  entityId: string;
  hours: number;
  sampleCount: number;
}

interface EnergyTrendResult {
  points: TrendPoint[];
  meta: EnergyTrendMeta;
}

/**
 * 能源分析服务
 *
 * 基于 Redis Sorted Set 时间线数据，提供：
 * 1. 时段趋势对比（今天 vs 昨天 vs 上周同一天）
 * 2. 关联分析（温度 vs 空调用电量）
 * 3. 设备能耗排名
 * 4. 日/周/月统计
 */
@Injectable()
export class EnergyAnalyticsService {
  private readonly logger = new Logger(EnergyAnalyticsService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly pricing: TieredPricingService,
  ) {}

  /**
   * 获取实体指定时间范围的趋势数据（含 Redis 就绪元数据）
   */
  async getTrendWithMeta(entityId: string, hoursBack = 24): Promise<EnergyTrendResult> {
    const redisReady = this.redisService.isReady();
    const points = redisReady ? await this.getTrend(entityId, hoursBack, true) : [];
    return {
      points,
      meta: {
        redisReady,
        entityId,
        hours: hoursBack,
        sampleCount: points.length,
      },
    };
  }

  /**
   * 获取实体指定时间范围的趋势数据
   * @param redisReady 可选；已知就绪时传入以跳过二次 isReady 检查
   */
  async getTrend(entityId: string, hoursBack = 24, redisReady?: boolean): Promise<TrendPoint[]> {
    if (!(redisReady ?? this.redisService.isReady())) return [];
    const now = Date.now();
    const from = now - hoursBack * 3600_000;
    return this.getTrendInRange(entityId, from, now, hoursBack * 6);
  }

  /**
   * 精确时间窗口趋势（避免多取再 filter）
   */
  private async getTrendInRange(
    entityId: string,
    fromMs: number,
    toMs: number,
    limit: number,
  ): Promise<TrendPoint[]> {
    if (!this.redisService.isReady()) return [];
    const raw = await this.redisService.zrangeLatest(
      `timeline:entity:${entityId}`,
      fromMs,
      toMs,
      limit,
    );
    return raw
      .map((s: string) => {
        try {
          const d = JSON.parse(s);
          return { time: new Date(d.ts).toISOString(), value: parseFloat(d.state) || 0 };
        } catch (err: unknown) {
          this.logger.debug(`能源趋势点解析跳过: ${String(err)}`);
          return { time: '', value: 0 };
        }
      })
      .filter((p) => p.time);
  }

  /**
   * 获取多个实体合并的趋势（管道批量查询，N 个实体 1 次 RTT）
   */
  async getAggregatedTrend(entityIds: string[], hoursBack = 24) {
    if (!this.redisService.isReady()) return [];
    const now = Date.now();
    const from = now - hoursBack * 3600_000;

    // 管道批量：N 个 entity 仅 1 次 Redis 往返
    const keys = entityIds.map((id) => `timeline:entity:${id}`);
    const rawSets = await this.redisService.mzRangeByScore(keys, from, now, hoursBack * 6);

    const merged: Map<string, number> = new Map();
    const bucketEntityLast = new Map<string, Map<string, number>>();

    for (let ki = 0; ki < rawSets.length; ki++) {
      const entityId = entityIds[ki];
      for (const s of rawSets[ki]) {
        try {
          const d = JSON.parse(s);
          const bucket = this.bucketKey(new Date(d.ts).toISOString(), 10);
          const val = parseFloat(d.state) || 0;
          if (!bucketEntityLast.has(bucket)) bucketEntityLast.set(bucket, new Map());
          const byEntity = bucketEntityLast.get(bucket);
          if (byEntity) byEntity.set(entityId, val);
        } catch (err: unknown) {
          this.logger.debug(`聚合趋势点解析跳过: ${String(err)}`);
        }
      }
    }

    for (const [bucket, byEntity] of bucketEntityLast) {
      let sum = 0;
      for (const v of byEntity.values()) sum += v;
      merged.set(bucket, sum);
    }

    return [...merged.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([time, value]) => ({ time, value: +value.toFixed(1) }));
  }

  /** 趋势对比：今天 vs 昨天（各自精确 24h 窗口，避免 48h 再 filter） */
  async compareDayOverDay(entityId: string) {
    const now = Date.now();
    const dayMs = 24 * 3600_000;
    const todayFrom = now - dayMs;
    const yesterdayFrom = now - 2 * dayMs;
    const [today, yesterdayRaw] = await Promise.all([
      this.getTrendInRange(entityId, todayFrom, now, 24 * 6),
      this.getTrendInRange(entityId, yesterdayFrom, todayFrom, 24 * 6),
    ]);
    const yesterdayFiltered = yesterdayRaw.map((p) => ({
      ...p,
      time: this.normalizeToDayTime(p.time),
    }));

    const todayNormalized = today.map((p) => ({ ...p, time: this.normalizeToDayTime(p.time) }));

    const todayAvg = today.length > 0 ? today.reduce((a, b) => a + b.value, 0) / today.length : 0;
    const yesterdayAvg =
      yesterdayFiltered.length > 0
        ? yesterdayFiltered.reduce((a, b) => a + b.value, 0) / yesterdayFiltered.length
        : 0;

    return {
      today: todayNormalized,
      yesterday: yesterdayFiltered,
      todayAvg: +todayAvg.toFixed(1),
      yesterdayAvg: +yesterdayAvg.toFixed(1),
      change:
        yesterdayAvg > 0 ? +(((todayAvg - yesterdayAvg) / yesterdayAvg) * 100).toFixed(1) : null,
    };
  }

  /**
   * 关联分析：温度 vs 功率
   * 按温度分桶，计算每桶的平均功率
   */
  async correlateTemperatureAndPower(
    tempEntityId: string,
    powerEntityIds: string[],
    hoursBack = 24,
  ) {
    const tempData = await this.getTrend(tempEntityId, hoursBack);
    const powerSeries = await this.getAggregatedTrend(powerEntityIds, hoursBack);

    // 按时间桶对齐温度与功率（避免数组下标错位）
    const powerByTime = new Map(powerSeries.map((p) => [p.time, p.value]));
    const buckets = new Map<number, { powerSum: number; count: number }>();
    for (const point of tempData) {
      const bucketTime = this.bucketKey(point.time, 10);
      const power = powerByTime.get(bucketTime);
      if (power == null) continue;
      const temp = point.value;
      const bucket = Math.round(temp / 2) * 2;
      const cur = buckets.get(bucket) || { powerSum: 0, count: 0 };
      cur.powerSum += power;
      cur.count++;
      buckets.set(bucket, cur);
    }

    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([temperature, v]) => ({
        temperature,
        avgPower: +(v.powerSum / v.count).toFixed(1),
        samples: v.count,
      }));
  }

  /** 设备能耗排名（基于 timeline 累计 kWh 增量；Redis 批量拉取） */
  async getDeviceEnergyRanking(limit = 10) {
    const since = new Date(Date.now() - 24 * 3600_000);
    // 能源计量候选实体白名单 → 精确 ID + 时间窗走 [entityId, createdAt] 索引，
    // 替代原 contains 前导通配全窗口扫描；候选表为空/不可用时落到下方 timeline:all 兜底
    let candidateIds: string[] = [];
    try {
      const candidates = await this.prisma.$queryRaw<Array<{ entityId: string }>>`
        SELECT "entityId" FROM "EnergyCandidateEntity"
      `;
      candidateIds = candidates.map((r) => r.entityId);
    } catch (err: unknown) {
      this.logger.debug(
        `能源候选表不可用,走 timeline 兜底: ${getErrorMessage(err)}`,
      );
    }
    const candidateRows = candidateIds.length
      ? await this.prisma.eventLog.findMany({
          where: {
            createdAt: { gte: since },
            entityId: { in: candidateIds },
          },
          select: { entityId: true },
          distinct: ['entityId'],
          take: 200,
        })
      : [];

    let rankings = await this.computeRankingDeltas(
      candidateRows.map((r) => r.entityId),
      24,
    );

    if (rankings.length === 0 && this.redisService.isReady()) {
      const now = Date.now();
      const from = now - 24 * 3600_000;
      const raw = await this.redisService.zrangeLatest('timeline:all', from, now, 5000);
      const entityIds = new Set<string>();
      for (const s of raw) {
        try {
          const d = JSON.parse(s);
          if (d.entity_id) entityIds.add(d.entity_id);
        } catch {
          /* 跳过 */
        }
      }
      const filtered = [...entityIds].filter((entityId) =>
        /energy|kwh|power_meter|electricity/i.test(entityId),
      );
      rankings = await this.computeRankingDeltas(filtered, 24);
    }

    return rankings
      .sort((a, b) => b.kwh - a.kwh)
      .slice(0, limit)
      .map((item, i) => ({ rank: i + 1, entityId: item.entityId, kwh: +item.kwh.toFixed(3) }));
  }

  /** 批量计算候选实体能耗增量（分块 mzRangeByScore，避免 N+1 RTT） */
  private async computeRankingDeltas(
    entityIds: string[],
    hoursBack: number,
  ): Promise<Array<{ entityId: string; kwh: number }>> {
    if (!entityIds.length || !this.redisService.isReady()) return [];
    const now = Date.now();
    const from = now - hoursBack * 3600_000;
    const chunkSize = 50;
    const rankings: Array<{ entityId: string; kwh: number }> = [];

    for (let i = 0; i < entityIds.length; i += chunkSize) {
      const chunk = entityIds.slice(i, i + chunkSize);
      const keys = chunk.map((id) => `timeline:entity:${id}`);
      const rawSets = await this.redisService.mzRangeByScore(keys, from, now, 5000);
      for (let j = 0; j < chunk.length; j++) {
        const kwh = this.deltaFromTimelineRaw(rawSets[j] || []);
        if (kwh > 0) rankings.push({ entityId: chunk[j], kwh });
      }
    }
    return rankings;
  }

  private deltaFromTimelineRaw(raw: string[]): number {
    let prev: number | null = null;
    let total = 0;
    for (const s of raw) {
      try {
        const d = JSON.parse(s);
        const val = parseFloat(d.state);
        if (!Number.isFinite(val)) continue;
        if (prev != null && val >= prev) total += val - prev;
        prev = val;
      } catch (err: unknown) {
        this.logger.debug(`能耗增量解析跳过: ${String(err)}`);
      }
    }
    return total;
  }

  /** 日/周/月统计摘要（基于已配置分路功率实体聚合） */
  async getSummary(hoursBack = 24) {
    const powerIds = parseCircuitEntityIds(this.appConfig.get('energy'));
    if (powerIds.length) {
      const series = await this.getAggregatedTrend(powerIds, hoursBack);
      const values = series.map((p) => p.value).filter((v) => v > 0);
      if (values.length === 0) return { avg: 0, max: 0, min: 0, total: 0, count: 0 };
      return {
        avg: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
        max: Math.max(...values),
        min: Math.min(...values),
        total: +values.reduce((a, b) => a + b, 0).toFixed(1),
        count: values.length,
      };
    }

    if (!this.redisService.isReady()) {
      return { avg: 0, max: 0, min: 0, total: 0, count: 0 };
    }
    const now = Date.now();
    const from = now - hoursBack * 3600_000;
    const raw = await this.redisService.zrangeLatest('timeline:all', from, now, hoursBack * 6);
    const values = raw
      .map((s: string) => {
        try {
          const d = JSON.parse(s);
          const eid = String(d.entity_id || '');
          if (!/power|energy|watt/i.test(eid)) return 0;
          return parseFloat(d.state) || 0;
        } catch {
          return 0;
        }
      })
      .filter((v) => v > 0);
    if (values.length === 0) return { avg: 0, max: 0, min: 0, total: 0, count: 0 };

    return {
      avg: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
      max: Math.max(...values),
      min: Math.min(...values),
      total: +values.reduce((a, b) => a + b, 0).toFixed(1),
      count: values.length,
    };
  }

  /**
   * 分路用电计量
   * 按预定义分类（空调/厨卫/照明/充电桩）合并功率
   * @param circuitMap - 分类名 → entity_id 列表
   */
  async getCircuitBreakdown(circuitMap: Record<string, string[]>, hoursBack = 24) {
    const breakdown: Record<string, { avgW: number; maxW: number; entities: number }> = {};

    for (const [label, ids] of Object.entries(circuitMap)) {
      const series = await this.getAggregatedTrend(ids, hoursBack);
      const values = series.map((p) => p.value).filter((v) => v > 0);
      breakdown[label] = {
        avgW:
          values.length > 0 ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : 0,
        maxW: values.length > 0 ? Math.max(...values) : 0,
        entities: ids.length,
      };
    }

    const totalAvg = Object.values(breakdown).reduce((sum, c) => sum + c.avgW, 0);
    return {
      totalAvgW: +totalAvg.toFixed(1),
      circuits: breakdown,
      pieData: Object.entries(breakdown).map(([name, d]) => ({
        name,
        value: d.avgW,
        percentage: totalAvg > 0 ? +((d.avgW / totalAvg) * 100).toFixed(1) : 0,
      })),
    };
  }

  /**
   * 无 Redis 回退：按天读取能耗聚合（EnergyUsageDaily）。
   * 补齐窗口内缺失日期为 0，保证图表连续；不依赖 Redis，直接读聚合表。
   *
   * @param entityId 能耗计量实体 ID
   * @param days 窗口天数（1-62），默认 30
   */
  async getUsageDaily(
    entityId: string,
    days = 30,
  ): Promise<{ points: Array<{ day: string; ele: number }>; meta: { source: string } }> {
    const windowDays = Math.min(Math.max(Math.floor(days) || 1, 1), 62);
    // 以上海时区的「今天」为锚点生成窗口（避免服务器本地时区与上海跨日偏差）
    const todayKey = businessDayKey(new Date());
    const [y, m, d] = todayKey.split('-').map(Number);
    const todayUtcMs = Date.UTC(y, m - 1, d);
    const startUtcMs = todayUtcMs - (windowDays - 1) * 86_400_000;
    const startKey = businessDayKey(new Date(startUtcMs));

    const rows = await this.prisma.$queryRaw<Array<{ day: string; kwh: number }>>`
      SELECT "day", "kwh" FROM "EnergyUsageDaily"
      WHERE "entityId" = ${entityId}
        AND "day" >= ${startKey}
        AND "day" <= ${todayKey}
      ORDER BY "day" ASC
    `;
    const byDay = new Map(rows.map((r) => [r.day, r.kwh]));
    const points: Array<{ day: string; ele: number }> = [];
    for (let ts = startUtcMs; ts <= todayUtcMs; ts += 86_400_000) {
      const key = businessDayKey(new Date(ts));
      points.push({ day: key, ele: byDay.get(key) ?? 0 });
    }
    return { points, meta: { source: 'aggregate' } };
  }

  /**
   * 无 Redis 回退：按月读取能耗聚合（EnergyUsageMonthly）。
   * 补齐窗口内缺失月份为 0，保证图表连续；不依赖 Redis，直接读聚合表。
   *
   * @param entityId 能耗计量实体 ID
   * @param months 窗口月数（1-24），默认 12
   */
  async getUsageMonthly(
    entityId: string,
    months = 12,
  ): Promise<{ points: Array<{ month: string; ele: number }>; meta: { source: string } }> {
    const windowMonths = Math.min(Math.max(Math.floor(months) || 1, 1), 24);
    const todayKey = businessDayKey(new Date());
    const [y, m] = todayKey.split('-').map(Number);
    const todayMonthKey = businessMonthKey(new Date(Date.UTC(y, m - 1, 1)));
    const startMonthKey = businessMonthKey(new Date(Date.UTC(y, m - windowMonths, 1)));

    const rows = await this.prisma.$queryRaw<Array<{ month: string; kwh: number }>>`
      SELECT "month", "kwh" FROM "EnergyUsageMonthly"
      WHERE "entityId" = ${entityId}
        AND "month" >= ${startMonthKey}
        AND "month" <= ${todayMonthKey}
      ORDER BY "month" ASC
    `;
    const byMonth = new Map(rows.map((r) => [r.month, r.kwh]));
    const points: Array<{ month: string; ele: number }> = [];
    for (let i = windowMonths - 1; i >= 0; i--) {
      const key = businessMonthKey(new Date(Date.UTC(y, m - 1 - i, 1)));
      points.push({ month: key, ele: byMonth.get(key) ?? 0 });
    }
    return { points, meta: { source: 'aggregate' } };
  }

  private bucketKey(iso: string, minutes: number): string {
    const d = new Date(iso);
    const m = Math.floor(d.getMinutes() / minutes) * minutes;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private normalizeToDayTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** 统计时间线在区间内的总用电与峰段用电（kWh 增量） */
  private async accumulateMeterKwh(
    meterId: string,
    fromMs: number,
    toMs: number,
    pricing: Parameters<typeof isPeakTime>[1],
  ): Promise<{ totalKwh: number; peakKwh: number; samples: number }> {
    if (!this.redisService.isReady() || !meterId) {
      return { totalKwh: 0, peakKwh: 0, samples: 0 };
    }
    const raw = await this.redisService.zrangebyscore(
      `timeline:entity:${meterId}`,
      fromMs,
      toMs,
      8000,
    );
    let prev: number | null = null;
    let peakKwh = 0;
    let totalDelta = 0;
    for (const item of raw) {
      try {
        const snap = parseTimelineSnapshot(item);
        if (!snap) continue;
        const val = parseFloat(snap.state);
        if (!Number.isFinite(val)) continue;
        const delta = prev != null && val >= prev ? val - prev : 0;
        prev = val;
        if (delta <= 0) continue;
        totalDelta += delta;
        if (isPeakTime(new Date(snap.ts), pricing)) peakKwh += delta;
      } catch {
        /* 跳过 */
      }
    }
    return { totalKwh: totalDelta, peakKwh, samples: raw.length };
  }

  /**
   * 规则估算本月峰谷错峰 / 自适应节能节省，并附带本周 vs 上周峰段对照。
   * 未绑定主电表或无有效用电样本时返回 null 节省值（不当作真实省钱）。
   */
  async getEstimatedSavings() {
    const pricing = this.appConfig.get('pricing');
    const energy = this.appConfig.get('energy');
    const meterId = String(energy.meterEntityId || '').trim();
    const timeOfUseEnabled = pricing.timeOfUseEnabled === true;
    const peakPrice = Number(pricing.peakPrice) || 0;
    const flatPrice = Number(pricing.flatPrice) || 0;
    const valleyPrice = Number(pricing.valleyPrice) || 0;
    const peakDelta = Math.max(0, peakPrice - (flatPrice || valleyPrice || peakPrice));

    let monthKwh = 0;
    let peakShare: number | null = null;
    let confidence: 'none' | 'low' | 'medium' | 'high' = 'none';
    // 本周 / 上周聚合（Redis 就绪时填充，供实测峰谷错峰系数使用）
    let thisWeek = { totalKwh: 0, peakKwh: 0, samples: 0 };
    let lastWeek = { totalKwh: 0, peakKwh: 0, samples: 0 };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const weekMs = 7 * 86400_000;
    const thisWeekFrom = now.getTime() - weekMs;
    const lastWeekFrom = thisWeekFrom - weekMs;

    let weekOverWeek: {
      thisWeekPeakKwh: number;
      lastWeekPeakKwh: number;
      peakKwhDelta: number;
      peakYuanDelta: number;
      improved: boolean;
      note: string;
    } | null = null;

    if (!meterId) {
      return {
        estimatedMonthlySavingsYuan: null,
        estimatedMonthlySavingsKwh: null,
        currency: 'CNY' as const,
        method: 'unavailable' as const,
        breakdown: {
          peakShiftYuan: null,
          climateEcoYuan: null,
          weekOverWeekPeakYuan: null,
        },
        weekOverWeek: null,
        period: {
          from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
          to: now.toISOString(),
        },
        pricing: {
          timeOfUseEnabled,
          periodPrices: timeOfUseEnabled
            ? { peak: peakPrice, flat: flatPrice, valley: valleyPrice }
            : null,
        },
        confidence: 'none' as const,
        monthKwh: null,
        meterBound: false,
        note: '未绑定主电表实体，无法估算节省（需绑定累计电量 kWh 传感器）',
      };
    }

    if (this.redisService.isReady()) {
      const month = await this.accumulateMeterKwh(meterId, monthStart, Date.now(), pricing);
      monthKwh = month.totalKwh;
      if (month.totalKwh > 0) {
        peakShare = month.peakKwh / month.totalKwh;
        confidence = month.samples > 48 ? 'high' : 'medium';
      } else {
        confidence = 'low';
      }

      const [weekAggNow, weekAggPrev] = await Promise.all([
        this.accumulateMeterKwh(meterId, thisWeekFrom, Date.now(), pricing),
        this.accumulateMeterKwh(meterId, lastWeekFrom, thisWeekFrom, pricing),
      ]);
      thisWeek = weekAggNow;
      lastWeek = weekAggPrev;
      const peakKwhDelta = +(thisWeek.peakKwh - lastWeek.peakKwh).toFixed(2);
      const peakYuanDelta = +(peakKwhDelta * peakDelta).toFixed(2);
      weekOverWeek = {
        thisWeekPeakKwh: +thisWeek.peakKwh.toFixed(2),
        lastWeekPeakKwh: +lastWeek.peakKwh.toFixed(2),
        peakKwhDelta,
        peakYuanDelta,
        improved: peakKwhDelta < 0,
        note:
          peakKwhDelta < 0
            ? `本周峰段用电较上周减少 ${Math.abs(peakKwhDelta).toFixed(2)} kWh（约省 ${Math.abs(peakYuanDelta).toFixed(2)} 元）`
            : peakKwhDelta > 0
              ? `本周峰段用电较上周增加 ${peakKwhDelta.toFixed(2)} kWh`
              : '本周峰段用电与上周基本持平',
      };
      if (thisWeek.samples + lastWeek.samples > 24 && confidence === 'low') confidence = 'medium';
    } else {
      confidence = 'low';
    }

    if (monthKwh <= 0 || peakShare == null) {
      return {
        estimatedMonthlySavingsYuan: null,
        estimatedMonthlySavingsKwh: null,
        currency: 'CNY' as const,
        method: 'unavailable' as const,
        breakdown: {
          peakShiftYuan: null,
          climateEcoYuan: null,
          weekOverWeekPeakYuan: weekOverWeek?.peakYuanDelta ?? null,
        },
        weekOverWeek,
        period: {
          from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
          to: now.toISOString(),
        },
        pricing: {
          timeOfUseEnabled,
          periodPrices: timeOfUseEnabled
            ? { peak: peakPrice, flat: flatPrice, valley: valleyPrice }
            : null,
        },
        confidence,
        monthKwh: +monthKwh.toFixed(2),
        meterBound: true,
        note: weekOverWeek
          ? `${weekOverWeek.note}；本月尚无足够用电样本，暂不估算月节省`
          : '本月尚无足够用电样本，暂不估算月节省',
      };
    }

    // ── 实测系数驱动（替代固定 10% / 3%）──
    // 1) 峰谷错峰系数：以本月与最近两周实测峰时占比的最低值为「可达基准」，
    //    可转移峰段电量 = 本月峰段电量 − 基准峰段电量；已达基准则按 2% 保守延续
    const lastWeekShare =
      weekOverWeek && lastWeek?.totalKwh > 0 ? lastWeek.peakKwh / lastWeek.totalKwh : peakShare;
    const thisWeekShare =
      weekOverWeek && thisWeek?.totalKwh > 0 ? thisWeek.peakKwh / thisWeek.totalKwh : peakShare;
    const peakShiftFactor = Math.max(0, peakShare - Math.min(peakShare, lastWeekShare, thisWeekShare));
    const estimatedPeakShiftKwh = timeOfUseEnabled
      ? Math.max(monthKwh * peakShare * 0.02, monthKwh * peakShiftFactor)
      : 0;
    const peakShiftYuan = estimatedPeakShiftKwh * peakDelta;

    // 2) 自适应节能（气候）系数：以本月日用量序列中高位日超出均值的比例度量
    //    气候敏感负荷（空调制冷/制热），实测驱动而非固定 3%
    const dailySeries = await this.pricing.getDailyUsageSeries();
    const positiveDays = dailySeries.filter((v) => v > 0);
    const avgDaily = positiveDays.length
      ? positiveDays.reduce((s, v) => s + v, 0) / positiveDays.length
      : 0;
    const maxDaily = positiveDays.length ? Math.max(...positiveDays) : 0;
    const climateEcoFactor =
      avgDaily > 0 && maxDaily > avgDaily
        ? Math.min(0.15, Math.max(0.01, (maxDaily - avgDaily) / avgDaily))
        : 0.03;
    const climateEcoKwh = monthKwh * climateEcoFactor;
    const climateEcoYuan = climateEcoKwh * (flatPrice || peakPrice || 0.5);
    const estimatedMonthlySavingsKwh = +(estimatedPeakShiftKwh + climateEcoKwh).toFixed(2);
    const estimatedMonthlySavingsYuan = +(peakShiftYuan + climateEcoYuan).toFixed(2);

    return {
      estimatedMonthlySavingsYuan,
      estimatedMonthlySavingsKwh,
      currency: 'CNY' as const,
      method: timeOfUseEnabled ? ('peak_shift_vs_flat' as const) : ('dod_baseline' as const),
      breakdown: {
        peakShiftYuan: +peakShiftYuan.toFixed(2),
        climateEcoYuan: +climateEcoYuan.toFixed(2),
        weekOverWeekPeakYuan: weekOverWeek?.peakYuanDelta ?? null,
        // 实测系数：峰谷错峰潜力因子 / 气候敏感系数（供前端展示估算依据）
        peakShiftFactor: +peakShiftFactor.toFixed(3),
        climateEcoFactor: +climateEcoFactor.toFixed(3),
      },
      weekOverWeek,
      period: {
        from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        to: now.toISOString(),
      },
      pricing: {
        timeOfUseEnabled,
        periodPrices: timeOfUseEnabled
          ? { peak: peakPrice, flat: flatPrice, valley: valleyPrice }
          : null,
      },
      confidence,
      monthKwh: +monthKwh.toFixed(2),
      meterBound: true,
      note: weekOverWeek
        ? `${weekOverWeek.note}；另附规则估算月节省（峰段错峰约 10% + 无人节能约 3%，非实测）`
        : '规则估算：峰段错峰约削减 10% 峰电 + 无人节能约 3% 总用电，仅供参考（非实测账单）',
    };
  }
}
