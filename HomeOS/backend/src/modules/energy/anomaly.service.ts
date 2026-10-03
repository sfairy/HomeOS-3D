/**
 * @file energy/anomaly.service.ts
 * @module backend/src/modules
 *
 * 能源异常检测服务：监测电力 / 燃气 / 水表传感器，实时检测异常模式。
 *
 * 异常模式：
 *  1. 待机功耗过高（power > 阈值 持续 sustainedMs 不降）
 *  2. 同比突增（当前功率 > 历史同时段平均的 spikeRatio 倍，优先 hour×dow 基线 + zScore）
 *  3. 持续高负荷（功率 > 阈值 × 2 持续 > sustainedMs）
 *
 * 学习期保护：首装向导完成后的 learningPeriodDays 天内跳过突增类告警，避免基线未稳时误报。
 * 基线来源：滚动均值（最近 baselineSize 次读数）+ EnergyHourlyBaseline 同小时/星期分布尔塔。
 * 持久化：EnergyBaseline 表存储滚动均值；告警通过 EventBus 广播 ENERGY_ANOMALY 事件。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { parseJsonArray } from '../../common/utils/json-field.util';
import { HA_EVENTS } from '../../shared/types';
import type { HaStateChangeBatchEvent, HaStateChangeEvent } from '../../shared/types';
import { forEachColdBatchEvent } from '../../shared/ha/cold-batch.util';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';
import { HaStateChangeRouterService } from '../../shared/ha/state-change-router.service';
import { bucketHourDow, zScore } from '../../common/utils/stats.util';
import { isPowerSensor } from '../../common/utils/power-sensor.util';

/**
 * 能源异常检测服务（@Injectable）。
 *
 * 监测电力/燃气/水表传感器，实时检测异常模式：
 * 1. 待机功耗过高（power > 阈值 持续 30 分钟不降）
 * 2. 同比突增（当前功率 > 历史同时段平均的 2 倍）
 * 3. 持续高负荷（功率 > 阈值 持续 > 2h）
 */
@Injectable()
export class EnergyAnomalyService implements OnModuleInit {
  private readonly logger = new Logger(EnergyAnomalyService.name);

  /** 基线：entity_id → 滚动均值（简化：最近 10 次读数） */
  private baseline = new Map<string, { readings: number[]; lastAlert: number }>();
  /** 持续高负荷起始时间 entity_id → timestamp */
  private sustainedHighSince = new Map<string, number>();
  /** 待机过高起始时间 entity_id → timestamp（需持续 sustainedMs 才告警） */
  private standbySince = new Map<string, number>();

  private get cfg() {
    return this.appConfig.get('energy');
  }

  private get baselineSize() {
    return this.cfg.baselineSize;
  }

  private get sustainedMs() {
    return this.cfg.sustainedMs;
  }

  /** 首装向导完成后的学习期内跳过功率突增类告警 */
  private isInLearningPeriod(nowMs: number): boolean {
    const started = this.cfg.learningStartedAt?.trim();
    if (!started) return false;
    const startMs = Date.parse(started);
    if (Number.isNaN(startMs)) return false;
    const days = this.cfg.learningPeriodDays ?? 7;
    return nowMs - startMs < days * 86400000;
  }

  constructor(
    private readonly eventBus: EventBusService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly stateRouter: HaStateChangeRouterService,
  ) {}

  async onModuleInit() {
    await this.loadFromDb();
  }

  private async loadFromDb() {
    try {
      const records = await this.prisma.energyBaseline.findMany({ take: 1000 });
      for (const r of records) {
        const readings = parseJsonArray<number>(r.readings).filter((n) => typeof n === 'number');
        this.baseline.set(r.entityId, {
          readings,
          lastAlert: Number(r.lastAlert),
        });
      }
      this.logger.log(`能源基线数据已加载: ${records.length} 个传感器`);
    } catch (err) {
      this.logger.warn(`加载能源基线数据失败: ${(err as Error).message}`);
    }
  }

