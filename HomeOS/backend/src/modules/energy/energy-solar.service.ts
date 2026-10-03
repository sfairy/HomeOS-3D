/**
 * @file energy-solar.service.ts
 * 光伏/储能发电监控服务
 *
 * 所属模块：system / energy
 * 职责：
 *  - 识别发电（PV/太阳能）与储能（电池）实体：关键词 + device_class + 手工配置兜底
 *  - 提供「发电-用电-充电」三流合一数据：当前发电功率、日累计发电量、电池 SOC、
 *    充电功率、自消纳率
 *  - 发电量历史按日/周聚合（基于 Redis timeline 增量累加）
 *  - 与现有用电统计（analytics.service）解耦：未检测到发电/储能实体时返回
 *    configured:false，不阻塞现有用电统计
 */
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { getEntityDomain, dateFromZonedWallClock, zonedDateParts } from '@homeos/shared';
import { parseTimelineSnapshot } from '../../common/utils/timeline-snapshot.util';
import type { HaEntity } from '../../shared/types';
import { RedisService } from '../../shared/redis/service';
import { getErrorMessage } from '../../common/utils';
import { AppConfigService } from '../../shared/app-config/service';
import { getTimePeriod } from '../../shared/app-config/pricing-config.util';
import { StateStoreService } from '../state-store/service';
import { HaConnectorService } from '../ha-connector/service';
import { HaWsLeaderService } from '../ha-connector/ha-ws-leader.service';

/** 发电实体识别关键词（逆变器 / 光伏 / 太阳能） */
const PV_HINTS = ['pv', 'solar', 'inverter', 'photovoltaic', '光伏', '发电'] as const;

/** 排除项：太阳方位/辐射等非发电传感器（即使名称含 solar） */
const PV_EXCLUDE = [
  'solar_azimuth',
  'solar_elevation',
  'solar_angle',
  'solar_radiation',
  'radiation',
  'sun_',
  'uv_index',
  'uv_',
] as const;

/** 储能电池识别关键词（设备电池遥测 battery_level 默认排除） */
const BATTERY_HINTS = [
  'battery_soc',
  'battery_capacity',
  'battery_percent',
  'battery_power',
  'battery_energy',
  'battery_charge',
  'ess_battery',
  '储能',
  '蓄电池',
] as const;

/** 充电功率实体识别关键词 */
const CHARGE_POWER_HINTS = [
  'battery_charging_power',
  'battery_charge_power',
  'charging_power',
  'charge_power',
] as const;

/** 上网/馈网实体识别关键词（用于自消纳率：发电量中未上网部分占比） */
const GRID_EXPORT_HINTS = [
  'grid_export',
  'feed_in',
  'export_power',
  'export_energy',
  'sold_energy',
  'net_export',
  '上网',
  '馈网',
  '反送',
] as const;

/** 累计能量（kWh 表）识别：对这类实体用 timeline 增量累加，对功率表则读 energy_today 属性 */
const ENERGY_KWH_HINTS = ['energy', 'kwh', '_today', 'meter'] as const;

/** SOC 属性候选键（battery 域 / sensor 实体均适用） */
const SOC_ATTR_KEYS = ['battery_level', 'soc', 'charge_level', 'percentage', 'capacity_percent'] as const;

interface SolarTrendPoint {
  label: string;
  value: number;
}

interface SolarHistory {
  /** 近 7 日发电量（kWh），按自然日 */
  day: SolarTrendPoint[];
  /** 近 4 周发电量（kWh），按自然周 */
  week: SolarTrendPoint[];
}

/** 储能调度运行状态（内存态，重启后从上次实体状态恢复） */
interface StorageDispatchState {
  lastAction: 'charge' | 'discharge' | 'stop' | null;
  lastActionReason: string;
  lastActionAt: number;
  actionCount: number;
  lastDecision: 'charge' | 'discharge' | 'stop' | 'idle' | null;
  lastDecisionReason: string;
}

