/**
 * @file water-monitor.service.ts
 * @module environment
 * @description 用水监测服务。订阅水表传感器状态变更，检测持续水流（疑似漏水）与单日超量用水两类异常，
 * 按冷却时间窗推送 WATER_ANOMALY 事件，并周期性将流量 / 累计量 / 异常类型落库到 WaterRecord 表。
 *
 * 关键策略：
 *  - 仅识别真正的水流 / 用水量传感器（排除温度 / 湿度等），避免把温度读数误当作流量
 *  - 持续水流由 60s 定时巡检判定，配合 continuousFlowCount 阈值
 *  - 超量用水仅在有真实累计属性时写入，避免无累计值恒 0 覆盖真实日用量
 *  - 今日用量持久化到 Redis（TTL 48h），跨重启恢复避免重复告警
 *  - 仅 HA WS 主节点处理事件，避免多实例重复判定
 *  - 持久化按 entityId+anomaly+5min 窗口幂等去重，避免事件批次重复落库
 *
 * 依赖：
 *  - EventBusService：跨实例广播 WATER_ANOMALY 事件
 *  - PrismaService：WaterRecord 表读写
 *  - AppConfigService：water 配置（阈值 / 冷却）
 *  - HaStateChangeRouterService：按订阅分发 HA 状态变更
 *  - NotificationCooldownService：异常告警冷却
 *  - HaWsLeaderService：leader 选举（仅主节点处理）
 *  - JobRegistryService：周期巡检任务监控
 *  - RedisService：今日用量持久化与恢复
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventBusService } from '../../shared/redis/event-bus.service';
import { PrismaService } from '../../shared/prisma/service';
import { AppConfigService } from '../../shared/app-config/service';
import { JobRegistryService } from '../../shared/jobs/registry.service';
import { HaStateChangeRouterService } from '../../shared/ha/state-change-router.service';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';
import { HA_EVENTS, type HaStateChangeBatchEvent } from '../../shared/types';
import { forEachColdBatchEvent } from '../../shared/ha/cold-batch.util';
import { NotificationCooldownService } from '../../common/alert-support/notification-cooldown.service';
import { linearForecastWater } from '../../common/utils/stats.util';
import { RedisService } from '../../shared/redis/service';
import { getErrorMessage } from '../../common/utils';
import { localDateKey } from '../../common/utils/local-date.util';
import { HOMEOS_EVENTS } from '../../shared/homeos-events';

/**
 * 用水监测服务
 *
 * 追踪水表传感器，检测异常模式：
 *  1. 持续水流 — 流量 > 0 持续超过阈值 → 可能的漏水
 *  2. 超量用水 — 单日用量超阈值 → 异常告警
 */