  private persistBaseline(entityId: string, readings: number[], lastAlert: number) {
    setImmediate(() => {
      this.prisma.energyBaseline
        .upsert({
          where: { entityId },
          create: { entityId, readings, lastAlert: BigInt(lastAlert) },
          update: { readings, lastAlert: BigInt(lastAlert) },
        })
        .catch((err) => this.logger.warn(`持久化能源基线失败 [${entityId}]: ${err.message}`));
    });
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChange(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
      if (!this.stateRouter.shouldProcess('energy', event)) return;
      const entityId = event.entity_id;
      const state = event.new_state?.state;
      if (!state) return;

      // 只处理 power 传感器
      if (!isPowerSensor(entityId)) return;

      const power = parseFloat(state);
      if (isNaN(power)) return;

      let record = this.baseline.get(entityId);
      if (!record) {
        record = { readings: [], lastAlert: 0 };
        this.baseline.set(entityId, record);
      }

      record.readings.push(power);
      if (record.readings.length > this.baselineSize) record.readings.shift();

      const now = Date.now();

      // 异步持久化基线
      this.persistBaseline(entityId, record.readings, record.lastAlert);

      if (now - record.lastAlert < this.cfg.anomalyCooldownMin * 60_000) return;

      if (this.isInLearningPeriod(now)) return;

      const avg = this.avg(record.readings);

      // 检测1：待机过高（需持续 sustainedMs 才告警，首帧超阈值不告警）
      if (power > this.cfg.standbyThresholdW && avg > this.cfg.standbyThresholdW) {
        const since = this.standbySince.get(entityId) ?? now;
        this.standbySince.set(entityId, since);
        if (now - since < this.sustainedMs) return;
        record.lastAlert = now;
        const name =
          (event.new_state?.attributes as Record<string, unknown>)?.friendly_name || entityId;
        this.logger.warn(
          `⚡ 待机功耗异常: ${name} = ${power}W (avg ${avg.toFixed(0)}W,持续 ${Math.round(this.sustainedMs / 60000)} 分钟)`,
        );
        this.eventBus.emit(HOMEOS_EVENTS.ENERGY_ANOMALY, {
          type: 'high_standby',
          entityId,
          friendlyName: name,
          current: power,
          average: avg,
          threshold: this.cfg.standbyThresholdW,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      this.standbySince.delete(entityId);

      // 检测2：同比突增 — 优先 hour×dow 基线 + zScore，无基线时回退滚动均值
      void this.evaluateSpike(event, entityId, power, record, now, avg);

      // 检测3：持续高负荷（> 阈值持续 2h）
      const highThreshold = this.cfg.standbyThresholdW * 2;
      if (power > highThreshold) {
        const since = this.sustainedHighSince.get(entityId) ?? now;
        if (!this.sustainedHighSince.has(entityId)) this.sustainedHighSince.set(entityId, since);
        if (now - since >= this.sustainedMs) {
          record.lastAlert = now;
          this.sustainedHighSince.delete(entityId);
          const name =
            (event.new_state?.attributes as Record<string, unknown>)?.friendly_name || entityId;
          this.logger.warn(`⚡ 持续高负荷: ${name} = ${power}W 超过 2 小时`);
          this.eventBus.emit(HOMEOS_EVENTS.ENERGY_ANOMALY, {
            type: 'sustained_high',
            entityId,
            friendlyName: name,
            current: power,
            threshold: highThreshold,
            durationHours: 2,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        this.sustainedHighSince.delete(entityId);
      }
    });
  }

  private avg(arr: number[]): number {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  /** 功率突增：优先 EnergyHourlyBaseline（同小时/星期几），否则滚动均值 × spikeRatio */
  private async evaluateSpike(
    event: HaStateChangeEvent,
    entityId: string,
    power: number,
    record: { readings: number[]; lastAlert: number },
    now: number,
    rollingAvg: number,
  ) {
    const name =
      (event.new_state?.attributes as Record<string, unknown>)?.friendly_name || entityId;
    const hourly = await this.compareToHourlyBaseline(entityId, power);
    if (hourly.baseline && hourly.anomalous && hourly.zScore != null) {
      const baselineW = hourly.baseline.avgKwh;
      record.lastAlert = now;
      this.persistBaseline(entityId, record.readings, record.lastAlert);
      this.logger.warn(
        `⚡ 功率突增(hourly): ${name} = ${power}W (baseline ${baselineW.toFixed(0)}W, z=${hourly.zScore})`,
      );
      this.eventBus.emit(HOMEOS_EVENTS.ENERGY_ANOMALY, {
        type: 'spike',
        entityId,
        friendlyName: name,
        current: power,
        average: baselineW,
        ratio: +(power / Math.max(baselineW, 0.01)).toFixed(1),
        zScore: hourly.zScore,
        baselineType: 'hourly_dow',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (record.readings.length >= 5 && power > rollingAvg * this.cfg.spikeRatio) {
      record.lastAlert = now;
      this.persistBaseline(entityId, record.readings, record.lastAlert);
      this.logger.warn(
        `⚡ 功率突增: ${name} = ${power}W (baseline avg ${rollingAvg.toFixed(0)}W, ratio ${(power / rollingAvg).toFixed(1)}x)`,
      );
      this.eventBus.emit(HOMEOS_EVENTS.ENERGY_ANOMALY, {
        type: 'spike',
        entityId,
        friendlyName: name,
        current: power,
        average: rollingAvg,
        ratio: +(power / rollingAvg).toFixed(1),
        baselineType: 'rolling',
        timestamp: new Date().toISOString(),
      });
    }
  }

  getBaseline(entityId: string) {
    const r = this.baseline.get(entityId);
    return r
      ? {
          count: r.readings.length,
          average: this.avg(r.readings),
          lastAlert: r.lastAlert ? new Date(r.lastAlert).toISOString() : null,
        }
      : null;
  }

  /** 与 EnergyHourlyBaseline 同时段基线对比（z-score）；功率传感器存 avg 功率，电表存 kWh 增量均值 */
  async compareToHourlyBaseline(
    entityId: string,
    currentValue: number,
    at: Date = new Date(),
  ): Promise<{
    zScore: number | null;
    baseline: { avgKwh: number; hour: number; dow: number; sampleCount: number } | null;
    anomalous: boolean;
  }> {
    const { hour, dow } = bucketHourDow(at);
    const row = await this.prisma.energyHourlyBaseline.findUnique({
      where: { entityId_hour_dow: { entityId, hour, dow } },
    });
    if (!row || row.sampleCount < 3) {
      return { zScore: null, baseline: null, anomalous: false };
    }
    const sd = Math.max(row.avgKwh * 0.25, 0.01);
    const z = zScore(currentValue, row.avgKwh, sd);
    return {
      zScore: +z.toFixed(2),
      baseline: {
        avgKwh: row.avgKwh,
        hour,
        dow,
        sampleCount: row.sampleCount,
      },
      anomalous: Math.abs(z) > 2,
    };
  }
}