@Injectable()
/**
 * EnergySolarService：Nest @Injectable 服务。
 * - 职责：承载域内核心业务逻辑；
 * - 装配：由对应 Module 的 providers 数组注入；
 * - 生命周期：可能实现 onModuleInit/onModuleDestroy（连接/订阅管理）；
 * @class EnergySolarService
 */
export class EnergySolarService {
  private readonly logger = new Logger(EnergySolarService.name);
  private readonly dispatchState: StorageDispatchState = {
    lastAction: null,
    lastActionReason: '',
    lastActionAt: 0,
    actionCount: 0,
    lastDecision: null,
    lastDecisionReason: '',
  };

  constructor(
    private readonly redisService: RedisService,
    private readonly appConfig: AppConfigService,
    private readonly stateStore: StateStoreService,
    private readonly haConnector: HaConnectorService,
    private readonly haLeader: HaWsLeaderService,
  ) {}

  /**
   * 发电监控总览（发电-用电-充电三流合一）
   * @param manualPvIds 手工配置发电实体 ID（逗号分隔，可选，关键词识别兜底）
   * @param manualBatteryId 手工配置储能电池实体 ID（可选）
   */
  async getSolarOverview(
    manualPvIds: string[] = [],
    manualBatteryId = '',
  ) {
    const pvPowerIds = this.resolvePvPowerEntityIds(manualPvIds);
    const pvEnergyIds = this.resolvePvEnergyEntityIds(manualPvIds);
    const batteryId = manualBatteryId || this.resolveBatteryEntityId();
    const chargePowerId = this.resolveChargePowerEntityId(batteryId);
    const gridExportIds = this.resolveGridExportEntityIds();
    const meterId = String(this.appConfig.get('energy').meterEntityId || '').trim();

    const entities = {
      pvPowerEntityIds: pvPowerIds,
      pvEnergyEntityIds: pvEnergyIds,
      batteryEntityId: batteryId,
      chargePowerEntityId: chargePowerId,
      gridExportEntityIds: gridExportIds,
      meterEntityId: meterId,
    };

    // 未检测到发电/储能实体：卡片隐藏 + 提示文案，不阻塞现有用电统计
    if (pvPowerIds.length + pvEnergyIds.length === 0 && !batteryId) {
      return {
        configured: false,
        message: '未检测到光伏/储能实体',
        entities,
        currentPowerW: 0,
        todayGenerationKwh: 0,
        batterySoc: null,
        chargePowerW: 0,
        todayUsageKwh: 0,
        selfConsumptionRate: null,
        history: { day: [], week: [] },
        redisReady: this.redisService.isReady(),
      };
    }

    const now = Date.now();
    const dayStartMs = this.dayStart(now);

    // 当前发电功率：功率表 StateStore 当前值求和（时间线最新值兜底）
    const currentPowerW = await this.readCurrentPowerSum(pvPowerIds);

    // 日累计发电量：能量累计表增量累加 + 功率表 energy_today 属性
    const todayGenerationKwh = await this.computeTodayGenerationKwh(
      pvPowerIds,
      pvEnergyIds,
      dayStartMs,
      now,
    );

    // 电池 SOC 与充电功率
    const batterySoc = this.readBatterySoc(batteryId);
    const chargePowerW = chargePowerId
      ? await this.readCurrentPower(chargePowerId)
      : this.readBatteryPowerAttr(batteryId);

    // 日用电量（自消纳率用；无主电表时返回 0）
    const todayUsageKwh = meterId ? await this.deltaKwh([meterId], dayStartMs, now) : 0;

    // 日上网量（存在上网实体时用于自消纳率精确计算）
    const todayExportKwh = gridExportIds.length
      ? await this.deltaKwh(gridExportIds, dayStartMs, now)
      : 0;

    const selfConsumptionRate = this.computeSelfConsumptionRate(
      todayGenerationKwh,
      todayUsageKwh,
      todayExportKwh,
      gridExportIds.length > 0,
    );

    const history = await this.getHistory(pvPowerIds, pvEnergyIds);

    return {
      configured: true,
      message: '',
      entities,
      currentPowerW: +currentPowerW.toFixed(1),
      todayGenerationKwh: +todayGenerationKwh.toFixed(2),
      batterySoc: batterySoc != null ? +batterySoc.toFixed(0) : null,
      chargePowerW: chargePowerW != null ? +chargePowerW.toFixed(1) : null,
      todayUsageKwh: +todayUsageKwh.toFixed(2),
      selfConsumptionRate,
      history,
      redisReady: this.redisService.isReady(),
    };
  }