@Injectable()
export class WaterMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WaterMonitorService.name);

  /** 持续水流起始时间（流量 > 0 时记录，用于定时巡检） */
  private flowActiveSince = new Map<string, { since: number; flowRate: number; name: string }>();
  private flowCheckTimer: NodeJS.Timeout | null = null;
  private lastPersistAt = new Map<string, number>();
  /** 今日用量累积 */
  private dailyUsage = new Map<string, number>();
  private lastResetDate = '';
  /** 今日用量 Redis 键（重启后恢复，避免日累计清零与重复告警） */
  private static readonly DAILY_USAGE_KEY = 'homeos:water:dailyUsage';

  constructor(
    private readonly eventBus: EventBusService,
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly stateRouter: HaStateChangeRouterService,
    private readonly cooldownService: NotificationCooldownService,
    private readonly haLeader: HaWsLeaderService,
    private readonly jobs: JobRegistryService,
    private readonly redis: RedisService,
  ) {}

  private get cfg() {
    return this.appConfig.get('water');
  }

  onModuleInit() {
    void this.restoreDailyUsage();
    this.flowCheckTimer = setInterval(() => {
      void this.jobs.run(
        'water-monitor',
        { description: '用水监测巡检（漏水 / 超量）', intervalMs: 60_000 },
        () => this.checkContinuousFlows(),
      );
    }, 60_000);
  }

  /** 从 Redis 恢复今日用量（跨重启保留，避免超量判定在重启后被重置） */
  private async restoreDailyUsage(): Promise<void> {
    try {
      const raw = await this.redis.get(WaterMonitorService.DAILY_USAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { date: string; usage: Record<string, number> };
      if (!parsed || typeof parsed !== 'object' || !parsed.usage) return;
      if (parsed.date === localDateKey()) {
        this.dailyUsage = new Map(Object.entries(parsed.usage).filter(([, v]) => Number.isFinite(v)));
        this.lastResetDate = parsed.date;
        this.logger.log(`已恢复今日用水累计: ${this.dailyUsage.size} 个传感器`);
      }
    } catch (err) {
      this.logger.debug(`恢复今日用水累计失败: ${getErrorMessage(err)}`);
    }
  }

  /** 将今日用量写入 Redis（TTL 48h，覆盖跨日兜底） */
  private persistDailyUsage(): void {
    void this.redis
      .set(
        WaterMonitorService.DAILY_USAGE_KEY,
        JSON.stringify({ date: this.lastResetDate, usage: Object.fromEntries(this.dailyUsage) }),
        48 * 3600,
      )
      .catch((err) => this.logger.debug(`今日用水累计持久化失败: ${getErrorMessage(err)}`));
  }

  onModuleDestroy() {
    if (this.flowCheckTimer) clearInterval(this.flowCheckTimer);
  }

  private checkContinuousFlows() {
    if (!this.haLeader.isHaWsLeader()) return;
    const thresholdMin = Math.max(this.cfg.continuousFlowCount, 1);
    const now = Date.now();
    for (const [entityId, info] of this.flowActiveSince) {
      const elapsedMin = (now - info.since) / 60_000;
      if (elapsedMin < thresholdMin) continue;
      const cooldownKey = `flow:${entityId}`;
      if (this.isInCooldown(cooldownKey)) continue;
      this.logger.warn(
        `💧 持续水流告警: ${info.name} 流量 ${info.flowRate} L/min(持续 ${Math.round(elapsedMin)} 分钟)`,
      );
      this.eventBus.emit(HOMEOS_EVENTS.WATER_ANOMALY, {
        type: 'continuous_flow',
        entityId,
        friendlyName: info.name,
        flowRate: info.flowRate,
        durationMin: Math.round(elapsedMin),
        timestamp: new Date().toISOString(),
      });
      this.setCooldown(cooldownKey);
      this.flowActiveSince.delete(entityId);
    }
  }

  @OnEvent(HA_EVENTS.STATE_CHANGED_COLD_BATCH)
  handleStateChange(payload: HaStateChangeBatchEvent) {
    forEachColdBatchEvent(payload, (event) => {
    if (
      !this.stateRouter.shouldProcess(
        'water',
        event as import('../../shared/types').HaStateChangeEvent,
      )
    )
      return;
    if (!this.haLeader.isHaWsLeader()) return;
    const entityId: string = event?.entity_id || '';
    const attrs = event?.new_state?.attributes || {};
    if (!this.isWaterSensor(entityId, attrs)) return;

    const state = event?.new_state?.state;
    if (!state) return;

    const unit = String(attrs.unit_of_measurement || '').toLowerCase();
    const isFlowRate = /l\/min|l\/h|lpm|gpm|gal\/min/.test(unit);
    const flowRate = isFlowRate ? parseFloat(state) : NaN;
    const totalUsage = parseFloat(
      String(attrs.today_usage ?? attrs.daily_usage ?? attrs.total ?? '0'),
    );
    // 无累计属性时（三个字段都缺省）不得覆盖既有日用量，否则恒 0 覆盖真实值
    const hasCumulativeAttr =
      attrs.today_usage != null || attrs.daily_usage != null || attrs.total != null;

    // 每日用量重置（本地日期）
    const today = localDateKey();
    if (this.lastResetDate !== today) {
      this.dailyUsage.clear();
      this.lastResetDate = today;
      this.persistDailyUsage();
    }

    // 持续水流检测（记录起始时间，由定时任务判定持续时长）
    if (!isNaN(flowRate) && flowRate > 0) {
      const name = (event?.new_state?.attributes?.friendly_name as string) || entityId;
      const existing = this.flowActiveSince.get(entityId);
      if (!existing) {
        this.flowActiveSince.set(entityId, { since: Date.now(), flowRate, name });
      } else {
        existing.flowRate = flowRate;
        existing.name = name;
      }
    } else {
      this.flowActiveSince.delete(entityId);
    }

    // 超量用水检测（仅在有真实累计属性时写入，避免无累计值覆盖既有日用量）
    if (!isNaN(totalUsage) && hasCumulativeAttr) {
      const prev = this.dailyUsage.get(entityId) || 0;
      this.dailyUsage.set(entityId, totalUsage);
      this.persistDailyUsage();
      if (totalUsage > this.cfg.dailyLimitM3 && prev <= this.cfg.dailyLimitM3) {
        const name = (event?.new_state?.attributes?.friendly_name as string) || entityId;
        const cooldownKey = `overflow:${entityId}`;
        if (!this.isInCooldown(cooldownKey)) {
          this.logger.warn(`💧 超量用水: ${name} 今日 ${totalUsage.toFixed(2)} m³`);
          this.eventBus.emit(HOMEOS_EVENTS.WATER_ANOMALY, {
            type: 'overflow',
            entityId,
            friendlyName: name,
            totalUsage,
            timestamp: new Date().toISOString(),
          });
          this.setCooldown(cooldownKey);
        }
        this.persistRecord(entityId, flowRate, totalUsage, 'overflow');
      }
    }

    // 定期持久化（每实体至少间隔 5 分钟）
    const lastAt = this.lastPersistAt.get(entityId) || 0;
    if (!isNaN(flowRate) && Date.now() - lastAt > 5 * 60_000) {
      this.lastPersistAt.set(entityId, Date.now());
      this.persistRecord(entityId, flowRate, totalUsage);
    }
    });
  }

  async getHistory(entityId: string, hours = 24) {
    const since = new Date(Date.now() - hours * 3600_000);
    return this.prisma.waterRecord.findMany({
      where: { entityId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
      take: 5000,
    });
  }

  /** 用水统计：近 N 天每日用量 + 异常计数（SQL GROUP BY，避免大 take 内存聚合） */
  async getStatistics(days = 30) {
    const since = new Date(Date.now() - days * 86400_000);
    /** 对齐 localDateKey：将 naive timestamp 视为 UTC 再转到进程本地时区日历日 */
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const [dailyMaxRows, anomalyRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ day: string; entityId: string; maxUsage: number | null }>>`
        SELECT to_char(("recordedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
               "entityId",
               MAX("totalUsage") AS "maxUsage"
        FROM "WaterRecord"
        WHERE "recordedAt" >= ${since} AND "totalUsage" IS NOT NULL
        GROUP BY 1, 2
      `,
      this.prisma.$queryRaw<Array<{ anomaly: string; count: number }>>`
        SELECT "anomaly", COUNT(*)::int AS count
        FROM "WaterRecord"
        WHERE "recordedAt" >= ${since} AND "anomaly" IS NOT NULL
        GROUP BY "anomaly"
      `,
    ]);

    // 按天聚合（同日多实体的当日最大累计量相加）
    const byDay = new Map<string, number>();
    for (const r of dailyMaxRows) {
      if (r.maxUsage == null) continue;
      byDay.set(r.day, (byDay.get(r.day) || 0) + Number(r.maxUsage));
    }

    const anomalyCounts: Record<string, number> = {};
    for (const r of anomalyRows) {
      if (r.anomaly) anomalyCounts[r.anomaly] = Number(r.count) || 0;
    }

    const daily = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, usage]) => ({
        date,
        usageM3: Math.round(usage * 1000) / 1000,
      }));
    const totalM3 = daily.reduce((s, d) => s + d.usageM3, 0);
    const forecast = linearForecastWater(daily.map((d) => d.usageM3));

    return {
      days,
      totalM3: Math.round(totalM3 * 1000) / 1000,
      avgDailyM3: daily.length ? Math.round((totalM3 / daily.length) * 1000) / 1000 : 0,
      daily,
      anomalyCounts,
      forecast,
      thresholds: {
        dailyLimitM3: this.cfg.dailyLimitM3,
        continuousFlowCount: this.cfg.continuousFlowCount,
      },
    };
  }

  /**
   * 仅识别真正的“水流/用水量”传感器。
   *
   * 排除温度/湿度等运行量（如“燃气热水器 出水温度”单位 ℃），
   * 要求具备水流/用水语义或合理的流量单位，避免把温度读数误当作流量(L/min)。
   */
  private isWaterSensor(entityId: string, attributes: Record<string, unknown> = {}): boolean {
    const id = entityId.toLowerCase();
    const name = String(attributes.friendly_name || '').toLowerCase();
    const dc = String(attributes.device_class || '').toLowerCase();
    const unit = String(attributes.unit_of_measurement || '').toLowerCase();
    const blob = `${id} ${name}`;

    // 排除温湿度/温度类（device_class 或关键词或单位）
    if (dc === 'temperature' || dc === 'humidity') return false;
    if (/温度|temp|湿度|humid|wendu|shidu/.test(blob)) return false;
    if (unit.includes('°c') || unit.includes('℃') || unit.includes('°f') || unit === '%')
      return false;

    // 明确的水流/用水语义
    const hasFlowSemantics = /水流|流量|flow|用水|water[_ ]?meter|水表|water[_ ]?usage/.test(blob);
    // 合理的流量/水量单位
    const hasWaterUnit = /l\/min|l\/h|l\/m|lpm|m³|m3|gpm|gal/.test(unit);

    if (hasFlowSemantics) return true;
    if (hasWaterUnit && /water|水/.test(blob)) return true;
    return false;
  }

  private isInCooldown(key: string): boolean {
    return this.cooldownService.isInCooldown('water', key);
  }

  private setCooldown(key: string) {
    const min = Math.max(this.cfg.anomalyCooldownMin || 30, 1);
    this.cooldownService.setCooldown('water', key, min);
  }

  /** 幂等去重：同一实体同一 anomaly 在 5 分钟时间窗内只写一次，避免事件批次重复落库 */
  private persistDedup = new Map<string, number>();
  private static readonly PERSIST_DEDUP_WINDOW_MS = 5 * 60_000;

  private persistRecord(entityId: string, flowRate: number, totalUsage?: number, anomaly?: string) {
    const now = Date.now();
    // 幂等键：entityId + anomaly 类型 + 5 分钟时间窗
    const windowKey = Math.floor(now / WaterMonitorService.PERSIST_DEDUP_WINDOW_MS);
    const dedupKey = `${entityId}:${anomaly || 'periodic'}:${windowKey}`;
    if (now - (this.persistDedup.get(dedupKey) || 0) < WaterMonitorService.PERSIST_DEDUP_WINDOW_MS) {
      return; // 时间窗内已写入过，跳过重复写入
    }
    this.persistDedup.set(dedupKey, now);
    // 惰性清理过期窗口条目，避免 Map 只增不减
    if (this.persistDedup.size > 500) {
      const cutoff = now - WaterMonitorService.PERSIST_DEDUP_WINDOW_MS;
      for (const [k, v] of this.persistDedup) {
        if (v < cutoff) this.persistDedup.delete(k);
      }
    }

    const data = {
      entityId,
      flowRate: isNaN(flowRate) ? null : flowRate,
      totalUsage,
      anomaly,
    };
    // fire-and-forget 写入：失败 warn 并重试一次
    setImmediate(() => {
      const attempt = (retries: number) => {
        this.prisma.waterRecord
          .create({ data })
          .catch((e) => {
            if (retries > 0) {
              attempt(retries - 1);
            } else {
              this.logger.warn(`用水记录写入失败 [${entityId}]: ${getErrorMessage(e)}`);
            }
          });
      };
      attempt(1);
    });
  }
}