  // ── 实体识别 ──

  /** 当前发电功率实体：device_class=power 或名称含 _power/_watt 的 PV 实体 */
  private resolvePvPowerEntityIds(manualIds: string[]): string[] {
    const ids = this.filterManualPvIds(manualIds, false);
    if (ids.length) return ids;
    return this.sensorEntities()
      .filter((e) => this.isPvEntity(e) && !this.isEnergyKwhEntity(e))
      .map((e) => e.entity_id);
  }

  /** 发电累计能量实体：device_class=energy 或名称含 energy/kwh 的 PV 实体 */
  private resolvePvEnergyEntityIds(manualIds: string[]): string[] {
    const ids = this.filterManualPvIds(manualIds, true);
    if (ids.length) return ids;
    return this.sensorEntities()
      .filter((e) => this.isPvEntity(e) && this.isEnergyKwhEntity(e))
      .map((e) => e.entity_id);
  }

  /** 手工配置发电实体过滤（按是否为累计能量表分流） */
  private filterManualPvIds(manualIds: string[], energyOnly: boolean): string[] {
    if (!manualIds.length) return [];
    const ids = manualIds.filter((id) => String(id || '').trim());
    if (!ids.length) return [];
    return ids.filter((id) => this.isEnergyKwhEntity(id) === energyOnly);
  }

  /** 是否为 PV/太阳能发电实体（关键词 + device_class 双保险） */
  private isPvEntity(e: HaEntity): boolean {
    const id = String(e.entity_id || '').toLowerCase();
    if (getEntityDomain(e.entity_id) !== 'sensor') return false;
    if (PV_EXCLUDE.some((k) => id.includes(k))) return false;
    const devCls = String(e.attributes?.device_class || '').toLowerCase();
    const kwMatch = PV_HINTS.some((k) => id.includes(k));
    if (!kwMatch && devCls !== 'power' && devCls !== 'energy') return false;
    // 关键词命中后仍需为功率/能量类（避免同前缀的普通传感器误入）
    if (kwMatch) {
      if (devCls === 'power' || devCls === 'energy') return true;
      return /(power|energy|kwh|watt|发电)/i.test(id);
    }
    return true;
  }

  /** 是否为累计能量表（增量累加有意义） */
  private isEnergyKwhEntity(idOrEntity: string | HaEntity): boolean {
    const id = String(
      typeof idOrEntity === 'string' ? idOrEntity : idOrEntity.entity_id,
    ).toLowerCase();
    const devCls =
      typeof idOrEntity === 'string'
        ? ''
        : String(idOrEntity.attributes?.device_class || '').toLowerCase();
    return devCls === 'energy' || ENERGY_KWH_HINTS.some((k) => id.includes(k));
  }

  /** 储能电池实体：battery 域优先，其次 sensor 域关键词/device_class */
  private resolveBatteryEntityId(): string | null {
    const batteries = this.stateStore.getAll('battery');
    if (batteries.length) return batteries[0].entity_id;
    const hit = this.sensorEntities().find((e) => {
      const id = String(e.entity_id || '').toLowerCase();
      if (!id.includes('battery')) return false;
      // 排除设备电池遥测（battery_level 是设备电量，非储能）
      if (id.includes('battery_level')) return false;
      const devCls = String(e.attributes?.device_class || '').toLowerCase();
      if (devCls === 'battery') return true;
      return BATTERY_HINTS.some((k) => id.includes(k));
    });
    return hit ? hit.entity_id : null;
  }

  /** 充电功率实体：关键词优先，其次 battery 域实体的 power/charging_power 属性 */
  private resolveChargePowerEntityId(batteryId: string | null): string | null {
    const hit = this.sensorEntities().find((e) =>
      CHARGE_POWER_HINTS.some((k) => String(e.entity_id || '').toLowerCase().includes(k)),
    );
    if (hit) return hit.entity_id;
    if (batteryId && this.readBatteryPowerAttr(batteryId) != null) return batteryId;
    return null;
  }

  /** 上网/馈网实体（用于自消纳率） */
  private resolveGridExportEntityIds(): string[] {
    return this.sensorEntities()
      .filter((e) =>
        GRID_EXPORT_HINTS.some((k) => String(e.entity_id || '').toLowerCase().includes(k)),
      )
      .map((e) => e.entity_id);
  }

  // ── 实时读数 ──

  /** 当前功率（W）：StateStore 当前值优先，时间线最新值兜底 */
  private async readCurrentPower(entityId: string): Promise<number> {
    if (!entityId) return 0;
    const ent = this.stateStore.getById(entityId);
    if (ent) {
      const state = parseFloat(String(ent.state));
      if (Number.isFinite(state) && state >= 0) return state;
    }
    if (this.redisService.isReady()) {
      const raw = await this.redisService.zrangeLatest(
        `timeline:entity:${entityId}`,
        Date.now() - 2 * 3600_000,
        Date.now(),
        20,
      );
      for (let i = raw.length - 1; i >= 0; i--) {
        try {
          const d = JSON.parse(raw[i]) as { state?: string };
          const v = parseFloat(String(d.state));
          if (Number.isFinite(v) && v >= 0) return v;
        } catch {
          /* 跳过 */
        }
      }
    }
    return 0;
  }

  private async readCurrentPowerSum(entityIds: string[]): Promise<number> {
    let sum = 0;
    for (const id of entityIds) sum += await this.readCurrentPower(id);
    return sum;
  }

  /** 电池 SOC（%）：属性优先，device_class=battery 时 state 即百分比 */
  private readBatterySoc(entityId: string | null): number | null {
    if (!entityId) return null;
    const ent = this.stateStore.getById(entityId);
    if (!ent) return null;
    const attrs = ent.attributes || {};
    for (const key of SOC_ATTR_KEYS) {
      const v = attrs[key];
      if (v != null && v !== 'unknown' && v !== 'unavailable') {
        const n = parseFloat(String(v));
        if (Number.isFinite(n)) return this.clamp(n, 0, 100);
      }
    }
    const state = parseFloat(String(ent.state));
    if (!Number.isFinite(state)) return null;
    // battery 域 / device_class=battery 时 state 即百分比
    if (
      getEntityDomain(entityId) === 'battery' ||
      String(attrs.device_class || '').toLowerCase() === 'battery'
    ) {
      return this.clamp(state, 0, 100);
    }
    return null;
  }

  /** 电池充电功率属性（battery 域实体的 power / charging_power） */
  private readBatteryPowerAttr(entityId: string | null): number | null {
    if (!entityId) return null;
    const ent = this.stateStore.getById(entityId);
    if (!ent || !ent.attributes) return null;
    for (const key of ['charging_power', 'power', 'charge_power']) {
      const v = ent.attributes[key];
      if (v != null) {
        const n = parseFloat(String(v));
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return null;
  }

  // ── 日累计与自消纳率 ──

  /** 日累计发电量：能量累计表增量累加 + 功率表 energy_today 属性 */
  private async computeTodayGenerationKwh(
    pvPowerIds: string[],
    pvEnergyIds: string[],
    dayStartMs: number,
    now: number,
  ): Promise<number> {
    let total = await this.deltaKwh(pvEnergyIds, dayStartMs, now);
    // 已在能量累计表中计数的实体，其 energy_today 属性为同一发电量的另一种表达，
    // 必须从功率表集合中排除，避免同一逆变器重复计数
    const energySet = new Set(pvEnergyIds);
    for (const id of pvPowerIds) {
      if (energySet.has(id)) continue;
      const ent = this.stateStore.getById(id);
      const attrs = ent?.attributes || {};
      for (const key of ['energy_today', 'today_energy', 'energy', 'energy_total']) {
        const v = attrs[key];
        if (v == null || v === 'unknown' || v === 'unavailable') continue;
        const n = parseFloat(String(v));
        if (Number.isFinite(n) && n > 0) {
          total += n;
          break;
        }
      }
    }
    return total;
  }

  /** 时间段内累计能量增量（kWh）：timeline 顺序遍历累加正增量 */
  private async deltaKwh(entityIds: string[], fromMs: number, toMs: number): Promise<number> {
    if (!entityIds.length || !this.redisService.isReady()) return 0;
    const keys = entityIds.map((id) => `timeline:entity:${id}`);
    const rawSets = await this.redisService.mzRangeByScore(keys, fromMs, toMs, 8000);
    let total = 0;
    for (const raw of rawSets) {
      let prev: number | null = null;
      for (const s of raw) {
        try {
          const d = JSON.parse(s) as { state?: string };
          const val = parseFloat(String(d.state));
          if (!Number.isFinite(val)) continue;
          if (prev != null && val >= prev) total += val - prev;
          prev = val;
        } catch {
          /* 跳过 */
        }
      }
    }
    return total;
  }

  /** 自消纳率（%）：有上网实体时 = (发电-上网)/发电；否则简化为用电/发电占比 */
  private computeSelfConsumptionRate(
    generationKwh: number,
    usageKwh: number,
    exportKwh: number,
    hasGridExport: boolean,
  ): number | null {
    if (generationKwh <= 0) return null;
    if (hasGridExport && exportKwh >= 0) {
      const selfUse = Math.max(0, generationKwh - exportKwh);
      return this.clamp((selfUse / generationKwh) * 100, 0, 100);
    }
    if (usageKwh <= 0) return null;
    return this.clamp((usageKwh / generationKwh) * 100, 0, 100);
  }

  // ── 历史聚合（按日/周） ──

  /**
   * 发电量历史聚合：近 7 日（自然日）与近 4 周（自然周）。
   * 一次拉取窗口内 timeline，按桶对齐累计增量，避免 N×M 次 Redis 往返。
   */
  private async getHistory(pvPowerIds: string[], pvEnergyIds: string[]): Promise<SolarHistory> {
    const empty: SolarHistory = { day: [], week: [] };
    if (!pvEnergyIds.length || !this.redisService.isReady()) return empty;

    const now = Date.now();
    const dayMs = 86400_000;
    const weekMs = 7 * dayMs;
    const dayBuckets = await this.aggregateKwhByBucket(
      pvEnergyIds,
      now - 7 * dayMs,
      now,
      (ts) => this.dayStart(ts),
    );
    const weekBuckets = await this.aggregateKwhByBucket(
      pvEnergyIds,
      now - 4 * weekMs,
      now,
      (ts) => this.weekStart(ts),
    );

    const day: SolarTrendPoint[] = [];
    const tz = this.appConfig.getHomeTimezone();
    for (let i = 6; i >= 0; i--) {
      const start = this.dayStart(now - i * dayMs);
      const p = zonedDateParts(new Date(start), tz);
      day.push({
        label: `${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
        value: +(dayBuckets.get(start) || 0).toFixed(2),
      });
    }

    const week: SolarTrendPoint[] = [];
    for (let i = 3; i >= 0; i--) {
      const start = this.weekStart(now - i * weekMs);
      const p0 = zonedDateParts(new Date(start), tz);
      const p1 = zonedDateParts(new Date(start + 6 * dayMs), tz);
      const fmt = (m: number, d: number) =>
        `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      week.push({
        label: `${fmt(p0.month, p0.day)}~${fmt(p1.month, p1.day)}`,
        value: +(weekBuckets.get(start) || 0).toFixed(2),
      });
    }

    return { day, week };
  }

  /** 按家庭时区自然日/自然周起点累计 timeline 能量增量 */
  private async aggregateKwhByBucket(
    entityIds: string[],
    fromMs: number,
    toMs: number,
    startOfBucket: (ts: number) => number,
  ): Promise<Map<number, number>> {
    const buckets = new Map<number, number>();
    if (!entityIds.length || !this.redisService.isReady()) return buckets;
    const keys = entityIds.map((id) => `timeline:entity:${id}`);
    const rawSets = await this.redisService.mzRangeByScore(keys, fromMs, toMs, 20000);
    for (const raw of rawSets) {
      let prev: number | null = null;
      let prevTs = 0;
      for (const s of raw) {
        try {
          const d = parseTimelineSnapshot(s);
          if (!d) continue;
          const val = parseFloat(d.state);
          if (!Number.isFinite(val)) continue;
          const ts = d.ts;
          if (prev != null && val >= prev) {
            const bucketStart = startOfBucket(prevTs);
            buckets.set(bucketStart, (buckets.get(bucketStart) || 0) + (val - prev));
          }
          prev = val;
          prevTs = ts;
        } catch {
          /* 跳过 */
        }
      }
    }
    return buckets;
  }

  // ── 储能峰谷调度（谷充峰放） ──

  /** 调度 tick 在飞互斥门闩：上一轮未结束时跳过本轮，避免慢 HA 调用导致 tick 重叠 */
  private storageDispatchInFlight = false;

  /** 定时调度：每 60 秒评估一次，仅在实体状态变化时动作 */
  @Interval(60_000)
  private async storageDispatchTick() {
    if (this.storageDispatchInFlight) return;
    this.storageDispatchInFlight = true;
    try {
      await this.storageDispatchOnce();
    } catch (err) {
      this.logger.warn(`储能峰谷调度异常: ${getErrorMessage(err)}`);
    } finally {
      this.storageDispatchInFlight = false;
    }
  }

  /**
   * 执行一次储能峰谷调度评估：
   *  - 谷段：SOC < 目标 → 开启充电实体、关闭放电实体
   *  - 峰段：按滞回（启动 ≥ 阈值 / 停止 < 下限）决定放电
   *  - 平段：关闭全部调度实体，避免自耗电
   * 仅在 Leader 且分时电价启用时动作；同动作带冷却，防止频繁开关。
   */
  async storageDispatchOnce() {
    const cfg = this.appConfig.get('energy');
    if (!cfg.storageDispatchEnabled) {
      return { ok: true, skipped: 'disabled', state: this.dispatchState.lastAction };
    }
    if (this.haLeader.isHaWsFollower()) {
      return { ok: true, skipped: 'follower', state: this.dispatchState.lastAction };
    }
    const pricing = this.appConfig.get('pricing');
    if (pricing.timeOfUseEnabled === false) {
      return { ok: true, skipped: 'tou_disabled', state: this.dispatchState.lastAction };
    }
    const chargeEntities = cfg.storageDispatchChargeEntities || [];
    const dischargeEntities = cfg.storageDispatchDischargeEntities || [];
    if (!chargeEntities.length && !dischargeEntities.length) {
      return { ok: true, skipped: 'no_entities', state: this.dispatchState.lastAction };
    }

    const batteryId = cfg.storageDispatchBatteryEntityId || this.resolveBatteryEntityId();
    const soc = this.readBatterySoc(batteryId);
    const period = getTimePeriod(new Date(), pricing);
    const flat = period ?? 'flat';

    // 决策
    let decision: 'charge' | 'discharge' | 'stop' | 'idle' = 'idle';
    let reason = '';
    if (flat === 'valley') {
      if (soc != null && soc >= cfg.storageDispatchChargeSocTarget) {
        reason = `谷段但 SOC ${soc}% 已达目标 ${cfg.storageDispatchChargeSocTarget}%，无需充电`;
        decision = 'stop';
      } else if (soc != null || chargeEntities.length) {
        decision = 'charge';
        reason = `谷段充电：SOC ${soc != null ? `${soc}%` : '未知'} < 目标 ${cfg.storageDispatchChargeSocTarget}%`;
      }
    } else if (flat === 'peak') {
      if (soc == null) {
        // 未知 SOC 拒绝放电（fail-closed）：无法确认电量充足，放电有欠压保护风险
        if (dischargeEntities.length) {
          decision = 'stop';
          reason = '峰段但未读到 SOC，已停止放电保护电池（须能读取电量后再放电）';
        }
      } else if (this.dispatchState.lastAction === 'discharge') {
        if (soc >= cfg.storageDispatchDischargeSocMin) {
          decision = 'discharge';
          reason = `峰段继续放电：SOC ${soc}% ≥ 下限 ${cfg.storageDispatchDischargeSocMin}%`;
        } else {
          decision = 'stop';
          reason = `峰段但 SOC ${soc}% < 下限 ${cfg.storageDispatchDischargeSocMin}%，停止放电保护电池`;
        }
      } else if (soc >= cfg.storageDispatchDischargeSocThreshold) {
        decision = 'discharge';
        reason = `峰段放电：SOC ${soc}% ≥ 阈值 ${cfg.storageDispatchDischargeSocThreshold}%`;
      } else {
        reason = `峰段但 SOC ${soc}% < 放电阈值 ${cfg.storageDispatchDischargeSocThreshold}%，保持待命`;
      }
    } else {
      decision = 'stop';
      reason = '平段停止调度，避免电池自耗电';
    }

    this.dispatchState.lastDecision = decision;
    this.dispatchState.lastDecisionReason = reason;

    // 读取当前实体状态，避免重复动作
    const chargeOn = await this.entitiesOnState(chargeEntities);
    const dischargeOn = await this.entitiesOnState(dischargeEntities);

    let wantCharge = decision === 'charge';
    let wantDischarge = decision === 'discharge';
    if (decision === 'stop') {
      wantCharge = false;
      wantDischarge = false;
    }

    // 冷却：距上次动作不足 cooldownMin 时仅更新决策、不执行
    const cooldownMs = Math.max(1, cfg.storageDispatchCooldownMin || 30) * 60_000;
    const withinCooldown = Date.now() - this.dispatchState.lastActionAt < cooldownMs;

    const changed =
      (wantCharge && chargeOn !== true) ||
      (wantDischarge && dischargeOn !== true) ||
      (!wantCharge && !wantDischarge && (chargeOn === true || dischargeOn === true));

    if (changed && !withinCooldown) {
      await this.applyDispatch(wantCharge, wantDischarge, reason);
      return {
        ok: true,
        action: this.dispatchState.lastAction,
        reason,
        soc,
        period: flat,
        batteryEntityId: batteryId,
      };
    }
    return {
      ok: true,
      action: 'none',
      reason: withinCooldown ? `冷却中（${Math.ceil((cooldownMs - (Date.now() - this.dispatchState.lastActionAt)) / 1000)}s）` : reason,
      soc,
      period: flat,
      batteryEntityId: batteryId,
    };
  }

  /** 储能调度状态总览（供前端展示当前决策与冷却） */
  async getStorageDispatchStatus() {
    const cfg = this.appConfig.get('energy');
    const pricing = this.appConfig.get('pricing');
    const batteryId = cfg.storageDispatchBatteryEntityId || this.resolveBatteryEntityId();
    const soc = this.readBatterySoc(batteryId);
    const period = getTimePeriod(new Date(), pricing);
    const cooldownMs = Math.max(1, cfg.storageDispatchCooldownMin || 30) * 60_000;
    const remainingMs = Math.max(0, cooldownMs - (Date.now() - this.dispatchState.lastActionAt));
    return {
      enabled: cfg.storageDispatchEnabled,
      timeOfUseEnabled: pricing.timeOfUseEnabled !== false,
      batteryEntityId: batteryId,
      soc,
      period: period ?? 'flat',
      chargeEntities: cfg.storageDispatchChargeEntities || [],
      dischargeEntities: cfg.storageDispatchDischargeEntities || [],
      chargeSocTarget: cfg.storageDispatchChargeSocTarget,
      dischargeSocThreshold: cfg.storageDispatchDischargeSocThreshold,
      dischargeSocMin: cfg.storageDispatchDischargeSocMin,
      cooldownMin: cfg.storageDispatchCooldownMin,
      lastAction: this.dispatchState.lastAction,
      lastActionReason: this.dispatchState.lastActionReason,
      lastActionAt: this.dispatchState.lastActionAt,
      actionCount: this.dispatchState.actionCount,
      lastDecision: this.dispatchState.lastDecision,
      lastDecisionReason: this.dispatchState.lastDecisionReason,
      cooldownRemainingSec: Math.ceil(remainingMs / 1000),
    };
  }

  /** 执行动作：开/关充电与放电实体 */
  private async applyDispatch(charge: boolean, discharge: boolean, reason: string) {
    const cfg = this.appConfig.get('energy');
    const targets = new Map<string, boolean>();
    for (const id of cfg.storageDispatchChargeEntities || []) targets.set(id, charge);
    for (const id of cfg.storageDispatchDischargeEntities || []) targets.set(id, discharge);

    const results = await Promise.allSettled(
      [...targets.entries()].map(([id, on]) => {
        const domain = getEntityDomain(id) || 'switch';
        return this.haConnector.callService(domain, on ? 'turn_on' : 'turn_off', id);
      }),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;

    this.dispatchState.lastActionAt = Date.now();
    this.dispatchState.lastActionReason = reason;
    this.dispatchState.actionCount++;
    if (charge) this.dispatchState.lastAction = 'charge';
    else if (discharge) this.dispatchState.lastAction = 'discharge';
    else this.dispatchState.lastAction = 'stop';

    if (failed) {
      this.logger.warn(`储能峰谷调度执行 ${results.length} 个动作,${failed} 个失败:${reason}`);
    } else {
      this.logger.log(`储能峰谷调度 → ${this.dispatchState.lastAction}:${reason}`);
    }
  }

  /** 读取实体集合的开关状态：任一为 on 返回 true，任一为 off 返回 false，均不可读返回 null */
  private async entitiesOnState(ids: string[]): Promise<boolean | null> {
    if (!ids.length) return null;
    let sawOff = false;
    for (const id of ids) {
      const ent = this.stateStore.getById(id);
      if (!ent) continue;
      const st = String(ent.state);
      if (st === 'on') return true;
      if (st === 'off') sawOff = true;
    }
    return sawOff ? false : null;
  }

  // ── 工具 ──

  private sensorEntities(): HaEntity[] {
    return this.stateStore.getAll('sensor');
  }

  private dayStart(ts: number): number {
    const tz = this.appConfig.getHomeTimezone();
    const p = zonedDateParts(new Date(ts), tz);
    return dateFromZonedWallClock(tz, p.year, p.month, p.day, 0, 0).getTime();
  }

  /** 家庭时区自然周起点（周一） */
  private weekStart(ts: number): number {
    const tz = this.appConfig.getHomeTimezone();
    const p = zonedDateParts(new Date(this.dayStart(ts)), tz);
    const mondayOffset = (p.weekday + 6) % 7;
    return dateFromZonedWallClock(tz, p.year, p.month, p.day - mondayOffset, 0, 0).getTime();
  }

  private clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
  }
}
